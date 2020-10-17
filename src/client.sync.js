import check from "check-types";
import emitter from "component-emitter";
import _each from "lodash/each";
import _clone from "lodash/clone";
import _pull from "lodash/pull";
import _startsWith from "lodash/startsWith";
import debug from "debug";
import feedSerializer from "feedme-util/feedserializer";
import config from "./config";

const dbgClient = debug("feedme-client");
const dbgFeed = debug("feedme-client:feed");

/**
 * ClientSync objects are to be accessed via ClientWrapper. ClientSync objects
 * emit all events and invoke all callbacks synchronously and rely on the
 * ClientWrapper to defer and queue those dependent invocations, and to overlay
 * the promise API.
 *
 * Exposes the session API (lots of pass-through) while enhancing it with:
 *
 * - A feed object API
 * - Connection timeouts and retries
 * - Message timeouts and late receipt handling
 * - Feed re-opens on feed data errors
 *
 * Feed objects:
 *
 * - The client maintains references to all feed objects until destroyed
 * - All feed object methods pass through to client functionality until destroyed
 * - State is stored within the feed objects and is accessed and modified by the client
 *
 * @typedef {Object} ClientSync
 * @extends emitter
 */

const protoClientSync = emitter({});

/**
 * ClientSync factory function.
 * @param {Object}      options
 *
 *                      Aside from the session, options configure the
 *                      following functionality:
 *
 *                        - Connect timeouts (how long to stay connecting) - 1 option
 *
 *                        - Connect retries (what to do if connecting session disconnects) - 4 options
 *
 *                        - Reconnection (what to do if connected session disconnects) - 1 option
 *
 *                        - Feed and action timeouts (how long before returning error) - 2 options
 *
 *                        - Feed reopening (how to handle bad action revelations) - 2 options
 *
 * @param {SessionWrapper} options.sessionWrapper
 *
 * @param {number}      options.connectTimeoutMs
 *
 *                      Specifies how long to wait for the session to connect
 *                      or fail after a call to clientSync.connect() before
 *                      cancelling the attempt. The transport and session are patient.
 *
 *                      Covers both the transport connection and the handshake.
 *
 *                      If set to 0, then the client will wait forever.
 *
 *                      If greater than 0, then the client will wait connectTimeoutMs.
 *                      If that period elapses before the session emits, then:
 *
 *                      - The session is disconnected with TIMEOUT error (relayed outside)
 *                      - A connection retry may be scheduled, depending on configuration
 *
 * @param {number}      options.connectRetryMs
 *
 *                      Specifies how long to wait before attempting another
 *                      connection when a connection attempt fails for
 *                      the first time.
 *
 *                      If less then 0, then the client will not make
 *                      another attempt to establish a connection and other
 *                      configuration options are ignored. It is left
 *                      to outside code to call clientSync.connect().
 *
 *                      If set to 0, then the client will immediately make
 *                      another attempt to establish a connection.
 *
 *                      If greater than 0, then the client will wait
 *                      connectRetryMs before making another attempt to
 *                      establish a connection.
 *
 *                      If a connection attempt fails due to a rejected handshake,
 *                      then the client will not attempt to reconnect.
 *
 * @param {number}      options.connectRetryBackoffMs
 *
 *                      Specifies the amount by which to increase the connection
 *                      retry interval on each failure.
 *
 * @param {number}      options.connectRetryMaxMs
 *
 *                      Specifies the maximum interval to wait between connection
 *                      attempts, irrespective of connectRetryBackoffMs.
 *                      Must be greater or equal than connectRetryMs.
 *
 * @param {number}      options.connectRetryMaxAttempts
 *
 *                      Specifies the maximum number of connection retries to
 *                      attempt. 0 for unlimited.
 *
 * @param {number}      options.actionTimeoutMs
 *
 *                      Specifies how long to wait for a server response to a
 *                      an action request before reporting a timeout error.
 *                      0 for no timeout.
 *
 * @param {number}      options.feedTimeoutMs
 *
 *                      Specifies how long to wait for a server response to a
 *                      a feed open request before reporting a timeout error.
 *                      0 for no timeout.
 *
 * @param {boolean}     options.reconnect
 *
 *                      Specifies behavior when the client disconnects due to a
 *                      transport problem while connected.
 *
 *                      If true, then the client will immediately attempt to
 *                      reconnect to the server when the connection fails.
 *                      If that connection fails, then the client will retry
 *                      as configured.
 *
 *                      If false, then the client will not attempt to reconnect
 *                      to the server when the connection fails. It is left
 *                      to outside code to call clientSync.connect().
 *
 * @param {number}      options.reopenMaxAttempts
 *
 *                      Specifies the maximum number of times to re-open a feed
 *                      when it fails due to a bad action revelation (invalid
 *                      delta or hash failure).
 *
 *                      If set less than zero, then the client will always attempt
 *                      to reopen feeds when there is a bad action revelation.
 *
 *                      If set to 0, then the client will not attempt to re-open
 *                      a feed when there is a bad action revelation. This
 *                      configuration is not recommended. If there is a subsequent
 *                      valid call to feed.desireOpen() referencing the feed,
 *                      then the client will attempt to re-open the feed at that time.
 *
 *                      If set greater than 0, then the client will immediately
 *                      attempt to re-open a feed when there is a bad action
 *                      revelation, provided that there have been fewer than
 *                      reopenMaxAttempts tries over the past reopenTrailingMs.
 *                      If already at the threshold, then the feed will be reopened
 *                      when the the number failures over the past
 *                      reopenTrailingMs falls back below reopenMaxAttempts.
 *
 *                      Reopen counts are reset when the client disconnects.
 *
 * @param {number}      options.reopenTrailingMs
 *
 *                      Specifies the length of the trailing interval over
 *                      which reopenMaxAttempts applies.
 *
 *                      If set to 0 then feed failures are counted over the entire
 *                      duration of the connection.
 *
 * @throws {Error}      "INVALID_ARGUMENT: ..."
 * @throws {Error}      "TRANSPORT_ERROR: ..."
 * @returns {ClientSync}
 */
