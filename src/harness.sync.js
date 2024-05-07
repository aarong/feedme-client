import { EventEmitter } from "events";
import debug from "debug";
import check from "check-types";
import {
  ArgumentError,
  StateError,
  ConnectionError,
  TransportError,
} from "./errors";
import { ClientState } from "./states";

const dbg = debug("feedme-client:harness-sync");

// Constructor

/**
 * A minimal harness for the transport. Like the transport, this harness is
 * permitted to emit events synchronously within its methods.
 *
 * Replicates the API described in DEV.md and adds:
 *
 *  - Transport validation: Ensures that the transport adheres to the
 *    requirements laid out in DEV.md. If the transport violates a requirement,
 *    the harness ceases all interaction with the transport and emits an error
 *    event.
 *
 *  - Library validation: Ensures that nothing invalid is done on the external
 *    transport, as this is the library boundary.
 *
 *  - State property: Reflects the latest transport emission.
 *
 *  - Wrapper errors: When the transport disconnects spontaneously, the
 *    harness wraps the transport-supplied error value in a ConnectionError.
 *
 *  - Disconnect timeouts: If the transport doesn't emit disconnect within
 *    disconnectTimeoutMs of disconnecting, then the harness considers the
 *    transport to have committed an error.
 *
 * The following transport validation checks are performed:
 *
 *  - Checks method presence on initialization
 *
 *  - Validates event sequencing and arguments (ignores extraneous args)
 *
 *  - Ensures no errors thrown by transport methods (ignores return values)
 *
 *  - Ensures no connecting event without a call to transport.connect()
 *
 *  - Ensures synchronous dis/connecting event on call to transport.dis/connect()
 *
 *  - Ensures argument with disconnecting event if no call to transport.disconnect()
 *
 *  - Ensures no argument with disconnecting event on call to transport.disconnect()
 *
 * @constructor
 * @extends EventEmitter
 * @param {Object} transport
 * @param {Object} options Valid options object with defaults overlaid
 * @throws {TransportError}
 */
const HarnessSync = function HarnessSync(transport, options) {
  dbg("Initializing");

  // Check transport type
  if (!check.object(transport)) {
    throw new TransportError("Transport is not an object.");
  }

  // Check that transport has the required API
  if (
    !check.function(transport.on) ||
    !check.function(transport.connect) ||
    !check.function(transport.send) ||
    !check.function(transport.disconnect)
  ) {
    throw new TransportError(
      "Transport does not implement on(), connect(), send(), and/or disconnect().",
    );
  }

  // Try to listen for transport events
  Object.entries(this._handlers).forEach(([evt, fn]) => {
    try {
      transport.on(evt, fn.bind(this));
    } catch (e) {
      throw Object.assign(
        new TransportError(
          "Transport threw an error when adding an event handler. See transportError property.",
        ),
        { transportError: e },
      );
    }
  });

  // Success

  EventEmitter.call(this);

  /**
   * @memberof HarnessSync
   * @instance
   * @type {Object}
   */
  this._options = options;

  /**
   * The state of the harness:
   *
   * DISCONNECTED  - no transport emissions or last emission was disconnect
   * CONNECTING    - last transport emission was connecting
   * CONNECTED     - last transport emission was connect or message
   * DISCONNECTING - last transport emission was disconnecting
   * ERROR         - transport violated DEV.md
   *
   * @memberof HarnessSync
   * @instance
   * @type {ClientState}
   */
  this._transportState = ClientState.DISCONNECTED;

  /**
   * Bound transport.connect/send/disconnect() methods. Null after an error.
   * @memberof HarnessSync
   * @instance
   * @type {?Object}
   */
  this._transportMethods = {
    connect: transport.connect.bind(transport),
    send: transport.send.bind(transport),
    disconnect: transport.disconnect.bind(transport),
  };

  /**
   * Flag used to ensure that the transport synchronously emits a connecting
   * event within each call to transport.connect(), and that the transport
   * does not emit a connecting event outside a call to transport.connect().
   * @memberof HarnessSync
   * @instance
   * @type {boolean}
   */
  this._awaitingConnecting = false;

  /**
   * Flag used to ensure that the transport synchronously emits a
   * disconnecting event with no error argument within each call to
   * transport.disconnect(), and that an error argument is present if the
   * transport spontaneously emits a disconnecting event.
   * @memberof HarnessSync
   * @instance
   * @type {boolean}
   */
  this._awaitingDisconnecting = false;

  /**
   * Timer established when the transport emits disconnecting event and
   * cleared when the transport emits disconnect event.
   * @memberof HarnessSync
   * @instance
   * @type {?number}
   */
  this._disconnectTimeoutTimer = null;

  /**
   * Reference for easy monitoring in tests (i.e. alongside all other invocations).
   * @memberof HarnessSync
   * @instance
   * @type {Function}
   */
  this._setTimeout = setTimeout;

  /**
   * Reference for easy monitoring in tests (i.e. alongside all other invocations).
   * @memberof HarnessSync
   * @instance
   * @type {Function}
   */
  this._clearTimeout = clearTimeout;

  /**
   * Prototype methods bound to the instance for easy deferral.
   * @memberof HarnessSync
   * @instance
   * @type {Object}
   */
  this._bound = {
    _disconnectTimeoutRun: this._disconnectTimeoutRun.bind(this),
  };
};

