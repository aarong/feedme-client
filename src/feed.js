import emitter from "component-emitter";
import debug from "debug";

const dbg = debug("feedme-client:feed");

/**
 * Feed object returned by client.feed().
 *
 * - Some state information is held internally and accessed by the client.
 *
 * - Calls to feed object methods pass through to underlying client methods.
 *
 * - Receives notifications about changes in server feed state and action
 * revelations through the inform function set.
 *
 * - Tested alongside the client.
 *
 * @typedef {Object} Feed
 * @extends emitter
 */

const proto = {};
emitter(proto);

/**
 * Feed object factory function.
 * @param {Client} client
 * @param {string} name
 * @param {Object} args
 * @returns {Feed}
 * @description
 */
export default function feedFactory(client, name, args) {
  dbg("Initializing feed");

  const feed = Object.create(proto);

  /**
   * The client object that created the feed. Deleted if destroyed.
   * @memberof Feed
   * @instance
   * @private
   * @type {client}
   */
  feed._client = client;

  /**
   * The feed name.
   * @memberof Feed
   * @instance
   * @private
   * @type {string}
   */
  feed._feedName = name;

  /**
   * The feed args.
   * @memberof Feed
   * @instance
   * @private
   * @type {Object}
   */
  feed._feedArgs = args;

  /**
   * Desired state. Initializes closed.
   * @memberof Feed
   * @instance
   * @private
   * @type {string} "open" or "closed"
   */
  feed._desiredState = "closed";

  /**
   * The name of the last event emitted. Tracked to ensure correct event
   * sequencing. Initializes "close".
   * @memberof Feed
   * @instance
   * @private
   * @type {string} "open", "opening", or "close"
   */
  feed._lastEmission = "close";

  /**
   * The last error passed with the close emission. Null if close was
   * emitted with no error or if last emission was not close.
   * @memberof Feed
   * @instance
   * @private
   * @type {?Error}
   */
  feed._lastCloseError = null;

  return feed;
}

/**
 * Emitted when the feed object state becomes opening.
 * @event opening
 * @memberof Feed
 * @instance
 */

/**
 * Emitted when the feed object state becomes open.
 *
 * An opening event is always emitted first, including when a late feed open response
 * is received from the server (i.e. after closing due to timeout).
 *
 * @event open
 * @memberof Feed
 * @instance
 */

/**
 * Emitted when the feed object state becomes closed and when the reason
 * for its being closed has changed.
 *
 * May be emitted when the state is opening, open, or closed. The latter
 * situation arises when:
 *
 * 1. The feed object is closed due to an error condition and the user makes
 * a valid call to feed.desireClosed(). The feed object is now closed with
 * no error.
 *
 * 2. The user makes a valid call to feed.desireOpen() but the client is not
 * connected. The feed object is now closed with DISCONNECTED error.
 *
 * 3. A feed open times out and the client subsequently receives a
 * rejection from the server or disconnects. The feed object is now closed with
 * a REJECTED or DISCONNECTED error.
 *
 * @event close
 * @memberof Feed
 * @instance
 * @param {?Error} err  If not present then the close resulted from feed.desireClosed()
 *
 *                      Error("TIMEOUT: ...")
 *
 *                      Error("REJECTED: ...")
 *
 *                        err.serverErrorCode (string)
 *                        err.serverErrorData (object)
 *
 *                      Error("DISCONNECTED: ...")
 *
 *                      Error("TERMINATED: ...")
 *
 *                      Error("BAD_ACTION_REVELATION: ...")
 */

/**
 * Emitted when an action is revealed on the server feed and the object
 * is desired open.
 * @event action
 * @memberof Feed
 * @instance
 * @param {string} actionName
 * @param {Object} actionArgs
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */

/**
 * Emitted when a specific type of action is revealed on the server feed and the
 * object is desired open.
 * @event action:actionName
 * @memberof Feed
 * @instance
 * @param {Object} actionArgs
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */

// App-facing API.

/**
 * Pass-through to client.
 * @memberof Feed
 * @instance
 * @throws {Error} "DESTROYED: ..."
 */
proto.desireOpen = function desireOpen() {
  dbg("Desire open requested");

  this._checkDestroyed();
  this._client._appFeedDesireOpen(this);
};

/**
 * Pass-through to client.
 * @memberof Feed
 * @instance
 * @throws {Error} "DESTROYED: ..."
 */
proto.desireClosed = function desireClosed() {
  dbg("Desire closed requested");

  this._checkDestroyed();
  this._client._appFeedDesireClosed(this);
};

/**
 * Pass-through to client.
 * @memberof Feed
 * @instance
 * @returns {string}
 * @throws {Error} "DESTROYED: ..."
 */
proto.desiredState = function desiredState() {
  dbg("Desired state requested");

  this._checkDestroyed();
  return this._client._appFeedDesiredState(this);
};

/**
 * Pass-through to client.
 * @memberof Feed
 * @instance
 * @returns {string}
 * @throws {Error} "DESTROYED: ..."
 */
proto.state = function state() {
  dbg("Actual state requested");

  this._checkDestroyed();
  return this._client._appFeedState(this);
};

/**
 * Pass-through to client.
 * @memberof Feed
 * @instance
 * @returns {Object}
 * @throws {Error} "DESTROYED: ..."
 */
proto.data = function data() {
  dbg("Feed data requested");
  this._checkDestroyed();
  return this._client._appFeedData(this);
};

/**
 * Pass-through to client.
 * @memberof Feed
 * @instance
 * @returns {Client}
 * @throws {Error} "DESTROYED: ..."
 */
proto.client = function client() {
  dbg("Client requested");

  this._checkDestroyed();
  return this._client;
};

/**
 * Destroys the feed object.
 * @memberof Feed
 * @instance
 * @throws {Error} "ALREADY_DESTROYED: ..."
 */
proto.destroy = function destroy() {
  dbg("Destroy requested");

  this._checkDestroyed();
  this._client._appFeedDestroy(this);
  delete this._client;
};

// These functions are called by the client on server feed state
// changes and action revelations

/**
 * Called by the client when the server feed state becomes closed.
 * @memberof Feed
 * @instance
 * @private
 * @param {?Error} err Not present if requested by client
 *
 *                      Error("TIMEOUT: ...")
 *                      Error("REJECTED: ...")
 *                      Error("DISCONNECTED: ...")
 *                      Error("TERMINATED: ...")
 *                      Error("BAD_ACTION_REVELATION: ...")
 */
proto._serverFeedClosed = function _serverFeedClosed(err) {
  dbg("Observed server feed closed");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return;
  }

  // Desired state is open
  if (this._lastEmission === "close") {
    // Emit only if the reason for closing (the error) has changed
    const errCode = err.message.split(":")[0];
    const lastCode = this._lastCloseError.message.split(":")[0];
    if (errCode !== lastCode) {
      this._emitClose(err);
    }
  } else if (this._lastEmission === "opening") {
    if (!err) {
      // Closure had been requested and feed will be reopened - don't cycle state
    } else {
      this._emitClose(err);
    }
  } else if (this._lastEmission === "open") {
    // Shouldn't happen, as last emission becomes close on unexpectedFeedClosing (can't test)
    this._emitClose(err);
  }
};

/**
 * Called by the client when the server feed state becomes opening.
 * @memberof Feed
 * @instance
 * @private
 */
proto._serverFeedOpening = function _serverFeedOpening() {
  dbg("Observed server feed opening");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return;
  }

  // Desired state is open
  if (this._lastEmission === "close") {
    this._emitOpening();
  } else if (this._lastEmission === "opening") {
    // Closure had been requested and feed is being reopened - don't cycle state
  } else if (this._lastEmission === "open") {
    this._emitOpening(); // Shouldn't happen
  }
};

