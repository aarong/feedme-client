import check from "check-types";
import emitter from "component-emitter";
import debug from "debug";
import _includes from "lodash/includes";
import _startsWith from "lodash/startsWith";
import _each from "lodash/each";
import defer from "./defer";

const dbg = debug("feedme-client:transport-wrapper");

/**
 * Wrapper that verifies that the app-provided transport object implements the
 * required functionality and behavior. If a problem is detected, the transport
 * wrapper destroys itself, emits transportError, and throws TRANSPORT_ERROR.
 * The wrapper can also be destroyed from the outside by the application.
 *
 * The wrapper has the same structure and behavior as laid out in the transport
 * requirements, with a few minor additions:
 *
 * - It exposes a destroy() function
 * - It emits a transportError event if the transport violates a requirement.
 * - It accepts an error argument on disconnect(err) and attaches it to the
 *   resulting disconnect event
 *
 * Transport structure/behavior validation:
 *
 * - Transport API surface is validated on intialization
 *
 * - Transport method errors are caught and wrapped in TRANSPORT_ERROR
 *
 * - Transport event sequence is validated
 *
 * - Transport is verified to emit no connecting event until there has been a
 *   call to transport.connect()
 *
 * - Transport is verified to emit no argument-less disconnect event unless
 *   there has been a call to transport.disconnect()
 *
 * - Transport is verified not to emit events synchronously within method calls
 *
 * - Transport state is...
 *
 *    - Validated after each method invocation
 *
 *    - Verified not to change unexpectedly...
 *
 *        The transport state is not permitted to change as the app/library
 *        executes synchronous code, unless the app/library calls a transport
 *        method (in which case certain state changes are permitted/required)
 *
 *        The transport state is only permitted certain state changes on a
 *        deferred basis, unless the app/library calls a transport method (in
 *        which case certain state changes are permitted/required) or the
 *        transport emits an event
 *
 * Because transport state is updated synchronously and associated events are
 * deferred, it is not generally possible to validate state and emissions
 * against one another. For example, once disconnected, the transport is
 * required to remain disconnected until there is a call to connect(), but it is
 * conceivable that the application could call connect() before the deferred
 * disconnect event is received by the transport wrapper, so you cannot enforce
 * this in the disconnect event. However, when there is an event, the wrapper
 * can ensure that the current state is valid (disconnected, connecting, or
 * connected) and then require that it evolves appropriately.
 *
 * Transport errors are always thrown. They are serious and should fail hard.
 *
 * - If the transport errors synchronously on a method call from the
 *   application, then the error will cascade to the application
 *
 * - If the transport errors synchronously on a method call invoked by a
 *   library timer, then the error will be unhandled
 *
 * - If the transport emits an invalid event, then it is up to the transport to
 *   handle the error (and it will generally be unhandled)
 *
 * @typedef {Object} TransportWrapper
 * @extends emitter
 */

const proto = {};
emitter(proto);

/**
 * Factory function.
 * @param {Object} transport
 * @throws {Error} "INVALID_ARGUMENT: ..."
 * @throws {Error} "TRANSPORT_ERROR: ..."
 * @returns {TransportWrapper}
 */
