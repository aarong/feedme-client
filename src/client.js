import check from "check-types";
import jsonExpressible from "json-expressible";
import debug from "debug";
import { EventEmitter } from "events";
import FeedNameArgs from "feedme-util/feednameargs";
import _clone from "lodash/clone";
import Coordinator from "./coordinator";
import { ClientState, FeedState } from "./states";
import { ArgumentError, HandshakeError, StateError } from "./errors";
import defaults from "./defaults";
import promiseCallback from "./promisecallback";
import FeedmeClientFeed from "./clientfeed";

const dbg = debug("feedme-client:client");

/**
 * Application-facing API details documented in README.
 *
 * Operates synchronously to the Coordinator. With the exception of promise
 * settlements, Coordinator emissions/callbacks are invoked synchronously on the
 * application.
 *
 * The state of this module is almost always aligned with the state of the
 * Coordinator, with one exception: when the Client initiates an attempt to
 * connect the Coordinator in setTimeout, it emits/shows connecting to the
 * application early. Otherwise, the application would still be entitled to call
 * disconnect() and expect the pending connection to be cancelled. If the client
 * is "faking" connecting and the application calls disconnect(), then the
 * client sets an internal flag and begins to disconnect once it gets the
 * coordinator connecting event.
 *
 * The only asynchronous elements are timers and promise settlements (fine to
 * add microtask deferral).
 *
 * Sits on top of the Coordinator and adds:
 *
 * - FeedmeClientFeed objects
 *   A simple extension of the "flat" Coordinator API.
 *
 * - Application argument validation
 *   Type validation generally performed once at the application boundary
 *   One exception is the transport, which is validated by harness init
 *
 * - Automatic connects
 *   Depending on configuration, the Client may initiate a connection attempt
 *   upon initialization, failure to establish a connection (retries), and loss
 *   of an existing connection (reconnects). Best here so lower-level code doesn't
 *   need to worry about the connection cycling. Also, the app finds out about
 *   disconnects before there is an attempt to reconnect, giving it the
 *   opportunity to cancel the pending attempt.
 *
 * @constructor
 * @extends EventEmitter
 * @param {Object} transport
 * @param {Object} options
 * @throws {ArgumentError|TransportError}
 */
