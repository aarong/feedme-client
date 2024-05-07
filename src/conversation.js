import { EventEmitter } from "events";
import _cloneDeep from "lodash/cloneDeep";
import debug from "debug";
import deepFreeze from "deep-freeze";
import FeedNameArgs from "feedme-util/feednameargs";
import validateServerMessage from "feedme-util/validators/server-message";
import deltaWriter from "feedme-util/deltawriter";
import md5Calculator from "feedme-util/md5calculator";
import HarnessAsync from "./harness.async";
import { ClientState, FeedState } from "./states";
import {
  StateError,
  ConnectionError,
  HandshakeError,
  ServerMessageError,
  ResponseTimeoutError,
  ViolationResponseError,
} from "./errors";

const dbg = debug("feedme-client:conversation");

// Constructor

/**
 * Exposes a message-oriented API for conducting a spec-compliant Feedme
 * conversation through the transport.
 *
 * Internally synchronous but adopts the asynchronous behavior of HarnessAsync.
 *
 * Conversation state is identical to HarnessAsync state, except that it remains
 * connecting until a handshake is completed.
 *
 * One HarnessAsync invocation yields exactly one synchronous Conversation
 * invocation. API is therefore evented with no callbacks, which would be
 * problematic on disconnect.
 *
 * Same behavior on multiple connect() and disconnect() calls as HarnessAsync.
 * Extraneous calls are permitted and discarded.
 *
 * Features:
 *
 * - Assures a spec-compliant sequence of messages to and from the server
 *
 * - Implements transport connect and response timeouts
 *
 * - Transparently handles the handshake
 *
 * - Keeps track of server feed states
 *
 * - Applies feed deltas and performs hash verification
 *
 * - Suppresses feed action notifications after a call to feedClose()
 *
 * - Internalizes the terminated feed state by continuing to present the feed as
 *   closing if FeedTermination is received after FeedClose is sent
 *
 * - Incorporates all spec suggestions
 *
 * Although connection state does not change synchronously on method call,
 * feed state does, since there is no associated event:
 *
 *   - Feed state becomes opening on valid call to feedOpen()
 *   - Feed state becomes closing on valid call to feedClose()
 *
 * All object freezing takes place here. Incoming server messages are deep
 * frozen so that any emitted portion is frozen. Feed data is deep frozen after
 * being calculated from deltas.
 *
 * @constructor
 * @extends EventEmitter
 * @param {Object} transport
 * @param {Object} options Valid options object with defaults overlaid
 * @throws {TransportError}
 */
const Conversation = function Conversation(transport, options) {
  dbg("Initializing");

  const harnessAsync = new HarnessAsync(transport, options); // Intentionally cascade TransportError

  // Success

  EventEmitter.call(this);

  /**
   * @memberof Conversation
   * @instance
   * @type {Object}
   */
  this._options = options;

  /**
   * @memberof Conversation
   * @instance
   * @type {HarnessAsync}
   */
  this._harnessAsync = harnessAsync;

  /**
   * @memberof Conversation
   * @instance
   * @type {ClientState}
   */
  this._outwardState = ClientState.DISCONNECTED;

  /**
   * Outstanding action callback ids awaiting a response from the server.
   * @memberof Conversation
   * @instance
   * @type {Set}
   */
  this._actionCallbackIds = new Set();

  /**
   * Server feed states, as defined by the spec. Indexed by feed serial.
   *
   *    (missing)  -> Closed
   *    OPENING    -> Opening
   *    OPEN       -> Open
   *    CLOSING    -> Closing
   *    TERMINATED -> Terminated
   *
   * @memberof Conversation
   * @instance
   * @type {Object}
   */
  this._feedStates = {};

  /**
   * Feed data for open feeds, deep-frozen. Indexed by feed serial.
   * @memberof Conversation
   * @instance
   * @type {Object}
   */
  this._feedData = {};

  /**
   * Timer ids indexed by timer name.
   * @memberof Conversation
   * @instance
   * @type {Object}
   */
  this._timers = {};

  /**
   * Prototype methods bound to the instance for easy deferral.
   * @memberof Conversation
   * @instance
   * @type {Object}
   */
  this._bound = {
    _messageHandlers: {},
    _timeoutRun: this._timeoutRun.bind(this),
  };
  Object.entries(this._messageHandlers).forEach(([msgType, fn]) => {
    this._bound._messageHandlers[msgType] = fn.bind(this);
  });

  // Listen for transport events
  Object.entries(this._handlers).forEach(([evt, fn]) => {
    this._harnessAsync.on(evt, fn.bind(this));
  });
};

