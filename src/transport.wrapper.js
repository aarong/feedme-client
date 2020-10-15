import check from "check-types";
import emitter from "component-emitter";
import debug from "debug";
import _includes from "lodash/includes";
import defer from "./defer";

const dbg = debug("feedme-client:transport-wrapper");

/**
 * Wrapper that verifies that the app-provided transport object has the required
 * functionality and behavior:
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
 * this in the disconnect event. However, on each event, if the new state is
 * disconnected then you can require that the state remain disconnected until
 * there is a call to connect(). So you don't validate the state when an event
 * handler is invoked, but you require that the it evolves appropriately,
 * whatever it is reported to be.
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
 * The wrapper assumes that the library interacts with the transport according
 * to the commitments laid out in the developer documentation.
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

  // Check that the transport exposes the required API
  if (
    !check.function(transport.on) ||
    !check.function(transport.state) ||
    !check.function(transport.connect) ||
    !check.function(transport.send) ||
    !check.function(transport.disconnect)
  ) {
    throw new Error(
      "TRANSPORT_ERROR: Transport does not implement the required API."
    );
  }

  // Initialize the transport
  const transportWrapper = Object.create(proto);

  /**
   * Transport object being wrapped.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {Object}
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
   * Flag indicating whether the library has called transport.connect().
   * Set to true on calls to transportWrapper.connect() and then set to false
   * when the transport emits a connecting event. Used to ensure that
   * transport does not emit connecting event without call to connect().
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {boolean}
   */
  transportWrapper._connectCalled = false;

  // Check that the transport state is valid and disconnected
  transportWrapper.state(); // Cascade errors

  // Try to listen for transport events
  try {
    transportWrapper._transport.on(
      "connecting",
      transportWrapper._processTransportConnecting.bind(transportWrapper)
    );
    transportWrapper._transport.on(
      "connect",
      transportWrapper._processTransportConnect.bind(transportWrapper)
    );
    transportWrapper._transport.on(
      "message",
      transportWrapper._processTransportMessage.bind(transportWrapper)
    );
    transportWrapper._transport.on(
      "disconnect",
      transportWrapper._processTransportDisconnect.bind(transportWrapper)
    );
  } catch (e) {
    const err = Error(
      "TRANSPORT_ERROR: Transport threw an error on call to on()."
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
 * @param {?Error} err Passed by the transport.
 */

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "TRANSPORT_ERROR: ...""
 */
proto.state = function state() {
  // Try to get the state
  let transportState;
  this._methodRunning = "state";
  try {
    transportState = this._transport.state();
  } catch (e) {
    const throwErr = new Error(
      `TRANSPORT_ERROR: Transport threw an error on call to state().`
    );
    throwErr.transportError = e;
    throw throwErr;
  } finally {
    this._methodRunning = null;
  }

  // Validate the state
  // Cannot validate against last emission due to emission deferrals
  if (
    transportState !== "disconnected" &&
    transportState !== "connecting" &&
    transportState !== "connected"
  ) {
    throw new Error(
      `TRANSPORT_ERROR: Transport returned invalid state '${transportState}' on call to state().`
    );
  }

  // Ensure that transport returned a permissable state
  if (!_includes(this._permittedStates, transportState)) {
    const permittedStates = `'${this._permittedStates.join("' or '")}'`;
    throw new Error(
      `TRANSPORT_ERROR: Transport returned state '${transportState}' on call to state() when ${permittedStates} was expected.`
    );
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
      "connected"
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
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.connect = function connect() {
  dbg("Connect requested");

  // Try to connect
  this._methodRunning = "connect";
  this._connectCalled = true;
  try {
    this._transport.connect();
  } catch (e) {
    this._connectCalled = false;
    const throwErr = new Error(
      `TRANSPORT_ERROR: Transport threw an error on call to connect().`
    );
    throwErr.transportError = e;
    throw throwErr;
  } finally {
    this._methodRunning = null;
  }

  // Update permittedStates and validate post-operation transport state
  this._permittedStates = ["disconnected", "connecting", "connected"];
  this.state(); // Cascade errors
};

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.send = function send(msg) {
  dbg("Send requested");

  // Try to send the message
  this._methodRunning = "send";
  try {
    this._transport.send(msg);
  } catch (e) {
    const throwErr = new Error(
      `TRANSPORT_ERROR: Transport threw an error on call to send().`
    );
    throwErr.transportError = e;
    throw throwErr;
  } finally {
    this._methodRunning = null;
  }

  // Update permittedStates and validate post-operation transport state
  this._permittedStates = ["disconnected", "connected"];
  this.state(); // Cascade errors
};

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.disconnect = function disconnect(err) {
  dbg("Disconnect requested");

  // Try to disconnect
  this._methodRunning = "disconnect";
  try {
    if (err) {
      this._transport.disconnect(err);
    } else {
      this._transport.disconnect();
    }
  } catch (e) {
    const throwErr = new Error(
      `TRANSPORT_ERROR: Transport threw an error on call to disconnect().`
    );
    throwErr.transportError = e;
    throw throwErr;
  } finally {
    this._methodRunning = null;
  }

  // Update permittedStates and validate post-operation transport state
  this._permittedStates = ["disconnected"];
  this.state(); // Cascade errors
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

  // Were the emission arguments valid?
  if (args.length > 0) {
    throw new Error(
      "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connecting' event."
    );
  }

  // Is the emission sequence valid?
  if (this._lastEmission !== "disconnect") {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connecting' event following a '${this._lastEmission}' emission.`
    );
  }

  // Did the library call transport.connect()?
  if (!this._connectCalled) {
    throw new Error(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event without a library call to connect()."
    );
  }

  // Is the event being emitted synchronously within a method call?
  if (this._methodRunning !== null) {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to ${this._methodRunning}().`
    );
  }
  // Update permitted states and validate the current state
  // Event deferral means that you cannot require a specific valid state during events
  // But ensure that the current state is valid and ensure that the state does not
  // subsequently change in an invalid manner either synchronously or asynchronously
  this._permittedStates = ["connecting", "connected", "disconnected"];
  this.state(); // Cascade errors

  // Success

  this._connectCalled = false;
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

  // Were the emission arguments valid?
  if (args.length > 0) {
    throw new Error(
      "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connect' event."
    );
  }

  // Is the emission sequence valid?
  if (this._lastEmission !== "connecting") {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was '${this._lastEmission}'.`
    );
  }

  // Is the event being emitted synchronously within a method call?
  if (this._methodRunning !== null) {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to ${this._methodRunning}().`
    );
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
 */
proto._processTransportMessage = function _processTransportMessage(...args) {
  dbg("Observed transport message event");

  // Valid arguments?
  if (args.length !== 1) {
    throw new Error(
      "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
    );
  }

  // String argument?
  if (!check.string(args[0])) {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a non-string argument '${args[0]}' with a 'message' event.`
    );
  }

  // Is the emission sequence valid?
  if (this._lastEmission !== "connect" && this._lastEmission !== "message") {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was '${this._lastEmission}'.`
    );
  }

  // Is the event being emitted synchronously within a method call?
  if (this._methodRunning !== null) {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to ${this._methodRunning}().`
    );
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

  // Valid arguments?
  if (args.length > 1) {
    throw new Error(
      "TRANSPORT_ERROR: Transport emitted one or more extraneous arguments with a 'disconnect' event."
    );
  }

  // Error valid if specified?
  if (args.length === 1 && !check.instance(args[0], Error)) {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a non-Error argument '${args[0]}' with a 'disconnect' event.`
    );
  }

  // Is the emission sequence valid?
  if (this._lastEmission === "disconnect") {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'disconnect' event when the previous emission was 'disconnect'.`
    );
  }

  // Is the event being emitted synchronously within a method call?
  if (this._methodRunning !== null) {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to ${this._methodRunning}().`
    );
  }

  // Update permitted states and validate the current state
  // Event deferral means that you cannot require a specific valid state during events
  // But ensure that the current state is valid and ensure that the state does not
  // subsequently change in an invalid manner either synchronously or asynchronously
  this._permittedStates = ["connecting", "connected", "disconnected"];
  this.state(); // Cascade errors

  // Success

  this._lastEmission = "disconnect";
  if (args.length === 0) {
    defer(this.emit.bind(this), "disconnect");
  } else {
    defer(this.emit.bind(this), "disconnect", args[0]);
  }
};
