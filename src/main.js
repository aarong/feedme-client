import check from "check-types";
import _clone from "lodash/clone";
import clientSync from "./client.sync";
import clientWrapper from "./client.wrapper";
import session from "./session";
import transportWrapper from "./transportwrapper";

/**
 * Outward-facing client factory function.
 *
 * Takes options from the application, wraps the transport, and returns a
 * ClientWrapper object. The options parameter is identical to that taken by
 * ClientSync except a transport property is required rather than a session.
 *
 * @throws {Error} "INVALID_ARGUMENT: ..."
 * @returns {Client}
 */
export default function feedmeClient(options) {
  // Check options
  if (!check.object(options)) {
    throw new Error("INVALID_ARGUMENT: Invalid options argument.");
  }

  // Check options.transport
  if (!check.object(options.transport)) {
    throw new Error("INVALID_ARGUMENT: Invalid options.transport.");
  }

  // Create the client options object, initialize, and return
  const clientOptions = _clone(options);
  delete clientOptions.transport;
  clientOptions.session = session(transportWrapper(options.transport));
  return clientWrapper(clientSync(clientOptions));
}