Conversation.prototype = Object.create(EventEmitter.prototype);
Conversation.prototype.constructor = Conversation;

// Static constants

/**
 * @static
 */
Conversation._FEEDME_SPEC_VERSION = "0.1";

/**
 * @static
 */
Conversation._CONNECT_TIMER_NAME = "CONNECT";

/**
 * @static
 */
Conversation._HANDSHAKE_TIMER_NAME = "HANDSHAKE";

/**
 * Used for both FeedOpen and FeedClose messages.
 * @static
 */
Conversation._FEED_TIMER_PREFIX = "FEED";

/**
 * @static
 */
Conversation._ACTION_TIMER_PREFIX = "ACTION";

// Event definitions

/**
 * Conversation state guaranteed to be connecting.
 * @event connecting
 * @memberof Conversation
 */

/**
 * Conversation state guaranteed to be connected. Handshake complete.
 * @event connect
 * @memberof Conversation
 */

/**
 * Conversation state guaranteed to be connected.
 * @event actionSuccess
 * @memberof Conversation
 * @param {string} actionCallbackId
 * @param {Object} actionData
 */

/**
 * Conversation state guaranteed to be connected.
 * @event actionFailure
 * @memberof Conversation
 * @param {string} actionCallbackId
 * @param {string} errorCode
 * @param {Object} errorData
 */

/**
 * Conversation state guaranteed to be connected.
 * Feed state guaranteed to be open.
 * @event feedOpenSuccess
 * @memberof Conversation
 * @param {FeedNameArgs} feedNameArgs
 * @param {Object} feedData
 */

/**
 * Conversation state guaranteed to be connected.
 * Feed state guaranteed to be closed.
 * @event feedOpenFailure
 * @memberof Conversation
 * @param {FeedNameArgs} feedNameArgs
 * @param {string} errorCode
 * @param {Object} errorData
 */

/**
 * Conversation state guaranteed to be connected.
 * Feed state guaranteed to be closed.
 * @event feedCloseSuccess
 * @memberof Conversation
 * @param {FeedNameArgs} feedNameArgs
 */

/**
 * Conversation state guaranteed to be connected.
 * Feed state guaranteed to be open.
 * @event feedAction
 * @memberof Conversation
 * @param {FeedNameArgs} feedNameArgs
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */

/**
 * Conversation state guaranteed to be connected.
 * Feed state guaranteed to be closed.
 * The terminated server feed state is internalized within this module.
 * If the server feed state is terminated (i.e. sent FeedClose and received
 * FeedTermination before FeedClosedResponse) then the module suppresses
 * the feedTermination event and emits only a feedCloseSuccess event once
 * FeedCloseResponse is received.
 * @event feedTermination
 * @memberof Conversation
 * @param {FeedNameArgs} feedNameArgs
 * @param {string} errorCode
 * @param {Object} errorData
 */

/**
 * Conversation state guaranteed to be disconnecting.
 * @event disconnecting
 * @memberof Conversation
 * @param {?(ConnectionError|HandshakeError|ResponseTimeoutError|ServerMessageError|ViolationResponseError|TransportError)} err
 */

/**
 * Conversation state guaranteed to be disconnected.
 * @event disconnect
 * @memberof Conversation
 */

/**
 * Conversation state guaranteed to be error.
 * @event error
 * @memberof Conversation
 * @param {TransportError} err
 */

// Public properties

/**
 * @name state
 * @memberof Conversation
 * @instance
 * @type {ClientState}
 */
Object.defineProperty(Conversation.prototype, "state", {
  enumerable: true,
  get() {
    dbg("Getting state");
    return this._outwardState;
  },
});

// Public methods

/**
 * @memberof Conversation
 * @instance
 * @throws {StateError|TransportError}
 */
Conversation.prototype.connect = function connect() {
  dbg("Running connect()");

  // Check state
  if (this._outwardState !== ClientState.DISCONNECTED) {
    throw new StateError("State must be disconnected.");
  }

  // If Conversation is disconnecteded then Harness is disconnected
  this._harnessAsync.connect(); // Intentionally cascade TransportError

  // The connect timeout timer is established in the connecting event handler,
  // because the Harness is only actionable at that point
};

