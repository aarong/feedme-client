import { tryCatch, toBe, replaceErrors, harness } from "./common";

describe("The tryCatch() function", () => {
  it("should call specified function with supplied arguments", () => {
    const fn = jasmine.createSpy();
    tryCatch(fn, "some", "args");
    expect(fn.calls.count()).toBe(1);
    expect(fn.calls.argsFor(0).length).toBe(2);
    expect(fn.calls.argsFor(0)[0]).toBe("some");
    expect(fn.calls.argsFor(0)[1]).toBe("args");
  });

  it("should return correctly on success", () => {
    expect(tryCatch(() => "retval")).toEqual({ ReturnValue: "retval" });
  });

  it("should return correctly if Error thrown", () => {
    expect(
      tryCatch(() => {
        throw new Error("SOME_ERROR");
      })
    ).toEqual({ Error: Error("SOME_ERROR") });
  });
});

describe("The toBe() asymmetrical matcher function", () => {
  it("should work as intended", () => {
    const obj1 = {};
    const obj2 = {};
    expect(obj1).toEqual(obj2);
    expect(obj1).toEqual(toBe(obj1));
    expect(obj1).not.toEqual(toBe(obj2));
  });
});

describe("The replaceErrors() function", () => {
  it("should work correctly with no circular references", () => {
    const err = new Error("SOME_ERROR");
    err.customProp = 123;
    err.nestedError = new TypeError("NESTED_ERROR");
    err.nestedError.customProp = 456;

    expect(
      replaceErrors({
        string: "string",
        number: 123,
        bool: true,
        err,
        array: [err]
      })
    ).toEqual({
      string: "string",
      number: 123,
      bool: true,
      err: {
        name: "Error",
        message: "SOME_ERROR",
        customProp: 123,
        nestedError: {
          name: "TypeError",
          message: "NESTED_ERROR",
          customProp: 456
        }
      },
      array: [
        {
          name: "Error",
          message: "SOME_ERROR",
          customProp: 123,
          nestedError: {
            name: "TypeError",
            message: "NESTED_ERROR",
            customProp: 456
          }
        }
      ]
    });
  });

  it("should work correctly with circular object/array references", () => {
    const obj = {};
    obj.circular = obj;

    obj.err = new Error("SOME_ERROR");
    obj.err.customProp = 123;

    obj.arr = [];
    obj.arr.push(obj.arr);

    expect(replaceErrors(obj)).toEqual(obj);
  });
});