function clientSyncFactory(options) {
  dbgClient("Initializing client");

  // Check options
  if (!check.object(options)) {
    throw new Error("INVALID_ARGUMENT: Invalid options argument.");
  }

  // Check options.sessionWrapper
  if (!check.object(options.sessionWrapper)) {
    throw new Error("INVALID_ARGUMENT: Invalid options.sessionWrapper.");
  }

  // Check options.connectTimeoutMs (if specified)
  if (
    "connectTimeoutMs" in options &&
    (!check.integer(options.connectTimeoutMs) ||
      check.negative(options.connectTimeoutMs))
  ) {
    throw new Error("INVALID_ARGUMENT: Invalid options.connectTimeoutMs.");
  }

  // Check options.connectRetryMs (if specified)
  if ("connectRetryMs" in options && !check.integer(options.connectRetryMs)) {
    throw new Error("INVALID_ARGUMENT: Invalid options.connectRetryMs.");
  }

  // Check options.connectRetryBackoffMs (if specified)
  if (
    "connectRetryBackoffMs" in options &&
    (!check.integer(options.connectRetryBackoffMs) ||
      check.negative(options.connectRetryBackoffMs))
  ) {
    throw new Error("INVALID_ARGUMENT: Invalid options.connectRetryBackoffMs.");
  }

  // Check options.connectRetryMaxMs (if specified)
  const connectRetryMs =
    "connectRetryMs" in options
      ? options.connectRetryMs
      : config.defaults.connectRetryMs;
  if (
    "connectRetryMaxMs" in options &&
    (!check.integer(options.connectRetryMaxMs) ||
      check.negative(options.connectRetryMaxMs) ||
      options.connectRetryMaxMs < connectRetryMs)
  ) {
    throw new Error("INVALID_ARGUMENT: Invalid options.connectRetryMaxMs.");
  }

  // Check options.connectRetryMaxAttempts (if specified)
  if (
    "connectRetryMaxAttempts" in options &&
    (!check.integer(options.connectRetryMaxAttempts) ||
      check.negative(options.connectRetryMaxAttempts))
  ) {
    throw new Error(
      "INVALID_ARGUMENT: Invalid options.connectRetryMaxAttempts."
    );
  }

  // Check options.actionTimeoutMs (if specified)
  if (
    "actionTimeoutMs" in options &&
    (!check.integer(options.actionTimeoutMs) ||
      check.negative(options.actionTimeoutMs))
  ) {
    throw new Error("INVALID_ARGUMENT: Invalid options.actionTimeoutMs.");
  }

  // Check options.feedTimeoutMs (if specified)
  if (
    "feedTimeoutMs" in options &&
    (!check.integer(options.feedTimeoutMs) ||
      check.negative(options.feedTimeoutMs))
  ) {
    throw new Error("INVALID_ARGUMENT: Invalid options.feedTimeoutMs.");
  }

  // Check options.reconnect (if specified)
  if ("reconnect" in options && !check.boolean(options.reconnect)) {
    throw new Error("INVALID_ARGUMENT: Invalid options.reconnect.");
  }

  // Check options.reopenMaxAttempts (if specified)
  if (
    "reopenMaxAttempts" in options &&
    !check.integer(options.reopenMaxAttempts)
  ) {
    throw new Error("INVALID_ARGUMENT: Invalid options.reopenMaxAttempts.");
  }

  // Check options.reopenTrailingMs (if specified)
  if (
    "reopenTrailingMs" in options &&
    (!check.integer(options.reopenTrailingMs) ||
      check.negative(options.reopenTrailingMs))
  ) {
    throw new Error("INVALID_ARGUMENT: Invalid options.reopenTrailingMs.");
  }

  // Success
  const clientSync = Object.create(protoClientSync);

  /**
   * Configuration options excluding the session.
   * @memberof ClientSync
   * @instance
   * @private
   * @type {Object}
   */
  clientSync._options = _clone(config.defaults);
  _each(clientSync._options, (val, key) => {
    if (key in options) {
      clientSync._options[key] = options[key];
    }
  });

  /**
   * Session object driving the Feedme conversation.
   * @memberof ClientSync
   * @instance
   * @private
   * @type {Session}
   */
  clientSync._sessionWrapper = options.sessionWrapper;

  /**
   * The previous state of the session object.
   *
   * When the session disconnects, the client needs to know whether it had
   * been open (reconnect) or opening (connect retry).
   * @memberof ClientSync
   * @instance
   * @private
   * @type {string}
   */
  clientSync._lastSessionWrapperStateEmission = "disconnect";

  /**
   * Feed API objects. Destroyed objects are removed.
   * A missing serial means that no Feed objects are associated with the feed.
   *
   * clientSync._appFeeds[ feedSerial ] = [
   *    Feed1,
   *    Feed2,
   *    ...
   * ]
   *
   * @memberof ClientSync
   * @instance
   * @private
   * @member {Object}
   */
  clientSync._appFeeds = {};

  /**
   * Timer to time out connection attempts. Null if not connecting.
   * @memberof ClientSync
   * @instance
   * @private
   * @type {number}
   */
  clientSync._connectTimeoutTimer = null;

  /**
   * Timer to retry after a failed connection attempt. Null if not scheduled.
   * @memberof ClientSync
   * @instance
   * @private
   * @type {number}
   */
  clientSync._connectRetryTimer = null;

  /**
   * The number of connection attempts that have been undertaken. Reset when
   * the session connects successfully and on valid calls to clientSync.connect().
   * @memberof ClientSync
   * @instance
   * @private
   * @type {number}
   */
  clientSync._connectRetryCount = 0;

  /**
   * Number of reopen attempts on each feed during the past
   * options.reopenTrailingMs. Indexed by feed serial. Missing means 0.
   * @memberof ClientSync
   * @instance
   * @private
   * @type {Object}
   */
  clientSync._reopenCounts = {};

  /**
   * Timers to decrement reopen counts once options.reopenTrailingMs has elapsed.
   * Don't need to be able to reference by feed. There may be zero, one, or
   * more than one for a given feed. Reopen timers are not created if
   * reopenTrailingMs is 0, as failures are counted over the duration of the
   * connection.
   * @memberof ClientSync
   * @instance
   * @private
   * @type {Array}
   */
  clientSync._reopenTimers = [];

  /**
   * Boolean indicators set to true when the client has asked the session to
   * close a feed. Missing means not requested. Indexed by feed serial.
   * @memberof ClientSync
   * @instance
   * @private
   * @type {Object}
   */
  clientSync._feedCloseRequested = {};

  // Listen for session events
  clientSync._sessionWrapper.on(
    "connecting",
    clientSync._processConnecting.bind(clientSync)
  );
  clientSync._sessionWrapper.on(
    "connect",
    clientSync._processConnect.bind(clientSync)
  );
  clientSync._sessionWrapper.on(
    "disconnect",
    clientSync._processDisconnect.bind(clientSync)
  );
  clientSync._sessionWrapper.on(
    "actionRevelation",
    clientSync._processActionRevelation.bind(clientSync)
  );
  clientSync._sessionWrapper.on(
    "unexpectedFeedClosing",
    clientSync._processUnexpectedFeedClosing.bind(clientSync)
  );
  clientSync._sessionWrapper.on(
    "unexpectedFeedClosed",
    clientSync._processUnexpectedFeedClosed.bind(clientSync)
  );
  clientSync._sessionWrapper.on(
    "badServerMessage",
    clientSync._processBadServerMessage.bind(clientSync)
  );
  clientSync._sessionWrapper.on(
    "badClientMessage",
    clientSync._processBadClientMessage.bind(clientSync)
  );

  return clientSync;
}

