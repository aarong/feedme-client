import emitter from "component-emitter";
import _ from "lodash";
import check from "check-types";
import FeedNameArgs from "feedme-util/feednameargs";
import session from "../session.sync";

/*

Testing Strategy

Unit: Each method (app-, -transport, or internally-triggered) code branch.
For each unit, check that all potential results are as desired, including
verifying no change (errors, events, state, transport calls, return values).

1. Test state-modifying functionality
    Outside function calls
        Test all errors (thrown)
        For each possible success type (by branch)
            Check events (no extra)
            Check internal state
            Check transport calls (no extra)
            Check callbacks (disconnect, for example)
            Check return value
    Transport-triggered events
        Test all errors (emitted)
        For each possible success type (by branch)
            Check events (no extra)
            Check internal state
            Check transport calls (handshake, for example; no extra)
            Check callbacks

2. Test state-getting functionality. Outside-facing and internal.
    No need to worry about events, state change, transport calls, or callbacks.
    Test that each "type" of state results in the correct error being thrown or
    return value being returned. This means that a given code path may
    have multiple tests. Also test internal helper functions.

State: Session members
    ._transportWrapper (check transport state)
    ._handshakeComplete
    ._feedStates
    ._actionCallbacks
    ._nextActionCallbackId
    ._feedOpenCallbacks
    ._feedData
    ._feedCloseCallbacks

1. State-modifying functionality
    Outside-triggered
        session()
        .connect()
        .disconnect()
        .action()
        .feedOpen()
        .feedClose()
        .destroy()
    Transport-triggered
        ._processTransportConnecting()
        ._processTransportConnect()
        ._processTransportDisconnect()
        ._processTransportMessage()
            ._processViolationResponse()
            ._processHandshakeResponse()
            ._processActionResponse()
            ._processFeedOpenResponse()
            ._processFeedCloseResponse()
            ._processFeedAction()
            ._processFeedTermination()
        ._processTransportError()

2. State-getting functionality
    Session functions
        .state()
        .feedState()
        .feedData()
        .destroyed()
    Internal helper functions:
        ._feedState()

*/

// Test harness and associated Jest state matcher

const harnessProto = {};

const harnessFactory = function harnessFactory() {
  /*

    Members:
        .transportWrapper (=session._transportWrapper)
        .session
    Functions:
        .connectSession()
        .createSessionListener()
        .feedOpenSuccess(feed, data)
        .getSessionState() - all relevant members

    */

  const harness = Object.create(harnessProto);

  // Create mock transport wrapper (disconnected)
  const t = {};
  emitter(t);
  t.connect = jest.fn();
  t.send = jest.fn();
  t.disconnect = jest.fn();
  t.state = jest.fn();
  t.state.mockReturnValue("disconnected");
  t.destroy = jest.fn();
  t.destroyed = jest.fn();
  t.destroyed.mockReturnValue(false);
  harness.transportWrapper = t;

  // Function to reset mock transport functions
  t.mockClear = function mockClear() {
    t.connect.mockClear();
    t.send.mockClear();
    t.disconnect.mockClear();
    t.state.mockClear();
    t.destroy.mockClear();
    t.destroyed.mockClear();
  };

  // Create the session
  harness.session = session(harness.transportWrapper);

  return harness;
};

harnessProto.connectSession = function connectSession() {
  this.session.connect();
  this.transportWrapper.state.mockReturnValue("connecting");
  this.transportWrapper.emit("connecting");
  this.transportWrapper.state.mockReturnValue("connected");
  this.transportWrapper.emit("connect");
  this.transportWrapper.emit(
    "message",
    JSON.stringify({
      MessageType: "HandshakeResponse",
      Success: true,
      Version: "0.1",
    }),
  );
  this.transportWrapper.mockClear();
};

harnessProto.feedOpenSuccess = function feedOpenSuccess(feedNameArgs, data) {
  this.transportWrapper.emit(
    "message",
    JSON.stringify({
      MessageType: "FeedOpenResponse",
      FeedName: feedNameArgs.name(),
      FeedArgs: feedNameArgs.args(),
      Success: true,
      FeedData: data,
    }),
  );
};

harnessProto.createSessionListener = function createSessionListener() {
  const l = {
    connecting: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    feedAction: jest.fn(),
    unexpectedFeedClosing: jest.fn(),
    unexpectedFeedClosed: jest.fn(),
    badServerMessage: jest.fn(),
    badClientMessage: jest.fn(),
    transportError: jest.fn(),
  };
  l.mockClear = function mockClear() {
    l.connecting.mock.mockClear();
    l.connect.mock.mockClear();
    l.disconnect.mock.mockClear();
    l.feedAction.mockClear();
    l.unexpectedFeedClosing.mockClear();
    l.unexpectedFeedClosed.mockClear();
    l.badServerMessage.mock.mockClear();
    l.badClientMessage.mock.mockClear();
    l.transportError.mock.mockClear();
  };
  this.session.on("connecting", l.connecting);
  this.session.on("connect", l.connect);
  this.session.on("disconnect", l.disconnect);
  this.session.on("feedAction", l.feedAction);
  this.session.on("unexpectedFeedClosing", l.unexpectedFeedClosing);
  this.session.on("unexpectedFeedClosed", l.unexpectedFeedClosed);
  this.session.on("badServerMessage", l.badServerMessage);
  this.session.on("badClientMessage", l.badClientMessage);
  this.session.on("transportError", l.transportError);
  return l;
};

harnessProto.getSessionState = function getSessionState() {
  const sess = this.session;
  const state = {};
  state._transportWrapper = sess._transportWrapper; // Object reference
  state._transportWrapperState = sess._transportWrapper.state(); // String
  state._handshakeComplete = sess._handshakeComplete;

  state._feedStates = {};
  _.each(sess._feedStates, (val, key) => {
    state._feedStates[key] = val; // String reference
  });

  state._actionCallbacks = {};
  _.each(sess._actionCallbacks, (val, key) => {
    state._actionCallbacks[key] = val; // Function reference
  });
  state._nextActionCallbackId = sess._nextActionCallbackId;

  state._feedOpenCallbacks = {};
  _.each(sess._feedOpenCallbacks, (val, key) => {
    state._feedOpenCallbacks[key] = val; // Function reference
  });

  state._feedData = {};
  _.each(sess._feedData, (val, key) => {
    state._feedData[key] = val; // Object reference
  });

  state._feedCloseCallbacks = {};
  _.each(sess._feedCloseCallbacks, (val, key) => {
    state._feedCloseCallbacks[key] = val; // Function reference
  });

  return state;
};

