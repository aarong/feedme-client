import check from "check-types";
import emitter from "component-emitter";
import queueMicrotask from "./queuemicrotask";

/**
 * Wrapper that verifies that the app-provided transport object is acting as
 * required (to the extent possible):
 *
 * - The transport API surface is validated on intialization
 * - Transport function return values and errors are validated
 * - Transport event emission sequence is validated
 *
 * Because transport state is updated synchronously and associated events are
 * emitted asynchronously, it is not possible to validate state and emissions
 * against one another.
 *
 * After initialization, all problems with the transport are reported using
 * the `transportError` event.
 *
 * The session/client are assumed to check transport state to ensure that any
 * method calls are valid. This wrapper does not validate library behavior.
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
 * @returns {TransportWrapper}
 */
export default function transportWrapperFactory(transport) {
  // Check that the transport is an object
  if (!check.object(transport)) {
    throw new Error(
      "INVALID_ARGUMENT: The supplied transport is not an object."
    );
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
      "INVALID_ARGUMENT: The supplied transport does not implement the required API."
    );
  }

  // Check that the transport state is disconnected
  if (transport.state() !== "disconnected") {
    throw new Error(
      "INVALID_ARGUMENT: The supplied transport is not disconnected."
    );
  }

  // Success
  const transportWrapper = Object.create(proto);

  /**
   * Transport object being wrapped.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {Object}
   */
  transportWrapper._transport = transport;

  /** Last transport state emission.
   * @memberof TransportWrapper
   * @instance
   * @private
   * @type {string} disconnect, connecting, or connect
   */
  transportWrapper._lastEmission = "disconnect";

  // Listen for transport events
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
 * Emitted when the transport violates the prescribed behavior.
 * @event transportError
 * @memberof TransportWrapper
 * @instance
 * @param {Error} err "INVALID_RESULT: ..."     Transport function returned unexpected return value or error
 *                    "UNEXPECTED_EVENT: ..."   Event sequence was not valid
 *                    "BAD_EVENT_ARGUMENT: ..." Event emitted with invalid arguments
 */

// Public functions

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "TRANSPORT_ERROR: ...""
 */
proto.state = function state() {
  // Try to get the state
  let transportState;
  let transportErr;
  try {
    transportState = this._transport.state();
  } catch (e) {
    transportErr = e;
  }

  // Method should never throw an error
  if (transportErr) {
    const emitErr = new Error(
      "INVALID_RESULT: Transport threw an error on call to state()."
    );
    emitErr.transportError = transportErr;
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    throw new Error(
      "TRANSPORT_ERROR: The transport unexpectedly threw an error."
    );
  }

  // Validate the state
  // Cannot validate against last emission due to emission deferrals
  if (
    transportState !== "disconnected" &&
    transportState !== "connecting" &&
    transportState !== "connected"
  ) {
    const emitErr = new Error(
      `INVALID_RESULT: Transport returned invalid state '${transportState}' on a call to state().`
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    throw new Error(
      "TRANSPORT_ERROR: The transport returned an invalid state."
    );
  }

  // Return
  return transportState;
};

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "INVALID_CALL: ..."
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.connect = function connect() {
  // Try to connect
  try {
    this._transport.connect();
  } catch (e) {
    // Invalid behavior from the transport
    const emitErr = new Error(
      `INVALID_RESULT: Transport threw an error on a call to connect().`
    );
    emitErr.transportError = e;
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    throw new Error("TRANSPORT_ERROR: Transport unexpectedly threw an error.");
  }
};

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "INVALID_CALL: ..."
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.send = function send(msg) {
  // Try to send the message
  try {
    this._transport.send(msg);
  } catch (e) {
    // Invalid behavior from the transport
    const emitErr = new Error(
      `INVALID_RESULT: Transport threw an error on a call to send().`
    );
    emitErr.transportError = e;
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    throw new Error("TRANSPORT_ERROR: Transport unexpectedly threw an error.");
  }
};

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "INVALID_CALL: ..."
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.disconnect = function disconnect(err) {
  // Try to disconnect
  try {
    if (err) {
      this._transport.disconnect(err);
    } else {
      this._transport.disconnect();
    }
  } catch (e) {
    // Invalid behavior from the transport
    const emitErr = new Error(
      `INVALID_RESULT: Transport threw an error on a call to disconnect().`
    );
    emitErr.transportError = e;
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    throw new Error("TRANSPORT_ERROR: Transport unexpectedly threw an error.");
  }
};

// Transport event processors

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportConnecting = function _processTransportConnecting(
  ...args
) {
  // Is the emission sequence valid?
  if (this._lastEmission !== "disconnect") {
    const emitErr = new Error(
      `UNEXPECTED_EVENT: Transport emitted a  'connecting' event following a '${this._lastEmission}' emission.`
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // Were the emission arguments valid?
  if (args.length > 0) {
    const emitErr = new Error(
      "BAD_EVENT_ARGUMENT: Transport passed one or more extraneous arguments with a 'connecting' event."
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // Emit
  this._lastEmission = "connecting";
  queueMicrotask(this.emit.bind(this), "connecting");
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportConnect = function _processTransportConnect(...args) {
  // Is the emission sequence valid?
  if (this._lastEmission !== "connecting") {
    const emitErr = new Error(
      `UNEXPECTED_EVENT: Transport emitted a  'connect' event when the previous emission was '${this._lastEmission}'.`
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // Were the emission arguments valid?
  if (args.length > 0) {
    const emitErr = new Error(
      "BAD_EVENT_ARGUMENT: Transport passed one or more extraneous arguments with a 'connect' event."
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // Emit
  this._lastEmission = "connect";
  queueMicrotask(this.emit.bind(this), "connect");
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportMessage = function _processTransportMessage(...args) {
  // Is the transport connected?
  const transportState = this._transport.state();
  if (transportState !== "connected") {
    const emitErr = new Error(
      `UNEXPECTED_EVENT: Transport emitted a 'message' event when the state was '${transportState}'.`
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // Valid arguments?
  if (args.length !== 1) {
    const emitErr = new Error(
      "BAD_EVENT_ARGUMENT: Received an invalid number of arguments with a 'message' event."
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // String argument?
  if (!check.string(args[0])) {
    const emitErr = new Error(
      "BAD_EVENT_ARGUMENT: Received a non-string argument with a 'message' event."
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // Emit
  queueMicrotask(this.emit.bind(this), "message", args[0]);
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportDisconnect = function _processTransportDisconnect(
  ...args
) {
  // Is the emission sequence valid?
  if (this._lastEmission === "disconnect") {
    const emitErr = new Error(
      `UNEXPECTED_EVENT: Transport emitted a  'disconnect' event when the previous emission was 'disconnect'.`
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // Valid arguments?
  if (args.length > 1) {
    const emitErr = new Error(
      "BAD_EVENT_ARGUMENT: Received one or more extraneous arguments with a 'disconnect' event."
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // Error valid if specified?
  if (args.length === 1 && !check.instance(args[0], Error)) {
    const emitErr = new Error(
      "BAD_EVENT_ARGUMENT: Received a non-Error argument with a 'disconnect' event."
    );
    queueMicrotask(this.emit.bind(this), "transportError", emitErr);
    return; // Stop
  }

  // Emit
  this._lastEmission = "disconnect";
  if (args.length === 0) {
    queueMicrotask(this.emit.bind(this), "disconnect");
  } else {
    queueMicrotask(this.emit.bind(this), "disconnect", args[0]);
  }
};