/**
 * Pass-through for session event.
 * @event connecting
 * @memberof ClientSync
 * @instance
 */

/**
 * Pass-through for session event.
 * @event connect
 * @memberof ClientSync
 * @instance
 */

/**
 * Largely pass-through for session event.
 * @event disconnect
 * @memberof ClientSync
 * @instance
 * @param {?Error} err Session errors plus...
 *
 *                      Error("TIMEOUT: ...")
 */

/**
 * Pass-through for session event.
 * @event badServerMessage
 * @memberof ClientSync
 * @instance
 * @param {Error} err
 */

/**
 * Pass-through for session event.
 * @event badClientMessage
 * @memberof ClientSync
 * @instance
 * @param {Error} err
 */

/**
 * Callback for clientSync.action()
 * Same as session callback, but it may timeout.
 * @callback actionCallback
 * @memberof ClientSync
 * @param {?Error} err Session error or Error('TIMEOUT: ...')
 * @param {?Object} actionData
 */

/**
 * Callback for clientSync._feedOpenTimeout()
 * No arguments.
 * @callback feedOpenTimeoutCallback
 * @memberof ClientSync
 */

/**
 * Callback for clientSync._feedOpenTimeout()
 * Invoked on server response irrespective of whether feedOpenTimeoutCallback
 * was called.
 * @callback feedOpenResponseCallback
 * @memberof ClientSync
 * @param {?Error}    err       Only present on error
 * @param {?Object}   feedData  Only present on success
 */

/**
 * Feed object returned by clientSync.feed().
 *
 * - Some state information is held internally and accessed by the clientSync.
 *
 * - Calls to feed object methods pass through to underlying client methods.
 *
 * - Receives notifications about changes in server feed state and action
 * revelations through the inform function set.
 *
 * @typedef {Object} FeedSync
 * @extends emitter
 */

const protoFeedSync = emitter({});

/**
 * FeedSync factory function.
 * @param {ClientSync} clientSync
 * @param {string} name
 * @param {Object} args
 * @returns {FeedSync}
 * @description
 */
