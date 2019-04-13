import check from "check-types";
import emitter from "component-emitter";
import _each from "lodash/each";
import _cloneDeep from "lodash/cloneDeep";
import debug from "debug";
import deltaWriter from "feedme-util/deltawriter";
import md5Calculator from "feedme-util/md5calculator";
import feedSerializer from "feedme-util/feedserializer";
import messageParser from "./messageparser";

const dbg = debug("feedme-client:session");

const proto = {};
emitter(proto);

/**
 * Hard-coded configuration.
 * @memberof session
 * @static
 */
const config = {
  specVersion: "0.1"
};

/**
 * Factory function.
 * @param {object} transportWrapper
 * @returns {session}
 */
export default function sessionFactory(transportWrapper) {
  /**
   * API for a Feedme conversation with the server.
   *
   * - Assures a spec-compliant sequence of messages to the server
   * - Keeps track of the server feed states
   * - Transparently handles the handshake
   * - Applies feed deltas and performs hash verification
   * - Extremely patient - no timeouts
   *
   * @extends emitter
   */
  const session = Object.create(proto);

  dbg("Initializing session object");

  /**
   * Transport used to communicate with the server.
   * @memberof session
   * @instance
   * @private
   * @type {object}
   */
  session._transportWrapper = transportWrapper;

  /**
   * Server-assigned client id. Null until after a handshake.
   * @memberof session
   * @instance
   * @private
   * @type {?string}
   */
  session._clientId = null;

  /**
   * Feed state, as per the spec:
   *    (missing)     Closed        None exist
   *    'opening'     Opening       _feedOpenCallback exists
   *    'open'        Open          _feedData exists
   *    'closing'     Closing       _feedCloseCallbacks exists
   *    'terminated'  Terminated    _feedCloseCallbacks exists
   * @memberof session
   * @instance
   * @private
   * @type {object}
   */
  session._feedStates = {};

  /**
   * Callbacks for .action() calls awaiting a response from the server.
   * Indexed by internally-generated callback id, which is round-tripped to
   * the server.
   * @memberof session
   * @instance
   * @private
   * @type {object}
   */
  session._actionCallbacks = {};

  /**
   * The next action callback id to use. Incremented on action.
   * @memberof session
   * @instance
   * @private
   * @type {number}
   */
  session._nextActionCallbackId = 1;

  /**
   * Callbacks for .feedOpen() calls awaiting a response from the server.
   * Indexed by feed serial.
   * @memberof session
   * @instance
   * @private
   * @type {object}
   */
  session._feedOpenCallbacks = {};

  /**
   * Feed data for open feeds.
   * Indexed by feed serial.
   * @memberof session
   * @instance
   * @private
   * @type {object}
   */
  session._feedData = {};

  /**
   * Callbacks for .feedClose() calls awaiting a response from the server.
   * Indexed by feed serial.
   * @memberof session
   * @instance
   * @private
   * @type {object}
   */
  session._feedCloseCallbacks = {};

  // Listen for transport events
  session._transportWrapper.on("connecting", () => {
    session._processTransportConnecting();
  });
  session._transportWrapper.on("connect", () => {
    session._processTransportConnect();
  });
  session._transportWrapper.on("message", msg => {
    session._processTransportMessage(msg);
  });
  session._transportWrapper.on("disconnect", err => {
    session._processTransportDisconnect(err); // err missing if requested
  });
  session._transportWrapper.on("transportError", err => {
    session._processTransportError(err);
  });

  return session;
}

// Events

/**
 * Pass-through for transport event.
 * @event connecting
 * @memberof session
 * @instance
 */

/**
 * Emitted after a transport connection has been established and a handshake
 * has been completed successfully.
 * @event connect
 * @memberof session
 * @instance
 */

/**
 * Emitted on:
 * - Outside calls to .disconnect()
 * - Failure to establish a transport connection
 * - Server rejection of the handshake
 * - Unexpected failure of the tranport connection once connected
 *
 * All waiting callbacks are fired on disconnect
 * - actionCallbacks and feedOpenCallbacks are called with error DISCONNECTED
 * - feedCloseCallbacks are called with no error
 * @event disconnect
 * @memberof session
 * @instance
 * @param {?Error} err If not present then the event resulted from an
 *                     explicit session.disconnect()
 *
 *                     If present, then the event may have resulted from an
 *                     explicit call to session.disconnect(err), in which case
 *                     the error is outside-determined.
 *
 *                     Error('HANDSHAKE_REJECTED: ...')
 *
 *                     Error('DISCONNECTED: ...')     (from the transport)
 */