expect.extend({
  toHaveState(receivedSession, expectedState) {
    // Check all that session state members are as expected

    // Check ._transportWrapper
    if (receivedSession._transportWrapper !== expectedState._transportWrapper) {
      return {
        pass: false,
        message() {
          return "expected transport wrapper objects to match, but they didn't";
        },
      };
    }

    // Check transport state
    if (
      receivedSession._transportWrapper.state() !==
      expectedState._transportWrapperState
    ) {
      return {
        pass: false,
        message() {
          return "expected transport wrapper states to match, but they didn't";
        },
      };
    }

    // Check ._handshakeComplete
    if (
      receivedSession._handshakeComplete !== expectedState._handshakeComplete
    ) {
      return {
        pass: false,
        message() {
          return `expected to have ._handshakeComplete = "${expectedState._handshakeComplete}" but got "${receivedSession._handshakeComplete}"`; // prettier-ignore
        },
      };
    }

    // Check ._feedStates
    if (!_.isEqual(receivedSession._feedStates, expectedState._feedStates)) {
      return {
        pass: false,
        message() {
          return "expected ._feedStates to match, but they didn't";
        },
      };
    }

    // Check ._actionCallbacks
    if (
      !_.isEqual(
        receivedSession._actionCallbacks,
        expectedState._actionCallbacks,
      )
    ) {
      return {
        pass: false,
        message() {
          return "expected ._actionCallbacks to match, but they didn't";
        },
      };
    }

    // Check ._nextActionCallbackId
    if (
      receivedSession._nextActionCallbackId !==
      expectedState._nextActionCallbackId
    ) {
      return {
        pass: false,
        message() {
          return `expected to have ._nextCallbackId = ${expectedState._nextActionCallbackId} but got ${receivedSession._nextActionCallbackId}`; // prettier-ignore
        },
      };
    }

    // Check ._feedOpenCallbacks
    if (
      !_.isEqual(
        receivedSession._feedOpenCallbacks,
        expectedState._feedOpenCallbacks,
      )
    ) {
      return {
        pass: false,
        message() {
          return "expected ._feedOpenCallbacks to match, but they didn't";
        },
      };
    }

    // Check ._feedData
    if (!_.isEqual(receivedSession._feedData, expectedState._feedData)) {
      return {
        pass: false,
        message() {
          return "expected ._feedData to match, but they didn't";
        },
      };
    }

    // Check ._feedCloseCallbacks
    if (
      !_.isEqual(
        receivedSession._feedCloseCallbacks,
        expectedState._feedCloseCallbacks,
      )
    ) {
      return {
        pass: false,
        message() {
          return "expected ._feedCloseCallbacks to match, but they didn't";
        },
      };
    }

    // Match
    return { pass: true };
  },
});

// Testing: outside-triggered state modifiers