function feedSyncFactory(clientSync, name, args) {
  dbgFeed("Initializing feed");

  const feed = Object.create(protoFeedSync);

  /**
   * The client object that created the feed. Deleted if destroyed.
   * @memberof FeedSync
   * @instance
   * @private
   * @type {ClientSync}
   */
  feed._clientSync = clientSync;

  /**
   * The feed name.
   * @memberof FeedSync
   * @instance
   * @private
   * @type {string}
   */
  feed._feedName = name;

  /**
   * The feed args.
   * @memberof FeedSync
   * @instance
   * @private
   * @type {Object}
   */
  feed._feedArgs = args;

  /**
   * Desired state. Initializes closed.
   * @memberof FeedSync
   * @instance
   * @private
   * @type {string} "open" or "closed"
   */
  feed._desiredState = "closed";

  /**
   * The name of the last event emitted. Tracked to ensure correct event
   * sequencing. Initializes "close".
   * @memberof FeedSync
   * @instance
   * @private
   * @type {string} "open", "opening", or "close"
   */
  feed._lastStateEmission = "close";

  /**
   * The last error passed with the close emission. Null if close was
   * emitted with no error or if last emission was not close.
   * @memberof FeedSync
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
 * @memberof FeedSync
 * @instance
 */

/**
 * Emitted when the feed object state becomes open.
 *
 * An opening event is always emitted first, including when a late feed open response
 * is received from the server (i.e. after closing due to timeout).
 *
 * @event open
 * @memberof FeedSync
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
 * connected. The feed object is now closed with NOT_CONNECTED error.
 *
 * 3. A feed open times out and the client subsequently receives a
 * rejection from the server or disconnects. The feed object is now closed with
 * a REJECTED or NOT_CONNECTED error.
 *
 * @event close
 * @memberof FeedSync
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
 *                      Error("NOT_CONNECTED: ...")
 *
 *                      Error("TERMINATED: ...")
 *
 *                      Error("BAD_ACTION_REVELATION: ...")
 */

/**
 * Emitted when an action is revealed on the server feed and the object
 * is desired open.
 * @event action
 * @memberof FeedSync
 * @instance
 * @param {string} actionName
 * @param {Object} actionArgs
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */

/**
 * Pass-through to session.state()
 * @memberof ClientSync
 * @instance
 * @returns {string} Passed through from session.state()
 */
protoClientSync.state = function state() {
  return this._sessionWrapper.state();
};

/**
 * Largely pass-through to session.connect()
 * Session events trigger client events.
 * @memberof ClientSync
 * @instance
 * @throws {Error} Passed through from session
 */
protoClientSync.connect = function connect() {
  dbgClient("Connect requested");

  // Attempt a connect
  this._sessionWrapper.connect(); // Cascade errors

  // Success

  // Reset connection retries
  if (this._connectRetryTimer) {
    dbgClient("Connection retry timer cleared");
    clearTimeout(this._connectRetryTimer);
    this._connectRetryTimer = null;
  }
  this._connectRetryCount = 0;
};

/**
 * Pass-through to session.disconnect()
 * Session events trigger client events.
 * @memberof ClientSync
 * @instance
 * @throws {Error} Passed through from session
 */
protoClientSync.disconnect = function disconnect() {
  dbgClient("Disconnect requested");

  this._sessionWrapper.disconnect(); // No error arg - requested
};

/**
 * Pass-through to session.action() plus timeout functionality.
 * Arguments are checked at the session level and errors are cascaded, except
 * callback is verified because a function is always passed to the session.
 *
 * If the server hasn't returned a response before options.actionTimeoutMs
 * then callback() receives a TIMEOUT error.
 *
 * @memberof ClientSync
 * @instance
 * @param {string}          name
 * @param {Object}          args
 * @param {actionCallback} callback
 * @throws {Error} Passed through from session
 */
protoClientSync.action = function action(name, args, callback) {
  dbgClient("Action requested");

  // Check callback (function always passed to session)
  if (!check.function(callback)) {
    throw new Error("INVALID_ARGUMENT: Invalid callback.");
  }

  let timer;

  // Invoke the action
  // Could throw an error, so done before the timeout is created
  // Session fires all action callbacks with error on disconnect
  this._sessionWrapper.action(name, args, (err, actionData) => {
    // Timer not set if actionTimeoutMs === 0
    if (timer || this._options.actionTimeoutMs === 0) {
      dbgClient(
        "Received pre-timeout action callback from session - calling back."
      );
      if (timer) {
        dbgClient("Action timeout timer cleared");
        clearTimeout(timer); // Not present if actionTimeoutMs === 0
      }
      if (err) {
        callback(err);
      } else {
        callback(undefined, actionData);
      }
    } else {
      dbgClient(
        "Received post-timeout action callback from session - discarding."
      );
    }
  });

  // Set the timeout, if so configured
  if (this._options.actionTimeoutMs > 0) {
    dbgClient("Action timout timer created");
    timer = setTimeout(() => {
      dbgClient("Action timeout timer fired");
      timer = null; // Mark fired
      const err = new Error(
        "TIMEOUT: The server did not respond within the allocated time."
      );
      callback(err);
    }, this._options.actionTimeoutMs);
  }
};

/**
 * Create a feed object. Valid irrespective of client/session state.
 * @memberof ClientSync
 * @instance
 * @param {string} feedName
 * @param {Object} feedArgs
 * @returns {FeedSync}
 * @throws {Error} "INVALID_ARGUMENT: ..."
 */
protoClientSync.feed = function feedFunction(feedName, feedArgs) {
  dbgClient("Feed interaction object requested");

  // Check name
  if (!check.nonEmptyString(feedName)) {
    throw new Error("INVALID_ARGUMENT: Invalid feed name.");
  }

  // Check args
  if (!check.object(feedArgs)) {
    throw new Error("INVALID_ARGUMENT: Invalid feed arguments object.");
  }

  // Check args properties
  let valid = true;
  _each(feedArgs, val => {
    if (!check.string(val)) {
      valid = false;
    }
  });
  if (!valid) {
    throw new Error("INVALID_ARGUMENT: Invalid feed arguments object.");
  }

  // Store and return a new feed object
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  const appObject = feedSyncFactory(this, feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    this._appFeeds[feedSerial] = [];
  }
  this._appFeeds[feedSerial].push(appObject);
  return appObject;
};

/**
 * Pass-through from session connecting event.
 * @memberof ClientSync
 * @instance
 * @private
 */
protoClientSync._processConnecting = function _processConnecting() {
  dbgClient("Observed session connecting event");

  // Set a timeout for the connection attempt
  // The timeout is cleared on session connect/disconnect event
  if (this._options.connectTimeoutMs > 0) {
    dbgClient("Connection timeout timer created");
    this._connectTimeoutTimer = setTimeout(() => {
      dbgClient("Connection timeout timer fired");
      this._connectTimeoutTimer = null;
      // Disconnect the session if still connecting
      // Can't guarantee session state due to event deferral (handlers clear timers)
      if (this._sessionWrapper.state() === "connecting") {
        this._sessionWrapper.disconnect(
          new Error("TIMEOUT: The connection attempt timed out.")
        );
      }
    }, this._options.connectTimeoutMs);
  }

  this.emit("connecting");
  this._lastSessionWrapperStateEmission = "connecting";
};

/**
 * Kargely pass-through from session connect event, but also opens desired feeds.
 * @memberof ClientSync
 * @instance
 * @private
 */
protoClientSync._processConnect = function _processConnect() {
  dbgClient("Observed session connect event");

  // Session has returned a connection result - cancel timeout if present
  if (this._connectTimeoutTimer) {
    dbgClient("Connection timeout timer cleared");
    clearTimeout(this._connectTimeoutTimer);
    this._connectTimeoutTimer = null;
  }

  // The state was connecting and retries were being counted - reset
  // Timer is not set (we were connecting, not disconnected)
  this._connectRetryCount = 0;

  this.emit("connect");

  _each(this._appFeeds, (arr, ser) => {
    const { feedName, feedArgs } = feedSerializer.unserialize(ser);
    this._considerFeedState(feedName, feedArgs); // Will open
  });

  this._lastSessionWrapperStateEmission = "connect";
};

/**
 * Pass-through from session disconnect event.
 *
 *  - The session calls all outstanding action() callbacks on disconnect
 *    User callbacks notified there
 *
 *  - The session calls all feedOpen() and feedClose() callbacks on disconnect
 *    User feed objects notified there
 *
 *  - The session will emit unexpectedFeedClosing/Closed for open feeds on disconnect
 *    User feed objects notified there
 *
 * @memberof ClientSync
 * @instance
 * @private
 * @param {Error?} err Present if not requested by .disconnect()
 */
protoClientSync._processDisconnect = function _processDisconnect(err) {
  dbgClient("Observed session disconnect event");

  // Session has returned a connection result - cancel timeout if present
  if (this._connectTimeoutTimer) {
    dbgClient("Connection timeout timer cleared");
    clearTimeout(this._connectTimeoutTimer);
    this._connectTimeoutTimer = null;
  }

  // Previous session state emission was connecting or connect
  // So no connect retry attempts are scheduled

  // Emit with correct number of args
  if (err) {
    this.emit("disconnect", err);
  } else {
    this.emit("disconnect");
  }

  // Reset feed reopen counts/timers
  // Other timers are reset on action/feedOpen callbacks
  this._reopenCounts = {};
  _each(this._reopenTimers, tmr => {
    dbgClient("Feed re-open counter timer cleared");
    clearTimeout(tmr);
  });
  this._reopenTimers = [];

  // clientSync.action() callbacks are sent an error via session.action() callback
  // For feeds desired open, feed object close events are...
  //  - If server feed is opening, fired via session.feedOpen() callback
  //  - If server feed is open, fired via session unexpectedFeedClosing/Close events
  //  - If server feed is closing, fired via session.feedClose() callback
  //  - If server feed is closed (intentional or REJECTED) the session has no way to inform
  //    And the client has no way to determine which feeds those are
  //    So all feeds are informed here, and duplicate events are already filtered
  //    out by the feed objects.
  _each(this._appFeeds, (arr, ser) => {
    const { feedName, feedArgs } = feedSerializer.unserialize(ser);
    this._informServerFeedClosed(
      feedName,
      feedArgs,
      Error("NOT_CONNECTED: The client disconnected.")
    );
  });

  // Failure on connecting - retries
  if (this._lastSessionWrapperStateEmission === "connecting") {
    // Schedule a connection retry on TIMEOUT or DISCONNECT but not HANDSHAKE_REJECTED
    if (err && !_startsWith(err.message, "HANDSHAKE_REJECTED:")) {
      // Only schedule if configured and below the configured retry threshold
      if (
        this._options.connectRetryMs >= 0 &&
        (this._options.connectRetryMaxAttempts === 0 ||
          this._connectRetryCount < this._options.connectRetryMaxAttempts)
      ) {
        const retryMs = Math.min(
          this._options.connectRetryMs +
            this._connectRetryCount * this._options.connectRetryBackoffMs,
          this._options.connectRetryMaxMs
        ); // May be zero
        this._connectRetryCount += 1;
        dbgClient("Connection retry timer created");
        this._connectRetryTimer = setTimeout(() => {
          dbgClient("Connect retry timer fired");
          this._connectRetryTimer = null;
          // Perform another connection attempt if the session is still disconnected
          // Can't guarantee session state due to event deferral (handlers clear timers)
          if (this._sessionWrapper.state() === "disconnected") {
            this._sessionWrapper.connect(); // Not client.connect(), which would reset the retry count
          }
        }, retryMs);
      }
    }
  }

  // Failure on connected - reconnects
  if (this._lastSessionWrapperStateEmission === "connect") {
    // Reconnect if this was a transport issue, not a call to disconnect()
    // No need to verify that the session state is currently disconnected
    // The transport is required to remain disconnected when it loses a connection
    // and the session therefore behaves in the same manner
    if (
      err &&
      _startsWith(err.message, "TRANSPORT_FAILURE:") &&
      this._options.reconnect
    ) {
      this.connect(); // Resets connection retry counts
    }
  }

  this._lastSessionWrapperStateEmission = "disconnect";
};

/**
 * Processes a session actionRevelation event.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string} feedName
 * @param {Object} feedArgs
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */
protoClientSync._processActionRevelation = function _processActionRevelation(
  feedName,
  feedArgs,
  actionName,
  actionData,
  newFeedData,
  oldFeedData
) {
  dbgClient("Observed session actionRevelation event");

  this._informServerActionRevelation(
    feedName,
    feedArgs,
    actionName,
    actionData,
    newFeedData,
    oldFeedData
  );
};

/**
 * Processes a session unexpectedFeedClosing event.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string} feedName
 * @param {Object} feedArgs
 * @param {Error} err Passed through from session
 */
protoClientSync._processUnexpectedFeedClosing = function _processUnexpectedFeedClosing(
  feedName,
  feedArgs,
  err
) {
  dbgClient("Observed session unexpectedFeedClosing event");

  this._informServerFeedClosing(feedName, feedArgs, err);
};

/**
 * Processes a session unexpectedFeedClosed event.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string} feedName
 * @param {Object} feedArgs
 * @param {Error} err Passed through from session
 */
protoClientSync._processUnexpectedFeedClosed = function _processUnexpectedFeedClosed(
  feedName,
  feedArgs,
  err
) {
  dbgClient("Observed session unexpectedFeedClosed event");

  // Inform the app
  this._informServerFeedClosed(feedName, feedArgs, err);

  // Consider reopening on bad action revelation
  if (_startsWith(err.message, "BAD_ACTION_REVELATION:")) {
    if (this._options.reopenMaxAttempts < 0) {
      // If there is no limit on reopens then reopen and don't track attempts
      this._considerFeedState(feedName, feedArgs);
    } else {
      // There is a limit on reopen attempts

      // Get the current reopen count
      const feedSerial = feedSerializer.serialize(feedName, feedArgs);
      const reopenCount = this._reopenCounts[feedSerial] || 0;

      // Reopen the feed if the limit isn't breached
      // reopenMaxAttempts could be zero or positive
      if (reopenCount < this._options.reopenMaxAttempts) {
        this._reopenCounts[feedSerial] = reopenCount + 1;
        // Decrement after trailingMs (track reopens forever if trailingMs is 0)
        if (this._options.reopenTrailingMs > 0) {
          dbgClient("Feed re-open counter timer created");
          const timer = setTimeout(() => {
            dbgClient("Feed re-open counter timer fired");
            // Decrement the reopen counter and stop tracking the timer
            this._reopenCounts[feedSerial] -= 1;
            _pull(this._reopenTimers, timer);

            // Consider reopening the feed if we're just moving back below the threshold
            if (
              this._reopenCounts[feedSerial] + 1 ===
              this._options.reopenMaxAttempts
            ) {
              this._considerFeedState(feedName, feedArgs); // Reopen it
            }

            // Delete the reopen counter if it is back to 0
            if (this._reopenCounts[feedSerial] === 0) {
              delete this._reopenCounts[feedSerial];
            }
          }, this._options.reopenTrailingMs);
          this._reopenTimers.push(timer);
        }
        this._considerFeedState(feedName, feedArgs); // Reopen it
      }
    }
  }
};

/**
 * Processes a session badServerMessage event. Pass-through.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {Error} err
 */
protoClientSync._processBadServerMessage = function _processBadServerMessage(
  err
) {
  dbgClient("Observed session badServerMessage event");

  this.emit("badServerMessage", err);
};

/**
 * Processes a session badClientMessage event. Pass-through.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {Object} diagnostics
 */
protoClientSync._processBadClientMessage = function _processBadClientMessage(
  diagnostics
) {
  dbgClient("Observed session badClientMessage event");

  this.emit("badClientMessage", diagnostics);
};

/**
 * Passed through from feed.desireOpen(). Responsible for emitting as appropriate
 * on the calling.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {FeedSync} appFeed
 * @throws {Error} "INVALID_FEED_STATE: ..."

 */
protoClientSync._appFeedDesireOpen = function _appFeedDesireOpen(appFeed) {
  dbgClient("Feed desire-open requested");

  // Feed already desired open?
  if (appFeed._desiredState === "open") {
    throw new Error("INVALID_FEED_STATE: The feed is already desired open.");
  }

  // Success
  appFeed._desiredState = "open"; // eslint-disable-line no-param-reassign

  // If not connected, emit close(NOT_CONNECTED) (new reason for closure) and stop
  if (this._sessionWrapper.state() !== "connected") {
    appFeed._emitClose(
      new Error("NOT_CONNECTED: The client is not connected.")
    );
    return; // Stop
  }

  // Act according to the server feed state and perform the appropriate emission(s)
  // You know your last emission was closed, otherwise you couldn't desire open
  const serverFeedState = this._sessionWrapper.feedState(
    appFeed._feedName,
    appFeed._feedArgs
  );

  if (serverFeedState === "closed") {
    this._considerFeedState(appFeed._feedName, appFeed._feedArgs); // Opens the feed and emits opening
  } else if (serverFeedState === "opening") {
    appFeed._emitOpening();
  } else if (serverFeedState === "open") {
    appFeed._emitOpening();
    appFeed._emitOpen(
      this._sessionWrapper.feedData(appFeed._feedName, appFeed._feedArgs)
    );
  } else {
    appFeed._emitOpening(); // Server feed is closing
  }
};

/**
 * Passed through from feed.desireClosed(). Responsible for emitting as appropriate
 * on the calling feed.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {FeedSync} appFeed
 * @throws {Error} "INVALID_FEED_STATE: ..."
 */
protoClientSync._appFeedDesireClosed = function _appFeedDesireClosed(appFeed) {
  dbgClient("Feed desire-closed requested");

  // Feed already desired closed?
  if (appFeed._desiredState === "closed") {
    throw new Error("INVALID_FEED_STATE: The feed is already desired closed.");
  }

  // Success

  appFeed._desiredState = "closed"; // eslint-disable-line no-param-reassign

  // Always emit closed on the feed object
  // If the feed was previously opening or open, it is changing state
  // If the feed was previously closed due to an error condition then
  // the reason for its being closed has changed (desired)
  appFeed._emitClose();

  // If the session is connected, consider closing the server feed if it's open
  // Otherwise wait
  if (this._sessionWrapper.state() === "connected") {
    const serverFeedState = this._sessionWrapper.feedState(
      appFeed._feedName,
      appFeed._feedArgs
    );
    if (serverFeedState === "open") {
      this._considerFeedState(appFeed._feedName, appFeed._feedArgs); // May close it
    }
  }
};

/**
 * Passed through from feed.desiredState()
 * @memberof ClientSync
 * @instance
 * @private
 * @param {FeedSync} appFeed
 * @returns {string} "open" or "closed"
 */
protoClientSync._appFeedDesiredState = function _appFeedDesiredState(appFeed) {
  return appFeed._desiredState;
};

/**
 * Passed through from feed.state()
 * @memberof ClientSync
 * @instance
 * @private
 * @param {FeedSync} appFeed
 * @returns {string} "open", "opening", or "closed"
 */
protoClientSync._appFeedState = function _appFeedState(appFeed) {
  if (appFeed.desiredState() === "closed") {
    return "closed";
  }

  if (this._sessionWrapper.state() !== "connected") {
    return "closed";
  }

  const serverFeedState = this._sessionWrapper.feedState(
    appFeed._feedName,
    appFeed._feedArgs
  );

  if (serverFeedState === "closing") {
    const feedSerial = feedSerializer.serialize(
      appFeed._feedName,
      appFeed._feedArgs
    );
    if (this._feedCloseRequested[feedSerial]) {
      return "opening";
    }
    return "closed";
  }
  return serverFeedState; // opening, open, or closed
};

/**
 * Passed through from feed.destroy(). Will only be called if the
 * feed has not already been destroyed.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {FeedSync} appFeed
 * @throws {Error} "INVALID_FEED_STATE: ..."
 */
protoClientSync._appFeedDestroy = function _appFeedDestroy(appFeed) {
  dbgClient("Feed destroy requested");

  // You can't destroy a feed desired open
  if (appFeed._desiredState !== "closed") {
    throw new Error(
      "INVALID_FEED_STATE: Only feeds desired closed can be destroyed."
    );
  }

  // Success

  const feedSerial = feedSerializer.serialize(
    appFeed._feedName,
    appFeed._feedArgs
  );

  // Remove reference to the feed object
  _pull(this._appFeeds[feedSerial], appFeed);
  if (this._appFeeds[feedSerial].length === 0) {
    delete this._appFeeds[feedSerial];
  }
};

/**
 * Passed through from feed.data()
 * @memberof ClientSync
 * @instance
 * @private
 * @param {FeedSync} appFeed Interaction object
 * @returns {Object} Feed data
 * @throws {Error} "INVALID_FEED_STATE: ..."
 */
protoClientSync._appFeedData = function _appFeedData(appFeed) {
  dbgClient("Feed data requested");

  // Is the feed open?
  if (appFeed.state() !== "open") {
    throw new Error("INVALID_FEED_STATE: The feed object is not open.");
  }

  return this._sessionWrapper.feedData(appFeed._feedName, appFeed._feedArgs);
};

/**
 * Informs non-destroyed feed objects that the server feed is now closed.
 *
 * Called on:
 *
 * - Intentional closure
 * - Session unexpectedFeedClosed
 * - Failure to open a feed (timeout, rejected)
 * - Bad action revelation
 *
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 * @param {?Error}  err Not present if requested by client
 *
 *                      Error("TIMEOUT: ...")
 *                      Error("REJECTED: ...")
 *                      Error("NOT_CONNECTED: ...")
 *                      Error("TERMINATED: ...")
 *                      Error("BAD_ACTION_REVELATION: ...")
 */
protoClientSync._informServerFeedClosed = function _informServerFeedClosed(
  feedName,
  feedArgs,
  err
) {
  dbgClient(`Informing server feed closed`);

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return; // Stop
  }

  // Inform feed objects as appropriate
  _each(this._appFeeds[feedSerial], appFeed => {
    appFeed._serverFeedClosed(err);
  });
};

