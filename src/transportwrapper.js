import check from "check-types";
import emitter from "component-emitter";
import _ from "lodash";

const proto = {};
emitter(proto);

/**
 * Factory function.
 * @param {object} transport
 * @throws {Error} 'INVALID_ARGUMENT: ...'
 * @returns {transportWrapper}
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

  /**
   * Pass-through to the outside-provided transport object that verifies that
   * the transport is acting as required (outside code).
   *
   * - The transport API is verified on intialization.
   *
   * - Transport function return values and errors are verified.
   *
   * - Transport event are verified.
   *
   * - Inbound function arguments are not checked (internal).
   *
   * After initialization, any problems with the transport are reported using
   * the `transportError` event.
   *
   * @extends emitter
   */
  const transportWrapper = Object.create(proto);

  /**
   * Transport being wrapped.
   * @memberof transportWrapper
   * @instance
   * @private
   * @type {object}
   */
  transportWrapper._transport = transport;

  /** Last transport state emission.
   * @memberof transportWrapper
   * @instance
   * @private
   * @type {string} disconnected, connecting, or connected
   */
  transportWrapper._lastEmission = "disconnect";

  // Listen for transport events
  transportWrapper._transport.on("connecting", (...args) => {
    transportWrapper._processTransportConnecting(...args);
  });
  transportWrapper._transport.on("connect", (...args) => {
    transportWrapper._processTransportConnect(...args);
  });
  transportWrapper._transport.on("message", (...args) => {
    transportWrapper._processTransportMessage(...args);
  });
  transportWrapper._transport.on("disconnect", (...args) => {
    transportWrapper._processTransportDisconnect(...args);
  });

  return transportWrapper;
}

// Events

/**
 * Emitted on valid transport connecting event.
 * @event connecting
 * @memberof transportWrapper
 * @instance
 */

/**
 * Emitted on valid transport connect event.
 * @event connect
 * @memberof transportWrapper
 * @instance
 */

/**
 * Emitted on valid transport message event.
 * @event message
 * @memberof transportWrapper
 * @instance
 * @param {string} message
 */

/**
 * Emitted on valid transport disconnect event.
 * @event disconnect
 * @memberof transportWrapper
 * @instance
 * @param {?Error} err Passed by the transport.
 */

/**
 * Emitted when the transport violates the prescribed behavior.
 * @event transportError
 * @memberof transportWrapper
 * @instance
 * @param {Error} err 'INVALID_RESULT: ...' Transport function returned unexpected return value or error.
 *                    'UNEXPECTED_EVENT: ...' Event not valid for current transport state.
 *                    'BAD_EVENT_ARGUMENT: ...' Event emitted with invalid argument signature.
 */

// Public functions

/**
 * @memberof transportWrapper
 * @instance
 * @throws Transport errors and 'TRANSPORT_ERROR: ...'
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
      `INVALID_RESULT: Transport threw an error on call to state().`
    );
    emitErr.transportError = transportErr;
    this.emit("transportError", emitErr);
    throw new Error(
      `TRANSPORT_ERROR: The transport unexpectedly threw an error.`
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
        `INVALID_RESULT: Transport unexpectedly returned '${st}' on a call to state() when previous emission was '${
          this._lastEmission
        }'.`
      )
    );
    throw new Error(
      `TRANSPORT_ERROR: The transport returned an unexpected state.`
    );
  }

  // Return
  return st;
};

/**
 * @memberof transportWrapper
 * @instance
 * @throws Transport errors and 'TRANSPORT_ERROR: ...'
 */
proto.connect = function connect() {
  // Try to connect
  let transportErr;
  try {
    this._transport.connect();
  } catch (e) {
    transportErr = e;
  }

  // Check the response
  if (this._lastEmission === "disconnect") {
    if (transportErr) {
      // Unexpected behavior
      const emitErr = new Error(
        `INVALID_RESULT: Transport threw an error on a call to connect() when previous emission was '${
          this._lastEmission
        }'.`
      );
      emitErr.transportError = transportErr;
      this.emit("transportError", emitErr);
      throw new Error(
        `TRANSPORT_ERROR: Transport unexpectedly threw an error.`
      );
    } else {
      // Expected behavior - relay
      return; // eslint-disable-line
    }
  } else if (transportErr) {
    // Last emission was not disconnect
    if (_.startsWith(transportErr.message, "NOT_DISCONNECTED")) {
      // Expected behavior - relay
      throw transportErr;
    } else {
      // Unexpected behavior (bad error)
      const emitErr = new Error(
        `INVALID_RESULT: Transport threw an invalid error on a call to connect().`
      );
      emitErr.transportError = transportErr;
      this.emit("transportError", emitErr);
      throw new Error(`TRANSPORT_ERROR: Transport threw an unexpected error.`);
    }
  } else {
    // Last emission was not disconnect and there was no error
    // Unexpected behavior
    const emitErr = new Error(
      `INVALID_RESULT: Transport accepted an invalid call to connect().`
    );
    this.emit("transportError", emitErr);
    throw new Error(`TRANSPORT_ERROR: Transport accepted an invalid call.`);
  }
};