/**
 * Emitted when a compliant ActionRevelation message is received.
 * If a feed referenced by an ActionRevelation is closing then there is no emission.
 * @event actionRevelation
 * @memberof session
 * @instance
 * @param {string} feedName
 * @param {object} feedArgs
 * @param {string} actionName
 * @param {object} actionData
 * @param {object} newFeedData Frozen
 * @param {object} oldFeedData Frozen
 */

/**
 * Emitted when a feed state becomes closing for any reason other than
 * a call to feedClose().
 *
 * An unexpectedFeedClosed event is always fired subsequent to this one.
 *
 * Fired when:
 *
 * - A FeedTermination message references an open feed. In this case,
 *   unexpectedFeedClosed is fired immediately as well. If a FeedTermination
 *   message references a feed that is closing, then there is no
 *   unexpectedFeedClosing/Closed emission and the feedClose() callback
 *   is fired when the FeedCloseResponse message is received.
 *
 * - An invalid ActionRevelation is is received (delta or hash problem).
 *   In this case, unexpectedFeedClosed is fired when FeedCloseResponse is
 *   received (can't re-open yet). The server has violated the spec, so
 *   badServerMessage is also emitted.
 *
 * - The transport disconnects, either desired or undesired. In this case,
 *   unexpectedFeedClosed is fired immediately as well.
 *
 * @event unexpectedFeedClosing
 * @memberof session
 * @instance
 * @param {string} feedName
 * @param {object} feedArgs
 * @param {Error} err Error("TERMINATED: ...")
 *
 *                      err.serverErrorCode (string)
 *                      err.serverErrorData (object)
 *
 *                    Error("BAD_ACTION_REVELATION: ...")
 *
 *                    Error("DISCONNECTED: ...")
 */

/**
 * Emitted when a feed's state becomes closed for any reason other than a call
 * to feedClose(). Indicates that the feed can now be reopened.
 *
 * An unexpectedFeedClosing event is always fired prior to this one. The
 * various situations that give rise to these events are documented there.
 *
 * @event unexpectedFeedClosed
 * @memberof session
 * @instance
 * @param {string} feedName
 * @param {object} feedArgs
 * @param {Error} err Error("TERMINATED: ...")
 *
 *                      err.serverErrorCode (string)
 *                      err.serverErrorData (object)
 *
 *                    Error("BAD_ACTION_REVELATION: ...")
 *
 *                    Error("DISCONNECTED: ...")
 */

/**
 * Emitted when the server appears to have violated the specification.
 * Non-compliant messages from the server are discarded - they do not affect
 * the state of the conversation.
 * @event badServerMessage
 * @memberof session
 * @instance
 * @param {Error} err Error('INVALID_MESSAGE: ...')
 *
 *                      The server transmitted a message that is not valid JSON
 *                      or that violates a schema
 *
 *                      err.serverMessage (string)
 *                      err.parseError (object)
 *
 *                    Error('UNEXPECTED_MESSAGE: ...')
 *
 *                      The server transmitted one of the following:
 *
 *                        - HandshakeResponse unexpected
 *                        - ActionResponse referencing an unrecognized callback id
 *                        - FeedOpenResponse referencing a feed not understood to be opening
 *                        - FeedCloseResponse referencing a feed not understood to be closing or terminated
 *                        - ActionRevelation referencing a feed not understood to be open
 *                        - FeedTermination referencing a feed not understood to be open
 *
 *                      err.serverMessage (object)
 *
 *                    Error('INVALID_DELTA: ...')
 *
 *                      The server transmitted an invalid feed delta.
 *                      Since the feed must now be closed, a sequence of
 *                      unexpectedFeedClosing and unexpectedFeedClosed events
 *                      is also emitted. The feed state becomes closing.
 *
 *                      err.serverMessage (object)
 *                      err.deltaError (object)
 *
 *                    Error('INVALID_HASH: ...')
 *
 *                      The server transmitted an invalid feed data hash.
 *                      Since the feed must now be closed, a sequence of
 *                      unexpectedFeedClosing and unexpectedFeedClosed events
 *                      is also emitted. The feed state becomes closing.
 *
 *                      err.serverMessage (object)
 */