/**
 * @memberof Conversation
 * @instance
 * @param {string} callbackId
 * @param {string} name
 * @param {Object} args
 * @throws {StateError|TransportError}
 */
Conversation.prototype.action = function action(callbackId, name, args) {
  dbg("Running action()");

  // Check state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("State must be connected.");
  }

  // Check if callback id is already in use
  if (this._actionCallbackIds.has(callbackId)) {
    throw new StateError(
      "Callback id already associated with a pending action.",
    );
  }

  // Transmit Action message
  // If Conversation is connected then Harness is connected
  const msg = {
    MessageType: "Action",
    ActionName: name,
    ActionArgs: args,
    CallbackId: callbackId,
  };
  this._harnessAsync.send(JSON.stringify(msg)); // Intentionally cascade TransportError

  // Save callback id
  this._actionCallbackIds.add(callbackId);

  // Set response timeout if so configured
  this._timeoutSet(
    `${Conversation._ACTION_TIMER_PREFIX}-${callbackId}`,
    this._options.responseTimeoutMs,
    msg,
  );
};

/**
 * Asks to open a feed on the server. Feed state synchronously becomes opening.
 * @memberof Conversation
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @throws {StateError|TransportError}
 */
Conversation.prototype.feedOpen = function feedOpen(feedNameArgs) {
  dbg("Running feedOpen()");

  // Check state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("State must be connected.");
  }

  // Check feed state
  if (this._feedState(feedNameArgs) !== FeedState.CLOSED) {
    throw new StateError("Feed state must be closed.");
  }

  // Transmit FeedOpen message
  // If Conversation is connected then Harness is connected
  const msg = {
    MessageType: "FeedOpen",
    FeedName: feedNameArgs.name(),
    FeedArgs: feedNameArgs.args(),
  };
  this._harnessAsync.send(JSON.stringify(msg)); // Intentionally cascade TransportError

  // Update feed state
  const feedSerial = feedNameArgs.serial();
  this._feedStates[feedSerial] = FeedState.OPENING;

  // Set response timeout if so configured
  this._timeoutSet(
    `${Conversation._FEED_TIMER_PREFIX}-${feedSerial}`,
    this._options.responseTimeoutMs,
    msg,
  );
};

/**
 * Closes a feed on the server. Feed state synchronously becomes closing.
 * @memberof Conversation
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @throws {StateError|TransportError}
 */
Conversation.prototype.feedClose = function feedClose(feedNameArgs) {
  dbg("Running feedClose()");

  // Check state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("State must be connected.");
  }

  // Check feed state
  if (this._feedState(feedNameArgs) !== FeedState.OPEN) {
    throw new StateError("Feed state must be open.");
  }

  // Transmit FeedClose message
  // If Conversation is connected then Harness is connected
  const msg = {
    MessageType: "FeedClose",
    FeedName: feedNameArgs.name(),
    FeedArgs: feedNameArgs.args(),
  };
  this._harnessAsync.send(JSON.stringify(msg)); // Intentionally cascade TransportError

  // Update feed state
  const feedSerial = feedNameArgs.serial();
  this._feedStates[feedSerial] = FeedState.CLOSING;
  delete this._feedData[feedSerial];

  // Set response timeout if so configured
  this._timeoutSet(
    `${Conversation._FEED_TIMER_PREFIX}-${feedSerial}`,
    this._options.responseTimeoutMs,
    msg,
  );
};

/**
 * Returns the state of a server feed. Can only be called when the Conversation
 * is connected, since a feed state of closed indicates that feedOpen() is a
 * valid call.
 *
 * If the server feed is terminated then this method returns closing in order
 * to internalize the terminated state. Use _feedState() internally for the
 * true server feed state.
 * @memberof Conversation
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @returns {FeedState}
 * @throws {StateError}
 */
Conversation.prototype.feedState = function feedState(feedNameArgs) {
  dbg("Running feedState()");

  // Check state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("State must be connected.");
  }

  // Return
  const state = this._feedState(feedNameArgs);
  return state === FeedState.TERMINATED ? FeedState.CLOSING : state;
};