/**
 * Informs non-destroyed feed objects that the server feed is now opening.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 */
protoClientSync._informServerFeedOpening = function _informServerFeedOpening(
  feedName,
  feedArgs
) {
  dbgClient("Informing server feed opening");

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return; // Stop
  }

  // Inform feed objects as appropriate
  _each(this._appFeeds[feedSerial], appFeed => {
    appFeed._serverFeedOpening();
  });
};

/**
 * Informs non-destroyed feed objects that the server feed is now open.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 * @param {Object}  feedData
 */
protoClientSync._informServerFeedOpen = function _informServerFeedOpen(
  feedName,
  feedArgs,
  feedData
) {
  dbgClient("Informing server feed open");

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return; // Stop
  }

  // Inform feed objects as appropriate
  _each(this._appFeeds[feedSerial], appFeed => {
    appFeed._serverFeedOpen(feedData);
  });
};

/**
 * Informs non-destroyed feed objects that the server feed is now closing.
 * Called on session unexpectedFeedClosing and intentional closure.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 * @param {?Error}  err
 */
protoClientSync._informServerFeedClosing = function _informServerFeedClosing(
  feedName,
  feedArgs,
  err
) {
  dbgClient("Informing server feed closing");

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return; // Stop
  }

  // Inform feed objects as appropriate
  _each(this._appFeeds[feedSerial], appFeed => {
    appFeed._serverFeedClosing(err);
  });
};

