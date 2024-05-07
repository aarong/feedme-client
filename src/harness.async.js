import { EventEmitter } from "events";
import debug from "debug";
import HarnessSync from "./harness.sync";
import macrotask from "./macrotask";
import { StateError } from "./errors";
import { ClientState } from "./states";

const dbg = debug("feedme-client:harness-async");

// Constructor

/**
 *
 * Minimal wrapper that overlays more intuitive asynchronous behavior on
 * HarnessSync.
 *
 * Note that DEV.md guarantees no synchronous calls on the transport within
 * event handlers - ensured by this module.
 *
 * Same API as HarnessSync except:
 *
 * - All event emissions are deferred as separate macrotasks. None are emitted
 *   synchronously within method calls, irrespective of transport behavior, and
 *   each is emitted asynchronously to all others.
 *
 * - Outward state is always intuitive within external event handlers. Since
 *   events are deferred, this means that state updates are too, and the
 *   module knows how to handle outward/underlying state mismatches.
 *
 * - Accepts an error argument on disconnect() and relays it with the
 *   disconnecting event.
 *
 * - Prevents extraneous calls to connect() and disconnect() from reaching the
 *   transport and, in the latter case, ensures that the latest error argument
 *   is used with the eventual emission.
 *
 * - Suppresses connect and message events once there has been a call to
 *   disconnect() so that the next emission is guaranteed to be disconnecting.
 *
 * - Injects disconnect/ing events as required When there is a transport error
 *   and presents outward state as disconnected/ing when handlers are invoked.
 *
 * @constructor
 * @extends EventEmitter
 * @param {Object} transport
 * @param {Object} options Valid options object with defaults overlaid
 * @throws {TransportError}
 */
const HarnessAsync = function HarnessAsync(transport, options) {
  dbg("Initializing");

  const harnessSync = new HarnessSync(transport, options); // Intentionally cascade TransportError

  // Success

  EventEmitter.call(this);

  /**
   * @memberof HarnessAsync
   * @instance
   * @type {Object}
   */
  this._options = options;

  /**
   * @memberof HarnessAsync
   * @instance
   * @type {HarnessSync}
   */
  this._harnessSync = harnessSync;

  /**
   * The outward-facing state of the module, which may differ from the state
   * of HarnessSync.
   * @memberof HarnessAsync
   * @instance
   * @type {ClientState}
   */
  this._outwardState = ClientState.DISCONNECTED;

  /**
   * The eventual state of the module based on emissions from HarnessSync.
   * May differ from the current outward state if some emissions are pending.
   * Used to determine whether disconnect/ing events should be injected when
   * an error event is observed.
   * @memberof HarnessAsync
   * @instance
   * @type {ClientState}
   */
  this._eventualState = ClientState.DISCONNECTED;

  /**
   * Flag set to true when on valid call to connect() and false when
   * connecting event is emitted by this object.
   * HarnessSync can cycle all the way back to disconnected within a call to
   * connect(), so you can't rely on its state to avoid calling again before
   * this module emits connecting.
   * @memberof HarnessAsync
   * @instance
   * @type {boolean}
   */
  this._connectCalled = false;

  /**
   * Flag set to true on valid call to disconnect() and false when
   * disconnecting event is emitted by this object.
   * Used to suppress connect and message events and indicates that
   * this._disconnectError should be used with the disconnecting event.
   * @memberof HarnessAsync
   * @instance
   * @type {boolean}
   */
  this._disconnectCalled = false;

  /**
   * Most recent error passed to disconnect().
   * @memberof HarnessAsync
   * @instance
   * @type {?Error}
   */
  this._disconnectError = null;

  /**
   * Prototype methods bound to the instance for easy deferral.
   * @memberof HarnessAsync
   * @instance
   * @type {Object}
   */
  this._bound = { _emitters: {} };
  Object.entries(this._emitters).forEach(([name, fn]) => {
    this._bound._emitters[name] = fn.bind(this);
  });

  // Listen for HarnessSync events
  Object.entries(this._handlers).forEach(([evt, fn]) => {
    this._harnessSync.on(evt, fn.bind(this));
  });
};

HarnessAsync.prototype = Object.create(EventEmitter.prototype);
HarnessAsync.prototype.constructor = HarnessAsync;

// Events

/**
 * First event is connecting or error.
 * Followed by connect or disconnecting.
 * Outward-facing state is connecting.
 * @event connecting
 * @memberof HarnessAsync
 */

/**
 * Followed by message or disconnecting.
 * Outward-facing state is connected.
 * @event connect
 * @memberof HarnessAsync
 */

