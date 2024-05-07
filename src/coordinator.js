import { EventEmitter } from "events";
import Conversation from "./conversation";
import { ClientState, FeedState } from "./states";
import TaskQueue from "./taskqueue";
import CoordinatorDb from "./coordinatordb";
import {
  StateError,
  ConnectionError,
  RejectionError,
  TerminationError,
} from "./errors";

const priorities = {
  APP_FEED_OBJECT_CLOSE_UNDERWAY: 0,
  APP_FEED_OBJECT_CLOSE: 1,
  CONVO_EVENT_UNDERWAY: 2,
  APP_FEED_OBJECT_OPEN: 3,
  CONVO_EVENT_PENDING: 4,
};

/**
 * NEW QUEUE SORT ORDER RATIONALE - Integrate below
 * 1. You need to process Conversation events in the order that they occur
 *      convoPending
 * 2. The Conversation event being processed must be able to add app invocations
 *    ahead of subsequent conversation events
 *      convoUnderway > convoPending
 * 3. If the app calls feed.close() then that event should receive top priority
 *      appFeedClose > convoUnderway > convoPending
 * 4. The feed.close() call being processed must be able to add app invocations
 *    ahead of feed closures on other objects (callbacks)
 *      appFeedCloseUnderway > appFeedClose > convoUnderway > convoPending
 * 5. If the app calls client.feed(), the feed object should be returned only
 *    after the underway Conversation event has completed. Catch all existing
 *    feed objects up to master state before calling back new ones
 *      appFeedCloseUnderway > appFeedClose > convoUnderway > appFeedOpen > convoPending
 *
 * Coordinates application emissions and callbacks/promise settlements, ensuring that they
 * are made in accordance with documented sequencing commitments and that each
 * is run as a separate macrotask. Requires another layer of deferral, and
 * therefore must handle mismatches with the Conversation state.
 *
 * Built on top of Conversation, which has intuitive asynchronous behavior.
 * Expands on this by:
 *
 * 1 - Splitting some Conversation events into multiple application invocations.
 *     When one Conversation event yields multiple application invocations, the
 *     Conversation event is called the "underway" event.
 *
 * 2 - Injecting invocations that result from application method calls,
 *     specifically feed object opens/closes.
 *
 * Priority rationale:
 *
 * You need a central prioritized queue of invocations / potential
 * invocations that will be made on the application. Generally use the same
 * ordering as the Conversation, except that:
 *
 * 1 - Calls to app feed close always produce a close event next. This way the
 *     feed will emit close with no error if disconnect() is called in the
 *     middle of a disconnecting sequence.
 *
 * 2 - Calls to app feed open only produce a callback after all underway
 *     invocations have been processed. It makes sense to catch up all existing
 *     feed objects to the latest master state before calling back any new feeds
 *     using that state.
 *
 * All application invocations are performed as separate macrotasks so that
 * promises settle before the next invocation on the app, and so that
 * application microtasks get priority. As a bonus, an application exception
 * doesn't prevent subsequent library invocations (except multiple listeners
 * on a single event).
 *
 * Because method-originating events are controlled here, the module needs
 * to implement the feed object API. However, it is implemented in a "flat" form, with no
 * actual objects, just instance methods and string feed object ids.
 * This simplifies the module and allows app-facing feed objects to be defined
 * at the outer level, which is needed for feed.client() to work.
 *
 * The module maintain a master server feed state/data, which is based on the
 * Conversation events that have been processed so far. Each
 * feed objects have their own state which changes immediately before event emission
 * and feed objects are gradually caught up to the master state in successive macrotasks.
 *
 * Entirely callback-based. The outer layer promisifies, which does not throw
 * off app-facing invocation sequencing because promises settle as microtasks.
 * Works even on older platforms where promises may be polyfilled and microtasks
 * may run after previously-scheduled macrotasks (Node <12), because the
 * queue does not defer the next macrotask until the current task has
 * finished executing.
 *
 * The queue is never cleared. Instead, queue operations suppress certain
 * invocations after a call to disconnect(). If the
 * queue was cleared on disconnect(), then the module would need to maintain
 * all of the data required to re-establish the invocation sequence in instance
 * variables.
 *
 * This module assures that the next dependent invocation after a call to
 * disconnect() is a disconnect event. Strictly speaking, that commitment cannot
 * be made to the app due to promises.
 *
 * Internal feed object life-cycle states:
 *  OPENING - feed() not called back yet (no object actually exists yet)
 *  OPEN - feed() callback invoked
 *  CLOSING - feed.close() called but close event not emitted
 *  CLOSED - close event emitted
 * Internal state can transition directly to closed from any other state.
 * External state is OPEN if internal state is OPEN or CLOSING, otherwise
 * external state is CLOSED.
 *
 * Queue operations (_queueOps) are added to the queue:
 * - When there is a Conversation event (pending), and again when that event
 *   is processed by the queue (underway)
 * - When there is a valid call to feedObject() or feedObjectClose()
 *
 * There are intentionally no timers in this module - would be very messy
 * with deferral.
 *
 * @constructor
 * @extends EventEmitter
 * @param {Object} transport
 * @param {Object} options Valid options object with defaults overlaid
 * @throws {TransportError}
 */
