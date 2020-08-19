import emitter from "component-emitter";
import _ from "lodash";
import check from "check-types";
import feedSerializer from "feedme-util/feedserializer";
import session from "../session";

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
    have multiple tests - for example, session.id should throw when disconnected or
    connecting and return when connected. Also test internal helper functions.

State: Session members
    ._transportWrapper (check transport state)
    ._clientId
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
            ._processActionRevelation()
            ._processFeedTermination()
        ._processTransportError()

2. State-getting functionality
    Session functions
        .state()
        .id()
        .feedState()
        .feedData()
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
  // Do not emit events async so you can check Session-level deferrals
  const t = {};
  emitter(t);
  t.connect = jest.fn();
  t.send = jest.fn();
  t.disconnect = jest.fn();
  t.state = jest.fn();
  t.state.mockReturnValue("disconnected");
  harness.transportWrapper = t;

  // Function to reset mock transport functions
  t.mockClear = function mockClear() {
    t.connect.mockClear();
    t.send.mockClear();
    t.disconnect.mockClear();
    t.state.mockClear();
  };

  // Create the session
  harness.session = session(harness.transportWrapper);

  return harness;
};

harnessProto.connectSession = async function connectSession() {
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
      ClientId: "ABC"
    })
  );
  this.transportWrapper.mockClear();

  await Promise.resolve(); // Execute queued microtasks
};

harnessProto.feedOpenSuccess = async function feedOpenSuccess(
  feedName,
  feedArgs,
  data
) {
  this.transportWrapper.emit(
    "message",
    JSON.stringify({
      MessageType: "FeedOpenResponse",
      FeedName: feedName,
      FeedArgs: feedArgs,
      Success: true,
      FeedData: data
    })
  );

  await Promise.resolve(); // Execute queued microtasks
};