/**
 * Emitted when the server transmits a ViolationResponse message indicating
 * that the client has violated the specification. This can occur due to a
 * problem on either the client or the server. If the session object is
 * operating as intended, these events should only arise due to problems on
 * the server.
 * @event badClientMessage
 * @memberof session
 * @instance
 * @param {Object} diagnostics Server-reported debugging information
 */

/**
 * Relayed from the transportWrapper when the transport violates
 * the prescribed behavior.
 * @event transportError
 * @memberof session
 * @instance
 * @param {Error} err Passed from wrapper
 */

// Callbacks

/**
 * @callback actionCallback
 * @memberof session
 * @param {?Error} err If not present then the action was invoked successfully.
 *
 *                     Error('DISCONNNECTED: ...')
 *
 *                     Error('REJECTED: ...')
 *
 *                         err.serverErrorCode (string)
 *                         err.serverErrorData (object)
 *
 * @param {?object} actionData
 */

/**
 * @callback feedOpenCallback
 * @memberof session
 * @param {?Error} err If not present then the feed was opened successfully.
 *
 *                     Error('DISCONNNECTED: ...')
 *
 *                     Error('REJECTED: ...')
 *
 *                         err.serverErrorCode (string)
 *                         err.serverErrorData (object)
 *
 * @param {?object} feedData Frozen
 */

/**
 * Always invoked without arguments.
 * @callback feedCloseCallback
 * @memberof session
 */

// Public functions

/**
 * Returns the session state, which is the same as the transport state except
 * connecting through the handshake.
 * @memberof session
 * @instance
 * @returns {string} 'disconnected', 'connecting', or 'connected'
 */
proto.state = function state() {
  dbg("State requested");

  const transportState = this._transportWrapper.state();
  if (transportState === "connected" && this._clientId === null) {
    return "connecting";
  }
  return transportState;
};

/**
 * Connects to the server via the transport.
 *
 * When the transport has connected, a handshake will be attempted internally
 * before a session "connected" event is emitted.
 * @memberof session
 * @instance
 * @throws {Error} 'INVALID_STATE: ...'
 */
proto.connect = function connect() {
  dbg("Connect requested");

  // Error if session is not disconnected
  if (this.state() !== "disconnected") {
    throw new Error("INVALID_STATE: Already connecting or connected.");
  }

  this._transportWrapper.connect(); // Transport events fire session events
};

/**
 * Disconnects from the server, passing along an error if provided.
 *
 * If called with an error, then that error is passed to the transport
 * and emitted with its disconnect event.
 * @memberof session
 * @instance
 * @throws {Error} 'INVALID_STATE: ...'
 */
proto.disconnect = function disconnect(err) {
  dbg("Disconnect requested");

  // Error if state is already disconnected (connecting/connected ok)
  if (this.state() === "disconnected") {
    throw new Error("INVALID_STATE: Already disconnected.");
  }

  // Call transport disconnect with correct number of events
  // Transport events fire session events
  if (err) {
    this._transportWrapper.disconnect(err);
  } else {
    this._transportWrapper.disconnect();
  }
};

/**
 * Returns the client id assigned by the server.
 * @memberof session
 * @instance
 * @returns {string}
 * @throws {Error} 'INVALID_STATE: ...'
 */
proto.id = function id() {
  dbg("Client id requested");

  // Transport connected and handshake complete?
  if (this.state() !== "connected") {
    throw new Error("INVALID_STATE: Not connected.");
  }

  return this._clientId;
};

/**
 * Performs an action on the server.
 *
 * A callback is guaranteed - on disconnect at the latest.
 * @memberof session
 * @instance
 * @param {string} name
 * @param {object} args
 * @param {actionCallback} cb
 * @throws {Error} 'INVALID_ARGUMENT: ...'
 * @throws {Error} 'INVALID_STATE: ...'
 */

proto.action = function action(name, args, cb) {
  dbg("Action requested");

  // Check name
  if (!check.nonEmptyString(name)) {
    throw new Error("INVALID_ARGUMENT: Invalid action name.");
  }

  // Check args
  if (!check.object(args)) {
    throw new Error("INVALID_ARGUMENT: Invalid action arguments object.");
  }

  // Check cb
  if (!check.function(cb)) {
    throw new Error("INVALID_ARGUMENT: Invalid callback.");
  }

  // Transport connected and handshake complete?
  if (this.state() !== "connected") {
    throw new Error("INVALID_STATE: Not connected.");
  }

  // Generate a unique callback id
  const callbackId = String(this._nextActionCallbackId);
  this._nextActionCallbackId += 1;

  // Save the callback function by its id
  this._actionCallbacks[callbackId] = cb;

  // Message the server
  this._transportWrapper.send(
    JSON.stringify({
      MessageType: "Action",
      ActionName: name,
      ActionArgs: args,
      CallbackId: callbackId
    })
  );
};

