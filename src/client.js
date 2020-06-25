import check from "check-types";
import emitter from "component-emitter";
import _each from "lodash/each";
import _clone from "lodash/clone";
import _pull from "lodash/pull";
import _startsWith from "lodash/startsWith";
import debug from "debug";
import feedSerializer from "feedme-util/feedserializer";
import jsonExpressible from "json-expressible";
import config from "./config";
import feed from "./feed";

const dbg = debug("feedme-client");

/**
 * App-facing client object. Exposes the session API (lots of pass-through)
 * while enhancing it with:
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
 * @typedef {Object} Client
 * @extends emitter
 */

const proto = {};
emitter(proto);

/**
 * Client factory function.
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
 * @param {Session}      options.session
 *
 * @param {number}      options.connectTimeoutMs
 *
 *                      Specifies how long to wait for the session to connect
 *                      or fail after a call to client.connect() before
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
 *                      to outside code to call client.connect().
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
 *                      to outside code to call client.connect().
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
 * @returns {Client}
 */
export default function clientFactory(options) {
  dbg("Initializing client");

  // Check options
  if (!check.object(options)) {
    throw new Error("INVALID_ARGUMENT: Invalid options argument.");
  }

  // Check options.session
  if (!check.object(options.session)) {
    throw new Error("INVALID_ARGUMENT: Invalid options.session.");
  }

  // Check options.connectTimeoutMs (if specified)
  if ("connectTimeoutMs" in options) {
    if (
      !check.integer(options.connectTimeoutMs) ||
      check.negative(options.connectTimeoutMs)
    ) {
      throw new Error("INVALID_ARGUMENT: Invalid options.connectTimeoutMs.");
    }
  }

  // Check options.connectRetryMs (if specified)
  if ("connectRetryMs" in options) {
    if (!check.integer(options.connectRetryMs)) {
      throw new Error("INVALID_ARGUMENT: Invalid options.connectRetryMs.");
    }
  }

  // Check options.connectRetryBackoffMs (if specified)
  if ("connectRetryBackoffMs" in options) {
    if (
      !check.integer(options.connectRetryBackoffMs) ||
      check.negative(options.connectRetryBackoffMs)
    ) {
      throw new Error(
        "INVALID_ARGUMENT: Invalid options.connectRetryBackoffMs."
      );
    }
  }

  // Check options.connectRetryMaxMs (if specified)
  if ("connectRetryMaxMs" in options) {
    if (
      !check.integer(options.connectRetryMaxMs) ||
      check.negative(options.connectRetryMaxMs) ||
      (options.connectRetryMs &&
        options.connectRetryMaxMs < options.connectRetryMs)
    ) {
      throw new Error("INVALID_ARGUMENT: Invalid options.connectRetryMaxMs.");
    }
  }

  // Check options.connectRetryMaxAttempts (if specified)
  if ("connectRetryMaxAttempts" in options) {
    if (
      !check.integer(options.connectRetryMaxAttempts) ||
      check.negative(options.connectRetryMaxAttempts)
    ) {
      throw new Error(
        "INVALID_ARGUMENT: Invalid options.connectRetryMaxAttempts."
      );
    }
  }

  // Check options.actionTimeoutMs (if specified)
  if ("actionTimeoutMs" in options) {
    if (
      !check.integer(options.actionTimeoutMs) ||
      check.negative(options.actionTimeoutMs)
    ) {
      throw new Error("INVALID_ARGUMENT: Invalid options.actionTimeoutMs.");
    }
  }

  // Check options.feedTimeoutMs (if specified)
  if ("feedTimeoutMs" in options) {
    if (
      !check.integer(options.feedTimeoutMs) ||
      check.negative(options.feedTimeoutMs)
    ) {
      throw new Error("INVALID_ARGUMENT: Invalid options.feedTimeoutMs.");
    }
  }

  // Check options.reconnect (if specified)
  if ("reconnect" in options) {
    if (!check.boolean(options.reconnect)) {
      throw new Error("INVALID_ARGUMENT: Invalid options.reconnect.");
    }
  }

  // Check options.reopenMaxAttempts (if specified)
  if ("reopenMaxAttempts" in options) {
    if (!check.integer(options.reopenMaxAttempts)) {
      throw new Error("INVALID_ARGUMENT: Invalid options.reopenMaxAttempts.");
    }
  }

  // Check options.reopenTrailingMs (if specified)
  if ("reopenTrailingMs" in options) {
    if (
      !check.integer(options.reopenTrailingMs) ||
      check.negative(options.reopenTrailingMs)
    ) {
      throw new Error("INVALID_ARGUMENT: Invalid options.reopenTrailingMs.");
    }
  }

  // Success
  const client = Object.create(proto);

  /**
   * Configuration options excluding the session.
   * @memberof Client
   * @instance
   * @private
   * @type {Object}
   */
  client._options = _clone(config.defaults);
  _each(client._options, (val, key) => {
    if (key in options) {
      client._options[key] = options[key];
    }
  });

  /**
   * Session object driving the Feedme conversation.
   * @memberof Client
   * @instance
   * @private
   * @type {Session}
   */
  client._session = options.session;

  /**
   * The previous state of the session object.
   *
   * When the session disconnects, the client needs to know whether it had
   * been open (reconnect) or opening (connect retry).
   * @memberof Client
   * @instance
   * @private
   * @type {string}
   */
  client._lastSessionState = "disconnected";

  /**
   * Feed API objects. Destroyed objects are removed.
   * A missing serial means that no Feed objects are associated with the feed.
   *
   * client._appFeeds[ feedSerial ] = [
   *    Feed1,
   *    Feed2,
   *    ...
   * ]
   *
   * @memberof Client
   * @instance
   * @private
   * @member {Object}
   */
  client._appFeeds = {};

  /**
   * Timer to time out connection attempts. Null if not connecting.
   * @memberof Client
   * @instance
   * @private
   * @type {number}
   */
  client._connectTimeoutTimer = null;

  /**
   * Timer to retry after a failed connection attempt. Null if not scheduled.
   * @memberof Client
   * @instance
   * @private
   * @type {number}
   */
  client._connectRetryTimer = null;

  /**
   * The number of connection attempts that have been undertaken. Reset when
   * the session connects successfully and on valid calls to client.connect().
   * @memberof Client
   * @instance
   * @private
   * @type {number}
   */
  client._connectRetryCount = 0;

  /**
   * Number of reopen attempts on each feed during the past
   * options.reopenTrailingMs. Indexed by feed serial. Missing means 0.
   * @memberof Client
   * @instance
   * @private
   * @type {Object}
   */
  client._reopenCounts = {};

  /**
   * Timers to decrement reopen counts once options.reopenTrailingMs has elapsed.
   * Don't need to be able to reference by feed. There may be zero, one, or
   * more than one for a given feed. Reopen timers are not created if
   * reopenTrailingMs is 0, as failures are counted over the duration of the
   * connection.
   * @memberof Client
   * @instance
   * @private
   * @type {array}
   */
  client._reopenTimers = [];

  // Listen for session events
  client._session.on("connecting", () => {
    client._processConnecting();
  });
  client._session.on("connect", () => {
    client._processConnect();
  });
  client._session.on("disconnect", err => {
    client._processDisconnect(err);
  });

  client._session.on(
    "actionRevelation",
    (feedName, feedArgs, actionName, actionData, newFeedData, oldFeedData) => {
      client._processActionRevelation(
        feedName,
        feedArgs,
        actionName,
        actionData,
        newFeedData,
        oldFeedData
      );
    }
  );
  client._session.on("unexpectedFeedClosing", (feedName, feedArgs, err) => {
    client._processUnexpectedFeedClosing(feedName, feedArgs, err);
  });
  client._session.on("unexpectedFeedClosed", (feedName, feedArgs, err) => {
    client._processUnexpectedFeedClosed(feedName, feedArgs, err);
  });

  client._session.on("badServerMessage", msg => {
    client._processBadServerMessage(msg);
  });
  client._session.on("badClientMessage", msg => {
    client._processBadClientMessage(msg);
  });
  client._session.on("transportError", msg => {
    client._processTransportError(msg);
  });

  return client;
}