harnessProto.createSessionListener = function createSessionListener() {
  const l = {
    connecting: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    actionRevelation: jest.fn(),
    unexpectedFeedClosing: jest.fn(),
    unexpectedFeedClosed: jest.fn(),
    badServerMessage: jest.fn(),
    badClientMessage: jest.fn(),
    transportError: jest.fn()
  };
  l.mockClear = function mockClear() {
    l.connecting.mock.mockClear();
    l.connect.mock.mockClear();
    l.disconnect.mock.mockClear();
    l.actionRevelation.mockClear();
    l.unexpectedFeedClosing.mockClear();
    l.unexpectedFeedClosed.mockClear();
    l.badServerMessage.mock.mockClear();
    l.badClientMessage.mock.mockClear();
    l.transportError.mock.mockClear();
  };
  this.session.on("connecting", l.connecting);
  this.session.on("connect", l.connect);
  this.session.on("disconnect", l.disconnect);
  this.session.on("actionRevelation", l.actionRevelation);
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
  state._clientId = sess._clientId;

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
        }
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
        }
      };
    }

    // Check ._clientId
    if (receivedSession._clientId !== expectedState._clientId) {
      return {
        pass: false,
        message() {
          return `expected to have ._clientId = "${expectedState._clientId}" but got "${receivedSession._clientId}"`; // prettier-ignore
        }
      };
    }

    // Check ._feedStates
    if (!_.isEqual(receivedSession._feedStates, expectedState._feedStates)) {
      return {
        pass: false,
        message() {
          return "expected ._feedStates to match, but they didn't";
        }
      };
    }

    // Check ._actionCallbacks
    if (
      !_.isEqual(
        receivedSession._actionCallbacks,
        expectedState._actionCallbacks
      )
    ) {
      return {
        pass: false,
        message() {
          return "expected ._actionCallbacks to match, but they didn't";
        }
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
        }
      };
    }

    // Check ._feedOpenCallbacks
    if (
      !_.isEqual(
        receivedSession._feedOpenCallbacks,
        expectedState._feedOpenCallbacks
      )
    ) {
      return {
        pass: false,
        message() {
          return "expected ._feedOpenCallbacks to match, but they didn't";
        }
      };
    }

    // Check ._feedData
    if (!_.isEqual(receivedSession._feedData, expectedState._feedData)) {
      return {
        pass: false,
        message() {
          return "expected ._feedData to match, but they didn't";
        }
      };
    }

    // Check ._feedCloseCallbacks
    if (
      !_.isEqual(
        receivedSession._feedCloseCallbacks,
        expectedState._feedCloseCallbacks
      )
    ) {
      return {
        pass: false,
        message() {
          return "expected ._feedCloseCallbacks to match, but they didn't";
        }
      };
    }

    // Match
    return { pass: true };
  }
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
        _clientId: null,
        _feedStates: {},
        _actionCallbacks: {},
        _nextActionCallbackId: 1,
        _feedOpenCallbacks: {},
        _feedData: {},
        _feedCloseCallbacks: {}
      });
    });

    // Transport

    it("should make no transport calls", () => {
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
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

  it("should throw an error if the transport state is not disconnected", async () => {
    await harness.connectSession();
    expect(() => {
      harness.session.connect();
    }).toThrow(new Error("INVALID_STATE: Already connecting or connected."));
  });

  describe("can return success", () => {
    // Events

    it("should emit nothing", async () => {
      const sessionListener = harness.createSessionListener();
      harness.session.connect();

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
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
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
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

    it("should emit nothing", async () => {
      const sessionListener = harness.createSessionListener();
      harness.session.disconnect();

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
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

    it("should call transport.disconnect()", () => {
      harness.transportWrapper.mockClear();
      harness.session.disconnect();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.disconnect.mock.calls[0].length).toBe(0);
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
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });

  it("should throw an error for invalid action names", () => {
    expect(() => {
      harness.session.action(undefined, {}, () => {});
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid action name."));
  });

  it("should throw an error for invalid action args", () => {
    expect(() => {
      harness.session.action("myAction", "junk", () => {});
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid action arguments object."));
  });

  it("should throw an error for non-JSON-expressible action args", () => {
    expect(() => {
      harness.session.action("myAction", { arg: undefined }, () => {});
    }).toThrow(
      new Error("INVALID_ARGUMENT: Action arguments must be JSON-expressible.")
    );
  });

  it("should throw an error for invalid callbacks", () => {
    expect(() => {
      harness.session.action("myAction", {}, []);
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid callback."));
  });

  it("should throw an error if not connected", () => {
    harness.session.disconnect();
    harness.transportWrapper.state.mockReturnValue("disconnected");
    expect(() => {
      harness.session.action("myActionName", {}, () => {});
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  describe("can return success", () => {
    // Events

    it("should emit no events", async () => {
      const sessionListener = harness.createSessionListener();
      harness.session.action("myAction", { arg: "val" }, () => {});

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
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
        JSON.parse(harness.transportWrapper.send.mock.calls[0][0])
      ).toEqual({
        MessageType: "Action",
        ActionName: "myAction",
        ActionArgs: { arg: "val" },
        CallbackId: "1"
      });
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
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });

  it("should throw an error for invalid feed names", () => {
    expect(() => {
      harness.session.feedOpen(undefined, {}, () => {});
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed name."));
  });

  it("should throw an error for invalid feed args", () => {
    expect(() => {
      harness.session.feedOpen("myFeed", "junk", () => {});
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed arguments object."));
  });

  it("should throw an error for invalid callbacks", () => {
    expect(() => {
      harness.session.feedOpen("myFeed", {}, []);
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid callback."));
  });

  it("should throw an error if not connected", () => {
    harness.session.disconnect();
    harness.transportWrapper.state.mockReturnValue("disconnected");
    expect(() => {
      harness.session.feedOpen("myFeed", {}, () => {});
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  it("should throw an error if feed is not closed", () => {
    harness.session.feedOpen("myFeed", {}, () => {});
    expect(() => {
      harness.session.feedOpen("myFeed", {}, () => {});
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not closed."));
  });

  describe("can return success", () => {
    // Events

    it("should emit no events", async () => {
      const sessionListener = harness.createSessionListener();
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates and ._feedOpenCallbacks", () => {
      const feedSerial = feedSerializer.serialize("myFeed", {
        arg: "val"
      });
      const cb = () => {};
      const newState = harness.getSessionState();
      newState._feedStates[feedSerial] = "opening";
      newState._feedOpenCallbacks[feedSerial] = cb;
      harness.session.feedOpen("myFeed", { arg: "val" }, cb);
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.send(msg)", () => {
      harness.transportWrapper.mockClear();
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.send.mock.calls[0].length).toBe(1);
      expect(
        JSON.parse(harness.transportWrapper.send.mock.calls[0][0])
      ).toEqual({
        MessageType: "FeedOpen",
        FeedName: "myFeed",
        FeedArgs: { arg: "val" }
      });
    });

    // Callbacks - N/A

    // Return value

    it("should return nothing", () => {
      expect(
        harness.session.feedOpen("myFeed", { arg: "val" }, () => {})
      ).toBeUndefined();
    });
  });
});

describe("The .feedClose() function", () => {
  // Mock a connected session
  let harness;
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });

  it("should throw an error for invalid feed names", () => {
    expect(() => {
      harness.session.feedClose(undefined, {}, () => {});
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed name."));
  });

  it("should throw an error for invalid feed args", () => {
    expect(() => {
      harness.session.feedClose("myFeed", "junk", () => {});
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed arguments object."));
  });

  it("should throw an error for invalid callbacks", () => {
    expect(() => {
      harness.session.feedClose("myFeed", {}, []);
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid callback."));
  });

  it("should throw an error if not connected", () => {
    harness.session.disconnect();
    harness.transportWrapper.state.mockReturnValue("disconnected");
    expect(() => {
      harness.session.feedClose("myFeed", {}, () => {});
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  it("should throw an error if feed is not open", () => {
    expect(() => {
      harness.session.feedClose("myFeed", {}, () => {});
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not open."));
  });

  describe("can return success", () => {
    // Events

    it("should emit no events", async () => {
      const sessionListener = harness.createSessionListener();
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
      harness.session.feedClose("myFeed", { arg: "val" }, () => {});

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates and ._feedCloseCallbacks", async () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
      const feedSerial = feedSerializer.serialize("myFeed", {
        arg: "val"
      });
      const cb = () => {};
      const newState = harness.getSessionState();
      delete newState._feedData[feedSerial];
      newState._feedStates[feedSerial] = "closing";
      newState._feedCloseCallbacks[feedSerial] = cb;
      harness.session.feedClose("myFeed", { arg: "val" }, cb);
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.send(msg)", async () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
      harness.transportWrapper.mockClear();
      harness.session.feedClose("myFeed", { arg: "val" }, () => {});
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.send.mock.calls[0].length).toBe(1);
      expect(
        JSON.parse(harness.transportWrapper.send.mock.calls[0][0])
      ).toEqual({
        MessageType: "FeedClose",
        FeedName: "myFeed",
        FeedArgs: { arg: "val" }
      });
    });

    // Callbacks - N/A

    // Return value

    it("should return nothing", async () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
      expect(
        harness.session.feedClose("myFeed", { arg: "val" }, () => {})
      ).toBeUndefined();
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

    it("should asynchronously emit connecting", async () => {
      const sessionListener = harness.createSessionListener();
      harness.transportWrapper.emit("connecting");

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(1);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
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
  });

  describe("runs successfully", () => {
    // Events

    it("should emit no events", async () => {
      const sessionListener = harness.createSessionListener();
      harness.transportWrapper.emit("connect");

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
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
      harness.transportWrapper.emit("connect");
      harness.transportWrapper.state.mockReturnValue("connected");
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.send(msg) with Handshake", async () => {
      harness.transportWrapper.mockClear();
      harness.transportWrapper.emit("connect");

      await Promise.resolve(); // Execute queued microtasks

      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.send.mock.calls[0].length).toBe(1);
      expect(
        JSON.parse(harness.transportWrapper.send.mock.calls[0][0])
      ).toEqual({
        MessageType: "Handshake",
        Versions: ["0.1"]
      });
    });

    // Callbacks - N/A
  });
});

describe("The transport disconnect(err) event", () => {
  // Mock a connected session
  let harness;
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });

  describe("runs successfully", () => {
    // Events

    it("should asynchronously emit disconnect(DISCONNECTED) and unexpectedFeedClosing/Closed for open feeds if the transport failed", async () => {
      const err = new Error(
        "DISCONNECTED: Error message passed by the transport."
      );
      const sessionListener = harness.createSessionListener();
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
      harness.transportWrapper.emit("disconnect", err);

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0].length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0][0]).toBe(err);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(
        3
      );
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0][0]).toBe(
        "myFeed"
      );
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0][1]).toEqual({
        arg: "val"
      });
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2]
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2].message
      ).toBe("DISCONNECTED: The transport disconnected.");
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0].length).toBe(3);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0]).toBe(
        "myFeed"
      );
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0][1]).toEqual({
        arg: "val"
      });
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][2]
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][2].message
      ).toBe("DISCONNECTED: The transport disconnected.");
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    it("should emit disconnect(HANDSHAKE_REJECTED) for open feeds if the handshake failed", async () => {
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
          Success: false
        })
      );

      await Promise.resolve(); // Execute queued microtasks

      // Route the transport.disconnect(err) to a disconnect(err) event to trigger the event
      const err = harness.transportWrapper.disconnect.mock.calls[0][0];
      const sessionListener = harness.createSessionListener();
      harness.transportWrapper.emit("disconnect", err);

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0].length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(sessionListener.disconnect.mock.calls[0][0].message).toBe(
        "HANDSHAKE_REJECTED: The server rejected the handshake."
      );
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    it("should emit disconnect() and unexpectedFeedClosing/Closed for open feeds if requested", async () => {
      const sessionListener = harness.createSessionListener();
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
      harness.transportWrapper.emit("disconnect"); // No error - requested

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(1);
      expect(sessionListener.disconnect.mock.calls[0].length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(
        3
      );
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0][0]).toBe(
        "myFeed"
      );
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0][1]).toEqual({
        arg: "val"
      });
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2]
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2].message
      ).toBe("DISCONNECTED: The transport disconnected.");
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0].length).toBe(3);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0]).toBe(
        "myFeed"
      );
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0][1]).toEqual({
        arg: "val"
      });
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][2]
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosed.mock.calls[0][2].message
      ).toBe("DISCONNECTED: The transport disconnected.");
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should reset the session state", async () => {
      // Should establish full state fist
      const newState = harness.getSessionState();
      newState._transportWrapperState = "disconnected";
      newState._clientId = null;
      newState._nextActionCallbackId = 1;
      newState._actionCallbacks = {};
      newState._feedOpenCallbacks = {};
      newState._feedData = {};
      newState._feedCloseCallbacks = {};
      harness.transportWrapper.emit("disconnect", {
        name: "ERR",
        message: "Error"
      });

      await Promise.resolve(); // Execute queued microtasks

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
    });

    // Callbacks

    it("should asynchronously call action/feedOpen callbacks with error and feedClose callbacks with success", async () => {
      const acb = jest.fn();
      harness.session.action("MyAction", { arg: "val" }, acb);
      const focb = jest.fn();
      harness.session.feedOpen("MyFeed", { arg: "val" }, focb);
      harness.session.feedOpen("MyFeed2", { arg: "val" }, () => {});
      await harness.feedOpenSuccess("MyFeed2", { arg: "val" }, {});
      const fccb = jest.fn();
      harness.session.feedClose("MyFeed2", { arg: "val" }, fccb);
      harness.transportWrapper.emit(
        "disconnect",
        new Error("FAILURE: Message from the transport")
      );

      expect(acb.mock.calls.length).toBe(0);
      expect(focb.mock.calls.length).toBe(0);
      expect(fccb.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(acb.mock.calls.length).toBe(1);
      expect(acb.mock.calls[0].length).toBe(1);
      expect(acb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(acb.mock.calls[0][0].message).toBe(
        "DISCONNECTED: The transport disconnected."
      );
      expect(focb.mock.calls.length).toBe(1);
      expect(focb.mock.calls[0].length).toBe(1);
      expect(focb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(focb.mock.calls[0][0].message).toBe(
        "DISCONNECTED: The transport disconnected."
      );
      expect(fccb.mock.calls.length).toBe(1);
      expect(fccb.mock.calls[0].length).toBe(0);
    });
  });
});

describe("The transport message(msg) event", () => {
  // Mock a connected session
  let harness;
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });

  it("should emit badServerMessage(err) if message is not valid JSON", async () => {
    const sessionListener = harness.createSessionListener();
    harness.transportWrapper.emit("message", "junk");

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "INVALID_MESSAGE: Invalid JSON or schema violation."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toBe("junk");
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].parseError
    ).toBeTruthy();
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should emit badServerMessage(err) if message is structurally invalid", async () => {
    const sessionListener = harness.createSessionListener();
    harness.transportWrapper.emit("message", "{}");

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "INVALID_MESSAGE: Invalid JSON or schema violation."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toEqual("{}");
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].parseError
    ).toBeTruthy();
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
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });
  const msg = {
    MessageType: "ViolationResponse",
    Diagnostics: { some: "data" }
  };
  const trigger = function trigger() {
    harness.transportWrapper.emit("message", JSON.stringify(msg));
  };

  describe("can run successfully", () => {
    // Events

    it("should asynchronously emit badClientMessage(diagnostics)", async () => {
      const sessionListener = harness.createSessionListener();
      trigger();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(1);
      expect(sessionListener.badClientMessage.mock.calls[0].length).toBe(1);
      expect(sessionListener.badClientMessage.mock.calls[0][0]).toEqual(
        msg.Diagnostics
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
  const msgSuccess = {
    MessageType: "HandshakeResponse",
    Success: true,
    Version: "0.1",
    ClientId: "abc"
  };
  const msgFailure = {
    MessageType: "HandshakeResponse",
    Success: false
  };
  const connectAndSendHandshake = async function connectAndSendHandshake() {
    harness.session.connect();
    harness.transportWrapper.emit("connecting");
    harness.transportWrapper.state.mockReturnValue("connecting");
    harness.transportWrapper.emit("connect");
    harness.transportWrapper.state.mockReturnValue("connected");

    await Promise.resolve(); // Execute queued microtasks
  };
  const receiveSuccess = function receiveSuccess() {
    harness.transportWrapper.emit("message", JSON.stringify(msgSuccess));
  };
  const receiveFailure = function receiveFailure() {
    harness.transportWrapper.emit("message", JSON.stringify(msgFailure));
  };

  it("should emit badServerMessage(err) if not expected", async () => {
    await harness.connectSession(); // Now it's not expected
    const sessionListener = harness.createSessionListener();
    receiveSuccess(); // Failure would be just as good

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected HandshakeResponse."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toEqual(msgSuccess);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully communicating a successful handshake result", () => {
    // Events

    it("should asynchronously emit connect", async () => {
      await connectAndSendHandshake();

      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(1);
      expect(sessionListener.connect.mock.calls[0].length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should set ._clientId", async () => {
      await connectAndSendHandshake();
      const newState = harness.getSessionState();
      newState._clientId = "abc";
      receiveSuccess();

      await Promise.resolve(); // Execute queued microtasks

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should make no transport calls", async () => {
      await connectAndSendHandshake();
      harness.transportWrapper.mockClear();
      receiveSuccess();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });

  describe("can run successfully communicating a failed handshake result", () => {
    // Events

    it("should emit nothing", async () => {
      await connectAndSendHandshake();
      const sessionListener = harness.createSessionListener();
      receiveFailure();

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update transport state to disconnected (other state is unmodified)", async () => {
      await connectAndSendHandshake();
      const newState = harness.getSessionState();
      newState._transportWrapperState = "disconnected";
      receiveFailure();
      harness.transportWrapper.state.mockReturnValue("disconnected");
      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should call transport.disconnect()", async () => {
      await connectAndSendHandshake();

      harness.transportWrapper.mockClear();
      receiveFailure();

      await Promise.resolve(); // Execute queued microtasks

      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(1);
      expect(harness.transportWrapper.disconnect.mock.calls[0].length).toBe(1);
      expect(
        harness.transportWrapper.disconnect.mock.calls[0][0]
      ).toBeInstanceOf(Error);
      expect(harness.transportWrapper.disconnect.mock.calls[0][0].message).toBe(
        "HANDSHAKE_REJECTED: The server rejected the handshake."
      );
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A (never connected, so none could be registered)
  });
});

describe("The ActionResponse processor", () => {
  // Mock a connected session, plus convenience setup
  let harness;
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });
  const requestAction = function requestAction(cb = () => {}) {
    harness.session.action("myAction", { arg: "val" }, cb);
  };
  const msgSuccess = {
    MessageType: "ActionResponse",
    CallbackId: "1",
    Success: true,
    ActionData: { status: "sweet" }
  };
  const msgFailure = {
    MessageType: "ActionResponse",
    CallbackId: "1",
    Success: false,
    ErrorCode: "BANNED",
    ErrorData: {}
  };
  const receiveSuccess = function receiveSuccess() {
    harness.transportWrapper.emit("message", JSON.stringify(msgSuccess));
  };
  const receiveFailure = function receiveFailure() {
    harness.transportWrapper.emit("message", JSON.stringify(msgFailure));
  };

  it("should asynchronously emit badServerMessage(err) if not expected", async () => {
    const sessionListener = harness.createSessionListener();
    receiveSuccess(); // Failure would be just as good

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected ActionResponse."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toEqual(msgSuccess);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully communicating a successful action result", () => {
    // Events

    it("should not fire any events", async () => {
      requestAction();
      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // // State

    it("should delete the ._actionCallbacks entry", async () => {
      requestAction();
      const newState = harness.getSessionState();
      delete newState._actionCallbacks["1"];
      receiveSuccess();

      await Promise.resolve(); // Execute queued microtasks

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
    });

    // Callbacks

    it("should asynchronously call the appropriate callback with success", async () => {
      const cb = jest.fn();
      requestAction(cb);
      receiveSuccess();

      expect(cb.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(2);
      expect(cb.mock.calls[0][0]).toBeUndefined();
      expect(cb.mock.calls[0][1]).toEqual(msgSuccess.ActionData);
    });
  });

  describe("can run successfully communicating a failed action result", () => {
    // Events

    it("should not fire any events", async () => {
      requestAction();
      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should delete the ._actionCallbacks entry", async () => {
      requestAction();
      const newState = harness.getSessionState();
      delete newState._actionCallbacks["1"];
      receiveFailure();

      await Promise.resolve(); // Execute queued microtasks

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
    });

    // Callbacks

    it("should asynchronously call the appropriate callback with failure", async () => {
      const cb = jest.fn();
      requestAction(cb);
      receiveFailure();

      expect(cb.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(1);
      expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(cb.mock.calls[0][0].message).toBe(
        "REJECTED: Server rejected the action request."
      );
      expect(cb.mock.calls[0][0].serverErrorCode).toEqual(msgFailure.ErrorCode);
      expect(cb.mock.calls[0][0].serverErrorData).toEqual(msgFailure.ErrorData);
    });
  });
});

describe("The FeedOpenResponse processor", () => {
  // Mock a connected session
  let harness;
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });
  const msgSuccess = {
    MessageType: "FeedOpenResponse",
    FeedName: "myFeed",
    FeedArgs: { arg: "val" },
    Success: true,
    FeedData: { some: "info" }
  };
  const msgFailure = {
    MessageType: "FeedOpenResponse",
    FeedName: "myFeed",
    FeedArgs: { arg: "val" },
    Success: false,
    ErrorCode: "BANNED",
    ErrorData: {}
  };
  const receiveSuccess = function receiveSuccess() {
    harness.transportWrapper.emit("message", JSON.stringify(msgSuccess));
  };
  const receiveFailure = function receiveFailure() {
    harness.transportWrapper.emit("message", JSON.stringify(msgFailure));
  };

  it("should emit badServerMessage(err) if not expexcted", async () => {
    const sessionListener = harness.createSessionListener();
    receiveSuccess();

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected FeedOpenResponse."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toEqual(msgSuccess);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully communicating successful FeedOpen", () => {
    // Events

    it("should not fire any events", async () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates, ._feedOpenCallbacks, and ._feedData appropriately", async () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      const feedSerial = feedSerializer.serialize("myFeed", {
        arg: "val"
      });
      const newState = harness.getSessionState();
      newState._feedStates[feedSerial] = "open";
      newState._feedOpenCallbacks = {};
      newState._feedData[feedSerial] = { some: "info" };
      receiveSuccess();

      await Promise.resolve(); // Execute queued microtasks

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport if desired open", () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      harness.transportWrapper.mockClear();
      receiveSuccess();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should asynchronously call back appropriately with success", async () => {
      const cb = jest.fn();
      harness.session.feedOpen("myFeed", { arg: "val" }, cb);
      receiveSuccess();

      expect(cb.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(2);
      expect(cb.mock.calls[0][0]).toBeUndefined();
      expect(cb.mock.calls[0][1]).toEqual(msgSuccess.FeedData);
    });
  });

  describe("can run successfully communicating failed FeedOpen", () => {
    // Events

    it("should not fire any events", async () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      const sessionListener = harness.createSessionListener();
      receiveFailure();

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates, ._feedOpenCallbacks, and ._feedData appropriately", async () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      const newState = harness.getSessionState();
      newState._feedStates = {};
      newState._feedOpenCallbacks = {};
      newState._feedData = {};
      receiveFailure();

      await Promise.resolve(); // Execute queued microtasks

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      harness.transportWrapper.mockClear();
      receiveFailure();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should asynchronously call back appropriately with failure", async () => {
      const cb = jest.fn();
      harness.session.feedOpen("myFeed", { arg: "val" }, cb);
      receiveFailure();

      expect(cb.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(1);
      expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(cb.mock.calls[0][0].message).toBe(
        "REJECTED: Server rejected the feed open request."
      );
      expect(cb.mock.calls[0][0].serverErrorCode).toEqual(msgFailure.ErrorCode);
      expect(cb.mock.calls[0][0].serverErrorData).toEqual(msgFailure.ErrorData);
    });
  });
});

describe("The FeedCloseResponse processor", () => {
  // Mock a connected session and an open feed
  let harness;
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
    harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
    await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
  });
  const msgSuccess = {
    MessageType: "FeedCloseResponse",
    FeedName: "myFeed",
    FeedArgs: { arg: "val" }
  };
  const receiveSuccess = function receiveSuccess() {
    harness.transportWrapper.emit("message", JSON.stringify(msgSuccess));
  };

  it("should emit badServerMessage(err) if not expected", async () => {
    const sessionListener = harness.createSessionListener();
    receiveSuccess();

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected FeedCloseResponse."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toEqual(msgSuccess);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully communicating successful FeedClose", () => {
    // Events

    it("should not fire any events", async () => {
      harness.session.feedClose("myFeed", { arg: "val" }, () => {});
      const sessionListener = harness.createSessionListener();
      receiveSuccess();

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates and ._feedCloseCallbacks appropriately", async () => {
      harness.session.feedClose("myFeed", { arg: "val" }, () => {});
      const newState = harness.getSessionState();
      newState._feedCloseCallbacks = {};
      newState._feedStates = {};
      receiveSuccess();

      await Promise.resolve(); // Execute queued microtasks

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      harness.session.feedClose("myFeed", { arg: "val" }, () => {});
      harness.transportWrapper.mockClear();
      receiveSuccess();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
    });

    // Callbacks

    it("should asynchronously call back appropriately with success", async () => {
      const cb = jest.fn();
      harness.session.feedClose("myFeed", { arg: "val" }, cb);
      receiveSuccess();

      expect(cb.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(cb.mock.calls.length).toBe(1);
      expect(cb.mock.calls[0].length).toBe(0);
    });
  });
});

describe("The ActionRevelation processor", () => {
  // Mock a connected session
  let harness;
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });
  const msg = {
    MessageType: "ActionRevelation",
    ActionName: "myAction",
    ActionData: { some: "info" },
    FeedName: "myFeed",
    FeedArgs: { arg: "val" },
    FeedDeltas: [{ Operation: "Set", Path: [], Value: { member: "myval" } }],
    FeedMd5: "2vD60QUu+6QYUPOIEvbbPg=="
  };
  const receiveRevelation = function receiveRevelation() {
    harness.transportWrapper.emit("message", JSON.stringify(msg));
  };

  it("should emit badServerMessage(err) if not expected", async () => {
    const sessionListener = harness.createSessionListener();
    receiveRevelation();

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected ActionRevelation."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toEqual(msg);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should do nothing if the feed is closing (no violation)", async () => {
    const sessionListener = harness.createSessionListener();
    harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
    await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
    harness.session.feedClose("myFeed", { arg: "val" }, () => {});
    receiveRevelation();
    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should emit badServerMessage(err) and unexpectedFeedClosing(fn, fa) if delta writing fails", async () => {
    harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
    await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});

    await Promise.resolve(); // Execute queued microtasks

    const sessionListener = harness.createSessionListener();
    const badMsg = _.clone(msg);
    badMsg.FeedDeltas = [
      { Operation: "Set", Path: ["nonexistent", "child"], Value: "123" }
    ];
    harness.transportWrapper.emit("message", JSON.stringify(badMsg));

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(3);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][0]).toBe(
      "myFeed"
    );
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][1]).toEqual({
      arg: "val"
    });
    expect(
      sessionListener.unexpectedFeedClosing.mock.calls[0][2]
    ).toBeInstanceOf(Error);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][2].message).toBe(
      "BAD_ACTION_REVELATION: The server passed an invalid feed delta."
    );
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "INVALID_DELTA: Received ActionRevelation with contextually invalid feed delta."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toEqual(badMsg);
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].deltaError
    ).toBeTruthy();
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should eventually emit unexpectedFeedClosed(fn, fa) if delta writing fails", async () => {
    harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
    await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
    const badMsg = _.clone(msg);
    badMsg.FeedDeltas = [
      { Operation: "Set", Path: ["nonexistent", "child"], Value: "123" }
    ];
    harness.transportWrapper.emit("message", JSON.stringify(badMsg)); // Initiates feed closure

    await Promise.resolve(); // Execute queued microtasks

    const sessionListener = harness.createSessionListener();
    harness.transportWrapper.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedCloseResponse",
        FeedName: "myFeed",
        FeedArgs: { arg: "val" }
      })
    );

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
    expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0]).toBe(
      "myFeed"
    );
    expect(sessionListener.unexpectedFeedClosed.mock.calls[0][1]).toEqual({
      arg: "val"
    });
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should emit badServerMessage(err) and unexpectedFeedClosing(fn, fa) if MD5 verification fails", async () => {
    harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
    await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
    const sessionListener = harness.createSessionListener();
    const badMsg = _.clone(msg);
    badMsg.FeedMd5 = "123456789012345678901234";
    harness.transportWrapper.emit("message", JSON.stringify(badMsg));

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(3);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][0]).toBe(
      "myFeed"
    );
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][1]).toEqual({
      arg: "val"
    });
    expect(
      sessionListener.unexpectedFeedClosing.mock.calls[0][2]
    ).toBeInstanceOf(Error);
    expect(sessionListener.unexpectedFeedClosing.mock.calls[0][2].message).toBe(
      "BAD_ACTION_REVELATION: Hash verification failed."
    );
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "INVALID_HASH: Feed data MD5 verification failed."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toEqual(badMsg);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  it("should eventually emit unexpectedFeedClosed(fn, fa) if MD5 verification fails", async () => {
    harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
    await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
    const badMsg = _.clone(msg);
    badMsg.FeedMd5 = "123456789012345678901234";
    harness.transportWrapper.emit("message", JSON.stringify(badMsg)); // Initiates feed closure

    await Promise.resolve(); // Execute queued microtasks

    const sessionListener = harness.createSessionListener();

    harness.transportWrapper.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedCloseResponse",
        FeedName: "myFeed",
        FeedArgs: { arg: "val" }
      })
    );

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
    expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0]).toBe(
      "myFeed"
    );
    expect(sessionListener.unexpectedFeedClosed.mock.calls[0][1]).toEqual({
      arg: "val"
    });
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully", () => {
    // Mock an open feed
    beforeEach(async () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
    });

    // Events

    it("should asynchronously emit action(an, ad, fn, fa, nd, od)", async () => {
      const sessionListener = harness.createSessionListener();
      receiveRevelation();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(1);
      expect(sessionListener.actionRevelation.mock.calls[0].length).toBe(6);
      expect(sessionListener.actionRevelation.mock.calls[0][0]).toBe(
        msg.FeedName
      );
      expect(sessionListener.actionRevelation.mock.calls[0][1]).toEqual(
        msg.FeedArgs
      );
      expect(sessionListener.actionRevelation.mock.calls[0][2]).toBe(
        msg.ActionName
      );
      expect(sessionListener.actionRevelation.mock.calls[0][3]).toEqual(
        msg.ActionData
      );
      expect(sessionListener.actionRevelation.mock.calls[0][4]).toEqual({
        member: "myval"
      });
      expect(sessionListener.actionRevelation.mock.calls[0][5]).toEqual({});
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedData", async () => {
      const feedSerial = feedSerializer.serialize("myFeed", {
        arg: "val"
      });
      const newState = harness.getSessionState();
      newState._feedData[feedSerial] = { member: "myval" };
      receiveRevelation();

      await Promise.resolve(); // Execute queued microtasks

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      harness.transportWrapper.mockClear();
      receiveRevelation();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });
});

