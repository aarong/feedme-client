import makeError from "make-error";

/**
 * @constructor
 * @extends Error
 */
const ArgumentError = makeError("ArgumentError");

/**
 * @constructor
 * @extends Error
 */
const StateError = makeError("StateError");

/**
 * @constructor
 * @extends Error
 */
const ConnectionError = makeError("ConnectionError");

/**
 * @constructor
 * @extends Error
 */
const HandshakeError = makeError("HandshakeError");

/**
 * @constructor
 * @extends Error
 */
const ServerMessageError = makeError("ServerMessageError");

/**
 * @constructor
 * @extends Error
 */
const ResponseTimeoutError = makeError("ResponseTimeoutError");

/**
 * @constructor
 * @extends Error
 */
const RejectionError = makeError("RejectionError");

/**
 * @constructor
 * @extends Error
 */
const TerminationError = makeError("TerminationError");

/**
 * @constructor
 * @extends Error
 */
const ViolationResponseError = makeError("ViolationResponseError");

/**
 * @constructor
 * @extends Error
 */
const TransportError = makeError("TransportError");

export {
  ArgumentError,
  StateError,
  ConnectionError,
  HandshakeError,
  ServerMessageError,
  ResponseTimeoutError,
  RejectionError,
  TerminationError,
  ViolationResponseError,
  TransportError,
};