/**
 * Returns the feed data. Can only be called when the Conversation is connected
 * and the feed is open.
 * @memberof Conversation
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @returns {Object} Frozen
 * @throws {StateError}
 */
Conversation.prototype.feedData = function feedData(feedNameArgs) {
  dbg("Running feedData()");

  // Check state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("State must be connected.");
  }

  // Check feed state
  if (this._feedState(feedNameArgs) !== FeedState.OPEN) {
    throw new StateError("Feed state must be open.");
  }

  // Return
  const feedSerial = feedNameArgs.serial();
  return this._feedData[feedSerial]; // Already frozen
};

/**
 * @memberof Conversation
 * @instance
 * @throws {StateError|TransportError}
 */
Conversation.prototype.disconnect = function disconnect() {
  dbg("Running disconnect()");

  // Check state
  if (
    this._outwardState !== ClientState.CONNECTING &&
    this._outwardState !== ClientState.CONNECTED
  ) {
    throw new StateError("State must be connecting or connected.");
  }

  // If Conversation is connecting/ed then Harness is connecting/ed (though perhaps not the same)
  this._disconnectAndClearTimers(); // Intentionally cascade TransportError
};

// Event handlers

Conversation.prototype._handlers = {};

/**
 * @name _handlers#connecting
 * @memberof Conversation
 * @instance
 */
Conversation.prototype._handlers.connecting = function _handlers$connecting() {
  dbg("Handling connecting");

  // Set connect timeout if so configured - Harness is now actionable
  this._timeoutSet(
    Conversation._CONNECT_TIMER_NAME,
    this._options.connectTimeoutMs,
  );

  // Update state and emit
  this._outwardState = ClientState.CONNECTING;
  this.emit("connecting");
};

/**
 * @name _handlers#connect
 * @memberof Conversation
 * @instance
 * @throws {TransportError}
 */
Conversation.prototype._handlers.connect = function _handlers$connect() {
  dbg("Handling connect");

  // Clear connect timeout if present
  this._timeoutClear(Conversation._CONNECT_TIMER_NAME);

  // Transmit Handshake message
  const msg = {
    MessageType: "Handshake",
    Versions: [Conversation._FEEDME_SPEC_VERSION],
  };
  this._harnessAsync.send(JSON.stringify(msg)); // Intentionally cascade TransportError

  // Set response timeout if so configured
  this._timeoutSet(
    Conversation._HANDSHAKE_TIMER_NAME,
    this._options.responseTimeoutMs,
    msg,
  );

  // Do not change state; emit nothing
  // Outward state remains connecting until handshake complete
};

/**
 * @name _handlers#message
 * @memberof Conversation
 * @instance
 * @param {string} msg
 * @throws {TransportError}
 */
Conversation.prototype._handlers.message = function _handlers$message(msg) {
  dbg("Handling message");

  // Parse JSON
  let parsedMsg;
  try {
    parsedMsg = JSON.parse(msg);
  } catch (e) {
    dbg("Invalid JSON - disconnecting");
    this._disconnectAndClearTimers(
      Object.assign(new ServerMessageError("Invalid JSON."), {
        serverMessage: msg, // string
        parseError: e,
      }),
    ); // Intentionally cascade TransportError
    return; // Stop
  }

  // Validate message against schemas
  // No need to check whether JSON-expressible - just parsed
  const schemaViolationMessage = validateServerMessage(parsedMsg, false);
  if (schemaViolationMessage) {
    dbg("Schema violation - disconnecting");
    this._disconnectAndClearTimers(
      Object.assign(new ServerMessageError("JSON Schema violation."), {
        serverMessage: parsedMsg, // JSON value
        schemaViolation: schemaViolationMessage,
      }),
    ); // Intentionally cascade TransportError
    return; // Stop
  }

  // Deep-freeze message and route to the appropriate handler
  // Message elements can never be changed, no matter where they are disseminated
  dbg("Routing to message handler");
  this._messageHandlers[parsedMsg.MessageType].call(
    this,
    deepFreeze(parsedMsg),
  ); // Intentionally cascade TransportError
};

/**
 * @name _handlers#disconnecting
 * @memberof Conversation
 * @instance
 * @param {?(ConnectionError|HandshakeError|ResponseTimeoutError|ServerMessageError|ViolationResponseError|TransportError)} err
 */
