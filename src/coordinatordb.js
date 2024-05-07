import _concat from "lodash/concat";
import { FeedState } from "./states";
import uniqueId from "./uniqueid";

/**
 * Efficient data storage and retrieval for the Coordinator. Stores action
 * callbacks while pending, master feed state/data (which may lag the
 * Conversation), and feed object state/data (which may lag the master).
 *
 * This API is not intended to be general. It is geared for the specific
 * requirements of the Coordinator.
 *
 * Mostly relies on correct usage by the Coordinator - checks states, but not
 * argument types.
 *
 * Master feed states:
 * - open: feed objects are either open or they will be soon
 * - closed: feed objects are either closed or they will be soon
 *
 * Feed object internal states (differ from app-facing state of open/closed)
 * - opening:  coord.feedObject(cb) was called but it has not called back; callback stored
 * - open:     coord.feedObject() callback invoked with success; feed data stored
 * - closing:  coord.feedObjectClose() was called but feedObjectClose not yet emitted; feed data stored
 * - closed:   feedObjectClose event has been emitted
 *
 * For feed objects, you want fast:
 * - Lookups by object id
 * - Lookups by state
 * - Lookups by feed name/args
 *
 * @constructor
 */
const CoordinatorDb = function CoordinatorDb() {
  /**
   * Cannot be a Set. App is entitled to use the same callback function multiple times.
   * @memberof CoordinatorDb
   * @instance
   * @type {Array<Function>}
   */
  this._connectCallbacks = [];

  /**
   * Cannot be a Set. App is entitled to use the same callback function multiple times.
   * @memberof CoordinatorDb
   * @instance
   * @type {Array<Function>}
   */
  this._disconnectCallbacks = [];

  /**
   * Cannot be a Set. App is entitled to use the same callback function multiple times.
   * @memberof CoordinatorDb
   * @instance
   * @type {Array<Function>}
   */
  this._feedObjectCloseCallbacks = [];

  /**
   * Callback functions indexed by callback id.
   * @memberof CoordinatorDb
   * @instance
   * @type {Object}
   */
  this._actionCallbacks = {};

  /**
   * Indexed by serial. Present means master feed is open, missing means
   * master feed is closed.
   * @memberof CoordinatorDb
   * @instance
   * @type {Object}
   */
  this._masterFeedData = {};

  /**
   * Master feed object data storage, indexed by feed object id.
   *
   * Feed object storage
   *  - If opening:   _feedObjects[objectId] = { feedNameArgs, internalState, callback}
   *  - If open:      _feedObjects[objectId] = { feedNameArgs, internalState, feedData}
   *  - If closing:   _feedObjects[objectId] = { feedNameArgs, internalState, feedData}
   *  - If closed:    (missing)
   * @memberof CoordinatorDb
   * @instance
   * @type {Object}
   */
  this._feedObjects = {};

  /**
   * Feed object index that enables fast lookup of feed object ids by feed
   * name/args and state.
   *
   * If a given feed name/arg combo has one or more feed objects not closed:
   *
   * _feedObjectIndex[serial] = {
   *   feedNameArgs,
   *   opening: Set of objectIds,
   *   open: Set of objectIds,
   *   closing: Set of objectIds
   * }
   *
   * @memberof CoordinatorDb
   * @instance
   * @type {Object}
   */
  this._feedObjectIndex = {};
};

// connect() callbacks

/**
 * Register a new connect() callback function.
 * @memberof CoordinatorDb
 * @instance
 * @param {Function} callback
 */
CoordinatorDb.prototype.newConnectCallback = function newConnectCallback(
  callback,
) {
  this._connectCallbacks.push(callback); // Duplicates permitted
};

/**
 * Return all connect() callback functions and clear.
 * @memberof CoordinatorDb
 * @instance
 */
CoordinatorDb.prototype.pullConnectCallbacks = function pullConnectCallbacks() {
  const callbacks = this._connectCallbacks;
  this._connectCallbacks = [];
  return callbacks;
};

// disconnect() callbacks

/**
 * Register a new disconnect() callback function.
 * @memberof CoordinatorDb
 * @instance
 * @param {Function} callback
 */