const Coordinator = function Coordinator(transport, options) {
  EventEmitter.call(this);

  /**
   * @memberof Coordinator
   * @instance
   * @type {Object}
   */
  this._options = options;

  /**
   * @memberof Coordinator
   * @instance
   * @type {Conversation}
   */
  this._conversation = new Conversation(transport, options); // Intentionally cascade TransportError

  /**
   * @memberof Coordinator
   * @instance
   * @type {CoordinatorDb}
   */
  this._db = new CoordinatorDb();

  /**
   * @memberof Coordinator
   * @instance
   * @type {TaskQueue}
   */
  this._queue = new TaskQueue();

  /**
   * @memberof Coordinator
   * @instance
   * @type {ClientState}
   */
  this._outwardState = ClientState.DISCONNECTED;

  /**
   * True between a call to disconnect() and the disconnecting event.
   *
   * Used to suppress some invocations:
   *
   *    - Feed object close:   don't suppress
   *    - Session underway:    don't suppress - atomic
   *    - Feed object open:    suppress - don't return feed objects after disconnect()
   *    - Session pending:     suppress everything except state-oriented events
   *                           action results, feed open/close results, feed actions/terminations
   *
   * Also used to suppress the error argument on the disconnecting event, if
   * pending.
   *
   * @memberof Coordinator
   * @instance
   * @type {boolean}
   */
  this._disconnectCalled = false;

  // Store bound queue operation functions so you aren't constantly re-binding
  this._boundQueueOps = {};
  Object.entries(this._queueOps).forEach(([containerName, container]) => {
    this._boundQueueOps[containerName] = {};
    Object.entries(container).forEach(([fnName, fn]) => {
      this._boundQueueOps[containerName][fnName] = fn.bind(this);
    });
  });

  // Listen for Conversation events and queue for processing when observed
  Object.keys(this._queueOps.convoPending).forEach((evt) => {
    this._conversation.on(evt, (...args) => {
      this._queue.add(
        priorities.CONVO_EVENT_PENDING,
        this._boundQueueOps.convoPending[evt],
        ...args,
      );
    });
  });
};

Coordinator.prototype = Object.create(EventEmitter.prototype);
Coordinator.prototype.constructor = Coordinator;

// Events

/**
 * @event connecting
 * @memberof Coordinator
 */

/**
 * @event connect
 * @memberof Coordinator
 */

/**
 * @event feedObjectAction
 * @memberof Coordinator
 * @param {string} feedObjectId
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */

/**
 * @event feedObjectActionName
 * @memberof Coordinator
 * @param {string} feedObjectId
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */

/**
 * @event feedObjectClose
 * @memberof Coordinator
 * @param {string} feedObjectId
 * @param {?TerminationError|ConnectionError} err
 */

/**
 * @event disconnecting
 * @memberof Coordinator
 * @param {?(ConnectionError|HandshakeError|ResponseTimeoutError|ServerMessageError|ViolationResponseError|TransportError)} err
 */

/**
 * @event disconnect
 * @memberof Coordinator
 */

/**
 * @event error
 * @memberof Conversation
 * @param {Coordinator} err
 */

/**
 * Callback for connect()
 * - If there is a connect event then callback(null)
 * - If there is a disconnecting event then callback(Error)
 * @callback ConnectCallback
 * @memberof Coordinator
 * @param {?(ConnectionError|HandshakeError|ResponseTimeoutError|ServerMessageError|ViolationResponseError|TransportError)} err
 */

/**
 * Callback for disconnect()
 * - When there is a disconnect event then callback(null)
 * @callback DisconnectCallback
 * @memberof Coordinator
 * @param {null} err
 */