HarnessSync.prototype = Object.create(EventEmitter.prototype);
HarnessSync.prototype.constructor = HarnessSync;

// Event definitions

/**
 * First event is connecting or error.
 * Followed by connect, disconnecting, or error.
 * State is connecting.
 * @event connecting
 * @memberof HarnessSync
 */

/**
 * Followed by message, disconnecting, or error.
 * State is connected.
 * @event connect
 * @memberof HarnessSync
 */

/**
 * Followed by message, disconnecting, or error.
 * State is connected.
 * @event message
 * @memberof HarnessSync
 * @param {string} message
 */

/**
 * Followed by disconnect or error.
 * State is disconnecting.
 * @event disconnecting
 * @memberof HarnessSync
 * @param {?ConnectionError} err Null if due to harnessSync.disconnect()
 */

/**
 * Followed by connecting or error.
 * State is disconnected.
 * @event disconnect
 * @memberof HarnessSync
 */

/**
 * First event is connecting or error.
 * Followed by nothing.
 * State is error.
 * @event error
 * @memberof HarnessSync
 * @param {TransportError} err
 */

// Public properties

/**
 * @name state
 * @memberof HarnessSync
 * @instance
 * @type {ClientState}
 */
Object.defineProperty(HarnessSync.prototype, "state", {
  enumerable: true,
  get() {
    dbg("Getting state");
    return this._transportState;
  },
});

// Public methods

/**
 * @memberof HarnessSync
 * @instance
 * @throws {StateError|TransportError}
 */
HarnessSync.prototype.connect = function connect() {
  dbg("Running connect()");

  // Check state
  if (this._transportState !== ClientState.DISCONNECTED) {
    throw new StateError("State must be disconnected.");
  }

  // Try to connect
  this._awaitingConnecting = true; // Set false in handler
  try {
    this._transportMethods.connect();
  } catch (e) {
    this._error(
      Object.assign(
        new TransportError(
          "Transport threw an error on call to connect(). See transportError property.",
        ),
        { transportError: e },
      ),
    ); // Intentionally cascade TransportError
  }

  // Error if there was no synchronous connecting event
  if (this._awaitingConnecting) {
    this._error(
      new TransportError(
        "Transport failed to synchronously emit 'connecting' event on call to connect().",
      ),
    ); // Intentionally cascade TransportError
  }
};

/**
 * @memberof HarnessSync
 * @instance
 * @param {string} msg
 * @throws {ArgumentError|StateError|TransportError}
 */
HarnessSync.prototype.send = function send(msg) {
  dbg("Running send()");

  // Check msg argument
  if (!check.string(msg)) {
    throw new ArgumentError("Message must be a string.");
  }

  // Check state
  if (this._transportState !== ClientState.CONNECTED) {
    throw new StateError("State must be connected.");
  }

  // Try to send
  try {
    this._transportMethods.send(msg);
  } catch (e) {
    this._error(
      Object.assign(
        new TransportError(
          "Transport threw an error on call to send(). See transportError property.",
        ),
        { transportError: e },
      ),
    ); // Intentionally cascade TransportError
  }
};

/**
 * @memberof HarnessSync
 * @instance
 * @throws {StateError|TransportError}
 */