/**
 * Followed by message or disconnecting.
 * Outward-facing state is connected.
 * @event message
 * @memberof HarnessAsync
 * @param {string} message
 */

/**
 * Followed by disconnect.
 * Outward-facing state is disconnecting.
 * @event disconnecting
 * @memberof HarnessAsync
 * @param {?Error} err If there was a call to disconnect(err) then err is
 *                     used as the emission argument - could be falsy
 *
 *                     If there was no call to disconnect() then ConnectionError
 *                     or TransportError
 */

/**
 * Followed by connecting or error.
 * Outward-facing state is disconnected.
 * @event disconnect
 * @memberof HarnessAsync
 */

/**
 * First event is connecting or error.
 * Followed by nothing.
 * Outward-facing state is error.
 * @event error
 * @memberof HarnessAsync
 * @param {TransportError} err
 */

// Public properties

/**
 * @name state
 * @memberof harnessAsync
 * @instance
 * @type {ClientState}
 */
Object.defineProperty(HarnessAsync.prototype, "state", {
  enumerable: true,
  get() {
    dbg("Getting state");
    return this._outwardState;
  },
});

// Public methods

/**
 * @memberof HarnessAsync
 * @instance
 * @throws {StateError|TransportError}
 */
HarnessAsync.prototype.connect = function connect() {
  dbg("Running connect()");

  // Check outward state
  if (this._outwardState !== ClientState.DISCONNECTED) {
    throw new StateError("State must be disconnected.");
  }

  // Run on HarnessSync if appropriate
  // Checking whether HarnessSync is disconnected is not sufficient, since
  // its state can cycle back all the way to disconnected within a call to
  // harnessSync.connect(), and extraneous calls to harnessAsync.connect()
  // should be discarded, not produce additional event cycles
  // So track whether connect() has already been called and reset when
  // this object's outward state becomes connecting, at which point connect()
  // is not permitted
  // Must still verify that HarnessSync state is disconnected to ensure no
  // intervening transport error
  if (
    !this._connectCalled &&
    this._harnessSync.state === ClientState.DISCONNECTED
  ) {
    this._connectCalled = true;
    this._harnessSync.connect(); // Intentionally cascade TransportError
    // HarnessSync state could now be anything including disconnected (full cycle) and error
  }
};

/**
 * @memberof HarnessAsync
 * @instance
 * @param {string} msg
 * @throws {ArgumentError|StateError|TransportError}
 */
HarnessAsync.prototype.send = function send(msg) {
  dbg("Running send()");

  // Check outward state
  if (this._outwardState !== ClientState.CONNECTED) {
    throw new StateError("State must be connected.");
  }

  // Run on HarnessSync if appropriate
  // There may have been a call to disconnect() or there may have been a
  // transport error, and in both cases HarnessSync will not be connected
  if (this._harnessSync.state === ClientState.CONNECTED) {
    this._harnessSync.send(msg); // Intentionally cascade ArgumentError, TransportError
    // HarnessSync state could now be anything except connecting
  }
};

/**
 * @memberof HarnessAsync
 * @instance
 * @param {?Error} err
 * @throws {StateError|TransportError}
 */
HarnessAsync.prototype.disconnect = function disconnect(err) {
  dbg("Running disconnect()");

  // Check outward state
  if (
    this._outwardState !== ClientState.CONNECTING &&
    this._outwardState !== ClientState.CONNECTED
  ) {
    throw new StateError("State must be connecting or connected.");
  }

  // Record call and latest error
  this._disconnectCalled = true; // Set false when disconnecting is emitted by this object
  this._disconnectError = err;

  // Run on HarnessSync if appropriate
  // There may have already been a call to disconnect() or there may have been
  // a transport error, and in both cases HarnessSync will not be connecting or
  // connected
  const harnessSyncState = this._harnessSync.state;
  if (
    harnessSyncState === ClientState.CONNECTING ||
    harnessSyncState === ClientState.CONNECTED
  ) {
    this._harnessSync.disconnect(); // Intentionally cascade TransportError
    // HarnessSync state could now be disconnecting, disconnected, or error
  }
};

// Event handlers

HarnessAsync.prototype._handlers = {};

/**
 * @name _handlers#connecting
 * @memberof HarnessAsync
 * @instance
 */
HarnessAsync.prototype._handlers.connecting = function _handlers$connecting() {
  dbg("Handling connecting");

  this._eventualState = ClientState.CONNECTING;
  macrotask(this._bound._emitters.connecting);
};

