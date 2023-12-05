import emitter from "component-emitter";
import check from "check-types";
import _ from "lodash";
import FeedNameArgs from "feedme-util/feednameargs";
import config from "../config";
import client from "../client.sync";

jest.useFakeTimers();

/*

Testing Strategy

Client and Feed are tested here, as the latter is merely a conduit.

Unit: Each method code branch (app-, session-, or internally triggered).
For each unit, check that all potential results are as desired, including
verifying no change.

1. Test state-modifying functionality. Outside-facing and internal.
    App function calls on the client/feed
        Test all errors thrown directly, plus one cascade if applicable
        For each possible success path (by branch)
            Check client/feed events (no extra)
            Check client/feed internal state
            Check session calls (no extra)
            Check outbound callbacks are called
            Check inbound callbacks from session and timers
              Check client/feed events
              Check client/feed internal state
              Check session calls
              Check outbound callbacks are called
            Check return value
    Session-triggered events
        Test all errors - emitted
        For each possible success path (by branch)
            Check client/feed events (no extra)
            Check client/feed internal state
            Check session calls (no extra)
            Check outbound callbacks are called
            Check inbound callbacks from session and timers
              Check client/feed events
              Check client/feed internal state
              Check session calls

2. Test state-getting functionality. Outside-facing and internal.
    No need to worry about events, state, session calls, or callbacks.
    App function calls on the client/feed (only app-initiated)
      Test all errors thrown directly, plus one cascade if applicable
      For each possible success path (by branch)
        Check return value

State
  client._sessionWrapper                  = object
  client._sessionWrapperState             = string
  client._lastSessionWrapperStateEmission = string
  client._appFeeds[ser][i]                = object
  client._appFeedClients[ser][i]          = object
  client._appFeedNameArgs[ser][i]         = string
  client._appFeedDesiredStates[ser][i]    = string
  client._appFeedLastEmissions[ser][i]    = string
  client._connectTimeoutTimer             = number
  client._connectRetryTimer               = number
  client._connectRetryCount               = number
  client._reopenCounts                    = object
  client._reopenTimers                    = array
  client._feedCloseRequested              = object

1. State-modifying functionality (app- and session-triggered)
    App-triggered
      client()
      client.connect()
      client.disconnect()
      client.action()
      client.feed()
      client.destroy()
      client._appFeedDesireOpen() - feed.desireOpen()
      client._appFeedDesireClosed() - feed.desireClosed()
      client._appFeedDestroy() - feed.destroy()
    Session-triggered
      client._processConnecting()
      client._processConnect()
      client._processDisconnect()
      client._processFeedAction()
      client._processUnexpectedFeedClosing()
      client._processUnexpectedFeedClosed()
      client._processBadServerMessage()
      client._processBadClientMessage()
      client._processTransportError()
    Internal helpers
      client._considerFeedState()
      client._feedOpenTimeout()
      client._informServerFeedClosed() - feed._serverFeedClosed()
      client._informServerFeedOpening() - feed.serverFeedOpening()
      client._informServerFeedOpen() - feed.serverFeedOpen()
      client._informServerFeedClosing() - feed.serverFeedClosing()
      client._informServerFeedAction() - feed.serverFeedAction()
      client._connectTimeoutCancel()

2. State-getting functionality (app-triggered only)
    client.state()
    client.destroyed()
    client._appFeedDesiredState() - feed.desiredState()
    client._appFeedState() - feed.state()
    client._appFeedData() - feed.data()
    feed.destroyed()
      
*/

// Testing utilities

const harnessProto = {};

const harnessFactory = function harnessFactory(options = {}) {
  /*

    Members:
        .session (=client._sessionWrapper)
        .client
    Functions:
        .createClientListener()
        .getClientState() - all relevant members

  */

  const harness = Object.create(harnessProto);

  // Create mock session wrapper for the client to use
  const s = {};
  emitter(s);
  s.connect = jest.fn();
  s.disconnect = jest.fn();
  s.action = jest.fn();
  s.feedOpen = jest.fn();
  s.feedData = jest.fn();
  s.feedClose = jest.fn();
  s.destroy = jest.fn();
  s.state = jest.fn();
  s.state.mockReturnValue("disconnected");
  s.destroyed = jest.fn();
  s.destroyed.mockReturnValue(false);
  s.feedState = jest.fn();
  harness.sessionWrapper = s;

  // Function to reset mock session functions
  s.mockClear = function mockClear() {
    s.connect.mockClear();
    s.disconnect.mockClear();
    s.action.mockClear();
    s.feedOpen.mockClear();
    s.feedData.mockClear();
    s.feedClose.mockClear();
    s.state.mockClear();
    s.feedState.mockClear();
  };

  // Create the client
  options.sessionWrapper = s; // eslint-disable-line no-param-reassign
  harness.client = client(options);

  return harness;
};

harnessProto.createClientListener = function createClientListener() {
  const l = {
    connecting: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    badServerMessage: jest.fn(),
    badClientMessage: jest.fn(),
    transportError: jest.fn(),
  };
  l.mockClear = () => {
    l.connecting.mock.mockClear();
    l.connect.mock.mockClear();
    l.disconnect.mock.mockClear();
    l.badServerMessage.mock.mockClear();
    l.badClientMessage.mock.mockClear();
    l.transportError.mock.mockClear();
  };
  this.client.on("connecting", l.connecting);
  this.client.on("connect", l.connect);
  this.client.on("disconnect", l.disconnect);
  this.client.on("badServerMessage", l.badServerMessage);
  this.client.on("badClientMessage", l.badClientMessage);
  this.client.on("transportError", l.transportError);
  return l;
};

harnessProto.createFeedListener = function createFeedListener(feed) {
  const l = {
    opening: jest.fn(),
    open: jest.fn(),
    close: jest.fn(),
    action: jest.fn(),
  };
  l.mockClear = () => {
    l.opening.mock.mockClear();
    l.open.mock.mockClear();
    l.close.mock.mockClear();
    l.action.mock.mockClear();
  };
  feed.on("opening", l.opening);
  feed.on("open", l.open);
  feed.on("close", l.close);
  feed.on("action", l.action);
  return l;
};

harnessProto.getClientState = function getClientState() {
  const state = {};

  state._options = _.clone(this.client._options); // Object copy
  state._sessionWrapper = this.client._sessionWrapper; // Object reference
  state._sessionWrapperState = this.client._sessionWrapper.state(); // String
  state._lastSessionWrapperStateEmission =
    this.client._lastSessionWrapperStateEmission; // String
  state._appFeeds = {}; // _appFeeds[ser][i] = object reference
  state._appFeedStates = {}; // _appFeedStates[ser][i] = { _clientSync, ... }
  _.each(this.client._appFeeds, (val, ser) => {
    state._appFeeds[ser] = [];
    state._appFeedStates[ser] = [];
    _.each(this.client._appFeeds[ser], (feed, idx) => {
      state._appFeeds[ser][idx] = feed; // Object reference
      state._appFeedStates[ser][idx] = {
        _clientSync: feed._clientSync, // Object reference
        _feedNameArgs: feed._feedNameArgs, // Object reference
        _desiredState: feed._desiredState, // String
        _lastStateEmission: feed._lastStateEmission, // String
      };
    });
  });
  state._connectTimeoutTimer = this.client._connectTimeoutTimer; // Number/null
  state._connectRetryTimer = this.client._connectRetryTimer; // Number/null
  state._connectRetryCount = this.client._connectRetryCount; // Number
  state._reopenCounts = _.clone(this.client._reopenCounts); // Object
  state._reopenTimers = _.clone(this.client._reopenTimers); // Array
  state._feedCloseRequested = _.clone(this.client._feedCloseRequested); // Object

  return state;
};

expect.extend({
  toHaveState(receivedClient, expectedState) {
    // Check all that client state members are as expected

    // Check options
    if (!_.isEqual(receivedClient._options, expectedState._options)) {
      return {
        pass: false,
        message() {
          return "expected ._options objects to match, but they didn't";
        },
      };
    }

    // Check session object
    if (receivedClient._sessionWrapper !== expectedState._sessionWrapper) {
      return {
        pass: false,
        message() {
          return "expected ._sessionWrapper objects to match, but they didn't";
        },
      };
    }

    // Check session state
    if (
      receivedClient._sessionWrapper.state() !==
      expectedState._sessionWrapperState
    ) {
      return {
        pass: false,
        message() {
          return "expected ._sessionWrapper states to match, but they didn't";
        },
      };
    }

    // Check ._lastSessionWrapperStateEmission
    if (
      receivedClient._lastSessionWrapperStateEmission !==
      expectedState._lastSessionWrapperStateEmission
    ) {
      return {
        pass: false,
        message() {
          return "expected ._lastSessionWrapperStateEmission to match, but they didn't";
        },
      };
    }

    // Check that ._appFeeds keys are the same
    let receivedKeys = _.keys(receivedClient._appFeeds).sort();
    let expectedKeys = _.keys(expectedState._appFeeds).sort();
    if (!_.isEqual(receivedKeys, expectedKeys)) {
      return {
        pass: false,
        message() {
          return "expected ._appFeed keys to match, but they didn't";
        },
      };
    }

    // Check that ._appFeed[ser] array elements are the same
    let match = true;
    // For each feed serial
    _.each(receivedKeys, (key) => {
      // Array lengths must be identical
      if (
        receivedClient._appFeeds[key].length !==
        expectedState._appFeeds[key].length
      ) {
        match = false;
      }
      // Array elements must reference the same objects
      _.each(receivedClient._appFeeds[key], (val, idx) => {
        if (
          receivedClient._appFeeds[key][idx] !==
          expectedState._appFeeds[key][idx]
        ) {
          match = false;
        }
      });
    });
    if (!match) {
      return {
        pass: false,
        message() {
          return "expected ._appFeed objects to match, but they didn't";
        },
      };
    }

    // Check that ._appFeedStates keys are the same
    receivedKeys = _.keys(receivedClient._appFeeds).sort();
    expectedKeys = _.keys(expectedState._appFeedStates).sort();
    if (!_.isEqual(receivedKeys, expectedKeys)) {
      return {
        pass: false,
        message() {
          return "expected ._appFeedStates keys to match, but they didn't";
        },
      };
    }

    // Check each feed object state
    let err = null;
    _.each(receivedKeys, (key) => {
      // Array lengths must be identical
      if (
        receivedClient._appFeeds[key].length !==
        expectedState._appFeedStates[key].length
      ) {
        err = {
          pass: false,
          message() {
            return "expected feed array lengths to match, but they didn't";
          },
        };
      }
      for (let i = 0; i < receivedClient._appFeeds[key].length; i += 1) {
        const receivedFeed = receivedClient._appFeeds[key][i];
        const expectedFeed = expectedState._appFeedStates[key][i];

        // Check that ._clientSync matches
        if (receivedFeed._clientSync !== expectedFeed._clientSync) {
          err = {
            pass: false,
            message() {
              return "expected feed _clientSync to match, but they didn't";
            },
          };
        }

        // Check that ._feedNameArgs matches
        if (
          receivedFeed._feedNameArgs.name() !==
          expectedFeed._feedNameArgs.name()
        ) {
          err = {
            pass: false,
            message() {
              return "expected feed _feedNameArgs.name() to match, but they didn't";
            },
          };
        }

        // Check that ._feedArgs matches
        if (
          !_.isEqual(
            receivedFeed._feedNameArgs.args(),
            expectedFeed._feedNameArgs.args(),
          )
        ) {
          err = {
            pass: false,
            message() {
              return "expected feed _feedNameArgs.args() to match, but they didn't";
            },
          };
        }

        // Check that ._desiredState matches
        if (receivedFeed._desiredState !== expectedFeed._desiredState) {
          err = {
            pass: false,
            message() {
              return "expected feed _desiredState to match, but they didn't";
            },
          };
        }

        // Check that ._lastStateEmission matches
        if (
          receivedFeed._lastStateEmission !== expectedFeed._lastStateEmission
        ) {
          err = {
            pass: false,
            message() {
              return "expected feed _lastStateEmission to match, but they didn't";
            },
          };
        }
      }
    });
    if (err) {
      return err;
    }

    // Check ._connectTimeoutTimer (can't check timer ids, so check both numbers or both null)
    if (
      !(
        (check.number(receivedClient._connectTimeoutTimer) &&
          check.number(expectedState._connectTimeoutTimer)) ||
        (check.null(receivedClient._connectTimeoutTimer) &&
          check.null(expectedState._connectTimeoutTimer))
      )
    ) {
      return {
        pass: false,
        message() {
          return "expected ._connectTimeoutTimer to match, but they didn't";
        },
      };
    }

    // Check ._connectRetryTimer (can't check timer ids, so check both numbers or both null)
    if (
      !(
        (check.number(receivedClient._connectRetryTimer) &&
          check.number(expectedState._connectRetryTimer)) ||
        (check.null(receivedClient._connectRetryTimer) &&
          check.null(expectedState._connectRetryTimer))
      )
    ) {
      return {
        pass: false,
        message() {
          return "expected ._connectRetryTimer to match, but they didn't";
        },
      };
    }

    // Check ._connectRetryCount
    if (
      receivedClient._connectRetryCount !== expectedState._connectRetryCount
    ) {
      return {
        pass: false,
        message() {
          return "expected ._connectRetryCount to match, but they didn't";
        },
      };
    }

    // Check ._reopenCounts
    if (!_.isEqual(receivedClient._reopenCounts, expectedState._reopenCounts)) {
      return {
        pass: false,
        message() {
          return "expected ._reopenCounts to match, but they didn't";
        },
      };
    }

    // Check ._reopenTimers (can't check timer values)
    if (
      receivedClient._reopenTimers.length !== expectedState._reopenTimers.length
    ) {
      return {
        pass: false,
        message() {
          return "expected ._reopenTimers to match, but they didn't";
        },
      };
    }

    // Check ._feedCloseRequested
    if (
      !_.isEqual(
        receivedClient._feedCloseRequested,
        expectedState._feedCloseRequested,
      )
    ) {
      return {
        pass: false,
        message() {
          return "expected ._feedCloseRequested to match, but they didn't";
        },
      };
    }

    // Match
    return { pass: true };
  },
});

// Testing: app-triggered state modifiers

describe("The client() factory function", () => {
  // Errors

  describe("can return failure", () => {
    it("should reject calls with an invalid options argument", () => {
      expect(() => {
        client();
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid options argument."));
    });

    it("should reject calls with an invalid options.sessionWrapper argument", () => {
      expect(() => {
        client({ sessionWrapper: "junk" });
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid options.sessionWrapper."),
      );
    });

    it("should reject calls with an invalid options.connectTimeoutMs argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, connectTimeoutMs: -1 });
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid options.connectTimeoutMs."),
      );
    });

    it("should reject calls with an invalid options.connectRetryMs argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, connectRetryMs: "a" });
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid options.connectRetryMs."),
      );
    });

    it("should reject calls with an invalid options.connectRetryBackoffMs argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, connectRetryBackoffMs: -1 });
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid options.connectRetryBackoffMs."),
      );
    });

    it("should reject calls with an invalid options.connectRetryMaxMs argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, connectRetryMaxMs: -1 });
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid options.connectRetryMaxMs."),
      );
    });

    it("should reject calls with an invalid options.connectRetryMaxAttempts argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, connectRetryMaxAttempts: -1 });
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid options.connectRetryMaxAttempts."),
      );
    });

    it("should reject calls with an invalid options.actionTimeoutMs argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, actionTimeoutMs: -1 });
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid options.actionTimeoutMs."),
      );
    });

    it("should reject calls with an invalid options.feedTimeoutMs argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, feedTimeoutMs: -1 });
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid options.feedTimeoutMs."));
    });

    it("should reject calls with an invalid options.reconnect argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, reconnect: -1 });
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid options.reconnect."));
    });

    it("should reject calls with an invalid options.reopenMaxAttempts argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, reopenMaxAttempts: "a" });
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid options.reopenMaxAttempts."),
      );
    });

    it("should reject calls with an invalid options.reopenTrailingMs argument", () => {
      expect(() => {
        client({ sessionWrapper: {}, reopenTrailingMs: -1 });
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid options.reopenTrailingMs."),
      );
    });
  });

  // Success

  describe("can return success", () => {
    let harness;
    beforeEach(() => {
      harness = harnessFactory();
    });

    // Events - N/A

    // State

    it("should set the initial state appropriately", () => {
      expect(harness.client).toHaveState({
        _options: {
          connectTimeoutMs: config.defaults.connectTimeoutMs,
          connectRetryMs: config.defaults.connectRetryMs,
          connectRetryBackoffMs: config.defaults.connectRetryBackoffMs,
          connectRetryMaxMs: config.defaults.connectRetryMaxMs,
          connectRetryMaxAttempts: config.defaults.connectRetryMaxAttempts,
          actionTimeoutMs: config.defaults.actionTimeoutMs,
          feedTimeoutMs: config.defaults.feedTimeoutMs,
          reconnect: config.defaults.reconnect,
          reopenMaxAttempts: config.defaults.reopenMaxAttempts,
          reopenTrailingMs: config.defaults.reopenTrailingMs,
        },
        _sessionWrapper: harness.sessionWrapper,
        _sessionWrapperState: "disconnected",
        _lastSessionWrapperStateEmission: "disconnect",
        _appFeeds: {},
        _appFeedStates: {},
        _connectTimeoutTimer: null,
        _connectRetryTimer: null,
        _connectRetryCount: 0,
        _reopenCounts: {},
        _reopenTimers: [],
        _feedCloseRequested: {},
      });
    });

    // Session

    it("should make no session calls", () => {
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Outbound callbacks - N/A

    // Inbound callbacks - N/A

    // Return value
    it("should return an object", () => {
      expect(check.object(harness.sessionWrapper)).toBe(true);
    });
  });
});