describe("The factory function", () => {
  // The transport argument is checked by transportWrapper

  describe("can return success", () => {
    let harness;
    beforeEach(() => {
      harness = harnessFactory();
    });

    // Events - N/A

    // State

    it("should end with the expected state", () => {
      expect(harness.session).toHaveState({
        _transportWrapper: harness.transportWrapper,
        _transportWrapperState: "disconnected",
        _handshakeComplete: false,
        _feedStates: {},
        _actionCallbacks: {},
        _nextActionCallbackId: 1,
        _feedOpenCallbacks: {},
        _feedData: {},
        _feedCloseCallbacks: {},
      });
    });

    // Transport

    it("should make no transport calls", () => {
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A

    // Return value

    it("should return an object", () => {
      expect(check.object(harness.session)).toBe(true);
    });
  });
});

describe("The .connect() function", () => {
  // Mock a disconnected session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  it("should throw if destroyed", () => {
    harness.session.destroy();
    harness.transportWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness.session.connect();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should throw an error if the transport state is not disconnected", () => {
    harness.connectSession();
    expect(() => {
      harness.session.connect();
    }).toThrow(new Error("INVALID_STATE: Already connecting or connected."));
  });

  describe("can return success", () => {
    // Events

    it("should emit nothing", () => {
      const sessionListener = harness.createSessionListener();
      harness.session.connect();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update transport state to connecting", () => {
      const newState = harness.getSessionState();
      newState._transportWrapperState = "connecting";
      harness.session.connect();
      harness.transportWrapper.state.mockReturnValue("connecting");
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.connect()", () => {
      harness.transportWrapper.mockClear();
      harness.session.connect();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.connect.mock.calls[0].length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A

    // Return value

    it("should return nothing", () => {
      expect(harness.session.connect()).toBeUndefined();
    });
  });
});

describe("The .disconnect() function", () => {
  // Mock a connected session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });

  it("should throw if destroyed", () => {
    const harness2 = harnessFactory();
    harness2.session.destroy();
    harness2.transportWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness2.session.disconnect();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should throw an error if the state is already disconnected", () => {
    harness.session.disconnect();
    harness.transportWrapper.state.mockReturnValue("disconnected");
    expect(() => {
      harness.session.disconnect();
    }).toThrow(new Error("INVALID_STATE: Already disconnected."));
  });

  describe("can return success", () => {
    // Events

    it("should emit nothing", () => {
      const sessionListener = harness.createSessionListener();
      harness.session.disconnect();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update transport state and nothing else", () => {
      const newState = harness.getSessionState();
      newState._transportWrapperState = "disconnected";
      harness.session.disconnect();
      harness.transportWrapper.state.mockReturnValue("disconnected");
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.disconnect() - no error", () => {
      harness.transportWrapper.mockClear();
      harness.session.disconnect();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.disconnect.mock.calls[0].length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    it("should call transport.disconnect() - with error", () => {
      harness.transportWrapper.mockClear();
      const err = new Error("SOME_ERROR: ...");
      harness.session.disconnect(err);
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.disconnect.mock.calls[0].length).toBe(1);
      expect(harness.transportWrapper.disconnect.mock.calls[0][0]).toBe(err);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A

    // Return value

    it("should return nothing", () => {
      expect(harness.session.disconnect()).toBeUndefined();
    });
  });
});

describe("The .action() function", () => {
  // Mock a connected session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });

  it("should throw if destroyed", () => {
    const harness2 = harnessFactory();
    harness2.session.destroy();
    harness2.transportWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness2.session.action();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  describe("can return success", () => {
    // Events

    it("should emit no events", () => {
      const sessionListener = harness.createSessionListener();
      harness.session.action("myAction", { arg: "val" }, () => {});

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._nextActionCallbackId and ._actionCallbacks", () => {
      const cb = () => {};
      const newState = harness.getSessionState();
      newState._actionCallbacks["1"] = cb;
      newState._nextActionCallbackId = 2;
      harness.session.action("myAction", { arg: "val" }, cb);
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.send(msg)", () => {
      harness.transportWrapper.mockClear();
      harness.session.action("myAction", { arg: "val" }, () => {});
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.send.mock.calls[0].length).toBe(1);
      expect(
        JSON.parse(harness.transportWrapper.send.mock.calls[0][0]),
      ).toEqual({
        MessageType: "Action",
        ActionName: "myAction",
        ActionArgs: { arg: "val" },
        CallbackId: "1",
      });
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A

    // Return value

    it("should return nothing", () => {
      expect(harness.session.action("myAction", {}, () => {})).toBeUndefined();
    });
  });
});

describe("The .feedOpen() function", () => {
  // Mock a connected session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });

  it("should throw if destroyed", () => {
    const harness2 = harnessFactory();
    harness2.session.destroy();
    harness2.transportWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness2.session.feedOpen();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should throw an error if not connected", () => {
    harness.session.disconnect();
    harness.transportWrapper.state.mockReturnValue("disconnected");
    const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
    expect(() => {
      harness.session.feedOpen(feedNameArgs, () => {});
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  it("should throw an error if feed is not closed", () => {
    const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
    harness.session.feedOpen(feedNameArgs, () => {});
    expect(() => {
      harness.session.feedOpen(feedNameArgs, () => {});
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not closed."));
  });

  describe("can return success", () => {
    // Events

    it("should emit no events", () => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      const sessionListener = harness.createSessionListener();
      harness.session.feedOpen(feedNameArgs, () => {});

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates and ._feedOpenCallbacks", () => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      const feedSerial = feedNameArgs.serial();
      const cb = () => {};
      const newState = harness.getSessionState();
      newState._feedStates[feedSerial] = "opening";
      newState._feedOpenCallbacks[feedSerial] = cb;
      harness.session.feedOpen(feedNameArgs, cb);
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.send(msg)", () => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.transportWrapper.mockClear();
      harness.session.feedOpen(feedNameArgs, () => {});
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.send.mock.calls[0].length).toBe(1);
      expect(
        JSON.parse(harness.transportWrapper.send.mock.calls[0][0]),
      ).toEqual({
        MessageType: "FeedOpen",
        FeedName: "myFeed",
        FeedArgs: { arg: "val" },
      });
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A

    // Return value

    it("should return nothing", () => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      expect(harness.session.feedOpen(feedNameArgs, () => {})).toBeUndefined();
    });
  });
});

describe("The .feedClose() function", () => {
  // Mock a connected session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });

  it("should throw if destroyed", () => {
    const harness2 = harnessFactory();
    harness2.session.destroy();
    harness2.transportWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness2.session.feedClose();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should throw an error if not connected", () => {
    harness.session.disconnect();
    harness.transportWrapper.state.mockReturnValue("disconnected");
    expect(() => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.session.feedClose(feedNameArgs, () => {});
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  it("should throw an error if feed is not open", () => {
    expect(() => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.session.feedClose(feedNameArgs, () => {});
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not open."));
  });

  describe("can return success", () => {
    // Events

    it("should emit no events", () => {
      const sessionListener = harness.createSessionListener();
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.feedOpenSuccess(feedNameArgs, {});
      harness.session.feedClose(feedNameArgs, () => {});

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates and ._feedCloseCallbacks", () => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.feedOpenSuccess(feedNameArgs, {});
      const feedSerial = feedNameArgs.serial();
      const cb = () => {};
      const newState = harness.getSessionState();
      delete newState._feedData[feedSerial];
      newState._feedStates[feedSerial] = "closing";
      newState._feedCloseCallbacks[feedSerial] = cb;
      harness.session.feedClose(feedNameArgs, cb);
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.send(msg)", () => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.feedOpenSuccess(feedNameArgs, {});
      harness.transportWrapper.mockClear();
      harness.session.feedClose(feedNameArgs, () => {});
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.send.mock.calls[0].length).toBe(1);
      expect(
        JSON.parse(harness.transportWrapper.send.mock.calls[0][0]),
      ).toEqual({
        MessageType: "FeedClose",
        FeedName: "myFeed",
        FeedArgs: { arg: "val" },
      });
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A

    // Return value

    it("should return nothing", () => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.feedOpenSuccess(feedNameArgs, {});
      expect(harness.session.feedClose(feedNameArgs, () => {})).toBeUndefined();
    });
  });
});

describe("The .destroy() function", () => {
  it("should throw if destroyed", () => {
    const harness = harnessFactory();
    harness.session.destroy();
    harness.transportWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness.session.destroy();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should throw an error if the transport state is not disconnected", () => {
    const harness = harnessFactory();
    harness.connectSession();
    expect(() => {
      harness.session.destroy();
    }).toThrow(new Error("INVALID_STATE: Not disconnected."));
  });

  describe("can return success", () => {
    // Events

    it("should emit no events", () => {
      const harness = harnessFactory();
      const sessionListener = harness.createSessionListener();

      harness.session.destroy();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should not change the state", () => {
      const harness = harnessFactory();

      const newState = harness.getSessionState();

      harness.session.destroy();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transportWrapper.destroy()", () => {
      const harness = harnessFactory();

      harness.session.destroy();

      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.destroy.mock.calls[0].length).toBe(0);
    });

    // Callbacks - N/A

    // Return value

    it("should return nothing", () => {
      const harness = harnessFactory();
      expect(harness.session.destroy()).toBeUndefined();
    });
  });
});

// Testing: transport-triggered state modifiers

describe("The transport connecting event", () => {
  // Mock a disconnected session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  describe("runs successfully", () => {
    // Events

    it("should emit connecting", () => {
      const sessionListener = harness.createSessionListener();
      harness.transportWrapper.emit("connecting");

      expect(sessionListener.connecting.mock.calls.length).toBe(1);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update transport state to connecting", () => {
      const newState = harness.getSessionState();
      newState._transportWrapperState = "connecting";
      harness.transportWrapper.emit("connecting");
      harness.transportWrapper.state.mockReturnValue("connecting");
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should make no transport calls", () => {
      harness.transportWrapper.mockClear();
      harness.transportWrapper.emit("connecting");
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });
});

describe("The transport connect event", () => {
  // Mock a connecting session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.session.connect();
    harness.transportWrapper.state.mockReturnValue("connecting");
    harness.transportWrapper.emit("connecting");
  });

  describe("runs successfully", () => {
    describe("if the transport is still connected", () => {
      // Events

      it("should emit no events", () => {
        const sessionListener = harness.createSessionListener();
        harness.transportWrapper.state.mockReturnValue("connected");
        harness.transportWrapper.emit("connect");

        expect(sessionListener.connecting.mock.calls.length).toBe(0);
        expect(sessionListener.connect.mock.calls.length).toBe(0);
        expect(sessionListener.disconnect.mock.calls.length).toBe(0);
        expect(sessionListener.feedAction.mock.calls.length).toBe(0);
        expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
        expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
        expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
        expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
        expect(sessionListener.transportError.mock.calls.length).toBe(0);
      });

      // State

      it("should update transport state to connected", () => {
        const newState = harness.getSessionState();
        newState._transportWrapperState = "connected";

        harness.transportWrapper.state.mockReturnValue("connected");
        harness.transportWrapper.emit("connect");

        harness.transportWrapper.state.mockReturnValue("connected");
        expect(harness.session).toHaveState(newState);
      });

      // Transport

      it("should call transport.send(msg) with Handshake", () => {
        harness.transportWrapper.mockClear();

        harness.transportWrapper.state.mockReturnValue("connected");
        harness.transportWrapper.emit("connect");

        expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.transportWrapper.send.mock.calls.length).toBe(1);
        expect(harness.transportWrapper.send.mock.calls[0].length).toBe(1);
        expect(
          JSON.parse(harness.transportWrapper.send.mock.calls[0][0]),
        ).toEqual({
          MessageType: "Handshake",
          Versions: ["0.1"],
        });
        expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
      });

      // Callbacks - N/A
    });

    describe("if the transport is no longer connected", () => {
      // Events

      it("should emit no events", () => {
        const sessionListener = harness.createSessionListener();
        harness.transportWrapper.state.mockReturnValue("disconnected");
        harness.transportWrapper.emit("connect");

        expect(sessionListener.connecting.mock.calls.length).toBe(0);
        expect(sessionListener.connect.mock.calls.length).toBe(0);
        expect(sessionListener.disconnect.mock.calls.length).toBe(0);
        expect(sessionListener.feedAction.mock.calls.length).toBe(0);
        expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
        expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
        expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
        expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
        expect(sessionListener.transportError.mock.calls.length).toBe(0);
      });

      // State

      it("should update transport state to connected", () => {
        const newState = harness.getSessionState();
        newState._transportWrapperState = "connected";

        harness.transportWrapper.state.mockReturnValue("disconnected");
        harness.transportWrapper.emit("connect");

        harness.transportWrapper.state.mockReturnValue("connected");
        expect(harness.session).toHaveState(newState);
      });

      // Transport

      it("should do nothing on the transport", () => {
        harness.transportWrapper.mockClear();

        harness.transportWrapper.state.mockReturnValue("disconnected");
        harness.transportWrapper.emit("connect");

        expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
        expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
        expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
        expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
      });

      // Callbacks - N/A
    });
  });
});

describe("The transport disconnect(err) event", () => {
  // Mock a connected session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });

  describe("runs successfully", () => {
    // Events

    it("should emit disconnect(NOT_CONNECTED) and unexpectedFeedClosing/Closed for open feeds if the transport failed", () => {
      const err = new Error(
        "NOT_CONNECTED: Error message passed by the transport.",
      );
      const sessionListener = harness.createSessionListener();
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.feedOpenSuccess(feedNameArgs, {});
      harness.transportWrapper.emit("disconnect", err);

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0].length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0][0]).toBe(err);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(
        2,
      );
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][0].name(),
      ).toBe("myFeed");
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][0].args(),
      ).toEqual({
        arg: "val",
      });
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][1],
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][1].message,
      ).toBe("NOT_CONNECTED: The transport disconnected.");
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0].length).toBe(2);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0].name()).toBe(
        "myFeed",
      );
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][0].args(),
      ).toEqual({
        arg: "val",
      });
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][1],
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][1].message,
      ).toBe("NOT_CONNECTED: The transport disconnected.");
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    it("should emit disconnect(HANDSHAKE_REJECTED) for open feeds if the handshake failed", () => {
      // You need to set up a disconnected session - new harness
      harness = harnessFactory();
      harness.session.connect();
      harness.transportWrapper.emit("connecting");
      harness.transportWrapper.state.mockReturnValue("connecting");
      harness.transportWrapper.emit("connect");
      harness.transportWrapper.state.mockReturnValue("connected"); // Session will send Handshake
      harness.transportWrapper.emit(
        "message",
        JSON.stringify({
          MessageType: "HandshakeResponse",
          Success: false,
        }),
      );

      // Route the transport.disconnect(err) to a disconnect(err) event to trigger the event
      const err = harness.transportWrapper.disconnect.mock.calls[0][0];
      const sessionListener = harness.createSessionListener();
      harness.transportWrapper.emit("disconnect", err);

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0].length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(sessionListener.disconnect.mock.calls[0][0].message).toBe(
        "HANDSHAKE_REJECTED: The server rejected the handshake.",
      );
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    it("should emit disconnect() and unexpectedFeedClosing/Closed for open feeds if requested", () => {
      const sessionListener = harness.createSessionListener();
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.feedOpenSuccess(feedNameArgs, {});
      harness.transportWrapper.emit("disconnect"); // No error - requested

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0].length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(
        2,
      );
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][0].name(),
      ).toBe("myFeed");
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][0].args(),
      ).toEqual({
        arg: "val",
      });
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][1],
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][1].message,
      ).toBe("NOT_CONNECTED: The transport disconnected.");
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0].length).toBe(2);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0].name()).toBe(
        "myFeed",
      );
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][0].args(),
      ).toEqual({
        arg: "val",
      });
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][1],
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][1].message,
      ).toBe("NOT_CONNECTED: The transport disconnected.");
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should reset the session state", () => {
      // Should establish full state fist
      const newState = harness.getSessionState();
      newState._transportWrapperState = "disconnected";
      newState._handshakeComplete = false;
      newState._nextActionCallbackId = 1;
      newState._actionCallbacks = {};
      newState._feedOpenCallbacks = {};
      newState._feedData = {};
      newState._feedCloseCallbacks = {};
      harness.transportWrapper.emit("disconnect", {
        name: "ERR",
        message: "Error",
      });

      harness.transportWrapper.state.mockReturnValue("disconnected");
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should make no transport calls", () => {
      harness.transportWrapper.mockClear();
      harness.transportWrapper.emit("disconnect");
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should call action/feedOpen callbacks with error and feedClose callbacks with success", () => {
      const feedNameArgs1 = FeedNameArgs("myFeed", { arg: "val" });
      const feedNameArgs2 = FeedNameArgs("myFeed2", { arg: "val" });
      const acb = jest.fn();
      harness.session.action("MyAction", { arg: "val" }, acb);
      const focb = jest.fn();
      harness.session.feedOpen(feedNameArgs1, focb);
      harness.session.feedOpen(feedNameArgs2, () => {});
      harness.feedOpenSuccess(feedNameArgs2, {});
      const fccb = jest.fn();
      harness.session.feedClose(feedNameArgs2, fccb);
      harness.transportWrapper.emit(
        "disconnect",
        new Error("TRANSPORT_FAILURE: Message from the transport"),
      );

      expect(acb.mock.calls.length).toBe(1);
      expect(acb.mock.calls[0].length).toBe(1);
      expect(acb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(acb.mock.calls[0][0].message).toBe(
        "NOT_CONNECTED: The transport disconnected.",
      );
      expect(focb.mock.calls.length).toBe(1);
      expect(focb.mock.calls[0].length).toBe(1);
      expect(focb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(focb.mock.calls[0][0].message).toBe(
        "NOT_CONNECTED: The transport disconnected.",
      );
      expect(fccb.mock.calls.length).toBe(1);
      expect(fccb.mock.calls[0].length).toBe(0);
    });
  });
});

