import check from "check-types";
import debug from "debug";
import { EventEmitter } from "events";
import { ArgumentError } from "./errors";
import promiseCallback from "./promisecallback";

const dbg = debug("feedme-client:clientfeed");

// FeedmeClientFeed

/**
 * App-facing feed object API.
 * @constructor
 * @extends EventEmitter
 * @param {FeedmeClient} client
 * @param {FeedNameArgs} feedNameArgs
 * @param {string} feedObjectId
 */
const FeedmeClientFeed = function FeedmeClientFeed(
  client,
  feedNameArgs,
  feedObjectId,
) {
  dbg("Initializing feed object");

  EventEmitter.call(this);

  /**
   * @memberof FeedmeClientFeed
   * @instance
   * @type {FeedmeClient}
   */
  this._client = client;

  /**
   * Kept internally so that calls to feed.name() and feed.args() can be
   * serviced after the feed object is closed.
   * @memberof FeedmeClientFeed
   * @instance
   * @type {FeedNameArgs}
   */
  this._feedNameArgs = feedNameArgs;

  /**
   * @memberof FeedmeClientFeed
   * @instance
   * @type {string}
   */
  this._feedObjectId = feedObjectId;
};

FeedmeClientFeed.prototype = Object.create(EventEmitter.prototype);
FeedmeClientFeed.prototype.constructor = FeedmeClientFeed;

/**
 * @event action
 * @memberof FeedmeClientFeed
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */

/**
 * @event action:name
 * @memberof FeedmeClientFeed
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */

/**
 * @event close
 * @memberof FeedmeClientFeed
 * @param {?(TerminationError|ConnectionError)} err
 */

// Public Methods

/**
 * @memberof FeedmeClientFeed
 * @instance
 * @param {?Function} callback
 * @throws {ArgumentError|StateError}
 */
FeedmeClientFeed.prototype.close = function close(callback) {
  // Check callback
  if (callback && !check.function(callback)) {
    throw new ArgumentError("Callback must be a function.");
  }

  // Callback-style or promise-style usage?
  const { promise, innerCallback } = promiseCallback(callback);

  this._client._coordinato.feedObjectClose(this._feedObjectId, innerCallback); // Intentionally cascade StateError

  return promise; // Promise or undefined
};

// Public properties

/**
 * @name client
 * @type {FeedmeClient}
 * @memberof FeedmeClientFeed
 * @instance
 */
Object.defineProperty(FeedmeClientFeed.prototype, "client", {
  enumerable: true,
  get() {
    return this._client;
  },
});

/**
 * @name name
 * @type {string}
 * @memberof FeedmeClientFeed
 * @instance
 */
Object.defineProperty(FeedmeClientFeed.prototype, "name", {
  enumerable: true,
  get() {
    return this._feedNameArgs.name();
  },
});

/**
 * @name args
 * @type {Object}
 * @memberof FeedmeClientFeed
 * @instance
 */
Object.defineProperty(FeedmeClientFeed.prototype, "args", {
  enumerable: true,
  get() {
    return this._feedNameArgs.args();
  },
});

/**
 * @name state
 * @type {FeedState} OPEN or CLOSED
 * @memberof FeedmeClientFeed
 * @instance
 */
Object.defineProperty(FeedmeClientFeed.prototype, "state", {
  enumerable: true,
  get() {
    return this._client._coordinator.feedObjectState(this._feedObjectId); // OPEN or CLOSED, no errors
  },
});

/**
 * @name data
 * @type {?Object}
 * @memberof FeedmeClientFeed
 * @instance
 */
Object.defineProperty(FeedmeClientFeed.prototype, "data", {
  enumerable: true,
  get() {
    return this._client._coordinator.feedObjectData(this._feedObjectId); // May be null, already frozen if not
  },
});

// Exports

export default FeedmeClientFeed;