CoordinatorDb.prototype.newDisconnectCallback = function newDisconnectCallback(
  callback,
) {
  this._disconnectCallbacks.push(callback); // Duplicates permitted
};

/**
 * Return all disconnect() callback functions and clear.
 * @memberof CoordinatorDb
 * @instance
 */
CoordinatorDb.prototype.pullConnectCallbacks = function pullConnectCallbacks() {
  const callbacks = this._disconnectCallbacks;
  this._disconnectCallbacks = [];
  return callbacks;
};

// feedObjectClose() callbacks

/**
 * Register a new feedObjectClose() callback function.
 * @memberof CoordinatorDb
 * @instance
 * @param {Function} callback
 */
CoordinatorDb.prototype.newFeedObjectCloseCallback =
  function newFeedObjectCloseCallback(callback) {
    this._feedObjectCloseCallbacks.push(callback); // Duplicates permitted
  };

/**
 * Return all feedObjectClose() callback functions and clear.
 * @memberof CoordinatorDb
 * @instance
 */
CoordinatorDb.prototype.pullFeedObjectCloseCallbacks =
  function pullFeedObjectCloseCallbacks() {
    const callbacks = this._feedObjectCloseCallbacks;
    this._feedObjectCloseCallbacks = [];
    return callbacks;
  };

// action() callbacks

/**
 * Register a new action callback function.
 * @memberof CoordinatorDb
 * @instance
 * @param {Function} callback
 * @returns {string} callbackId
 */
CoordinatorDb.prototype.newActionCallback = function newActionCallback(
  callback,
) {
  const callbackId = uniqueId();
  this._actionCallbacks[callbackId] = callback;
  return callbackId;
};

/**
 * Retrieve and remove a specific action callback function.
 * @memberof CoordinatorDb
 * @instance
 * @param {string} callbackId
 * @returns {Function} callback
 * @throws {Error}
 */
CoordinatorDb.prototype.pullActionCallback = function pullActionCallback(
  callbackId,
) {
  if (!(callbackId in this._actionCallbacks)) {
    throw new Error("Callback id not found.");
  }
  const callback = this._actionCallbacks[callbackId];
  delete this._actionCallbacks[callbackId];
  return callback;
};

/**
 * Retrieve and remove all callback functions.
 * @memberof CoordinatorDb
 * @instance
 * @returns {Array<Function>}
 */
CoordinatorDb.prototype.pullActionCallbacks = function pullActionCallbacks() {
  return Object.values(this._actionCallbacks); // May be empty
};

// Master feed state/data

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @param {Object} feedData
 * @throws {Error}
 */