HarnessSync.prototype.disconnect = function disconnect() {
  dbg("Running disconnect()");

  // Check state
  if (
    this._transportState !== ClientState.CONNECTED &&
    this._transportState !== ClientState.CONNECTING
  ) {
    throw new StateError("State must be connecting or connected.");
  }

  // Try to disconnect
  this._awaitingDisconnecting = true; // Set false in handler
  try {
    this._transportMethods.disconnect();
  } catch (e) {
    this._error(
      Object.assign(
        new TransportError(
          "Transport threw an error on call to disconnect(). See transportError property.",
        ),
        { transportError: e },
      ),
    ); // Intentionally cascade TransportError
  }

  // Error if there was no synchronous disconnecting event
  if (this._awaitingDisconnecting) {
    this._error(
      new TransportError(
        "Transport failed to synchronously emit 'disconnecting' event on call to disconnect().",
      ),
    ); // Intentionally cascade TransportError
  }
};

// Event handlers

HarnessSync.prototype._handlers = {};

/**
 * @name _handlers#connecting
 * @memberof HarnessSync
 * @instance
 * @throws {TransportError}
 */
HarnessSync.prototype._handlers.connecting = function _handlers$connecting() {
  dbg("Handling connecting");

  // Was there already an error?
  if (this._transportState === ClientState.ERROR) {
    this._error(
      new TransportError(
        "The library instance has been destroyed due to an earlier transport error.",
      ),
    );
  }

  // Is emission sequence valid?
  if (this._transportState !== ClientState.DISCONNECTED) {
    this._error(
      new TransportError(
        "Transport emitted 'connecting' event when state was not disconnected.",
      ),
    ); // Intentionally cascade TransportError
  }

  // Is this within a call to transport.connect()?
  if (!this._awaitingConnecting) {
    this._error(
      new TransportError(
        "Transport emitted 'connecting' event without a library call to connect().",
      ),
    ); // Intentionally cascade TransportError
  }

  // Valid
  this._transportState = ClientState.CONNECTING;
  this._awaitingConnecting = false;
  this.emit("connecting");
};

/**
 * @name _handlers#connect
 * @memberof HarnessSync
 * @instance
 * @throws {TransportError}
 */
HarnessSync.prototype._handlers.connect = function _handlers$connect() {
  dbg("Handling connect");

  // Was there already an error?
  if (this._transportState === ClientState.ERROR) {
    this._error(
      new TransportError(
        "The library instance has been destroyed due to an earlier transport error.",
      ),
    );
  }

  // Is emission sequence valid?
  if (this._transportState !== ClientState.CONNECTING) {
    this._error(
      new TransportError(
        "Transport emitted 'connect' event when state was not connecting.",
      ),
    ); // Intentionally cascade TransportError
  }

  // Valid
  this._transportState = ClientState.CONNECTED;
  this.emit("connect");
};

/**
 * @name _handlers#message
 * @memberof HarnessSync
 * @instance
 * @param {string} msg
 * @throws {TransportError}
 */
HarnessSync.prototype._handlers.message = function _handlers$message(msg) {
  dbg("Handling message");

  // Was there already an error?
  if (this._transportState === ClientState.ERROR) {
    this._error(
      new TransportError(
        "The library instance has been destroyed due to an earlier transport error.",
      ),
    );
  }

  // Is emission sequence valid?
  if (this._transportState !== ClientState.CONNECTED) {
    this._error(
      Object.assign(
        new TransportError(
          "Transport emitted 'message' event when state was not connected. See transportMessage property.",
        ),
        { transportMessage: msg },
      ),
    ); // Intentionally cascade TransportError
  }

  // String argument?
  if (!check.string(msg)) {
    this._error(
      Object.assign(
        new TransportError(
          "Transport emitted non-string argument with 'message' event. See transportMessage property.",
        ),
        { transportMessage: msg },
      ),
    ); // Intentionally cascade TransportError
  }

  // Valid
  this.emit("message", msg);
};

/**
 * @name _handlers#disconnecting
 * @memberof HarnessSync
 * @instance
 * @param {*} err
 * @throws {TransportError}
 */