/**
 * Inform non-destroyed feed objects about an action revelation.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 * @param {string}  actionName
 * @param {Object}  actionData
 * @param {Object}  newFeedData
 * @param {Object}  oldFeedData
 */
protoClientSync._informServerActionRevelation = function _informServerActionRevelation(
  feedName,
  feedArgs,
  actionName,
  actionData,
  newFeedData,
  oldFeedData
) {
  dbgClient("Informing server action revelation");

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return; // Stop
  }

  // Inform feed objects as appropriate
  _each(this._appFeeds[feedSerial], appFeed => {
    appFeed._serverActionRevelation(
      actionName,
      actionData,
      newFeedData,
      oldFeedData
    );
  });
};

/**
 * Attempts to align actual server feed state with the desired state.
 * Asynchronously recursive, as desired state may change while actual state
 * is changing.
 *
 * If the feed is opening/closing then _consider is already operating on it
 *    Do nothing and act on callback
 * If the feed is open/closed then take action if desired state doesn't match
 *    Recurse when you're finished - desired state may have changed
 *
 * Called:
 *
 * - When the client connects (for all feeds)
 * - On feed.desireOpen() and feed.desireClosed()
 * - On unexpectedFeedClosed event
 * - Recursively when the feed is actionable: response to feedOpen/feedClose()
 *
 * There is no timeout for closing feeds because they are presented as
 * closed immediately to the application.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string} feedName
 * @param {Object} feedArgs
 */