CoordinatorDb.prototype.setMasterFeedOpen = function setMasterFeedOpen(
  feedNameArgs,
  feedData,
) {
  const feedSerial = feedNameArgs.serial();
  if (feedSerial in this._masterFeedData) {
    throw new Error("Feed name/arg combo is not closed.");
  }
  this._masterFeedData[feedSerial] = feedData;
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @param {Object} feedData
 * @throws {Error}
 */
CoordinatorDb.prototype.setMasterFeedData = function setMasterFeedData(
  feedNameArgs,
  feedData,
) {
  const feedSerial = feedNameArgs.serial();
  if (!(feedSerial in this._masterFeedData)) {
    throw new Error("Feed name/arg combo is not open.");
  }
  this._masterFeedData[feedSerial] = feedData;
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @throws {Error}
 */
CoordinatorDb.prototype.setMasterFeedClosed = function setMasterFeedClosed(
  feedNameArgs = null,
) {
  const feedSerial = feedNameArgs.serial();
  if (!(feedSerial in this._masterFeedData)) {
    throw new Error("Feed name/arg combo is already closed.");
  }
  delete this._masterFeedData[feedSerial];
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @returns {FeedState} OPEN or CLOSED
 */
CoordinatorDb.prototype.getMasterFeedState = function getMasterFeedState(
  feedNameArgs,
) {
  return feedNameArgs.serial() in this._masterFeedData
    ? FeedState.OPEN
    : FeedState.CLOSED;
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @returns {Object}
 * @throws {Error}
 */
CoordinatorDb.prototype.getMasterFeedData = function getMasterFeedData(
  feedNameArgs,
) {
  const feedSerial = feedNameArgs.serial();
  if (!(feedSerial in this._masterFeedData)) {
    throw new Error("Feed name/arg combo is closed.");
  }
  return this._masterFeedData[feedNameArgs.serial()];
};

// Feed callbacks/objects - setters

/**
 * Returns a feed object id for a new feed object. Initialized in the OPENING
 * state.
 * @memberof CoordinatorDb
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @param {Function} callback
 * @returns {string} feedObjectId
 */
CoordinatorDb.prototype.newFeedObject = function newFeedObject(
  feedNameArgs,
  callback,
) {
  const feedObjectId = uniqueId();
  const feedSerial = feedNameArgs.serial();

  // Ensure present in _feedObjectIndex first
  // That way there is only one FeedNameArgs object stored for each name/arg combo
  let feedObjectIndex;
  if (feedSerial in this._feedObjectIndex) {
    feedObjectIndex = this._feedObjectIndex[feedSerial];
  } else {
    feedObjectIndex = {
      feedNameArgs,
      opening: new Set(),
      open: new Set(),
      closing: new Set(),
    };
    this._feedObjectIndex[feedSerial] = feedObjectIndex;
  }
  feedObjectIndex.opening.add(feedObjectId);

  // Create _feedObject
  this._feedObjects[feedObjectId] = {
    feedNameArgs: feedObjectIndex.feedNameArgs, // Single object retained
    internalState: FeedState.OPENING,
    callback,
  };

  return feedObjectId;
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {string} feedObjectId
 * @param {Object} feedData
 */
CoordinatorDb.prototype.setFeedObjectOpen = function setFeedObjectOpen(
  feedObjectId,
  feedData,
) {
  if (!(feedObjectId in this._feedObjects)) {
    throw new Error("Feed object not found.");
  }

  const feedObject = this._feedObjects[feedObjectId];

  if (feedObject.internalState !== FeedState.OPENING) {
    throw new Error("Feed object not opening.");
  }

  // Update feed object
  feedObject.internalState = FeedState.OPEN;
  delete feedObject.callback;
  feedObject.feedData = feedData;

  // Update index
  const feedObjectIndex =
    this._feedObjectIndex[feedObject.feedNameArgs.serial()];
  feedObjectIndex.opening.delete(feedObjectId);
  feedObjectIndex.open.add(feedObjectId);
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {string} feedObjectId
 * @param {Object} feedData
 */
CoordinatorDb.prototype.setFeedObjectData = function setFeedObjectData(
  feedObjectId,
  feedData,
) {
  if (!(feedObjectId in this._feedObjects)) {
    throw new Error("Feed object not found.");
  }

  const feedObject = this._feedObjects[feedObjectId];

  if (feedObject.internalState !== FeedState.OPEN) {
    throw new Error("Feed object not open.");
  }

  this._feedObjects[feedObjectId].feedData = feedData;
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {string} feedObjectId
 */
CoordinatorDb.prototype.setFeedObjectClosing = function setFeedObjectClosing(
  feedObjectId,
) {
  if (!(feedObjectId in this._feedObjects)) {
    throw new Error("Feed object not found.");
  }

  const feedObject = this._feedObjects[feedObjectId];

  if (feedObject.internalState !== FeedState.OPEN) {
    throw new Error("Feed object not open.");
  }

  // Update feed object - leave feedData intact
  feedObject.internalState = FeedState.CLOSING;

  // Update index
  const feedObjectIndex =
    this._feedObjectIndex[feedObject.feedNameArgs.serial()];
  feedObjectIndex.open.delete(feedObjectId);
  feedObjectIndex.closing.add(feedObjectId);
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {string} feedObjectId
 */
CoordinatorDb.prototype.setFeedObjectClosed = function setFeedObjectClosed(
  feedObjectId,
) {
  if (!(feedObjectId in this._feedObjects)) {
    throw new Error("Feed object not found.");
  }

  const feedObject = this._feedObjects[feedObjectId];

  // Internal feed object state can move from opening, open, and closing to closed

  // Update index
  const feedSerial = feedObject.feedNameArgs.serial();
  const feedObjectIndex = this._feedObjectIndex[feedSerial];
  feedObjectIndex.closing.delete(feedObjectId);
  if (
    feedObjectIndex.opening.count() +
      feedObjectIndex.open.count() +
      feedObjectIndex.closing.count() ===
    0
  ) {
    delete this._feedObjectIndex[feedSerial];
  }

  // Delete feed object
  delete this._feedObjects[feedObjectId];
};

// Feed callbacks/objects - getters

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {string} feedObjectId
 * @returns {FeedState} CLOSED, OPENING, OPEN, or CLOSING
 */
CoordinatorDb.prototype.getFeedObjectState = function _getFeedObjectState(
  feedObjectId,
) {
  return feedObjectId in this._feedObjects
    ? this._feedObjects[feedObjectId].internalState
    : FeedState.CLOSED;
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {string} feedObjectId
 * @returns {FeedNameArgs}
 */
CoordinatorDb.prototype.getFeedObjectNameArgs = function _getFeedObjectNameArgs(
  feedObjectId,
) {
  if (!(feedObjectId in this._feedObjects)) {
    throw new Error("Feed object not found.");
  }
  return this._feedObjects[feedObjectId].feedNameArgs;
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {string} feedObjectId
 * @returns {Function}
 */
CoordinatorDb.prototype.getFeedObjectCallback = function _getFeedObjectCallback(
  feedObjectId,
) {
  if (!(feedObjectId in this._feedObjects)) {
    throw new Error("Feed object not found.");
  }

  const feedObject = this._feedObjects[feedObjectId];

  if (feedObject.internalState !== FeedState.OPENING) {
    throw new Error("Feed object not opening.");
  }

  return feedObject.callback;
};

/**
 * @memberof CoordinatorDb
 * @instance
 * @param {string} feedObjectId
 * @returns {Object}
 */
CoordinatorDb.prototype.getFeedObjectData = function _getFeedObjectData(
  feedObjectId,
) {
  if (!(feedObjectId in this._feedObjects)) {
    throw new Error("Feed object not found.");
  }

  const feedObject = this._feedObjects[feedObjectId];

  if (feedObject.internalState !== FeedState.OPEN) {
    throw new Error("Feed object not open.");
  }

  return feedObject.feedData;
};

/**
 * Allows the Coordinator to query feed objects by name/arg and state.
 * In some cases returns references to internal arrays, so the returned
 * array must not be modified.
 * @memberof CoordinatorDb
 * @instance
 * @param {FeedState} state OPENING, OPEN, or CLOSING
 * @param {FeedNameArgs} [feedNameArgs]
 * @returns {Array<FeedState>}
 */
CoordinatorDb.prototype.getFeedObjectIds = function getFeedObjectIds(
  state,
  feedNameArgs = null,
) {
  // One feed
  if (feedNameArgs) {
    const feedSerial = feedNameArgs.serial();
    if (feedSerial in this._feedObjectIndex) {
      return this._feedObjectIndex[feedSerial][state].array(); // Reference
    }
    return []; // None
  }

  // All feeds
  const stateArrs = [];
  Object.values(this._feedObjectIndex).forEach((obj) => {
    stateArrs.push(obj[state].array());
  });
  return _concat(...stateArrs);
};

/**
 * Determines the desired state of the server feed based on the feed object
 * states. If one feed object is opening or open, then the server feed is
 * desired open. Otherwise, it's desired closed.
 * @memberof CoordinatorDb
 * @instance
 * @param {FeedNameArgs} feedNameArgs
 * @returns {FeedState} OPEN or CLOSED
 */
CoordinatorDb.prototype.getDesiredServerFeedState = function getDesiredState(
  feedNameArgs,
) {
  const feedSerial = feedNameArgs.serial();
  if (!(feedSerial in this._feedObjectIndex)) {
    return FeedState.CLOSED;
  }

  const feedObjectIndex = this._feedObjectIndex[feedSerial];
  if (feedObjectIndex.opening.count() + feedObjectIndex.open.count() > 0) {
    return FeedState.OPEN;
  }
  return FeedState.CLOSED;
};

// Exports

export default CoordinatorDb;