/**
 * Opens a feed on the server.
 *
 * A callback is guaranteed - on disconnect at the latest.
 *
 * If the feed is opened successfully then any subsequent failure, other than
 * from an explicit call to feedClose(), will result in a a sequence of
 * unexpectedFeedClosing/Closed events being emitted. This occurs on feed
 * termination, bad action revelation, and disconnect.
 * @memberof session
 * @instance
 * @param {string} feedName
 * @param {object} feedArgs
 * @param {feedOpenCallback} cb
 * @throws {Error} 'INVALID_ARGUMENT: ...'
 * @throws {Error} 'INVALID_STATE: ...'
 * @throws {Error} 'INVALID_FEED_STATE: ...'
 */
proto.feedOpen = function feedOpen(feedName, feedArgs, cb) {
  dbg("Feed open requested");

  // Check arguments and relay errors
  this._feedValidate(feedName, feedArgs);

  // Check cb
  if (!check.function(cb)) {
    throw new Error("INVALID_ARGUMENT: Invalid callback.");
  }

  // Check session state
  if (this.state() !== "connected") {
    throw new Error("INVALID_STATE: Not connected.");
  }

  // Check feed state
  if (this._feedState(feedName, feedArgs) !== "closed") {
    throw new Error("INVALID_FEED_STATE: Feed is not closed.");
  }

  // Save the callback
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  this._feedStates[feedSerial] = "opening";
  this._feedOpenCallbacks[feedSerial] = cb;

  // Message the server
  this._transportWrapper.send(
    JSON.stringify({
      MessageType: "FeedOpen",
      FeedName: feedName,
      FeedArgs: feedArgs
    })
  );
};

/**
 * Closes a feed on the server.
 *
 * A callback is guaranteed - on disconnect at the latest.
 *
 * If a FeedTermination is received before the FeedCloseResponse, then the
 * FeedCloseResponse is awaited and the callback is fired upon receipt. In that
 * case, no unexpectedFeedClosing/Closed is emitted and the feed state
 * becomes "terminated".
 * @memberof session
 * @instance
 * @param {string} feedName
 * @param {object} feedArgs
 * @param {feedCloseCallback} cb
 * @throws {Error} 'INVALID_ARGUMENT: ...'
 * @throws {Error} 'INVALID_STATE: ...'
 * @throws {Error} 'INVALID_FEED_STATE: ...'
 */
proto.feedClose = function feedClose(feedName, feedArgs, cb) {
  dbg("Feed close requested");

  // Check arguments and relay errors
  this._feedValidate(feedName, feedArgs);

  // Check cb
  if (!check.function(cb)) {
    throw new Error("INVALID_ARGUMENT: Invalid callback.");
  }

  // Check session state
  if (this.state() !== "connected") {
    throw new Error("INVALID_STATE: Not connected.");
  }

  // Check feed state
  if (this._feedState(feedName, feedArgs) !== "open") {
    throw new Error("INVALID_FEED_STATE: Feed is not open.");
  }

  // Delete the data and save the callback
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  this._feedStates[feedSerial] = "closing";
  delete this._feedData[feedSerial];
  this._feedCloseCallbacks[feedSerial] = cb;

  // Message the server
  this._transportWrapper.send(
    JSON.stringify({
      MessageType: "FeedClose",
      FeedName: feedName,
      FeedArgs: feedArgs
    })
  );
};

/**
 * Returns the state of a server feed. Can only be called when the
 * session is connected.
 *
 * If the spec-defined state of the feed is "terminated" (as indicated
 * by ._feedStates) then "closing" is returned. In this case, feedClose() has
 * been called and a FeedTermination message was received before the
 * FeedCloseResponse. The outside code already understands the feed to be
 * closing, so the FeedCloseResponse is awaited and the callback passed to
 * feedClose() is invoked upon receipt as usual. The outside code never knows
 * that the feed was terminated and doesn't care.
 *
 * Because of the above mapping, this must not be used to retrieve state
 * internally. Use ._feedState() instead.
 * @memberof session
 * @instance
 * @private
 * @param {string} feedName
 * @param {object} feedArgs
 * @returns {string} 'opening', 'open', 'closing', or 'closed'
 * @throws {Error} 'INVALID_ARGUMENT: ...'
 * @throws {Error} 'INVALID_STATE: ...'
 */
