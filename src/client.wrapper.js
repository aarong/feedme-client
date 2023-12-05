import check from "check-types";
import emitter from "component-emitter";
import defer from "./defer";

/**
 * Wrapper for ClientSync objects that defers and queues all event emissons and
 * callback invocations and overlays a promise API.
 * @typedef {Object} ClientWrapper
 * @extends emitter
 */
const clientWrapperProto = emitter({});

/**
 * ClientWrapper factory function.
 * @param {ClientSync} clientSync
 * @throws {Error}      "INVALID_ARGUMENT: ..."
 * @returns {ClientWrapper}
 */
function clientWrapperFactory(clientSync) {
  // Check object being wrapped
  if (!check.object(clientSync)) {
    throw new Error("INVALID_ARGUMENT: Argument must be an object.");
  }

  const clientWrapper = Object.create(clientWrapperProto);

  /**
   * @memberof ClientWrapper
   * @instance
   * @private
   * @type {ClientSync}
   */
  clientWrapper._clientSync = clientSync;

  // Relay ClientSync events - defer and queue
  const evts = [
    "connecting",
    "connect",
    "disconnect",
    "badServerMessage",
    "badClientMessage",
    "transportError",
  ];
  evts.forEach((evt) => {
    clientWrapper._clientSync.on(evt, (...args) => {
      defer(clientWrapper.emit.bind(clientWrapper), evt, ...args);
    });
  });

  return clientWrapper;
}

/**
 * Deferred and queued from ClientSync.
 * @event connecting
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Deferred and queued from ClientSync.
 * @event connect
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Deferred and queued from ClientSync.
 * @event disconnect
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Deferred and queued from ClientSync.
 * @event badServerMessage
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Deferred and queued from ClientSync.
 * @event badClientMessage
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Deferred and queued from ClientSync.
 * @callback actionCallback
 * @memberof ClientWrapper
 */

/**
 * Wrapper for FeedSync that defers and queues all event emissIons.
 * @typedef {Object} FeedWrapper
 * @extends emitter
 */
const feedWrapperProto = emitter({});

/**
 * FeedWrapper factory function.
 * @param {FeedSync} feedSync
 * @throws {Error} "INVALID_ARGUMENT: ..."
 * @returns {FeedWrapper}
 */
function feedWrapperFactory(feedSync) {
  const feedWrapper = Object.create(feedWrapperProto);

  /**
   * @memberof FeedWrapper
   * @instance
   * @private
   * @type {FeedSync}
   */
  feedWrapper._feedSync = feedSync;

  // Relay FeedSync events - defer and queue
  const evts = ["opening", "open", "close", "action"];
  evts.forEach((evt) => {
    feedWrapper._feedSync.on(evt, (...eargs) => {
      defer(feedWrapper.emit.bind(feedWrapper), evt, ...eargs);
    });
  });

  return feedWrapper;
}

/**
 * Deferred and queued from FeedSync.
 * @event opening
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Deferred and queued from FeedSync.
 * @event open
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Deferred and queued from FeedSync.
 * @event close
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Deferred and queued from FeedSync.
 * @event action
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Routed directly to ClientSync.
 * @method state
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Routed directly to ClientSync.
 * @method connect
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Routed directly to ClientSync.
 * @method disconnect
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Routed directly to ClientSync.
 * @method id
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Routed directly to ClientSync.
 * @method destroy
 * @memberof ClientWrapper
 * @instance
 */

/**
 * Routed directly to ClientSync.
 * @method destroyed
 * @memberof ClientWrapper
 * @instance
 */

["state", "connect", "disconnect", "destroy", "destroyed"].forEach((method) => {
  clientWrapperProto[method] = function callMethod(...args) {
    return this._clientSync[method](...args);
  };
});

/**
 * Routed to ClientSync. Callbacks are deferred and queued and promise API overlaid.
 * @method action
 * @memberof ClientWrapper
 * @instance
 */
clientWrapperProto.action = function action(...args) {
  // Get arguments
  const actionName = args.length > 0 ? args[0] : undefined;
  const actionArgs = args.length > 1 ? args[1] : undefined;
  const callback = args.length > 2 ? args[2] : undefined;

  // Validate the callback if present (function always passed to wrapped object)
  if (args.length >= 3 && !check.function(callback)) {
    throw new Error("INVALID_ARGUMENT: Invalid callback.");
  }

  let promise;
  let resolve;
  let reject;

  if (callback) {
    // Callback responses must be deferred explicitly as microtasks
    promise = undefined;
    resolve = (actionData) => {
      defer(callback, undefined, actionData);
    };
    reject = (err) => {
      defer(callback, err);
    };
  } else {
    // Promise responses are deferred implicitly as microtasks
    promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
  }

  // Call action - errors cascade for both callback and promise usage
  this._clientSync.action(actionName, actionArgs, (err, actionData) => {
    if (err) {
      reject(err);
    } else {
      resolve(actionData);
    }
  });

  // Return promise/undefined
  return promise;
};

/**
 * Routed to ClientSync and wraps the result in a FeedWrapper.
 * @method feed
 * @memberof ClientWrapper
 * @returns {FeedWrapper}
 * @instance
 */
clientWrapperProto.feed = function feed(...args) {
  const feedSync = this._clientSync.feed(...args);
  return feedWrapperFactory(feedSync);
};

/**
 * Routed directly to FeedSync.
 * @method desireOpen
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Routed directly to FeedSync.
 * @method desireClosed
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Routed directly to FeedSync.
 * @method desiredState
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Routed directly to FeedSync.
 * @method state
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Routed directly to FeedSync.
 * @method data
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Routed directly to FeedSync.
 * @method destroy
 * @memberof FeedWrapper
 * @instance
 */

/**
 * Routed directly to FeedSync.
 * @method destroyed
 * @memberof FeedWrapper
 * @instance
 */

[
  "desireOpen",
  "desireClosed",
  "desiredState",
  "state",
  "data",
  "destroy",
  "destroyed",
].forEach((method) => {
  feedWrapperProto[method] = function callMethod(...args) {
    return this._feedSync[method](...args);
  };
});

export default clientWrapperFactory;