/**
 * @memberof transportWrapper
 * @instance
 * @throws Transport errors and 'TRANSPORT_ERROR: ...'
 */
proto.send = function send(msg) {
  // Try to send the message
  let transportErr;
  try {
    this._transport.send(msg);
  } catch (e) {
    transportErr = e;
  }

  // Check the response
  if (this._lastEmission === "connect") {
    if (transportErr) {
      // Unexpected behavior
      const emitErr = new Error(
        `INVALID_RESULT: Transport threw an error on a call to send() when previous emission was 'connect'.`
      );
      emitErr.transportError = transportErr;
      this.emit("transportError", emitErr);
      throw new Error(
        `TRANSPORT_ERROR: Transport unexpectedly threw an error.`
      );
    } else {
      // Expected behavior - relay
      return; // eslint-disable-line
    }
  } else if (transportErr) {
    // Last emission was not connect
    if (_.startsWith(transportErr.message, "NOT_CONNECTED")) {
      // Expected behavior - relay
      throw transportErr;
    } else {
      // Unexpected behavior (bad error)
      const emitErr = new Error(
        `INVALID_RESULT: Transport threw an invalid error on a call to send().`
      );
      emitErr.transportError = transportErr;
      this.emit("transportError", emitErr);
      throw new Error(`TRANSPORT_ERROR: Transport threw an unexpected error.`);
    }
  } else {
    // Last emission was not connect and there was no error
    // Unexpected behavior
    const emitErr = new Error(
      `INVALID_RESULT: Transport accepted an invalid call to send().`
    );
    this.emit("transportError", emitErr);
    throw new Error(`TRANSPORT_ERROR: Transport accepted an invalid call.`);
  }
};

/**
 * @memberof transportWrapper
 * @instance
 * @throws Transport errors and 'TRANSPORT_ERROR: ...'
 */
proto.disconnect = function disconnect(err) {
  // Try to disconnect
  let transportErr;
  try {
    if (err) {
      this._transport.disconnect(err);
    } else {
      this._transport.disconnect();
    }
  } catch (e) {
    transportErr = e;
  }

  // Check the response
  if (this._lastEmission !== "disconnect") {
    if (transportErr) {
      // Unexpected behavior
      const emitErr = new Error(
        `INVALID_RESULT: Transport threw an error on a call to disconnect() when previous emission was 'connecting' or 'connect'.`
      );
      emitErr.transportError = transportErr;
      this.emit("transportError", emitErr);
      throw new Error(
        `TRANSPORT_ERROR: Transport unexpectedly threw an error.`
      );
    } else {
      // Expected behavior - relay
      return; // eslint-disable-line
    }
  } else if (transportErr) {
    // Last emission was discconnect
    if (_.startsWith(transportErr.message, "DISCONNECTED")) {
      // Expected behavior - relay
      throw transportErr;
    } else {
      // Unexpected behavior (bad error)
      const emitErr = new Error(
        `INVALID_RESULT: Transport threw an invalid error on a call to disconnect().`
      );
      emitErr.transportError = transportErr;
      this.emit("transportError", emitErr);
      throw new Error(`TRANSPORT_ERROR: Transport threw an unexpected error.`);
    }
  } else {
    // Last emission was not connect and there was no error
    // Unexpected behavior
    const emitErr = new Error(
      `INVALID_RESULT: Transport accepted an invalid call to disconnect().`
    );
    this.emit("transportError", emitErr);
    throw new Error(`TRANSPORT_ERROR: Transport accepted an invalid call.`);
  }
};

// Transport event processors

/**
 * @memberof transportWrapper
 * @instance
 * @private
 * @param {?Error} args
 */
proto._processTransportConnecting = function _processTransportConnecting(
  ...args
) {
  // The transport messed up if the previous state was not disconnected
  if (this._lastEmission !== "disconnect") {
    this.emit(
      "transportError",
      new Error(
        `UNEXPECTED_EVENT: Transport emitted a  'connecting' event following a '${
          this._lastEmission
        }' emission.`
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
 * @memberof transportWrapper
 * @instance
 * @private
 * @param {?Error} args
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
 * @memberof transportWrapper
 * @instance
 * @private
 * @param {?Error} args
 */
proto._processTransportMessage = function _processTransportMessage(...args) {
  // The transport messed up if the state is not connected
  if (this._lastEmission !== "connect") {
    this.emit(
      "transportError",
      new Error(
        `UNEXPECTED_EVENT: Transport emitted a 'message' event when the previous emission was '${
          this._lastEmission
        }'.`
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
 * @memberof transportWrapper
 * @instance
 * @private
 * @param {?Error} args
 */
proto._processTransportDisconnect = function _processTransportDisconnect(
  ...args
) {
  // The transport messed up if the state is not disconnected
  if (this._lastEmission === "disconnect") {
    this.emit(
      "transportError",
      new Error(
        `UNEXPECTED_EVENT: Transport emitted a  'disconnect' event when the previous emission was '${
          this._lastEmission
        }'.`
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