proto.feedState = function feedState(feedName, feedArgs) {
  dbg("Feed state requested");

  // Check arguments and relay errors
  this._feedValidate(feedName, feedArgs);

  // Transport connected and handshake complete?
  if (this.state() !== "connected") {
    throw new Error("INVALID_STATE: Not connected.");
  }

  // Return
  const state = this._feedState(feedName, feedArgs);
  if (state === "terminated") {
    return "closing";
  }
  return state;
};

/**
 * Returns the feed data. Can only be called when the session is connected
 * and the feed is open.
 *
 * An INVALID_STATE error is thrown if the feed is closing. It may be closing
 * due to a bad action revelation, in which case the feed data is unknown.
 * @memberof session
 * @instance
 * @private
 * @param {string} feedName
 * @param {object} feedArgs
 * @returns {object} Frozen
 * @throws {Error} 'INVALID_ARGUMENT: ...'
 * @throws {Error} 'INVALID_STATE: ...'
 * @throws {Error} 'INVALID_FEED_STATE: ...'
 */
proto.feedData = function feedData(feedName, feedArgs) {
  dbg("Feed data requested");

  // Check arguments and relay errors
  this._feedValidate(feedName, feedArgs);

  // Transport connected and handshake complete?
  if (this.state() !== "connected") {
    throw new Error("INVALID_STATE: Not connected.");
  }

  // Is the feed open?
  if (this._feedState(feedName, feedArgs) !== "open") {
    throw new Error("INVALID_FEED_STATE: Feed is not open.");
  }

  // Return
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  return Object.freeze(this._feedData[feedSerial]);
};

// Transport event handlers

/**
 * Pass-through from transport connecting event.
 * @memberof session
 * @instance
 * @private
 */
proto._processTransportConnecting = function _processTransportConnecting() {
  dbg("Observed transport connecting event");

  this.emit("connecting");
};

/**
 * Processes a transport connect event. Initiates handshake and emits nothing.
 * @memberof session
 * @instance
 * @private
 */
proto._processTransportConnect = function _processTransportConnect() {
  dbg("Observed transport connect event");

  // Initiate a handshake - transport is 'connected', session is 'connecting'
  this._transportWrapper.send(
    JSON.stringify({
      MessageType: "Handshake",
      Version: config.specVersion
    })
  );
};

/**
 * Processes a transport disconnect event by resetting state and informing
 * outside code via callbacks and events.
 *
 * Cases:
 *
 * - If the transport indicates no error, then the disconnect was requested
 *
 *      - A disconnect event is emitted with no error
 *      - Outstanding .action() and .feedOpen() callbacks receive a DISCONNECTED error
 *        There will be none if never connected
 *      - For each open feed, an unexpectedFeedClosing/Close sequence is emitted
 *        There will be none if never connected
 *
 * - If the transport indicates a HANDSHAKE_REJECTED error, then a failed
 *   handshake caused the session to explicitly disconnect the transport
 *
 *      - A disconnect event is emitted with the HANDSHAKE_REJECTED error
 *      - There will be no outstanding action() and .feedOpen() callbacks
 *      - There will be no open feeds
 *
 * - If the transport indicates any other error, then the transport failed internally
 *
 *      - A disconnect event is emitted with a DISCONNECTED error
 *      - Outstanding .action() and .feedOpen() callbacks receive a DISCONNECTED error
 *      - For each open feed, an unexpectedFeedClosing/Close sequence is emitted
 *
 * @memberof session
 * @instance
 * @private
 * @param {?Error} err Error passed by the transport
 */