// Events

/**
 * Pass-through for session event.
 * @event connecting
 * @memberof Client
 * @instance
 */

/**
 * Pass-through for session event.
 * @event connect
 * @memberof Client
 * @instance
 */

/**
 * Largely pass-through for session event.
 * @event disconnect
 * @memberof Client
 * @instance
 * @param {?Error} err Session errors plus...
 *
 *                      Error("TIMEOUT: ...")
 */

/**
 * Pass-through for session event.
 * @event badServerMessage
 * @memberof Client
 * @instance
 * @param {Error} err
 */

/**
 * Pass-through for session event.
 * @event badClientMessage
 * @memberof Client
 * @instance
 * @param {Error} err
 */

/**
 * Pass-through for session event.
 * @event transportError
 * @memberof Client
 * @instance
 * @param {Error} err
 */

// Callbacks

/**
 * Callback for client.action()
 * Same as session callback, but it may timeout.
 * @callback actionCallback
 * @memberof Client
 * @param {?Error} err Session error or Error('TIMEOUT: ...')
 * @param {?object} actionData
 */

/**
 * Callback for client._feedOpenTimeout()
 * No arguments.
 * @callback feedOpenTimeoutCallback
 * @memberof Client
 */

/**
 * Callback for client._feedOpenTimeout()
 * Invoked on server response irrespective of whether feedOpenTimeoutCallback
 * was called.
 * @callback feedOpenResponseCallback
 * @memberof Client
 * @param {?err}      err       Only present on error
 * @param {?object}   feedData  Only present on success
 */

