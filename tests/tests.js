import emitter from "component-emitter";
import _ from "lodash";
import check from "check-types";

/* global feedmeClient */
/* eslint-disable func-names */

/*

Integration/functional tests for the library build are run on Node and in the
browser. Assume an in-scope feedmeClient() factory function.

Test API promises in the user documentation, ensure that the library
interacts appropriately with the transport, and ensure that messages
sent via the transport abide by the Feedme specification.

Deferral:

Code execution is often deferred within the library. In Node, deferrals are
done using microtasks, so multi-stage deferrals could be flushed by awaiting a
macrotask like setImmediate. But older browsers will polyfill deferrals using
something slower, so deferrals are executed using setTimeout. For browsers
where deferrals fall back on setTimeout(0), you would need DEFER_MS > 0 in order
to ensure that multi-stage deferrals are executed. For the browsers tested
in Sauce, the tests work with DEFER_MS = 0, presumably because the promise
polyfill falls back on something higher-priority than setTimeout in those
browsers. Still setting DEFER_MS > 0 to avoid any potential issues.

*/

const DEFER_MS = 1;
const realSetTimeout = setTimeout;
const defer = () =>
  new Promise(resolve => {
    realSetTimeout(resolve, DEFER_MS);
  });

// Global helper functions

const tryCatch = (fn, ...args) => {
  // Try to run a function and pass back the resultin return value or error
  try {
    return { ReturnValue: fn(...args) };
  } catch (e) {
    return { Error: e };
  }
};

const toBe = expected => ({
  // Asymmetric matcher allowing strict reference comparison in toEqual()
  asymmetricMatch(actual) {
    return actual === expected;
  }
});

const replaceErrors = (collection, processed = []) => {
  // Recursively replaces all Error objects in collection with
  //   { name, message, customProperty1, ... }
  // Enables proper evaluation of errors, including any custom properties,
  // using toEqual(), which by default only compares the message property
  // Tracks processed nodes to account for circular references in objects/errrs,
  // which exist between the client and feed objects.
  // Input is mutated in place
  if (_.includes(processed, collection)) {
    return false;
  }
  processed.push(collection);
  _.forEach(collection, (val, idx) => {
    if (val instanceof Error) {
      const err = {
        name: val.name, // Error, TypeError, etc
        message: val.message
      };
      _.keys(val).forEach(key => {
        err[key] = val[key];
      });
      collection[idx] = err; // eslint-disable-line no-param-reassign
      replaceErrors(err, processed);
    } else if (check.object(val) || check.array(val)) {
      replaceErrors(val, processed);
    }
  });
  return collection;
};

/*

The test harness tracks all external invocations made by the library, including
calls on transport methods, emissions/callbacks/settlements on the
application, calls on global timer functions, and library function exits.

The tests use the harness.trace() function to execute a code path on the library.
The method returns a trace object of the form:

trace === [
  { Phase: "Start", State: x },
  { Invocation: x, ... },
  ...
  { Phase: "DoneSync", State: x }
  { Invocation: x, ... },
  ...
  { Phase: "DoneDefer", State: x }
  { Invocation: x, ... },
  ...
  { Phase: "DoneTimers", State: x }
]

Invocation objects take the following forms. Each includes a state member
so that tests can verify the state of the library when the invocation was made.

{
  Invocation: "ExitFactory",
  State: x,
  Result: { ReturnValue: } / { Error: }  
}

{
  Invocation: "ExitClientMethod",
  State: x,
  Method: x,
  Result: { ReturnValue: } / { Error: }
}

{
  Invocation: "ExitFeedMethod",
  State: x,
  Feed: x,
  Method: x,
  Result: { ReturnValue: } / { Error: }
}

{
  Invocation: "CallTransportMethod",
  State: x
  Method: x,
  Args: [ ... ],
  Context: x
}

{
  Invocation: "EmitClientEvent",
  State: x,
  Event: x,
  Args: [ ... ],
  Context: x
}

{
  Invocation: "EmitFeedEvent",
  State: x,
  Feed: x,
  Event: x,
  Args: [ ... ],
  Context: x
}

{
  Invocation: "CallbackAction",
  State: x,
  ActionNumber: x,
  Args: [ ... ],
  Context: x
}

{
  Invocation: "ResolveAction",
  State: x,
  ActionNumber: x,
  Result: x,
  Context: x
}

{
  Invocation: "RejectAction",
  State: x,
  ActionNumber: x,
  Error: x,
  Context: x
}

{
  Invocation: "CallTimerMethod",
  State: x,
  Method: x,
  Args: [ ... ],
  Context: x
}

The library state is the return values and/or errors thrown by public state
functions and is represented using objects of the following form, where the x
are either { ReturnValue: val }  or { Error: err }:

{
  state: x,
  feeds: [
    {
      destroyed: x,
      desiredState: x,
      state: x,
      data: x
    },
    ...
  ]
}

*/