describe("The client.connect() function", () => {
  // Errors

  it("should throw if destroyed", () => {
    const harness = harnessFactory();
    harness.client.destroy();
    harness.sessionWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness.client.connect();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should throw an error if the session state is not disconnected", () => {
    const harness = harnessFactory();
    harness.sessionWrapper.connect.mockImplementation(() => {
      harness.sessionWrapper.state.mockReturnValue("connecting");
    });
    harness.client.connect();
    expect(() => {
      harness.client.connect();
    }).toThrow(new Error("INVALID_STATE: Already connecting or connected."));
  });

  // Success

  describe("can return success", () => {
    let harness;
    beforeEach(() => {
      harness = harnessFactory();
    });

    // Events
    it("should emit nothing", () => {
      const clientListener = harness.createClientListener();
      harness.client.connect();

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should reset connection retry functionality", () => {
      // Need to connect, have the session disconnect so a retry is scheduled,
      // and then call .connect()
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("disconnect", new Error("TIMEOUT: ..."));
      // Now a connection retry is scheduled
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("disconnect", new Error("TIMEOUT: ..."));
      // Now a connection retry is scheduled and retry count is 1
      const newState = harness.getClientState();
      newState._sessionWrapperState = "connecting";
      newState._connectRetryCount = 0;
      newState._connectRetryTimer = null;

      harness.sessionWrapper.connect = jest.fn(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();

      expect(harness.client).toHaveState(newState);
    });

    // Session

    it("should call session.connect()", () => {
      harness.sessionWrapper.mockClear();
      harness.client.connect();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.connect.mock.calls[0].length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.state.mock.calls[0].length).toBe(0);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Outbound callbacks - N/A

    // Inbound callbacks - N/A

    // Return value

    it("should return void", () => {
      expect(harness.client.connect()).toBeUndefined();
    });
  });
});

describe("The client.disconnect() function", () => {
  // Errors

  it("should throw if destroyed", () => {
    const harness = harnessFactory();
    harness.client.destroy();
    harness.sessionWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness.client.disconnect();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should throw an error if the state is already disconnected", () => {
    const harness = harnessFactory();
    expect(() => {
      harness.client.disconnect();
    }).toThrow(new Error("INVALID_STATE: Already disconnected."));
  });

  // Success

  describe("can return success", () => {
    let harness;
    beforeEach(() => {
      harness = harnessFactory();
    });

    // Events
    it("should emit nothing", () => {
      harness.sessionWrapper.connect.mockImplementation(() => {
        harness.sessionWrapper.state.mockReturnValue("connected");
      });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");

      const clientListener = harness.createClientListener();
      harness.sessionWrapper.disconnect.mockImplementation(() => {
        harness.sessionWrapper.state.mockReturnValue("disconnected");
      });
      harness.client.disconnect();

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should change the state appropriately", () => {
      harness.sessionWrapper.connect.mockImplementation(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      const newState = harness.getClientState();
      harness.sessionWrapper.disconnect.mockImplementation(() => {
        harness.sessionWrapper.state.mockReturnValue("disconnected");
      });
      newState._sessionWrapperState = "disconnected";
      harness.client.disconnect();
      expect(harness.client).toHaveState(newState);
    });

    // Session

    it("should call session.disconnect()", () => {
      harness.sessionWrapper.connect.mockImplementation(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.mockClear();
      harness.sessionWrapper.disconnect.mockImplementation(() => {
        harness.sessionWrapper.state.mockReturnValue("disconnected");
      });
      harness.client.disconnect();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.disconnect.mock.calls[0].length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.state.mock.calls[0].length).toBe(0);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Outbound callbacks - N/A

    // Inbound callbacks - N/A

    // Return value

    it("should return void", () => {
      harness.sessionWrapper.connect.mockImplementation(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      expect(harness.client.disconnect()).toBeUndefined();
    });
  });
});

describe("The client.action() function", () => {
  // Errors

  describe("can return failure", () => {
    let harness;
    beforeEach(() => {
      // Mock connected
      harness = harnessFactory();
      harness.sessionWrapper.connect.mockImplementation(() => {
        harness.sessionWrapper.state.mockReturnValue("connected");
      });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
    });

    it("should throw if destroyed", () => {
      const harness2 = harnessFactory();
      harness2.client.destroy();
      harness2.sessionWrapper.destroyed.mockReturnValue(true);
      expect(() => {
        harness2.client.action();
      }).toThrow(
        new Error("DESTROYED: The client instance has been destroyed."),
      );
    });

    it("should throw an error for invalid action names", () => {
      expect(() => {
        harness.client.action(undefined, {}, () => {});
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid action name."));
    });

    it("should throw an error for invalid action args", () => {
      expect(() => {
        harness.client.action("myAction", "junk", () => {});
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid action arguments object."),
      );
    });

    it("should throw an error for non-JSON-expressible action args", () => {
      expect(() => {
        harness.client.action("myAction", { arg: undefined }, () => {});
      }).toThrow(
        new Error(
          "INVALID_ARGUMENT: Action arguments must be JSON-expressible.",
        ),
      );
    });

    it("should throw on invalid callback", () => {
      expect(() => {
        harness.client.action("some_action", {}, "junk");
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid callback."));
    });
  });

  // Success

  describe("can return success - not connected", () => {
    // Events

    it("should emit no events", () => {
      const harness = harnessFactory();
      const clientListener = harness.createClientListener();
      harness.client.action("myAction", { arg: "val" }, () => {});

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should not change the state", () => {
      const harness = harnessFactory();
      const newState = harness.getClientState();
      harness.client.action("myAction", { arg: "val" }, () => {});
      expect(harness.client).toHaveState(newState);
    });

    // Session

    it("should do nothing on the session", () => {
      const harness = harnessFactory();
      harness.client.action("myAction", { arg: "val" }, () => {});
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.state.mock.calls[0].length).toBe(0);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should call back NOT_CONNECTED error", () => {
      const harness = harnessFactory();
      const cb = jest.fn();
      harness.client.action("myAction", { arg: "val" }, cb);
      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(1);
      expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(cb.mock.calls[0][0].message).toBe(
        "NOT_CONNECTED: The client is not connected.",
      );
      expect(cb.mock.instances[0]).toBe(undefined);
    });

    // Return value

    it("should return nothing", () => {
      const harness = harnessFactory();
      expect(harness.client.action("myAction", {}, () => {})).toBeUndefined();
    });
  });

  describe("can return success - connected", () => {
    let harness;
    beforeEach(() => {
      // Mock connected
      harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");
    });

    // Events

    it("should emit nothing", () => {
      const clientListener = harness.createClientListener();
      harness.client.action("myAction", {}, () => {});

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should not change the state", () => {
      const newState = harness.getClientState();
      harness.client.action("myAction", {}, () => {});
      expect(harness.client).toHaveState(newState);
    });

    // Session

    it("should call session.action()", () => {
      harness.sessionWrapper.mockClear();
      harness.client.action("myAction", { arg: "val" }, () => {});
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.action.mock.calls[0].length).toBe(3);
      expect(harness.sessionWrapper.action.mock.calls[0][0]).toBe("myAction");
      expect(harness.sessionWrapper.action.mock.calls[0][1]).toEqual({
        arg: "val",
      });
      expect(
        check.function(harness.sessionWrapper.action.mock.calls[0][2]),
      ).toBe(true);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.state.mock.calls[0].length).toBe(0);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Outbound callbacks - N/A (not called directly, via inbound callbacks only)

    // Inbound callbacks

    describe("a callback from session.action(), success or failure", () => {
      it("should emit no events", () => {
        const clientListener = harness.createClientListener();
        harness.client.action("myAction", { arg: "val" }, () => {});
        const sessionCb = harness.sessionWrapper.action.mock.calls[0][2];

        sessionCb(undefined, { action: "data" });

        expect(clientListener.connecting.mock.calls.length).toBe(0);
        expect(clientListener.connect.mock.calls.length).toBe(0);
        expect(clientListener.disconnect.mock.calls.length).toBe(0);
        expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
        expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
        expect(clientListener.transportError.mock.calls.length).toBe(0);
      });

      it("should not change the state", () => {
        harness.client.action("myAction", { arg: "val" }, () => {});
        const sessionCb = harness.sessionWrapper.action.mock.calls[0][2];

        const newState = harness.getClientState();

        sessionCb(undefined, { action: "data" });

        expect(harness.client).toHaveState(newState);
      });

      it("should call nothing on session", () => {
        harness.client.action("myAction", { arg: "val" }, () => {});
        const sessionCb = harness.sessionWrapper.action.mock.calls[0][2];
        harness.sessionWrapper.mockClear();

        sessionCb(undefined, { action: "data" });

        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });

      it("if not already timed out and success, should call callback() with result", () => {
        const cb = jest.fn();
        harness.client.action("myAction", { arg: "val" }, cb);
        const sessionCb = harness.sessionWrapper.action.mock.calls[0][2];

        sessionCb(undefined, { action: "data" });

        expect(cb.mock.calls.length).toBe(1);
        expect(cb.mock.calls[0].length).toBe(2);
        expect(cb.mock.calls[0][0]).toBe(undefined);
        expect(cb.mock.calls[0][1]).toEqual({ action: "data" });
        expect(cb.mock.instances[0]).toBe(undefined);
      });

      it("if not already timed out and failure, should call callback() with result", () => {
        const cb = jest.fn();
        harness.client.action("myAction", { arg: "val" }, cb);
        const sessionCb = harness.sessionWrapper.action.mock.calls[0][2];

        const err = new Error("SOME_ERROR: ...");
        sessionCb(err);

        expect(cb.mock.calls.length).toBe(1);
        expect(cb.mock.calls[0].length).toBe(1);
        expect(cb.mock.calls[0][0]).toBe(err);
        expect(cb.mock.instances[0]).toBe(undefined);
      });

      it("if already timed out, should not call callback()", () => {
        const cb = jest.fn();
        harness.client.action("myAction", { arg: "val" }, cb);
        const sessionCb = harness.sessionWrapper.action.mock.calls[0][2];

        jest.advanceTimersByTime(config.defaults.actionTimeoutMs);

        cb.mockClear(); // Move past TIMEOUT error

        sessionCb(undefined, { action: "data" });

        expect(cb.mock.calls.length).toBe(0);
      });
    });

    describe("the callback from the timeout", () => {
      it("should emit no events", () => {
        const clientListener = harness.createClientListener();
        harness.client.action("myAction", {}, () => {});
        jest.advanceTimersByTime(config.defaults.actionTimeoutMs);

        expect(clientListener.connecting.mock.calls.length).toBe(0);
        expect(clientListener.connect.mock.calls.length).toBe(0);
        expect(clientListener.disconnect.mock.calls.length).toBe(0);
        expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
        expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
        expect(clientListener.transportError.mock.calls.length).toBe(0);
      });

      it("should not change the state", () => {
        const newState = harness.getClientState();
        harness.client.action("myAction", {}, () => {});
        jest.advanceTimersByTime(config.defaults.actionTimeoutMs);
        expect(harness.client).toHaveState(newState);
      });

      it("should call nothing on session", () => {
        harness.client.action("myAction", { arg: "val" }, () => {});
        harness.sessionWrapper.mockClear();
        jest.advanceTimersByTime(config.defaults.actionTimeoutMs);
        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });

      it("should call callback(TIMEOUT) if so configured", () => {
        const cb = jest.fn();
        harness.client.action("myAction", { arg: "val" }, cb);

        jest.advanceTimersByTime(config.defaults.actionTimeoutMs);

        expect(cb.mock.calls.length).toBe(1);
        expect(cb.mock.calls[0].length).toBe(1);
        expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
        expect(cb.mock.calls[0][0].message).toBe(
          "TIMEOUT: The server did not respond within the allocated time.",
        );
        expect(cb.mock.instances[0]).toBe(undefined);
      });

      it("should not call callback(TIMEOUT) if so configured", () => {
        // Mock connected
        harness = harnessFactory({ actionTimeoutMs: 0 });
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const cb = jest.fn();
        harness.client.action("myAction", { arg: "val" }, cb);

        jest.advanceTimersByTime(Math.MAX_SAFE_INTEGER);

        expect(cb.mock.calls.length).toBe(0); // No timeout
      });
    });

    // Return value

    it("should return void", () => {
      expect(
        harness.client.action("myAction", { arg: "val" }, () => {}),
      ).toBeUndefined();
    });
  });
});

describe("The client.feed() function", () => {
  // Errors

  describe("can return failure", () => {
    it("should throw if destroyed", () => {
      const harness = harnessFactory();
      harness.client.destroy();
      harness.sessionWrapper.destroyed.mockReturnValue(true);
      expect(() => {
        harness.client.feed();
      }).toThrow(
        new Error("DESTROYED: The client instance has been destroyed."),
      );
    });

    it("should reject calls with an invalid feed name argument", () => {
      const harness = harnessFactory();
      expect(() => {
        harness.client.feed(123, { feed: "args" });
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed name."));
    });

    it("should reject calls with invalid feedArg argument", () => {
      const harness = harnessFactory();
      expect(() => {
        harness.client.feed("someFeed", 0);
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed arguments object."));
    });

    it("should reject calls with invalid feedArg properties", () => {
      const harness = harnessFactory();
      expect(() => {
        harness.client.feed("someFeed", { arg: 0 });
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed arguments object."));
    });
  });

  // Success

  describe("can return success", () => {
    let harness;
    beforeEach(() => {
      harness = harnessFactory();
    });

    // Events

    it("should emit nothing", () => {
      const clientListener = harness.createClientListener();
      harness.client.feed("someFeed", { arg: "val" });

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should add a feed object reference", () => {
      const newState = harness.getClientState();
      const f = harness.client.feed("someFeed", { arg: "val" });
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      newState._appFeeds[feedSerial] = [f];
      newState._appFeedStates[feedSerial] = [
        {
          _clientSync: harness.client,
          _feedNameArgs: FeedNameArgs("someFeed", { arg: "val" }),
          _desiredState: "closed",
          _lastStateEmission: "close",
        },
      ];
      expect(harness.client).toHaveState(newState);
    });

    // Session

    it("should make no session calls", () => {
      harness.client.feed("someFeed", { arg: "val" });
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Outbound callbacks - N/A

    // Inbound callbacks - N/A

    // Return value
    it("should return an object", () => {
      expect(
        check.object(harness.client.feed("someFeed", { arg: "val" })),
      ).toBe(true);
    });
  });
});

describe("The client.destroy() function", () => {
  // Errors

  describe("can return failure", () => {
    it("should throw if destroyed", () => {
      const harness2 = harnessFactory();
      harness2.client.destroy();
      harness2.sessionWrapper.destroyed.mockReturnValue(true);
      expect(() => {
        harness2.client.destroy();
      }).toThrow(
        new Error("DESTROYED: The client instance has been destroyed."),
      );
    });

    it("should throw if not disconnected", () => {
      const harness = harnessFactory();
      harness.sessionWrapper.connect.mockImplementation(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();
      expect(() => {
        harness.client.destroy();
      }).toThrow(new Error("INVALID_STATE: Not disconnected."));
    });
  });

  // Success

  describe("can return success", () => {
    let harness;
    let feedDestroyed;
    let feedDesiredClosed;
    let feedDesiredOpen;
    beforeEach(() => {
      harness = harnessFactory();

      feedDestroyed = harness.client.feed("SomeFeed", { Feed: "Args" });
      feedDestroyed.destroy();

      feedDesiredClosed = harness.client.feed("SomeFeed", { Feed: "Args" });

      feedDesiredOpen = harness.client.feed("SomeFeed", { Feed: "Args" });
      feedDesiredOpen.desireOpen();
    });
    // Events

    it("should emit events appropriately", () => {
      const clientListener = harness.createClientListener();
      const feedDestroyedListener = harness.createFeedListener(feedDestroyed);
      const feedDesiredClosedListener =
        harness.createFeedListener(feedDesiredClosed);
      const feedDesiredOpenListener =
        harness.createFeedListener(feedDesiredOpen);

      harness.client.destroy();

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);

      expect(feedDestroyedListener.opening.mock.calls.length).toBe(0);
      expect(feedDestroyedListener.open.mock.calls.length).toBe(0);
      expect(feedDestroyedListener.close.mock.calls.length).toBe(0);
      expect(feedDestroyedListener.action.mock.calls.length).toBe(0);

      expect(feedDesiredClosedListener.opening.mock.calls.length).toBe(0);
      expect(feedDesiredClosedListener.open.mock.calls.length).toBe(0);
      expect(feedDesiredClosedListener.close.mock.calls.length).toBe(0);
      expect(feedDesiredClosedListener.action.mock.calls.length).toBe(0);

      expect(feedDesiredOpenListener.opening.mock.calls.length).toBe(0);
      expect(feedDesiredOpenListener.open.mock.calls.length).toBe(0);
      expect(feedDesiredOpenListener.close.mock.calls.length).toBe(1);
      expect(feedDesiredOpenListener.close.mock.calls[0].length).toBe(0);
      expect(feedDesiredOpenListener.action.mock.calls.length).toBe(0);
    });

    // State

    it("should update the state appropriately", () => {
      const newState = harness.getClientState();
      newState._appFeeds = [];
      newState._appFeedStates = [];

      harness.client.destroy();

      expect(harness.client).toHaveState(newState);
    });

    // Transport

    it("should call sessionWrapper.destroy()", () => {
      harness.client.destroy();

      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length > 0).toBe(true);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.destroy.mock.calls[0].length).toBe(0);
    });

    // Callbacks - N/A

    // Return value

    it("should return nothing", () => {
      expect(harness.client.destroy()).toBeUndefined();
    });
  });
});

describe("The feed.desireOpen() and client._appFeedDesireOpen() functions", () => {
  // Errors

  describe("can return failure", () => {
    it("should throw if destroyed", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
      harness.client.destroy();
      harness.sessionWrapper.destroyed.mockReturnValue(true);
      expect(() => {
        feed.desireOpen();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should reject calls if desired state is already open", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("someFeed", { arg: "val" });
      feed.desireOpen();
      expect(() => {
        feed.desireOpen();
      }).toThrow(
        new Error("INVALID_FEED_STATE: The feed is already desired open."),
      );
    });
  });

  // Success

  describe("can return success", () => {
    let harness;
    beforeEach(() => {
      // Set up a connected client
      harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");
    });

    // Events

    it("if session is disconnected, should emit close(NOT_CONNECTED)", () => {
      harness = harnessFactory();
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      const feed = harness.client.feed("someFeed", { arg: "val" });
      const feedListener = harness.createFeedListener(feed);
      feed.desireOpen();

      expect(feedListener.opening.mock.calls.length).toBe(0);
      expect(feedListener.open.mock.calls.length).toBe(0);
      expect(feedListener.close.mock.calls.length).toBe(1);
      expect(feedListener.close.mock.calls[0].length).toBe(1);
      expect(feedListener.close.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(feedListener.close.mock.calls[0][0].message).toBe(
        "NOT_CONNECTED: The client is not connected.",
      );
      expect(feedListener.action.mock.calls.length).toBe(0);
    });

    it("if connected and server feed closed, should  emit opening on the feed (indirect)", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      const feedListener = harness.createFeedListener(feed);
      harness.sessionWrapper.state.mockReturnValue("connected");
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      feed.desireOpen();

      expect(feedListener.opening.mock.calls.length).toBe(1);
      expect(feedListener.opening.mock.calls[0].length).toBe(0);
      expect(feedListener.open.mock.calls.length).toBe(0);
      expect(feedListener.close.mock.calls.length).toBe(0);
      expect(feedListener.action.mock.calls.length).toBe(0);
    });

    it("if connected and server feed opening, should emit opening on the feed", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      const feedListener = harness.createFeedListener(feed);
      harness.sessionWrapper.state.mockReturnValue("connected");
      harness.sessionWrapper.feedState.mockReturnValue("opening");
      feed.desireOpen();

      expect(feedListener.opening.mock.calls.length).toBe(1);
      expect(feedListener.opening.mock.calls[0].length).toBe(0);
      expect(feedListener.open.mock.calls.length).toBe(0);
      expect(feedListener.close.mock.calls.length).toBe(0);
    });

    it("if connected and server feed open, should emit opening and open on the feed", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      const feedListener = harness.createFeedListener(feed);
      harness.sessionWrapper.state.mockReturnValue("connected");
      harness.sessionWrapper.feedState.mockReturnValue("open");
      harness.sessionWrapper.feedData.mockReturnValue({ feed: "data" });
      feed.desireOpen();

      expect(feedListener.opening.mock.calls.length).toBe(1);
      expect(feedListener.opening.mock.calls[0].length).toBe(0);
      expect(feedListener.open.mock.calls.length).toBe(1);
      expect(feedListener.open.mock.calls[0].length).toBe(1);
      expect(feedListener.open.mock.calls[0][0]).toEqual({ feed: "data" });
      expect(feedListener.close.mock.calls.length).toBe(0);
      expect(feedListener.action.mock.calls.length).toBe(0);
    });

    it("if connected and server feed closing, should emit opening on the feed", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      const feedListener = harness.createFeedListener(feed);
      harness.sessionWrapper.state.mockReturnValue("connected");
      harness.sessionWrapper.feedState.mockReturnValue("closing");
      feed.desireOpen();

      expect(feedListener.opening.mock.calls.length).toBe(1);
      expect(feedListener.opening.mock.calls[0].length).toBe(0);
      expect(feedListener.open.mock.calls.length).toBe(0);
      expect(feedListener.close.mock.calls.length).toBe(0);
      expect(feedListener.action.mock.calls.length).toBe(0);
    });

    // State

    it("if session is disconnected, should update only feed._desiredState", () => {
      harness = harnessFactory();
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      const feed = harness.client.feed("someFeed", { arg: "val" });
      const newState = harness.getClientState();
      feed.desireOpen();
      newState._appFeedStates[
        FeedNameArgs("someFeed", { arg: "val" }).serial()
      ][0]._desiredState = "open";
      expect(harness.client).toHaveState(newState);
    });

    it("if connected and server feed closed, should update feed._desiredState (open) and feed._lastStateEmission (opening)", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      const newState = harness.getClientState();
      feed.desireOpen();
      newState._appFeedStates[feedSerial][0]._desiredState = "open";
      newState._appFeedStates[feedSerial][0]._lastStateEmission = "opening";
      expect(harness.client).toHaveState(newState);
    });

    it("if connected and server feed opening, should update feed._desiredState (open) and feed._lastStateEmission (opening)", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("opening");
      const newState = harness.getClientState();
      feed.desireOpen();
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      newState._appFeedStates[feedSerial][0]._desiredState = "open";
      newState._appFeedStates[feedSerial][0]._lastStateEmission = "opening";
      expect(harness.client).toHaveState(newState);
    });

    it("if connected and server feed open, should update feed._desiredState (open) and feed._lastStateEmission (open)", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("open");
      const newState = harness.getClientState();
      feed.desireOpen();
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      newState._appFeedStates[feedSerial][0]._desiredState = "open";
      newState._appFeedStates[feedSerial][0]._lastStateEmission = "open";
      expect(harness.client).toHaveState(newState);
    });

    it("if connected and server feed closing, should update feed._desiredState (open) and feed._lastStateEmission (opening)", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closing");
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      const newState = harness.getClientState();
      feed.desireOpen();
      newState._appFeedStates[feedSerial][0]._desiredState = "open";
      newState._appFeedStates[feedSerial][0]._lastStateEmission = "opening";
      expect(harness.client).toHaveState(newState);
    });

    // Session

    it("if session is disconnected, should only call session.state()", () => {
      harness = harnessFactory();
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and server feed closed, should call session.state() x 2, session.feedState() x 2, and session.feedOpen()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.feedOpen.mock.calls[0].length).toBe(2);
      expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].name()).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].args()).toEqual({
        arg: "val",
      });
      expect(
        check.function(harness.sessionWrapper.feedOpen.mock.calls[0][1]),
      ).toBe(true);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and server feed opening, should call session.state() and session.feedState()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("opening");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and server feed open, should call session.state() and session.feedState()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("open");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.feedData.mock.calls[0].length).toBe(1);
      expect(harness.sessionWrapper.feedData.mock.calls[0][0].name()).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedData.mock.calls[0][0].args()).toEqual({
        arg: "val",
      });
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and server feed closed, should call session.state() and session.feedState()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closing");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Outbound callbacks - N/A

    // Inbound callbacks - N/A

    // Return value

    it("should return void", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      expect(feed.desireOpen()).toBeUndefined();
    });
  });
});

describe("The feed.desireClosed() and client._appFeedDesireClosed() functions", () => {
  // Errors

  describe("can return failure", () => {
    it("should throw if destroyed", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
      harness.client.destroy();
      harness.sessionWrapper.destroyed.mockReturnValue(true);
      expect(() => {
        feed.desireClosed();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should reject calls if desired state is already closed", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("someFeed", { arg: "val" });
      expect(() => {
        feed.desireClosed();
      }).toThrow(
        new Error("INVALID_FEED_STATE: The feed is already desired closed."),
      );
    });
  });

  // Success

  describe("can return success", () => {
    let harness;
    beforeEach(() => {
      // Set up a connected client
      harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");
    });

    // Events

    it("it should emit close()", () => {
      harness = harnessFactory();
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      const feed = harness.client.feed("someFeed", { arg: "val" });
      feed.desireOpen();

      const feedListener = harness.createFeedListener(feed);
      feed.desireClosed();

      expect(feedListener.opening.mock.calls.length).toBe(0);
      expect(feedListener.open.mock.calls.length).toBe(0);
      expect(feedListener.close.mock.calls.length).toBe(1);
      expect(feedListener.close.mock.calls[0].length).toBe(0);
      expect(feedListener.action.mock.calls.length).toBe(0);
    });

    // State

    it("if the session is disconnected, should update only feed._desiredState (closed)", () => {
      harness = harnessFactory();
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      const feed = harness.client.feed("someFeed", { arg: "val" });
      feed.desireOpen();
      const newState = harness.getClientState();
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      newState._appFeedStates[feedSerial][0]._desiredState = "closed";
      feed.desireClosed();
      expect(harness.client).toHaveState(newState);
    });

    it("if connected and last emit was close, should update only feed._desiredState (closed)", () => {
      // Mock an open feed
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      harness.sessionWrapper.feedState.mockReturnValue("open");
      cb(undefined, { feed: "data" });

      harness.sessionWrapper.emit(
        "unexpectedFeedClosing",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("TERMINATED: ..."),
      ); // cause the feed to emit close
      harness.sessionWrapper.feedState.mockReturnValue("closed");

      const newState = harness.getClientState();
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      newState._appFeedStates[feedSerial][0]._desiredState = "closed";
      feed.desireClosed();
      expect(harness.client).toHaveState(newState);
    });

    it("if connected and last emit was opening, should update feed._desiredState (closed) and feed.lastEmission (close)", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      feed.desireOpen(); // feed emits opening
      harness.sessionWrapper.feedState.mockReturnValue("opening");
      const newState = harness.getClientState();
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      newState._appFeedStates[feedSerial][0]._desiredState = "closed";
      newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";
      feed.desireClosed();
      expect(harness.client).toHaveState(newState);
    });

    it("if connected and last emit was open, should update state appropriately", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("open");
      feed.desireOpen(); // feed emits opening and open
      const newState = harness.getClientState();
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      newState._appFeedStates[feedSerial][0]._desiredState = "closed";
      newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";
      newState._feedCloseRequested[feedSerial] = true;

      feed.desireClosed();

      expect(harness.client).toHaveState(newState);
    });

    // Session

    it("if the session is disconnected, should call only session.state()", () => {
      harness = harnessFactory();
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      const feed = harness.client.feed("someFeed", { arg: "val" });
      feed.desireOpen();
      harness.sessionWrapper.mockClear();
      feed.desireClosed();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and the server feed is closed, should call only session.state() and session.feedState()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      // Return error to feedOpen callback
      harness.sessionWrapper.mockClear();
      feed.desireOpen(); // server feed becomes opening
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      cb(new Error("REJECTED: ..."));
      // Now the server feed is closed and the app feed is desired open
      harness.sessionWrapper.mockClear();
      feed.desireClosed();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and the server feed is opening, should call only session.state() and session.feedState()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      feed.desireOpen();
      harness.sessionWrapper.feedState.mockReturnValue("opening");
      harness.sessionWrapper.mockClear();
      feed.desireClosed();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and the server feed is open and no other app object exist, should call session.state() x 2, session.feedState() x 2, and session.feedClose()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      // Return success to feedOpen callback
      harness.sessionWrapper.mockClear();
      feed.desireOpen(); // server feed becomes opening
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      cb(undefined, { feed: "data" });
      // Now the server feed is open and the app feed is desired open
      harness.sessionWrapper.feedState.mockReturnValue("open");
      harness.sessionWrapper.mockClear();
      feed.desireClosed();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.feedClose.mock.calls[0].length).toBe(2);
      expect(harness.sessionWrapper.feedClose.mock.calls[0][0].name()).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedClose.mock.calls[0][0].args()).toEqual({
        arg: "val",
      });
      expect(
        check.function(harness.sessionWrapper.feedClose.mock.calls[0][1]),
      ).toBe(true);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and the server feed is open and another object is desired closed, should call session.state() x 2, session.feedState() x 2, and session.feedClose()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      // Return success to feedOpen callback
      harness.sessionWrapper.mockClear();
      feed.desireOpen(); // server feed becomes opening
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      cb(undefined, { feed: "data" });
      // Now the server feed is open and the app feed is desired open
      harness.sessionWrapper.feedState.mockReturnValue("open");
      harness.client.feed("someFeed", { arg: "val" }); // Desired closed
      harness.sessionWrapper.mockClear();
      feed.desireClosed();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.feedClose.mock.calls[0].length).toBe(2);
      expect(harness.sessionWrapper.feedClose.mock.calls[0][0].name()).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedClose.mock.calls[0][0].args()).toEqual({
        arg: "val",
      });
      expect(
        check.function(harness.sessionWrapper.feedClose.mock.calls[0][1]),
      ).toBe(true);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and the server feed is open and another feed is desired open, should call only session.state() and session.feedState()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      // Return success to feedOpen callback
      harness.sessionWrapper.mockClear();
      feed.desireOpen(); // server feed becomes opening
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      cb(undefined, { feed: "data" });
      // Now the server feed is open and the app feed is desired open
      harness.sessionWrapper.feedState.mockReturnValue("open");
      const feed2 = harness.client.feed("someFeed", { arg: "val" });
      feed2.desireOpen();
      harness.sessionWrapper.mockClear();
      feed.desireClosed();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if connected and the server feed is closing, should call only session.state() and session.feedState()", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      // Return success to feedOpen callback
      harness.sessionWrapper.mockClear();
      feed.desireOpen(); // server feed becomes opening
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      cb(undefined, { feed: "data" });
      // Now the server feed is open and the app feed is desired open
      feed.desireClosed(); // Now the server feed state is closing
      harness.sessionWrapper.feedState.mockReturnValue("closing");
      const feed2 = harness.client.feed("someFeed", { arg: "val" });
      feed2.desireOpen();
      harness.sessionWrapper.mockClear();
      feed2.desireClosed();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Outbound callbacks - N/A

    // Inbound callbacks - N/A

    // Return value

    it("should return void", () => {
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      feed.desireOpen();
      harness.sessionWrapper.feedState.mockReturnValue("opening");
      expect(feed.desireClosed()).toBeUndefined();
    });
  });
});

describe("The feed.destroy() and client._appFeedDestroy() functions", () => {
  // Errors

  describe("can return failure", () => {
    it("should reject calls if already destroyed", () => {
      expect(() => {
        const harness = harnessFactory();
        const feed = harness.client.feed("someFeed", { arg: "val" });
        feed.destroy();
        feed.destroy();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should reject calls if desired open", () => {
      expect(() => {
        const harness = harnessFactory();
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.state.mockReturnValue("connected");
        harness.sessionWrapper.feedState.mockReturnValue("open");
        feed.desireOpen();
        feed.destroy();
      }).toThrow(
        new Error(
          "INVALID_FEED_STATE: Only feeds desired closed can be destroyed.",
        ),
      );
    });
  });

  // Success

  describe("can return success", () => {
    let harness;
    let feed;
    let feedSerial;
    beforeEach(() => {
      // Mock a feed (disconnected)
      harness = harnessFactory();
      feed = harness.client.feed("someFeed", { arg: "val" });
      feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
    });

    // Events

    it("should emit nothing", () => {
      const clientListener = harness.createClientListener();
      feed.destroy();

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("if there are other feeds registered, remove them from _appFeeds[ser] array", () => {
      const feed2 = harness.client.feed("someFeed", { arg: "val" });
      const newState = harness.getClientState();
      newState._appFeeds[feedSerial].pop();
      newState._appFeedStates[feedSerial].pop();
      feed2.destroy();
      expect(harness.client).toHaveState(newState);
    });

    it("if there are not other feeds registered, remove _appFeeds object", () => {
      const newState = harness.getClientState();
      delete newState._appFeeds[feedSerial];
      delete newState._appFeedStates[feedSerial];
      feed.destroy();
      expect(harness.client).toHaveState(newState);
    });

    // Session

    it("should do nothing on the session (known to be desired closed)", () => {
      feed.destroy();
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Outbound callbacks - N/A

    // Inbound callbacks - N/A

    // Return value

    it("should return void", () => {
      expect(feed.destroy()).toBeUndefined();
    });
  });
});

// Testing: session-triggered state modifiers

describe("The client._processConnecting() function", () => {
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  // Events

  it("should emit a connecting event", () => {
    harness.client.connect();
    const clientListener = harness.createClientListener();
    harness.sessionWrapper.emit("connecting");

    expect(clientListener.connecting.mock.calls.length).toBe(1);
    expect(clientListener.connecting.mock.calls[0].length).toBe(0);
    expect(clientListener.connect.mock.calls.length).toBe(0);
    expect(clientListener.disconnect.mock.calls.length).toBe(0);
    expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
    expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
    expect(clientListener.transportError.mock.calls.length).toBe(0);
  });

  // State

  it("should update _lastSessionWrapperStateEmission to connecting", () => {
    harness.client.connect();
    const newState = harness.getClientState();
    newState._lastSessionWrapperStateEmission = "connecting";
    newState._connectTimeoutTimer = 9999;
    harness.sessionWrapper.emit("connecting");

    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("should do nothing on the session", () => {
    harness.client.connect();
    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.emit("connecting");
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks

  describe("on timeout if session state is connecting", () => {
    it("should emit nothing", () => {
      // Need to try to connect and time out
      harness.sessionWrapper.connect = jest.fn(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();

      harness.sessionWrapper.emit("connecting");

      const clientListener = harness.createClientListener();

      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    it("should update state", () => {
      // Need to try to connect and time out
      harness.sessionWrapper.connect = jest.fn(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");

      const newState = harness.getClientState();
      newState._connectTimeoutTimer = null;

      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);

      expect(harness.client).toHaveState(newState);
    });

    it("should call session.disconnect()", () => {
      // Need to try to connect and time out
      harness.sessionWrapper.connect = jest.fn(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.mockClear();

      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);

      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.disconnect.mock.calls[0].length).toBe(1);
      expect(harness.sessionWrapper.disconnect.mock.calls[0][0]).toBeInstanceOf(
        Error,
      );
      expect(harness.sessionWrapper.disconnect.mock.calls[0][0].message).toBe(
        "TIMEOUT: The connection attempt timed out.",
      );
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });
  });

  describe("on timeout if session state is disconnected", () => {
    it("should emit nothing", () => {
      // Need to try to connect and time out
      harness.sessionWrapper.connect = jest.fn(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();

      harness.sessionWrapper.state.mockReturnValue("disconnected"); // No emission yet

      const clientListener = harness.createClientListener();

      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    it("should update the state appropriately", () => {
      // Need to try to connect and time out
      harness.client.connect();
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.mockClear();

      const newState = harness.getClientState();
      newState._connectTimeoutTimer = null;

      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);

      expect(harness.client).toHaveState(newState);
    });

    it("should call nothing on the session", () => {
      // Need to try to connect and time out
      harness.client.connect();
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.mockClear();

      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);

      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });
  });
});

describe("The client._processConnect() function", () => {
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  // Events

  it("should emit client connect event", () => {
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");

    const clientListener = harness.createClientListener();
    harness.sessionWrapper.emit("connect");

    expect(clientListener.connecting.mock.calls.length).toBe(0);
    expect(clientListener.connect.mock.calls.length).toBe(1);
    expect(clientListener.connect.mock.calls[0].length).toBe(0);
    expect(clientListener.disconnect.mock.calls.length).toBe(0);
    expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
    expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
    expect(clientListener.transportError.mock.calls.length).toBe(0);
  });

  it("should emit feed opening event on any feeds desired open (and not on any feeds desired closed)", () => {
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    feed1.desireOpen();
    const feed2 = harness.client.feed("someFeed2", { arg: "val" }); // Desired closed
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.feedState.mockReturnValue("closed");

    const feedListener1 = harness.createFeedListener(feed1);
    const feedListener2 = harness.createFeedListener(feed2);
    harness.sessionWrapper.emit("connect");

    expect(feedListener1.opening.mock.calls.length).toBe(1);
    expect(feedListener1.opening.mock.calls[0].length).toBe(0);
    expect(feedListener1.open.mock.calls.length).toBe(0);
    expect(feedListener1.close.mock.calls.length).toBe(0);
    expect(feedListener1.action.mock.calls.length).toBe(0);
    expect(feedListener2.opening.mock.calls.length).toBe(0);
    expect(feedListener2.open.mock.calls.length).toBe(0);
    expect(feedListener2.close.mock.calls.length).toBe(0);
    expect(feedListener2.action.mock.calls.length).toBe(0);
  });

  // State

  it("should cancel any connection timeout, reset the connection retry counter, and update last session state", () => {
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");

    const newState = harness.getClientState();
    newState._connectTimeoutTimer = null;
    newState._connectRetryCount = 0;
    newState._lastSessionWrapperStateEmission = "connect";
    harness.sessionWrapper.emit("connect");

    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("should try to open any feeds desired open (and not any feeds desired closed)", () => {
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    feed1.desireOpen();
    harness.client.feed("someFeed2", { arg: "val" }); // Desired closed
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.emit("connect");

    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(1);
    expect(harness.sessionWrapper.feedOpen.mock.calls[0].length).toBe(2);
    expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].name()).toBe(
      "someFeed",
    );
    expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].args()).toEqual({
      arg: "val",
    });
    expect(
      check.function(harness.sessionWrapper.feedOpen.mock.calls[0][1]),
    ).toBe(true);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.state.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
    }
    expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.feedState.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
      const feedName = harness.sessionWrapper.feedState.mock.calls[i][0].name();
      expect(feedName === "someFeed" || feedName === "someFeed2").toBe(true);
      expect(harness.sessionWrapper.feedState.mock.calls[i][0].args()).toEqual({
        arg: "val",
      });
    }
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A
});

describe("The client._processDisconnect() function", () => {
  // Events

  it("should emit client disconnect event with no error", () => {
    const harness = harnessFactory();
    harness.sessionWrapper.connect.mockImplementation(() => {
      harness.sessionWrapper.state.mockReturnValue("connected");
    });
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");

    const clientListener = harness.createClientListener();
    harness.sessionWrapper.disconnect.mockImplementation(() => {
      harness.sessionWrapper.state.mockReturnValue("disconnected");
    });
    harness.client.disconnect();
    harness.sessionWrapper.emit("disconnect");

    expect(clientListener.connecting.mock.calls.length).toBe(0);
    expect(clientListener.connect.mock.calls.length).toBe(0);
    expect(clientListener.disconnect.mock.calls.length).toBe(1);
    expect(clientListener.disconnect.mock.calls[0].length).toBe(0);
    expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
    expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
    expect(clientListener.transportError.mock.calls.length).toBe(0);
  });

  it("should emit client disconnect event with error", () => {
    const harness = harnessFactory();
    harness.sessionWrapper.connect.mockImplementation(() => {
      harness.sessionWrapper.state.mockReturnValue("connected");
    });
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");

    const clientListener = harness.createClientListener();

    harness.sessionWrapper.disconnect.mockImplementation(() => {
      harness.sessionWrapper.state.mockReturnValue("disconnected");
    });
    harness.client.disconnect();
    harness.sessionWrapper.emit(
      "disconnect",
      new Error("HANDSHAKE_REJECTED: ..."),
    );

    expect(clientListener.connecting.mock.calls.length).toBe(0);
    expect(clientListener.connect.mock.calls.length).toBe(0);
    expect(clientListener.disconnect.mock.calls.length).toBe(1);
    expect(clientListener.disconnect.mock.calls[0].length).toBe(1);
    expect(clientListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(clientListener.disconnect.mock.calls[0][0].message).toBe(
      "HANDSHAKE_REJECTED: ...",
    );
    expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
    expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
    expect(clientListener.transportError.mock.calls.length).toBe(0);
  });

  // State

  it("if was connecting and disconnect() requested, update state appropriately", () => {
    const harness = harnessFactory();
    harness.sessionWrapper.connect.mockImplementation(() => {
      harness.sessionWrapper.state.mockReturnValue("connecting");
    });
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");

    harness.sessionWrapper.disconnect.mockImplementation(() => {
      harness.sessionWrapper.state.mockReturnValue("disconnected");
    });
    harness.client.disconnect(); // No error, requested

    const newState = harness.getClientState();
    // Cancel any connect timeout
    newState._connectTimeoutTimer = null;
    newState._connectRetryCount = 0;
    // Reset feed-reopen counts and timers - N/A (was connecting)
    // Set connect retry timer and update count - N/A (requested)
    // Update last session state
    newState._lastSessionWrapperStateEmission = "disconnect";
    harness.sessionWrapper.emit("disconnect");

    expect(harness.client).toHaveState(newState);
  });

  it("if was connecting and HANDSHAKE_REJECTED, update state appropriately", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    const newState = harness.getClientState();
    harness.sessionWrapper.emit(
      "disconnect",
      new Error("HANDSHAKE_REJECTED: ..."),
    );
    // Cancel any connect timeout
    newState._connectTimeoutTimer = null;
    // Reset feed-reopen counts and timers - N/A (was connecting)
    // Set connect retry timer and update count - N/A (not on handshake fail)
    // Update last session state
    newState._lastSessionWrapperStateEmission = "disconnect";
    harness.sessionWrapper.emit("disconnect");

    expect(harness.client).toHaveState(newState);
  });

  it("if was connecting and TIMEOUT/TRANSPORT_FAILURE, update state appropriately below retry limit", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    const newState = harness.getClientState();
    harness.sessionWrapper.emit("disconnect", new Error("TIMEOUT: ..."));
    newState._connectTimeoutTimer = null;
    newState._connectRetryTimer = 9999;
    newState._connectRetryCount = 1;
    // There are no feed-reopen counts and timers - was connecting
    newState._lastSessionWrapperStateEmission = "disconnect";
    harness.sessionWrapper.emit("disconnect");

    expect(harness.client).toHaveState(newState);
  });

  it("if was connecting and TIMEOUT/TRANSPORT_FAILURE, update state appropriately at retry limit", () => {
    const harness = harnessFactory({ connectRetryMaxAttempts: 1 });
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("disconnect", new Error("TIMEOUT: ..."));
    jest.advanceTimersByTime(config.defaults.connectRetryMs);
    harness.sessionWrapper.emit("connecting");
    const newState = harness.getClientState();
    harness.sessionWrapper.emit("disconnect", new Error("TIMEOUT: ..."));
    newState._connectTimeoutTimer = null;
    newState._connectRetryTimer = null;
    newState._connectRetryCount = 1;
    // There are no feed-reopen counts and timers - was connecting
    newState._lastSessionWrapperStateEmission = "disconnect";
    harness.sessionWrapper.emit("disconnect");

    expect(harness.client).toHaveState(newState);
  });

  it("if it was connected and disconnect() requested, update state appropriately", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    // Create a feed re-open situation
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    cb(undefined, { feed: "data" });
    // Now the feed is open -- emit bad feed action notification
    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("BAD_FEED_ACTION: ..."),
    );
    harness.sessionWrapper.emit(
      "unexpectedFeedClosed",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("BAD_FEED_ACTION: ..."),
    );

    // Disconnect and check the state
    const newState = harness.getClientState();
    harness.client.disconnect(); // Requested
    // Cancel any connect timeout - N/A (was connected)
    // Reset feed-reopen counts and timers
    newState._reopenCounts = {};
    newState._reopenTimers = [];
    // Set connect retry timer - no, desired
    // Leave connect retry count as-is (reset on call to .connect())
    // Update last session state
    const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
    newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";
    newState._lastSessionWrapperStateEmission = "disconnect";
    harness.sessionWrapper.emit("disconnect");

    expect(harness.client).toHaveState(newState);
  });

  it("if it was connected and there was an internal transport failure, update state appropriately", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    // Create a feed re-open situation
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    cb(undefined, { feed: "data" });
    // Now the feed is open -- emit bad feed action notification
    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("BAD_FEED_ACTION: ..."),
    );
    harness.sessionWrapper.emit(
      "unexpectedFeedClosed",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("BAD_FEED_ACTION: ..."),
    );
    // Disconnect and check the state
    harness.sessionWrapper.state.mockReturnValue("disconnected");
    const newState = harness.getClientState();
    // Reset feed-reopen counts and timers
    newState._reopenCounts = {};
    newState._reopenTimers = [];
    // No connect retry timer -- reconnecting immediately
    // Leave connect retry count as-is (reset on call to .connect())
    // Update last session state
    const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
    newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";
    newState._lastSessionWrapperStateEmission = "disconnect";
    harness.sessionWrapper.emit(
      "disconnect",
      new Error("TRANSPORT_FAILURE: ..."),
    );

    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("if was connecting and disconnect() requested, do nothing on the session", () => {
    const harness = harnessFactory();
    harness.sessionWrapper.connect.mockImplementation(() => {
      harness.sessionWrapper.state.mockReturnValue("connecting");
    });
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.disconnect.mockImplementation(() => {
      harness.sessionWrapper.state.mockReturnValue("disconnected");
    });
    harness.client.disconnect();
    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.emit("disconnect");
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  it("if was connecting and HANDSHAKE_REJECTED, do nothing on the session", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.emit(
      "disconnect",
      new Error("HANDSHAKE_REJECTED: ..."),
    );
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Connection retry session calls are tested in the callback section

  it("if was connected and disconnect() requested, do nothing on the session", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.emit("disconnect");
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  it("if was connected and TRANSPORT_FAILURE, call session.connect()", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.emit(
      "disconnect",
      new Error("TRANSPORT_FAILURE: ..."),
    );

    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(1);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(1);
    expect(harness.sessionWrapper.state.mock.calls[0].length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks

  describe("when the connection retry timer fires", () => {
    it("should throw unhandled error if client._connect() throws", () => {
      const harness = harnessFactory();
      harness.sessionWrapper.connect = jest.fn(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      harness.sessionWrapper.emit("disconnect", new Error("TIMEOUT: ..."));

      harness.sessionWrapper.connect = () => {
        throw new Error("TRANSPORT_ERROR: ...");
      };

      const clientListener = harness.createClientListener();

      let err;
      try {
        jest.advanceTimersByTime(config.defaults.connectRetryMs);
      } catch (e) {
        err = e;
      }

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("TRANSPORT_ERROR: ...");

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    it("should fire no events directly and then connecting after session emits", () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);
      harness.sessionWrapper.state.mockReturnValue("disconnected");
      harness.sessionWrapper.emit("disconnect", new Error("TIMEOUT: ..."));

      const clientListener = harness.createClientListener();

      jest.advanceTimersByTime(config.defaults.connectRetryMs);
      harness.sessionWrapper.emit("connecting");

      expect(clientListener.connecting.mock.calls.length).toBe(1);
      expect(clientListener.connecting.mock.calls[0].length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    it("should update state", () => {
      const harness = harnessFactory();
      harness.sessionWrapper.connect = jest.fn(() => {
        harness.sessionWrapper.state.mockReturnValue("connecting");
      });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);
      harness.sessionWrapper.emit("disconnect", new Error("TIMEOUT: ..."));

      const newState = harness.getClientState();
      newState._connectRetryTimer = null;
      jest.advanceTimersByTime(config.defaults.connectRetryMs);
      expect(harness.client).toHaveState(newState);
    });

    it("should call session.connect()", () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      jest.advanceTimersByTime(config.defaults.connectTimeoutMs);
      harness.sessionWrapper.emit("disconnect", new Error("TIMEOUT: ..."));

      harness.sessionWrapper.mockClear();

      jest.advanceTimersByTime(config.defaults.connectRetryMs); // Cause the connect retry to fire, but don't fire that timeout (Jest will otherwise run timers set by the timer firing)

      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.connect.mock.calls[0].length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });
  });
});

describe("The client._processFeedAction() function", () => {
  // Events

  it("should emit action on feeds desired open, and not emit on feeds desired closed", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed1.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const feedListener1 = harness.createFeedListener(feed1);

    const feed2 = harness.client.feed("someFeed", { arg: "val" }); // Desired closed
    const feedListener2 = harness.createFeedListener(feed2);
    harness.sessionWrapper.emit(
      "feedAction",
      FeedNameArgs("someFeed", { arg: "val" }),
      "someAction",
      { action: "data" },
      { new: "feedData" },
      { old: "feedData" },
    );

    expect(feedListener1.opening.mock.calls.length).toBe(0);
    expect(feedListener1.open.mock.calls.length).toBe(0);
    expect(feedListener1.close.mock.calls.length).toBe(0);
    expect(feedListener1.action.mock.calls.length).toBe(1);
    expect(feedListener1.action.mock.calls.length).toBe(1);
    expect(feedListener1.action.mock.calls[0].length).toBe(4);
    expect(feedListener1.action.mock.calls[0][0]).toBe("someAction");
    expect(feedListener1.action.mock.calls[0][1]).toEqual({ action: "data" });
    expect(feedListener1.action.mock.calls[0][2]).toEqual({ new: "feedData" });
    expect(feedListener1.action.mock.calls[0][3]).toEqual({ old: "feedData" });
    expect(feedListener2.opening.mock.calls.length).toBe(0);
    expect(feedListener2.open.mock.calls.length).toBe(0);
    expect(feedListener2.close.mock.calls.length).toBe(0);
    expect(feedListener2.action.mock.calls.length).toBe(0);
  });

  // State

  it("should not change the state", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");
    const newState = harness.getClientState();
    harness.sessionWrapper.emit(
      "feedAction",
      FeedNameArgs("someFeed", { arg: "val" }),
      "someAction",
      { action: "data" },
      { new: "feedData" },
      { old: "feedData" },
    );
    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("should call nothing on the session", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.emit(
      "feedAction",
      FeedNameArgs("someFeed", { arg: "val" }),
      "someAction",
      { action: "data" },
      { new: "feedData" },
      { old: "feedData" },
    );
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A
});

describe("The client._processUnexpectedFeedClosing() function", () => {
  // Events

  it("should emit a close event on feeds desired open and nothing on feeds desired closed", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed1.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const feedListener1 = harness.createFeedListener(feed1);

    const feed2 = harness.client.feed("someFeed", { arg: "val" }); // Desired closed
    const feedListener2 = harness.createFeedListener(feed2);
    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("NOT_CONNECTED: ..."),
    );

    expect(feedListener1.opening.mock.calls.length).toBe(0);
    expect(feedListener1.open.mock.calls.length).toBe(0);
    expect(feedListener1.close.mock.calls.length).toBe(1);
    expect(feedListener1.action.mock.calls.length).toBe(0);
    expect(feedListener2.opening.mock.calls.length).toBe(0);
    expect(feedListener2.open.mock.calls.length).toBe(0);
    expect(feedListener2.close.mock.calls.length).toBe(0);
    expect(feedListener2.action.mock.calls.length).toBe(0);
  });

  // State

  it("should update feed._lastStateEmission", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const newState = harness.getClientState();
    const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
    newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";
    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("NOT_CONNECTED: ..."),
    );

    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("should do nothing on the session", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("NOT_CONNECTED: ..."),
    );
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A
});

describe("The client._processUnexpectedFeedClosed() function", () => {
  // Events

  it("if a feed is desired closed, it should emit nothing", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    const feed = harness.client.feed("someFeed", { arg: "val" }); // Desired closed

    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("NOT_CONNECTED: ..."),
    );
    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.emit(
      "unexpectedFeedClosed",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("NOT_CONNECTED: ..."),
    );

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("if a feed is desired open and actual state is closed, it should emit nothing (closed on unexpectedFeedClosing)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    const feed = harness.client.feed("someFeed", { arg: "val" });
    feed.desireOpen();

    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("NOT_CONNECTED: ..."),
    );

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.emit(
      "unexpectedFeedClosed",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("NOT_CONNECTED: ..."),
    );

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("if a feed is desired open and actual state is opening and there was an error, it should emit close", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Desire the feed open and get callback passed to session
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    const feedListener = harness.createFeedListener(feed);
    const err = new Error("REJECTED: ...");
    cb(err);

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(1);
    expect(feedListener.close.mock.calls[0].length).toBe(1);
    expect(feedListener.close.mock.calls[0][0]).toBe(err);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  // State

  describe("if this was a bad feed action notification", () => {
    it("if there is no limit on reopen attempts (max=-1), it should not track reopen attempts", () => {
      const harness = harnessFactory({ reopenMaxAttempts: -1 });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      // Mock an open feed
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      harness.sessionWrapper.feedState.mockReturnValue("open");
      cb(undefined, { feed: "data" });

      harness.sessionWrapper.emit(
        "unexpectedFeedClosing",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );

      const newState = harness.getClientState();
      // _appFeedStates[ser]._lastStateEmission doesnt change - that happened on unexpectedFeedClosing
      harness.sessionWrapper.emit(
        "unexpectedFeedClosed",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );
      expect(harness.client).toHaveState(newState);
    });

    it("if reopen attempts are disabled (max=0), it should not change the state", () => {
      const harness = harnessFactory({ reopenMaxAttempts: 0 });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      // Mock an open feed
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      harness.sessionWrapper.feedState.mockReturnValue("open");
      cb(undefined, { feed: "data" });

      harness.sessionWrapper.emit(
        "unexpectedFeedClosing",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );

      const newState = harness.getClientState();
      // _appFeedStates[ser]._lastStateEmission doesnt change - that happened on unexpectedFeedClosing
      harness.sessionWrapper.emit(
        "unexpectedFeedClosed",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );
      expect(harness.client).toHaveState(newState);
    });

    it("if reopen attempt limit is enabled (max>1) and we're not at the threshold, it should increment ._reopenCounts[ser] and add to ._reopenTimer array", () => {
      const harness = harnessFactory({ reopenMaxAttempts: 10 });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      // Mock an open feed
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      harness.sessionWrapper.feedState.mockReturnValue("open");
      cb(undefined, { feed: "data" });

      harness.sessionWrapper.emit(
        "unexpectedFeedClosing",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );

      const newState = harness.getClientState();
      // _appFeedStates[ser]._lastStateEmission doesnt change - that happened on unexpectedFeedClosing
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      newState._reopenCounts[feedSerial] = 1;
      newState._reopenTimers.push(9999);
      harness.sessionWrapper.emit(
        "unexpectedFeedClosed",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );

      expect(harness.client).toHaveState(newState);
    });

    it("if reopen attempt limit is enabled (max>0) and we're at the threshold, it should not change the state", () => {
      const harness = harnessFactory({ reopenMaxAttempts: 1 });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      // Mock one open feed
      const feed1 = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.mockClear();
      feed1.desireOpen();
      let cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      harness.sessionWrapper.feedState.mockReturnValue("open");
      cb(undefined, { feed: "data" });

      harness.sessionWrapper.emit(
        "unexpectedFeedClosing",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );
      harness.sessionWrapper.emit(
        "unexpectedFeedClosed",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );
      harness.sessionWrapper.feedState.mockReturnValue("closed");

      // Now client._reopenCounts[ser] = 1
      // Desire app feed closed and open to trigger another feed opening (this is not the re-open)
      feed1.desireClosed();
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.mockClear();
      feed1.desireOpen();
      cb = harness.sessionWrapper.feedOpen.mock.calls[0][1]; // eslint-disable-line
      harness.sessionWrapper.feedState.mockReturnValue("open");
      cb(undefined, { feed: "data" });

      harness.sessionWrapper.emit(
        "unexpectedFeedClosing",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );
      harness.sessionWrapper.emit(
        "unexpectedFeedClosed",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );

      const newState = harness.getClientState();
      // _appFeedStates[ser]._lastStateEmission doesnt change - that happened on unexpectedFeedClosing
      expect(harness.client).toHaveState(newState);
    });
  });

  it("if this was not a bad feed action notification, it should not adjust reopen attempts", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock one open feed
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed1.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });
    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("TERMINATED: ..."),
    );

    const newState = harness.getClientState();
    // _appFeedStates[ser]._lastStateEmission doesnt change - that happened on unexpectedFeedClosing
    harness.sessionWrapper.emit(
      "unexpectedFeedClosed",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("TERMINATED: ..."),
    );
    expect(harness.client).toHaveState(newState);
  });

  // Session

  describe("if this was a bad feed action notification", () => {
    it("if the feed is being reopened, it should call session.openFeed()", () => {
      const harness = harnessFactory({ reopenMaxAttempts: 10 });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      // Mock an open feed
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      harness.sessionWrapper.feedState.mockReturnValue("open");
      cb(undefined, { feed: "data" });

      harness.sessionWrapper.emit(
        "unexpectedFeedClosing",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );

      harness.sessionWrapper.mockClear();
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.emit(
        "unexpectedFeedClosed",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );

      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(1);
      expect(harness.sessionWrapper.feedOpen.mock.calls[0].length).toBe(2);
      expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].name()).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].args()).toEqual({
        arg: "val",
      });
      expect(
        check.function(harness.sessionWrapper.feedOpen.mock.calls[0][1]),
      ).toBe(true);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedState.mock.calls[i][0].args(),
        ).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("if the feed is not being reopened, it should call nothing on the session", () => {
      const harness = harnessFactory({ reopenMaxAttempts: 0 });
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      // Mock an open feed
      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.mockClear();
      feed.desireOpen();
      const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
      harness.sessionWrapper.feedState.mockReturnValue("open");
      cb(undefined, { feed: "data" });

      harness.sessionWrapper.emit(
        "unexpectedFeedClosing",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );

      harness.sessionWrapper.mockClear();
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      harness.sessionWrapper.emit(
        "unexpectedFeedClosed",
        FeedNameArgs("someFeed", { arg: "val" }),
        new Error("BAD_FEED_ACTION: ..."),
      );
      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(2);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0]).toBe(
          "someFeed",
        );
        expect(harness.sessionWrapper.feedState.mock.calls[i][1]).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });
  });

  it("if this was not a bad feed action notification, it should call nothing on the session", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock one open feed
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed1.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });
    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("TERMINATED: ..."),
    );

    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.emit(
      "unexpectedFeedClosed",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("TERMINATED: ..."),
    );
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks

  describe("the reopen count decrement timeout", () => {
    describe("should emit appropriate events", () => {
      it("if already below threshold, should emit nothing on desired open and nothing on feeds desired closed", () => {
        // Start a reopen decrement timer

        // No feed timeouts to avoid that firing in addition to reopen decrement timer
        const harness = harnessFactory({
          reopenMaxAttempts: 1,
          feedTimeoutMs: 0,
        });
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed1 = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed1.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb(undefined, { feed: "data" });

        harness.sessionWrapper.emit(
          "unexpectedFeedClosing",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.emit(
          "unexpectedFeedClosed",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("opening"); // A re-open is attempted internally

        const feedListener1 = harness.createFeedListener(feed1);
        const feed2 = harness.client.feed("someFeed", { arg: "val" }); // Desire closed
        const feedListener2 = harness.createFeedListener(feed2);

        jest.advanceTimersByTime(config.defaults.reopenTrailingMs); // Run the reopen decrement timeout

        expect(feedListener1.opening.mock.calls.length).toBe(0);
        expect(feedListener1.open.mock.calls.length).toBe(0);
        expect(feedListener1.close.mock.calls.length).toBe(0);
        expect(feedListener1.action.mock.calls.length).toBe(0);
        expect(feedListener2.opening.mock.calls.length).toBe(0);
        expect(feedListener2.open.mock.calls.length).toBe(0);
        expect(feedListener2.close.mock.calls.length).toBe(0);
        expect(feedListener2.action.mock.calls.length).toBe(0);
      });

      it("if moving below threshold, should emit opening on feeds desired open and nothing on feeds desired closed", () => {
        // Start a reopen decrement timer

        // No feed timeouts to avoid that firing in addition to reopen decrement timer
        const harness = harnessFactory({
          reopenMaxAttempts: 1,
          feedTimeoutMs: 0,
        });
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed1 = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed1.desireOpen();
        let cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb(undefined, { feed: "data" });

        harness.sessionWrapper.emit(
          "unexpectedFeedClosing",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        harness.sessionWrapper.emit(
          "unexpectedFeedClosed",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        ); // Will cause a reopen attempt

        cb = harness.sessionWrapper.feedOpen.mock.calls[0][1]; // eslint-disable-line
        cb(undefined, { feed: "data" }); // Feed opens successfully

        // Now there's another bad feed action notification  at the threshold
        harness.sessionWrapper.emit(
          "unexpectedFeedClosing",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.emit(
          "unexpectedFeedClosed",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed"); // No reopen attempt

        // After the existing reopen decrement timer fires, you get feed opening events
        const feedListener1 = harness.createFeedListener(feed1);
        const feed2 = harness.client.feed("someFeed", { arg: "val" }); // Desire closed
        const feedListener2 = harness.createFeedListener(feed2);

        jest.advanceTimersByTime(config.defaults.reopenTrailingMs); // Run the reopen decrement timeout

        expect(feedListener1.opening.mock.calls.length).toBe(1);
        expect(feedListener1.open.mock.calls.length).toBe(0);
        expect(feedListener1.close.mock.calls.length).toBe(0);
        expect(feedListener1.action.mock.calls.length).toBe(0);
        expect(feedListener2.opening.mock.calls.length).toBe(0);
        expect(feedListener2.open.mock.calls.length).toBe(0);
        expect(feedListener2.close.mock.calls.length).toBe(0);
        expect(feedListener2.action.mock.calls.length).toBe(0);
      });
    });

    describe("should update state appropriately", () => {
      it("should decrement the reopen counter and remove client._reopenTimers element if setting counter to >1", () => {
        // Start a reopen decrement timer

        // No feed timeouts to avoid that firing in addition to reopen decrement timer
        const harness = harnessFactory({
          reopenMaxAttempts: 2,
          feedTimeoutMs: 0,
        });
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        let cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb(undefined, { feed: "data" });

        // Have the feed close unexpectedly due to BAD_FEED_ACTION
        harness.sessionWrapper.emit(
          "unexpectedFeedClosing",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        harness.sessionWrapper.emit(
          "unexpectedFeedClosed",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );

        // Have the feed reopen successfully
        cb = harness.sessionWrapper.feedOpen.mock.calls[0][1]; // eslint-disable-line
        cb(undefined, { feed: "data" }); // Feed opens successfully

        jest.advanceTimersByTime(config.defaults.reopenTrailingMs / 2);

        // Have the feed close unexpectedly due to BAD_FEED_ACTION
        // Now at the threshold - increments reopenCount to 2
        harness.sessionWrapper.emit(
          "unexpectedFeedClosing",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.emit(
          "unexpectedFeedClosed",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed"); // No reopen attempt

        // After the existing reopen decrement timer fires, you get feed opening events
        const newState = harness.getClientState();

        const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
        newState._reopenCounts[feedSerial] = 1;
        newState._reopenTimers.shift();
        // ._appFeedStates[ser][i] already set to closed on bad feed action notification above
        jest.advanceTimersByTime(config.defaults.reopenTrailingMs / 2); // Trigger only the first reopen decrement timer

        expect(harness.client).toHaveState(newState);
      });

      it("should delete the reopen counter and remove client._reopenTimers element  if setting to 0", () => {
        // Start a reopen decrement timer

        // No feed timeouts to avoid that firing in addition to reopen decrement timer
        const harness = harnessFactory({
          reopenMaxAttempts: 2,
          feedTimeoutMs: 0,
        });
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb(undefined, { feed: "data" });

        harness.sessionWrapper.emit(
          "unexpectedFeedClosing",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.emit(
          "unexpectedFeedClosed",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        ); // Triggers a reopen attempt
        harness.sessionWrapper.feedState.mockReturnValue("opening");

        // After the reopen decrement timer fires, check state
        const newState = harness.getClientState();
        const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
        delete newState._reopenCounts[feedSerial];
        newState._reopenTimers = [];
        // ._appFeedStates[ser][i]._lastStateEmission is not changed (still opening)
        jest.advanceTimersByTime(config.defaults.reopenTrailingMs);
        expect(harness.client).toHaveState(newState);
      });
    });

    describe("should call appropriate session methods", () => {
      it("if already below threshold, it should call nothing on the session", () => {
        // Start a reopen decrement timer

        // No feed timeouts to avoid that firing in addition to reopen decrement timer
        const harness = harnessFactory({
          reopenMaxAttempts: 1,
          feedTimeoutMs: 0,
        });
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb(undefined, { feed: "data" });

        harness.sessionWrapper.emit(
          "unexpectedFeedClosing",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.emit(
          "unexpectedFeedClosed",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("opening"); // A re-open is attempted internally

        harness.sessionWrapper.mockClear();
        jest.advanceTimersByTime(config.defaults.reopenTrailingMs);
        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.state.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
        }
        expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
          true,
        ); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.feedState.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
          expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
            "someFeed",
          );
          expect(
            harness.sessionWrapper.feedState.mock.calls[i][0].args(),
          ).toEqual({
            arg: "val",
          });
        }
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });

      it("if moving below threshold, it should call session.feedOpen()", () => {
        // Start a reopen decrement timer

        // No feed timeouts to avoid that firing in addition to reopen decrement timer
        const harness = harnessFactory({
          reopenMaxAttempts: 1,
          feedTimeoutMs: 0,
        });
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed1 = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed1.desireOpen();
        let cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb(undefined, { feed: "data" });

        harness.sessionWrapper.emit(
          "unexpectedFeedClosing",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        harness.sessionWrapper.emit(
          "unexpectedFeedClosed",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        ); // Will cause a reopen attempt

        cb = harness.sessionWrapper.feedOpen.mock.calls[0][1]; // eslint-disable-line
        cb(undefined, { feed: "data" }); // Feed opens successfully

        // Now there's another bad feed action notification at the threshold
        harness.sessionWrapper.emit(
          "unexpectedFeedClosing",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.emit(
          "unexpectedFeedClosed",
          FeedNameArgs("someFeed", { arg: "val" }),
          new Error("BAD_FEED_ACTION: ..."),
        );
        harness.sessionWrapper.feedState.mockReturnValue("closed"); // No reopen attempt

        // After the existing reopen decrement timer fires, you get feed opening events
        harness.sessionWrapper.mockClear();

        jest.advanceTimersByTime(config.defaults.reopenTrailingMs);

        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(1);
        expect(harness.sessionWrapper.feedOpen.mock.calls[0].length).toBe(2);
        expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].name()).toBe(
          "someFeed",
        );
        expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].args()).toEqual(
          {
            arg: "val",
          },
        );
        expect(
          check.function(harness.sessionWrapper.feedOpen.mock.calls[0][1]),
        ).toBe(true);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.state.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
        }
        expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
          true,
        ); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.feedState.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
          expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
            "someFeed",
          );
          expect(
            harness.sessionWrapper.feedState.mock.calls[i][0].args(),
          ).toEqual({
            arg: "val",
          });
        }
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });
    });
  });
});

describe("The client._processBadServerMessage() function", () => {
  // Events

  it("should emit client badServerMessage event with the error", () => {
    const harness = harnessFactory();
    harness.client.connect();
    const clientListener = harness.createClientListener();
    const err = new Error("INVALID_MESSAGE: ...");
    err.serverMessage = "junk";
    err.parseError = new Error("INVALID_JSON: ...");
    harness.sessionWrapper.emit("badServerMessage", err);

    expect(clientListener.connecting.mock.calls.length).toBe(0);
    expect(clientListener.connect.mock.calls.length).toBe(0);
    expect(clientListener.disconnect.mock.calls.length).toBe(0);
    expect(clientListener.badServerMessage.mock.calls.length).toBe(1);
    expect(clientListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(clientListener.badServerMessage.mock.calls[0][0]).toBe(err);
    expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
    expect(clientListener.transportError.mock.calls.length).toBe(0);
  });

  // State

  it("should not change the state", () => {
    const harness = harnessFactory();
    harness.client.connect();
    const newState = harness.getClientState();
    const err = new Error("INVALID_MESSAGE: ...");
    err.serverMessage = "junk";
    err.parseError = new Error("INVALID_JSON: ...");
    harness.sessionWrapper.emit("badServerMessage", err);
    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("should do nothing on the session", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.mockClear();
    const err = new Error("INVALID_MESSAGE: ...");
    err.serverMessage = "junk";
    err.parseError = new Error("INVALID_JSON: ...");
    harness.sessionWrapper.emit("badServerMessage", err);
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A
});

describe("The client._processBadClientMessage() function", () => {
  // Events

  it("should emit client badClientMessage event with diagnostics", () => {
    const harness = harnessFactory();
    harness.client.connect();
    const clientListener = harness.createClientListener();
    harness.sessionWrapper.emit("badClientMessage", { diag: "data" });

    expect(clientListener.connecting.mock.calls.length).toBe(0);
    expect(clientListener.connect.mock.calls.length).toBe(0);
    expect(clientListener.disconnect.mock.calls.length).toBe(0);
    expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
    expect(clientListener.badClientMessage.mock.calls.length).toBe(1);
    expect(clientListener.badClientMessage.mock.calls[0].length).toBe(1);
    expect(clientListener.badClientMessage.mock.calls[0][0]).toEqual({
      diag: "data",
    });
    expect(clientListener.transportError.mock.calls.length).toBe(0);
  });

  // State

  it("should not change the state", () => {
    const harness = harnessFactory();
    harness.client.connect();
    const newState = harness.getClientState();
    harness.sessionWrapper.emit("badClientMessage", { diag: "data" });
    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("should do nothing on the session", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.mockClear();
    harness.sessionWrapper.emit("badClientMessage", { diag: "data" });
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A
});

describe("The client._processTransportError() function", () => {
  // Events

  it("should emit client transportError event", () => {
    const harness = harnessFactory();
    harness.client.connect();
    const clientListener = harness.createClientListener();
    const err = new Error("TRANSPORT_ERROR: ...");
    harness.sessionWrapper.emit("transportError", err);

    expect(clientListener.connecting.mock.calls.length).toBe(0);
    expect(clientListener.connect.mock.calls.length).toBe(0);
    expect(clientListener.disconnect.mock.calls.length).toBe(0);
    expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
    expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
    expect(clientListener.transportError.mock.calls.length).toBe(1);
    expect(clientListener.transportError.mock.calls[0].length).toBe(1);
    expect(clientListener.transportError.mock.calls[0][0]).toBe(err);
  });

  // State

  it("should not change the state", () => {
    const harness = harnessFactory();
    harness.client.connect();
    const newState = harness.getClientState();

    harness.sessionWrapper.emit(
      "transportError",
      new Error("TRANSPORT_ERROR: ..."),
    );

    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("should do nothing on the session", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.mockClear();

    harness.sessionWrapper.emit(
      "transportError",
      new Error("TRANSPORT_ERROR: ..."),
    );

    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedState.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A
});

// Testing: internal helper functions - largely tested in the above (don't worry about checking feeds desired closed )

describe("The client._considerFeedState() function", () => {
  // Events

  it(`if not connected, should emit nothing on feeds`, () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    feed.desireOpen();

    const feedListener = harness.createFeedListener(feed);
    harness.client._considerFeedState("someFeed", { arg: "val" });

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it(`if connected, opening the feed, it times out, and then returns
  late success: feeds should emit opening, close(TIMEOUT), opening, open`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Should emit opening (grab callback passed to session)
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    const feedListener1 = harness.createFeedListener(feed);
    harness.sessionWrapper.mockClear();
    feed.desireOpen(); // Triggers _considerFeedState

    expect(feedListener1.opening.mock.calls.length).toBe(1);
    expect(feedListener1.open.mock.calls.length).toBe(0);
    expect(feedListener1.close.mock.calls.length).toBe(0);
    expect(feedListener1.action.mock.calls.length).toBe(0);
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    // Should emit close(TIMEOUT) on timeout
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    const feedListener2 = harness.createFeedListener(feed);
    jest.advanceTimersByTime(config.defaults.feedTimeoutMs); // Time out

    expect(feedListener2.opening.mock.calls.length).toBe(0);
    expect(feedListener2.open.mock.calls.length).toBe(0);
    expect(feedListener2.close.mock.calls.length).toBe(1);
    expect(feedListener2.close.mock.calls[0].length).toBe(1);
    expect(feedListener2.close.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(feedListener2.close.mock.calls[0][0].message).toBe(
      "TIMEOUT: The server did not respond to feed open request within the allocated time.",
    );
    expect(feedListener2.action.mock.calls.length).toBe(0);

    // Should emit opening, open on late success
    const feedListener3 = harness.createFeedListener(feed);
    cb(undefined, { feed: "data" });

    expect(feedListener3.opening.mock.calls.length).toBe(1);
    expect(feedListener3.open.mock.calls.length).toBe(1);
    expect(feedListener3.open.mock.calls[0].length).toBe(1);
    expect(feedListener3.open.mock.calls[0][0]).toEqual({ feed: "data" });
    expect(feedListener3.close.mock.calls.length).toBe(0);
    expect(feedListener3.action.mock.calls.length).toBe(0);
  });

  it(`if connected, opening the feed, it times out, and then returns
  late TRANSPORT_FAILURE: feeds should emit opening, close(TIMEOUT), close(ERR)`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Should emit opening (grab callback passed to session)
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    const feedListener1 = harness.createFeedListener(feed);
    harness.sessionWrapper.mockClear();
    feed.desireOpen(); // Triggers _considerFeedState

    expect(feedListener1.opening.mock.calls.length).toBe(1);
    expect(feedListener1.open.mock.calls.length).toBe(0);
    expect(feedListener1.close.mock.calls.length).toBe(0);
    expect(feedListener1.action.mock.calls.length).toBe(0);
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    // Should emit close(TIMEOUT) on timeout
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    const feedListener2 = harness.createFeedListener(feed);
    jest.advanceTimersByTime(config.defaults.feedTimeoutMs); // Time out

    expect(feedListener2.opening.mock.calls.length).toBe(0);
    expect(feedListener2.open.mock.calls.length).toBe(0);
    expect(feedListener2.close.mock.calls.length).toBe(1);
    expect(feedListener2.close.mock.calls[0].length).toBe(1);
    expect(feedListener2.close.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(feedListener2.close.mock.calls[0][0].message).toBe(
      "TIMEOUT: The server did not respond to feed open request within the allocated time.",
    );
    expect(feedListener2.action.mock.calls.length).toBe(0);

    // Should emit close(ERR) on late failure
    const feedListener3 = harness.createFeedListener(feed);
    cb(new Error("REJECTED: ..."));

    expect(feedListener3.opening.mock.calls.length).toBe(0);
    expect(feedListener3.open.mock.calls.length).toBe(0);
    expect(feedListener3.close.mock.calls.length).toBe(1);
    expect(feedListener3.close.mock.calls[0].length).toBe(1);
    expect(feedListener3.close.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(feedListener3.close.mock.calls[0][0].message).toBe("REJECTED: ...");
    expect(feedListener3.action.mock.calls.length).toBe(0);
  });

  it(`if connected, opening the feed, it does not time out and returns
  success: feeds should emit opening, open`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Should emit opening (grab callback passed to session)
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    const feedListener1 = harness.createFeedListener(feed);
    harness.sessionWrapper.mockClear();
    feed.desireOpen(); // Triggers _considerFeedState

    expect(feedListener1.opening.mock.calls.length).toBe(1);
    expect(feedListener1.open.mock.calls.length).toBe(0);
    expect(feedListener1.close.mock.calls.length).toBe(0);
    expect(feedListener1.action.mock.calls.length).toBe(0);
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    // Should emit open
    harness.sessionWrapper.feedState.mockReturnValue("open");
    const feedListener2 = harness.createFeedListener(feed);
    cb(undefined, { feed: "data" });

    expect(feedListener2.opening.mock.calls.length).toBe(0);
    expect(feedListener2.open.mock.calls.length).toBe(1);
    expect(feedListener2.open.mock.calls[0].length).toBe(1);
    expect(feedListener2.open.mock.calls[0][0]).toEqual({ feed: "data" });
    expect(feedListener2.close.mock.calls.length).toBe(0);
    expect(feedListener2.action.mock.calls.length).toBe(0);
  });

  it(`if connected, opening the feed, it does not time out and returns
  TRANSPORT_FAILURE: feeds should emit opening, close(ERR)`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Should emit opening (grab callback passed to session)
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    const feedListener1 = harness.createFeedListener(feed);
    harness.sessionWrapper.mockClear();
    feed.desireOpen(); // Triggers _considerFeedState

    expect(feedListener1.opening.mock.calls.length).toBe(1);
    expect(feedListener1.open.mock.calls.length).toBe(0);
    expect(feedListener1.close.mock.calls.length).toBe(0);
    expect(feedListener1.action.mock.calls.length).toBe(0);
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    // Should emit close(ERR)
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    const feedListener2 = harness.createFeedListener(feed);
    cb(new Error("REJECTED: ..."));

    expect(feedListener2.opening.mock.calls.length).toBe(0);
    expect(feedListener2.open.mock.calls.length).toBe(0);
    expect(feedListener2.close.mock.calls.length).toBe(1);
    expect(feedListener2.close.mock.calls[0].length).toBe(1);
    expect(feedListener2.close.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(feedListener2.close.mock.calls[0][0].message).toBe("REJECTED: ...");
    expect(feedListener2.action.mock.calls.length).toBe(0);
  });

  it(`if connected and closing the feed: feeds should emit
  close on feed.desireClosed() and nothing in _considerFeedState()`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const feedListener = harness.createFeedListener(feed);
    feed.desireClosed();

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(1);
    expect(feedListener.close.mock.calls[0].length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  // State

  it(`if not connected, should not change state`, () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    feed.desireOpen();
    const newState = harness.getClientState();
    harness.client._considerFeedState("someFeed", { arg: "val" });
    expect(harness.client).toHaveState(newState);
  });

  it(`if connected, opening the feed, it times out, and then returns
  late success: ._appFeedStates[ser][i]._lastStateEmission = open`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen(); // Triggers _considerFeedState
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    jest.advanceTimersByTime(config.defaults.feedTimeoutMs); // Time out

    const newState = harness.getClientState();
    const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
    newState._appFeedStates[feedSerial][0]._lastStateEmission = "open";
    cb(undefined, { feed: "data" });
    expect(harness.client).toHaveState(newState);
  });

  it(`if connected, opening the feed, it times out, and then returns
  late TRANSPORT_FAILURE: don't change state (closed on timeout)`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    jest.advanceTimersByTime(config.defaults.feedTimeoutMs); // Time out

    const newState = harness.getClientState();
    // Remains closed (timed out)
    cb(new Error("REJECTED: ..."));
    expect(harness.client).toHaveState(newState);
  });

  it(`if connected, opening the feed, it does not time out and returns
  success: ._appFeedStates[ser][i]._lastStateEmission = open`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    harness.sessionWrapper.feedState.mockReturnValue("open");
    const newState = harness.getClientState();
    const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
    newState._appFeedStates[feedSerial][0]._lastStateEmission = "open";
    cb(undefined, { feed: "data" });
    expect(harness.client).toHaveState(newState);
  });

  it(`if connected, opening the feed, it does not time out and returns
  TRANSPORT_FAILURE: ._appFeedStates[ser][i]._lastStateEmission/_desiredState = close/d`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    harness.sessionWrapper.feedState.mockReturnValue("closed");
    const newState = harness.getClientState();
    const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
    newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";
    cb(new Error("REJECTED: ..."));
    expect(harness.client).toHaveState(newState);
  });

  it(`if connected and closing the feed: it should update state appropriately`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const newState = harness.getClientState();
    const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
    newState._appFeedStates[feedSerial][0]._desiredState = "closed";
    newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";
    newState._feedCloseRequested[feedSerial] = true;

    feed.desireClosed();

    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("if not connected, should do nothing on the session", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    feed.desireOpen();

    harness.sessionWrapper.mockClear();
    harness.client._considerFeedState("someFeed", { arg: "val" });
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.state.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
    }
    expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.feedState.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
      expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedState.mock.calls[i][0].args()).toEqual({
        arg: "val",
      });
    }
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  it("if connected and opening the feed, it should call session.feedOpen()", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");

    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(1);
    expect(harness.sessionWrapper.feedOpen.mock.calls[0].length).toBe(2);
    expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].name()).toBe(
      "someFeed",
    );
    expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].args()).toEqual({
      arg: "val",
    });
    expect(
      check.function(harness.sessionWrapper.feedOpen.mock.calls[0][1]),
    ).toBe(true);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.state.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
    }
    expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.feedState.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
      expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedState.mock.calls[i][0].args()).toEqual({
        arg: "val",
      });
    }
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  it("if connected and closing the feed, it should call session.feedClose()", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    harness.sessionWrapper.mockClear();
    feed.desireClosed();
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(1);
    expect(harness.sessionWrapper.feedClose.mock.calls[0].length).toBe(2);
    expect(harness.sessionWrapper.feedClose.mock.calls[0][0].name()).toBe(
      "someFeed",
    );
    expect(harness.sessionWrapper.feedClose.mock.calls[0][0].args()).toEqual({
      arg: "val",
    });
    expect(
      check.function(harness.sessionWrapper.feedClose.mock.calls[0][1]),
    ).toBe(true);
    expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.state.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
    }
    expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.feedState.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
      expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedState.mock.calls[i][0].args()).toEqual({
        arg: "val",
      });
    }
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  it("if connected and not opening or closing the feed, it should call nothing on session (except feedData - if server feed open on desire open)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed1.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const feed2 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.mockClear();
    feed2.desireOpen();
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(1);
    expect(harness.sessionWrapper.feedData.mock.calls[0].length).toBe(1);
    expect(harness.sessionWrapper.feedData.mock.calls[0][0].name()).toBe(
      "someFeed",
    );
    expect(harness.sessionWrapper.feedData.mock.calls[0][0].args()).toEqual({
      arg: "val",
    });
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.state.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
    }
    expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.feedState.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
      expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedState.mock.calls[i][0].args()).toEqual({
        arg: "val",
      });
    }
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks - N/A

  // Inbound callbacks

  describe("the feed open timeout callback, when fired", () => {
    it("should emit feed close event", () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      feed.desireOpen();

      const feedListener = harness.createFeedListener(feed);

      jest.advanceTimersByTime(config.defaults.feedTimeoutMs);

      expect(feedListener.opening.mock.calls.length).toBe(0);
      expect(feedListener.open.mock.calls.length).toBe(0);
      expect(feedListener.close.mock.calls.length).toBe(1);
      expect(feedListener.close.mock.calls[0].length).toBe(1);
      expect(feedListener.close.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(feedListener.close.mock.calls[0][0].message).toBe(
        "TIMEOUT: The server did not respond to feed open request within the allocated time.",
      );
      expect(feedListener.action.mock.calls.length).toBe(0);
    });

    it("should update ._appFeedStates[ser][i]._lastStateEmission = close", () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      feed.desireOpen();

      const newState = harness.getClientState();
      const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
      newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";

      jest.advanceTimersByTime(config.defaults.feedTimeoutMs);

      expect(harness.client).toHaveState(newState);
    });

    it("should do nothing on the session - wait", () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      const feed = harness.client.feed("someFeed", { arg: "val" });
      harness.sessionWrapper.feedState.mockReturnValue("closed");
      feed.desireOpen();

      harness.sessionWrapper.mockClear();

      jest.advanceTimersByTime(config.defaults.feedTimeoutMs);

      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(2);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0]).toBe(
          "someFeed",
        );
        expect(harness.sessionWrapper.feedState.mock.calls[i][1]).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });
  });

  describe("the feed open response callback, when fired", () => {
    describe("if a feed object is desired open", () => {
      it("if returning success, it should emit feed open event", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        // Get the callback
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

        const feedListener = harness.createFeedListener(feed);
        harness.sessionWrapper.feedState.mockReturnValue("open");
        harness.sessionWrapper.feedData.mockReturnValue({ feed: "data" });
        cb(undefined, { feed: "data" }); // Success

        expect(feedListener.opening.mock.calls.length).toBe(0);
        expect(feedListener.open.mock.calls.length).toBe(1);
        expect(feedListener.open.mock.calls[0].length).toBe(1);
        expect(feedListener.open.mock.calls[0][0]).toEqual({ feed: "data" });
        expect(feedListener.close.mock.calls.length).toBe(0);
        expect(feedListener.action.mock.calls.length).toBe(0);
      });

      it("if returning failure, it should emit a feed close event", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        // Get the callback
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

        const feedListener = harness.createFeedListener(feed);
        harness.sessionWrapper.feedState.mockReturnValue("open");
        harness.sessionWrapper.feedData.mockReturnValue({ feed: "data" });
        cb(new Error("REJECTED: ..."));

        expect(feedListener.opening.mock.calls.length).toBe(0);
        expect(feedListener.open.mock.calls.length).toBe(0);
        expect(feedListener.close.mock.calls.length).toBe(1);
        expect(feedListener.close.mock.calls[0].length).toBe(1);
        expect(feedListener.close.mock.calls[0][0]).toBeInstanceOf(Error);
        expect(feedListener.close.mock.calls[0][0].message).toBe(
          "REJECTED: ...",
        );
        expect(feedListener.action.mock.calls.length).toBe(0);
      });

      it("if returning success, it should update ._appFeedStates[ser][i]._lastStateEmission = open", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        // Get the callback
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

        const newState = harness.getClientState();
        const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
        newState._appFeedStates[feedSerial][0]._lastStateEmission = "open";
        harness.sessionWrapper.feedState.mockReturnValue("open"); // For _consider
        cb(); // Success
        expect(harness.client).toHaveState(newState);
      });

      it("if returning failure, it should update ._appFeedStates[ser][i]._lastStateEmission = close", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        // Get the callback
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

        const newState = harness.getClientState();
        const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
        newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";
        harness.sessionWrapper.feedState.mockReturnValue("closed"); // For _consider
        cb(new Error("REJECTED: ..."));
        expect(harness.client).toHaveState(newState);
      });

      it("should do nothing on the session", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        // Get the callback
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

        harness.sessionWrapper.mockClear();
        harness.sessionWrapper.feedState.mockReturnValue("open"); // For _consider
        cb(); // Success
        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.state.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
        }
        expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
          true,
        ); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.feedState.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
          expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
            "someFeed",
          );
          expect(
            harness.sessionWrapper.feedState.mock.calls[i][0].args(),
          ).toEqual({
            arg: "val",
          });
        }
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });
    });

    describe("if no feed object is desired open", () => {
      it("if returning success, it should emit nothing", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        feed.desireClosed();

        const feedListener = harness.createFeedListener(feed);
        harness.sessionWrapper.feedState.mockReturnValue("open");
        harness.sessionWrapper.feedData.mockReturnValue({ feed: "data" });
        cb(); // Success

        expect(feedListener.opening.mock.calls.length).toBe(0);
        expect(feedListener.open.mock.calls.length).toBe(0);
        expect(feedListener.close.mock.calls.length).toBe(0);
        expect(feedListener.action.mock.calls.length).toBe(0);
      });

      it("if returning failure, it should emit nothing", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        feed.desireClosed();

        const feedListener = harness.createFeedListener(feed);
        harness.sessionWrapper.feedState.mockReturnValue("open");
        harness.sessionWrapper.feedData.mockReturnValue({ feed: "data" });
        cb(new Error("REJECTED: ..."));

        expect(feedListener.opening.mock.calls.length).toBe(0);
        expect(feedListener.open.mock.calls.length).toBe(0);
        expect(feedListener.close.mock.calls.length).toBe(0);
        expect(feedListener.action.mock.calls.length).toBe(0);
      });

      it("if returning success, it should update the state appropriately", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        feed.desireClosed();

        const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
        const newState = harness.getClientState();
        newState._feedCloseRequested[feedSerial] = true;

        harness.sessionWrapper.feedState.mockReturnValue("open"); // For _consider
        cb(); // Success
        expect(harness.client).toHaveState(newState);
      });

      it("if returning failure, it should not change the state", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        feed.desireClosed();

        const newState = harness.getClientState();

        harness.sessionWrapper.feedState.mockReturnValue("closed"); // For _consider
        cb(new Error("REJECTED: ..."));
        expect(harness.client).toHaveState(newState);
      });

      it("should run session.feedClose()", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");

        // Get the callback
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        feed.desireClosed();

        harness.sessionWrapper.mockClear();
        harness.sessionWrapper.feedState.mockReturnValue("open"); // For _consider
        cb(); // Success
        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(1);
        expect(harness.sessionWrapper.feedClose.mock.calls[0].length).toBe(2); // Including callback
        expect(harness.sessionWrapper.feedClose.mock.calls[0][0].name()).toBe(
          "someFeed",
        );
        expect(
          harness.sessionWrapper.feedClose.mock.calls[0][0].args(),
        ).toEqual({
          arg: "val",
        });
        expect(
          check.function(harness.sessionWrapper.feedClose.mock.calls[0][1]),
        ).toBe(true);
        expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.state.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
        }
        expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
          true,
        ); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.feedState.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
          expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
            "someFeed",
          );
          expect(
            harness.sessionWrapper.feedState.mock.calls[i][0].args(),
          ).toEqual({
            arg: "val",
          });
        }
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });
    });
  });

  describe("the feed close response callback, when fired", () => {
    describe("if a feed object is desired open - session still conencted", () => {
      it("should emit nothing (opening already emitted)", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed and then desire open while closing
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");
        feed.desireOpen();

        const feedListener = harness.createFeedListener(feed);
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        cb2(); // Feed close success

        expect(feedListener.opening.mock.calls.length).toBe(0);
        expect(feedListener.open.mock.calls.length).toBe(0);
        expect(feedListener.close.mock.calls.length).toBe(0);
        expect(feedListener.action.mock.calls.length).toBe(0);
      });

      it("should update the state appropriately", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed and then desire open while closing
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");
        feed.desireOpen();

        const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
        const newState = harness.getClientState();
        delete newState._feedCloseRequested[feedSerial];

        harness.sessionWrapper.feedState.mockReturnValue("closed");
        cb2(); // Feed close success

        expect(harness.client).toHaveState(newState);
      });

      it("should run session.feedOpen()", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed and then desire open while closing
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");
        feed.desireOpen();

        harness.sessionWrapper.mockClear();
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        cb2(); // Feed close success
        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(1);
        expect(harness.sessionWrapper.feedOpen.mock.calls[0].length).toBe(2);
        expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].name()).toBe(
          "someFeed",
        );
        expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].args()).toEqual(
          {
            arg: "val",
          },
        );
        expect(
          check.function(harness.sessionWrapper.feedOpen.mock.calls[0][1]),
        ).toBe(true);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.state.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
        }
        expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
          true,
        ); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.feedState.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
          expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
            "someFeed",
          );
          expect(
            harness.sessionWrapper.feedState.mock.calls[i][0].args(),
          ).toEqual({
            arg: "val",
          });
        }
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });
    });

    describe("if no feed object is desired open - session still connected", () => {
      it("should emit nothing (close already emitted)", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");

        const feedListener = harness.createFeedListener(feed);
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        cb2(); // Feed close success

        expect(feedListener.opening.mock.calls.length).toBe(0);
        expect(feedListener.open.mock.calls.length).toBe(0);
        expect(feedListener.close.mock.calls.length).toBe(0);
        expect(feedListener.action.mock.calls.length).toBe(0);
      });

      it("should update the state appropriately", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");

        const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
        const newState = harness.getClientState();
        delete newState._feedCloseRequested[feedSerial];

        harness.sessionWrapper.feedState.mockReturnValue("closed");
        cb2(); // Feed close success

        expect(harness.client).toHaveState(newState);
      });

      it("should do nothing on the session", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");

        harness.sessionWrapper.mockClear();
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        cb2(); // Feed close success
        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.state.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
        }
        expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
          true,
        ); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.feedState.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(1);
          expect(harness.sessionWrapper.feedState.mock.calls[i][0].name()).toBe(
            "someFeed",
          );
          expect(
            harness.sessionWrapper.feedState.mock.calls[i][0].args(),
          ).toEqual({
            arg: "val",
          });
        }
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });
    });

    describe("if a feed object is desired open - session disconencted", () => {
      it("should emit close", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed and then desire open while closing
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");
        feed.desireOpen();

        const feedListener = harness.createFeedListener(feed);
        harness.sessionWrapper.state.mockReturnValue("disconnected");
        cb2(); // Feed close success

        expect(feedListener.opening.mock.calls.length).toBe(0);
        expect(feedListener.open.mock.calls.length).toBe(0);
        expect(feedListener.close.mock.calls.length).toBe(1);
        expect(feedListener.close.mock.calls[0].length).toBe(1);
        expect(feedListener.close.mock.calls[0][0]).toBeInstanceOf(Error);
        expect(feedListener.close.mock.calls[0][0].message).toBe(
          "NOT_CONNECTED: The client disconnected.",
        );
        expect(feedListener.action.mock.calls.length).toBe(0);
      });

      it("should update the state appropriately", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed and then desire open while closing
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");
        feed.desireOpen();

        const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
        const newState = harness.getClientState();
        newState._sessionWrapperState = "disconnected";
        delete newState._feedCloseRequested[feedSerial];
        newState._appFeedStates[feedSerial][0]._lastStateEmission = "close";

        harness.sessionWrapper.state.mockReturnValue("disconnected");
        cb2(); // Feed close success

        expect(harness.client).toHaveState(newState);
      });

      it("should do nothing on the session", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed and then desire open while closing
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");
        feed.desireOpen();

        harness.sessionWrapper.mockClear();
        harness.sessionWrapper.state.mockReturnValue("disconnected");
        cb2(); // Feed close success

        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.state.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
        }
        expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
          true,
        ); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.feedState.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(2);
          expect(harness.sessionWrapper.feedState.mock.calls[i][0]).toBe(
            "someFeed",
          );
          expect(harness.sessionWrapper.feedState.mock.calls[i][1]).toEqual({
            arg: "val",
          });
        }
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });
    });

    describe("if no feed object is desired open - session disconnected", () => {
      it("should emit nothing", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");

        const feedListener = harness.createFeedListener(feed);

        harness.sessionWrapper.state.mockReturnValue("disconnected");
        cb2(); // Feed close success

        expect(feedListener.opening.mock.calls.length).toBe(0);
        expect(feedListener.open.mock.calls.length).toBe(0);
        expect(feedListener.close.mock.calls.length).toBe(0);
        expect(feedListener.action.mock.calls.length).toBe(0);
      });

      it("should update the state appropriately", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");

        const feedSerial = FeedNameArgs("someFeed", { arg: "val" }).serial();
        const newState = harness.getClientState();
        newState._sessionWrapperState = "disconnected";
        delete newState._feedCloseRequested[feedSerial];

        harness.sessionWrapper.state.mockReturnValue("disconnected");
        cb2(); // Feed close success

        expect(harness.client).toHaveState(newState);
      });

      it("should do nothing on the session", () => {
        const harness = harnessFactory();
        harness.client.connect();
        harness.sessionWrapper.emit("connecting");
        harness.sessionWrapper.emit("connect");
        harness.sessionWrapper.state.mockReturnValue("connected");

        // Mock an open feed
        const feed = harness.client.feed("someFeed", { arg: "val" });
        harness.sessionWrapper.feedState.mockReturnValue("closed");
        harness.sessionWrapper.mockClear();
        feed.desireOpen();
        const cb1 = harness.sessionWrapper.feedOpen.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("open");
        cb1(undefined, { feed: "data" });

        // Begin closing the feed
        harness.sessionWrapper.mockClear();
        feed.desireClosed();
        const cb2 = harness.sessionWrapper.feedClose.mock.calls[0][1];
        harness.sessionWrapper.feedState.mockReturnValue("closing");

        harness.sessionWrapper.mockClear();

        harness.sessionWrapper.state.mockReturnValue("disconnected");
        cb2(); // Feed close success

        expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
        expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.state.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
        }
        expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
          true,
        ); // Permit calls
        for (
          let i = 0;
          i < harness.sessionWrapper.feedState.mock.calls.length;
          i += 1
        ) {
          expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(2);
          expect(harness.sessionWrapper.feedState.mock.calls[i][0]).toBe(
            "someFeed",
          );
          expect(harness.sessionWrapper.feedState.mock.calls[i][1]).toEqual({
            arg: "val",
          });
        }
        expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
      });
    });
  });

  // Return value

  it("should return void", () => {
    const harness = harnessFactory();
    expect(
      harness.client._considerFeedState("someFeed", { arg: "val" }),
    ).toBeUndefined();
  });
});