const FeedmeClient = function FeedmeClient(transport, options = {}) {
  dbg("Initializing client object");

  // All options are validated here with one exception:
  // The transport argument is validated by HarnessSync - change? Check object here?

  // Check options type
  if (!check.object(options)) {
    throw new ArgumentError("Options must be an object.");
  }

  // Check options keys
  if (Object.keys(options).some((k) => !Object.keys(defaults).includes(k))) {
    throw new ArgumentError("Unrecognized option(s):");
  }

  // Check options.connect (if specified)
  if ("connect" in options && !check.boolean(options.connect)) {
    throw new ArgumentError("The option 'connect' must be boolean.");
  }

  // Check options.connectTimeoutMs (if specified)
  if (
    "connectTimeoutMs" in options &&
    (!check.integer(options.connectTimeoutMs) || options.connectTimeoutMs < 0)
  ) {
    throw new ArgumentError(
      "The option 'connectTimeoutMs' must be a non-negative integer.",
    );
  }

  // Check options.disconnectTimeoutMs (if specified)
  if (
    "disconnectTimeoutMs" in options &&
    (!check.integer(options.disconnectTimeoutMs) ||
      options.disconnectTimeoutMs < 0)
  ) {
    throw new ArgumentError(
      "The option 'disconnectTimeoutMs' must be a non-negative integer.",
    );
  }

  // Check options.responseTimeoutMs (if specified)
  if (
    "responseTimeoutMs" in options &&
    (!check.integer(options.responseTimeoutMs) || options.responseTimeoutMs < 0)
  ) {
    throw new ArgumentError(
      "The option 'responseTimeoutMs' must be a non-negative integer.",
    );
  }

  // Check options.connectRetryMs (if specified)
  if ("connectRetryMs" in options && !check.integer(options.connectRetryMs)) {
    throw new ArgumentError("The option 'connectRetryMs' must be an integer.");
  }

  // Check options.connectRetryBackoffMs (if specified)
  if (
    "connectRetryBackoffMs" in options &&
    (!check.integer(options.connectRetryBackoffMs) ||
      options.connectRetryBackoffMs < 0)
  ) {
    throw new ArgumentError(
      "The option 'connectRetryBackoffMs' must be a non-negative integer.",
    );
  }

  // Check options.connectRetryMaxMs (if specified)
  const connectRetryMs =
    "connectRetryMs" in options
      ? options.connectRetryMs
      : defaults.connectRetryMs;
  if (
    "connectRetryMaxMs" in options &&
    (!check.integer(options.connectRetryMaxMs) ||
      options.connectRetryMaxMs < 0 ||
      options.connectRetryMaxMs < connectRetryMs)
  ) {
    throw new ArgumentError(
      "The option 'connectRetryMaxMs' must be a non-negative integer and not less than 'connectRetryMs'.",
    );
  }

  // Check options.connectRetryMaxAttempts (if specified)
  if (
    "connectRetryMaxAttempts" in options &&
    (!check.integer(options.connectRetryMaxAttempts) ||
      options.connectRetryMaxAttempts < 0)
  ) {
    throw new ArgumentError(
      "The option 'connectRetryMaxAttempts' must be a non-negative integer.",
    );
  }

  // Check options.reconnect (if specified)
  if ("reconnect" in options && !check.boolean(options.reconnect)) {
    throw new ArgumentError("The option 'reconnect' must be boolean.");
  }

  // Check options.reconnectMax (if specified)
  if (
    "reconnectMax" in options &&
    (!check.integer(options.reconnectMax) || options.reconnectMax < 0)
  ) {
    throw new ArgumentError(
      "The option 'reconnectMax' must be a non-negative integer.",
    );
  }

  // Check options.reconnectMaxMs (if specified)
  if (
    "reconnectMaxMs" in options &&
    (!check.integer(options.reconnectMaxMs) || options.reconnectMaxMs <= 0)
  ) {
    throw new ArgumentError(
      "The option 'reconnectMaxMs' must be a positive integer.",
    );
  }

  EventEmitter.call(this);

  /**
   * @memberof FeedmeClient
   * @instance
   * @type {Object}
   */
  this._options = Object.assign(_clone(defaults), options); // Don't modify defaults

  /**
   * @memberof FeedmeClient
   * @instance
   * @type {Coordinator}
   */
  this._coordinator = new Coordinator(transport, options); // Intentionally cascade ArgumentError, TransportError

  /**
   * Outward-facing Client state. Usually the same as the Coordinator state, but
   * switches to connecting early when a setTimeout() fires and initiates a
   * connection attempt.
   * @memberof FeedmeClient
   * @instance
   * @type {ClientState}
   */
  this._outwardState = ClientState.DISCONNECTED;

  /**
   * @memberof FeedmeClient
   * @instance
   * @type {Object}
   */
  this._feedObjects = {}; // Indexed by feedObjectId

  /**
   * The timer associated with any pending connection attempt.
   * @memberof FeedmeClient
   * @instance
   * @type {number}
   */
  this._pendingConnectTimer = null;

  /**
   * The number of connection retries that have been scheduled.
   *
   * - Incremented when a connection retry is scheduled
   * - Used in disconnecting event handler to determine nextConnectMs
   * - Set to 0 in connect() and disconnect()
   * - Set to 0 in connect event handler
   *
   * @memberof FeedmeClient
   * @instance
   * @type {number}
   */
  this._connectRetryAttempts = 0;

  /**
   * The error that was emitted with the latest disconnecting event.
   * @memberof FeedmeClient
   * @instance
   * @type {Error}
   */
  this._disconnectingError = null;

  /**
   * Used by disconnect event handler as the delay for any pending connection
   * attempt. -1 means none.
   *
   * - Set by disconnecting event handler
   * - Set to -1 by nextConnectCancel() method
   *
   * @memberof FeedmeClient
   * @instance
   * @type {number}
   */
  this._nextConnectMs = -1;

  /**
   * App calls to Client.disconnect() that were queued after emitting connecting
   * early and that will be executed on Coordinator connecting.
   * @memberof FeedmeClient
   * @instance
   * @type {Array}
   */
  this._queuedDisconnectCalls = [];

  /**
   * One timer for each reconnect that has occurred in the past options.reconnectMaxMs.
   * So the length of this set is the reconnect count.
   *
   * When timers fire, they remove themselves from the set.
   *
   * - Cleared if reconnectMax is breached
   * - Cleared on connect() and disconnect()
   * - Otherwise left to persist through the connection cycle
   *
   * @memberof FeedmeClient
   * @instance
   * @type {Set}
   */
  this._reconnectTimers = new Set();

  // Listen for Coordinator events
  Object.entries(this._handlers).forEach(([evt, handler]) => {
    this._coordinator.on(evt, handler.bind(this));
  });

  // Auto-connect?
  if (this._options.connect) {
    this._nextConnectMs = 0;
    this._schedulePendingConnect(); // Cancelled if there is a call to nextConnectCancel()
  }
};