describe("The harness object", () => {
  describe("invocation recording", () => {
    it("should record factory function exits - success", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({ transport: harness.mockTransport() });
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: null
      });

      const curState = {
        state: { ReturnValue: "disconnected" },
        feeds: []
      };

      expect(trace[1]).toEqual({
        Invocation: "ExitFactory",
        State: curState,
        Result: { ReturnValue: toBe(harness.clientActual) }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record factory function exits - throw", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({ transport: null });
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: null
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitFactory",
        State: curState,
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_ARGUMENT: Transport is not an object."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record transport method invocations", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      const trace = await harness.trace(() => {
        harness.clientWrapper.connect();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "CallTransportMethod",
        State: curState,
        Method: "connect",
        Args: [],
        Context: toBe(harness.transport)
      });

      expect(trace[2]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
        Result: { ReturnValue: undefined }
      });

      expect(trace[3]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[5]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record client event emissions", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        connectTimeoutMs: 0
      });
      harness.transport.connectImplementation = () => {
        harness.transport.stateImplementation = () => "connecting";
      };
      harness.clientWrapper.connect();

      const trace = await harness.trace(() => {
        harness.transport.emit("connecting");
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[2]).toEqual({
        Invocation: "EmitClientEvent",
        State: curState,
        Event: "connecting",
        Args: [],
        Context: toBe(harness.clientActual)
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record action method exits - callback-style success", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        actionTimeoutMs: 0
      });
      await harness.makeClientConnected();

      const trace = await harness.trace(() => {
        harness.clientWrapper.action(
          "ActionName",
          { Action: "Args" },
          () => {}
        );
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "CallTransportMethod",
        State: curState,
        Method: "send",
        Args: [jasmine.any(String)],
        Context: toBe(harness.transport)
      });

      expect(trace[2]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "action",
        Result: { ReturnValue: undefined }
      });

      expect(trace[3]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[5]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record action method exits - callback-style throw", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      const trace = await harness.trace(() => {
        harness.clientWrapper.action(123, { Action: "Args" }, () => {});
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "action",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_ARGUMENT: Invalid action name."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record action callbacks", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        actionTimeoutMs: 0
      });
      await harness.makeClientConnected();

      let actionCallbackId;
      harness.transport.sendImplementation = msg => {
        actionCallbackId = JSON.parse(msg).CallbackId;
      };

      const actionNumber = harness.clientWrapper.action(
        "ActionName",
        { Action: "Args" },
        () => {}
      );

      const trace = await harness.trace(() => {
        harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionResponse",
            CallbackId: actionCallbackId,
            Success: true,
            ActionData: { Action: "Data" }
          })
        );
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[2]).toEqual({
        Invocation: "CallbackAction",
        State: curState,
        ActionNumber: actionNumber,
        Args: [undefined, { Action: "Data" }],
        Context: undefined
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record action method exits - promise-style success", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        actionTimeoutMs: 0
      });
      await harness.makeClientConnected();

      const trace = await harness.trace(() => {
        harness.clientWrapper.action("ActionName", { Action: "Args" });
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "CallTransportMethod",
        State: curState,
        Method: "send",
        Args: [jasmine.any(String)],
        Context: toBe(harness.transport)
      });

      expect(trace[2]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "action",
        Result: { ReturnValue: jasmine.any(Promise) }
      });

      expect(trace[3]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[5]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record action method exits - promise-style throw", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      const trace = await harness.trace(() => {
        harness.clientWrapper.action("bad arguments");
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "action",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_ARGUMENT: Invalid action arguments object."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record action resolves", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        actionTimeoutMs: 0
      });
      await harness.makeClientConnected();

      let actionCallbackId;
      harness.transport.sendImplementation = msg => {
        actionCallbackId = JSON.parse(msg).CallbackId;
      };

      const actionNumber = harness.clientWrapper.action("ActionName", {
        Action: "Args"
      });

      const trace = await harness.trace(() => {
        harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionResponse",
            CallbackId: actionCallbackId,
            Success: true,
            ActionData: { Action: "Data" }
          })
        );
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[2]).toEqual({
        Invocation: "ResolveAction",
        State: curState,
        ActionNumber: actionNumber,
        Result: { Action: "Data" },
        Context: undefined
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record action rejects", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        actionTimeoutMs: 0
      });
      await harness.makeClientConnected();

      let actionCallbackId;
      harness.transport.sendImplementation = msg => {
        actionCallbackId = JSON.parse(msg).CallbackId;
      };

      const actionNumber = harness.clientWrapper.action("ActionName", {
        Action: "Args"
      });

      const trace = await harness.trace(() => {
        harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionResponse",
            CallbackId: actionCallbackId,
            Success: false,
            ErrorCode: "SOME_ERROR",
            ErrorData: { Error: "Data" }
          })
        );
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[2]).toEqual({
        Invocation: "RejectAction",
        State: curState,
        ActionNumber: actionNumber,
        Error: {
          name: "Error",
          message: "REJECTED: Server rejected the action request.",
          serverErrorCode: "SOME_ERROR",
          serverErrorData: { Error: "Data" }
        },
        Context: undefined
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record feed method exits - success", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      let feed;
      const trace = await harness.trace(() => {
        feed = harness.clientWrapper.feed("FeedName", { Feed: "Args" });
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;
      curState.feeds.push({
        destroyed: { ReturnValue: false },
        desiredState: { ReturnValue: "closed" },
        state: { ReturnValue: "closed" },
        data: {
          Error: {
            name: "Error",
            message: "INVALID_FEED_STATE: The feed object is not open."
          }
        }
      });

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "feed",
        Result: { ReturnValue: toBe(feed.actual) }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record feed method exits - throw", async () => {
      harness.initClient({ transport: harness.mockTransport() });

      const trace = await harness.trace(() => {
        harness.clientWrapper.feed("bad arguments");
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "feed",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_ARGUMENT: Invalid feed arguments object."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record feed event emissions", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        reconnect: false
      });
      await harness.makeClientConnected();
      const feed = await harness.makeOpenFeed(
        "FeedName",
        { Feed: "Args" },
        { Feed: "Data" }
      );

      const transportErr = new Error("FAILURE: ...");
      transportErr.customData = "transport_specific_data";

      const trace = await harness.trace(() => {
        harness.transport.stateImplementation = () => "disconnected";
        harness.transport.emit("disconnect", transportErr);
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;
      curState.state = { ReturnValue: "disconnected" };
      curState.feeds[0].state = { ReturnValue: "closed" };
      curState.feeds[0].data = {
        Error: {
          name: "Error",
          message: "INVALID_FEED_STATE: The feed object is not open."
        }
      };

      expect(trace[1]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[2]).toEqual({
        Invocation: "EmitFeedEvent",
        State: curState,
        Feed: toBe(feed.actual),
        Event: "close",
        Args: [
          {
            name: "Error",
            message: "NOT_CONNECTED: The transport disconnected."
          }
        ],
        Context: toBe(feed.actual)
      });

      expect(trace[3]).toEqual({
        Invocation: "EmitClientEvent",
        State: curState,
        Event: "disconnect",
        Args: [
          {
            name: "Error",
            message: "FAILURE: ...",
            customData: "transport_specific_data"
          }
        ],
        Context: toBe(harness.clientActual)
      });

      expect(trace[4]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[5]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record feed object method exits - success", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      const feed = harness.clientWrapper.feed("FeedName", { Feed: "Args" });

      const trace = await harness.trace(() => {
        feed.wrapper.destroy();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      curState.feeds[0].destroyed = { ReturnValue: true };
      curState.feeds[0].desiredState = {
        Error: {
          name: "Error",
          message: "DESTROYED: The feed object has been destroyed."
        }
      };
      curState.feeds[0].state = {
        Error: {
          name: "Error",
          message: "DESTROYED: The feed object has been destroyed."
        }
      };
      curState.feeds[0].data = {
        Error: {
          name: "Error",
          message: "DESTROYED: The feed object has been destroyed."
        }
      };

      expect(trace[1]).toEqual({
        Invocation: "ExitFeedMethod",
        State: curState,
        Feed: toBe(feed.actual),
        Method: "destroy",
        Result: { ReturnValue: undefined }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record feed object method exits - throw", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      const feed = harness.clientWrapper.feed("FeedName", { Feed: "Args" });
      feed.wrapper.destroy();

      const trace = await harness.trace(() => {
        feed.wrapper.destroy();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitFeedMethod",
        State: curState,
        Feed: toBe(feed.actual),
        Method: "destroy",
        Result: {
          Error: {
            name: "Error",
            message: "DESTROYED: The feed object has been destroyed."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record client method exits other than action/feed - success", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      const trace = await harness.trace(() => {
        harness.clientWrapper.connect();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "CallTransportMethod",
        State: curState,
        Method: "connect",
        Args: [],
        Context: toBe(harness.transport)
      });

      expect(trace[2]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
        Result: { ReturnValue: undefined }
      });

      expect(trace[3]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[5]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record client method exits other than action/feed - throw", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      const trace = await harness.trace(() => {
        harness.clientWrapper.disconnect();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "disconnect",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_STATE: Already disconnected."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });

    it("should record timer-driven invocations and state changes after the test", async () => {
      const mockTransport = harness.mockTransport();
      harness.initClient({ transport: mockTransport });
      harness.transport.connectImplementation = () => {
        harness.transport.stateImplementation = () => "connecting";
      };
      harness.transport.disconnectImplementation = () => {
        harness.transport.stateImplementation = () => "disconnected";
      };

      harness.clientWrapper.connect();

      const trace = await harness.trace(() => {
        mockTransport.emit("connecting");
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[2]).toEqual({
        Invocation: "EmitClientEvent",
        State: curState,
        Event: "connecting",
        Args: [],
        Context: toBe(harness.clientActual)
      });

      expect(trace[3]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[4]).toEqual({
        Invocation: "CallTransportMethod",
        State: curState,
        Method: "disconnect",
        Args: [
          {
            name: "Error",
            message: "TIMEOUT: The connection attempt timed out."
          }
        ],
        Context: toBe(harness.transport)
      });

      curState.state = { ReturnValue: "disconnected" };

      expect(trace[5]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });
  });

  describe("state setup", () => {
    it("should establish correct state on call to harness.makeClientConnectingBeforeHandshake()", async () => {
      const mockTransport = harness.mockTransport();
      harness.initClient({
        transport: mockTransport,
        connectTimeoutMs: 0
      });

      await harness.makeClientConnectingBeforeHandshake();

      expect(harness.clientActual.state()).toBe("connecting");
      expect(mockTransport.state()).toBe("connecting");
    });

    it("should establish correct state on call to harness.makeClientConnectingAfterHandshake()", async () => {
      const mockTransport = harness.mockTransport();
      harness.initClient({
        transport: mockTransport,
        connectTimeoutMs: 0
      });

      await harness.makeClientConnectingAfterHandshake();

      expect(harness.clientActual.state()).toBe("connecting");
      expect(mockTransport.state()).toBe("connected");
    });

    it("should establish correct state on call to harness.makeClientConnected()", async () => {
      const mockTransport = harness.mockTransport();
      harness.initClient({
        transport: mockTransport,
        connectTimeoutMs: 0
      });

      await harness.makeClientConnected();

      expect(harness.clientActual.state()).toBe("connected");
      expect(mockTransport.state()).toBe("connected");
    });

    it("should establish correct state on call to harness.makeOpenFeed()", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        feedTimeoutMs: 0
      });
      await harness.makeClientConnected();

      const feed = await harness.makeOpenFeed(
        "FeedName",
        { Feed: "Args" },
        { Feed: "Data" }
      );

      expect(feed.actual.state()).toBe("open");
      expect(feed.actual.data()).toEqual({ Feed: "Data" });
    });
  });
});
