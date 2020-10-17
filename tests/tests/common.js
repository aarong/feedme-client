import emitter from "component-emitter";
import _ from "lodash";
import check from "check-types";
import feedmeClientNode from "../../build";

// Use window.feedmeClient in the browser and the Node build otherwise
const feedmeClient =
  typeof window !== "undefined"
    ? window.feedmeClient // eslint-disable-line no-undef
    : feedmeClientNode;

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
application, and library function exits. Calls on global timer functions are
considered internal to the library.

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
    "badClientMessage"
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
      // Wrap callback only if function
      // Use truthy non-function to test invalid callback errors
      let actionCb = cb;
      if (check.function(cb)) {
        actionCb = function(...args) {
          harness._trace.push({
            Invocation: "CallbackAction",
            State: harness._state(),
            ActionNumber: actionNumber,
            Args: args,
            Context: this
          });
        };
      }
      res = tryCatch(
        harness.clientActual.action.bind(harness.clientActual),
        an,
        aa,
        actionCb
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

  // Record trace results
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

harness.makeClientConnectingBeforeHandshake = async () => {
  // Make the client connecting: transport connecting
  const outsideConnect = harness.transport.connectImplementation;

  harness.transport.connectImplementation = () => {
    harness.transport.stateImplementation = () => "connecting";
  };

  harness.clientWrapper.connect();

  harness.transport.emit("connecting");

  await defer();

  harness.transport.connectImplementation = outsideConnect;
};

harness.makeClientConnectingAfterHandshake = async () => {
  // Make the client connecting: transport connected but HandshakeResponse pending
  const outsideConnect = harness.transport.connectImplementation;

  harness.transport.connectImplementation = () => {
    harness.transport.stateImplementation = () => "connected";
  };

  harness.clientWrapper.connect();

  harness.transport.emit("connecting");
  harness.transport.emit("connect");

  await defer();

  harness.transport.connectImplementation = outsideConnect;
};

harness.makeClientConnected = async () => {
  const outsideConnect = harness.transport.connectImplementation;

  harness.transport.connectImplementation = () => {
    harness.transport.stateImplementation = () => "connected";
  };

  harness.clientWrapper.connect();

  harness.transport.emit("connecting");
  harness.transport.emit("connect");
  harness.transport.emit(
    "message",
    JSON.stringify({
      MessageType: "HandshakeResponse",
      Success: true,
      Version: "0.1"
    })
  );

  await defer();

  harness.transport.connectImplementation = outsideConnect;
};

harness.makeClientConnectTimeoutTransport = async () => {
  // Make a client connection attempt time out - failure to establish transport connection
  const outsideConnect = harness.transport.connectImplementation;
  const outsideDisconnect = harness.transport.disconnectImplementation;

  harness.transport.connectImplementation = () => {
    harness.transport.stateImplementation = () => "connecting";
  };

  harness.clientWrapper.connect();

  harness.transport.emit("connecting");

  await defer();

  harness.transport.disconnectImplementation = () => {
    harness.transport.stateImplementation = () => "disconnected";
  };

  jasmine.clock().tick(Number.MAX_SAFE_INTEGER);

  harness.transport.emit("disconnect", new Error("TIMEOUT: ..."));

  await defer();

  harness.transport.connectImplementation = outsideConnect;
  harness.transport.disconnectImplementation = outsideDisconnect;
};

harness.makeDesiredOpenFeed = async (fn, fa) => {
  // Only to be called when the client is disconnected
  // Purpose is to move past the deferred close event (reason change)

  const feed = harness.clientWrapper.feed(fn, fa);
  feed.wrapper.desireOpen();
  await defer();

  return feed;
};

harness.makeOpenFeed = async (fn, fa, fd) => {
  // Only to be called when the client is connected
  // Assumes the client is not already interacting with the fn/fa combo

  const feed = harness.clientWrapper.feed(fn, fa);
  feed.wrapper.desireOpen();

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

  await defer();

  return feed;
};

// Use fake timers and call harness start/stop functions
// These apply to all tests in all files

beforeEach(() => {
  jasmine.clock().install();
  harness.start();
});

afterEach(() => {
  harness.end();
  jasmine.clock().uninstall();
});

export { harness, toBe, tryCatch, replaceErrors };