FeedmeClient.prototype = Object.create(EventEmitter.prototype);
FeedmeClient.prototype.constructor = FeedmeClient;

/**
 * @event connecting
 * @memberof FeedmeClient
 */

/**
 * @event connect
 * @memberof FeedmeClient
 */

/**
 * @event disconnecting
 * @memberof FeedmeClient
 * @instance
 * @param {?(ConnectionError|HandshakeError|ResponseTimeoutError|ServerMessageError|ViolationResponseError|TransportError)} err
 */

/**
 * @event disconnect
 * @memberof FeedmeClient
 */

/**
 * @event error
 * @memberof FeedmeClient
 * @param {TransportError} err
 */

/**
 * Callback for action()
 * @callback ActionCallback
 * @memberof FeedmeClient
 * @param {?(RejectionError|ConnectionError)} err
 * @param {?Object} actionData
 */

/**
 * Callback for feed()
 * @callback FeedCallback
 * @memberof FeedmeClient
 * @param {?(RejectionError|ConnectionError)} err
 * @param {?string} feedObjectId
 */

// Attach state constants to constructor and instance prototype
Object.entries(ClientState).forEach(([key, val]) => {
  FeedmeClient[key] = val;
  FeedmeClient.prototype[key] = val;
});
Object.entries(FeedState).forEach(([key, val]) => {
  FeedmeClient[key] = val;
  FeedmeClient.prototype[key] = val;
});

// Public methods

/**
 * @memberof FeedmeClient
 * @instance
 * @param {?Function} callback
 * @throws {ArgumentError|StateError|TransportError}
 */
FeedmeClient.prototype.connect = function connect(callback) {
  // Check callback
  if (callback && !check.function(callback)) {
    throw new ArgumentError("Callback must be a function.");
  }

  // Check state
  if (this._outwardState !== ClientState.DISCONNECTED) {
    throw new StateError("The client state must be disconnected.");
  }

  // Cancel pending attempt
  this._cancelPendingConnect(); // Before connect(), in case it throws
  this._connectRetryAttempts = 0;

  this._clearReconnects(); // Reconnect counters reset  when app calls dis/connect() and nextConnectCancel()

  // Callback-style or promise-style usage?
  const { promise, innerCallback } = promiseCallback(callback);

  // The Client state is disconnected, so the Coordinator state is disconnected
  // They only differ when the Client switches to connecting early
  this._coordinator.connect(innerCallback); // Intentionally cascade TransportError

  return promise; // Promise or undefined
};

/**
 * @memberof FeedmeClient
 * @instance
 * @param {?Function} callback
 * @throws {ArgumentError|StateError|TransportError}
 */