describe("The FeedTermination processor", () => {
  // Mock a connected session
  let harness;
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });
  const msg = {
    MessageType: "FeedTermination",
    FeedName: "myFeed",
    FeedArgs: { arg: "val" },
    ErrorCode: "SOME_CODE",
    ErrorData: { some: "info" }
  };
  const receiveTermination = function receiveTermination() {
    harness.transportWrapper.emit("message", JSON.stringify(msg));
  };

  it("should emit badServerMessage(err) if not expected", async () => {
    const sessionListener = harness.createSessionListener();
    receiveTermination();

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0].length).toBe(1);
    expect(sessionListener.badServerMessage.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.badServerMessage.mock.calls[0][0].message).toBe(
      "UNEXPECTED_MESSAGE: Unexpected FeedTermination."
    );
    expect(
      sessionListener.badServerMessage.mock.calls[0][0].serverMessage
    ).toEqual(msg);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(0);
  });

  describe("can run successfully", () => {
    // Mock an open feed
    beforeEach(async () => {
      harness.session.feedOpen("myFeed", { arg: "val" }, () => {});
      await harness.feedOpenSuccess("myFeed", { arg: "val" }, {});
    });

    // Events

    it("should asynchronously  emit unexpectedFeedClosing and immediately Closed if the feed was open", async () => {
      const sessionListener = harness.createSessionListener();
      receiveTermination();

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0].length).toBe(
        3
      );
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0][0]).toBe(
        msg.FeedName
      );
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0][1]).toEqual(
        msg.FeedArgs
      );
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2]
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2].message
      ).toBe("TERMINATED: The server terminated the feed.");
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2].serverErrorCode
      ).toEqual(msg.ErrorCode);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2].serverErrorData
      ).toEqual(msg.ErrorData);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(1);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0].length).toBe(3);
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0][0]).toBe(
        msg.FeedName
      );
      expect(sessionListener.unexpectedFeedClosed.mock.calls[0][1]).toEqual(
        msg.FeedArgs
      );
      expect(sessionListener.unexpectedFeedClosing.mock.calls[0][1]).toEqual(
        msg.FeedArgs
      );
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2]
      ).toBeInstanceOf(Error);
      expect(
        sessionListener.unexpectedFeedClosing.mock.calls[0][2].message
      ).toBe("TERMINATED: The server terminated the feed.");
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    it("should emit nothing if the feed was closing", async () => {
      harness.session.feedClose("myFeed", { arg: "val" }, () => {});
      const sessionListener = harness.createSessionListener();
      receiveTermination();

      await Promise.resolve(); // Execute queued microtasks

      expect(sessionListener.connecting.mock.calls.length).toBe(0);
      expect(sessionListener.connect.mock.calls.length).toBe(0);
      expect(sessionListener.disconnect.mock.calls.length).toBe(0);
      expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
      expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
      expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
      expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
      expect(sessionListener.transportError.mock.calls.length).toBe(0);
    });

    // State

    it("should update ._feedStates and ._feedData if feed was open", async () => {
      const feedSerial = feedSerializer.serialize("myFeed", {
        arg: "val"
      });
      const newState = harness.getSessionState();
      delete newState._feedStates[feedSerial];
      delete newState._feedData[feedSerial];
      receiveTermination();

      await Promise.resolve(); // Execute queued microtasks

      expect(harness.session).toHaveState(newState);
    });

    it("should update ._feedStates if feed was closing", async () => {
      const feedSerial = feedSerializer.serialize("myFeed", {
        arg: "val"
      });
      harness.session.feedClose("myFeed", { arg: "val" }, () => {});
      const newState = harness.getSessionState();
      newState._feedStates[feedSerial] = "terminated";
      receiveTermination();

      await Promise.resolve(); // Execute queued microtasks

      expect(harness.session).toHaveState(newState);
    });

    // Transport

    it("should do nothing on the transport", () => {
      harness.transportWrapper.mockClear();
      receiveTermination();
      expect(harness.transportWrapper.connect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.disconnect.mock.calls.length).toBe(0);
      expect(harness.transportWrapper.send.mock.calls.length).toBe(0);
    });

    // Callbacks - N/A
  });
});

