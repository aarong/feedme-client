import check from "check-types";
import emitter from "component-emitter";

/**
 * Wrapper over the app-provided transport object that verifies that
 * the transport is acting as required (outside code).
 *
 * - The transport API is validated on intialization
 * - Transport function return values and errors are validated
 * - Transport event emissions are validated
 * - Function invocation sequence is validated (but arguments are not)
 *
 * After initialization, any problems with the transport are reported using
 * the `transportError` event.
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
   * @type {string} disconnected, connecting, or connected
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
 *                    "UNEXPECTED_EVENT: ..."   Event not valid for current transport state
 *                    "BAD_EVENT_ARGUMENT: ..." Event emitted with invalid argument signature
 */

// Public functions

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "TRANSPORT_ERROR: ...""
 */
proto.state = function state() {
  // Try to get the state
  let st;
  let transportErr;
  try {
    st = this._transport.state();
  } catch (e) {
    transportErr = e;
  }

  // Did it throw an error? Never should
  if (transportErr) {
    const emitErr = new Error(
      "INVALID_RESULT: Transport threw an error on call to state()."
    );
    emitErr.transportError = transportErr;
    this.emit("transportError", emitErr);
    throw new Error(
      "TRANSPORT_ERROR: The transport unexpectedly threw an error."
    );
  }

  // Was the state as expected?
  if (
    !(st === "disconnected" && this._lastEmission === "disconnect") &&
    !(st === "connecting" && this._lastEmission === "connecting") &&
    !(st === "connected" && this._lastEmission === "connect")
  ) {
    this.emit(
      "transportError",
      new Error(
        `INVALID_RESULT: Transport unexpectedly returned '${st}' on a call to state() when previous emission was '${this._lastEmission}'.` // prettier-ignore
      )
    );
    throw new Error(
      "TRANSPORT_ERROR: The transport returned an unexpected state."
    );
  }

  // Return
  return st;
};

/**
 * @memberof TransportWrapper
 * @instance
 * @throws {Error} "INVALID_CALL: ..."
 * @throws {Error} "TRANSPORT_ERROR: ..."
 */
proto.connect = function connect() {
  // Check invocation sequence (library behavior)
  if (this._lastEmission !== "disconnect") {
    throw new Error(
      "INVALID_CALL: Library called connect() when transport state was not 'disconnected'."
    );
  }

  // Try to connect
  try {
    this._transport.connect();
  } catch (e) {
    // Invalid behavior from the transport
    const emitErr = new Error(
      `INVALID_RESULT: Transport threw an error on a call to connect() when previous emission was '${this._lastEmission}'.` // prettier-ignore
    );
    emitErr.transportError = e;
    this.emit("transportError", emitErr);
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
  // Check invocation sequence (library behavior)
  if (this._lastEmission !== "connect") {
    throw new Error(
      "INVALID_CALL: Library called send() when transport state was not 'connected'."
    );
  }

  // Try to send the message
  try {
    this._transport.send(msg);
  } catch (e) {
    // Invalid behavior from the transport
    const emitErr = new Error(
      "INVALID_RESULT: Transport threw an error on a call to send() when previous emission was 'connect'."
    );
    emitErr.transportError = e;
    this.emit("transportError", emitErr);
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
  // Check invocation sequence (library behavior)
  if (this._lastEmission === "disconnect") {
    throw new Error(
      "INVALID_CALL: Library called disconnect() when transport state was 'disconnected'."
    );
  }

  // Try to disconnect
  try {
    if (err) {
      this._transport.disconnect(err);
    } else {
      this._transport.disconnect();
    }
  } catch (e) {
    // Invalid behavior from the transpor
    const emitErr = new Error(
      `INVALID_RESULT: Transport threw an error on a call to disconnect() when previous emission was 'connecting' or 'connect'.`
    );
    emitErr.transportError = e;
    this.emit("transportError", emitErr);
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
  // The transport messed up if the previous state was not disconnected
  if (this._lastEmission !== "disconnect") {
    this.emit(
      "transportError",
      new Error(
        `UNEXPECTED_EVENT: Transport emitted a  'connecting' event following a '${this._lastEmission}' emission.` // prettier-ignore
      )
    );
    return; // Stop
  }

  // Were the emission arguments valid?
  if (args.length > 0) {
    this.emit(
      "transportError",
      new Error(
        "BAD_EVENT_ARGUMENT: Transport passed one or more extraneous arguments with the 'connecting' event."
      )
    );
    return; // Stop
  }

  // Emit
  this._lastEmission = "connecting";
  this.emit("connecting");
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportConnect = function _processTransportConnect(...args) {
  // The transport messed up if the previous state was not connecting
  if (this._lastEmission !== "connecting") {
    this.emit(
      "transportError",
      new Error(
        `UNEXPECTED_EVENT: Transport emitted a  'connect' event following an emission other than 'connecting'.`
      )
    );
    return; // Stop
  }

  // Were the emission arguments valid?
  if (args.length > 0) {
    this.emit(
      "transportError",
      new Error(
        "BAD_EVENT_ARGUMENT: Transport passed one or more extraneous arguments with the 'connect' event."
      )
    );
    return; // Stop
  }

  // Emit
  this._lastEmission = "connect";
  this.emit("connect");
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportMessage = function _processTransportMessage(...args) {
  // The transport messed up if the state is not connected
  if (this._lastEmission !== "connect") {
    this.emit(
      "transportError",
      new Error(
        `UNEXPECTED_EVENT: Transport emitted a 'message' event when the previous emission was '${this._lastEmission}'.` // prettier-ignore
      )
    );
    return; // Stop
  }

  // Valid arguments?
  if (args.length !== 1) {
    this.emit(
      "transportError",
      new Error(
        "BAD_EVENT_ARGUMENT: Received an invalid number of arguments with a 'message' event."
      )
    );
    return; // Stop
  }

  // String argument?
  if (!check.string(args[0])) {
    this.emit(
      "transportError",
      new Error(
        "BAD_EVENT_ARGUMENT: Received a non-string argument with the 'message' event."
      )
    );
    return; // Stop
  }

  // Emit
  this.emit("message", args[0]);
};

/**
 * @memberof TransportWrapper
 * @instance
 * @private
 */
proto._processTransportDisconnect = function _processTransportDisconnect(
  ...args
) {
  // The transport messed up if the state is not disconnected
  if (this._lastEmission === "disconnect") {
    this.emit(
      "transportError",
      new Error(
        `UNEXPECTED_EVENT: Transport emitted a  'disconnect' event when the previous emission was '${this._lastEmission}'.` // prettier-ignore
      )
    );
    return; // Stop
  }

  // Valid arguments?
  if (args.length > 1) {
    this.emit(
      "transportError",
      new Error(
        "BAD_EVENT_ARGUMENT: Received one or more extraneous arguments with the 'disconnect' event."
      )
    );
    return; // Stop
  }

  // Error valid if specified?
  if (args.length === 1 && !check.instance(args[0], Error)) {
    this.emit(
      "transportError",
      new Error(
        "BAD_EVENT_ARGUMENT: Received a non-Error argument with the 'disconnect' event."
      )
    );
    return; // Stop
  }

  // Emit
  this._lastEmission = "disconnect";
  if (args.length === 0) {
    this.emit("disconnect");
  } else {
    this.emit("disconnect", args[0]);
  }
};