protoClientSync._considerFeedState = function _considerFeedState(
  feedName,
  feedArgs
) {
  dbgClient("Considering feed state");

  // Do nothing if the session is not connected
  if (this._sessionWrapper.state() !== "connected") {
    return; // Stop
  }

  // Get the actual state of the feed
  const actualState = this._sessionWrapper.feedState(feedName, feedArgs);

  // Get the desired state of the feed
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  let desiredState = "closed";
  if (this._appFeeds[feedSerial]) {
    _each(this._appFeeds[feedSerial], element => {
      if (element.desiredState() === "open") {
        desiredState = "open";
      }
    });
  }

  // Open the feed?
  if (actualState === "closed" && desiredState === "open") {
    this._informServerFeedOpening(feedName, feedArgs);
    this._feedOpenTimeout(
      feedName,
      feedArgs,
      () => {
        // Timeout callback
        dbgClient("Feed open request timed out");
        const err = new Error(
          "TIMEOUT: The server did not respond to feed open request within the allocated time."
        );
        this._informServerFeedClosed(feedName, feedArgs, err);
      },
      (err, feedData) => {
        // Response callback
        if (err) {
          dbgClient("Feed open request returned error");
          this._informServerFeedClosed(feedName, feedArgs, err);
          // The error is either NOT_CONNECTED or REJECTED - don't _consider in either case
        } else {
          dbgClient("Feed open request returned success");
          this._informServerFeedOpen(feedName, feedArgs, feedData);
          this._considerFeedState(feedName, feedArgs); // Desired state may have changed
        }
      }
    );
  }

  // Close the feed?
  if (actualState === "open" && desiredState === "closed") {
    this._feedCloseRequested[feedSerial] = true;
    this._informServerFeedClosing(feedName, feedArgs);
    this._sessionWrapper.feedClose(feedName, feedArgs, () => {
      // The session returns success on successful server response AND disconnect
      // - If server returned success, then inform feeds with no error
      // - If client disconnected, then inform feeds with error
      // In the latter case, the session calls back to feedClose before emitting
      // disconnect, which is where the client attempts reconnect, so you are
      // assured that the session state will still be disconnected here
      delete this._feedCloseRequested[feedSerial];
      if (this._sessionWrapper.state() === "connected") {
        dbgClient("Server feed closed due to FeedCloseResponse");
        this._informServerFeedClosed(feedName, feedArgs);
      } else {
        dbgClient("Server feed closed due to disconnect");
        this._informServerFeedClosed(
          feedName,
          feedArgs,
          new Error("NOT_CONNECTED: The client disconnected.")
        );
      }

      // Server feed is now potentially actionable
      this._considerFeedState(feedName, feedArgs); // Desired state may have changed
    });
  }
};

/**
 * Wrapper for session.feedOpen() with timeout functionality.
 *
 * If the message timeout is exceeded then callbackTimeout() is invoked.
 * When a response is received, callbackResponse() is invoked irrespective
 * of whether the timeout fired. If the client disconnects, then callbackResponse
 * receives NOT_CONNECTED error.
 *
 * The session is assumed to be connected and session feed state is
 * assumed to be closed.
 *
 * This method does not defer callbacks, as it is not calling back to outside
 * code.
 * @memberof ClientSync
 * @instance
 * @private
 * @param {string}                    feedName
 * @param {Object}                    feedArgs
 * @param {feedOpenTimeoutCallback}   callbackTimeout
 * @param {feedOpenResponseCallback}  callbackResponse
 */
protoClientSync._feedOpenTimeout = function _feedOpenTimeout(
  feedName,
  feedArgs,
  callbackTimeout,
  callbackResponse
) {
  let timer;

  // Open the feed
  this._sessionWrapper.feedOpen(feedName, feedArgs, (err, feedData) => {
    if (timer) {
      dbgClient("Feed open timeout timer cleared");
      clearTimeout(timer);
    }
    callbackResponse(err, feedData);
  });

  // Create a timer
  if (this._options.feedTimeoutMs > 0) {
    dbgClient("Feed open timeout timer created");
    timer = setTimeout(() => {
      dbgClient("Feed open timeout timer fired");
      timer = null; // Mark fired
      callbackTimeout();
    }, this._options.feedTimeoutMs);
  }
};

/**
 * Pass-through to clientSync.
 * @memberof FeedSync
 * @instance
 * @throws {Error} "DESTROYED: ..."
 */
protoFeedSync.desireOpen = function desireOpen() {
  dbgFeed("Desire open requested");

  this._checkDestroyed();
  this._clientSync._appFeedDesireOpen(this);
};

/**
 * Pass-through to clientSync.
 * @memberof FeedSync
 * @instance
 * @throws {Error} "DESTROYED: ..."
 */
protoFeedSync.desireClosed = function desireClosed() {
  dbgFeed("Desire closed requested");

  this._checkDestroyed();
  this._clientSync._appFeedDesireClosed(this);
};

/**
 * Pass-through to clientSync.
 * @memberof FeedSync
 * @instance
 * @returns {string}
 * @throws {Error} "DESTROYED: ..."
 */
protoFeedSync.desiredState = function desiredState() {
  this._checkDestroyed();
  return this._clientSync._appFeedDesiredState(this);
};

/**
 * Pass-through to clientSync.
 * @memberof FeedSync
 * @instance
 * @returns {string}
 * @throws {Error} "DESTROYED: ..."
 */
protoFeedSync.state = function state() {
  this._checkDestroyed();
  return this._clientSync._appFeedState(this);
};