describe("The transport transportError(err) event", () => {
  // Mock a connected session
  let harness;
  beforeEach(async () => {
    harness = harnessFactory();
    await harness.connectSession();
  });

  it("should emit the transportError event", async () => {
    const sessionListener = harness.createSessionListener();
    harness.transportWrapper.emit(
      "transportError",
      new Error("SOME_ERROR: ...")
    );

    await Promise.resolve(); // Execute queued microtasks

    expect(sessionListener.connecting.mock.calls.length).toBe(0);
    expect(sessionListener.connect.mock.calls.length).toBe(0);
    expect(sessionListener.disconnect.mock.calls.length).toBe(0);
    expect(sessionListener.actionRevelation.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosing.mock.calls.length).toBe(0);
    expect(sessionListener.unexpectedFeedClosed.mock.calls.length).toBe(0);
    expect(sessionListener.badServerMessage.mock.calls.length).toBe(0);
    expect(sessionListener.badClientMessage.mock.calls.length).toBe(0);
    expect(sessionListener.transportError.mock.calls.length).toBe(1);
    expect(sessionListener.transportError.mock.calls[0].length).toBe(1);
    expect(sessionListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(sessionListener.transportError.mock.calls[0][0].message).toBe(
      "SOME_ERROR: ..."
    );
  });
});

// Testing: state getters

describe("the state() function", () => {
  // Mock a session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  it("should return correctly through transport connect and handshake cycle", () => {
    expect(harness.session.state()).toBe("disconnected");
    harness.transportWrapper.state.mockReturnValue("connecting");
    expect(harness.session.state()).toBe("connecting");
    harness.transportWrapper.state.mockReturnValue("connected");
    expect(harness.session.state()).toBe("connecting"); // Pre-handshake
    harness.session._clientId = "abcde";
    expect(harness.session.state()).toBe("connected");
    harness.transportWrapper.state.mockReturnValue("disconnected");
    harness.session._clientId = null;
    expect(harness.session.state()).toBe("disconnected");
  });
});