const harness = {};

harness.start = () => {
  // Initialize harness members
  // Initialize a trace array so there is somewhere to put factory function results
  // Initialize everything else when there is a call to harness.createClient()
  harness._trace = [];
  harness.clientActual = null;
  harness.clientWrapper = null;
  harness._feedActuals = null;
  harness._nextActionNumber = null;

  // Track library calls to fake timer functions
  // Restored to system functions when Jasmine uninstalls the clock
  ["setTimeout", "clearTimeout", "setInterval", "clearInterval"].forEach(
    timerFn => {
      const orig = global[timerFn];
      global[timerFn] = function(...args) {
        harness._trace.push({
          Invocation: "CallTimerMethod",
          State: harness._state(),
          Method: timerFn,
          Args: args,
          Context: this
        });
        return orig(...args); // Return timer id
      };
    }
  );
};

harness.mockTransport = () => {
  // Return a mock transport whose behavior can be manipulated by the tests
  // and that records all method calls made by the library. Initialize with
  // transport.state() returning disconnected and no implementation on other
  // transport functions
  const transport = emitter({});
  ["connect", "disconnect", "send"].forEach(method => {
    transport[`${method}Implementation`] = () => {};
    transport[method] = function(...args) {
      harness._trace.push({
        Invocation: "CallTransportMethod",
        State: harness._state(),
        Method: method,
        Args: args,
        Context: this
      });
      return transport[`${method}Implementation`](...args);
    };
  });
  transport.stateImplementation = () => "disconnected";
  transport.state = () => transport.stateImplementation();
  return transport;
};

