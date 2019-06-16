import check from "check-types";
import client from "./client";
import session from "./session";
import transportWrapper from "./transportwrapper";

/**
 * Outward-facing client factory function.
 *
 * Takes a transport from outside, wraps it, creates session object, and injects it
 * into client (far better for client testing to inject session).
 *
 * The options parameter is identical to that taken by client, but a transport
 * property is required rather than a session.
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

  // Create transport wrapper
  const wrapper = transportWrapper(options.transport);

  // Create a session using the transport, inject it into the client, and return the client
  delete options.transport; // eslint-disable-line no-param-reassign
  options.session = session(wrapper); // eslint-disable-line no-param-reassign
  const c = client(options);
  return c;
}