describe("The transport transportError(err) event", () => {
  // Mock a connected session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });

  describe("runs successfully", () => {
    // Events

    it("should emit transportError", () => {
      const err = new Error("SOME_ERROR: ...");
      const sessionListener = harness.createSessionListener();

      harness.transportWrapper.emit("transportError", err);

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(1);
      expect(sessionListener.transportError.mock.calls[0].length).toBe(1);
      expect(sessionListener.transportError.mock.calls[0][0]).toBe(err);
    });

    // State

    it("should not change the state", () => {
      const newState = harness.getSessionState();

      harness.transportWrapper.emit(
        "transportError",
        new Error("SOME_ERROR: ..."),
      );

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should make no transport calls", () => {
      harness.transportWrapper.mockClear();

      harness.transportWrapper.emit(
        "transportError",
        new Error("SOME_ERROR: ..."),
      );

      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });
});

describe("The transport message(msg) event", () => {
  // Mock a connected session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });

  it("should emit badServerMessage(err) if message is not valid JSON", () => {
    const sessionListener = harness.createSessionListener();
    harness.transportWrapper.emit("message", "junk");

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "INVALID_MESSAGE: Invalid JSON.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toBe("junk");
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].parseError,
    ).toBeInstanceOf(Error);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should emit badServerMessage(err) if message is structurally invalid", () => {
    const sessionListener = harness.createSessionListener();
    harness.transportWrapper.emit("message", "{}");

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "INVALID_MESSAGE: Schema violation.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual({});
    expect(
      check.string(
        sessionListener.badServerMessage.mock.calls[0][0].schemaViolation,
      ),
    ).toBe(true);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully", () => {
    // Events - Tested with message-specific processors that follow
    // State - Tested with message-specific processors that follow
    // Transport - Test with message-specific processors that follow
    // Callbacks - Test with message-specific processors that follow
  });
});