FeedmeClient.prototype.disconnect = function disconnect(callback) {
  // Check callback
  if (callback && !check.function(callback)) {
    throw new ArgumentError("Callback must be a function.");
  }

  // Check state
  if (
    this._outwardState !== ClientState.CONNECTING &&
    this._outwardState !== ClientState.CONNECTED
  ) {
    throw new StateError("The client state must be connecting or connected.");
  }

  this._connectRetryAttempts = 0;

  this._clearReconnects(); // Reconnect counters reset  when app calls dis/connect() and nextConnectCancel()

  // Callback-style or promise-style usage?
  const { promise, innerCallback } = promiseCallback(callback);

  if (this._coordinator.state === ClientState.DISCONNECTED) {
    // Client state set to connecting early
    // Delay Coordinator.disconnect() until after it emits connecting
    this._queuedDisconnectCalls.push(innerCallback);
  } else {
    // Client is connecting/ed, so Coordinator will be connecting/ed (though perhaps not the same)
    this._coordinator.disconnect(innerCallback); // Intentionally cascade TransportError
  }

  return promise; // Promise or undefined
};

/**
 * @memberof FeedmeClient
 * @instance
 * @param {string} name
 * @param {Object} args
 * @param {?Function} callback
 * @returns {?Promise}
 * @throws {ArgumentError|StateError|TransportError}
 */
FeedmeClient.prototype.action = function action(name, args, callback) {
  // Check action name (empty is spec-valid)
  if (!check.string(name)) {
    throw new ArgumentError("Action name must be a string.");
  }

  // Check action args
  if (!check.object(args)) {
    throw new ArgumentError("Action arguments must be an object.");
  }
  if (!jsonExpressible(args)) {
    throw new ArgumentError("Action arguments must be JSON-expressible.");
  }

  // Check callback
  if (callback && !check.function(callback)) {
    throw new ArgumentError("Callback must be a function.");
  }

  // Check state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("The client state must be connected.");
  }

  // Callback-style or promise-style usage?
  const { promise, innerCallback } = promiseCallback(callback);

  // The Client is connected, so the Coordinator will be connected
  // Intentionally cascade TransportError
  this._coordinator.action(name, args, innerCallback.bind(this));

  return promise; // Promise or undefined
};

/**
 * @memberof FeedmeClient
 * @instance
 * @param {string} name
 * @param {Object} args
 * @param {?Function} callback
 * @returns {?Promise}
 * @throws {ArgumentError|StateError|TransportError}
 */
FeedmeClient.prototype.feed = function feed(name, args, callback) {
  // Check feed name/args
  const feedNameArgs = FeedNameArgs(name, args);
  if (feedNameArgs.error()) {
    throw new ArgumentError(feedNameArgs.error());
  }

  // Check callback
  if (callback && !check.function(callback)) {
    throw new ArgumentError("Callback must be a function.");
  }

  // Check callback
  if (callback && !check.function(callback)) {
    throw new ArgumentError("Callback must be a function.");
  }

  // Check state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("The client state must be connected.");
  }

  // Callback-style or promise-style usage?
  const { promise, innerCallback } = promiseCallback(callback);

  // The Client is connected, so the Coordinator will be connected
  // Intentionally cascade TransportError
  this._coordinator.feedObjectOpen(feedNameArgs, (err, feedObjectId) => {
    if (err) {
      innerCallback.call(this, err);
    } else {
      const feedObject = new FeedmeClientFeed(this, feedNameArgs, feedObjectId);
      innerCallback.call(this, null, feedObject);
    }
  });

  return promise; // Promise or undefined
};

/**
 * Permitted if there is no pending connection attempt and irrespective of state.
 * @memberof FeedmeClient
 * @instance
 */
FeedmeClient.prototype.nextConnectCancel = function nextConnectCancel() {
  this._cancelPendingConnect(); // Sets _nextConnectMs to -1

  this._clearReconnects(); // Reconnect counters reset  when app calls dis/connect() and nextConnectCancel()
};

// Public properties

/**
 * The Client state is generally the same as the Coordinator, but is set to
 * connecting early when an automatic (timed) connection attempt is made.
 * @name state
 * @type {ClientState}
 * @memberof FeedmeClient
 * @instance
 */
