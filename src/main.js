import check from "check-types";
import _clone from "lodash/clone";
import clientSync from "./client.sync";
import clientWrapper from "./client.wrapper";
import sessionSync from "./session.sync";
import sessionWrapper from "./session.wrapper";
import transportWrapper from "./transport.wrapper";

/**
 * Outward-facing client factory function.
 *
 * Takes options from the application, wraps the transport, and returns a
 * ClientWrapper object. The options parameter is identical to that taken by
 * ClientSync except a transport property is required rather than a session.
 *
 * @throws {Error} "INVALID_ARGUMENT: ..."
 * @throws {Error} "TRANSPORT_ERROR: ..."
 * @returns {Client}
 */
export default function feedmeClient(options) {
  // Check options
  if (!check.object(options)) {
    throw new Error("INVALID_ARGUMENT: Invalid options argument.");
  }

  // Create the client options object, initialize, and return
  // Cascade all errors
  const clientOptions = _clone(options);
  delete clientOptions.transport;
  clientOptions.sessionWrapper = sessionWrapper(
    sessionSync(transportWrapper(options.transport))
  );
  return clientWrapper(clientSync(clientOptions));
}