export default function transportWrapperFactory(transport) {
  dbg("Initializing transportWrapper object");

  // Check that the transport is an object
  if (!check.object(transport)) {
    throw new Error("INVALID_ARGUMENT: Transport is not an object.");
  }

  // Check that the transport exposes the required API (excluding emitter API)
  if (
    !check.function(transport.state) ||
    !check.function(transport.connect) ||
    !check.function(transport.send) ||
    !check.function(transport.disconnect)
  ) {
    throw new Error(
      "TRANSPORT_ERROR: Transport does not implement state(), connect(), send(), or disconnect().",
    );
  }

  // Check that the transport exposes the required event emitter API
  if (
    !check.function(transport.on) &&
    !check.function(transport.addListener) &&
    !check.function(transport.addEventListener)
  ) {
    throw new Error(
      "TRANSPORT_ERROR: Transport does not implement on(), addListener(), or addEventListener().",
    );
  }
  if (
    !check.function(transport.off) &&
    !check.function(transport.removeListener) &&
    !check.function(transport.removeEventListener)
  ) {
    throw new Error(
      "TRANSPORT_ERROR: Transport does not implement off(), removeListener(), or removeEventListener().",
    );
  }

  // Initialize the transport
  const transportWrapper = Object.create(proto);

  /**
   * Transport object being wrapped. Null if the transport wrapper has been
   * destroyed.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {?Object}
   */
  transportWrapper._transport = transport;

  /**
   * Last transport event emission. Used to verify event sequencing.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {string} disconnect, connecting, connect, or message
   */
  transportWrapper._lastEmission = "disconnect";

  /**
   * Currently permitted transport states, assuming no transport method calls
   * or event emissions, which update this value.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {Array}
   */
  transportWrapper._permittedStates = ["disconnected"];

  /**
   * Permitted transport states scheduled to be permitted after the next
   * deferral, assuming no transport method calls or event emissions, which
   * update this value.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {Array}
   */
  transportWrapper._permittedStatesAfterDefer = ["disconnected"];

  /**
   * The name of the transport method that is currently running. Used to ensure
   * that the transport does not emit events synchronously within method
   * invocations.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {?string}
   */
  transportWrapper._methodRunning = null;

  /**
   * The number of times that transport.connect() has been called, minus the
   * number of connecting emissions that have been observed. Used to ensure that
   * transport does not emit connecting event without call to connect().
   * Since transport events are deferred, the wrapper cannot maintain a simple
   * boolean flag, as the app/library could synchronously call
   * connect()/disconnect() multiple times before any events are received from
   * the transport.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {number}
   */
  transportWrapper._connectCalls = 0;

  /**
   * When the library calls wrapper.disconnect([err]), the error (or undefined)
   * is pushed into this array. When the transport emits a disconnect event
   * without an argument (i.e. resulting from a call to disconnect()), the first
   * element in the array is removed and emitted with the error. Since transport
   * events are deferred, the wrapper must maintain a queue of disconnect
   * errors, not just the latest. In principle, the app/library could
   * synchronously call connect()/disconnect() multiple times before any events
   * are received from the transport.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {Array}
   */
  transportWrapper._disconnectCalls = [];

  // Check that the transport state is valid and disconnected
  transportWrapper.state(); // Cascade errors

  /**
   * Transport event handler functions. Saved for removal on destroy.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {Object}
   */
  transportWrapper._listeners = {
    connecting:
      transportWrapper._processTransportConnecting.bind(transportWrapper),
    connect: transportWrapper._processTransportConnect.bind(transportWrapper),
    message: transportWrapper._processTransportMessage.bind(transportWrapper),
    disconnect:
      transportWrapper._processTransportDisconnect.bind(transportWrapper),
  };

  // Try to listen for transport events
  let onFunction;
  if (check.function(transport.on)) {
    onFunction = transport.on;
  } else if (check.function(transport.addListener)) {
    onFunction = transport.addListener;
  } else if (check.function(transport.addEventListener)) {
    onFunction = transport.addEventListener;
  }
  try {
    _each(transportWrapper._listeners, (handler, evt) => {
      onFunction.bind(transport)(evt, handler);
    });
  } catch (e) {
    const err = Error(
      "TRANSPORT_ERROR: Transport threw an error when subscribing event listeners.",
    );
    err.transportError = e;
    throw err;
  }

  return transportWrapper;
}

// Events

/**
 * Emitted on valid transport connecting event.
 * @event connecting
 * @memberof TransportWrapper
 * @instance
 */

/**
 * Emitted on valid transport connect event.
 * @event connect
 * @memberof TransportWrapper
 * @instance
 */

/**
 * Emitted on valid transport message event.
 * @event message
 * @memberof TransportWrapper
 * @instance
 * @param {string} message
 */

/**
 * Emitted on valid transport disconnect event.
 * @event disconnect
 * @memberof TransportWrapper
 * @instance
 * @param {?Error} err "TRANSPORT_FAILURE: ..." if the transport emitted an error
 *                     Otherwise the error (or lack thereof) passed by library to wrapper.disconnect()
 */

/**
 * Emitted when the transport does something invalid (aside from on initialization).
 * @event transportError
 * @memberof TransportWrapper
 * @instance
 * @param {Error} err "TRANSPORT_ERROR: ..."
 */

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "TRANSPORT_ERROR: ...""
 */
