import check from "check-types";
import emitter from "component-emitter";
import debug from "debug";
import defer from "./defer";

const dbg = debug("feedme-client:transport-wrapper");

/**
 * Wrapper for application-supplied transport objects that defers and queues all
 * event emissons, as the transport is permitted to emit events synchronously
 * within method calls by the library.
 *
 * The wrapper also verifies that the app-provided transport object is acting as
 * required (to the extent possible):
 *
 * - The transport API surface is validated on intialization
 * - Transport method return values and errors are validated
 * - Transport state is validated after each method invocation
 * - Transport event emission sequence is validated
 *
 * Because transport state is updated synchronously and associated events may be
 * emitted asynchronously, it is not possible to validate state and emissions
 * against one another.
 *
 * Transport errors are always thrown:
 *
 * - If the transport errors synchronously on a method call from the
 *   application, the error will cascade to the application
 *
 * - If the transport errors synchronously on a method call invoked by a
 *   library timer, then the error will be unhandled
 *
 * - If the transport emits an invalid event, then the error will be unhandled
 *
 * Assumes that the library interacts with the transport according to the
 * requirements laid out in the developer documentation.
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
   * Last transport state emission.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {string} disconnect, connecting, or connect
   */
  transportWrapper._lastEmission = "disconnect";

  // Check that the transport state is disconnected
  const transportState = transportWrapper.state(); // Cascade errors
  if (transportState !== "disconnected") {
    throw new Error(
      `TRANSPORT_ERROR: Transport returned invalid state '${transportState}' on call to state(). Must be 'disconnected' at initialization.`
    );
  }

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
      "TRANSPORT_ERROR: Transport threw an error on call to .on()."
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
  try {
    transportState = this._transport.state();
  } catch (e) {
    const err = new Error(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
    err.transportError = e;
    throw err;
  }

  // Validate the state
  // Cannot validate against last emission due to emission deferrals
  if (
    transportState !== "disconnected" &&
    transportState !== "connecting" &&
    transportState !== "connected"
  ) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport returned invalid state '${transportState}' on call to state().`
    );
    throw err;
  }

  // Return
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
  try {
    this._transport.connect();
  } catch (e) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport threw an error on call to connect().`
    );
    err.transportError = e;
    throw err;
  }

  // Transport state must be disconnected, connecting, or connected
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
  try {
    this._transport.send(msg);
  } catch (e) {
    const err = new Error(
      `TRANSPORT_ERROR: Transport threw an error on call to send().`
    );
    err.transportError = e;
    throw err;
  }

  // Transport state must be connected or disconnected
  const newState = this.state(); // Cascade errors
  if (newState !== "connected" && newState !== "disconnected") {
    throw new Error(
      `TRANSPORT_ERROR: Transport state was '${newState}' after a call to send().`
    );
  }
};

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.disconnect = function disconnect(err) {
  dbg("Disconnect requested");

  // Try to disconnect
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
  }

  // Transport state must be disconnected
  const newState = this.state(); // Cascade errors
  if (newState !== "disconnected") {
    throw new Error(
      `TRANSPORT_ERROR: Transport state was '${newState}' after a call to disconnect().`
    );
  }
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportConnecting = function _processTransportConnecting(
  ...args
) {
  dbg("Observed transport connecting event");

  // Is the emission sequence valid?
  if (this._lastEmission !== "disconnect") {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connecting' event following a '${this._lastEmission}' emission.`
    );
  }

  // Were the emission arguments valid?
  if (args.length > 0) {
    throw new Error(
      "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connecting' event."
    );
  }

  // Emit
  this._lastEmission = "connecting";
  defer(this.emit.bind(this), "connecting");
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportConnect = function _processTransportConnect(...args) {
  dbg("Observed transport connect event");
  // Is the emission sequence valid?
  if (this._lastEmission !== "connecting") {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was '${this._lastEmission}'.`
    );
  }

  // Were the emission arguments valid?
  if (args.length > 0) {
    throw new Error(
      "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connect' event."
    );
  }

  // Emit
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
  // Is the emission sequence valid?
  if (this._lastEmission !== "connect" && this._lastEmission !== "message") {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was '${this._lastEmission}'.`
    );
  }

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

  // Emit
  this._lastEmission = "message";
  defer(this.emit.bind(this), "message", args[0]);
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportDisconnect = function _processTransportDisconnect(
  ...args
) {
  dbg("Observed transport disconnect event");

  // Is the emission sequence valid?
  if (this._lastEmission === "disconnect") {
    throw new Error(
      `TRANSPORT_ERROR: Transport emitted a 'disconnect' event when the previous emission was 'disconnect'.`
    );
  }

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

  // Emit
  this._lastEmission = "disconnect";
  if (args.length === 0) {
    defer(this.emit.bind(this), "disconnect");
  } else {
    defer(this.emit.bind(this), "disconnect", args[0]);
  }
};