/**
 * Callback for action()
 * @callback ActionCallback
 * @memberof Coordinator
 * @param {?(RejectionError|ConnectionError)} err
 * @param {?Object} actionData
 */

/**
 * Callback for feed()
 * @callback FeedCallback
 * @memberof Coordinator
 * @param {?(RejectionError|ConnectionError)} err
 * @param {?string} feedObjectId
 */

// Public methods

/**
 * @memberof Coordinator
 * @instance
 * @param {ConnectCallback} callback
 * @throws {StateError|TransportError}
 */
Coordinator.prototype.connect = function connect(callback) {
  // Check state
  if (this._outwardState !== ClientState.DISCONNECTED) {
    throw new StateError("Client must be disconnected.");
  }

  // Save the callback - resolved after connect event, rejected after disconnecting event
  // Stored ahead of potential TransportError
  this._db.newConnectCallback(callback);

  // Call Conversation.connect() if state still permits
  // Conversation state could be disconnected or error
  if (this._conversation.state === ClientState.DISCONNECTED) {
    this._conversation.connect(); // Intentionally cascade TransportError
  }
};

/**
 * @memberof Coordinator
 * @instance
 * @param {DisconnectCallback} callback
 * @throws {StateError|TransportError}
 */
Coordinator.prototype.disconnect = function disconnect(callback) {
  // Check state
  if (
    this._outwardState !== ClientState.CONNECTING &&
    this._outwardState !== ClientState.CONNECTED
  ) {
    throw new StateError("Client must be connecting or connected.");
  }

  // Save the callback - resolved after disconnect event
  // Stored ahead of potential TransportError
  this._db.newDisconnectCallback(callback);

  // Call Conversation.disconnect() if state still permits
  // Conversation state could be anything
  const conversationState = this._conversation.state;
  if (
    conversationState === ClientState.CONNECTING ||
    conversationState === ClientState.CONNECTED
  ) {
    this._conversation.disconnect(); // Intentionally cascade TransportError
  }

  // Suppress some dependent invocations and and emit disconnecting event with no err
  this._disconnectCalled = true;
};

/**
 * @memberof Coordinator
 * @instance
 * @param {string} name
 * @param {Object} args
 * @param {ActionCallback} callback
 * @throws {StateError|TransportError}
 */
Coordinator.prototype.action = function action(name, args, callback) {
  // Check state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("Client must be connected.");
  }

  // Save the callback
  const callbackId = this._db.newActionCallback(callback);

  // Call Conversation.action() if state still permits
  // Conversation state could be connected, disconnecting, disconnected, error
  if (this._conversation.state === ClientState.CONNECTED) {
    this._conversation.action(callbackId, name, args); // Intentionally cascade TransportError
  }
};

/**
 * @memberof Coordinator
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @param {FeedCallback} callback
 * @throws {StateError|TransportError}
 */
Coordinator.prototype.feedObjectOpen = function feedObjectOpen(
  feedNameArgs,
  callback,
) {
  // Check state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("Client must be connected.");
  }

  // Create feed object in opening state - saves callback
  const feedObjectId = this._db.newFeedObject(feedNameArgs, callback);

  // Open the server feed if actionable
  if (
    this._conversation.state === ClientState.CONNECTED &&
    this._conversation.feedState(feedNameArgs) === FeedState.CLOSED
  ) {
    this._conversation.feedOpen(feedNameArgs); // Intentionally cascade TransportError
  }

  // Queue potential callback
  // Strictly speaking, you do not need to add to queue if master feed state is
  // not open, since it won't change as part of the underway conversation event
  // But it's more intuitive to check state as part of the queue operation
  this._queue.add(
    priorities.APP_FEED_OBJECT_OPEN,
    this._boundQueueOps.appMethod.feedObjectOpen,
    feedObjectId,
  );
};

/**
 * Returns outward-facing feed object state: either open or closed.
 * Returns closed if the Coordinator is disconnected - do not force the
 * app to check if the client is connected in order to access feed state.
 * @memberof Coordinator
 * @instance
 * @param {string} feedObjectId
 * @returns {FeedState} OPEN or CLOSED
 */
Coordinator.prototype.feedObjectState = function _feedObjectState(
  feedObjectId,
) {
  const internalState = this._db.getFeedObjectState(feedObjectId);
  // Return OPEN if internal state is OPEN or CLOSING - state change is async
  // Return CLOSED if internal state is OPENING or CLOSED
  // The former should not occur, since feedObjectId has not been shared externally yet
  return internalState === FeedState.OPEN || internalState === FeedState.CLOSING
    ? FeedState.OPEN
    : FeedState.CLOSED;
};