// Public functions

/**
 * Pass-through to session.state()
 * @memberof Client
 * @instance
 * @returns {string} Passed through from session.state()
 */
proto.state = function state() {
  dbg("State requested");

  return this._session.state();
};

/**
 * Largely pass-through to session.connect()
 * Session events trigger client events.
 * @memberof Client
 * @instance
 * @throws {Error} Passed through from session
 */
proto.connect = function connect() {
  dbg("Connect requested");

  // Attempt a connect with timeout (could fail if session state is bad)
  this._connect();

  // Success

  // Reset connection retries
  if (this._connectRetryTimer) {
    clearTimeout(this._connectRetryTimer);
    this._connectRetryTimer = null;
  }
  this._connectRetryCount = 0;
};

/**
 * Pass-through to session.disconnect()
 * Session events trigger client events.
 * @memberof Client
 * @instance
 * @throws {Error} Passed through from session
 */
proto.disconnect = function disconnect() {
  dbg("Disconnect requested");

  this._session.disconnect(); // No error - requested
};

/**
 * Pass-through to session.id()
 * @memberof Client
 * @instance
 * @returns {string}
 * @throws {Error} Passed through from session
 */
proto.id = function id() {
  dbg("Client id requested");

  return this._session.id();
};

/**
 * Pass-through to session.action() plus timeout functionality and promisification.
 * Arguments are checked at the session level and errors are cascaded.
 *
 * If the client passes only two arguments (action name and args) then return
 * a promise. If the client passes three or more arguments (i.e. it includes
 * a callback or callbackLate argument) then return nothing and call back
 * on action completion.
 *
 * Arguments are checked here even though they are validated by the session,
 * because (1) in callback mode, a function is always passed to the session
 * and callbackLast is not passed to the session, and (2) in promise mode,
 * session errors result in the promise being rejected, not a thrown error.
 * For the latter reason, client state is also checked here.
 *
 * In callback mode:
 *
 * If the server hasn't returned a response before options.actionTimeoutMs
 * then callback() receives a TIMEOUT error. In that case, if a response is
 * subsequently received from the server, it is routed to callbackLate() if present.
 * If the client disconnects before a response is received, then callbackLate()
 * is called with a DISCONNECTED error, if present.
 *
 * In promise mode:
 *
 * If the server hasn't returned a response before options.actionTimeoutMs
 * then the promise is rejected with a TIMEOUT error. There is no callbackLate
 * functionality.
 *
 * @memberof Client
 * @instance
 * @param {string}          name
 * @param {Object}          args
 * @param {?actionCallback} callback
 * @param {?actionCallback} callbackLate
 * @throws {Error} Passed through from session
 */