proto._processTransportDisconnect = function _processTransportDisconnect(err) {
  dbg("Observed transport disconnect event");

  // Save the current session state as needed below
  const actionCallbacks = this._actionCallbacks;
  const feedStates = this._feedStates;
  const feedOpenCallbacks = this._feedOpenCallbacks;
  const feedCloseCallbacks = this._feedCloseCallbacks;

  // Reset session state
  this._clientId = null;
  this._nextActionCallbackId = 1;
  this._actionCallbacks = {};
  this._feedStates = {};
  this._feedOpenCallbacks = {};
  this._feedData = {};
  this._feedCloseCallbacks = {};

  const cbErr = new Error("DISCONNECTED: The transport disconnected."); // err may not exist

  // Send action callbacks an error
  _each(actionCallbacks, val => {
    val(cbErr);
  });

  // For each feed, emit or callback according to state
  _each(feedStates, (feedState, feedSerial) => {
    if (feedState === "opening") {
      feedOpenCallbacks[feedSerial](err); // Error
    } else if (feedState === "open") {
      const { feedName, feedArgs } = feedSerializer.unserialize(feedSerial);
      this.emit("unexpectedFeedClosing", feedName, feedArgs, cbErr);
      this.emit("unexpectedFeedClosed", feedName, feedArgs, cbErr);
    } else {
      feedCloseCallbacks[feedSerial](); // Success (closing or terminated)
    }
  });

  // Emit disconnect event with correct number of arguments
  if (err) {
    this.emit("disconnect", err);
  } else {
    this.emit("disconnect");
  }
};

/**
 * Processes a transport transportError event - relay to outside.
 * @memberof session
 * @instance
 * @private
 * @param {Error} err
 */
proto._processTransportError = function _processTransportError(err) {
  dbg("Observed transport transportError event");

  this.emit("transportError", err);
};

/**
 * Processes a transport message event.
 * @memberof session
 * @instance
 * @private
 * @param {string} msg
 */
proto._processTransportMessage = function _processTransportMessage(msg) {
  dbg("Observed transport message event");

  // Try to parse the message
  let obj;
  try {
    obj = messageParser.parse(msg);
  } catch (e) {
    const err = new Error("INVALID_MESSAGE: Invalid JSON or schema violation.");
    err.serverMessage = msg; // string
    err.parseError = e;
    this.emit("badServerMessage", err);
    return; // Stop
  }

  // Route to the appropriate message handler
  this[`_process${obj.MessageType}`](obj);
};

// Feedme message handlers

/**
 * Processes a ViolationResponse from the server.
 * @memberof session
 * @instance
 * @private
 * @param {object} msg Schema-valid message object.
 */
proto._processViolationResponse = function _processViolationResponse(msg) {
  dbg("Received ViolationResponse message");

  this.emit("badClientMessage", msg.Diagnostics);
};

/**
 * Processes a HandshakeResponse from the server.
 * @memberof session
 * @instance
 * @private
 * @param {object} msg Schema-valid message object.
 */
proto._processHandshakeResponse = function _processHandshakeResponse(msg) {
  dbg("Received HandshakeResponse message");

  // Is a handshake response expected?
  if (this.state() !== "connecting") {
    const err = new Error("UNEXPECTED_MESSAGE: Unexpected HandshakeResponse.");
    err.serverMessage = msg;
    this.emit("badServerMessage", err);
    return; // Stop
  }

  // Was the handshake successful?
  if (msg.Success) {
    this._clientId = msg.ClientId;
    this.emit("connect");
  } else {
    // Disconnect event fired via the transport, which is required to relay the error argument
    this._transportWrapper.disconnect(
      new Error("HANDSHAKE_REJECTED: The server rejected the handshake.")
    );
  }
};

/**
 * Processes an ActionResponse from the server.
 * @memberof session
 * @instance
 * @private
 * @param {object} msg Schema-valid message object.
 */
proto._processActionResponse = function _processActionResponse(msg) {
  dbg("Received ActionResponse message");

  const actionCallback = this._actionCallbacks[msg.CallbackId];

  // Is this action response expected?
  if (!actionCallback) {
    const err = new Error("UNEXPECTED_MESSAGE: Unexpected ActionResponse.");
    err.serverMessage = msg;
    this.emit("badServerMessage", err);
    return; // Stop
  }

  // Clear the callback
  delete this._actionCallbacks[msg.CallbackId];

  // Call back the action result
  if (msg.Success) {
    actionCallback(undefined, Object.freeze(msg.ActionData));
  } else {
    const err = new Error("REJECTED: Server rejected the action request.");
    err.serverErrorCode = msg.ErrorCode;
    err.serverErrorData = msg.ErrorData;
    actionCallback(err);
  }
};

/**
 * Processes a FeedOpenResponse from the server.
 * @memberof session
 * @instance
 * @private
 * @param {object} msg Schema-valid message object.
 */