describe("The ViolationResponse processor", () => {
  // Mock a connected session, plus convenience setup
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });
  const msg = {
    MessageType: "ViolationResponse",
    Diagnostics: { some: "data" },
  };
  const trigger = function trigger() {
    harness.transportWrapper.emit("message", JSON.stringify(msg));
  };

  describe("can run successfully", () => {
    // Events

    it("should emit badClientMessage(diagnostics)", () => {
      const sessionListener = harness.createSessionListener();
      trigger();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(1);
      expect(sessionListener.badClientMessage.mock.calls[0].length).toBe(1);
      expect(sessionListener.badClientMessage.mock.calls[0][0]).toEqual(
        msg.Diagnostics,
      );
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should not affect state", () => {
      harness.createSessionListener(); // Otherwise the error emission is reported by Jest
      const oldState = harness.getSessionState();
      trigger();
      expect(harness.session).toHaveState(oldState);
    });

    // Transport

    it("should make no transport calls", () => {
      harness.createSessionListener(); // Otherwise the error emission is reported by Jest
      harness.transportWrapper.mockClear();
      trigger();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });
});

describe("The HandshakeResponse processor", () => {
  // Mock a disconnected session, plus convenience setup
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });
  const msgInvalid = {
    MessageType: "HandshakeResponse",
    Success: true,
    Version: "0.123",
  };
  const msgSuccess = {
    MessageType: "HandshakeResponse",
    Success: true,
    Version: "0.1",
  };
  const msgFailure = {
    MessageType: "HandshakeResponse",
    Success: false,
  };
  const connectAndSendHandshake = function connectAndSendHandshake() {
    harness.session.connect();
    harness.transportWrapper.emit("connecting");
    harness.transportWrapper.state.mockReturnValue("connecting");
    harness.transportWrapper.emit("connect");
    harness.transportWrapper.state.mockReturnValue("connected");
  };
  const receiveInvalid = function receiveSuccess() {
    harness.transportWrapper.emit("message", JSON.stringify(msgInvalid));
  };
  const receiveSuccess = function receiveSuccess() {
    harness.transportWrapper.emit("message", JSON.stringify(msgSuccess));
  };
  const receiveFailure = function receiveFailure() {
    harness.transportWrapper.emit("message", JSON.stringify(msgFailure));
  };

  it("should emit badServerMessage(err) if not expected", () => {
    harness.connectSession(); // Now it's not expected
    const sessionListener = harness.createSessionListener();
    receiveSuccess(); // Failure would be just as good

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected HandshakeResponse.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual(msgSuccess);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should emit badServerMessage(err) if specified version invalid", () => {
    connectAndSendHandshake();
    const sessionListener = harness.createSessionListener();
    receiveInvalid();

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: HandshakeResponse specified invalid version.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual(msgInvalid);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully communicating a successful handshake result", () => {
    // Events

    it("should emit connect", () => {
      connectAndSendHandshake();

      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(1);
      expect(sessionListener.connect.mock.calls[0].length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should set ._handshakeComplete", () => {
      connectAndSendHandshake();
      const newState = harness.getSessionState();
      newState._handshakeComplete = true;
      receiveSuccess();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should make no transport calls", () => {
      connectAndSendHandshake();
      harness.transportWrapper.mockClear();
      receiveSuccess();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });

  describe("can run successfully communicating a failed handshake result - transport still connected", () => {
    // Events

    it("should emit nothing", () => {
      connectAndSendHandshake();
      const sessionListener = harness.createSessionListener();
      receiveFailure();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update transport state to disconnected (other state is unmodified)", () => {
      connectAndSendHandshake();
      const newState = harness.getSessionState();
      newState._transportWrapperState = "disconnected";
      receiveFailure();
      harness.transportWrapper.state.mockReturnValue("disconnected");
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.disconnect()", () => {
      connectAndSendHandshake();

      harness.transportWrapper.mockClear();
      receiveFailure();

      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.disconnect.mock.calls[0].length).toBe(1);
      expect(
        harness.transportWrapper.disconnect.mock.calls[0][0],
      ).toBeInstanceOf(Error);
      expect(harness.transportWrapper.disconnect.mock.calls[0][0].message).toBe(
        "HANDSHAKE_REJECTED: The server rejected the handshake.",
      );
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A (never connected, so none could be registered)
  });

  describe("can run successfully communicating a failed handshake result - transport no longer connected", () => {
    // Events

    it("should emit nothing", () => {
      connectAndSendHandshake();
      const sessionListener = harness.createSessionListener();

      harness.transportWrapper.state.mockReturnValue("disconnected");
      receiveFailure();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should not change the state", () => {
      connectAndSendHandshake();

      harness.transportWrapper.state.mockReturnValue("disconnected");

      const newState = harness.getSessionState();

      receiveFailure();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      connectAndSendHandshake();

      harness.transportWrapper.mockClear();

      harness.transportWrapper.state.mockReturnValue("disconnected");
      receiveFailure();

      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A (never connected, so none could be registered)
  });
});

describe("The ActionResponse processor", () => {
  // Mock a connected session, plus convenience setup
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });
  const requestAction = function requestAction(cb = () => {}) {
    harness.session.action("myAction", { arg: "val" }, cb);
  };
  const msgSuccess = {
    MessageType: "ActionResponse",
    CallbackId: "1",
    Success: true,
    ActionData: { status: "sweet" },
  };
  const msgFailure = {
    MessageType: "ActionResponse",
    CallbackId: "1",
    Success: false,
    ErrorCode: "BANNED",
    ErrorData: {},
  };
  const receiveSuccess = function receiveSuccess() {
    harness.transportWrapper.emit("message", JSON.stringify(msgSuccess));
  };
  const receiveFailure = function receiveFailure() {
    harness.transportWrapper.emit("message", JSON.stringify(msgFailure));
  };

  it("should emit badServerMessage(err) if not expected", () => {
    const sessionListener = harness.createSessionListener();
    receiveSuccess(); // Failure would be just as good

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected ActionResponse.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual(msgSuccess);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully communicating a successful action result", () => {
    // Events

    it("should not fire any events", () => {
      requestAction();
      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // // State

    it("should delete the ._actionCallbacks entry", () => {
      requestAction();
      const newState = harness.getSessionState();
      delete newState._actionCallbacks["1"];
      receiveSuccess();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should make no transport calls", () => {
      requestAction();
      harness.transportWrapper.mockClear();
      receiveSuccess();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should call the appropriate callback with success", () => {
      const cb = jest.fn();
      requestAction(cb);
      receiveSuccess();

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(2);
      expect(cb.mock.calls[0][0]).toBeUndefined();
      expect(cb.mock.calls[0][1]).toEqual(msgSuccess.ActionData);
    });
  });

  describe("can run successfully communicating a failed action result", () => {
    // Events

    it("should not fire any events", () => {
      requestAction();
      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should delete the ._actionCallbacks entry", () => {
      requestAction();
      const newState = harness.getSessionState();
      delete newState._actionCallbacks["1"];
      receiveFailure();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should make no transport calls", () => {
      requestAction();
      harness.transportWrapper.mockClear();
      receiveFailure();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should call the appropriate callback with failure", () => {
      const cb = jest.fn();
      requestAction(cb);
      receiveFailure();

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(1);
      expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(cb.mock.calls[0][0].message).toBe(
        "REJECTED: Server rejected the action request.",
      );
      expect(cb.mock.calls[0][0].serverErrorCode).toEqual(msgFailure.ErrorCode);
      expect(cb.mock.calls[0][0].serverErrorData).toEqual(msgFailure.ErrorData);
    });
  });
});

describe("The FeedOpenResponse processor", () => {
  // Mock a connected session
  let harness;
  const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });
  const msgSuccess = {
    MessageType: "FeedOpenResponse",
    FeedName: "myFeed",
    FeedArgs: { arg: "val" },
    Success: true,
    FeedData: { some: "info" },
  };
  const msgFailure = {
    MessageType: "FeedOpenResponse",
    FeedName: "myFeed",
    FeedArgs: { arg: "val" },
    Success: false,
    ErrorCode: "BANNED",
    ErrorData: {},
  };
  const receiveSuccess = function receiveSuccess() {
    harness.transportWrapper.emit("message", JSON.stringify(msgSuccess));
  };
  const receiveFailure = function receiveFailure() {
    harness.transportWrapper.emit("message", JSON.stringify(msgFailure));
  };

  it("should emit badServerMessage(err) if not expexcted", () => {
    const sessionListener = harness.createSessionListener();
    receiveSuccess();

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected FeedOpenResponse.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual(msgSuccess);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully communicating successful FeedOpen", () => {
    // Events

    it("should not fire any events", () => {
      harness.session.feedOpen(feedNameArgs, () => {});
      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates, ._feedOpenCallbacks, and ._feedData appropriately", () => {
      harness.session.feedOpen(feedNameArgs, () => {});
      const feedSerial = feedNameArgs.serial();
      const newState = harness.getSessionState();
      newState._feedStates[feedSerial] = "open";
      newState._feedOpenCallbacks = {};
      newState._feedData[feedSerial] = { some: "info" };
      receiveSuccess();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport if desired open", () => {
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.transportWrapper.mockClear();
      receiveSuccess();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should call back appropriately with success", () => {
      const cb = jest.fn();
      harness.session.feedOpen(feedNameArgs, cb);
      receiveSuccess();

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(2);
      expect(cb.mock.calls[0][0]).toBeUndefined();
      expect(cb.mock.calls[0][1]).toEqual(msgSuccess.FeedData);
    });
  });

  describe("can run successfully communicating failed FeedOpen", () => {
    // Events

    it("should not fire any events", () => {
      harness.session.feedOpen(feedNameArgs, () => {});
      const sessionListener = harness.createSessionListener();
      receiveFailure();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates, ._feedOpenCallbacks, and ._feedData appropriately", () => {
      harness.session.feedOpen(feedNameArgs, () => {});
      const newState = harness.getSessionState();
      newState._feedStates = {};
      newState._feedOpenCallbacks = {};
      newState._feedData = {};
      receiveFailure();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.transportWrapper.mockClear();
      receiveFailure();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should call back appropriately with failure", () => {
      const cb = jest.fn();
      harness.session.feedOpen(feedNameArgs, cb);
      receiveFailure();

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(1);
      expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(cb.mock.calls[0][0].message).toBe(
        "REJECTED: Server rejected the feed open request.",
      );
      expect(cb.mock.calls[0][0].serverErrorCode).toEqual(msgFailure.ErrorCode);
      expect(cb.mock.calls[0][0].serverErrorData).toEqual(msgFailure.ErrorData);
    });
  });
});

describe("The FeedCloseResponse processor", () => {
  // Mock a connected session and an open feed
  let harness;
  const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
    harness.session.feedOpen(feedNameArgs, () => {});
    harness.feedOpenSuccess(feedNameArgs, {});
  });
  const msgSuccess = {
    MessageType: "FeedCloseResponse",
    FeedName: "myFeed",
    FeedArgs: { arg: "val" },
  };
  const receiveSuccess = function receiveSuccess() {
    harness.transportWrapper.emit("message", JSON.stringify(msgSuccess));
  };

  it("should emit badServerMessage(err) if not expected", () => {
    const sessionListener = harness.createSessionListener();
    receiveSuccess();

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected FeedCloseResponse.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual(msgSuccess);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully communicating successful FeedClose", () => {
    // Events

    it("should not fire any events", () => {
      harness.session.feedClose(feedNameArgs, () => {});
      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates and ._feedCloseCallbacks appropriately", () => {
      harness.session.feedClose(feedNameArgs, () => {});
      const newState = harness.getSessionState();
      newState._feedCloseCallbacks = {};
      newState._feedStates = {};
      receiveSuccess();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      harness.session.feedClose(feedNameArgs, () => {});
      harness.transportWrapper.mockClear();
      receiveSuccess();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should call back appropriately with success", () => {
      const cb = jest.fn();
      harness.session.feedClose(feedNameArgs, cb);
      receiveSuccess();

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(0);
    });
  });
});