Conversation.prototype._handlers.disconnecting =
  function _handlers$disconnecting(err) {
    dbg("Handling disconnecting");

    // Clear all connect/response timers
    this._timeoutClear();

    // Update state and emit
    this._actionCallbackIds.clear();
    this._feedStates = {};
    this._feedData = {};
    this._outwardState = ClientState.DISCONNECTING;
    this.emit("disconnecting", err); // May be null
  };

/**
 * @name _handlers#disconnect
 * @memberof Conversation
 * @instance
 */
Conversation.prototype._handlers.disconnect = function _handlers$disconnect() {
  dbg("Handling disconnect");

  // Already reset state and cleared timers

  // Update state and emit
  this._outwardState = ClientState.DISCONNECTED;
  this.emit("disconnect");
};

/**
 * @name _handlers#error
 * @memberof Conversation
 * @instance
 * @param {TransportError} err
 */
Conversation.prototype._handlers.error = function _handlers$error(err) {
  dbg("Handling error");

  // Already reset state and cleared timers

  // Update state and emit
  this._outwardState = ClientState.ERROR;
  this.emit("error", err);
};

// Feedme message handlers - Harness state guaranteed to be connected

Conversation.prototype._messageHandlers = {};

/**
 * @name _messageHandlers#ViolationResponse
 * @memberof Conversation
 * @instance
 * @param {Object} msg Schema-valid and deep-frozen message object
 * @throws {TransportError}
 */
Conversation.prototype._messageHandlers.ViolationResponse =
  function _messageHandlers$ViolationResponse(msg) {
    dbg("Handling ViolationResponse");

    // Disconnect from the server
    this._disconnectAndClearTimers(
      Object.assign(
        new ViolationResponseError(
          "The server reported that the client violated the Feedme specification.",
        ),
        { serverDiagnostics: msg.Diagnostics },
      ),
    ); // Intentionally cascade TransportError
  };

/**
 * @name _messageHandlers#HandshakeResponse
 * @memberof Conversation
 * @instance
 * @param {Object} msg Schema-valid and deep-frozen message object
 * @throws {TransportError}
 */
Conversation.prototype._messageHandlers.HandshakeResponse =
  function _messageHandlers$HandshakeResponse(msg) {
    dbg("Handling HandshakeResponse");

    // Is the message expected?
    // The client attempts one Handshake and disconnects if it fails
    // So check for duplicates by verifying that outward state is still connecting
    if (this._outwardState !== ClientState.CONNECTING) {
      dbg("Unexpected - disconnecting");
      this._disconnectAndClearTimers(
        Object.assign(
          new ServerMessageError(
            "Invalid HandshakeResponse: Client conversation state is not Handshaking.",
          ),
          { serverMessage: msg },
        ),
      ); // Intentionally cascade TransportError
      return; // Stop
    }

    // Is the message reporting success?
    if (msg.Success) {
      // Is the version valid?
      if (msg.Version !== Conversation._FEEDME_SPEC_VERSION) {
        dbg("Invalid version - disconnecting");
        this._disconnectAndClearTimers(
          Object.assign(
            new ServerMessageError(
              "Invalid HandshakeResponse: Unrecognized Version.",
            ),
            { serverMessage: msg },
          ), // Intentionally cascade TransportError
        );
        return; // Stop
      }

      // Client conversation state is now Initiated

      // Clear response timeout
      this._timeoutClear(Conversation._HANDSHAKE_TIMER_NAME);

      dbg("Success - emitting");
      this._outwardState = ClientState.CONNECTED;
      this.emit("connect");
    } else {
      // Client conversation state is now Not Initiated

      // Do not attempt another Handshake despite being permitted by the spec
      dbg("Failure - disconnecting");
      this._disconnectAndClearTimers(
        new HandshakeError("The server indicated no mutual version support."),
      ); // Intentionally cascade TransportError
    }
  };

/**
 * @name _messageHandlers#ActionResponse
 * @memberof Conversation
 * @instance
 * @param {Object} msg Schema-valid and deep-frozen message object
 * @throws {TransportError}
 */