proto._processFeedOpenResponse = function _processFeedOpenResponse(msg) {
  dbg("Received FeedOpenResponse message");

  const feedSerial = feedSerializer.serialize(msg.FeedName, msg.FeedArgs);

  // Is the feed understood to be opening?
  if (this._feedState(msg.FeedName, msg.FeedArgs) !== "opening") {
    const err = new Error("UNEXPECTED_MESSAGE: Unexpected FeedOpenResponse.");
    err.serverMessage = msg;
    this.emit("badServerMessage", err);
    return; // Stop
  }

  // Save and clear the callback
  const feedOpenCallback = this._feedOpenCallbacks[feedSerial];
  delete this._feedOpenCallbacks[feedSerial];

  // Update the state and call the callback
  if (msg.Success) {
    this._feedStates[feedSerial] = "open";
    this._feedData[feedSerial] = msg.FeedData;
    feedOpenCallback(undefined, msg.FeedData);
  } else {
    delete this._feedStates[feedSerial]; // Closed
    const err = new Error("REJECTED: Server rejected the feed open request.");
    err.serverErrorCode = msg.ErrorCode;
    err.serverErrorData = msg.ErrorData;
    feedOpenCallback(err);
  }
};

/**
 * Processes a FeedCloseResponse from the server.
 *
 * The .feedClose() callback is fired even if a FeedTermination message
 * was received since transmitting the FeedClose. In that case the spec-defined
 * feed state is currently "terminated". The feed state becomes "closed", as
 * in the normal case where no intervening FeedTermination is received.
 * @memberof session
 * @instance
 * @private
 * @param {object} msg Schema-valid message object.
 */
proto._processFeedCloseResponse = function _processFeedCloseResponse(msg) {
  dbg("Received FeedCloseResponse message");

  const feedSerial = feedSerializer.serialize(msg.FeedName, msg.FeedArgs);

  // Is the feed closing or terminated?
  const feedState = this._feedState(msg.FeedName, msg.FeedArgs);
  if (feedState !== "closing" && feedState !== "terminated") {
    const err = new Error("UNEXPECTED_MESSAGE: Unexpected FeedCloseResponse.");
    err.serverMessage = msg;
    this.emit("badServerMessage", err);
    return; // Stop
  }

  // Save and clear the callback
  const feedCloseCallback = this._feedCloseCallbacks[feedSerial];
  delete this._feedStates[feedSerial];

  // Udpate the state and call the callback
  delete this._feedCloseCallbacks[feedSerial];
  feedCloseCallback();
};

/**
 * Processes an ActionRevelation from the server.
 *
 * If the feed state is closing then the server has not violated the
 * spec, but you need to discard the message because you may not have the
 * feed data (in the case of previous bad delta/hash).
 * @memberof session
 * @instance
 * @private
 * @param {object} msg Schema-valid message object.
 */
proto._processActionRevelation = function _processActionRevelation(msg) {
  dbg("Received ActionRevelation message");

  const feedSerial = feedSerializer.serialize(msg.FeedName, msg.FeedArgs);

  // Is the feed open or closing?
  const feedState = this._feedState(msg.FeedName, msg.FeedArgs);
  if (feedState !== "open" && feedState !== "closing") {
    const err = new Error("UNEXPECTED_MESSAGE: Unexpected ActionRevelation.");
    err.serverMessage = msg;
    this.emit("badServerMessage", err);
    return; // Stop
  }

  // Discard if the feed is closing
  if (feedState === "closing") {
    dbg("Discarding ActionRevelation message referencing closing feed.");
    return;
  }

  // Keep a reference to the pre-delta feed data
  const oldData = this._feedData[feedSerial]; // No need to clone - being discarded

  // Try to apply any deltas to a clone of the pre-delta feed data
  let newData = _cloneDeep(oldData);
  for (let i = 0; i < msg.FeedDeltas.length; i += 1) {
    try {
      newData = deltaWriter.apply(newData, msg.FeedDeltas[i]);
    } catch (e) {
      const unexpError = new Error(
        "BAD_ACTION_REVELATION: The server passed an invalid feed delta."
      );

      // Close the feed and emit closed on completion
      this.feedClose(msg.FeedName, msg.FeedArgs, () => {
        this.emit(
          "unexpectedFeedClosed",
          msg.FeedName,
          msg.FeedArgs,
          unexpError
        );
      });

      // Emit unexpectedFeedClosing
      this.emit(
        "unexpectedFeedClosing",
        msg.FeedName,
        msg.FeedArgs,
        unexpError
      );

      // Emit badServerMessage
      const err = new Error(
        "INVALID_DELTA: Received ActionRevelation with contextually invalid feed delta."
      );
      err.deltaError = e;
      err.serverMessage = msg;
      this.emit("badServerMessage", err);

      return; // Stop
    }
  }

  // Validate new feed data against the hash, if provided
  if (msg.FeedMd5) {
    const newMd5 = md5Calculator.calculate(newData);
    if (newMd5 !== msg.FeedMd5) {
      const unexpError = new Error(
        "BAD_ACTION_REVELATION: Hash verification failed."
      );

      // Close the feed and emit closed on completion
      this.feedClose(msg.FeedName, msg.FeedArgs, () => {
        this.emit(
          "unexpectedFeedClosed",
          msg.FeedName,
          msg.FeedArgs,
          unexpError
        );
      });

      // Emit unexpectedFeedClosing
      this.emit(
        "unexpectedFeedClosing",
        msg.FeedName,
        msg.FeedArgs,
        unexpError
      );

      // Emit badServerMessage
      const err = new Error("INVALID_HASH: Feed data MD5 verification failed.");
      err.serverMessage = msg;
      this.emit("badServerMessage", err);

      return; // Stop
    }
  }

  // Update the feed data and freeze it
  this._feedData[feedSerial] = Object.freeze(newData);

  // Emit actionRevelation
  this.emit(
    "actionRevelation",
    msg.FeedName,
    msg.FeedArgs,
    msg.ActionName,
    msg.ActionData,
    newData,
    oldData
  );
};