describe("The FeedAction processor", () => {
  // Mock a connected session
  let harness;
  const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });
  const msg = {
    MessageType: "FeedAction",
    ActionName: "myAction",
    ActionData: { some: "info" },
    FeedName: "myFeed",
    FeedArgs: { arg: "val" },
    FeedDeltas: [{ Operation: "Set", Path: [], Value: { member: "myval" } }],
    FeedMd5: "2vD60QUu+6QYUPOIEvbbPg==",
  };
  const receiveFeedAction = function receiveFeedAction() {
    harness.transportWrapper.emit("message", JSON.stringify(msg));
  };

  it("should emit badServerMessage(err) if not expected", () => {
    const sessionListener = harness.createSessionListener();
    receiveFeedAction();

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected FeedAction.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual(msg);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should do nothing if the feed is closing (no violation)", () => {
    const sessionListener = harness.createSessionListener();
    harness.session.feedOpen(feedNameArgs, () => {});
    harness.feedOpenSuccess(feedNameArgs, {});
    harness.session.feedClose(feedNameArgs, () => {});
    receiveFeedAction();
    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should emit badServerMessage(err) and unexpectedFeedClosing(fna) if delta writing fails", () => {
    harness.session.feedOpen(feedNameArgs, () => {});
    harness.feedOpenSuccess(feedNameArgs, {});

    const sessionListener = harness.createSessionListener();
    const badMsg = _.clone(msg);
    badMsg.FeedDeltas = [
      { Operation: "Set", Path: ["nonexistent", "child"], Value: "123" },
    ];
    harness.transportWrapper.emit("message", JSON.stringify(badMsg));

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(2);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][0].name()).toBe(
      "myFeed",
    );
    expect(
      sessionListener.unexpectedFeedClosing.mock.calls[0][0].args(),
    ).toEqual({
      arg: "val",
    });
    expect(
      sessionListener.unexpectedFeedClosing.mock.calls[0][1],
    ).toBeInstanceOf(Error);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][1].message).toBe(
      "BAD_FEED_ACTION: The server passed an invalid feed delta.",
    );
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "INVALID_DELTA: Received FeedAction with contextually invalid feed delta.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual(badMsg);
    expect(
      check.string(
        sessionListener.badServerMessage.mock.calls[0][0].deltaViolation,
      ),
    ).toBe(true);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should eventually emit unexpectedFeedClosed(fna) if delta writing fails", () => {
    harness.session.feedOpen(feedNameArgs, () => {});
    harness.feedOpenSuccess(feedNameArgs, {});
    const badMsg = _.clone(msg);
    badMsg.FeedDeltas = [
      { Operation: "Set", Path: ["nonexistent", "child"], Value: "123" },
    ];
    harness.transportWrapper.emit("message", JSON.stringify(badMsg)); // Initiates feed closure

    const sessionListener = harness.createSessionListener();
    harness.transportWrapper.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedCloseResponse",
        FeedName: "myFeed",
        FeedArgs: { arg: "val" },
      }),
    );

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
    expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0].name()).toBe(
      "myFeed",
    );
    expect(
      sessionListener.unexpectedFeedClosed.mock.calls[0][0].args(),
    ).toEqual({
      arg: "val",
    });
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should emit badServerMessage(err) and unexpectedFeedClosing(fna) if MD5 verification fails", () => {
    harness.session.feedOpen(feedNameArgs, () => {});
    harness.feedOpenSuccess(feedNameArgs, {});
    const sessionListener = harness.createSessionListener();
    const badMsg = _.clone(msg);
    badMsg.FeedMd5 = "123456789012345678901234";
    harness.transportWrapper.emit("message", JSON.stringify(badMsg));

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(2);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][0].name()).toBe(
      "myFeed",
    );
    expect(
      sessionListener.unexpectedFeedClosing.mock.calls[0][0].args(),
    ).toEqual({
      arg: "val",
    });
    expect(
      sessionListener.unexpectedFeedClosing.mock.calls[0][1],
    ).toBeInstanceOf(Error);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][1].message).toBe(
      "BAD_FEED_ACTION: Hash verification failed.",
    );
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "INVALID_HASH: Feed data MD5 verification failed.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual(badMsg);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should eventually emit unexpectedFeedClosed(fna) if MD5 verification fails", () => {
    harness.session.feedOpen(feedNameArgs, () => {});
    harness.feedOpenSuccess(feedNameArgs, {});
    const badMsg = _.clone(msg);
    badMsg.FeedMd5 = "123456789012345678901234";
    harness.transportWrapper.emit("message", JSON.stringify(badMsg)); // Initiates feed closure

    const sessionListener = harness.createSessionListener();

    harness.transportWrapper.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedCloseResponse",
        FeedName: "myFeed",
        FeedArgs: { arg: "val" },
      }),
    );

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
    expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0].name()).toBe(
      "myFeed",
    );
    expect(
      sessionListener.unexpectedFeedClosed.mock.calls[0][0].args(),
    ).toEqual({
      arg: "val",
    });
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully - with MD5", () => {
    // Mock an open feed
    beforeEach(() => {
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.feedOpenSuccess(feedNameArgs, {});
    });

    // Events

    it("should emit feedAction(fna, an, ad, nd, od)", () => {
      const sessionListener = harness.createSessionListener();
      receiveFeedAction();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(1);
      expect(sessionListener.feedAction.mock.calls[0].length).toBe(5);
      expect(sessionListener.feedAction.mock.calls[0][0].name()).toBe(
        msg.FeedName,
      );
      expect(sessionListener.feedAction.mock.calls[0][0].args()).toEqual(
        msg.FeedArgs,
      );
      expect(sessionListener.feedAction.mock.calls[0][1]).toBe(msg.ActionName);
      expect(sessionListener.feedAction.mock.calls[0][2]).toEqual(
        msg.ActionData,
      );
      expect(sessionListener.feedAction.mock.calls[0][3]).toEqual({
        member: "myval",
      });
      expect(sessionListener.feedAction.mock.calls[0][4]).toEqual({});
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedData", () => {
      const feedSerial = feedNameArgs.serial();
      const newState = harness.getSessionState();
      newState._feedData[feedSerial] = { member: "myval" };
      receiveFeedAction();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      harness.transportWrapper.mockClear();
      receiveFeedAction();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });

  describe("can run successfully - without MD5", () => {
    // Mock an open feed
    beforeEach(() => {
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.feedOpenSuccess(feedNameArgs, {});
    });

    // Events

    it("should emit feedAction(fna, an, ad, nd, od)", () => {
      const sessionListener = harness.createSessionListener();

      harness.transportWrapper.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedAction",
          ActionName: "myAction",
          ActionData: { some: "info" },
          FeedName: "myFeed",
          FeedArgs: { arg: "val" },
          FeedDeltas: [
            { Operation: "Set", Path: [], Value: { member: "myval" } },
          ],
        }),
      );

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(1);
      expect(sessionListener.feedAction.mock.calls[0].length).toBe(5);
      expect(sessionListener.feedAction.mock.calls[0][0].name()).toBe(
        msg.FeedName,
      );
      expect(sessionListener.feedAction.mock.calls[0][0].args()).toEqual(
        msg.FeedArgs,
      );
      expect(sessionListener.feedAction.mock.calls[0][1]).toBe(msg.ActionName);
      expect(sessionListener.feedAction.mock.calls[0][2]).toEqual(
        msg.ActionData,
      );
      expect(sessionListener.feedAction.mock.calls[0][3]).toEqual({
        member: "myval",
      });
      expect(sessionListener.feedAction.mock.calls[0][4]).toEqual({});
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedData", () => {
      const feedSerial = feedNameArgs.serial();
      const newState = harness.getSessionState();
      newState._feedData[feedSerial] = { member: "myval" };

      harness.transportWrapper.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedAction",
          ActionName: "myAction",
          ActionData: { some: "info" },
          FeedName: "myFeed",
          FeedArgs: { arg: "val" },
          FeedDeltas: [
            { Operation: "Set", Path: [], Value: { member: "myval" } },
          ],
        }),
      );

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      harness.transportWrapper.mockClear();

      harness.transportWrapper.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedAction",
          ActionName: "myAction",
          ActionData: { some: "info" },
          FeedName: "myFeed",
          FeedArgs: { arg: "val" },
          FeedDeltas: [
            { Operation: "Set", Path: [], Value: { member: "myval" } },
          ],
        }),
      );

      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });
});