describe("The client._feedOpenTimeout() function", () => {
  // Events

  it("should emit no events", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const clientListener = harness.createClientListener();
    harness.client._feedOpenTimeout(
      FeedNameArgs("someFeed", { arg: "val" }),
      () => {},
      () => {},
    );

    expect(clientListener.connecting.mock.calls.length).toBe(0);
    expect(clientListener.connect.mock.calls.length).toBe(0);
    expect(clientListener.disconnect.mock.calls.length).toBe(0);
    expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
    expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
    expect(clientListener.transportError.mock.calls.length).toBe(0);
  });

  // State

  it("should not change the state", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const newState = harness.getClientState();
    harness.client._feedOpenTimeout(
      FeedNameArgs("someFeed", { arg: "val" }),
      () => {},
      () => {},
    );
    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("should run session.feedOpen()", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    harness.sessionWrapper.mockClear();
    harness.client._feedOpenTimeout(
      FeedNameArgs("someFeed", { arg: "val" }),
      () => {},
      () => {},
    );
    expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(1);
    expect(harness.sessionWrapper.feedOpen.mock.calls[0].length).toBe(2);
    expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].name()).toBe(
      "someFeed",
    );
    expect(harness.sessionWrapper.feedOpen.mock.calls[0][0].args()).toEqual({
      arg: "val",
    });
    expect(
      check.function(harness.sessionWrapper.feedOpen.mock.calls[0][1]),
    ).toBe(true);
    expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
    expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.state.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
    }
    expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(true); // Permit calls
    for (
      let i = 0;
      i < harness.sessionWrapper.feedState.mock.calls.length;
      i += 1
    ) {
      expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(2);
      expect(harness.sessionWrapper.feedState.mock.calls[i][0]).toBe(
        "someFeed",
      );
      expect(harness.sessionWrapper.feedState.mock.calls[i][1]).toEqual({
        arg: "val",
      });
    }
    expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
  });

  // Outbound callbacks

  it(`if the feed open times out, it should call callbackTimeout()
  and then callbackResponse() on result`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const cbTimeout = jest.fn();
    const cbResponse = jest.fn();
    harness.sessionWrapper.mockClear();
    harness.client._feedOpenTimeout(
      FeedNameArgs("someFeed", { arg: "val" }),
      cbTimeout,
      cbResponse,
    );
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    jest.advanceTimersByTime(config.defaults.feedTimeoutMs);

    // This method intentionally does not defer callbacks - not calling back to outside code.

    expect(cbTimeout.mock.calls.length).toBe(1);
    expect(cbTimeout.mock.calls[0].length).toBe(0);
    expect(cbResponse.mock.calls.length).toBe(0);

    cbTimeout.mockClear();

    cb(undefined, { feed: "data" }); // Success

    expect(cbTimeout.mock.calls.length).toBe(0);
    expect(cbResponse.mock.calls.length).toBe(1);
    expect(cbResponse.mock.calls[0].length).toBe(2);
    expect(cbResponse.mock.calls[0][0]).toBeUndefined();
    expect(cbResponse.mock.calls[0][1]).toEqual({ feed: "data" });
  });

  it(`if the feed open does not time out, it should
  call callbackResponse() only`, () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const cbTimeout = jest.fn();
    const cbResponse = jest.fn();
    harness.sessionWrapper.mockClear();
    harness.client._feedOpenTimeout(
      FeedNameArgs("someFeed", { arg: "val" }),
      cbTimeout,
      cbResponse,
    );
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    cb(undefined, { feed: "data" }); // Success

    // This method intentionally does not defer callbacks - not calling back to outside code.

    expect(cbTimeout.mock.calls.length).toBe(0);
    expect(cbResponse.mock.calls.length).toBe(1);
    expect(cbResponse.mock.calls[0].length).toBe(2);
    expect(cbResponse.mock.calls[0][0]).toBeUndefined();
    expect(cbResponse.mock.calls[0][1]).toEqual({ feed: "data" });
  });

  // Inbound callbacks

  describe("the timeout timer, when fired", () => {
    it("should emit no events", () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      harness.sessionWrapper.mockClear();
      harness.client._feedOpenTimeout(
        FeedNameArgs("someFeed", { arg: "val" }),
        () => {},
        () => {},
      );

      const clientListener = harness.createClientListener();

      jest.advanceTimersByTime(config.defaults.feedTimeoutMs);

      // This method intentionally does not defer callbacks - not calling back to outside code.

      expect(clientListener.connecting.mock.calls.length).toBe(0);
      expect(clientListener.connect.mock.calls.length).toBe(0);
      expect(clientListener.disconnect.mock.calls.length).toBe(0);
      expect(clientListener.badServerMessage.mock.calls.length).toBe(0);
      expect(clientListener.badClientMessage.mock.calls.length).toBe(0);
      expect(clientListener.transportError.mock.calls.length).toBe(0);
    });

    it("should not change the state", () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      harness.sessionWrapper.mockClear();
      harness.client._feedOpenTimeout(
        FeedNameArgs("someFeed", { arg: "val" }),
        () => {},
        () => {},
      );

      const newState = harness.getClientState();

      jest.advanceTimersByTime(config.defaults.feedTimeoutMs);

      expect(harness.client).toHaveState(newState);
    });

    it("should do nothing on the session", () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      harness.sessionWrapper.mockClear();
      harness.client._feedOpenTimeout(
        FeedNameArgs("someFeed", { arg: "val" }),
        () => {},
        () => {},
      );

      harness.sessionWrapper.mockClear();

      jest.advanceTimersByTime(config.defaults.feedTimeoutMs);

      expect(harness.sessionWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.action.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedOpen.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedData.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.feedClose.mock.calls.length).toBe(0);
      expect(harness.sessionWrapper.state.mock.calls.length >= 0).toBe(true); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.state.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.state.mock.calls[i].length).toBe(0);
      }
      expect(harness.sessionWrapper.feedState.mock.calls.length >= 0).toBe(
        true,
      ); // Permit calls
      for (
        let i = 0;
        i < harness.sessionWrapper.feedState.mock.calls.length;
        i += 1
      ) {
        expect(harness.sessionWrapper.feedState.mock.calls[i].length).toBe(2);
        expect(harness.sessionWrapper.feedState.mock.calls[i][0]).toBe(
          "someFeed",
        );
        expect(harness.sessionWrapper.feedState.mock.calls[i][1]).toEqual({
          arg: "val",
        });
      }
      expect(harness.sessionWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("should call callbackTimeout()", () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.sessionWrapper.emit("connecting");
      harness.sessionWrapper.emit("connect");
      harness.sessionWrapper.state.mockReturnValue("connected");

      const cbTimeout = jest.fn();
      harness.sessionWrapper.mockClear();
      harness.client._feedOpenTimeout(
        FeedNameArgs("someFeed", { arg: "val" }),
        cbTimeout,
        () => {},
      );

      jest.advanceTimersByTime(config.defaults.feedTimeoutMs);

      // This method intentionally does not defer callbacks - not calling back to outside code.

      expect(cbTimeout.mock.calls.length).toBe(1);
      expect(cbTimeout.mock.calls[0].length).toBe(0);
    });
  });

  // Return value

  it("should return void", () => {
    const harness = harnessFactory();
    expect(
      harness.client._feedOpenTimeout(
        FeedNameArgs("someFeed", { arg: "val" }),
        () => {},
        () => {},
      ),
    ).toBeUndefined();
  });
});