describe("the id() function", () => {
  it("should throw/return correctly through transport connect and handshake cycle", () => {
    const harness = harnessFactory();
    expect(() => {
      harness.session.id();
    }).toThrow(new Error("INVALID_STATE: Not connected."));
    harness.transportWrapper.state.mockReturnValue("connecting");
    expect(() => {
      harness.session.id();
    }).toThrow(new Error("INVALID_STATE: Not connected."));
    harness.transportWrapper.state.mockReturnValue("connected");
    expect(harness.session.state()).toBe("connecting"); // Pre-handshake
    expect(() => {
      harness.session.id();
    }).toThrow(new Error("INVALID_STATE: Not connected."));
    harness.session._clientId = "abcde";
    expect(harness.session.state()).toBe("connected");
    expect(harness.session.id()).toBe("abcde");
    harness.transportWrapper.state.mockReturnValue("disconnected");
    harness.session._clientId = null;
    expect(() => {
      harness.session.id();
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });
});

describe("the feedState() function", () => {
  // Mock a session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  it("should throw an error for invalid feed names", () => {
    expect(() => {
      harness.session.feedState(undefined, {});
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed name."));
  });

  it("should throw an error for invalid feed args", () => {
    expect(() => {
      harness.session.feedState("myFeed", "junk");
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed arguments object."));
  });

  it("should throw an error if not connected", () => {
    expect(() => {
      harness.session.feedState("myFeed", {});
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  it("should return correctly through a feed open/close cycle", async () => {
    const feedSerial = feedSerializer.serialize("myFeed", { arg: "val" });
    await harness.connectSession();
    expect(harness.session.feedState("myFeed", { arg: "val" })).toBe("closed");
    harness.session._feedOpenCallbacks[feedSerial] = () => {};
    harness.session._feedStates[feedSerial] = "opening";
    expect(harness.session.feedState("myFeed", { arg: "val" })).toBe("opening");
    delete harness.session._feedOpenCallbacks[feedSerial];
    harness.session._feedStates[feedSerial] = "open";
    harness.session._feedData[feedSerial] = {};
    expect(harness.session.feedState("myFeed", { arg: "val" })).toBe("open");
    harness.session._feedCloseCallbacks[feedSerial] = () => {};
    harness.session._feedStates[feedSerial] = "closing";
    expect(harness.session.feedState("myFeed", { arg: "val" })).toBe("closing");
  });
});

describe("the feedData() function", () => {
  // Mock a session
  let harness;
  beforeEach(() => {
    harness = harnessFactory();
  });

  it("should throw an error for invalid feed names", () => {
    expect(() => {
      harness.session.feedData(undefined, {});
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed name."));
  });

  it("should throw an error for invalid feed args", () => {
    expect(() => {
      harness.session.feedData("myFeed", "junk");
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed arguments object."));
  });

  it("should throw an error if not connected", () => {
    expect(() => {
      harness.session.feedData("myFeed", {});
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  it("should throw/return correctly through a feed open/close cycle", async () => {
    const feedSerial = feedSerializer.serialize("myFeed", { arg: "val" });
    await harness.connectSession();
    expect(() => {
      harness.session.feedData("myFeed", { arg: "val" });
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not open."));
    harness.session._feedOpenCallbacks[feedSerial] = () => {};
    harness.session._feedStates[feedSerial] = "opening";
    expect(() => {
      harness.session.feedData("myFeed", { arg: "val" });
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not open."));
    delete harness.session._feedOpenCallbacks[feedSerial];
    harness.session._feedStates[feedSerial] = "open";
    harness.session._feedData[feedSerial] = { some: "data" };
    expect(harness.session.feedData("myFeed", { arg: "val" })).toEqual({
      some: "data"
    });
    harness.session._feedCloseCallbacks[feedSerial] = () => {};
    harness.session._feedStates[feedSerial] = "closing";
    expect(() => {
      harness.session.feedData("myFeed", { arg: "val" });
    }).toThrow(new Error("INVALID_FEED_STATE: Feed is not open."));
  });
});

// Testing: internal helper functions

describe("the _feedState() helper function", () => {
  // Trivial
});