harness.initClient = options => {
  // Try to initialize the client and record result
  try {
    harness.clientActual = feedmeClient(options);
    harness.transport = options.transport;
    harness._feedActuals = [];
    harness._nextActionNumber = 0;
    harness._trace.push({
      Invocation: "ExitFactory",
      State: harness._state(),
      Result: { ReturnValue: harness.clientActual }
    });
  } catch (e) {
    harness._trace.push({
      Invocation: "ExitFactory",
      State: harness._state(),
      Result: { Error: e }
    });
    return; // Stop
  }

  // Track client events
  [
    "connecting",
    "connect",
    "disconnect",
    "badServerMessage",
    "badClientMessage",
    "transportError"
  ].forEach(evt => {
    harness.clientActual.on(evt, function(...args) {
      harness._trace.push({
        Invocation: "EmitClientEvent",
        State: harness._state(),
        Event: evt,
        Args: args,
        Context: this
      });
    });
  });

  // Create a client wrapper for the tests to interact with
  // Tests make library method calls through the wrapper so that the method
  // exit can be tracked and so that the harness can keep track of actions and feeds
  // The wrapper only needs to present state-modifying methods
  harness.clientWrapper = {};

  // Wrap client.action() in order to track callbacks and promise settlements
  // Return an action number so that tests can differentiate between requests
  // Tests pass a truthy value to cb for callback mode and falsy for promise mode
  harness.clientWrapper.action = (an, aa, cb) => {
    const actionNumber = harness._nextActionNumber;
    harness._nextActionNumber += 1;

    // Invoke the action and track callback/settlement
    let res;
    if (cb) {
      res = tryCatch(
        harness.clientActual.action.bind(harness.clientActual),
        an,
        aa,
        function(...args) {
          harness._trace.push({
            Invocation: "CallbackAction",
            State: harness._state(),
            ActionNumber: actionNumber,
            Args: args,
            Context: this
          });
        }
      );
    } else {
      res = tryCatch(
        harness.clientActual.action.bind(harness.clientActual),
        an,
        aa
      );
      if (!res.Error) {
        res.ReturnValue.then(function(result) {
          harness._trace.push({
            Invocation: "ResolveAction",
            State: harness._state(),
            ActionNumber: actionNumber,
            Result: result,
            Context: this
          });
        }).catch(function(err) {
          harness._trace.push({
            Invocation: "RejectAction",
            State: harness._state(),
            ActionNumber: actionNumber,
            Error: err,
            Context: this
          });
        });
      }
    }

    // Record the client.action() method exit
    harness._trace.push({
      Invocation: "ExitClientMethod",
      State: harness._state(),
      Method: "action",
      Result: res
    });

    return actionNumber;
  };

  // Wrap client.feed() in order to track feed events and feed method exits
  // Return an object containing the actual feed object and a wrapper
  // Maintain an array of successfully created actual feed objects in order
  // to generate state
  harness.clientWrapper.feed = (fn, fa) => {
    // Try to create the feed
    const res = tryCatch(
      harness.clientActual.feed.bind(harness.clientActual),
      fn,
      fa
    );

    // Add the feed to state if it was created
    const feedActual = res.ReturnValue;
    if (feedActual) {
      harness._feedActuals.push(feedActual);
    }

    // Record method exit
    harness._trace.push({
      Invocation: "ExitClientMethod",
      State: harness._state(),
      Method: "feed",
      Result: res
    });

    // Don't track feed events or method exits if feed creation failed
    if (!feedActual) {
      return undefined;
    }

    // Record feed events
    ["opening", "open", "close", "action"].forEach(evt => {
      feedActual.on(evt, function(...args) {
        harness._trace.push({
          Invocation: "EmitFeedEvent",
          State: harness._state(),
          Feed: feedActual,
          Event: evt,
          Args: args,
          Context: this
        });
      });
    });

    // Create a feed wrapper to track exit of state-modifying feed methods
    const feedWrapper = {};
    ["desireOpen", "desireClosed", "destroy"].forEach(method => {
      feedWrapper[method] = (...args) => {
        const result = tryCatch(feedActual[method].bind(feedActual), ...args);
        harness._trace.push({
          Invocation: "ExitFeedMethod",
          State: harness._state(),
          Feed: feedActual,
          Method: method,
          Result: result
        });
      };
    });

    return {
      actual: feedActual,
      wrapper: feedWrapper
    };
  };

  // Wrap state-modifying client methods other than action() and feed() to track method exits
  ["connect", "disconnect"].forEach(method => {
    harness.clientWrapper[method] = (...args) => {
      const res = tryCatch(
        harness.clientActual[method].bind(harness.clientActual),
        ...args
      );
      harness._trace.push({
        Invocation: "ExitClientMethod",
        State: harness._state(),
        Method: method,
        Result: res
      });
    };
  });
};

harness.trace = async fn => {
  harness._trace = [];

  // Record starting state
  harness._trace.push({
    Phase: "Start",
    State: harness._state()
  });

  // Record synchronous results
  fn();
  harness._trace.push({
    Phase: "DoneSync",
    State: harness._state()
  });

  // Record deferred results
  await defer();
  harness._trace.push({
    Phase: "DoneDefer",
    State: harness._state()
  });

  // Record extraneous timer-initiated results - synchronous and deferred
  jasmine.clock().tick(Number.MAX_SAFE_INTEGER);
  await defer();
  harness._trace.push({
    Phase: "DoneTimers",
    State: harness._state()
  });

  return replaceErrors(harness._trace);
};