Conversation.prototype._messageHandlers.ActionResponse =
  function _messageHandlers$ActionResponse(msg) {
    dbg("Handling ActionResponse");

    // Is the message expected?
    if (!this._actionCallbackIds.has(msg.CallbackId)) {
      dbg("Unexpected - disconnecting");
      this._disconnectAndClearTimers(
        Object.assign(
          new ServerMessageError(
            "Invalid ActionResponse: Unrecognized CallbackId.",
          ),
          { serverMessage: msg },
        ),
      ); // Intentionally cascade TransportError
      return; // Stop
    }

    // Clear response timeout
    this._timeoutClear(
      `${Conversation._ACTION_TIMER_PREFIX}-${msg.CallbackId}`,
    );

    // Update state and emit
    this._actionCallbackIds.delete(msg.CallbackId);
    if (msg.Success) {
      dbg("Success - emitting");
      this.emit("actionSuccess", msg.CallbackId, msg.ActionData);
    } else {
      dbg("Failure - emitting");
      this.emit("actionFailure", msg.CallbackId, msg.ErrorCode, msg.ErrorData);
    }
  };

/**
 * @name _messageHandlers#FeedOpenResponse
 * @memberof Conversation
 * @instance
 * @param {Object} msg Schema-valid and deep-frozen message object
 * @throws {TransportError}
 */
Conversation.prototype._messageHandlers.FeedOpenResponse =
  function _messageHandlers$FeedOpenResponse(msg) {
    dbg("Handling FeedOpenResponse");

    const feedNameArgs = FeedNameArgs(msg.FeedName, msg.FeedArgs); // Guaranteed no error

    // Is the message expected?
    if (this._feedState(feedNameArgs) !== FeedState.OPENING) {
      dbg("Unexpected - disconnecting");
      this._disconnectAndClearTimers(
        Object.assign(
          new ServerMessageError(
            "Invalid FeedOpenResponse: Client feed state is not Opening.",
          ),
          { serverMessage: msg },
        ),
      ); // Intentionally cascade TransportError
      return; // Stop
    }

    // Clear response timeout timer
    const feedSerial = feedNameArgs.serial();
    this._timeoutClear(`${Conversation._FEED_TIMER_PREFIX}-${feedSerial}`);

    // Update state and emit
    if (msg.Success) {
      dbg("Success - emitting");
      this._feedStates[feedSerial] = FeedState.OPEN;
      this._feedData[feedSerial] = msg.FeedData; // Already frozen
      this.emit("feedOpenSuccess", feedNameArgs, msg.FeedData);
    } else {
      dbg("Failure - emitting");
      delete this._feedStates[feedSerial]; // Closed
      this.emit("feedOpenFailure", feedNameArgs, msg.ErrorCode, msg.ErrorData);
    }
  };

/**
 * The feedCloseSuccess event must be fired whether the feed state is closing or
 * terminated, since in the latter case, no feedTermination event would have
 * been emitted and the feed is still being presented to the outside as closing
 * in order to prevent any attempts to reopen. The feed state always becomes
 * closed here.
 * @name _messageHandlers#FeedCloseResponse
 * @memberof Conversation
 * @instance
 * @param {Object} msg Schema-valid and deep-frozen message object
 * @throws {TransportError}
 */
Conversation.prototype._messageHandlers.FeedCloseResponse =
  function _messageHandlers$FeedCloseResponse(msg) {
    dbg("Handling FeedCloseResponse");

    const feedNameArgs = FeedNameArgs(msg.FeedName, msg.FeedArgs); // Guaranteed no error

    // Is the message expected?
    const feedState = this._feedState(feedNameArgs);
    if (feedState !== FeedState.CLOSING && feedState !== FeedState.TERMINATED) {
      dbg("Unexpected - disconnecting");
      this._disconnectAndClearTimers(
        Object.assign(
          new ServerMessageError(
            "Invalid FeedCloseResponse: Client feed state is not Closing or Terminated.",
          ),
          { serverMessage: msg },
        ),
      ); // Intentionally cascade TransportError
      return; // Stop
    }

    // Clear response timeout timer
    const feedSerial = feedNameArgs.serial();
    this._timeoutClear(`${Conversation._FEED_TIMER_PREFIX}-${feedSerial}`);

    // Update state and emit
    dbg("Success - emitting");
    delete this._feedStates[feedSerial]; // Closed
    this.emit("feedCloseSuccess", feedNameArgs);
  };