/**
 * Pass-through to clientSync.
 * @memberof FeedSync
 * @instance
 * @returns {Object}
 * @throws {Error} "DESTROYED: ..."
 */
protoFeedSync.data = function data() {
  dbgFeed("Feed data requested");
  this._checkDestroyed();
  return this._clientSync._appFeedData(this);
};

/**
 * Destroys the feed object.
 * @memberof FeedSync
 * @instance
 * @throws {Error} "DESTROYED: ..."
 */
protoFeedSync.destroy = function destroy() {
  dbgFeed("Destroy requested");

  this._checkDestroyed();
  this._clientSync._appFeedDestroy(this);
  delete this._clientSync;
};

/**
 * Returns an indication of whether the feed has been destroyed.
 * @memberof FeedSync
 * @instance
 * @returns {boolean}
 */
protoFeedSync.destroyed = function destroyed() {
  return !this._clientSync;
};

// These functions are called by the client on server feed state
// changes and action revelations

/**
 * Called by the client when the server feed state becomes closed.
 * @memberof FeedSync
 * @instance
 * @private
 * @param {?Error} err Not present if requested by client
 *
 *                      Error("TIMEOUT: ...")
 *                      Error("REJECTED: ...")
 *                      Error("NOT_CONNECTED: ...")
 *                      Error("TERMINATED: ...")
 *                      Error("BAD_ACTION_REVELATION: ...")
 */
protoFeedSync._serverFeedClosed = function _serverFeedClosed(err) {
  dbgFeed("Observed server feed closed");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return; // Stop
  }

  // Desired state is open
  if (this._lastStateEmission === "close") {
    // Emit only if the reason for closing (the error) has changed
    const errCode = err.message.split(":")[0];
    const lastCode = this._lastCloseError.message.split(":")[0];
    if (errCode !== lastCode) {
      this._emitClose(err);
    }
  } else if (this._lastStateEmission === "opening") {
    if (!err) {
      // Closure had been requested and feed will be reopened - don't cycle state
    } else {
      this._emitClose(err);
    }
  } else {
    // Last emission should not be opening, as last emission becomes close on unexpectedFeedClosing (can't test)
    this._emitClose(err);
  }
};

/**
 * Called by the client when the server feed state becomes opening.
 * @memberof FeedSync
 * @instance
 * @private
 */
protoFeedSync._serverFeedOpening = function _serverFeedOpening() {
  dbgFeed("Observed server feed opening");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return; // Stop
  }

  // Desired state is open
  if (this._lastStateEmission === "close") {
    this._emitOpening();
  } else if (this._lastStateEmission === "opening") {
    // Closure had been requested and feed is being reopened - don't cycle state
  } else {
    this._emitOpening(); // Shouldn't happen
  }
};

/**
 * Called by the client when the server feed state becomes open.
 * @memberof FeedSync
 * @instance
 * @private
 * @param {Object} feedData
 */
protoFeedSync._serverFeedOpen = function _serverFeedOpen(feedData) {
  dbgFeed("Observed server feed open");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return; // Stop
  }

  // Desired state is open
  // Last emission should never be open
  if (this._lastStateEmission === "close") {
    // Happens after feed open timeouts
    this._emitOpening();
    this._emitOpen(feedData);
  } else {
    this._emitOpen(feedData);
  }
};

/**
 * Called by the client when the server feed state becomes closing.
 * Called on intentional closure and unexpectedFeedClosing.
 * @memberof FeedSync
 * @instance
 * @private
 * @param {?Error} err Not present if requested by client
 *
 *                      Error("TIMEOUT: ...")
 *                      Error("REJECTED: ...")
 *                      Error("NOT_CONNECTED: ...")
 *                      Error("TERMINATED: ...")
 *                      Error("BAD_ACTION_REVELATION: ...")
 */
protoFeedSync._serverFeedClosing = function _serverFeedClosing(err) {
  dbgFeed("Observed server feed closing");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return; // Stop
  }

  // Desired state is open
  if (this._lastStateEmission === "close") {
    // The server feed was open. If this is due to an intentional
    // closure or unexpectedFeedClosing the last emission would have been open
    this._emitClose(err); // Should not happen (can't test)
  } else if (this._lastStateEmission === "opening") {
    this._emitClose(err); // Should not happen (can't test)
  } else {
    this._emitClose(err);
  }
};

/**
 * Called by the client when an action is revealed on this feed.
 * @memberof FeedSync
 * @instance
 * @private
 * @param {string}  actionName
 * @param {Object}  actionData
 * @param {Object}  newFeedData
 * @param {Object}  oldFeedData
 */
protoFeedSync._serverActionRevelation = function _serverActionRevelation(
  actionName,
  actionData,
  newFeedData,
  oldFeedData
) {
  dbgFeed("Observed server action revelation");

  // Do nothing if feed is desired closed
  if (this._desiredState === "closed") {
    return; // Stop
  }

  // Desired state is open

  this.emit("action", actionName, actionData, newFeedData, oldFeedData);
};

// Emitter functions that track the last emission

/**
 * Emit close. Emit with correct number of arguments.
 * @memberof FeedSync
 * @instance
 * @private
 * @param {?Error} err Not present if requested by client
 *
 *                      Error("TIMEOUT: ...")
 *                      Error("REJECTED: ...")
 *                      Error("NOT_CONNECTED: ...")
 *                      Error("TERMINATED: ...")
 *                      Error("BAD_ACTION_REVELATION: ...")
 */
protoFeedSync._emitClose = function _emitClose(err) {
  dbgFeed("Emitting close");

  this._lastStateEmission = "close";
  this._lastCloseError = err || null;
  if (err) {
    this.emit("close", err);
  } else {
    this.emit("close");
  }
};

/**
 * Emit opening.
 * @memberof FeedSync
 * @instance
 * @private
 */
protoFeedSync._emitOpening = function _emitOpening() {
  dbgFeed("Emitting opening");

  this._lastStateEmission = "opening";
  this._lastCloseError = null;
  this.emit("opening");
};

/**
 * Emit open.
 * @memberof FeedSync
 * @instance
 * @private
 * @param {Object} feedData
 */
protoFeedSync._emitOpen = function _emitOpen(feedData) {
  dbgFeed("Emitting open");

  this._lastStateEmission = "open";
  this._lastCloseError = null;
  this.emit("open", feedData);
};

// Internal helper

/**
 * Throw an error if the feed has been destroyed.
 * @memberof FeedSync
 * @instance
 * @private
 */
protoFeedSync._checkDestroyed = function destroy() {
  if (!this._clientSync) {
    throw new Error("DESTROYED: The feed object has been destroyed.");
  }
};

export default clientSyncFactory;