HarnessSync.prototype._handlers.disconnecting =
  function _handlers$disconnecting(err) {
    dbg("Handling disconnecting");

    // Was there already an error?
    if (this._transportState === ClientState.ERROR) {
      this._error(
        new TransportError(
          "The library instance has been destroyed due to an earlier transport error.",
        ),
      );
    }

    // Is emission sequence valid?
    if (
      this._transportState !== ClientState.CONNECTING &&
      this._transportState !== ClientState.CONNECTED
    ) {
      this._error(
        new TransportError(
          "Transport emitted 'disconnecting' event when state was not connecting or connected.",
        ),
      ); // Intentionally cascade TransportError
    }

    // Is this within a call to transport.disconnect() with a truthy error argument?
    if (this._awaitingDisconnecting && err) {
      const terr = new TransportError(
        "Library called disconnect() and transport 'disconnecting' event had an error argument. See transportError property.",
      );
      terr.transportError = err;
      this._error(terr); // Intentionally cascade TransportError
    }

    // Is this spontaneous without a truthy error argument?
    if (!this._awaitingDisconnecting && !err) {
      this._error(
        new TransportError(
          "Library did not call disconnect() and transport 'disconnecting' event had no error argument.",
        ),
      ); // Intentionally cascade TransportError
    }

    // Valid
    const prevState = this._transportState;
    this._transportState = ClientState.DISCONNECTING;
    this._awaitingDisconnecting = false;
    this._disconnectTimeoutSet();
    let emitErr = null;
    if (err) {
      if (prevState === ClientState.CONNECTING) {
        emitErr = new ConnectionError(
          "The transport could not connect to the server. See transportError property.",
        );
      } else {
        emitErr = new ConnectionError(
          "The transport connection to the server failed. See transportError property.",
        );
      }
      emitErr.transportError = err;
    }
    this.emit("disconnecting", emitErr);
  };

/**
 * @name _handlers#disconnect
 * @memberof HarnessSync
 * @instance
 * @throws {TransportError}
 */
HarnessSync.prototype._handlers.disconnect = function _handlers$disconnect() {
  dbg("Handling disconnect");

  // Was there already an error?
  if (this._transportState === ClientState.ERROR) {
    this._error(
      new TransportError(
        "The library instance has been destroyed due to an earlier transport error.",
      ),
    );
  }

  // Is emission sequence valid?
  if (this._transportState !== ClientState.DISCONNECTING) {
    this._error(
      new TransportError(
        "Transport emitted 'disconnect' event when state was not disconnecting.",
      ),
    ); // Intentionally cascade TransportError
  }

  // Valid
  this._transportState = ClientState.DISCONNECTED;
  this._disconnectTimeoutClear();
  this.emit("disconnect");
};

// Private methods

/**
 * Called when the transport violates a requirement after initialization.
 * Resets internal state, emits an error event if not already emitted, and
 * potentially throws. The library makes no further invocations on the transport.
 * @memberof HarnessSync
 * @instance
 * @param {TransportError} err
 * @param {boolean} [throwErr=true]
 * @throws {TransportError}
 */
HarnessSync.prototype._error = function _error(err, throwErr = true) {
  dbg("Running _error()");

  const prevState = this._transportState;

  // Update state
  this._transportState = ClientState.ERROR;
  this._transportMethods = null;
  this._awaitingConnecting = false;
  this._awaitingDisconnecting = false;

  this._disconnectTimeoutClear();

  // Emit an error event only once if, for example, there are multiple bad
  // transport events, or if a bad transport event is emitted within a transport
  // method which then throws as well
  if (prevState !== ClientState.ERROR) {
    this.emit("error", err);
  }

  if (throwErr) {
    throw err;
  }
};

/**
 * @memberof HarnessSync
 * @instance
 */
HarnessSync.prototype._disconnectTimeoutSet = function _disconnectTimeoutSet() {
  dbg("Running _disconnectTimeoutSet()");

  if (this._options.disconnectTimeoutMs > 0) {
    this._disconnectTimeoutTimer = this._setTimeout(
      this._bound._disconnectTimeoutRun,
      this._options.disconnectTimeoutMs,
    );
  }
};

/**
 * @memberof HarnessSync
 * @instance
 */
HarnessSync.prototype._disconnectTimeoutRun = function _disconnectTimeoutRun() {
  dbg("Running _disconnectTimeoutRun()");

  this._error(
    new TransportError(
      "Transport failed to emit a 'disconnect' event within the configured amount of time after a 'disconnecting' event.",
    ),
    false, // Do not throw
  );
};

/**
 * @memberof HarnessSync
 * @instance
 */
HarnessSync.prototype._disconnectTimeoutClear =
  function _disconnectTimeoutClear() {
    dbg("Running _disconnectTimeoutClear()");

    if (this._disconnectTimeoutTimer) {
      this._clearTimeout(this._disconnectTimeoutTimer);
      this._disconnectTimeoutTimer = null;
    }
  };

// Exports

export default HarnessSync;