/**
 * Processes a FeedTermination from the server.
 *
 * The feed could be either open or closing, where in the latter case the
 * client has already send a FeedClose message referencing the feed.
 *
 * - If the feed is open, its state becomes closed and an
 *   unexpectedFeedClosing/Closed sequence is immediately emitted.
 *
 * - If the feed is closing, its state becomes terminated. The client
 *   has already issued a call to feedClose() and will be receive a callback
 *   when FeedCloseResponse is received. The client never finds out about the
 *   termination.
 * @memberof session
 * @instance
 * @private
 * @param {object} msg Schema-valid message object.
 */
proto._processFeedTermination = function _processFeedTermination(msg) {
  dbg("Received FeedTermination message");

  const feedSerial = feedSerializer.serialize(msg.FeedName, msg.FeedArgs);

  // Is the feed open or closing?
  const feedState = this._feedState(msg.FeedName, msg.FeedArgs);
  if (feedState !== "open" && feedState !== "closing") {
    const err = new Error("UNEXPECTED_MESSAGE: Unexpected FeedTermination.");
    err.serverMessage = msg;
    this.emit("badServerMessage", err);
    return; // Stop
  }

  if (feedState === "open") {
    delete this._feedStates[feedSerial]; // Closed
    delete this._feedData[feedSerial];
    const err = new Error("TERMINATED: The server terminated the feed.");
    err.serverErrorCode = msg.ErrorCode;
    err.serverErrorData = msg.ErrorData;
    this.emit("unexpectedFeedClosing", msg.FeedName, msg.FeedArgs, err);
    this.emit("unexpectedFeedClosed", msg.FeedName, msg.FeedArgs, err);
  } else {
    this._feedStates[feedSerial] = "terminated";
    // Feed data deleted on feedClose()
  }
};

// Internal helper functions

/**
 * Validates feed arguments.
 * @memberof session
 * @instance
 * @param {string} feedName
 * @param {object} feedArgs
 * @throws {Error} 'INVALID_ARGUMENT: ...'
 */
proto._feedValidate = function _feedValidate(feedName, feedArgs) {
  // Check name
  if (!check.nonEmptyString(feedName)) {
    throw new Error("INVALID_ARGUMENT: Invalid feed name.");
  }

  // Check args
  if (!check.object(feedArgs)) {
    throw new Error("INVALID_ARGUMENT: Invalid feed arguments object.");
  }

  // Check args properties
  let valid = true;
  _each(feedArgs, val => {
    if (!check.string(val)) {
      valid = false;
    }
  });
  if (!valid) {
    throw new Error("INVALID_ARGUMENT: Invalid feed arguments object.");
  }
};

/**
 * Returns the spec-defined state of a feed. Differs from .feedState()
 * in that the latter maps "terminated" to "closed" for outside code.
 * @memberof session
 * @instance
 * @private
 * @param {string} feedName
 * @param {object} feedArgs
 * @returns 'closed', 'opening', 'open', 'closing', or 'terminated
 */
proto._feedState = function _feedState(name, args) {
  const serial = feedSerializer.serialize(name, args);
  return this._feedStates[serial] || "closed";
};