harness.end = () => {
  // Remove harness listeners on actual client/feeds
  if (harness.clientActual) {
    harness.clientActual.removeAllListeners();
    harness._feedActuals.forEach(feed => {
      feed.removeAllListeners();
    });
  }
};

harness._state = () => {
  // If the harness has not initialized the client then return null
  if (!harness.clientActual) {
    return null;
  }
  const state = {};
  state.state = tryCatch(harness.clientActual.state.bind(harness.clientActual));
  state.feeds = [];
  harness._feedActuals.forEach(feed => {
    state.feeds.push({
      destroyed: tryCatch(feed.destroyed.bind(feed)),
      desiredState: tryCatch(feed.desiredState.bind(feed)),
      state: tryCatch(feed.state.bind(feed)),
      data: tryCatch(feed.data.bind(feed))
    });
  });
  return state;
};

// Client state setup functions - assume transport mocked by the harness

harness.makeClientConnected = async () => {
  const outsideConnect = harness.transport.connectImplementation;
  const outsideSend = harness.transport.sendImplementation;

  harness.transport.connectImplementation = () => {
    harness.transport.stateImplementation = () => "connected";
    harness.transport.emit("connecting");
    harness.transport.emit("connect");
  };
  harness.transport.sendImplementation = () => {
    harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "HandshakeResponse",
        Success: true,
        Version: "0.1"
      })
    );
  };

  harness.transport.connect();

  harness.clientWrapper.connect();
  await defer();

  harness.transport.connectImplementation = outsideConnect;
  harness.transport.sendImplementation = outsideSend;
};

harness.makeOpenFeed = async (fn, fa, fd) => {
  // Only to be called when the client is connected

  const outsideSend = harness.transport.sendImplementation;

  harness.transport.sendImplementation = () => {
    harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        FeedName: fn,
        FeedArgs: fa,
        Success: true,
        FeedData: fd
      })
    );
  };

  const feed = harness.clientWrapper.feed(fn, fa);
  feed.wrapper.desireOpen();
  await defer();

  harness.transport.sendImplementation = outsideSend;
  return feed;
};

// Use fake timers and call harness start/stop functions

beforeEach(() => {
  jasmine.clock().install();
  harness.start();
});

afterEach(() => {
  harness.end();
  jasmine.clock().uninstall();
});

// Harness tests

describe("The global helper functions", () => {
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
});

describe("The testing harness", () => {
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
            message: "INVALID_ARGUMENT: Invalid options.transport."
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

    it("should record action method exits - success", async () => {
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

    it("should record action method exits - throw", async () => {
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
            message: "DISCONNECTED: The transport disconnected."
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

    it("should record timer function invocations", async () => {
      harness.initClient({ transport: harness.mockTransport() });
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
        Invocation: "CallTimerMethod",
        State: curState,
        Method: "setTimeout",
        Args: [jasmine.any(Function), jasmine.any(Number)],
        Context: undefined
      });

      expect(trace[3]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "action",
        Result: { ReturnValue: jasmine.any(Object) }
      });

      expect(trace[4]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[5]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });
    });

    it("should record timer callback-driven invocations and state changes after the test", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      harness.transport.connectImplementation = () => {
        harness.transport.stateImplementation = () => "connecting";
      };
      harness.transport.disconnectImplementation = () => {
        harness.transport.stateImplementation = () => "disconnected";
      };

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

      curState.state = { ReturnValue: "connecting" };

      expect(trace[2]).toEqual({
        Invocation: "CallTimerMethod",
        State: curState,
        Method: "setTimeout",
        Args: [jasmine.any(Function), jasmine.any(Number)],
        Context: undefined
      });

      expect(trace[3]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
        Result: { ReturnValue: undefined }
      });

      expect(trace[4]).toEqual({
        Phase: "DoneSync",
        State: curState
      });

      expect(trace[5]).toEqual({
        Phase: "DoneDefer",
        State: curState
      });

      expect(trace[6]).toEqual({
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

      expect(trace[7]).toEqual({
        Phase: "DoneTimers",
        State: curState
      });
    });
  });

  describe("state setup", () => {
    it("should establish correct state on call to harness.makeClientConnected()", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      expect(harness.clientActual.state()).toBe("disconnected");
      await harness.makeClientConnected();
      expect(harness.clientActual.state()).toBe("connected");
    });

    it("should establish correct state on call to harness.makeOpenFeed()", async () => {
      harness.initClient({ transport: harness.mockTransport() });
      await harness.makeClientConnected();
      const feed = await harness.makeOpenFeed(
        "FeedName",
        { Feed: "Args" },
        { Feed: "Data" }
      );
      expect(feed.actual.destroyed()).toBe(false);
      expect(feed.actual.desiredState()).toBe("open");
      expect(feed.actual.state()).toBe("open");
      expect(feed.actual.data()).toEqual({ Feed: "Data" });
    });
  });
});