describe("The FeedTermination processor", () => {
  // Mock a connected session
  let harness;
  const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
  beforeEach(() => {
    harness = harnessFactory();
    harness.connectSession();
  });
  const msg = {
    MessageType: "FeedTermination",
    FeedName: "myFeed",
    FeedArgs: { arg: "val" },
    ErrorCode: "SOME_CODE",
    ErrorData: { some: "info" },
  };
  const receiveTermination = function receiveTermination() {
    harness.transportWrapper.emit("message", JSON.stringify(msg));
  };

  it("should emit badServerMessage(err) if not expected", () => {
    const sessionListener = harness.createSessionListener();
    receiveTermination();

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.feedAction.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error,
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected FeedTermination.",
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage,
    ).toEqual(msg);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully", () => {
    // Mock an open feed
    beforeEach(() => {
      harness.session.feedOpen(feedNameArgs, () => {});
      harness.feedOpenSuccess(feedNameArgs, {});
    });

    // Events

    it("should emit unexpectedFeedClosing and immediately Closed if the feed was open", () => {
      const sessionListener = harness.createSessionListener();
      receiveTermination();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);

      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(
        2,
      );
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][0].name(),
      ).toBe(msg.FeedName);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][0].args(),
      ).toEqual(msg.FeedArgs);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][1],
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][1].message,
      ).toBe("TERMINATED: The server terminated the feed.");
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][1].serverErrorCode,
      ).toEqual(msg.ErrorCode);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][1].serverErrorData,
      ).toEqual(msg.ErrorData);

      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0].length).toBe(2);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0].name()).toBe(
        msg.FeedName,
      );
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][0].args(),
      ).toEqual(msg.FeedArgs);
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][1],
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][1].message,
      ).toBe("TERMINATED: The server terminated the feed.");
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][1].serverErrorCode,
      ).toEqual(msg.ErrorCode);
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][1].serverErrorData,
      ).toEqual(msg.ErrorData);

      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    it("should emit nothing if the feed was closing", () => {
      harness.session.feedClose(feedNameArgs, () => {});
      const sessionListener = harness.createSessionListener();
      receiveTermination();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.feedAction.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates and ._feedData if feed was open", () => {
      const feedSerial = feedNameArgs.serial();
      const newState = harness.getSessionState();
      delete newState._feedStates[feedSerial];
      delete newState._feedData[feedSerial];
      receiveTermination();

      expect(harness.session).toHaveState(newState);
    });

    it("should update ._feedStates if feed was closing", () => {
      const feedSerial = feedNameArgs.serial();
      harness.session.feedClose(feedNameArgs, () => {});
      const newState = harness.getSessionState();
      newState._feedStates[feedSerial] = "terminated";
      receiveTermination();

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      harness.transportWrapper.mockClear();
      receiveTermination();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.destroy.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });
});

