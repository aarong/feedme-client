import check from "check-types";
import emitter from "component-emitter";
import defer from "./defer";

/**
 * Wrapper for SessionSync objects that defers and queues all event emissons and
 * callback invocations.
 * @typedef {Object} SessionWrapper
 * @extends emitter
 */
const proto = emitter({});

/**
 * SessionWrapper factory function.
 * @param {SessionSync} SessionSync
 * @throws {Error}      "INVALID_ARGUMENT: ..."
 * @returns {SessionWrapper}
 */
export default function sessionWrapperFactory(sessionSync) {
  // Check object being wrapped
  if (!check.object(sessionSync)) {
    throw new Error("INVALID_ARGUMENT: Argument must be an object.");
  }

  const sessionWrapper = Object.create(proto);

  /**
   * @memberof SessionWrapper
   * @instance
   * @private
   * @type {SessionSync}
   */
  sessionWrapper._sessionSync = sessionSync;

  // Relay SessionSync events - defer and queue
  const evts = [
    "connecting",
    "connect",
    "disconnect",
    "actionRevelation",
    "unexpectedFeedClosing",
    "unexpectedFeedClosed",
    "badServerMessage",
    "badClientMessage",
    "transportError"
  ];
  evts.forEach(evt => {
    sessionWrapper._sessionSync.on(evt, (...args) => {
      defer(sessionWrapper.emit.bind(sessionWrapper), evt, ...args);
    });
  });

  return sessionWrapper;
}

/**
 * Deferred and queued from SessionSync.
 * @event connecting
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Deferred and queued from SessionSync.
 * @event connect
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Deferred and queued from SessionSync.
 * @event disconnect
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Deferred and queued from SessionSync.
 * @event actionRevelation
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Deferred and queued from SessionSync.
 * @event unexpectedFeedClosing
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Deferred and queued from SessionSync.
 * @event unexpectedFeedClosed
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Deferred and queued from SessionSync.
 * @event badServerMessage
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Deferred and queued from SessionSync.
 * @event badClientMessage
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Deferred and queued from SessionSync.
 * @callback actionCallback
 * @memberof SessionWrapper
 */

/**
 * Deferred and queued from SessionSync.
 * @callback feedOpenCallback
 * @memberof SessionWrapper
 */

/**
 * Deferred and queued from SessionSync.
 * @callback feedCloseCallback
 * @memberof SessionWrapper
 */

/**
 * Routed directly to SessionSync.
 * @method state
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Routed directly to SessionSync.
 * @method connect
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Routed directly to SessionSync.
 * @method disconnect
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Routed directly to SessionSync.
 * @method id
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Routed directly to SessionSync.
 * @method feedState
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Routed directly to SessionSync.
 * @method feedData
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Routed directly to SessionSync.
 * @method destroy
 * @memberof SessionWrapper
 * @instance
 */

/**
 * Routed directly to SessionSync.
 * @method destroyed
 * @memberof SessionWrapper
 * @instance
 */
[
  "state",
  "connect",
  "disconnect",
  "feedState",
  "feedData",
  "destroy",
  "destroyed"
].forEach(method => {
  proto[method] = function callMethod(...args) {
    return this._sessionSync[method](...args);
  };
});

/**
 * Routed to SessionSync and callbacks are deferred.
 * @method action
 * @memberof SessionWrapper
 * @instance
 */
proto.action = function action(actionName, actionArgs, callback) {
  // Validate the callback if present (function always passed to wrapped object)
  if (!check.function(callback)) {
    throw new Error("INVALID_ARGUMENT: Invalid callback.");
  }

  this._sessionSync.action(actionName, actionArgs, (...args) => {
    defer(callback, ...args);
  });
};

/**
 * Routed to SessionSync and callbacks are deferred.
 * @method feedOpen
 * @memberof SessionWrapper
 * @instance
 */
proto.feedOpen = function feedOpen(feedName, feedArgs, callback) {
  // Validate the callback if present (function always passed to wrapped object)
  if (!check.function(callback)) {
    throw new Error("INVALID_ARGUMENT: Invalid callback.");
  }

  this._sessionSync.feedOpen(feedName, feedArgs, (...args) => {
    defer(callback, ...args);
  });
};

/**
 * Routed to SessionSync and callbacks are deferred.
 * @method feedClose
 * @memberof SessionWrapper
 * @instance
 */
proto.feedClose = function feedClose(feedName, feedArgs, callback) {
  // Validate the callback if present (function always passed to wrapped object)
  if (!check.function(callback)) {
    throw new Error("INVALID_ARGUMENT: Invalid callback.");
  }

  this._sessionSync.feedClose(feedName, feedArgs, (...args) => {
    defer(callback, ...args);
  });
};