describe("The client._informServerFeedClosed() and feed._serverFeedClosed() functions", () => {
  // Events

  it("feeds desired closed should not emit anything", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed1.desireOpen();
    let cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const feed2 = harness.client.feed("someFeed", { arg: "val" });

    // Close the open feed
    harness.sessionWrapper.mockClear();
    feed1.desireClosed(); // Calls session.feedClose()
    cb = harness.sessionWrapper.feedClose.mock.calls[0][1]; // eslint-disable-line

    const feedListener = harness.createFeedListener(feed2);
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    cb(); // Close succeeded

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("feeds desired open with state closed should emit if the error changed", () => {
    // This happens via client._informServerFeedClosed() when a feed open
    // times out and then the server rejects the open (or the client disconnects).

    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock a timed out feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("opening");

    jest.advanceTimersByTime(config.defaults.feedTimeoutMs);

    const feedListener = harness.createFeedListener(feed);

    harness.sessionWrapper.feedState.mockReturnValue("closed");
    cb(new Error("REJECTED: ..."));

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(1);
    expect(feedListener.close.mock.calls[0].length).toBe(1);
    expect(feedListener.close.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(feedListener.close.mock.calls[0][0].message).toBe("REJECTED: ...");
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("feeds desired open with state closed should not emit if the error didn't change", () => {
    // This happens on unexpectedFeedClosing/Closed sequence
    // Testing with BAD_FEED_ACTION
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("BAD_FEED_ACTION: ..."),
    );

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.emit(
      "unexpectedFeedClosed",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("BAD_FEED_ACTION: ..."),
    );

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("feeds desired open with state opening should emit if there is an error", () => {
    // This happens, for example, when the server rejects the feed open request
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    cb(new Error("REJECTED: ..."));

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(1);
    expect(feedListener.close.mock.calls[0].length).toBe(1);
    expect(feedListener.close.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(feedListener.close.mock.calls[0][0].message).toBe("REJECTED: ...");
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("feeds desired open with state opening should not emit if there is no error (will re-open)", () => {
    // This happens when an open feed is desired closed and then open again before
    // the server actually closes the feed
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    let cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    // Desire the feed closed, get the callback passed to session then desire open
    harness.sessionWrapper.mockClear();
    feed.desireClosed();
    harness.sessionWrapper.feedState.mockReturnValue("closing");
    cb = harness.sessionWrapper.feedClose.mock.calls[0][1]; // eslint-disable-line
    feed.desireOpen();

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    cb(); // Successful closure

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  // State

  it("should update appFeeds[ser][i]._lastStateEmission as appropriate", () => {
    // This is assumed to function correctly, given that feed._emitClose/Opening/Open()
    // perform the updates and they are tested above
  });

  // Session

  it("should do nothing on the session", () => {
    // This is trivial - nothing touches the session
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A

  // Return value

  it("should return void", () => {
    const harness = harnessFactory();
    expect(
      harness.client._informServerFeedClosed(
        FeedNameArgs("someFeed", { arg: "val" }),
      ),
    ).toBeUndefined();
  });
});

describe("The client._informServerFeedOpening() and feed._serverFeedOpening() functions", () => {
  // Events

  it("feeds desired closed should not emit anything", () => {
    const harness = harnessFactory();

    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    feed1.desireOpen();
    const feed2 = harness.client.feed("someFeed", { arg: "val" });

    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.feedState.mockReturnValue("closed");

    const feedListener = harness.createFeedListener(feed2);
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect"); // Client attempts to open the feed

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("feeds desired open with state closed should emit opening", () => {
    const harness = harnessFactory();

    const feed = harness.client.feed("someFeed", { arg: "val" });
    feed.desireOpen();

    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.feedState.mockReturnValue("closed");

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect"); // Client attempts to open the feed

    expect(feedListener.opening.mock.calls.length).toBe(1);
    expect(feedListener.opening.mock.calls[0].length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("feeds desired open with state opening should emit nothing (don't cycle state)", () => {
    // This happens when an open feed is desired closed and then open again before
    // the server actually closes the feed
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    let cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    // Desire the feed closed, get the callback passed to session then desire open
    harness.sessionWrapper.mockClear();
    feed.desireClosed();
    harness.sessionWrapper.feedState.mockReturnValue("closing");
    cb = harness.sessionWrapper.feedClose.mock.calls[0][1]; // eslint-disable-line
    feed.desireOpen();

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    cb(); // Successful closure and subsequent re-open is started

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  // State

  it("should update appFeeds[ser][i]._lastStateEmission as appropriate", () => {
    // This is assumed to function correctly, given that feed._emitClose/Opening/Open()
    // perform the updates and they are tested above
  });

  // Session

  it("should do nothing on the session", () => {
    // This is trivial - nothing touches the session
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A

  // Return value

  it("should return void", () => {
    const harness = harnessFactory();
    expect(
      harness.client._informServerFeedOpening(
        FeedNameArgs("someFeed", { arg: "val" }),
      ),
    ).toBeUndefined();
  });
});

describe("The client._informServerFeedOpen() and feed._serverFeedOpen() functions", () => {
  // Events

  it("feeds desired closed should not emit anything", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    harness.sessionWrapper.feedState.mockReturnValue("closed");
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    const feed2 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.mockClear();
    feed1.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    const feedListener = harness.createFeedListener(feed2);
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" }); // Open success

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("feeds desired open with state closed should emit opening and then open", () => {
    // Happens when server returns late success after feed open timeout
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    harness.sessionWrapper.feedState.mockReturnValue("closed");
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    jest.advanceTimersByTime(config.defaults.feedTimeoutMs); // Time out

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" }); // Return late success

    expect(feedListener.opening.mock.calls.length).toBe(1);
    expect(feedListener.opening.mock.calls[0].length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(1);
    expect(feedListener.open.mock.calls[0].length).toBe(1);
    expect(feedListener.open.mock.calls[0][0]).toEqual({ feed: "data" });
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("feeds desired open with state opening should emit open", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    harness.sessionWrapper.feedState.mockReturnValue("closed");
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" }); // Return late success

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(1);
    expect(feedListener.open.mock.calls[0].length).toBe(1);
    expect(feedListener.open.mock.calls[0][0]).toEqual({ feed: "data" });
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  // State

  it("should update appFeeds[ser][i]._lastStateEmission as appropriate", () => {
    // This is assumed to function correctly, given that feed._emitClose/Opening/Open()
    // perform the updates and they are tested above
  });

  // Session

  it("should do nothing on the session", () => {
    // This is trivial - nothing touches the session
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A

  // Return value

  it("should return void", () => {
    const harness = harnessFactory();
    expect(
      harness.client._informServerFeedOpen(
        FeedNameArgs("someFeed", { arg: "val" }),
      ),
    ).toBeUndefined();
  });
});

describe("The client._informServerFeedClosing() and feed._serverFeedClosing() functions", () => {
  // Events

  it("feeds desired closed should not emit anything", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed1.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const feed2 = harness.client.feed("someFeed", { arg: "val" });

    const feedListener = harness.createFeedListener(feed2);
    feed1.desireClosed(); // Calls session.feedClose()
    harness.sessionWrapper.feedState.mockReturnValue("closing");

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  it("feeds desired open with state open should emit close", () => {
    // This happens when there is an unexpectedFeedClosing
    // Testing with TERMINATED
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.feedState.mockReturnValue("closing");
    harness.sessionWrapper.emit(
      "unexpectedFeedClosing",
      FeedNameArgs("someFeed", { arg: "val" }),
      new Error("TERMINATED: ..."),
    );

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(1);
    expect(feedListener.close.mock.calls[0].length).toBe(1);
    expect(feedListener.close.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(feedListener.close.mock.calls[0][0].message).toBe("TERMINATED: ...");
    expect(feedListener.action.mock.calls.length).toBe(0);
  });

  // State

  it("should update appFeeds[ser][i]._lastStateEmission as appropriate", () => {
    // This is assumed to function correctly, given that feed._emitClose/Opening/Open()
    // perform the updates and they are tested above
  });

  // Session

  it("should do nothing on the session", () => {
    // This is trivial - nothing touches the session
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A

  // Return value

  it("should return void", () => {
    const harness = harnessFactory();
    expect(
      harness.client._informServerFeedClosing(
        FeedNameArgs("someFeed", { arg: "val" }),
      ),
    ).toBeUndefined();
  });
});

describe("The client._informServerFeedAction() and feed._serverFeedAction() functions", () => {
  // Events

  it("feeds desired closed should not emit anything", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed1 = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed1.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const feed2 = harness.client.feed("someFeed", { arg: "val" });

    const feedListener = harness.createFeedListener(feed2);
    const nameListener = jest.fn();
    feed2.on("action:someAction", nameListener);
    harness.sessionWrapper.emit(
      "feedAction",
      FeedNameArgs("someFeed", { arg: "val" }),
      "someAction",
      { action: "arg" },
      {},
      {},
    );

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(0);
    expect(nameListener.mock.calls.length).toBe(0);
  });

  it("feeds desired open should emit action", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const feedListener = harness.createFeedListener(feed);
    harness.sessionWrapper.emit(
      "feedAction",
      FeedNameArgs("someFeed", { arg: "val" }),
      "someAction",
      { action: "arg" },
      { new: "data" },
      { old: "data" },
    );

    expect(feedListener.opening.mock.calls.length).toBe(0);
    expect(feedListener.open.mock.calls.length).toBe(0);
    expect(feedListener.close.mock.calls.length).toBe(0);
    expect(feedListener.action.mock.calls.length).toBe(1);
    expect(feedListener.action.mock.calls[0].length).toBe(4);
    expect(feedListener.action.mock.calls[0][0]).toBe("someAction");
    expect(feedListener.action.mock.calls[0][1]).toEqual({ action: "arg" });
    expect(feedListener.action.mock.calls[0][2]).toEqual({ new: "data" });
    expect(feedListener.action.mock.calls[0][3]).toEqual({ old: "data" });
  });

  // State

  it("should not change the state (feed data goes in the session)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    const newState = harness.getClientState();
    harness.sessionWrapper.emit(
      "feedAction",
      FeedNameArgs("someFeed", { arg: "val" }),
      "someAction",
      { action: "arg" },
      { new: "data" },
      { old: "data" },
    );
    expect(harness.client).toHaveState(newState);
  });

  // Session

  it("should do nothing on the session", () => {
    // This is trivial - nothing touches the session
  });

  // Outbound callbacks - N/A

  // Inbound callbacks - N/A

  // Return value

  it("should return void", () => {
    const harness = harnessFactory();
    expect(
      harness.client._informServerFeedAction(
        FeedNameArgs("someFeed", { arg: "val" }),
        "someAction",
        { action: "arg" },
        {},
        {},
      ),
    ).toBeUndefined();
  });
});

describe("The client._connectTimeoutCancel() function", () => {
  // Tested above
});

// Testing: state getters

describe("The client.state() function", () => {
  // Errors

  it("should throw if destroyed", () => {
    const harness = harnessFactory();
    harness.client.destroy();
    harness.sessionWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness.client.state();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  // Success

  it("should return the session state", () => {
    const harness = harnessFactory();
    harness.sessionWrapper.state.mockReturnValue("SOME_STATE");
    expect(harness.client.state()).toBe("SOME_STATE");
  });
});

describe("the client.destroyed() function", () => {
  it("should return correctly", () => {
    const harness = harnessFactory();
    expect(harness.client.destroyed()).toBe(false);
    harness.sessionWrapper.destroyed.mockReturnValue(true);
    expect(harness.client.destroyed()).toBe(true);
  });
});

describe("The feed.desiredState() and client._appFeedDesiredState() functions", () => {
  // Errors

  it("should throw an error if the feed object is destroyed", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    feed.destroy();
    expect(() => {
      feed.desiredState();
    }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
  });

  // Success

  it("should return open when desired open", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    expect(feed.desiredState()).toBe("closed");
  });

  it("should return closed when desired closed", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    feed.desireOpen();
    expect(feed.desiredState()).toBe("open");
  });
});

describe("The feed.state() and client._appFeedState() functions", () => {
  // Errors

  it("should throw an error if the feed object is destroyed", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    feed.destroy();
    expect(() => {
      feed.state();
    }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
  });

  // Success

  it("should return correctly through a standard feed open/close cycle", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.state.mockReturnValue("connecting");
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect");

    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    expect(feed.state()).toBe("closed");

    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    expect(feed.state()).toBe("opening");

    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb();
    expect(feed.state()).toBe("open");

    feed.desireClosed();
    expect(feed.state()).toBe("closed");
  });

  it("should return correctly if session state is disconnected (pre-event)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.state.mockReturnValue("connecting");
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect");

    // Make feed open
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb();
    expect(feed.state()).toBe("open");

    harness.sessionWrapper.state.mockReturnValue("disconnected");
    expect(feed.state()).toBe("closed");
  });

  it("should return correctly if session state is connecting (pre-event)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.state.mockReturnValue("connecting");
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect");

    // Make feed open
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb();
    expect(feed.state()).toBe("open");

    harness.sessionWrapper.state.mockReturnValue("disconnected");
    harness.sessionWrapper.emit("disconnect");
    // Client does reconnect
    harness.sessionWrapper.state.mockReturnValue("connecting");
    harness.sessionWrapper.emit("connecting");
    expect(feed.state()).toBe("closed");
  });

  it("should return correctly if session state is connected and server feed is closing - requested (pre-event)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.state.mockReturnValue("connecting");
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect");

    // Make feed open
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb();
    expect(feed.state()).toBe("open");

    feed.desireClosed();
    harness.sessionWrapper.feedState.mockReturnValue("closing");
    feed.desireOpen();

    expect(feed.state()).toBe("opening");
  });

  it("should return correctly if session state is connected and server feed is closing - requested (pre-event)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.state.mockReturnValue("connecting");
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect");

    // Make feed open
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb();
    expect(feed.state()).toBe("open");

    harness.sessionWrapper.feedState.mockReturnValue("closing"); // Unexpected

    expect(feed.state()).toBe("closed");
  });

  it("should return correctly if session state is connected and server feed is opening (pre-event)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.state.mockReturnValue("connecting");
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect");

    // Make feed open
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("opening");

    expect(feed.state()).toBe("opening");
  });

  it("should return correctly if session state is connected and server feed is open (pre-event)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.state.mockReturnValue("connecting");
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect");

    // Make feed open
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("open");

    expect(feed.state()).toBe("open");
  });

  it("should return correctly if session state is connected and server feed is closed (pre-event)", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.state.mockReturnValue("connecting");
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.state.mockReturnValue("connected");
    harness.sessionWrapper.emit("connect");

    // Make feed open
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("closed");

    expect(feed.state()).toBe("closed");
  });
});

describe("The feed.data() and client._appFeedData() functions", () => {
  // Errors

  it("should throw an error if the feed object is destroyed", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    feed.destroy();
    expect(() => {
      feed.data();
    }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
  });

  it("should throw an error if the feed object is closed", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    expect(() => {
      feed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
  });

  it("should throw an error if the feed object is opening", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    feed.desireOpen();
    harness.sessionWrapper.feedState.mockReturnValue("opening");
    expect(() => {
      feed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
  });

  // Success

  it("should return the feed data", () => {
    const harness = harnessFactory();
    harness.client.connect();
    harness.sessionWrapper.emit("connecting");
    harness.sessionWrapper.emit("connect");
    harness.sessionWrapper.state.mockReturnValue("connected");

    // Mock an open feed
    const feed = harness.client.feed("someFeed", { arg: "val" });
    harness.sessionWrapper.feedState.mockReturnValue("closed");
    harness.sessionWrapper.mockClear();
    feed.desireOpen();
    const cb = harness.sessionWrapper.feedOpen.mock.calls[0][1];
    harness.sessionWrapper.feedState.mockReturnValue("open");
    cb(undefined, { feed: "data" });

    harness.sessionWrapper.feedData.mockReturnValue({ feed: "data" });
    expect(feed.data()).toEqual({ feed: "data" });
  });
});

describe("The feed.destroyed() function", () => {
  // Errors - N/A

  // Success

  it("should return correctly", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("someFeed", { arg: "val" });
    expect(feed.destroyed()).toBe(false);
    feed.destroy();
    expect(feed.destroyed()).toBe(true);
  });
});