/**
 * The feed state could be either open or closing. In the latter case discard
 * the message.
 * @name _messageHandlers#FeedAction
 * @memberof Conversation
 * @instance
 * @param {Object} msg Schema-valid and deep-frozen message object
 * @throws {TransportError}
 */
Conversation.prototype._messageHandlers.FeedAction =
  function _messageHandlers$FeedAction(msg) {
    dbg("Handling FeedAction");

    const feedNameArgs = FeedNameArgs(msg.FeedName, msg.FeedArgs); // Guaranteed no error

    // Is the message expected?
    const feedState = this._feedState(feedNameArgs);
    if (feedState !== FeedState.OPEN && feedState !== FeedState.CLOSING) {
      dbg("Unexpected - disconnecting");
      this._disconnectAndClearTimers(
        Object.assign(
          new ServerMessageError(
            "Invalid FeedAction: Client feed state is not Open or Closing.",
          ),
          { serverMessage: msg },
        ),
      ); // Intentionally cascade TransportError
      return; // Stop
    }

    // Discard if the feed is closing
    if (feedState === FeedState.CLOSING) {
      dbg("References closing feed - discarding");
      return; // Stop
    }

    // Keep a reference to the pre-delta feed data
    const feedSerial = feedNameArgs.serial();
    const oldData = this._feedData[feedSerial]; // No need to clone - being discarded; already frozen

    // Try to apply any deltas to a clone of the feed data
    let newData = _cloneDeep(oldData);
    for (let i = 0; i < msg.FeedDeltas.length; i += 1) {
      const result = deltaWriter.apply(newData, msg.FeedDeltas[i]);
      if (!result.valid) {
        dbg("Invalid delta - disconnecting");
        this._disconnectAndClearTimers(
          Object.assign(
            new ServerMessageError(
              "Invalid FeedAction: Invalid delta operation.",
            ),
            {
              serverMessage: msg,
              deltaViolation: result.reason, // string
              feedDelta: msg.FeedDeltas[i], // Object
              feedData: newData, // Object
            },
          ),
        ); // Intentionally cascade TransportError
        return; // Stop
      }
      newData = result.feedData;
    }
    newData = deepFreeze(newData);

    // Validate new feed data against the hash, if provided
    if (msg.FeedMd5) {
      const newMd5 = md5Calculator.calculate(newData);
      if (newMd5 !== msg.FeedMd5) {
        dbg("Hash mismatch - disconnecting");
        this._disconnectAndClearTimers(
          Object.assign(
            new ServerMessageError(
              "Invalid FeedAction: Feed data hash verification failure.",
            ),
            {
              serverMessage: msg,
              feedData: newData,
            },
          ),
        ); // Intentionally cascade TransportError
        return; // Stop
      }
    }

    // Update state and emit
    dbg("Success - emitting");
    this._feedData[feedSerial] = newData; // Already frozen
    this.emit(
      "feedAction",
      feedNameArgs,
      msg.ActionName,
      msg.ActionData,
      newData,
      oldData,
    );
  };

/**
 * The feed state could be either open or closing. In the latter case, the
 * client has already send a FeedClose message referencing the feed.
 *
 * - If the feed is open, its state becomes closed and feedTermination is
 *   emitted.
 *
 * - If the feed is closing, its state becomes terminated. Nothing is
 *   emitted and its outward state remains closing. A feedCloseSuccess event is
 *   emitted when the FeedCloseResponse message is received.
 *
 * @name _messageHandlers#FeedTermination
 * @memberof Conversation
 * @instance
 * @param {Object} msg Schema-valid and deep-frozen message object
 * @throws {TransportError}
 */
Conversation.prototype._messageHandlers.FeedTermination =
  function _messageHandlers$FeedTermination(msg) {
    dbg("Handling FeedTermination");

    const feedNameArgs = FeedNameArgs(msg.FeedName, msg.FeedArgs); // Guaranteed no error

    // Is the message expected?
    const feedState = this._feedState(feedNameArgs);
    if (feedState !== FeedState.OPEN && feedState !== FeedState.CLOSING) {
      dbg("Unexpected - disconnecting");
      this._disconnectAndClearTimers(
        Object.assign(
          new ServerMessageError(
            "Invalid FeedTermination: Client feed state is not Open or Closing.",
          ),
          { serverMessage: msg },
        ),
      ); // Intentionally cascade TransportError
      return; // Stop
    }

    // Update state and emit as required
    const feedSerial = feedNameArgs.serial();
    if (feedState === FeedState.OPEN) {
      dbg("Feed was open - emitting");
      delete this._feedStates[feedSerial]; // Closed
      delete this._feedData[feedSerial];
      this.emit("feedTermination", feedNameArgs, msg.ErrorCode, msg.ErrorData);
    } else {
      dbg("Feed was closing - suppressing");
      this._feedStates[feedSerial] = FeedState.TERMINATED;
      // Feed data already deleted by feedClose()
      // No event
    }
  };