proto.action = function action(name, args, ...callbacks) {
  dbg("Action requested");

  // Check name
  if (!check.nonEmptyString(name)) {
    throw new Error("INVALID_ARGUMENT: Invalid action name.");
  }

  // Check args
  if (!check.object(args)) {
    throw new Error("INVALID_ARGUMENT: Invalid action arguments object.");
  }
  if (!jsonExpressible(args)) {
    throw new Error(
      "INVALID_ARGUMENT: Action arguments must be JSON-expressible."
    );
  }

  // Transport connected and handshake complete?
  if (this.state() !== "connected") {
    throw new Error("INVALID_STATE: Not connected.");
  }

  let timer;
  let ret;

  if (callbacks.length > 0) {
    // Callback style
    dbg("Callback style action requested");
    const callback = callbacks[0];
    const callbackLate = callbacks.length > 1 ? callbacks[1] : () => {};

    // Check callback
    if (!check.function(callback)) {
      throw new Error("INVALID_ARGUMENT: Invalid callback.");
    }

    // Check callbackLate
    if (!check.function(callbackLate)) {
      throw new Error("INVALID_ARGUMENT: Invalid callbackLate.");
    }

    // Invoke the action - could fail, so done before the timeout is set
    // Session fires all action callbacks with error on disconnect
    this._session.action(name, args, (err, actionData) => {
      // Timer not set if actionTimeoutMs === 0
      if (timer || this._options.actionTimeoutMs === 0) {
        if (timer) {
          clearTimeout(timer); // Not present if actionTimeoutMs === 0
        }
        if (err) {
          callback(err);
        } else {
          callback(err, actionData);
        }
      } else if (err) {
        callbackLate(err);
      } else {
        callbackLate(err, actionData);
      }
    });

    // Set the timeout, if so configured
    if (this._options.actionTimeoutMs > 0) {
      dbg("Action timout timer created");
      timer = setTimeout(() => {
        dbg("Action timeout timer fired");
        timer = null; // Mark fired
        callback(
          new Error(
            "TIMEOUT: The server did not respond within the allocated time."
          )
        );
      }, this._options.actionTimeoutMs);
    }

    ret = undefined;
  } else {
    // Promise style
    dbg("Promise style action requested");
    ret = new Promise((resolve, reject) => {
      // Invoke the action - could fail, so done before the timeout is set
      // Session fires all action callbacks with error on disconnect
      this._session.action(name, args, (err, actionData) => {
        // Timer not set if actionTimeoutMs === 0
        if (timer || this._options.actionTimeoutMs === 0) {
          if (timer) {
            clearTimeout(timer); // Not present if actionTimeoutMs === 0
          }
          if (err) {
            reject(err);
          } else {
            resolve(actionData);
          }
        }
      });
      // Set the timeout, if so configured
      if (this._options.actionTimeoutMs > 0) {
        dbg("Action timout timer created");
        timer = setTimeout(() => {
          dbg("Action timeout timer fired");
          timer = null; // Mark fired
          reject(
            new Error(
              "TIMEOUT: The server did not respond within the allocated time."
            )
          );
        }, this._options.actionTimeoutMs);
      }
    });
  }

  return ret;
};

/**
 * Create a feed object. Valid irrespective of client/session state.
 * @memberof Client
 * @instance
 * @param {string} feedName
 * @param {Object} feedArgs
 * @returns {Feed}
 * @throws {Error} "INVALID_ARGUMENT: ..."
 */
proto.feed = function feedF(feedName, feedArgs) {
  dbg("Feed interaction object requested");

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
  const appObject = feed(this, feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    this._appFeeds[feedSerial] = [];
  }
  this._appFeeds[feedSerial].push(appObject);
  return appObject;
};