proto.state = function state() {
  // Throw if destroyed
  if (this.destroyed()) {
    throw new Error("DESTROYED: The client instance has been destroyed.");
  }

  // Try to get state
  const transportState = this._runTransportMethod("state"); // Cascade errors

  // Validate the state
  // Cannot validate against last emission due to emission deferrals
  if (
    transportState !== "disconnected" &&
    transportState !== "connecting" &&
    transportState !== "connected"
  ) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport returned invalid state '${transportState}' on call to state().`,
    );
    this._destroy(err);
    throw err;
  }

  // Ensure that transport returned a permissable state
  if (!_includes(this._permittedStates, transportState)) {
    const permittedStates = `'${this._permittedStates.join("' or '")}'`;
    const err = new Error(
      `TRANSPORT_ERROR: Transport returned state '${transportState}' on call to state() when ${permittedStates} was expected.`,
    );
    this._destroy(err);
    throw err;
  }

  // Success

  // Determine currently permitted states
  // State must not change synchronously unless there is an app/library call to
  // a transport method, which will update permitted states appropriately
  this._permittedStates = [transportState];

  // Determine permitted states after deferral
  // State must evolve according to the following rules unless there is an
  // intervening call to a transport method, in which case permitted states
  // before/after deferral are updated appropriately
  if (transportState === "disconnected") {
    this._permittedStatesAfterDefer = ["disconnected"];
  } else if (transportState === "connecting") {
    this._permittedStatesAfterDefer = [
      "disconnected",
      "connecting",
      "connected",
    ];
  } else if (transportState === "connected") {
    this._permittedStatesAfterDefer = ["disconnected", "connected"];
  }

  // Update permitted states after deferral
  // If multiple defer()s are scheduled before any execute then all will
  // update to the final scheduled configuration, as desired
  defer(() => {
    this._permittedStates = this._permittedStatesAfterDefer;
  });

  return transportState;
};

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "INVALID_STATE: ..."
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.connect = function connect() {
  dbg("Connect requested");

  // Throw if destroyed
  if (this.destroyed()) {
    throw new Error("DESTROYED: The client instance has been destroyed.");
  }

  // Is the state disconnected?
  if (this.state() !== "disconnected") {
    throw new Error("INVALID_STATE: Not disconnected.");
  }

  // Try to connect
  this._runTransportMethod("connect"); // Cascade errors

  // Update permittedStates and validate post-operation transport state
  this._permittedStates = ["disconnected", "connecting", "connected"];
  this.state(); // Cascade errors

  // Increment number of connect() calls to permit an additional connecting event
  this._connectCalls += 1;
};

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "INVALID_ARGUMENT: ...
 * @throws {Error} "INVALID_STATE: ..."
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.send = function send(msg) {
  dbg("Send requested");

  // Throw if destroyed
  if (this.destroyed()) {
    throw new Error("DESTROYED: The client instance has been destroyed.");
  }

  // Check message
  if (!check.string(msg)) {
    throw new Error("INVALID_ARGUMENT: Invalid message.");
  }

  // Is the state connected?
  if (this.state() !== "connected") {
    throw new Error("INVALID_STATE: Not connected.");
  }

  // Try to send
  this._runTransportMethod("send", msg); // Cascade errors

  // Update permittedStates and validate post-operation transport state
  this._permittedStates = ["disconnected", "connected"];
  this.state(); // Cascade errors
};

/**
 * If an error argument is supplied, it will be passed as an argument with
 * the resulting disconnect event.
 * @memberof TransportWrapper
 * @instance
 * @param {?Error} err
 * @throws {Error} "INVALID_ARGUMENT: ..."
 * @throws {Error} "INVALID_STATE: ..."
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.disconnect = function disconnect(...args) {
  dbg("Disconnect requested");

  // Throw if destroyed
  if (this.destroyed()) {
    throw new Error("DESTROYED: The client instance has been destroyed.");
  }

  // Check error, if provided
  if (args.length >= 1 && !check.instance(args[0], Error)) {
    throw new Error("INVALID_ARGUMENT: Invalid error object.");
  }

  // Is the state connecting or connected?
  if (this.state() === "disconnected") {
    throw new Error("INVALID_STATE: Already disconnected.");
  }

  // Try to disconnect
  this._runTransportMethod("disconnect"); // Cascade errors

  // Update permittedStates and validate post-operation transport state
  this._permittedStates = ["disconnected"];
  this.state(); // Cascade errors

  // Save the error (or undefined) for disconnect emission
  this._disconnectCalls.push(args[0]);
};

/**
 * Outward facing function to destroy the transport wrapper.
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "INVALID_STATE: ..."
 * @throws {Error} "DESTROYED: ..."
 */
proto.destroy = function destroy() {
  dbg("Destroy requested");

  // Is the state disconnected?
  if (this.state() !== "disconnected") {
    throw new Error("INVALID_STATE: Not disconnected.");
  }

  this._destroy(); // No transport error; cascade errors
};

/**
 * Returns true if the wrapper has been destroyed and false otherwise.
 * @memberof TransportWrapper
 * @instance
 * @returns {boolean}
 */
proto.destroyed = function destroyed() {
  return !this._transport;
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto._processTransportConnecting = function _processTransportConnecting(
  ...args
) {
  dbg("Observed transport connecting event");

  // Throw if destroyed
  if (this.destroyed()) {
    throw new Error("DESTROYED: The client instance has been destroyed.");
  }

  // Were the emission arguments valid?
  if (args.length > 0) {
    const err = new Error(
      "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connecting' event.",
    );
    this._destroy(err);
    throw err;
  }

  // Is the emission sequence valid?
  if (this._lastEmission !== "disconnect") {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connecting' event following a '${this._lastEmission}' emission.`,
    );
    this._destroy(err);
    throw err;
  }

  // Is the event being emitted synchronously within a method call?
  if (this._methodRunning !== null) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to ${this._methodRunning}().`,
    );
    this._destroy(err);
    throw err;
  }

  // Did the library call transport.connect()?
  if (this._connectCalls === 0) {
    const err = new Error(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event without a library call to connect().",
    );
    this._destroy(err);
    throw err;
  }

  // Update permitted states and validate the current state
  // Event deferral means that you cannot require a specific valid state during events
  // But ensure that the current state is valid and ensure that the state does not
  // subsequently change in an invalid manner either synchronously or asynchronously
  this._permittedStates = ["connecting", "connected", "disconnected"];
  this.state(); // Cascade errors

  // Success

  this._connectCalls -= 1;
  this._lastEmission = "connecting";
  defer(this.emit.bind(this), "connecting");
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto._processTransportConnect = function _processTransportConnect(...args) {
  dbg("Observed transport connect event");

  // Throw if destroyed
  if (this.destroyed()) {
    throw new Error("DESTROYED: The client instance has been destroyed.");
  }

  // Were the emission arguments valid?
  if (args.length > 0) {
    const err = new Error(
      "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connect' event.",
    );
    this._destroy(err);
    throw err;
  }

  // Is the emission sequence valid?
  if (this._lastEmission !== "connecting") {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was '${this._lastEmission}'.`,
    );
    this._destroy(err);
    throw err;
  }

  // Is the event being emitted synchronously within a method call?
  if (this._methodRunning !== null) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to ${this._methodRunning}().`,
    );
    this._destroy(err);
    throw err;
  }

  // Update permitted states and validate the current state
  // Event deferral means that you cannot require a specific valid state during events
  // But ensure that the current state is valid and ensure that the state does not
  // subsequently change in an invalid manner either synchronously or asynchronously
  this._permittedStates = ["connecting", "connected", "disconnected"];
  this.state(); // Cascade errors

  // Success

  this._lastEmission = "connect";
  defer(this.emit.bind(this), "connect");
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto._processTransportMessage = function _processTransportMessage(...args) {
  dbg("Observed transport message event");

  // Throw if destroyed
  if (this.destroyed()) {
    throw new Error("DESTROYED: The client instance has been destroyed.");
  }

  // Valid arguments?
  if (args.length !== 1) {
    const err = new Error(
      "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event.",
    );
    this._destroy(err);
    throw err;
  }

  // String argument?
  if (!check.string(args[0])) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a non-string argument '${args[0]}' with a 'message' event.`,
    );
    this._destroy(err);
    throw err;
  }

  // Is the emission sequence valid?
  if (this._lastEmission !== "connect" && this._lastEmission !== "message") {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was '${this._lastEmission}'.`,
    );
    this._destroy(err);
    throw err;
  }

  // Is the event being emitted synchronously within a method call?
  if (this._methodRunning !== null) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to ${this._methodRunning}().`,
    );
    this._destroy(err);
    throw err;
  }

  // Update permitted states and validate the current state
  // Event deferral means that you cannot require a specific valid state during events
  // But ensure that the current state is valid and ensure that the state does not
  // subsequently change in an invalid manner either synchronously or asynchronously
  this._permittedStates = ["connecting", "connected", "disconnected"];
  this.state(); // Cascade errors

  // Success

  this._lastEmission = "message";
  defer(this.emit.bind(this), "message", args[0]);
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto._processTransportDisconnect = function _processTransportDisconnect(
  ...args
) {
  dbg("Observed transport disconnect event");

  // Throw if destroyed
  if (this.destroyed()) {
    throw new Error("DESTROYED: The client instance has been destroyed.");
  }

  // Valid arguments?
  if (args.length > 1) {
    const err = new Error(
      "TRANSPORT_ERROR: Transport emitted one or more extraneous arguments with a 'disconnect' event.",
    );
    this._destroy(err);
    throw err;
  }

  // Error valid if specified?
  if (args.length === 1 && !check.instance(args[0], Error)) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a non-Error argument '${args[0]}' with a 'disconnect' event.`,
    );
    this._destroy(err);
    throw err;
  }

  // Is the emission sequence valid?
  if (this._lastEmission === "disconnect") {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a 'disconnect' event when the previous emission was 'disconnect'.`,
    );
    this._destroy(err);
    throw err;
  }

  // Is the event being emitted synchronously within a method call?
  if (this._methodRunning !== null) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to ${this._methodRunning}().`,
    );
    this._destroy(err);
    throw err;
  }

  // If there is no error argument then there must be an entry in disconnectErrors
  // That is, there must have been a call to transport.disconnect()
  if (args.length === 0 && this._disconnectCalls.length === 0) {
    const err = new Error(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event with no error argument without a library call disconnect().",
    );
    this._destroy(err);
    throw err;
  }

  // Update permitted states and validate the current state
  // Event deferral means that you cannot require a specific valid state during events
  // But ensure that the current state is valid and ensure that the state does not
  // subsequently change in an invalid manner either synchronously or asynchronously
  this._permittedStates = ["connecting", "connected", "disconnected"];
  this.state(); // Cascade errors

  // Success

  this._lastEmission = "disconnect";

  let err;
  if (args.length > 0) {
    err = new Error("TRANSPORT_FAILURE: The transport connection failed.");
    [err.transportError] = args;
  } else {
    err = this._disconnectCalls.shift(); // undefined if requested by application
  }
  if (err) {
    defer(this.emit.bind(this), "disconnect", err);
  } else {
    defer(this.emit.bind(this), "disconnect");
  }
};

/**
 * Try to run a transport method, catching and throwing if there are
 * any synchronous event emissions or other errors.
 * @memberof TransportWrapper
 * @instance
 * @param {?Error} err
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto._runTransportMethod = function _runTransportMethod(method, ...args) {
  // Save the _methodRunning value on start and restore it to its previous value
  // on completion. The state() method is run within all of the transport event
  // handlers, and if the transport emits synchronously within a method call,
  // you don't want to forget about the initial method invocation
  let returnValue;
  const prevMethodRunning = this._methodRunning;
  this._methodRunning = method;
  try {
    returnValue = this._transport[method](...args);
  } catch (e) {
    // If it's a TRANSPORT_ERROR then emit it without wrapping
    // This occurs for synchronous emissions within method calls
    if (_startsWith(e.message, "TRANSPORT_ERROR:")) {
      // Already emitted transportError
      throw e;
    } else {
      const err = new Error(
        `TRANSPORT_ERROR: Transport threw an error on call to ${method}().`,
      );
      err.transportError = e;
      this._destroy(err);
      throw err;
    }
  } finally {
    this._methodRunning = prevMethodRunning;
  }
  return returnValue;
};

/**
 * Internal function to destroy the transport wrapper.
 * @memberof TransportWrapper
 * @instance
 * @param {?Error} transportError Present if there was a transport error
 *                                Missing if requested by the application
 * @throws {Error} "DESTROYED: ..."
 */
proto._destroy = function _destroy(transportError) {
  dbg("Destroying the transport wrapper");

  // Throw if destroyed
  if (this.destroyed()) {
    throw new Error("DESTROYED: The client instance has been destroyed.");
  }

  // Drop transport reference
  const transport = this._transport;
  this._transport = null;

  // Try to stop listening for transport events
  let offFunction;
  if (check.function(transport.off)) {
    offFunction = transport.off;
  } else if (check.function(transport.removeListener)) {
    offFunction = transport.removeListener;
  } else if (check.function(transport.removeEventListener)) {
    offFunction = transport.removeEventListener;
  }
  try {
    _each(this._listeners, (handler, evt) => {
      offFunction.bind(transport)(evt, handler);
    });
  } catch (e) {
    // Suppress
  }

  // Try to get the transport state and suppress any errors
  let transportState;
  try {
    transportState = transport.state();
  } catch (e) {
    // Suppress
  }

  // Disconnect the transport unless reported disconnected state and suppress any errors
  // Event handlers already disconnected

  if (transportState !== "disconnected") {
    try {
      transport.disconnect();
    } catch (e) {
      // Suppress
    }
  }

  // Emit disconnect if previous emission was not disconnected
  if (this._lastEmission !== "disconnect") {
    let err;
    if (transportError) {
      err = new Error(
        "DESTROYED: The transport violated a library requirement.",
      );
      err.transportError = transportError;
    } else {
      err = new Error("DESTROYED: The client instance has been destroyed.");
    }
    defer(this.emit.bind(this), "disconnect", err);
  }

  // Emit transportError if there was one
  if (transportError) {
    defer(this.emit.bind(this), "transportError", transportError);
  }
};