Object.defineProperty(FeedmeClient.prototype, "state", {
  enumerable: true,
  get() {
    return this._outwardState;
  },
});

/**
 * @name nextConnectMs
 * @type {number}
 * @memberof FeedmeClient
 * @instance
 */
Object.defineProperty(FeedmeClient.prototype, "nextConnectMs", {
  enumerable: true,
  get() {
    return this._nextConnectMs; // -1, 0, or > 0
  },
});

// Coordinator event handlers

FeedmeClient.prototype._handlers = {};

/**
 * @memberof FeedmeClient
 * @name _handlers#connecting
 * @instance
 */
FeedmeClient.prototype._handlers.connecting = function _handlers$connecting() {
  // If the app called disconnect() while the Client was pretending to be
  // connecting then disconnect the Coordinator
  // Callback arguments were saved in disconnect()
  this._queuedDisconnectCalls.forEach((cb) => {
    this._coordinator.disconnect(cb);
  });
  this._queuedDisconnectCalls = [];

  // Emit if and update state it wasn't done early
  if (this._outwardState !== ClientState.CONNECTING) {
    this._outwardState = ClientState.CONNECTING;
    this.emit("connecting");
  }
};

/**
 * @memberof FeedmeClient
 * @name _handlers#connect
 * @instance
 */
FeedmeClient.prototype._handlers.connect = function _handlers$connect() {
  this._outwardState = ClientState.CONNECTED;
  this._connectRetryAttempts = 0;
  this.emit("connect");
};

/**
 * @memberof FeedmeClient
 * @name _handlers#feedObjectAction
 * @instance
 * @param {string} feedObjectId
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */
FeedmeClient.prototype._handlers.feedObjectAction =
  function _handleFeedObjectAction(
    feedObjectId,
    actionName,
    actionData,
    newFeedData,
    oldFeedData,
  ) {
    this._feedObjects[feedObjectId].emit(
      "action",
      actionName,
      actionData,
      newFeedData,
      oldFeedData,
    );
  };

/**
 * @memberof FeedmeClient
 * @name _handlers#feedObjectActionName
 * @instance
 * @param {string} feedObjectId
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */
FeedmeClient.prototype._handlers.feedObjectActionName =
  function _handlers$feedObjectActionName(
    feedObjectId,
    actionName,
    actionData,
    newFeedData,
    oldFeedData,
  ) {
    this._feedObjects[feedObjectId].emit(
      `action:${actionName}`,
      actionData,
      newFeedData,
      oldFeedData,
    );
  };

/**
 * @memberof FeedmeClient
 * @name _handlers#feedObjectClose
 * @instance
 * @param {string} feedObjectId
 * @param {Error} err
 */
FeedmeClient.prototype._handlers.feedObjectClose =
  function _handlers$feedObjectClose(feedObjectId, err) {
    // Feed object is now closed - methods will throw

    // Remove client reference to feed object
    // Leave feed object reference to client in place for method access - does not impact GC
    const feedObject = this._feedObjects[feedObjectId];
    delete this._feedObjects[feedObjectId];

    feedObject.emit("close", err);
  };

/**
 * @memberof FeedmeClient
 * @name _handlers#disconnecting
 * @instance
 * @param {?Error} err
 */
FeedmeClient.prototype._handlers.disconnecting =
  function _handlers$disconnecting(err) {
    let nextConnectMs = -1; // No connection attempt

    // Retry following a failed connection attempt?
    if (
      err && // Not requested
      this._outwardState === ClientState.CONNECTING && // Client was connecting
      !(err instanceof HandshakeError) &&
      this.connectRetryMs >= 0 &&
      (this._connectRetryMaxAttempts === 0 ||
        this._connectRetryAttempts < this._connectRetryMaxAttempts)
    ) {
      this._connectRetryAttempts += 1;
      nextConnectMs = Math.min(
        this._options.connectRetryMs +
          this._connectRetryAttempts * this._options.connectRetryBackoffMs,
        this._options.connectRetryMaxMs,
      ); // Could be zero
    } else {
      this._connectRetryAttempts = 0;
    }

    // Reconnect after established connection failure?
    if (
      err && // Not requested
      this._outwardState === ClientState.CONNECTED && // Client was connected
      this._options.reconnect
    ) {
      // Reconnect desired, up to configured limit
      if (
        this._options.reconnectMax === 0 ||
        this._reconnectTimers.length < this._options.reconnectMax
      ) {
        // Reconnect
        this._incrementReconnects();
        nextConnectMs = 0;
      } else {
        // Limit breached - do not reconnect
        this._clearReconnects();
      }
    }

    // Update state an emit
    this._disconnectingError = err; // Save for disconnecting event - may be null
    this._nextConnectMs = nextConnectMs;
    this._outwardState = ClientState.DISCONNECTING;
    this.emit("disconnecting", err || null);
  };