// Module tests: Module methods

describe("The feedmeClient() factory function", () => {
  describe("invalid application behavior", () => {
    it("options argument - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient();
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
            message: "INVALID_ARGUMENT: Invalid options argument."
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

    it("options.transport argument - invalid type", async () => {});

    it("options.transport argument - invalid transport.on() type", async () => {});

    it("options.transport argument - invalid transport.connect() type", async () => {});

    it("options.transport argument - invalid transport.disconnect() type", async () => {});

    it("options.transport argument - invalid transport.send() type", async () => {});

    it("options.transport argument - invalid transport.state() type", async () => {});

    it("options.transport argument - invalid transport.state() return value - throws", async () => {});

    it("options.transport argument - invalid transport.state() return value - type", async () => {});

    it("options.transport argument - invalid transport.state() return value - value", async () => {});
  });
});

describe("The client.connect() function", () => {
  describe("invalid application behavior", () => {});
});

describe("The client.disconnect() function", () => {
  describe("invalid application behavior", () => {});
});

describe("The client.action() function", () => {
  describe("callback usage", () => {
    describe("invalid application behavior", () => {});
  });

  describe("promise usage", () => {
    describe("invalid application behavior", () => {});
  });

  describe("async/await usage", () => {
    describe("invalid application behavior", () => {});
  });
});

describe("The client.feed() function", () => {
  describe("invalid application behavior", () => {});
});

describe("The feed.desireOpen() function", () => {
  describe("invalid application behavior", () => {});
});

describe("The feed.desireClosed() function", () => {
  describe("invalid application behavior", () => {});
});

describe("The feed.destroy() function", () => {
  describe("invalid application behavior", () => {});
});

// Module tests: Dependency invocations

describe("The connection timeout setTimeout() callback", () => {});

describe("The connection retry setTimeout() callback", () => {});

describe("The action timeout setTimeout() callback", () => {});

describe("The feed open timeout setTimeout() callback", () => {});

describe("The feed reopen counter setTimeout() callback", () => {});

describe("The transport connect event", () => {
  describe("invalid transport behavior", () => {});
});

describe("The transport disconnect event", () => {
  describe("invalid transport behavior", () => {});
});

describe("The transport message event", () => {
  describe("invalid transport behavior", () => {});

  describe("Invalid message structure", () => {});

  describe("structurally valid ViolationResponse message", () => {});

  describe("structurally valid HandshakeResponse message", () => {});

  describe("structurally valid ActionResponse message", () => {});

  describe("structurally valid FeedOpenResponse message", () => {});

  describe("structurally valid FeedCloseResponse message", () => {});

  describe("structurally valid ActionRevelation message", () => {});

  describe("structurally valid FeedTermination message", () => {});
});