// Private methods

/**
 * All timers must be cleared synchronously every time there is a call to
 * harnessAsync.disconnect(). That is, do not wait for the disconnecting
 * event. If you did NOT clear the timeouts, then:
 *
 * 1 - If the app called disconnect() and a response timed out before the
 *     harness disconnecting event, the app would receive a timeout error with
 *     the disconnecting event.
 *
 * 2 - If a message timed out and then another message timed out before the
 *     harness disconnecting event, the app would see the later-transmitted
 *     message attached to the error.
 *
 * This method is only called when the harness is guaranteed to be connecting
 * or connected, so it will not throw a StateError.
 *
 * @memberof Conversation
 * @instance
 * @param {?(ConnectionError|HandshakeError|ResponseTimeoutError|ServerMessageError|ViolationResponseError|TransportError)} err
 * @throws {StateError|TransportError}
 */
Conversation.prototype._disconnectAndClearTimers =
  function _disconnectAndClearTimers(err) {
    dbg("Running _disconnectAndClearTimers()");

    this._timeoutClear(); // All
    this._harnessAsync.disconnect(err); // Intentionally cascade TransportError
  };

/**
 * Returns the spec-defined state of a feed. Differs from public-facing
 * feedState() in that the latter maps terminated to closing.
 * @memberof Conversation
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @returns {FeedState}
 */
Conversation.prototype._feedState = function _feedState(feedNameArgs) {
  dbg("Running _feedState()");

  const feedSerial = feedNameArgs.serial();
  return feedSerial in this._feedStates
    ? this._feedStates[feedSerial]
    : FeedState.CLOSED;
};

/**
 * Establishes a connect/response timeout if so configured.
 * @memberof Conversation
 * @instance
 * @param {string} name Used for identification
 * @param {number} ms   When to fire
 * @param {?Object} clientMessage Present for response timeouts, missing for connect timeout
 */
Conversation.prototype._timeoutSet = function _timeoutSet(
  name,
  ms,
  clientMessage,
) {
  dbg("Running _timeoutSet()");

  if (ms > 0) {
    this._timers[name] = setTimeout(
      this._bound._timeoutRun,
      ms,
      name,
      clientMessage,
    );
  }
};

/**
 * @memberof Conversation
 * @instance
 * @param {string} name
 * @param {?Object} clientMessage Present for response timeouts, missing for connect timeout
 * @throws {TransportError}
 */
Conversation.prototype._timeoutRun = function _timeoutRun(name, clientMessage) {
  dbg("Running _timeoutRun()");

  delete this._timers[name];
  if (clientMessage) {
    dbg("Response timeout - disconnecting");
    this._disconnectAndClearTimers(
      Object.assign(
        new ResponseTimeoutError(
          `The server did not respond to a client message within the configured amount of time. See the clientMessage property.`,
        ),
        { clientMessage: deepFreeze(clientMessage) },
      ),
    ); // Intentionally cascade TransportError
  } else {
    dbg("Connect timeout - disconnecting");
    this._disconnectAndClearTimers(
      new ConnectionError(
        "The transport did not connect to the server within the configured amount of time.",
      ),
    ); // Intentionally cascade TransportError
  }
};

/**
 * @memberof Conversation
 * @instance
 * @param {?string} name Falsy for all
 */
Conversation.prototype._timeoutClear = function _timeoutClear(name) {
  dbg("Running _timeoutClear()");

  if (name) {
    dbg("Clearing one timer");
    if (this._timers[name]) {
      clearTimeout(this._timers[name]);
      delete this._timers[name];
    }
  } else {
    dbg("Clearing all timers");
    Object.values(this._timers).forEach((timerId) => {
      clearTimeout(timerId);
    });
    this._timers = {};
  }
};

// Exports

export default Conversation;