/**
 * @name _handlers#connect
 * @memberof HarnessAsync
 * @instance
 */
HarnessAsync.prototype._handlers.connect = function _handlers$connect() {
  dbg("Handling connect");

  this._eventualState = ClientState.CONNECTED;
  macrotask(this._bound._emitters.connect);
};

/**
 * @name _handlers#message
 * @memberof HarnessAsync
 * @instance
 * @param {string} msg
 */
HarnessAsync.prototype._handlers.message = function _handlers$message(msg) {
  dbg("Handling message");

  macrotask(this._bound._emitters.message, msg);
};

/**
 * @name _handlers#disconnecting
 * @memberof HarnessAsync
 * @instance
 * @param {?Error} err Internally could be ConnectionError or TransportError
 */
HarnessAsync.prototype._handlers.disconnecting =
  function _handlers$disconnecting(err) {
    dbg("Handling disconnecting");

    this._eventualState = ClientState.DISCONNECTING;
    macrotask(this._bound._emitters.disconnecting, err);
  };

/**
 * @name _handlers#disconnect
 * @memberof HarnessAsync
 * @instance
 */
HarnessAsync.prototype._handlers.disconnect = function _handlers$disconnect() {
  dbg("Handling disconnect");

  this._eventualState = ClientState.DISCONNECTED;
  macrotask(this._bound._emitters.disconnect);
};

/**
 * @name _handlers#error
 * @memberof HarnessAsync
 * @instance
 * @param {TransportError} err
 */
HarnessAsync.prototype._handlers.error = function _handlers$error(err) {
  dbg("Handling error");

  // Inject disconnecting and/or disconnect events if appropriate
  if (
    this._eventualState === ClientState.CONNECTING ||
    this._eventualState === ClientState.CONNECTED
  ) {
    dbg("Injecting disconnecting and disconnect");

    macrotask(this._bound._emitters.disconnecting, err); // TransportError
    macrotask(this._bound._emitters.disconnect);
  } else if (this._eventualState === ClientState.DISCONNECTING) {
    dbg("Injecting disconnect");

    macrotask(this._bound._emitters.disconnect);
  }

  this._eventualState = ClientState.ERROR;
  macrotask(this._bound._emitters.error, err);
};

// Private methods

HarnessAsync.prototype._emitters = {};

/**
 * @name _emitters#connecting
 * @memberof HarnessAsync
 * @instance
 */
HarnessAsync.prototype._emitters.connecting = function _emitters$connecting() {
  dbg("Emitting connecting");
  this._connectCalled = false;
  this._outwardState = ClientState.CONNECTING;
  this.emit("connecting");
};

/**
 * @name _emitters#connect
 * @memberof HarnessAsync
 * @instance
 */
HarnessAsync.prototype._emitters.connect = function _emitters$connect() {
  if (!this._disconnectCalled) {
    dbg("Emitting connect");
    this._outwardState = ClientState.CONNECTED;
    this.emit("connect");
  } else {
    dbg("Suppressing connect");
  }
};

/**
 * @name _emitters#message
 * @memberof HarnessAsync
 * @instance
 * @param {string} msg
 */
HarnessAsync.prototype._emitters.message = function _emitters$message(msg) {
  if (!this._disconnectCalled) {
    dbg("Emitting message");
    this.emit("message", msg);
  } else {
    dbg("Suppressing message");
  }
};

/**
 * @name _emitters#disconnecting
 * @memberof HarnessAsync
 * @instance
 * @param {?Error} err Internally could be ConnectionError or TransportError
 */
HarnessAsync.prototype._emitters.disconnecting =
  function _emitters$disconnecting(err) {
    dbg("Emitting disconnecting");

    const emitErr = this._disconnectCalled ? this._disconnectError : err;

    this._disconnectCalled = false;
    this._disconnectError = null;
    this._outwardState = ClientState.DISCONNECTING;
    this.emit("disconnecting", emitErr || null);
  };

/**
 * @name _emitters#disconnect
 * @memberof HarnessAsync
 * @instance
 */
HarnessAsync.prototype._emitters.disconnect = function _emitters$disconnect() {
  dbg("Emitting disconnect");

  this._outwardState = ClientState.DISCONNECTED;
  this.emit("disconnect");
};

/**
 * @name _emitters#error
 * @memberof HarnessAsync
 * @instance
 * @param {TransportError} err
 */
HarnessAsync.prototype._emitters.error = function _emitters$error(err) {
  dbg("Emitting error");

  this._outwardState = ClientState.ERROR;
  this.emit("error", err);
};

// Exports

export default HarnessAsync;