// Session event handlers

/**
 * Pass-through from session connecting event.
 * @memberof Client
 * @instance
 * @private
 */
proto._processConnecting = function _processConnecting() {
  dbg("Observed session connecting event");

  this.emit("connecting");
  this._lastSessionState = "connecting";
};

/**
 * Kargely pass-through from session connect event, but also opens desired feeds.
 * @memberof Client
 * @instance
 * @private
 */
proto._processConnect = function _processConnect() {
  dbg("Observed session connect event");

  // Session has returned a connection result - cancel timeout
  this._connectTimeoutCancel();

  // The state was connecting and retries were being counted - reset
  // Timer is not set (we were connecting, not disconnected)
  this._connectRetryCount = 0;

  this.emit("connect");

  _each(this._appFeeds, (arr, ser) => {
    const { feedName, feedArgs } = feedSerializer.unserialize(ser);
    this._considerFeedState(feedName, feedArgs); // Will open
  });

  this._lastSessionState = "connected";
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
 * @memberof Client
 * @instance
 * @private
 * @param {Error?} err Present if not requested by .disconnect()
 */
proto._processDisconnect = function _processDisconnect(err) {
  dbg("Observed session disconnect event");

  // Session has returned a connection result - cancel timeout
  this._connectTimeoutCancel();

  // You were connecting or connected, so no connect retry attempts are scheduled

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
    clearTimeout(tmr);
  });
  this._reopenTimers = [];

  // Client.action() callbacks are sent an error via session.action() callback
  // For feeds desired open, feed object close events are...
  //  - If server feed is opening, fired via session.feedOpen() callback
  //  - If server feed is open, fired via session unexpectedFeedClosing/Close events
  //  - If server feed is closing, fired via session.feedClose() callback
  //  - If server feed is closed (previous REJECTED) the session has no way to inform
  //    And the client has no way to determine which feeds those are
  //    So all feeds are informed here, and duplicate events are already filtered
  //    out by the feed objects.
  _each(this._appFeeds, (arr, ser) => {
    const { feedName, feedArgs } = feedSerializer.unserialize(ser);
    this._informServerFeedClosed(
      feedName,
      feedArgs,
      Error("DISCONNECTED: The transport disconnected.")
    );
  });

  // Failure on connecting - retries
  if (this._lastSessionState === "connecting") {
    // Schedule a connection retry on TIMEOUT or DISCONNECT but not HANDSHAKE_REJECTED
    if (err && !_startsWith(err.message, "HANDSHAKE_REJECTED")) {
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
        );
        this._connectRetryCount += 1;
        dbg("Connection retry timer created");
        this._connectRetryTimer = setTimeout(() => {
          dbg("Connect retry timer fired");
          this._connectRetryTimer = null;
          this._connect(); // Not .connect(), as that resets the retry counts
        }, retryMs);
      }
    }
  }

  // Failure on connected - reconnects
  if (this._lastSessionState === "connected") {
    // Reconnect if this was a transport issue, not a call to disconnect()
    if (err && _startsWith(err.message, "FAILURE") && this._options.reconnect) {
      this.connect(); // Resets connection retry counts
    }
  }

  this._lastSessionState = "disconnected";
};

/**
 * Processes a session actionRevelation event.
 * @memberof Client
 * @instance
 * @private
 * @param {string} feedName
 * @param {Object} feedArgs
 * @param {string} actionName
 * @param {Object} actionData
 * @param {Object} newFeedData
 * @param {Object} oldFeedData
 */