/**
 * Returns an object only if internal feed object state is open or closing,
 * in which case outward-facing state is open. Returns null otherwise, including when
 * disconnected.
 * @memberof Coordinator
 * @instance
 * @param {string} feedObjectId
 * @returns {Object}
 */
Coordinator.prototype.feedObjectData = function _feedObjectData(feedObjectId) {
  const internalState = this._db.getFeedObjectState(feedObjectId);
  if (internalState !== FeedState.OPEN && internalState !== FeedState.CLOSING) {
    return null;
  }

  return this._db.getFeedObjectData(feedObjectId);
};

/**
 * Permited only if internal feed object state is open or closing, so that
 * outward-facing is open.
 * @memberof Coordinator
 * @instance
 * @param {string} feedObjectId
 * @param {Function} callback
 * @throws {StateError}
 */
Coordinator.prototype.feedObjectClose = function _feedObjectClose(
  feedObjectId,
  callback,
) {
  const internalState = this._db.getFeedObjectState(feedObjectId);
  if (internalState !== FeedState.OPEN && internalState !== FeedState.CLOSING) {
    throw new StateError("Feed object must be open.");
  }

  // Store the callback
  this._db.newFeedObjectCloseCallback(callback);

  // Discard extraneous calls
  if (internalState === FeedState.CLOSING) {
    return; // Stop
  }

  // Set internal feed object state to closing - outward state is still open
  this._db.setFeedObjectClosing(feedObjectId);

  // Close the server feed if desired and actionable
  const feedNameArgs = this._db.getFeedObjectNameArgs(feedObjectId);
  const desiredState = this._db.getDesiredFeedState(feedNameArgs);
  if (
    desiredState === FeedState.CLOSED &&
    this._conversation.state === ClientState.CONNECTED &&
    this._conversation.feedState(feedNameArgs) === FeedState.OPEN
  ) {
    this._conversation.feedClose(feedNameArgs);
  }

  // Queue close emission/state
  this._queue.add(
    priorities.APP_FEED_OBJECT_CLOSE,
    this._boundQueueOps.appMethod.feedObjectClose,
    feedObjectId,
  );
};

// Public properties

/**
 * @name state
 * @type {ClientState}
 * @memberof Coordinator
 * @instance
 */
Object.defineProperty(Coordinator.prototype, "state", {
  enumerable: true,
  get() {
    return this._outwardState;
  },
});

// Operations run asynchronously via queue

Coordinator.prototype._queueOps = {
  appMethod: {},
  convoUnderway: {},
  convoPending: {},
};

// PRIORITY TIER 1

/**
 * @memberof Coordinator
 * @name _queueOps#appMethod#feedObjectCloseUnderway
 * @instance
 * @param {Function} callback
 */
Coordinator.prototype._queueOps.appMethod.feedObjectCloseUnderway =
  function _appMethod$feedObjectCloseUnderway(callback) {
    // Not suppressed by disconnect()

    // Callback functions already removed from CoordinatorDb

    callback(null);

    return false; // Next invocation async
  };

// PRIORITY TIER 2

/**
 * @memberof Coordinator
 * @name _queueOps#appMethod#feedObjectClose
 * @instance
 * @param {string} feedObjectId
 */
Coordinator.prototype._queueOps.appMethod.feedObjectClose =
  function _appMethod$feedObjectClose(feedObjectId) {
    // Not suppressed by disconnect()

    // Queue feedObjectClose() callbacks
    // All must run before the next feedObjectClose operation begins - higher priority
    this._db.pullFeedObjectCloseCallbacks().forEach((callback) => {
      this._queue.add(
        priorities.APP_FEED_OBJECT_CLOSE_UNDERWAY,
        this._boundQueueOps.appMethod.feedObjectCloseUnderway,
        callback,
      );
    });

    this._outwardState = ClientState.CONNECTED;
    this.emit("connect");

    this._db.setFeedObjectClosed(feedObjectId);
    this.emit("feedObjectClose", feedObjectId); // Requested - no err

    return false; // Next invocation async
  };

// PRIORITY TIER 3

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#connectConnectCallback
 * @instance
 * @param {Function} callback
 */