// Testing: state getters

describe("the state() function", () => {
  // Mock a session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  it("should throw if destroyed", () => {
    harness.session.destroy();
    harness.transportWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness.session.state();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should return correctly through transport connect and handshake cycle", () => {
    expect(harness.session.state()).toBe("disconnected");
    harness.transportWrapper.state.mockReturnValue("connecting");
    expect(harness.session.state()).toBe("connecting");
    harness.transportWrapper.state.mockReturnValue("connected");
    expect(harness.session.state()).toBe("connecting"); // Pre-handshake
    harness.session._handshakeComplete = true;
    expect(harness.session.state()).toBe("connected");
    harness.transportWrapper.state.mockReturnValue("disconnected");
    harness.session._handshakeComplete = false;
    expect(harness.session.state()).toBe("disconnected");
  });
});

describe("the feedState() function", () => {
  // Mock a session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  it("should throw if destroyed", () => {
    harness.session.destroy();
    harness.transportWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness.session.feedState();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should throw an error if not connected", () => {
    const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
    expect(() => {
      harness.session.feedState(feedNameArgs);
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  it("should return correctly through a feed open/terminated/close cycle", () => {
    const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
    const feedSerial = feedNameArgs.serial();
    harness.connectSession();
    expect(harness.session.feedState(feedNameArgs)).toBe("closed");
    harness.session._feedOpenCallbacks[feedSerial] = () => {};
    harness.session._feedStates[feedSerial] = "opening";
    expect(harness.session.feedState(feedNameArgs)).toBe("opening");
    delete harness.session._feedOpenCallbacks[feedSerial];
    harness.session._feedStates[feedSerial] = "open";
    harness.session._feedData[feedSerial] = {};
    expect(harness.session.feedState(feedNameArgs)).toBe("open");
    harness.session._feedStates[feedSerial] = "terminated";
    expect(harness.session.feedState(feedNameArgs)).toBe("closing");
    harness.session._feedStates[feedSerial] = "closed";
    expect(harness.session.feedState(feedNameArgs)).toBe("closed");
  });
});

describe("the feedData() function", () => {
  // Mock a session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  it("should throw if destroyed", () => {
    harness.session.destroy();
    harness.transportWrapper.destroyed.mockReturnValue(true);
    expect(() => {
      harness.session.feedData();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("should throw an error if not connected", () => {
    expect(() => {
      const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
      harness.session.feedData(feedNameArgs);
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  it("should throw/return correctly through a feed open/close cycle", () => {
    const feedNameArgs = FeedNameArgs("myFeed", { arg: "val" });
    const feedSerial = feedNameArgs.serial();
    harness.connectSession();
    expect(() => {
      harness.session.feedData(feedNameArgs);
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not open."));
    harness.session._feedOpenCallbacks[feedSerial] = () => {};
    harness.session._feedStates[feedSerial] = "opening";
    expect(() => {
      harness.session.feedData(feedNameArgs);
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not open."));
    delete harness.session._feedOpenCallbacks[feedSerial];
    harness.session._feedStates[feedSerial] = "open";
    harness.session._feedData[feedSerial] = { some: "data" };
    expect(harness.session.feedData(feedNameArgs)).toEqual({
      some: "data",
    });
    harness.session._feedCloseCallbacks[feedSerial] = () => {};
    harness.session._feedStates[feedSerial] = "closing";
    expect(() => {
      harness.session.feedData(feedNameArgs);
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not open."));
  });
});

describe("the destroyed() function", () => {
  it("should return correctly", () => {
    const harness = harnessFactory();
    expect(harness.session.destroyed()).toBe(false);
    harness.transportWrapper.destroyed.mockReturnValue(true);
    expect(harness.session.destroyed()).toBe(true);
  });
});

// Testing: internal helper functions

describe("the _feedState() helper function", () => {
  // Trivial
});