proto._processActionRevelation = function _processActionRevelation(
  feedName,
  feedArgs,
  actionName,
  actionData,
  newFeedData,
  oldFeedData
) {
  dbg("Observed session actionRevelation event");

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
 * @memberof Client
 * @instance
 * @private
 * @param {string} feedName
 * @param {Object} feedArgs
 * @param {Error} err Passed through from session
 */
proto._processUnexpectedFeedClosing = function _processUnexpectedFeedClosing(
  feedName,
  feedArgs,
  err
) {
  dbg("Observed session unexpectedFeedClosing event");

  this._informServerFeedClosing(feedName, feedArgs, err);
};

/**
 * Processes a session unexpectedFeedClosed event.
 * @memberof Client
 * @instance
 * @private
 * @param {string} feedName
 * @param {Object} feedArgs
 * @param {Error} err Passed through from session
 */
proto._processUnexpectedFeedClosed = function _processUnexpectedFeedClosed(
  feedName,
  feedArgs,
  err
) {
  dbg("Observed session unexpectedFeedClosed event");

  // Inform the app
  this._informServerFeedClosed(feedName, feedArgs, err);

  // Consider reopening on bad action revelation
  if (_startsWith(err.message, "BAD_ACTION_REVELATION")) {
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
          dbg("Feed re-open counter timer created");
          const timer = setTimeout(() => {
            dbg("Feed re-open counter timer fired");
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
 * @memberof Client
 * @instance
 * @private
 * @param {Error} err
 */
proto._processBadServerMessage = function _processBadServerMessage(err) {
  dbg("Observed session badServerMessage event");

  this.emit("badServerMessage", err);
};

/**
 * Processes a session badClientMessage event. Pass-through.
 * @memberof Client
 * @instance
 * @private
 * @param {Object} diagnostics
 */
proto._processBadClientMessage = function _processBadClientMessage(
  diagnostics
) {
  dbg("Observed session badClientMessage event");

  this.emit("badClientMessage", diagnostics);
};

/**
 * Processes a session transportError event. Pass-through.
 * @memberof Client
 * @instance
 * @private
 * @param {Error} err
 */
proto._processTransportError = function _processTransportError(err) {
  dbg("Observed session transportError event");

  this.emit("transportError", err);
};

// Feed object functions

/**
 * Passed through from feed.desireOpen(). Responsible for emitting as appropriate
 * on the calling.
 * @memberof Client
 * @instance
 * @private
 * @param {Feed} appFeed
 * @throws {Error} "INVALID_FEED_STATE: ..."

 */
proto._appFeedDesireOpen = function _appFeedDesireOpen(appFeed) {
  dbg("Feed desire-open requested");

  // Feed already desired open?
  if (appFeed._desiredState === "open") {
    throw new Error("INVALID_FEED_STATE: The feed is already desired open.");
  }

  // Success
  appFeed._desiredState = "open"; // eslint-disable-line no-param-reassign

  // If not connected, emit close(DISCONNECTED) (new reason for closure) and stop
  if (this._session.state() !== "connected") {
    appFeed._emitClose(new Error("DISCONNECTED: The client is not connected."));
    return;
  }

  // Act according to the server feed state and perform the appropriate emission(s)
  // You know your last emission was closed, otherwise you couldn't desire open
  const serverFeedState = this._session.feedState(
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
      this._session.feedData(appFeed._feedName, appFeed._feedArgs)
    );
  } else if (serverFeedState === "closing") {
    appFeed._emitOpening();
  }
};

/**
 * Passed through from feed.desireClosed(). Responsible for emitting as appropriate
 * on the calling feed.
 * @memberof Client
 * @instance
 * @private
 * @param {Feed} appFeed
 * @throws {Error} "INVALID_FEED_STATE: ..."
 */
proto._appFeedDesireClosed = function _appFeedDesireClosed(appFeed) {
  dbg("Feed desire-closed requested");

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
  const sessionState = this._session.state();
  if (sessionState === "connected") {
    const serverFeedState = this._session.feedState(
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
 * @memberof Client
 * @instance
 * @private
 * @param {Feed} appFeed
 * @returns {string} "open" or "closed"
 */
proto._appFeedDesiredState = function _appFeedDesiredState(appFeed) {
  dbg("Desired feed state requested");
  return appFeed._desiredState;
};

/**
 * Passed through from feed.state()
 * @memberof Client
 * @instance
 * @private
 * @param {Feed} appFeed
 * @returns {string} "open", "opening", or "closed"
 */
proto._appFeedState = function _appFeedState(appFeed) {
  dbg("Feed state requested");

  if (appFeed._lastEmission === "close") {
    return "closed";
  }
  return appFeed._lastEmission; // opening or open
};

/**
 * Passed through from feed.destroy(). Will only be called if the
 * feed has not already been destroyed.
 * @memberof Client
 * @instance
 * @private
 * @param {Feed} appFeed Interaction object, plus Error("INVALID_FEED_STATE: ...")
 */
proto._appFeedDestroy = function _appFeedDestroy(appFeed) {
  dbg("Feed destroy requested");

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
 * @memberof Client
 * @instance
 * @private
 * @param {Feed} appFeed Interaction object
 * @returns {Object} Feed data
 * @throws {Error} "INVALID_FEED_STATE: ..."
 */
proto._appFeedData = function _appFeedData(appFeed) {
  dbg("Feed data requested");

  // Is the feed open?
  if (appFeed.state() !== "open") {
    throw new Error("INVALID_FEED_STATE: The feed object is not open.");
  }

  return this._session.feedData(appFeed._feedName, appFeed._feedArgs);
};

// Informers - Emit app feed events as the server feed state changes

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
 * @memberof Client
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 * @param {?Error}  err Not present if requested by client
 *
 *                      Error("TIMEOUT: ...")
 *                      Error("REJECTED: ...")
 *                      Error("DISCONNECTED: ...")
 *                      Error("TERMINATED: ...")
 *                      Error("BAD_ACTION_REVELATION: ...")
 */
proto._informServerFeedClosed = function _informServerFeedClosed(
  feedName,
  feedArgs,
  err
) {
  dbg(`Informing server feed closed`);

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return;
  }

  // Inform feed objects as appropriate
  _each(this._appFeeds[feedSerial], appFeed => {
    appFeed._serverFeedClosed(err);
  });
};

/**
 * Informs non-destroyed feed objects that the server feed is now opening.
 * @memberof Client
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 */
proto._informServerFeedOpening = function _informServerFeedOpening(
  feedName,
  feedArgs
) {
  dbg("Informing server feed opening");

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return;
  }

  // Inform feed objects as appropriate
  _each(this._appFeeds[feedSerial], appFeed => {
    appFeed._serverFeedOpening();
  });
};

/**
 * Informs non-destroyed feed objects that the server feed is now open.
 * @memberof Client
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 */
proto._informServerFeedOpen = function _informServerFeedOpen(
  feedName,
  feedArgs
) {
  dbg("Informing server feed open");

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return;
  }

  // Inform feed objects as appropriate
  _each(this._appFeeds[feedSerial], appFeed => {
    appFeed._serverFeedOpen();
  });
};

/**
 * Informs non-destroyed feed objects that the server feed is now closing.
 * Called on session unexpectedFeedClosing and intentional closure.
 * @memberof Client
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 * @param {?Error}  err
 */
proto._informServerFeedClosing = function _informServerFeedClosing(
  feedName,
  feedArgs,
  err
) {
  dbg("Informing server feed closing");

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return;
  }

  // Inform feed objects as appropriate
  _each(this._appFeeds[feedSerial], appFeed => {
    appFeed._serverFeedClosing(err);
  });
};

/**
 * Inform non-destroyed feed objects about an action revelation.
 * @memberof Client
 * @instance
 * @private
 * @param {string}  feedName
 * @param {Object}  feedArgs
 * @param {string}  actionName
 * @param {Object}  actionData
 * @param {Object}  newFeedData
 * @param {Object}  oldFeedData
 */
proto._informServerActionRevelation = function _informServerActionRevelation(
  feedName,
  feedArgs,
  actionName,
  actionData,
  newFeedData,
  oldFeedData
) {
  dbg("Informing server action revelation");

  // Are there any non-destroyed feed objects?
  const feedSerial = feedSerializer.serialize(feedName, feedArgs);
  if (!this._appFeeds[feedSerial]) {
    return;
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

// Internal helper functions

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
 * @memberof Client
 * @instance
 * @private
 * @param {string} feedName
 * @param {Object} feedArgs
 */
proto._considerFeedState = function _reconsiderFeed(feedName, feedArgs) {
  dbg("Considering feed state");

  // Do nothing if the session is not connected
  if (this.state() !== "connected") {
    return;
  }

  // Get the actual state of the feed
  const actualState = this._session.feedState(feedName, feedArgs);

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
        dbg("Feed open request timed out");
        const err = new Error(
          "TIMEOUT: The server did not respond to feed open request within the allocated time."
        );
        this._informServerFeedClosed(feedName, feedArgs, err);
      },
      err => {
        // Response callback - server feed is actionable
        if (err) {
          dbg("Feed open request returned error");
          this._informServerFeedClosed(feedName, feedArgs, err);
          // The error is either DISCONNECTED or REJECTED - don't _consider in either case
        } else {
          dbg("Feed open request returned success");
          this._informServerFeedOpen(feedName, feedArgs);
          this._considerFeedState(feedName, feedArgs); // Desired state may have changed
        }
      }
    );
  }

  // Close the feed?
  if (actualState === "open" && desiredState === "closed") {
    this._informServerFeedClosing(feedName, feedArgs);
    this._session.feedClose(feedName, feedArgs, () => {
      // The session returns success on successful server response AND disconnect
      // If server returned success, then inform feeds with no error
      // If client disconnected, then inform feeds with error
      if (this.state() === "connected") {
        dbg("Server feed closed due to disconnect");
        this._informServerFeedClosed(feedName, feedArgs);
      } else {
        dbg("Server feed closed due to CloseResponse");
        this._informServerFeedClosed(
          feedName,
          feedArgs,
          new Error("DISCONNECTED: The transport disconnected.")
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
 * receives DISCONNECTED error.
 *
 * The session is assumed to be connected and session feed state is
 * assumed to be closed.
 * @memberof Client
 * @instance
 * @private
 * @param {string}                    feedName
 * @param {Object}                    feedArgs
 * @param {feedOpenTimeoutCallback}   callbackTimeout
 * @param {feedOpenResponseCallback}  callbackResponse
 */
proto._feedOpenTimeout = function _feedOpenTimeout(
  feedName,
  feedArgs,
  callbackTimeout,
  callbackResponse
) {
  let timer;

  // Open the feed
  this._session.feedOpen(feedName, feedArgs, (err, feedData) => {
    if (timer) {
      clearTimeout(timer);
    }
    callbackResponse(err, feedData);
  });

  // Create a timer
  if (this._options.feedTimeoutMs > 0) {
    dbg("Feed open timeout timer created");
    timer = setTimeout(() => {
      dbg("Feed open timeout timer fired");
      timer = null; // Mark fired
      callbackTimeout();
    }, this._options.feedTimeoutMs);
  }
};

/**
 * Cancel any connect timeout.
 * @memberof Client
 * @instance
 * @private
 */
proto._connectTimeoutCancel = function _connectTimeoutCancel() {
  if (this._connectTimeoutTimer) {
    clearTimeout(this._connectTimeoutTimer);
  }
  this._connectTimeoutTimer = null;
};

/**
 * Internal function that tries to connect the session with timeout, and
 * that does not reset connection retry count (i.e. on TIMEOUT you call this).
 * @memberof Client
 * @instance
 * @throws {Error} Passed through from session.connect()
 */
proto._connect = function _connect() {
  // Connect the session - could fail, so before the timeout is set
  // If it works, you know you were disconnected
  this._session.connect();

  // Success

  // Set a timeout for the connection attempt?
  if (this._options.connectTimeoutMs > 0) {
    // The timeout is cleared on session connect/disconnect event
    dbg("Connection timeout timer created");
    this._connectTimeoutTimer = setTimeout(() => {
      dbg("Connection timeout timer fired");
      this._session.disconnect(
        new Error("TIMEOUT: The connection attempt timed out.")
      );
      // Error is routed to the session disconnect event
    }, this._options.connectTimeoutMs);
  }
};