Coordinator.prototype._queueOps.convoUnderway.connectConnectCallback =
  function convoUnderway$connectConnectCallback(callback) {
    // Not suppressed by disconnect() - underway invocations are atomic

    callback(null);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#feedOpenSuccessCallback
 * @instance
 * @param {string} feedObjectId
 * @param {Object} feedData
 */
Coordinator.prototype._queueOps.convoUnderway.feedOpenSuccessCallback =
  function convoUnderway$feedOpenSuccessCallback(feedObjectId, feedData) {
    // Not suppressed by disconnect() - underway invocations are atomic

    // Internal feed state will still be opening - app doesn't have an object to close

    const callback = this._db.getFeedObjectCallback(feedObjectId);
    this._db.setFeedObjectOpen(feedObjectId, feedData);
    callback(null, feedObjectId);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#feedOpenFailureCallback
 * @instance
 * @param {string} feedObjectId
 * @param {RejectionError} err
 */
Coordinator.prototype._queueOps.convoUnderway.feedOpenFailureCallback =
  function convoUnderway$feedOpenFailureCallback(feedObjectId, err) {
    // Not suppressed by disconnect() - underway invocations are atomic

    // Internal feed state will still be opening - app doesn't have an object to close

    const callback = this._db.getFeedObjectCallback(feedObjectId);
    this._db.setFeedObjectClosed(feedObjectId);
    callback(err);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#feedAction
 * @instance
 * @param {string} feedObjectId
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */
Coordinator.prototype._queueOps.convoUnderway.feedAction =
  function convoUnderway$feedAction(
    feedObjectId,
    actionName,
    actionData,
    newFeedData,
    oldFeedData,
  ) {
    // Not suppressed by disconnect() - underway invocations are atomic

    // Feed object state will be closed if app intervened with feed.close()
    // Feed object state will not be closing - change to closed is highest priority
    if (this._db.getFeedObjectState(feedObjectId) !== FeedState.OPEN) {
      return true; // Next invocation sync
    }

    this._db.setFeedObjectData(feedObjectId, newFeedData);
    this.emit(
      "action",
      feedObjectId,
      actionName,
      actionData,
      newFeedData,
      oldFeedData,
    );

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#feedActionName
 * @instance
 * @param {string} feedObjectId
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */
Coordinator.prototype._queueOps.convoUnderway.feedActionName =
  function convoUnderway$feedActionNam(
    feedObjectId,
    actionName,
    actionData,
    newFeedData,
    oldFeedData,
  ) {
    // Not suppressed by disconnect() - underway invocations are atomic

    // Feed object state will be closed if app intervened with feed.close()
    // Feed object state will not be closing - change to closed is highest priority
    if (this._db.getFeedObjectState(feedObjectId) !== FeedState.OPEN) {
      return true; // Next invocation sync
    }

    // Feed object data is already updated
    this.emit(
      `action:${actionName}`,
      feedObjectId,
      actionName,
      actionData,
      newFeedData,
      oldFeedData,
    );

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#feedTermination
 * @instance
 * @param {string} feedObjectId
 * @param {TerminationError} err
 */
Coordinator.prototype._queueOps.convoUnderway.feedTermination =
  function convoUnderway$feedTermination(feedObjectId, err) {
    // Not suppressed by disconnect() - underway invocations are atomic

    // Feed state will already be closed if app intervened with feed.close()
    if (this._db.feedObjectState(feedObjectId) !== FeedState.OPEN) {
      return true; // Next invocation sync
    }

    this._db.setFeedObjectClosed(feedObjectId);
    this.emit("feedObjectClose", feedObjectId, err);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#disconnectingActionCallback
 * @instance
 * @param {string} callbackId
 * @param {ConnectionError} err
 */
Coordinator.prototype._queueOps.convoUnderway.disconnectingActionCallback =
  function convoUnderway$disconnectingActionCallback(callback, err) {
    // State is disconnecting - disconnect() not permitted

    callback(err);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#disconnectingFeedCallback
 * @instance
 * @param {string} feedObjectId
 * @param {ConnectionError} err
 */
Coordinator.prototype._queueOps.convoUnderway.disconnectingFeedCallback =
  function convoUnderway$disconnectingFeedCallback(feedObjectId, err) {
    // State is disconnecting - disconnect() not permitted

    const callback = this._db.getFeedObjectCallback(feedObjectId);
    this._db.setFeedObjectClosed(feedObjectId);
    callback(err);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#disconnectingFeedClose
 * @instance
 * @param {string} feedObjectId
 * @param {ConnectionError} err
 */
Coordinator.prototype._queueOps.convoUnderway.disconnectingFeedClose =
  function convoUnderway$disconnectingFeedClose(feedObjectId, err) {
    // State is disconnecting - disconnect() not permitted

    // Feed state will already be closed if there was a call to feedObjectClose()
    if (this._db.feedObjectState(feedObjectId) !== FeedState.OPEN) {
      return true; // Next invocation sync
    }

    this._db.setFeedObjectClosed(feedObjectId);
    this.emit("feedObjectClose", feedObjectId, err);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#disconnectingConnectCallback
 * @instance
 * @param {Function} callback
 * @param {?(ConnectionError|HandshakeError|ResponseTimeoutError|ServerMessageError|ViolationResponseError|TransportError)} err
 */
Coordinator.prototype._queueOps.convoUnderway.disconnectingConnectCallback =
  function convoUnderway$disconnectingConnectCallback(callback, err) {
    // State is disconnecting - disconnect() not permitted

    callback(err);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoUnderway#disconnectDisconnectCallback
 * @instance
 * @param {Function} callback
 */
Coordinator.prototype._queueOps.convoUnderway.disconnectDisconnectCallback =
  function convoUnderway$disconnectDisconnectCallback(callback) {
    // State is disconnected - disconnect() not permitted

    callback(null);

    return false; // Next invocation async
  };

// PRIORITY TIER 4

/**
 * @memberof Coordinator
 * @name _queueOps#appMethod#feedObjectOpen
 * @instance
 * @param {string} feedObjectId
 */
Coordinator.prototype._queueOps.appMethod.feedObjectOpen =
  function appMethod$feedObjectOpen(feedObjectId) {
    // Suppress if there has been a call to disconnect()
    if (this._disconnectCalled) {
      return true; // Next invocation sync
    }

    // The callback could not have already been fired
    // - If the underway event was feedOpenSuccess/Failure then the callback ids
    //   to invoke were determined up front
    // - If the underway event was feedTermination then only close events are emitted
    // - The underway event could not have been disconnecting, because a call
    //   to feedObjectOpen() would not have been permitted
    // So no need to check feed object state, just master feed state

    // If callback is not invoked here, it will be invoked on eventual
    // feedOpenSuccess/Failure or during disconnecting sequence

    const feedNameArgs = this._db.feedObjectNameArgs(feedObjectId);
    if (this._db.getMasterFeedState(feedNameArgs) === FeedState.OPEN) {
      const callback = this._db.getFeedObjectCallback(feedObjectId);
      this._db.setFeedObjectOpen(
        feedObjectId,
        this._db.getMasterFeedData(feedNameArgs),
      );
      callback(null, feedObjectId);
      return false; // Next invocation async
    }

    return true; // Next invocation sync
  };

// PRIORITY TIER 5

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#connecting
 * @instance
 */
Coordinator.prototype._queueOps.convoPending.connecting =
  function convoPending$connecting() {
    // State was disconnected - disconnect() not permitted

    this._outwardState = ClientState.CONNECTING;
    this.emit("connecting");

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#connect
 * @instance
 */
Coordinator.prototype._queueOps.convoPending.connect =
  function convoPending$connect() {
    // Suppress invocation and state change if there has been a call to disconnect()
    if (this._disconnectCalled) {
      return true; // Next invocation sync
    }

    // Queue connect() success callbacks
    // Intentionally not done if connect event is suppressed - callback failure on disconnect
    this._db.pullConnectCallbacks().forEach((callback) => {
      this._queue.add(
        priorities.CONVO_EVENT_UNDERWAY,
        this._boundQueueOps.convoUnderway.connectConnectCallback,
        callback,
      );
    });

    this._outwardState = ClientState.CONNECTED;
    this.emit("connect");

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#actionSuccess
 * @instance
 * @param {string} callbackId
 * @param {Object} actionData
 */
Coordinator.prototype._queueOps.convoPending.actionSuccess =
  function convoPending$actionSuccess(callbackId, actionData) {
    // Always update state, but suppress invocation if there has been a call to disconnect()

    const callback = this._db.pullActionCallback(callbackId); // Guaranteed to exist

    if (this._disconnectCalled) {
      return true; // Next invocation sync
    }

    callback(null, actionData);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#actionFailure
 * @instance
 * @param {string} callbackId
 * @param {string} errorCode
 * @param {Object} errorData
 */
Coordinator.prototype._queueOps.convoPending.actionFailure =
  function convoPending$actionFailure(callbackId, errorCode, errorData) {
    // Always update state, but suppress invocation if there has been a call to disconnect()

    const callback = this._db.pullActionCallback(callbackId); // Guaranteed to exist

    if (this._disconnectCalled) {
      return true; // Next invocation sync
    }

    const err = new RejectionError("The server rejected the action request.");
    err.serverErrorCode = errorCode;
    err.serverErrorData = errorData;

    callback(err);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#feedOpenSuccess
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @param {Object} feedData
 */
Coordinator.prototype._queueOps.convoPending.feedOpenSuccess =
  function convoPending$feedOpenSuccess(feedNameArgs, feedData) {
    // Always update state, but suppress invocation if there has been a call to disconnect()

    this._db.setMasterFeedOpen(feedNameArgs, feedData);

    if (this._disconnectCalled) {
      return true; // Next invocation sync
    }

    // Queue feed object callbacks
    this._db
      .getFeedObjectIds(FeedState.OPENING, feedNameArgs)
      .forEach((feedObjectId) => {
        this._queue.add(
          priorities.CONVO_EVENT_UNDERWAY,
          this._boundQueueOps.convoUnderway.feedOpenSuccessCallback,
          feedObjectId,
          feedData,
        );
      });

    // You know the desired state of the server feed is open, because there is no
    // way to cancel an opening feed - don't consider closing

    return true; // Next invocation sync
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#feedOpenFailure
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @param {string} errorCode
 * @param {Object} errorData
 */
Coordinator.prototype._queueOps.convoPending.feedOpenFailure =
  function convoPending$feedOpenFailure(feedNameArgs, errorCode, errorData) {
    // Always update state, but suppress invocation if there has been a call to disconnect()

    this._db.setMasterFeedClosed(feedNameArgs);

    if (this._disconnectCalled) {
      return true; // Next invocation sync
    }

    const err = new RejectionError(
      "The server rejected the feed open request.",
    );
    err.serverErrorCode = errorCode;
    err.serverErrorData = errorData;

    // Queue feed object callbacks
    this._db
      .getFeedObjectIds(FeedState.OPENING, feedNameArgs)
      .forEach((feedObjectId) => {
        this._queue.add(
          priorities.CONVO_EVENT_UNDERWAY,
          this._boundQueueOps.convoUnderway.feedOpenFailureCallback,
          feedObjectId,
          err,
        );
      });

    // The server feed is now closed
    // Calls to feedObjectOpen() will trigger a new server open attempt

    return true; // Next invocation sync
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#feedCloseSuccess
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 */
Coordinator.prototype._queueOps.convoPending.feedCloseSuccess =
  function convoPending$feedCloseSuccess(feedNameArgs) {
    // There are no outside invocations

    this._db.setMasterFeedClosed(feedNameArgs);

    // The server feed is now closed
    // Feed objects have already been informed as part of feedObjectClose()
    // Reopen the server feed if there has been a call to feedObjectOpen()
    // Shouldn't you do this immediately when the Convo event is received, instead
    // of when the pending event is processed? No - then you would need both
    if (this._db.getDesiredFeedState(feedNameArgs) === FeedState.OPEN) {
      this._conversation.feedOpen(feedNameArgs);
    }

    return true; // Next invocation sync
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#feedAction
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */
Coordinator.prototype._queueOps.convoPending.feedAction =
  function convoPending$feedAction(
    feedNameArgs,
    actionName,
    actionData,
    newFeedData,
    oldFeedData,
  ) {
    // Always update state, but suppress invocation if there has been a call to disconnect()

    this._db.setMasterFeedData(feedNameArgs, newFeedData);

    if (this._disconnectCalled) {
      return true; // Next invocation sync
    }

    // Queue potential action and action:name emissions for each open feed
    this._db
      .getFeedObjectIds(FeedState.OPEN, feedNameArgs)
      .forEach((feedObjectId) => {
        this._queue.add(
          priorities.CONVO_EVENT_UNDERWAY,
          this._boundQueueOps.convoUnderway.feedAction,
          feedObjectId,
          actionName,
          actionData,
          newFeedData,
          oldFeedData,
        );
        this._queue.add(
          priorities.CONVO_EVENT_UNDERWAY,
          this._boundQueueOps.convoUnderway.feedActionName,
          feedObjectId,
          actionName,
          actionData,
          newFeedData,
          oldFeedData,
        );
      });

    return true; // Next invocation sync
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#feedTermination
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @param {string} errorCode
 * @param {Object} errorData
 */
Coordinator.prototype._queueOps.convoPending.feedTermination =
  function convoPending$feedTermination(feedNameArgs, errorCode, errorData) {
    // Always update state, but suppress invocation if there has been a call to disconnect()

    this._db.setMasterFeedClosed(feedNameArgs);

    if (this._disconnectCalled) {
      return true; // Next invocation sync
    }

    // The server master feed was open and feedObjectOpen() callbacks have been
    // run, so you're operating only on feed objects

    // The Conversation suppresses this event if there was a call to feedClose()

    // If there is a call to feedObjectOpen() while these invocations are being
    // then it will trigger an attempt to reopen the server feed

    const err = new TerminationError("...");
    err.serverErrorCode = errorCode;
    err.serverErrorData = errorData;

    // Queue close events on any open feed objects
    this._db
      .getFeedObjectIds(FeedState.OPEN, feedNameArgs)
      .forEach((feedObjectId) => {
        this._queue.add(
          priorities.CONVO_EVENT_UNDERWAY,
          this._boundQueueOps.convoUnderway.feedTermination,
          feedObjectId,
          err,
        );
      });

    return true; // Next invocation sync
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#disconnecting
 * @instance
 * @param {?Error} err
 */
Coordinator.prototype._queueOps.convoPending.disconnecting =
  function convoPending$disconnecting(err) {
    // A call to disconnect() may or may not be responsible for this
    // event, but if it was called, emit disconnecting event with no err

    this._db.setMasterFeedClosed(); // All name/arg combos

    const reuseErr = new ConnectionError("The client is disconnecting.");

    // Queue action() callbacks
    this._db.pullActionCallbackIds().forEach((callback) => {
      this._queue.add(
        priorities.CONVO_EVENT_UNDERWAY,
        this._boundQueueOps.convoUnderway.disconnectingActionCallback,
        callback,
        reuseErr,
      );
    });

    // Queue feedObjectOpen() callbacks
    this._db.getFeedObjectIds(FeedState.OPENING).forEach((feedObjectId) => {
      this._queue.add(
        priorities.CONVO_EVENT_UNDERWAY,
        this._boundQueueOps.convoUnderway.disconnectingFeedCallback,
        feedObjectId,
        reuseErr,
      );
    });

    // Queue feedObjectClose events
    this._db.getFeedObjectIds(FeedState.OPEN).forEach((feedObjectId) => {
      this._queue.add(
        priorities.CONVO_EVENT_UNDERWAY,
        this._boundQueueOps.convoUnderway.disconnectingFeedClose,
        feedObjectId,
        reuseErr,
      );
    });

    // Determine error for connect() callback and disconnecting event
    let emitErr = err; // Could be falsy
    if (this._disconnectCalled) {
      emitErr = null;
    }

    // Queue connect() failure callbacks
    // There will not be action/feedObjectOpen() callbacks or feedObjectClose events - was not connected
    this._db.pullConnectCallbacks().forEach((callback) => {
      this._queue.add(
        priorities.CONVO_EVENT_UNDERWAY,
        this._boundQueueOps.convoUnderway.disconnectingConnectCallback,
        callback,
        emitErr,
      );
    });

    // Update state and emit
    this._outwardState = ClientState.DISCONNECTING;
    this._disconnectCalled = false;
    this.emit("disconnecting", emitErr || null);

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#disconnect
 * @instance
 */
Coordinator.prototype._queueOps.convoPending.disconnect =
  function convoPending$disconnect() {
    // State was disconnecting - disconnect() not permitted

    // Queue disconnect() success callbacks
    this._db.pullDisconnectCallbacks().forEach((callback) => {
      this._queue.add(
        priorities.CONVO_EVENT_UNDERWAY,
        this._boundQueueOps.convoUnderway.disconnectDisconnectCallback,
        callback,
      );
    });

    this._outwardState = ClientState.DISCONNECTED;
    this.emit("disconnect");

    return false; // Next invocation async
  };

/**
 * @memberof Coordinator
 * @name _queueOps#convoPending#error
 * @instance
 * @param {TransportError} err
 */
Coordinator.prototype._queueOps.convoPending.error =
  function convoPending$error(err) {
    // State was disconnected - disconnect() not permitted

    this._outwardState = ClientState.ERROR;
    this.emit("error", err);

    return false; // Next invocation async
  };

// Exports

export default Coordinator;