/**
 * Called by the client when the server feed state becomes open.
 * @memberof Feed
 * @instance
 * @private
 */
proto._serverFeedOpen = function _serverFeedOpen() {
  dbg("Observed server feed open");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return;
  }

  // Desired state is open
  if (this._lastEmission === "close") {
    // Happens after feed open timeouts
    this._emitOpening();
    this._emitOpen();
  } else if (this._lastEmission === "opening") {
    this._emitOpen();
  } else if (this._lastEmission === "open") {
    this._emitOpen(); // Shouldn't happen, but relay new feed data (can't test)
  }
};

/**
 * Called by the client when the server feed state becomes closing.
 * Called on intentional closure and unexpectedFeedClosing.
 * @memberof Feed
 * @instance
 * @private
 * @param {?Error} err Not present if requested by client
 *
 *                      Error("TIMEOUT: ...")
 *                      Error("REJECTED: ...")
 *                      Error("DISCONNECTED: ...")
 *                      Error("TERMINATED: ...")
 *                      Error("BAD_ACTION_REVELATION: ...")
 */
proto._serverFeedClosing = function _serverFeedClosing(err) {
  dbg("Observed server feed closing");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return;
  }

  // Desired state is open
  if (this._lastEmission === "close") {
    // The server feed was open. If this is due to an intentional
    // closure or unexpectedFeedClosing the last emission would have been open
    this._emitClose(err); // Should not happen (can't test)
  } else if (this._lastEmission === "opening") {
    this._emitClose(err); // Should not happen (can't test)
  } else if (this._lastEmission === "open") {
    this._emitClose(err);
  }
};

/**
 * Called by the client when an action is revealed on this feed.
 * @memberof Feed
 * @instance
 * @private
 * @param {string}  actionName
 * @param {Object}  actionData
 * @param {Object}  newFeedData
 * @param {Object}  oldFeedData
 */
proto._serverActionRevelation = function _serverActionRevelation(
  actionName,
  actionData,
  newFeedData,
  oldFeedData
) {
  dbg("Observed server action revelation");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return;
  }

  // Desired state is open - fire the events
  this.emit("action", actionName, actionData, newFeedData, oldFeedData);
  this.emit(`action:${actionName}`, actionData, newFeedData, oldFeedData);
};

// Emitter functions that track the last emission

/**
 * Emit closed. Emit with correct number of arguments.
 * @memberof Feed
 * @instance
 * @private
 * @param {?Error} err Not present if requested by client
 *
 *                      Error("TIMEOUT: ...")
 *                      Error("REJECTED: ...")
 *                      Error("DISCONNECTED: ...")
 *                      Error("TERMINATED: ...")
 *                      Error("BAD_ACTION_REVELATION: ...")
 */
proto._emitClose = function _emitClose(err) {
  dbg("Emitting close");

  this._lastEmission = "close";
  this._lastCloseError = err || null;
  if (err) {
    this.emit("close", err);
  } else {
    this.emit("close");
  }
};

/**
 * Emit opening.
 * @memberof Feed
 * @instance
 * @private
 */
proto._emitOpening = function _emitOpening() {
  dbg("Emitting opening");

  this._lastEmission = "opening";
  this._lastCloseError = null;
  this.emit("opening");
};

/**
 * Emit open.
 * @memberof Feed
 * @instance
 * @private
 * @param {Object} feedData
 */
proto._emitOpen = function _emitOpen() {
  dbg("Emitting open");

  this._lastEmission = "open";
  this._lastCloseError = null;
  this.emit("open");
};

// Internal helper

/**
 * Throw an error if the feed has been destroyed.
 * @memberof Feed
 * @instance
 * @private
 */
proto._checkDestroyed = function destroy() {
  if (!this._client) {
    throw new Error("DESTROYED: The feed object has been destroyed.");
  }
};