/**
 * @memberof FeedmeClient
 * @name _handlers#disconnect
 * @instance
 */
FeedmeClient.prototype._handlers.disconnect = function _handlers$disconnect() {
  // The error emitted with disconnect is always identical to the one for disconnecting

  this._schedulePendingConnect(); // Evaluates this._nextConnectMs

  // Update state and emit
  const err = this._disconnectingError; // May be falsy
  this._disconnectingError = null;
  this._outwardState = ClientState.DISCONNECTED;
  this.emit("disconnect", err || null);
};

/**
 * @memberof FeedmeClient
 * @name _handlers#error
 * @instance
 * @param {TransportError} err
 */
FeedmeClient.prototype._handlers.error = function _handlers$error(err) {
  // The Client has already gone through the disconnect sequence
  // Callbacks/promises all sent error, feed objects all closed

  this._cancelPendingConnect();

  this._clearReconnects();

  this._outwardState = ClientState.ERROR;
  this.emit("error", err);
};

// Internal helper functions

/**
 * Schedule a connection attempt in client._nextConnectMs. Used by constructor
 * (for auto-connecting) and disconnect event handler (for reconnects/retries).
 * @memberof FeedmeClient
 * @instance
 */
FeedmeClient.prototype._schedulePendingConnect =
  function _schedulePendingConnect() {
    // Defer if ms === 0
    if (this._nextConnectMs >= 0) {
      this._pendingConnectTimer = setTimeout(
        this._runPendingConnect.bind(this),
        this._nextConnectMs,
      );
    }
  };

/**
 * @memberof FeedmeClient
 * @instance
 */
FeedmeClient.prototype._runPendingConnect = function _runPendingConnect() {
  this._pendingConnectTimer = null;

  this._coordinator.connect(); // Intentionally cascade TransportError - will be uncaught

  // Present connecting immediately so the app does not think it can
  // still cancel the pending connect attempt
  this._outwardState = ClientState.CONNECTING;
  this.emit("connecting");
};

/**
 * @memberof FeedmeClient
 * @instance
 */
FeedmeClient.prototype._cancelPendingConnect =
  function _cancelPendingConnect() {
    if (this._pendingConnectTimer) {
      clearTimeout(this._pendingConnectTimer);
      this._pendingConnectTimer = null;
    }
    this._nextConnectMs = -1;
  };

/**
 * Increment the number of reconnects (i.e. length of _reconnectTimers) if
 * configured to have a limit. Schedule decrement in options.reconnectMaxMs.
 * @memberof FeedmeClient
 * @instance
 */
FeedmeClient.prototype._incrementReconnects = function _incrementReconnects() {
  if (this._options.reconnectMax > 0) {
    const timer = setTimeout(() => {
      this._reconnectTimers.delete(timer); // Decrement length
    }, this._options.reconnectMaxMs);
    this._reconnectTimers.add(timer); // Increment length
  }
};

/**
 * Clear and delete all reconnect timers. Reconnect count goes back to zero.
 * @memberof FeedmeClient
 * @instance
 */
FeedmeClient.prototype._clearReconnects = function _clearReconnects() {
  this._reconnectTimers.forEach(clearTimeout);
  this._reconnectTimers.clear();
};

// Exports

export default FeedmeClient;
