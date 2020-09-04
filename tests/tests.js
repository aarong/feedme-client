import emitter from "component-emitter";
import delayOrig from "delay"; // eslint-disable-line import/no-extraneous-dependencies

/* global feedmeClient */

// Delay must use real timers, not fake timers
const delay = delayOrig.createWithTimers({ clearTimeout, setTimeout });

/*

Integration/functional tests for the built library are run on Node and in the
browser. Assume an in-scope feedmeClient() factory function.

Tests API promises in the user documentation, ensures that the library
interacts appropriately with the transport, and ensures that messages
sent via the transport abide by the Feedme spec.

1. Do configuration options work as documented?
2. Do app-initiated operations work as documented?
3. Do transport-initiated operations work as documented?

-- TESTING DEFERRED CODE --

Lots of code execution is deferred within the library. Events are deferred at
the Session and Client levels and callbacks/promises always return
asynchronously. There can be multiple stages of internal deferral: for example,
when the transport emits a connecting event, it is deferred once by the session
and then again by the client before reaching the application. All deferred code
needs to be flushed throughout the tests in order to properly evaluate library
behavior.

In Node, deferrals are done using microtasks, so multi-stage deferrals could
be flushed by awaiting a macrotask like setImmediate. But older browsers will
polyfill deferrals using something else, so deferraks are fkysged using
setTimeout (via the delay module, which exposes it as a promise) with a delay
of DEFER_MS.

For browsers where deferrals fall back on setTimeout(0), you would need
DEFER_MS > 0 in order to ensure that multi-stage deferrals are flushed. But
for the browsers that I test in Sauce, the tests work with DEFER_MS = 0,
presumably because the promise polyfill falls back on something higher-priority
than setTimeout in those browsers. Still setting DEFER_MS > 0 to avoid any
potential issues.

*/

const DEFER_MS = 1;

/*

-- DEFERRAL STRATEGY --

The main test suite is designed so that all deferred code (events, callbacks,
promise settlements) is allowed to run before the tests continue. It is
essential to run through all deferred behavior in order to properly verify
library functionality.

In order to accomplish this, the mock transport's emit() function is overlaid
with an async function that returns after all deferred code has been run, which
flushes events, callbacks, and promise settlement to the tests. Many tests
therefore  do not need to explicitly account for deferral, they just do:

  await transport.emit("something"); // All side effects have occurred after this

You need to explicitly run deferred code for events, callbacks, and promise
settlements that are not triggered by a transport event. For these cases the
tests contain an explicit:

  await delay(DEFER_MS);

There are only a few cases in which this is necessary:

1. For events triggered by application calls to the library, not transport emissions
      - feed.desireOpen() emits deferred open event
      - feed.desireClosed() emits deferred close event

2. For callback and promise settlement triggered within the library:
      - client.action() callback/settlement triggered by timeout

3. To flush events that are not relevant to the test in question before creating
   a listener object

*/

const harnessProto = {};

const harnessFactory = options => {
  // Mock transport is added to any other specified options
  options = options || {}; // eslint-disable-line no-param-reassign
  const harness = Object.create(harnessProto);

  // Create the transport basics
  const t = emitter({});
  harness.transport = t;
  options.transport = t; // eslint-disable-line no-param-reassign

  // Substitute the emit function with an async version that only returns
  // after all deferred code has been executed
  const emitSync = t.emit.bind(t);
  t.emit = async (...args) => {
    emitSync(...args);
    await delay(DEFER_MS);
  };

  // Transport spies
  t.connect = jasmine.createSpy();
  t.send = jasmine.createSpy();
  t.disconnect = jasmine.createSpy();
  t.state = jasmine.createSpy();
  t.state.and.returnValue("disconnected");
  t.spyClear = () => {
    t.connect.calls.reset();
    t.send.calls.reset();
    t.disconnect.calls.reset();
    t.state.calls.reset();
  };

  // Create the client
  harness.client = feedmeClient(options);

  return harness;
};

harnessProto.createClientListener = function createClientListener() {
  const l = {
    connecting: jasmine.createSpy(),
    connect: jasmine.createSpy(),
    disconnect: jasmine.createSpy(),
    badServerMessage: jasmine.createSpy(),
    badClientMessage: jasmine.createSpy(),
    transportError: jasmine.createSpy()
  };
  l.spyClear = () => {
    l.connecting.calls.reset();
    l.connect.calls.reset();
    l.disconnect.calls.reset();
    l.badServerMessage.calls.reset();
    l.badClientMessage.calls.reset();
    l.transportError.calls.reset();
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
    opening: jasmine.createSpy(),
    open: jasmine.createSpy(),
    close: jasmine.createSpy(),
    action: jasmine.createSpy()
  };
  l.spyClear = () => {
    l.opening.calls.reset();
    l.open.calls.reset();
    l.close.calls.reset();
    l.action.calls.reset();
  };
  feed.on("opening", l.opening);
  feed.on("open", l.open);
  feed.on("close", l.close);
  feed.on("action", l.action);
  return l;
};

harnessProto.connectClient = async function connectClient() {
  this.client.connect();
  this.transport.state.and.returnValue("connecting");
  await this.transport.emit("connecting");
  this.transport.state.and.returnValue("connected");
  await this.transport.emit("connect");

  await this.transport.emit(
    "message",
    JSON.stringify({
      MessageType: "HandshakeResponse",
      Success: true,
      Version: "0.1"
    })
  );

  this.transport.spyClear();
};

/*

Configuration tests and associated functionality.
Ensure that initialization options behave as documented.

*/

describe("The connectTimeoutMs option", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  it("if synchronously connecting and connectTimeoutMs greater than zero, should time out appropriately - transport is connecting on timeout", async () => {
    const opts = {
      connectTimeoutMs: 1000
    };
    const harness = harnessFactory(opts);
    const clientListener = harness.createClientListener();

    // Begin connection attempt
    harness.transport.connect.and.callFake(() => {
      harness.transport.state.and.returnValue("connecting");
    });
    harness.client.connect();
    await harness.transport.emit("connecting");

    // Advance to immediately before the timeout and verify that
    // transport.disconnect() was not called
    harness.transport.spyClear();
    jasmine.clock().tick(opts.connectTimeoutMs - 1);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    expect(harness.transport.state.calls.count()).toBe(0);

    harness.transport.disconnect.and.callFake(() => {
      harness.transport.state.and.returnValue("disconnected");
    });

    // Advance to immediately after the timeout and ensure that
    // transport.disconnect() was called
    harness.transport.spyClear();
    jasmine.clock().tick(1);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(1);
    for (let i = 0; i < harness.transport.state.calls.count(); i += 1) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }

    // Emit transport disconnect and check the client disconnect event
    clientListener.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    await harness.transport.emit("disconnect", new Error("TIMEOUT: ..."));

    expect(clientListener.connecting.calls.count()).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(1);
    expect(clientListener.disconnect.calls.argsFor(0).length).toBe(1);
    expect(clientListener.disconnect.calls.argsFor(0)[0]).toEqual(
      jasmine.any(Error)
    );
    expect(clientListener.disconnect.calls.argsFor(0)[0].message).toBe(
      "TIMEOUT: ..."
    );
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(0);
  });

  it("if synchronously connecting and connectTimeoutMs greater than zero, should time out appropriately - transport is disconnected on timeout", async () => {
    const opts = {
      connectTimeoutMs: 1000
    };
    const harness = harnessFactory(opts);

    // Begin connection attempt
    harness.transport.connect.and.callFake(() => {
      harness.transport.state.and.returnValue("connecting");
    });
    harness.client.connect();
    await harness.transport.emit("connecting");

    // Advance to immediately before the timeout and verify that
    // transport.disconnect() was not called
    harness.transport.spyClear();
    jasmine.clock().tick(opts.connectTimeoutMs - 1);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    expect(harness.transport.state.calls.count()).toBe(0);

    harness.transport.state.and.returnValue("disconnected"); // Event not yet received

    // Advance to immediately after the timeout and ensure that
    // transport.disconnect() was not called
    harness.transport.spyClear();
    jasmine.clock().tick(1);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (let i = 0; i < harness.transport.state.calls.count(); i += 1) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }
  });

  it("if synchronously connecting and connectTimeoutMs is  zero, should never time out", async () => {
    const opts = {
      connectTimeoutMs: 0
    };
    const harness = harnessFactory(opts);
    const clientListener = harness.createClientListener();

    // Begin connection attempt
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    await harness.transport.emit("connecting");

    // Advance to the end of time and verify that transport.disconnect() was not called
    harness.transport.spyClear();
    jasmine.clock().tick(Number.MAX_SAFE_INTEGER);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    expect(harness.transport.state.calls.count()).toBe(0);

    // Ensure that the disconnect event was not emitted
    clientListener.spyClear();
    expect(clientListener.connecting.calls.count()).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(0);
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(0);
  });

  it("if synchronously connected, should never time out", async () => {
    const opts = {
      connectTimeoutMs: 0
    };
    const harness = harnessFactory(opts);
    const clientListener = harness.createClientListener();

    // Transport synchronously becomes connected
    harness.transport.connect.and.callFake(() => {
      harness.transport.state.and.returnValue("connected");
    });

    // Begin connection attempt
    harness.client.connect();

    // Advance to the end of time and verify that transport.disconnect() was not called
    harness.transport.spyClear();
    jasmine.clock().tick(Number.MAX_SAFE_INTEGER);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    expect(harness.transport.state.calls.count()).toBe(0);

    // Ensure that the disconnect event was not emitted
    clientListener.spyClear();
    expect(clientListener.connecting.calls.count()).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(0);
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(0);
  });

  it("if synchronously disconnected, should never time out", async () => {
    const opts = {
      connectTimeoutMs: 0
    };
    const harness = harnessFactory(opts);
    const clientListener = harness.createClientListener();

    // Transport synchronously becomes disconnected
    harness.transport.connect.and.callFake(() => {
      harness.transport.state.and.returnValue("disconnected");
    });

    // Begin connection attempt
    harness.client.connect();

    // Advance to the end of time and verify that transport.disconnect() was not called
    harness.transport.spyClear();
    jasmine.clock().tick(Number.MAX_SAFE_INTEGER);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    expect(harness.transport.state.calls.count()).toBe(0);

    // Ensure that the disconnect event was not emitted
    clientListener.spyClear();
    expect(clientListener.connecting.calls.count()).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(0);
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(0);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The connectRetryMs option", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  it("if greater than zero, should wait appropriately between connection retries", async () => {
    const opts = {
      connectRetryMs: 1000
    };
    const harness = harnessFactory(opts);
    const clientListener = harness.createClientListener();

    // Begin connection attempt and have it fail
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    await harness.transport.emit("connecting");
    harness.transport.state.and.returnValue("disconnected");
    await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    // Advance to immediately before the retry and verify that
    // transport.connect() was not called
    harness.transport.spyClear();
    jasmine.clock().tick(opts.connectRetryMs - 1);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    expect(harness.transport.state.calls.count()).toBe(0);

    // Advance to immediately after the retry and ensure that
    // transport.connect() was called
    harness.transport.spyClear();
    jasmine.clock().tick(1);
    expect(harness.transport.connect.calls.count()).toBe(1);
    expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (let i = 0; i < harness.transport.state.calls.count(); i += 1) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }

    // Emit transport connecting and check the client connecting event
    clientListener.spyClear();
    harness.transport.state.and.returnValue("connecting");
    await harness.transport.emit("connecting");

    expect(clientListener.connecting.calls.count()).toBe(1);
    expect(clientListener.connecting.calls.argsFor(0).length).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(0);
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(0);
  });

  it("if zero, should immediately attempt a connection retry", async () => {
    const opts = {
      connectRetryMs: 0
    };
    const harness = harnessFactory(opts);
    const clientListener = harness.createClientListener();

    // Begin connection attempt
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    await harness.transport.emit("connecting");

    // Have the connection attempt fail, and verify that there is an
    // immediate call to transport.connect()
    harness.transport.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    jasmine.clock().tick(0); // The retry is async

    expect(harness.transport.connect.calls.count()).toBe(1);
    expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (let i = 0; i < harness.transport.state.calls.count(); i += 1) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }

    // Emit transport connecting and check the client connecting event
    clientListener.spyClear();
    harness.transport.state.and.returnValue("connecting");
    await harness.transport.emit("connecting");

    expect(clientListener.connecting.calls.count()).toBe(1);
    expect(clientListener.connecting.calls.argsFor(0).length).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(0);
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(0);
  });

  it("if less than zero, should not attempt a connection retry", async () => {
    const opts = {
      connectRetryMs: -1
    };
    const harness = harnessFactory(opts);
    const clientListener = harness.createClientListener();

    // Begin connection attempt
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    await harness.transport.emit("connecting");

    // Have the connection attempt fail and verify that there is no subsequent
    // call to transport.connect()
    harness.transport.spyClear();
    clientListener.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    jasmine.clock().tick(Number.MAX_SAFE_INTEGER);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (let i = 0; i < harness.transport.state.calls.count(); i += 1) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }
  });

  it("should not attempt a reconnect on HANDSHAKE_REJECTED failure", async () => {
    const opts = {
      connectRetryMs: 1000
    };
    const harness = harnessFactory(opts);

    // Connect the transport
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    await harness.transport.emit("connecting");
    harness.transport.state.and.returnValue("connected");
    await harness.transport.emit("connect");

    harness.transport.disconnect.and.callFake(() => {
      harness.transport.state.and.returnValue("disconnected");
    });

    // Have the trensport reject the handshake and verify that there is
    // a subsequent call to transport.disconnect(err) and no call to
    // transport.connect()
    harness.transport.spyClear();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "HandshakeResponse",
        Success: false
      })
    );

    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(1);
    expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(1);
    expect(harness.transport.disconnect.calls.argsFor(0)[0]).toEqual(
      jasmine.any(Error)
    );
    expect(harness.transport.disconnect.calls.argsFor(0)[0].message).toBe(
      "HANDSHAKE_REJECTED: The server rejected the handshake."
    );
    for (let i = 0; i <= harness.transport.state.calls.count(); i += 1) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }

    // Emit transport disconnect, advance forever, and check that
    // transport.connect() is never called
    harness.transport.spyClear();

    await harness.transport.emit(
      "disconnect",
      new Error("HANDSHAKE_REJECTED: The server rejected the handshake.")
    );

    jasmine.clock().tick(Number.MAX_SAFE_INTEGER);

    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (let i = 0; i <= harness.transport.state.calls.count(); i += 1) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The connectRetryBackoffMs and connectRetryMaxMs options", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  it("should back off as configured", async () => {
    const opts = {
      connectRetryMs: 1000,
      connectRetryBackoffMs: 1000,
      connectRetryMaxMs: 5000
    };
    const harness = harnessFactory(opts);

    // Run a bunch of retries
    harness.client.connect();
    for (let i = 0; i < 10; i += 1) {
      // How long should it wait?
      const ms = Math.min(
        opts.connectRetryMs + i * opts.connectRetryBackoffMs,
        opts.connectRetryMaxMs
      );

      // Begin connection attempt and have it fail
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting"); // eslint-disable-line no-await-in-loop
      harness.transport.state.and.returnValue("disconnected");
      await harness.transport.emit("disconnect", new Error("FAILURE: ...")); // eslint-disable-line no-await-in-loop

      // Advance to immediately before the retry and verify that
      // transport.connect() was not called
      harness.transport.spyClear();
      jasmine.clock().tick(ms - 1);
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count()).toBe(0);

      // Advance to immediately after the retry and ensure that
      // transport.connect() was called
      harness.transport.spyClear();
      jasmine.clock().tick(1);
      expect(harness.transport.connect.calls.count()).toBe(1);
      expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      for (let j = 0; j < harness.transport.state.calls.count(); j += 1) {
        expect(harness.transport.state.calls.argsFor(j).length).toBe(0);
      }
    }
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The connectRetryMaxAttempts option", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  it("if greater than zero, should stop connection retries as configured", async () => {
    const opts = {
      connectRetryMs: 0,
      connectRetryBackoffMs: 0,
      connectRetryMaxAttempts: 10
    };
    const harness = harnessFactory(opts);

    // Run a bunch of retries
    harness.client.connect();
    for (let i = 0; i <= opts.connectRetryMaxAttempts; i += 1) {
      // Begin connection attempt and have it fail
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting"); // eslint-disable-line no-await-in-loop
      harness.transport.state.and.returnValue("disconnected");
      await harness.transport.emit("disconnect", new Error("FAILURE: ...")); // eslint-disable-line no-await-in-loop

      // Advance to immediately after the retry and ensure that
      // transport.connect() was called if fewer than max retries and
      // not called otherwise
      harness.transport.spyClear();
      jasmine.clock().tick(0); // runs in timeout

      if (i < opts.connectRetryMaxAttempts) {
        expect(harness.transport.connect.calls.count()).toBe(1);
        expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
      } else {
        expect(harness.transport.connect.calls.count()).toBe(0);
      }
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      for (let j = 0; j < harness.transport.state.calls.count(); j += 1) {
        expect(harness.transport.state.calls.argsFor(j).length).toBe(0);
      }
    }
  });

  it("if zero, should always make connection retries", async () => {
    const opts = {
      connectRetryMs: 0,
      connectRetryBackoffMs: 0,
      connectRetryMaxAttempts: 0
    };
    const harness = harnessFactory(opts);

    // Run a bunch of retries
    harness.client.connect();
    for (let i = 0; i <= 10; i += 1) {
      // Begin connection attempt and have it fail
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting"); // eslint-disable-line no-await-in-loop
      harness.transport.state.and.returnValue("disconnected");
      await harness.transport.emit("disconnect", new Error("FAILURE: ...")); // eslint-disable-line no-await-in-loop

      // Advance to immediately after the retry and ensure that
      // transport.connect() was called
      harness.transport.spyClear();
      jasmine.clock().tick(0); // Connection retry uses timeout

      expect(harness.transport.connect.calls.count()).toBe(1);
      expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      for (let j = 0; j < harness.transport.state.calls.count(); j += 1) {
        expect(harness.transport.state.calls.argsFor(j).length).toBe(0);
      }
    }
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The actionTimeoutMs option", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  it("if greater than zero, should timeout as configured", async () => {
    const opts = {
      actionTimeoutMs: 1000
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Invoke the action
    const cb = jasmine.createSpy();
    harness.client.action("SomeAction", { Some: "Args" }, cb);

    // Advance to immediately before the timeout
    jasmine.clock().tick(opts.actionTimeoutMs - 1);

    await delay(DEFER_MS); // Flush callbacks

    expect(cb.calls.count()).toBe(0);

    // Advance to the timeout
    jasmine.clock().tick(1);

    await delay(DEFER_MS); // Flush callbacks

    expect(cb.calls.count()).toBe(1);
    expect(cb.calls.argsFor(0).length).toBe(1);
    expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
    expect(cb.calls.argsFor(0)[0].message).toBe(
      "TIMEOUT: The server did not respond within the allocated time."
    );
  });

  it("if zero, should never timeout", async () => {
    const opts = {
      actionTimeoutMs: 0
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Invoke the action
    const cb = jasmine.createSpy();
    harness.client.action("SomeAction", { Some: "Args" }, cb);

    // Advance to the end of time and ensure no callbacks
    jasmine.clock().tick(Number.MAX_SAFE_INTEGER);
    expect(cb.calls.count()).toBe(0);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The feedTimeoutMs option", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  it("if greater than zero, should timeout as configured", async () => {
    const opts = {
      feedTimeoutMs: 1000
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Ask to open the feed
    const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();

    await delay(DEFER_MS); // Flush events

    // Advance to immediately before the timeout and ensure that no events have fired
    const feedListener = harness.createFeedListener(feed);

    jasmine.clock().tick(opts.feedTimeoutMs - 1);

    await delay(DEFER_MS); // Get events

    expect(feedListener.opening.calls.count()).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);

    // Advance to immediately after the timeout and ensure that close was fired
    jasmine.clock().tick(1);

    await delay(DEFER_MS); // Get events

    expect(feedListener.opening.calls.count()).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(1);
    expect(feedListener.close.calls.argsFor(0).length).toBe(1);
    expect(feedListener.close.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
    expect(feedListener.close.calls.argsFor(0)[0].message).toBe(
      "TIMEOUT: The server did not respond to feed open request within the allocated time."
    );
    expect(feedListener.action.calls.count()).toBe(0);
  });

  it("if zero, should never timeout", async () => {
    const opts = {
      feedTimeoutMs: 0
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Ask to open the feed
    const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();

    // Advance to the end of time and ensure that no events have fired
    const feedListener = harness.createFeedListener(feed);
    jasmine.clock().tick(Math.MAX_SAFE_INTEGER);
    expect(feedListener.opening.calls.count()).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The reconnect option", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  it("if true, should reconnect if the connection fails", async () => {
    const opts = {
      reconnect: true
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Disconnect the transport and ensure that transport.connect() is called
    harness.transport.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    expect(harness.transport.connect.calls.count()).toBe(1);
    expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (let i = 0; i < harness.transport.state.calls.count(); i += 1) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }
  });

  it("if false, should not reconnect if the connection fails", async () => {
    const opts = {
      reconnect: false
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Disconnect the transport and ensure that transport.connect() is not called
    harness.transport.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    await harness.transport.emit("disconnect", new Error("FAILURE: ..."));
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (let i = 0; i < harness.transport.state.calls.count(); i += 1) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The reopenMaxAttempts and reopenTrailingMs options", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  it("if reopenMaxAttempts is negative, should always try to re-open the feed", async () => {
    const opts = {
      reopenMaxAttempts: -1
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Open the feed
    const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        Success: true,
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" },
        FeedData: {}
      })
    );

    await delay(DEFER_MS); // Flush events

    const feedListener = harness.createFeedListener(feed);
    for (let i = 0; i < 5; i += 1) {
      feedListener.spyClear();

      // Transmit a bad action revelation; the session will ask to close the feed
      // eslint-disable-next-line no-await-in-loop
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionRevelation",
          ActionName: "SomeAction",
          ActionData: {},
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Args" },
          FeedDeltas: [{ Path: [], Operation: "Delete" }]
        })
      );

      // Check that the feed is re-opened on success
      // eslint-disable-next-line no-await-in-loop
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedCloseResponse",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Args" }
        })
      );

      expect(feedListener.opening.calls.count()).toBe(1);
      expect(feedListener.opening.calls.argsFor(0).length).toBe(0);
      expect(feedListener.open.calls.count()).toBe(0);
      expect(feedListener.close.calls.count()).toBe(1);
      expect(feedListener.close.calls.argsFor(0).length).toBe(1);
      expect(feedListener.close.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(feedListener.close.calls.argsFor(0)[0].message).toBe(
        "BAD_ACTION_REVELATION: The server passed an invalid feed delta."
      );
      expect(feedListener.action.calls.count()).toBe(0);

      // Successfully re-open the feed
      // eslint-disable-next-line no-await-in-loop
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Args" },
          FeedData: {}
        })
      );
    }
  });

  it("if reopenMaxAttempts is zero, should not try to re-open the feed", async () => {
    const opts = {
      reopenMaxAttempts: 0
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Open the feed
    const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        Success: true,
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" },
        FeedData: {}
      })
    );

    const feedListener = harness.createFeedListener(feed);

    // Transmit a bad action revelation; the session will ask to close the feed
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "ActionRevelation",
        ActionName: "SomeAction",
        ActionData: {},
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" },
        FeedDeltas: [{ Path: [], Operation: "Delete" }]
      })
    );

    // Check that the feed is not re-opened on success
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedCloseResponse",
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" }
      })
    );

    expect(feedListener.opening.calls.count()).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(1);
    expect(feedListener.close.calls.argsFor(0).length).toBe(1);
    expect(feedListener.close.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
    expect(feedListener.close.calls.argsFor(0)[0].message).toBe(
      "BAD_ACTION_REVELATION: The server passed an invalid feed delta."
    );
    expect(feedListener.action.calls.count()).toBe(0);
  });

  it("if reopenMaxAttempts is positive and reopenTrailingMs is positive, should respect that limit", async () => {
    const opts = {
      reopenMaxAttempts: 5,
      reopenTrailingMs: 1000
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Open the feed
    const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        Success: true,
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" },
        FeedData: {}
      })
    );

    // Have the feed fail reopenMaxAttempts times
    const feedListener = harness.createFeedListener(feed);
    for (let i = 0; i < opts.reopenMaxAttempts; i += 1) {
      // Transmit a bad action revelation; the session will ask to close the feed
      // eslint-disable-next-line no-await-in-loop
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionRevelation",
          ActionName: "SomeAction",
          ActionData: {},
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Args" },
          FeedDeltas: [{ Path: [], Operation: "Delete" }]
        })
      );

      // Check that the feed is re-opened on success
      feedListener.spyClear();
      // eslint-disable-next-line no-await-in-loop
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedCloseResponse",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Args" }
        })
      );

      expect(feedListener.opening.calls.count()).toBe(1);
      expect(feedListener.opening.calls.argsFor(0).length).toBe(0);
      expect(feedListener.open.calls.count()).toBe(0);
      expect(feedListener.close.calls.count()).toBe(0);
      expect(feedListener.action.calls.count()).toBe(0);

      // Successfully re-open the feed
      // eslint-disable-next-line no-await-in-loop
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Args" },
          FeedData: {}
        })
      );
    }

    // Transmit a final bad action revelation; the session will ask to close the feed
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "ActionRevelation",
        ActionName: "SomeAction",
        ActionData: {},
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" },
        FeedDeltas: [{ Path: [], Operation: "Delete" }]
      })
    );

    // Check that the feed is NOT re-opened on success
    feedListener.spyClear();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedCloseResponse",
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" }
      })
    );

    expect(feedListener.opening.calls.count()).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);

    // Advance reopenTrailingMs and ensure the feed is reopened
    feedListener.spyClear();

    jasmine.clock().tick(opts.reopenTrailingMs);

    await delay(DEFER_MS); // Flush events

    expect(feedListener.opening.calls.count()).toBe(1);
    expect(feedListener.opening.calls.argsFor(0).length).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);
  });

  it("if reopenMaxAttempts is positive and reopenTrailingMs is zero, should respect that limit over the duration of the connection", async () => {
    const opts = {
      reopenMaxAttempts: 5,
      reopenTrailingMs: 0
    };
    const harness = harnessFactory(opts);
    await harness.connectClient();

    // Open the feed
    const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        Success: true,
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" },
        FeedData: {}
      })
    );

    // Have the feed fail reopenMaxAttempts times
    const feedListener = harness.createFeedListener(feed);
    for (let i = 0; i < opts.reopenMaxAttempts; i += 1) {
      // Transmit a bad action revelation; the session will ask to close the feed
      // eslint-disable-next-line no-await-in-loop
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionRevelation",
          ActionName: "SomeAction",
          ActionData: {},
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Args" },
          FeedDeltas: [{ Path: [], Operation: "Delete" }]
        })
      );

      // Check that the feed is re-opened on success
      feedListener.spyClear();
      // eslint-disable-next-line no-await-in-loop
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedCloseResponse",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Args" }
        })
      );

      expect(feedListener.opening.calls.count()).toBe(1);
      expect(feedListener.opening.calls.argsFor(0).length).toBe(0);
      expect(feedListener.open.calls.count()).toBe(0);
      expect(feedListener.close.calls.count()).toBe(0);
      expect(feedListener.action.calls.count()).toBe(0);

      // Successfully re-open the feed
      // eslint-disable-next-line no-await-in-loop
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Args" },
          FeedData: {}
        })
      );
    }

    // Transmit a final bad action revelation; the session will ask to close the feed
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "ActionRevelation",
        ActionName: "SomeAction",
        ActionData: {},
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" },
        FeedDeltas: [{ Path: [], Operation: "Delete" }]
      })
    );

    // Check that the feed is NOT re-opened on success
    feedListener.spyClear();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedCloseResponse",
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" }
      })
    );

    expect(feedListener.opening.calls.count()).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);

    // Run all timers and make sure the feed is not reopened
    feedListener.spyClear();
    jasmine.clock().tick(Math.MAX_SAFE_INTEGER);

    expect(feedListener.opening.calls.count()).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);

    // Disconnect and reconnect and make sure the feed is reopened
    harness.transport.disconnect.and.callFake(() => {
      harness.transport.state.and.returnValue("disconnected");
    });
    harness.client.disconnect();
    await harness.transport.emit("disconnect");

    feedListener.spyClear();
    await harness.connectClient();

    expect(feedListener.opening.calls.count()).toBe(1);
    expect(feedListener.opening.calls.argsFor(0).length).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

/*

App-initiated operations.

Includes all client and feed functions except for basic state-retrieving
functions (listed below). Tested only under the default configuration.

Each app-initiated operation has a group of tests that check all the way through
to conclusion, emulating any direct transport responses.

For each operation, check
  - Error and return values
  - Client and feed state function return values/errors
      client.state()
      feed.desiredState()
      feed.state()
      feed.data()
  - Client and feed events
  - Transport calls
  - Callbacks

*/

describe("The client.connect() function", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  // Errors and return values

  describe("throw and return", () => {
    it("should throw if connecting", async () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      expect(() => {
        harness.client.connect();
      }).toThrow(new Error("INVALID_STATE: Already connecting or connected."));
    });

    it("should throw if connected", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      expect(() => {
        harness.client.connect();
      }).toThrow(new Error("INVALID_STATE: Already connecting or connected."));
    });

    it("should return nothing on success", () => {
      const harness = harnessFactory();
      expect(harness.client.connect()).toBeUndefined();
    });
  });

  // Client and feed state functions

  describe("client and feed state function effects", () => {
    it("should work correctly through a successful connection cycle", async () => {
      // Create a disconnected client and feed objects
      const harness = harnessFactory();
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });

      // Check all state functions
      expect(harness.client.state()).toBe("disconnected");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Call client.connect() and have the transport emit connecting
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");

      // Check all state functions
      expect(harness.client.state()).toBe("connecting");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Have the transport emit connect and emit a successful handshake response
      // so that the client becomes connected
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect");
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "HandshakeResponse",
          Success: true,
          Version: "0.1"
        })
      );

      // Check all state functions
      expect(harness.client.state()).toBe("connected");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("opening");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Have the transport return success to feed open request
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );

      // Check all state functions
      expect(harness.client.state()).toBe("connected");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("open");
      expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    describe("should work correctly through a failing connection cycle", () => {
      let harness;
      let feedWantedOpen;
      let feedWantedClosed;
      const connectTimeoutMs = 1000;
      beforeEach(async () => {
        // Create a connecting client and two feeds
        harness = harnessFactory({ connectTimeoutMs });
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        harness.transport.connect.and.callFake(() => {
          harness.transport.state.and.returnValue("connecting");
        });
        harness.client.connect();
        await harness.transport.emit("connecting");
      });

      it("if due to timeout, should update appropriately", async () => {
        harness.transport.disconnect.and.callFake(() => {
          harness.transport.state.and.returnValue("disconnected");
        });

        // Trigger the timeout
        jasmine.clock().tick(connectTimeoutMs);

        // The client will disconnect the transport
        await harness.transport.emit(
          "disconnect",
          harness.transport.disconnect.calls.argsFor(0)[0]
        );

        // Check all state functions
        expect(harness.client.state()).toBe("disconnected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(() => {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("if due to app call to client.disconnect(), should update appropriately", async () => {
        // Have the client disconnect
        harness.transport.disconnect.and.callFake(() => {
          harness.transport.state.and.returnValue("disconnected");
        });
        harness.client.disconnect();
        await harness.transport.emit("disconnect"); // Requested

        // Check all state functions
        expect(harness.client.state()).toBe("disconnected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(() => {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("if due to transport internal failure, should update appropriately", async () => {
        // Have the transport disconnect
        harness.transport.state.and.returnValue("disconnected");
        await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

        // Check all state functions
        expect(harness.client.state()).toBe("disconnected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(() => {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("if due to handshake rejection, should update appropriately", async () => {
        // Have the transport connect and emit a handshake failure
        harness.transport.state.and.returnValue("connected");
        await harness.transport.emit("connect");

        harness.transport.disconnect.and.callFake(() => {
          harness.transport.state.and.returnValue("disconnected");
        });

        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: false
          })
        ); // The client will disconnect the transport

        await harness.transport.emit(
          "disconnect",
          harness.transport.disconnect.calls.argsFor(0)[0]
        );

        // Check all state functions
        expect(harness.client.state()).toBe("disconnected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(() => {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });
    });
  });

  // Client and feed events

  describe("client and feed event effects", () => {
    it("should work correctly through a successful connection cycle", async () => {
      // Create a disconnected client and feed objects
      const harness = harnessFactory();
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });

      await delay(DEFER_MS); // Flush events

      // Create listeners
      const clientListener = harness.createClientListener();
      const feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      const feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Call client.connect() and have the transport emit connecting
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");

      // Check all client and feed events
      expect(clientListener.connecting.calls.count()).toBe(1);
      expect(clientListener.connecting.calls.argsFor(0).length).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(0);
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
      expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
      expect(feedWantedOpenListener.open.calls.count()).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(0);
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);

      // Reset listeners
      clientListener.spyClear();
      feedWantedOpenListener.spyClear();
      feedWantedClosedListener.spyClear();

      // Have the transport emit connect and emit a successful handshake response
      // so that the client becomes connected
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect");
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "HandshakeResponse",
          Success: true,
          Version: "0.1"
        })
      );

      // Check all client and feed events
      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(1);
      expect(clientListener.connect.calls.argsFor(0).length).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(0);
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
      expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
      expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(0);
      expect(feedWantedOpenListener.open.calls.count()).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(0);
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);

      // Reset listeners
      clientListener.spyClear();
      feedWantedOpenListener.spyClear();
      feedWantedClosedListener.spyClear();

      // Have the transport return success to feed open request
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );

      // Check all client and feed events
      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(0);
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
      expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
      expect(feedWantedOpenListener.open.calls.count(1)).toBe(1);
      expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
      expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
        Feed: "Data"
      });
      expect(feedWantedOpenListener.close.calls.count()).toBe(0);
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);
    });

    describe("should work correctly through a failing connection cycle", () => {
      let harness;
      let feedWantedOpen;
      let feedWantedClosed;
      const connectTimeoutMs = 1000;
      beforeEach(async () => {
        // Create a connecting client and two feeds
        harness = harnessFactory({ connectTimeoutMs });
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        harness.transport.connect.and.callFake(() => {
          harness.transport.state.and.returnValue("connecting");
        });
        harness.client.connect();
        await harness.transport.emit("connecting");
      });

      it("if due to timeout, should update appropriately", async () => {
        // Create listeners
        const clientListener = harness.createClientListener();
        const feedWantedOpenListener = harness.createFeedListener(
          feedWantedOpen
        );
        const feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        harness.transport.disconnect.and.callFake(() => {
          harness.transport.state.and.returnValue("disconnected");
        });

        // Trigger the timeout
        jasmine.clock().tick(connectTimeoutMs);

        await harness.transport.emit(
          "disconnect",
          harness.transport.disconnect.calls.argsFor(0)[0]
        );

        // Check all client and feed events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(1);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(1);
        expect(clientListener.disconnect.calls.argsFor(0)[0]).toEqual(
          jasmine.any(Error)
        );
        expect(clientListener.disconnect.calls.argsFor(0)[0].message).toBe(
          harness.transport.disconnect.calls.argsFor(0)[0].message
        );
        expect(clientListener.badServerMessage.calls.count()).toBe(0);
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);
        expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });

      it("if due to app call to client.disconnect(), should update appropriately", async () => {
        // Create listeners
        const clientListener = harness.createClientListener();
        const feedWantedOpenListener = harness.createFeedListener(
          feedWantedOpen
        );
        const feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the client disconnect
        harness.transport.disconnect.and.callFake(() => {
          harness.transport.state.and.returnValue("disconnected");
        });
        harness.client.disconnect();
        await harness.transport.emit("disconnect");

        // Check all client and feed events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(1);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0);
        expect(clientListener.badServerMessage.calls.count()).toBe(0);
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);
        expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });

      it("if due to transport internal failure, should update appropriately", async () => {
        // Create listeners
        const clientListener = harness.createClientListener();
        const feedWantedOpenListener = harness.createFeedListener(
          feedWantedOpen
        );
        const feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the transport disconnect
        harness.transport.state.and.returnValue("disconnected");
        await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

        // Check all client and feed events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(1);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(1);
        expect(clientListener.disconnect.calls.argsFor(0)[0]).toEqual(
          jasmine.any(Error)
        );
        expect(clientListener.disconnect.calls.argsFor(0)[0].message).toBe(
          "FAILURE: ..."
        );
        expect(clientListener.badServerMessage.calls.count()).toBe(0);
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);
        expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });

      it("if due to handshake rejection, should update appropriately", async () => {
        // Have the transport connect
        harness.transport.state.and.returnValue("connected");
        await harness.transport.emit("connect");

        // Create listeners
        const clientListener = harness.createClientListener();
        const feedWantedOpenListener = harness.createFeedListener(
          feedWantedOpen
        );
        const feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Change transport state to disconnected on call to disconnect()
        harness.transport.disconnect.and.callFake(() => {
          harness.transport.state.and.returnValue("disconnected");
        });

        // Emit a handshake failure - client will disconnect transport
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: false
          })
        );

        // Transport will emit disconnect
        await harness.transport.emit(
          "disconnect",
          harness.transport.disconnect.calls.argsFor(0)[0]
        );

        // Check all client and feed events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(1);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(1);
        expect(clientListener.disconnect.calls.argsFor(0)[0]).toEqual(
          jasmine.any(Error)
        );
        expect(clientListener.disconnect.calls.argsFor(0)[0].message).toBe(
          "HANDSHAKE_REJECTED: The server rejected the handshake."
        );
        expect(clientListener.badServerMessage.calls.count()).toBe(0);
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);
        expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });
    });
  });

  // Transport calls

  describe("transport calls", () => {
    describe("should work correctly through a successful connection cycle", () => {
      it("if a feed is desired open, make appropriate transport calls", async () => {
        // Create a disconnected client and feed objects
        const harness = harnessFactory();
        const feedWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedWantedOpen.desireOpen();
        harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });

        // Call client.connect()
        harness.client.connect();

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(1);
        expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport emit connecting
        harness.transport.state.and.returnValue("connecting");
        await harness.transport.emit("connecting");

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport emit connect
        harness.transport.state.and.returnValue("connected");
        await harness.transport.emit("connect");

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(1);
        expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
        expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
          JSON.stringify({
            MessageType: "Handshake",
            Versions: ["0.1"]
          })
        );
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport emit a successful handshake response
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: true,
            Version: "0.1"
          })
        );

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(1);
        expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
        expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
          JSON.stringify({
            MessageType: "FeedOpen",
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" }
          })
        );
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // // Have the transport return success to feed open request
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: true,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedData: { Feed: "Data" }
          })
        );

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });

      it("if no feeds are desired open, make appropriate transport calls", async () => {
        // Create a disconnected client and feed objects
        const harness = harnessFactory();
        harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });

        // Call client.connect()
        harness.client.connect();

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(1);
        expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport emit connecting
        harness.transport.state.and.returnValue("connecting");
        await harness.transport.emit("connecting");

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport emit connect
        harness.transport.state.and.returnValue("connected");
        await harness.transport.emit("connect");

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(1);
        expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
        expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
          JSON.stringify({
            MessageType: "Handshake",
            Versions: ["0.1"]
          })
        );
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport emit a successful handshake response
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: true,
            Version: "0.1"
          })
        );

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });
    });

    describe("should work correctly through a failing connection cycle", () => {
      let harness;
      let feedWantedOpen;
      const connectTimeoutMs = 1000;
      beforeEach(async () => {
        // Create a connecting client and two feeds
        harness = harnessFactory({ connectTimeoutMs });
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        harness.transport.connect.and.callFake(() => {
          harness.transport.state.and.returnValue("connecting");
        });
        harness.client.connect();
        await harness.transport.emit("connecting");
      });

      it("if due to timeout, should be appropriate", () => {
        // Reset transport spies
        harness.transport.spyClear();

        harness.transport.disconnect.and.callFake(() => {
          harness.transport.state.and.returnValue("disconnected");
        });

        // Trigger the timeout
        jasmine.clock().tick(connectTimeoutMs);

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(1);
        expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(1);
        expect(harness.transport.disconnect.calls.argsFor(0)[0]).toEqual(
          jasmine.any(Error)
        );
        expect(harness.transport.disconnect.calls.argsFor(0)[0].message).toBe(
          "TIMEOUT: The connection attempt timed out."
        );
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Connection retries are tested alongside configuration
      });

      it("if due to app call to client.disconnect(), should be appropriate", async () => {
        // Reset transport spies
        harness.transport.spyClear();

        // Have the client disconnect
        harness.transport.disconnect.and.callFake(() => {
          harness.transport.state.and.returnValue("disconnected");
        });
        harness.client.disconnect();
        await harness.transport.emit("disconnect"); // Requested

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(1);
        expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(0); // Requested
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Connection retries are tested alongside configuration
      });

      it("if due to transport internal failure, should be appropriate", async () => {
        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport disconnect
        harness.transport.state.and.returnValue("disconnected");
        await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Connection retries are tested alongside configuration
      });

      it("if due to inability to send Handshake message, should be appropriate", async () => {
        // Reset transport spies
        harness.transport.spyClear();

        // Client sees transport disconnected state during connect event
        harness.transport.state.and.returnValue("disconnected");
        await harness.transport.emit("connect");

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });

      it("if due to handshake rejection and transport still connected, should be appropriate", async () => {
        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport connect so the client submits a handshake
        harness.transport.state.and.returnValue("connected");
        await harness.transport.emit("connect");

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(1);
        expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
        expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
          JSON.stringify({
            MessageType: "Handshake",
            Versions: ["0.1"]
          })
        );
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        harness.transport.disconnect.and.callFake(() => {
          harness.transport.state.and.returnValue("disconnected");
        });

        // Have the transport handshake failure
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: false
          })
        ); // The client will call transport.disconnect()

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(1);
        expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(1);
        expect(harness.transport.disconnect.calls.argsFor(0)[0]).toEqual(
          jasmine.any(Error)
        );
        expect(harness.transport.disconnect.calls.argsFor(0)[0].message).toBe(
          "HANDSHAKE_REJECTED: The server rejected the handshake."
        );
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Absence of connection retry are tested alongside configuration
      });

      it("if due to handshake rejection and transport no longer connected, should be appropriate", async () => {
        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport connect so the client submits a handshake
        harness.transport.state.and.returnValue("connected");
        await harness.transport.emit("connect");

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(1);
        expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
        expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
          JSON.stringify({
            MessageType: "Handshake",
            Versions: ["0.1"]
          })
        );
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // Transport disconnected but disconnect event not emitted
        harness.transport.state.and.returnValue("disconnected");

        // Have the transport handshake failure
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: false
          })
        ); // The client will call transport.disconnect()

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });
    });
  });

  // Callbacks - N/A

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The client.disconnect() function", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  // Errors and return values

  describe("throw and return", () => {
    it("should throw if disconnected", () => {
      const harness = harnessFactory();
      expect(() => {
        harness.client.disconnect();
      }).toThrow(new Error("INVALID_STATE: Already disconnected."));
    });

    it("should return void if not disconnected", async () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      expect(harness.client.disconnect()).toBeUndefined();
    });
  });

  // Client and feed state functions

  describe("client and feed state function effects", () => {
    it("should work correctly if called while transport connecting", async () => {
      // Create a disconnected client and two feeds
      const harness = harnessFactory();
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });

      // Put the client in a connecting state
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");

      // Check all state functions
      expect(harness.client.state()).toBe("connecting");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Call disconnect and have the transport emit disconnect
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check all state functions
      expect(harness.client.state()).toBe("disconnected");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    it("should work correctly if called while awaiting handshake response", async () => {
      // Create a disconnected client and two feeds
      const harness = harnessFactory();
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });

      // Get the client so it is awaiting a handshake response
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect"); // Transport will send Handshake message

      // Check all state functions
      expect(harness.client.state()).toBe("connecting");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Call disconnect and have the transport emit disconnect
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check all state functions
      expect(harness.client.state()).toBe("disconnected");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    it("should work correctly if called while while client is connected", async () => {
      // Create a connected client and two feeds
      const harness = harnessFactory();
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });
      await harness.connectClient();

      // Check all state functions
      expect(harness.client.state()).toBe("connected");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("opening");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Call disconnect and have the transport emit disconnect
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check all state functions
      expect(harness.client.state()).toBe("disconnected");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });
  });

  // Client and feed events

  describe("client and feed event effects", () => {
    it("should work correctly if called while transport connecting", async () => {
      // Create a disconnected client and two feeds
      const harness = harnessFactory();
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });

      // Put the client in a connecting state
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");

      // Create listeners
      const clientListener = harness.createClientListener();
      const feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      const feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Call disconnect and have the transport emit disconnect
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check all client and feed events
      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(1);
      expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0); // Requested
      expect(clientListener.badServerMessage.calls.count()).toBe(0);
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
      expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
      expect(feedWantedOpenListener.open.calls.count()).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(0); // Feed was never opening (no handshake)
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);
    });

    it("should work correctly if called while awaiting handshake response", async () => {
      // Create a disconnected client and two feeds
      const harness = harnessFactory();
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });

      // Get the client so it is awaiting a handshake response
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect"); // Transport will send Handshake message

      // Create listeners
      const clientListener = harness.createClientListener();
      const feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      const feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Call disconnect and have the transport emit disconnect
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check all client and feed events
      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(1);
      expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0); // Requested
      expect(clientListener.badServerMessage.calls.count()).toBe(0);
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
      expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
      expect(feedWantedOpenListener.open.calls.count()).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(0); // Feed was never opening (no handshake)
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);

      // Reset listeners
      clientListener.spyClear();
      feedWantedOpenListener.spyClear();
      feedWantedClosedListener.spyClear();
    });

    it("should work correctly if called while while client is connected", async () => {
      // Create a connected client and two feeds
      const harness = harnessFactory();
      await harness.connectClient();
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });

      await delay(DEFER_MS); // Flush events

      // Create listeners
      const clientListener = harness.createClientListener();
      const feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      const feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Call disconnect and have the transport emit disconnect
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check all client and feed events
      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(1);
      expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0); // Requested
      expect(clientListener.badServerMessage.calls.count()).toBe(0);
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
      expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
      expect(feedWantedOpenListener.open.calls.count()).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(1); // Feed was opening
      expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
      expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
        "DISCONNECTED: The transport disconnected."
      );
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);

      // Reset listeners
      clientListener.spyClear();
      feedWantedOpenListener.spyClear();
      feedWantedClosedListener.spyClear();
    });
  });

  // Transport calls

  describe("transport calls", () => {
    it("should work correctly if called while transport connecting", async () => {
      // Create a disconnected client and two feeds
      const harness = harnessFactory();

      // Put the client in a connecting state
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");

      // Reset transport spies
      harness.transport.spyClear();

      // Call disconnect and have the transport emit disconnect
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(1);
      expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });

    it("should work correctly if called while awaiting handshake response", async () => {
      // Create a disconnected client and two feeds
      const harness = harnessFactory();

      // Get the client so it is awaiting a handshake response
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect"); // Transport will send Handshake message

      // Reset transport spies
      harness.transport.spyClear();

      // Call disconnect and have the transport emit disconnect
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(1);
      expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });

    it("should work correctly if called while while client is connected", async () => {
      // Create a connected client and two feeds
      const harness = harnessFactory();
      await harness.connectClient();

      // Reset transport spies
      harness.transport.spyClear();

      // Call disconnect and have the transport emit disconnect
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(1);
      expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });
  });

  // Callbacks - N/A

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The client.action() function", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  // Errors and return values

  describe("throw and return - callback style", () => {
    it("should throw on bad argument (just test one)", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      expect(() => {
        harness.client.action("some_action", { action: "args" }, "junk");
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid callback."));
    });

    it("should return void on success", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      expect(harness.client.action("SomeAction", {}, () => {})).toBeUndefined();
    });
  });

  describe("throw and return - promise style", () => {
    it("should throw on bad argument (just test one)", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      expect(() => {
        harness.client.action("some_action", 123);
      }).toThrow(
        new Error("INVALID_ARGUMENT: Invalid action arguments object.")
      );
    });

    it("should return promise on success", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      expect(harness.client.action("SomeAction", {})).toEqual(
        jasmine.any(Object) // Can't use Promise - polyfilled on browsers
      );
    });
  });

  // Client and feed state functions - N/A

  // Client and feed events - N/A

  // Transport calls

  describe("transport calls - callback style", () => {
    it("if not connected should send an Action message on the transport", async () => {
      const harness = harnessFactory();

      // Invoke an action
      harness.client.action("SomeAction", { Action: "Arg" }, () => {});

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });

    it("if connected should send an Action message on the transport", async () => {
      const harness = harnessFactory();
      await harness.connectClient();

      // Reset transport spies
      harness.transport.spyClear();

      // Invoke an action
      harness.client.action("SomeAction", { Action: "Arg" }, () => {});

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(1);
      expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
      // You can't check the whole message in one go, since callback id is created internally
      const msg = JSON.parse(harness.transport.send.calls.argsFor(0)[0]);
      expect(msg.MessageType).toBe("Action");
      expect(msg.ActionName).toBe("SomeAction");
      expect(msg.ActionArgs).toEqual({ Action: "Arg" });
      expect(
        typeof msg.CallbackId === "string" || msg.CallbackId instanceof String
      ).toBe(true);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });
  });

  describe("transport calls - promise style", () => {
    it("if not connected should send an Action message on the transport", async () => {
      const harness = harnessFactory();

      // Invoke an action
      harness.client.action("SomeAction", { Action: "Arg" }).catch(() => {
        // Prevent unhandled rejection from failing test suite
      });

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });

    it("if connected should send an Action message on the transport", async () => {
      const harness = harnessFactory();
      await harness.connectClient();

      // Reset transport spies
      harness.transport.spyClear();

      // Invoke an action
      harness.client.action("SomeAction", { Action: "Arg" });

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(1);
      expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
      // You can't check the whole message in one go, since callback id is created internally
      const msg = JSON.parse(harness.transport.send.calls.argsFor(0)[0]);
      expect(msg.MessageType).toBe("Action");
      expect(msg.ActionName).toBe("SomeAction");
      expect(msg.ActionArgs).toEqual({ Action: "Arg" });
      expect(
        typeof msg.CallbackId === "string" || msg.CallbackId instanceof String
      ).toBe(true);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });
  });

  // Callbacks

  describe("callbacks - callback style", () => {
    it("should operate correctly if initially disconnected", async () => {
      const harness = harnessFactory();

      // Invoke an action
      const cb = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb);

      // Check callbacks
      expect(cb.calls.count()).toBe(0);

      await delay(DEFER_MS); // Flush callbacks

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "DISCONNECTED: Not connected."
      );
    });

    it("should operate correctly through a timeout cycle to final success", async () => {
      const timeoutMs = 1000;
      const harness = harnessFactory({
        actionTimeoutMs: timeoutMs
      });
      await harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      const cb = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb);

      // Get the CallbackId sent with the Action message
      const serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      await delay(DEFER_MS); // Flush callbacks

      // Check callbacks
      expect(cb.calls.count()).toBe(0);

      // Run the timeout
      jasmine.clock().tick(timeoutMs);

      await delay(DEFER_MS); // Flush callbacks

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "TIMEOUT: The server did not respond within the allocated time."
      );

      // Reset the callbacks
      cb.calls.reset();

      // Have the server return success
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionResponse",
          CallbackId: serverCb,
          Success: true,
          ActionData: { Action: "Data" }
        })
      );

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
    });

    it("should operate correctly through a timeout cycle to final disconnect", async () => {
      const timeoutMs = 1000;
      const harness = harnessFactory({
        actionTimeoutMs: timeoutMs
      });
      await harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      const cb = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb);

      await delay(DEFER_MS); // Flush callbacks

      // Check callbacks
      expect(cb.calls.count()).toBe(0);

      // Run the timeout
      jasmine.clock().tick(timeoutMs);

      await delay(DEFER_MS); // Flush callbacks

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "TIMEOUT: The server did not respond within the allocated time."
      );

      // Reset the callbacks
      cb.calls.reset();

      // Have the client disconnect (requested in this case)
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
    });

    it("should operate correctly through a timeout cycle to final reject", async () => {
      const timeoutMs = 1000;
      const harness = harnessFactory({
        actionTimeoutMs: timeoutMs
      });
      await harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      const cb = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb);

      // Get the CallbackId sent with the Action message
      const serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      await delay(DEFER_MS); // Flush callbacks

      // Check callbacks
      expect(cb.calls.count()).toBe(0);

      // Run the timeout
      jasmine.clock().tick(timeoutMs);

      await delay(DEFER_MS); // Flush callbacks

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "TIMEOUT: The server did not respond within the allocated time."
      );

      // Reset the callbacks
      cb.calls.reset();

      // Have the server reject the action
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionResponse",
          CallbackId: serverCb,
          Success: false,
          ErrorCode: "SERVER_ERROR_CODE",
          ErrorData: { Server: "Data" }
        })
      );

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
    });

    it("should operate correctly on success", async () => {
      const harness = harnessFactory();
      await harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      const cb = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb);

      // Get the CallbackId sent with the Action message
      const serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      // Check callbacks
      expect(cb.calls.count()).toBe(0);

      // Have the server return success
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionResponse",
          CallbackId: serverCb,
          Success: true,
          ActionData: { Action: "Data" }
        })
      );

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(2);
      expect(cb.calls.argsFor(0)[0]).toBeUndefined();
      expect(cb.calls.argsFor(0)[1]).toEqual({ Action: "Data" });
    });

    it("should operate correctly on reject", async () => {
      const harness = harnessFactory();
      await harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      const cb = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb);

      // Get the CallbackId sent with the Action message
      const serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      // Check callbacks
      expect(cb.calls.count()).toBe(0);

      // Have the server reject the action
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionResponse",
          CallbackId: serverCb,
          Success: false,
          ErrorCode: "SERVER_ERROR_CODE",
          ErrorData: { Server: "Data" }
        })
      );

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "REJECTED: Server rejected the action request."
      );
      expect(cb.calls.argsFor(0)[0].serverErrorCode).toBe("SERVER_ERROR_CODE");
      expect(cb.calls.argsFor(0)[0].serverErrorData).toEqual({
        Server: "Data"
      });
    });

    it("should operate correctly on post-send disconnect, with action callback before feed close event before disconnect event", async () => {
      const harness = harnessFactory();
      await harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      const order = [];

      // Create callback and monitor callback/disconnect order
      const cb = jasmine.createSpy();
      cb.and.callFake(() => {
        order.push("action callback");
      });
      harness.client.on("disconnect", () => {
        order.push("client disconnect");
      });
      const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
      feed.desireOpen();
      feed.on("close", () => {
        order.push("feed close");
      });

      // Invoke an action
      harness.client.action("SomeAction", { Action: "Arg" }, cb);

      // Check callbacks
      expect(cb.calls.count()).toBe(0);

      // Have the client disconnect (requested in this case)
      harness.transport.disconnect.and.callFake(() => {
        harness.transport.state.and.returnValue("disconnected");
      });
      harness.client.disconnect();
      await harness.transport.emit("disconnect");

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "DISCONNECTED: The transport disconnected."
      );

      // Check that callbacks were invoked before disconnect event was emitted
      expect(order).toEqual([
        "action callback",
        "feed close",
        "client disconnect"
      ]);
    });
  });

  describe("callbacks - promise style", () => {
    it("should operate correctly if initially disconnected", done => {
      const harness = harnessFactory();

      harness.client
        .action("SomeAction", { Action: "Arg" })
        .catch((...args) => {
          expect(args.length).toBe(1);
          expect(args[0]).toEqual(jasmine.any(Error));
          expect(args[0].message).toBe("DISCONNECTED: Not connected.");
          done();
        });
    });

    it("should operate correctly on action success", done => {
      const harness = harnessFactory();
      harness
        .connectClient()
        .then(() => {
          harness.client
            .action("SomeAction", { Action: "Arg" })
            .then(actionData => {
              expect(actionData).toEqual({ Action: "Data" });
              done();
            });
        })
        .then(async () => {
          // Get the CallbackId sent with the Action message and return success
          // This settles the action promise above
          const serverCb = JSON.parse(
            harness.transport.send.calls.argsFor(0)[0]
          ).CallbackId;
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "ActionResponse",
              CallbackId: serverCb,
              Success: true,
              ActionData: { Action: "Data" }
            })
          );
        });
    });

    it("should operate correctly on action success", done => {
      const harness = harnessFactory();
      harness
        .connectClient()
        .then(() => {
          harness.client
            .action("SomeAction", { Action: "Arg" })
            .then(actionData => {
              expect(actionData).toEqual({ Action: "Data" });
              done();
            });
        })
        .then(async () => {
          // Get the CallbackId sent with the Action message and return success
          // This settles the action promise above
          const serverCb = JSON.parse(
            harness.transport.send.calls.argsFor(0)[0]
          ).CallbackId;
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "ActionResponse",
              CallbackId: serverCb,
              Success: true,
              ActionData: { Action: "Data" }
            })
          );
        });
    });

    it("should operate correctly on action rejection", done => {
      const harness = harnessFactory();

      harness
        .connectClient()
        .then(() => {
          harness.client.action("SomeAction", { Action: "Arg" }).catch(err => {
            expect(err).toEqual(jasmine.any(Error));
            expect(err.message).toEqual(
              "REJECTED: Server rejected the action request."
            );
            expect(err.serverErrorCode).toBe("SOME_ERROR");
            expect(err.serverErrorData).toEqual({ Error: "Data" });
            done();
          });
        })
        .then(async () => {
          // Get the CallbackId sent with the Action message and return success
          // This settles the action promise above
          const serverCb = JSON.parse(
            harness.transport.send.calls.argsFor(0)[0]
          ).CallbackId;
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "ActionResponse",
              CallbackId: serverCb,
              Success: false,
              ErrorCode: "SOME_ERROR",
              ErrorData: { Error: "Data" }
            })
          );
        });
    });

    it("should operate correctly on timeout", done => {
      const timeoutMs = 1000;
      const harness = harnessFactory({
        actionTimeoutMs: timeoutMs
      });

      harness
        .connectClient()
        .then(() => {
          harness.client.action("SomeAction", { Action: "Arg" }).catch(err => {
            expect(err).toEqual(jasmine.any(Error));
            expect(err.message).toBe(
              "TIMEOUT: The server did not respond within the allocated time."
            );
            done();
          });
        })
        .then(() => {
          // Run the timeout
          // This settles the action promise above
          jasmine.clock().tick(timeoutMs);
        });
    });

    it("should operate correctly on post-send disconnect, with promise settlement before feed close event before disconnect event", done => {
      const harness = harnessFactory();

      const order = [];
      harness.client.on("disconnect", () => {
        order.push("client disconnect");
      });

      const catchHandler = jasmine.createSpy();
      catchHandler.and.callFake(() => {
        order.push("action settle");
      });

      harness
        .connectClient()
        .then(() => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Args" });
          feed.desireOpen();
          feed.on("close", () => {
            order.push("feed close");
          });

          harness.client
            .action("SomeAction", { Action: "Arg" })
            .catch(catchHandler);
        })
        .then(async () => {
          // Have the client disconnect (requested in this case)
          // This settles the action promise above
          harness.transport.disconnect.and.callFake(() => {
            harness.transport.state.and.returnValue("disconnected");
          });
          harness.client.disconnect();
          await harness.transport.emit("disconnect");
        })
        .then(() => {
          expect(catchHandler.calls.count()).toBe(1);
          expect(catchHandler.calls.argsFor(0).length).toBe(1);
          expect(catchHandler.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
          expect(catchHandler.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );

          // Check that promise was settled before disconnect event
          expect(order).toEqual([
            "action settle",
            "feed close",
            "client disconnect"
          ]);
          done();
        });
    });
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The client.feed() function", () => {
  // Errors and return values

  describe("throw and return", () => {
    it("should throw on bad argument (check one)", () => {
      const harness = harnessFactory();
      expect(() => {
        harness.client.feed(); // No args
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed name."));
    });

    it("should return an object on success", () => {
      const harness = harnessFactory();
      expect(harness.client.feed("SomeFeed", { Feed: "Arg" })).toEqual(
        jasmine.any(Object)
      );
    });
  });

  // Client and feed state functions - N/A

  // Client and feed events - N/A

  // Transport calls - N/A

  // Callbacks - N/A
});

/*

The feed.desireOpen() and feed.desireClosed() functions are tested using
a somewhat different approach than other functions. Instead of branching
into state functions, events, and transport calls at the root, the root
is used to branch into the various possible cases of (1) whether any other
feeds are desired open, and (2) the current state of the server feed. State
functions, events, and transport calls are then tested internally for each.

*/

describe("The feed.desireOpen() function", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  describe("throw and return", () => {
    it("should throw if already desired open", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      expect(() => {
        feed.desireOpen();
      }).toThrow(
        new Error("INVALID_FEED_STATE: The feed is already desired open.")
      );
    });

    it("should throw if destroyed", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.destroy();
      expect(() => {
        feed.desireOpen();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should return void on success", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      expect(feed.desireOpen()).toBeUndefined();
    });
  });

  describe("if disconnected - already observed transport disconnect event", () => {
    let harness;
    beforeEach(() => {
      harness = harnessFactory();
    });

    it("state functions", () => {
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Check state functions
      expect(feed.desiredState()).toBe("closed");
      expect(feed.state()).toBe("closed");
      expect(() => {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Desire open
      feed.desireOpen();

      // Check state functions
      expect(feed.desiredState()).toBe("open");
      expect(feed.state()).toBe("closed");
      expect(() => {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    it("events", async () => {
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });
      const feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      const feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      feedWantedOpen.desireOpen();

      await delay(DEFER_MS); // Flush events

      expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
      expect(feedWantedOpenListener.open.calls.count()).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(1);
      expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
      expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
        "DISCONNECTED: The client is not connected."
      );
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);
    });

    it("transport calls", () => {
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      harness.transport.spyClear();

      feed.desireOpen();

      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });
  });

  describe("if disconnected - transport disconnect event not yet observed", () => {
    let harness;
    beforeEach(async () => {
      harness = harnessFactory();
      await harness.connectClient();
      harness.transport.state.and.returnValue("disconnected"); // No event yet
    });

    it("state functions", () => {
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Check state functions
      expect(feed.desiredState()).toBe("closed");
      expect(feed.state()).toBe("closed");
      expect(() => {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Desire open
      feed.desireOpen();

      // Check state functions
      expect(feed.desiredState()).toBe("open");
      expect(feed.state()).toBe("closed");
      expect(() => {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    it("events", async () => {
      const feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      const feedWantedClosed = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });
      const feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      const feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      feedWantedOpen.desireOpen();

      await delay(DEFER_MS); // Flush events

      expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
      expect(feedWantedOpenListener.open.calls.count()).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(1);
      expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
      expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
        "DISCONNECTED: The client is not connected."
      );
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);
    });

    it("transport calls", () => {
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      harness.transport.spyClear();

      feed.desireOpen();

      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });
  });

  describe("if connected and no other feed objects are desired open", () => {
    describe("if the server feed is closed", () => {
      let harness;
      beforeEach(async () => {
        harness = harnessFactory();
        await harness.connectClient();
      });

      describe("if the server responds to FeedOpen with success", () => {
        it("state functions", async () => {
          // Desire feed open
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("open");
          expect(feed.data()).toEqual({ Feed: "Data" });
        });

        it("events", async () => {
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
            Feed: "Data"
          });
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with failure", () => {
        it("state functions", async () => {
          // Desire feed open
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "REJECTED: Server rejected the feed open request."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the client disconnects before the server responds to FeedOpen", () => {
        it("state functions", async () => {
          // Desire feed open
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Ensure that feed close event is fired before client disconnect event

          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Track close/disconnect ordering
          const order = [];
          harness.client.on("disconnect", () => {
            order.push("disconnect");
          });
          feedWantedOpen.on("close", () => {
            order.push("close");
          });

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Check that close fired before disconnect
          expect(order).toEqual(["close", "disconnect"]);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is opening", () => {
      let harness;
      beforeEach(async () => {
        harness = harnessFactory();
        await harness.connectClient();

        // Get the server feed into the opening state
        const earlierFeed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        earlierFeed.desireOpen();
      });

      describe("if the server responds to earlier FeedOpen with success", () => {
        it("state functions", async () => {
          // Desire feed open
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("open");
          expect(feed.data()).toEqual({ Feed: "Data" });
        });

        it("events", async () => {
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
            Feed: "Data"
          });
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to earlier FeedOpen with failure", () => {
        it("state functions", async () => {
          // Desire feed open
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "REJECTED: Server rejected the feed open request."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the client disconnects before the server responds to earlier FeedOpen", () => {
        it("state functions", async () => {
          // Desire feed open
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Ensure that feed close event is fired before client disconnect event

          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Track close/disconnect ordering
          const order = [];
          harness.client.on("disconnect", () => {
            order.push("disconnect");
          });
          feedWantedOpen.on("close", () => {
            order.push("close");
          });

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Check that close fired before disconnect
          expect(order).toEqual(["close", "disconnect"]);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is open", () => {
      // Can't happen - server feed would be closing if no other feeds objects desired open
    });

    describe("if the server feed is closing", () => {
      let harness;
      beforeEach(async () => {
        // Get the server feed into the closing state
        harness = harnessFactory();
        await harness.connectClient();

        const earlierFeed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        earlierFeed.desireOpen();

        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: true,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedData: { Feed: "Data" }
          })
        );

        earlierFeed.desireClosed();

        await delay(DEFER_MS); // Flush events
      });

      describe("if the server responds to earlier FeedClose with success and subsequent FeedOpen with success", () => {
        it("state functions", async () => {
          // Desire feed open
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("open");
          expect(feed.data()).toEqual({ Feed: "Data" });
        });

        it("events", async () => {
          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
            Feed: "Data"
          });
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to earlier FeedClose with success and subsequent FeedOpen with failure", () => {
        it("state functions", async () => {
          // Desire feed open
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "REJECTED: Server rejected the feed open request."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to earlier FeedClose with success and client disconnects before the server responds to subsequent FeedOpen", () => {
        it("state functions", async () => {
          // Desire feed open
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Ensure that feed close event is fired before client disconnect event

          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Track close/disconnect ordering
          const order = [];
          harness.client.on("disconnect", () => {
            order.push("disconnect");
          });
          feedWantedOpen.on("close", () => {
            order.push("close");
          });

          // Have the transport disconnect
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Check that close fired before disconnect
          expect(order).toEqual(["close", "disconnect"]);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });
  });

  describe("if connected and another feed object is desired open", () => {
    describe("if the server feed is closed", () => {
      let harness;
      let feedAlreadyWantedOpen;
      beforeEach(async () => {
        // Set up a connected client with a feed desired open but actually closed
        harness = harnessFactory();
        await harness.connectClient();
        feedAlreadyWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedAlreadyWantedOpen.desireOpen();
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: false,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            ErrorCode: "SOME_ERROR_CODE",
            ErrorData: { Error: "Data" }
          })
        );
      });

      describe("if the server responds to FeedOpen with success", () => {
        it("state functions", async () => {
          // Desire feed open
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("open");
          expect(feedAlreadyWantedOpen.data()).toEqual({ Feed: "Data" });
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        });

        it("events", async () => {
          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.opening.calls.argsFor(0).length
          ).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return success to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.open.calls.argsFor(0).length
          ).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.open.calls.argsFor(0)[0]
          ).toEqual({
            Feed: "Data"
          });
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
            Feed: "Data"
          });
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with failure", () => {
        it("state functions", async () => {
          // Desire feed open
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("closed");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.opening.calls.argsFor(0).length
          ).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return failure to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0).length
          ).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0]
          ).toEqual(jasmine.any(Error));
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0].message
          ).toBe("REJECTED: Server rejected the feed open request.");
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "REJECTED: Server rejected the feed open request."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return failure to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the client disconnects before the server responds to FeedOpen", () => {
        it("state functions", async () => {
          // Desire feed open
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the client disconnect
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("closed");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Ensure that feed close events are fired before client disconnect event

          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.opening.calls.argsFor(0).length
          ).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Track close/disconnect ordering
          const order = [];
          harness.client.on("disconnect", () => {
            order.push("disconnect");
          });
          feedWantedOpen.on("close", () => {
            order.push("close");
          });
          feedAlreadyWantedOpen.on("close", () => {
            order.push("close");
          });

          // Have the client disconnect
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0).length
          ).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0]
          ).toEqual(jasmine.any(Error));
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0].message
          ).toBe("DISCONNECTED: The transport disconnected.");
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Check that close fired before disconnect
          expect(order).toEqual(["close", "close", "disconnect"]);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the client disconnect
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is opening", () => {
      let harness;
      let feedAlreadyWantedOpen;
      beforeEach(async () => {
        // Set up a connected client with a feed desired open and server feed opening
        harness = harnessFactory();
        await harness.connectClient();
        feedAlreadyWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedAlreadyWantedOpen.desireOpen();

        await delay(DEFER_MS); // Flush events
      });

      describe("if the server responds to earlier FeedOpen with success", () => {
        it("state functions", async () => {
          // Desire feed open
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("open");
          expect(feedAlreadyWantedOpen.data()).toEqual({ Feed: "Data" });
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        });

        it("events", async () => {
          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire the feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.open.calls.argsFor(0).length
          ).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.open.calls.argsFor(0)[0]
          ).toEqual({ Feed: "Data" });
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
            Feed: "Data"
          });
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(0);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to earlier FeedOpen with failure", () => {
        it("state functions", async () => {
          // Desire feed open
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("closed");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0).length
          ).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0]
          ).toEqual(jasmine.any(Error));
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0].message
          ).toBe("REJECTED: Server rejected the feed open request.");
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "REJECTED: Server rejected the feed open request."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the client disconnects before the server responds to earlier FeedOpen", () => {
        it("state functions", async () => {
          // Desire feed open
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("closed");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Ensure that feed close events are fired before client disconnect event

          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Track close/disconnect ordering
          const order = [];
          harness.client.on("disconnect", () => {
            order.push("disconnect");
          });
          feedWantedOpen.on("close", () => {
            order.push("close");
          });
          feedAlreadyWantedOpen.on("close", () => {
            order.push("close");
          });

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0).length
          ).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0]
          ).toEqual(jasmine.any(Error));
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0].message
          ).toBe("DISCONNECTED: The transport disconnected.");
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Check that close fired before disconnect
          expect(order).toEqual(["close", "close", "disconnect"]);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is open", () => {
      let harness;
      let feedAlreadyWantedOpen;
      beforeEach(async () => {
        // Set up a connected client with a feed desired open and server feed open
        harness = harnessFactory();
        await harness.connectClient();
        feedAlreadyWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedAlreadyWantedOpen.desireOpen();
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: true,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedData: { Feed: "Data" }
          })
        );
      });

      it("state functions", () => {
        // Desire feed open
        const feedWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedWantedOpen.desireOpen();

        // Check state functions
        expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
        expect(feedAlreadyWantedOpen.state()).toBe("open");
        expect(feedAlreadyWantedOpen.data()).toEqual({ Feed: "Data" });
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
      });

      it("events", async () => {
        // Create feed listeners
        const feedWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        const feedWantedClosed = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        const feedAlreadyWantedOpenListener = harness.createFeedListener(
          feedAlreadyWantedOpen
        );
        const feedWantedOpenListener = harness.createFeedListener(
          feedWantedOpen
        );
        const feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Desire the feed open
        feedWantedOpen.desireOpen();

        await delay(DEFER_MS); // Flush events

        // Check events
        expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
        expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(1);
        expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
        expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
          Feed: "Data"
        });
        expect(feedWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });

      it("transport calls", () => {
        const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

        // Reset transport spies
        harness.transport.spyClear();

        // Desire feed open
        feed.desireOpen();

        // Check transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.send.calls.argsFor(0).length).toBe(0);
      });
    });

    describe("if the server feed is closing", () => {
      let harness;
      let feedAlreadyWantedOpen;
      beforeEach(async () => {
        // Get the server feed into the closing state with a feed desired open
        harness = harnessFactory();
        await harness.connectClient();

        feedAlreadyWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedAlreadyWantedOpen.desireOpen();

        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: true,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedData: { Feed: "Data" }
          })
        );

        feedAlreadyWantedOpen.desireClosed();
        feedAlreadyWantedOpen.desireOpen();

        await delay(DEFER_MS); // Flush events
      });

      describe("if the server responds to earlier FeedClose with success and subsequent FeedOpen with success", () => {
        it("state functions", async () => {
          // Desire feed open
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("open");
          expect(feedAlreadyWantedOpen.data()).toEqual({ Feed: "Data" });
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        });

        it("events", async () => {
          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.open.calls.argsFor(0).length
          ).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.open.calls.argsFor(0)[0]
          ).toEqual({ Feed: "Data" });
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
            Feed: "Data"
          });
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to earlier FeedClose with success and subsequent FeedOpen with failure", () => {
        it("state functions", async () => {
          // Desire feed open
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("closed");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0).length
          ).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0]
          ).toEqual(jasmine.any(Error));
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0].message
          ).toBe("REJECTED: Server rejected the feed open request.");
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "REJECTED: Server rejected the feed open request."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to the FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to earlier FeedClose with success and the client disconnects before the server responds to subsequent FeedOpen", () => {
        it("state functions", async () => {
          // Desire feed open
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("closed");
          expect(() => {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          // Ensure that feed close events are fired before client disconnect event

          // Create feed listeners
          const feedWantedOpen = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          const feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
          expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Track close/disconnect ordering
          const order = [];
          harness.client.on("disconnect", () => {
            order.push("disconnect");
          });
          feedWantedOpen.on("close", () => {
            order.push("close");
          });
          feedAlreadyWantedOpen.on("close", () => {
            order.push("close");
          });

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedAlreadyWantedOpenListener.spyClear();
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();

          // Have the transport disconnect
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0).length
          ).toBe(1);
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0]
          ).toEqual(jasmine.any(Error));
          expect(
            feedAlreadyWantedOpenListener.close.calls.argsFor(0)[0].message
          ).toBe("DISCONNECTED: The transport disconnected.");
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Check that close fired before disconnect
          expect(order).toEqual(["close", "close", "disconnect"]);
        });

        it("transport calls", async () => {
          const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed open
          feed.desireOpen();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The feed.desireClosed() function", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  describe("throw and return", () => {
    it("should throw if already desired closed", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      expect(() => {
        feed.desireClosed();
      }).toThrow(
        new Error("INVALID_FEED_STATE: The feed is already desired closed.")
      );
    });

    it("should throw if destroyed", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.destroy();
      expect(() => {
        feed.desireClosed();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should return void on success", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      expect(feed.desireClosed()).toBeUndefined();
    });
  });

  describe("if disconnected", () => {
    let harness;
    let feedWantedOpen;
    let feedWantedClosed;
    beforeEach(() => {
      harness = harnessFactory();
      feedWantedOpen = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });
      feedWantedOpen.desireOpen();
      feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedClosed.desireOpen();
    });

    it("state functions", () => {
      // Check state functions
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("open");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Desire closed
      feedWantedClosed.desireClosed();

      // Check state functions
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    it("events", () => {
      const feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      const feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      feedWantedClosed.desireClosed();

      expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
      expect(feedWantedOpenListener.open.calls.count()).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(0);
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);
    });

    it("transport calls", () => {
      harness.transport.spyClear();

      feedWantedClosed.desireClosed();

      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });
  });

  describe("if connected and no other feed objects are desired open", () => {
    describe("if the server feed is closed", () => {
      let harness;
      let feed;
      beforeEach(async () => {
        // Set up a feed object desired open but with the server feed closed (rejected)
        harness = harnessFactory();
        await harness.connectClient();
        feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feed.desireOpen();
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: false,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            ErrorCode: "SOME_ERROR_CODE",
            ErrorData: { Error: "Data" }
          })
        );
      });

      it("state functions", () => {
        // Check state functions
        expect(feed.desiredState()).toBe("open");
        expect(feed.state()).toBe("closed");
        expect(() => {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Desire closed
        feed.desireClosed();

        // Check state functions
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(() => {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("events", async () => {
        const feedListener = harness.createFeedListener(feed);

        feed.desireClosed();

        await delay(DEFER_MS); // Flush events

        // Check events
        expect(feedListener.opening.calls.count()).toBe(0);
        expect(feedListener.open.calls.count()).toBe(0);
        expect(feedListener.close.calls.count()).toBe(1);
        expect(feedListener.close.calls.argsFor(0).length).toBe(0);
        expect(feedListener.action.calls.count()).toBe(0);
      });

      it("transport calls", () => {
        // Reset transport spies
        harness.transport.spyClear();

        // Desire feed closed
        feed.desireClosed();

        // Check transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });
    });

    describe("if the server feed is opening", () => {
      let harness;
      let feed;
      beforeEach(async () => {
        // Set up an opening feed
        harness = harnessFactory();
        await harness.connectClient();
        feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feed.desireOpen();

        await delay(DEFER_MS); // Flush events
      });

      describe("if the client disconnects before FeedOpenResponse", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with failure", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedOpen with failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to FeedOpen with failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with success and then disconnects before FeedCloseResponse", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedOpen with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to FeedOpen with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedClose",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with success and FeedClose with success", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedClose with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedOpen with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedClose with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to FeedOpen with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedClose",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to FeedClose with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is open", () => {
      let harness;
      let feed;
      beforeEach(async () => {
        // Set up an open feed
        harness = harnessFactory();
        await harness.connectClient();
        feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feed.desireOpen();
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: true,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedData: { Feed: "Data" }
          })
        );
      });

      describe("if the server disconnects before FeedCloseResponse", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("open");
          expect(feed.data()).toEqual({ Feed: "Data" });

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedClose",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedClose with success", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("open");
          expect(feed.data()).toEqual({ Feed: "Data" });

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedClose with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedClose with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedClose",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to FeedClose with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is closing", () => {
      let harness;
      let feed;
      beforeEach(async () => {
        // Set up a closing feed desired open
        harness = harnessFactory();
        await harness.connectClient();
        feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feed.desireOpen();
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: true,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedData: { Feed: "Data" }
          })
        );

        feed.desireClosed();
        feed.desireOpen();

        await delay(DEFER_MS); // Flush events
      });

      describe("if the server disconnects before FeedCloseResponse", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedClose with success", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedClose with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(() => {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedClose with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to FeedClose with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });
  });

  describe("if connected and another feed object is desired open", () => {
    describe("if the server feed is closed", () => {
      let harness;
      let feedWantedClosed;
      let feedWantedOpen;
      beforeEach(async () => {
        // Set up a feed object desired open but with the server feed closed (rejected)
        harness = harnessFactory();
        await harness.connectClient();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedClosed.desireOpen();
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: false,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            ErrorCode: "SOME_ERROR_CODE",
            ErrorData: { Error: "Data" }
          })
        );
      });

      it("state functions", () => {
        // Check state functions
        expect(feedWantedClosed.desiredState()).toBe("open");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(() => {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Desire closed
        feedWantedClosed.desireClosed();

        // Check state functions
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(() => {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("events", async () => {
        const feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );
        const feedWantedOpenListener = harness.createFeedListener(
          feedWantedOpen
        );

        feedWantedClosed.desireClosed();

        await delay(DEFER_MS); // Flush events

        // Check events
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(1);
        expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      });

      it("transport calls", () => {
        // Reset transport spies
        harness.transport.spyClear();

        // Desire feed closed
        feedWantedClosed.desireClosed();

        // Check transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });
    });

    describe("if the server feed is opening", () => {
      let harness;
      let feedWantedClosed;
      let feedWantedOpen;
      beforeEach(async () => {
        // Set up an opening feed
        harness = harnessFactory();
        await harness.connectClient();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedClosed.desireOpen();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();

        await delay(DEFER_MS); // Flush events
      });

      describe("if the client disconnects before FeedOpenResponse", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(1);
          expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with failure", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(1);
          expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();

          // Have the server respond to FeedOpen with failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "REJECTED: Server rejected the feed open request."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to FeedOpen with failure
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with success and then eventually disconnects", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(1);
          expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the server respond to FeedOpen with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
            Feed: "Data"
          });
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server respond to FeedOpen with success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is open", () => {
      let harness;
      let feedWantedClosed;
      let feedWantedOpen;
      beforeEach(async () => {
        // Set up an open feed
        harness = harnessFactory();
        await harness.connectClient();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedClosed.desireOpen();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: true,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedData: { Feed: "Data" }
          })
        );
      });

      describe("when the client eventually disconnects", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("open");
          expect(feedWantedClosed.data()).toEqual({ Feed: "Data" });
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(1);
          expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is closing", () => {
      let harness;
      let feedWantedClosed;
      let feedWantedOpen;
      beforeEach(async () => {
        // Set up a closing feed desired open by two objects
        harness = harnessFactory();
        await harness.connectClient();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedClosed.desireOpen();
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "FeedOpenResponse",
            Success: true,
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedData: { Feed: "Data" }
          })
        );

        feedWantedClosed.desireClosed();
        feedWantedClosed.desireOpen();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();

        await delay(DEFER_MS); // Flush events
      });

      describe("if the client disconnects before receiving a response to earlier FeedClose", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(1);
          expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the earlier FeedClose succeeds then client disconnects before FeedOpenResponse", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return FeedCloseResponse success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(1);
          expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the server return FeedCloseResponse success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "DISCONNECTED: The transport disconnected."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return FeedCloseResponse success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the earlier FeedClose succeeds and FeedOpen fails", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return FeedCloseResponse success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", async () => {
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(1);
          expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the server return FeedCloseResponse success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the server return failure to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
            jasmine.any(Error)
          );
          expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
            "REJECTED: Server rejected the feed open request."
          );
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return FeedCloseResponse success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return failure to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: false,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              ErrorCode: "SOME_ERROR_CODE",
              ErrorData: { Error: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the earlier FeedClose succeeds and FeedOpen succeeds", () => {
        it("state functions", async () => {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return FeedCloseResponse success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(() => {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(() => {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        });

        it("events", async () => {
          const feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          const feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

          await delay(DEFER_MS); // Flush events

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(1);
          expect(feedWantedClosedListener.close.calls.argsFor(0).length).toBe(
            0
          );
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the server return FeedCloseResponse success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the server return success to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check events
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0)[0]).toEqual({
            Feed: "Data"
          });
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        });

        it("transport calls", async () => {
          // Reset transport spies
          harness.transport.spyClear();

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return FeedCloseResponse success
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedCloseResponse",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count()).toBe(0);
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(1);
          expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
          expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
            JSON.stringify({
              MessageType: "FeedOpen",
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" }
            })
          );
          expect(harness.transport.state.calls.count() >= 0).toBe(true);

          // Reset transport spies
          harness.transport.spyClear();

          // Have the server return success to FeedOpen
          await harness.transport.emit(
            "message",
            JSON.stringify({
              MessageType: "FeedOpenResponse",
              Success: true,
              FeedName: "SomeFeed",
              FeedArgs: { Feed: "Arg" },
              FeedData: { Feed: "Data" }
            })
          );

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("The feed.destroy() function", () => {
  // Errors and return values

  describe("throw and return", () => {
    it("should throw if desired open", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      expect(() => {
        feed.destroy();
      }).toThrow(
        new Error(
          "INVALID_FEED_STATE: Only feeds desired closed can be destroyed."
        )
      );
    });

    it("should throw if already destroyed", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.destroy();
      expect(() => {
        feed.destroy();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should return void", () => {
      const harness = harnessFactory();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      expect(feed.destroy()).toBeUndefined();
    });
  });

  // Client and feed state functions - N/A

  // Client and feed events - N/A

  // Transport calls - N/A

  // Callbacks - N/A
});

/*

State functions

Tested heavily above - just check a few error cases.

*/

describe("The client.state() function", () => {
  // No errors
});

describe("The feed.desiredState() function", () => {
  it("should throw if destroyed", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
    feed.destroy();
    expect(() => {
      feed.desiredState();
    }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
  });
});

describe("The feed.state() function", () => {
  it("should throw if destroyed", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
    feed.destroy();
    expect(() => {
      feed.state();
    }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
  });
});

describe("The feed.data() function", () => {
  // INVALID_FEED_STATE tested through the connection cycle above
  it("should throw if destroyed", () => {
    const harness = harnessFactory();
    const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
    feed.destroy();
    expect(() => {
      feed.data();
    }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
  });
});

/*

Transport-initiated operations.

Transport operations that are the direct result of an app-initiated operation
are tested above (but not unexpected messages).

Tested only under the default configuration; alternative configurations are
tested above.

Transport-initiated operations tested here include:

  - Violation of the transport requirements (transportError)
  - Transport disconnect event generated internally (disconnect)
  - Transport message event that violates the spec (client badServerMessage)
  - Transport message event with ViolationResponse (client badClientMessage)
  - Transport message event with ActionRevelation (feed action)
  - Transport message event with FeedTermination (feed close)

For each result path, test:

  - Client and feed state function return values (listed above)
  - Client and feed events
  - Transport calls
  - Callbacks

*/

describe("if the transport violates a library requirement", () => {
  // State functions - N/A

  // Events

  it("should emit transportError on the client", async () => {
    // Just test one unexpected behavior - unit tests handle the rest
    const harness = harnessFactory();
    const clientListener = harness.createClientListener();
    await harness.transport.emit("disconnect"); // Unexpected

    expect(clientListener.connecting.calls.count()).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(0);
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(1);
    expect(clientListener.transportError.calls.argsFor(0).length).toBe(1);
    expect(clientListener.transportError.calls.argsFor(0)[0]).toEqual(
      jasmine.any(Error)
    );
    expect(clientListener.transportError.calls.argsFor(0)[0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'disconnect' event when the previous state emission was 'disconnect'."
    );
  });

  // Transport calls - N/A

  // Callbacks - N/A
});

describe("if the transport unexpectedly disconnects", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });
  let harness;
  let feedDesiredClosed;
  let feedClosed;
  let feedOpening;
  let feedOpen;
  let feedClosing;
  beforeEach(async () => {
    // Set up a connected client and feeds in all states
    harness = harnessFactory();
    await harness.connectClient();

    feedDesiredClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

    feedClosed = harness.client.feed("SomeFeed2", { Feed: "Arg" });
    feedClosed.desireOpen();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        Success: false,
        FeedName: "SomeFeed2",
        FeedArgs: { Feed: "Arg" },
        ErrorCode: "SOME_ERROR_CODE",
        ErrorData: { Error: "Data" }
      })
    );

    feedOpening = harness.client.feed("SomeFeed3", { Feed: "Arg" });
    feedOpening.desireOpen();

    feedOpen = harness.client.feed("SomeFeed4", { Feed: "Arg" });
    feedOpen.desireOpen();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        Success: true,
        FeedName: "SomeFeed4",
        FeedArgs: { Feed: "Arg" },
        FeedData: { Feed: "Data" }
      })
    );

    feedClosing = harness.client.feed("SomeFeed5", { Feed: "Arg" });
    feedClosing.desireOpen();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        Success: false,
        FeedName: "SomeFeed5",
        FeedArgs: { Feed: "Arg" },
        FeedData: { Feed: "Data" }
      })
    );
    feedClosing.desireClosed();
    feedClosing.desireOpen();

    await delay(DEFER_MS); // Flush events
  });

  // State functions

  it("should update state functions", async () => {
    // Check state functions
    expect(harness.client.state()).toBe("connected");
    expect(feedDesiredClosed.desiredState()).toBe("closed");
    expect(feedDesiredClosed.state()).toBe("closed");
    expect(() => {
      feedDesiredClosed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedClosed.desiredState()).toBe("open");
    expect(feedClosed.state()).toBe("closed");
    expect(() => {
      feedClosed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedOpening.desiredState()).toBe("open");
    expect(feedOpening.state()).toBe("opening");
    expect(() => {
      feedOpening.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedOpen.desiredState()).toBe("open");
    expect(feedOpen.state()).toBe("open");
    expect(feedOpen.data()).toEqual({ Feed: "Data" });
    expect(feedClosing.desiredState()).toBe("open");
    expect(feedClosing.state()).toBe("opening");
    expect(() => {
      feedClosing.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

    // Have the transport disconnect
    harness.transport.state.and.returnValue("disconnected");
    await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    // Check state functions
    expect(harness.client.state()).toBe("disconnected");
    expect(feedDesiredClosed.desiredState()).toBe("closed");
    expect(feedDesiredClosed.state()).toBe("closed");
    expect(() => {
      feedDesiredClosed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedClosed.desiredState()).toBe("open");
    expect(feedClosed.state()).toBe("closed");
    expect(() => {
      feedClosed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedOpening.desiredState()).toBe("open");
    expect(feedOpening.state()).toBe("closed");
    expect(() => {
      feedOpening.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedOpen.desiredState()).toBe("open");
    expect(feedOpen.state()).toBe("closed");
    expect(() => {
      feedOpen.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedClosing.desiredState()).toBe("open");
    expect(feedClosing.state()).toBe("closed");
    expect(() => {
      feedClosing.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
  });

  // Events

  it("should emit events", async () => {
    // Create listeners
    const clientListener = harness.createClientListener();
    const feedDesiredClosedListener = harness.createFeedListener(
      feedDesiredClosed
    );
    const feedClosedListener = harness.createFeedListener(feedClosed);
    const feedOpeningListener = harness.createFeedListener(feedOpening);
    const feedOpenListener = harness.createFeedListener(feedOpen);
    const feedClosingListener = harness.createFeedListener(feedClosing);

    // Have the transport disconnect
    harness.transport.state.and.returnValue("disconnected");
    await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    // Check events
    expect(clientListener.connecting.calls.count()).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(1);
    expect(clientListener.disconnect.calls.argsFor(0).length).toBe(1);
    expect(clientListener.disconnect.calls.argsFor(0)[0]).toEqual(
      jasmine.any(Error)
    );
    expect(clientListener.disconnect.calls.argsFor(0)[0].message).toBe(
      "FAILURE: ..."
    );
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(0);

    expect(feedDesiredClosedListener.opening.calls.count()).toBe(0);
    expect(feedDesiredClosedListener.open.calls.count()).toBe(0);
    expect(feedDesiredClosedListener.close.calls.count()).toBe(0);
    expect(feedDesiredClosedListener.action.calls.count()).toBe(0);

    expect(feedClosedListener.opening.calls.count()).toBe(0);
    expect(feedClosedListener.open.calls.count()).toBe(0);
    expect(feedClosedListener.close.calls.count()).toBe(1);
    expect(feedClosedListener.close.calls.argsFor(0).length).toBe(1);
    expect(feedClosedListener.close.calls.argsFor(0)[0]).toEqual(
      jasmine.any(Error)
    );
    expect(feedClosedListener.close.calls.argsFor(0)[0].message).toBe(
      "DISCONNECTED: The transport disconnected."
    );
    expect(feedClosedListener.action.calls.count()).toBe(0);

    expect(feedOpeningListener.opening.calls.count()).toBe(0);
    expect(feedOpeningListener.open.calls.count()).toBe(0);
    expect(feedOpeningListener.close.calls.count()).toBe(1);
    expect(feedOpeningListener.close.calls.argsFor(0).length).toBe(1);
    expect(feedOpeningListener.close.calls.argsFor(0)[0]).toEqual(
      jasmine.any(Error)
    );
    expect(feedOpeningListener.close.calls.argsFor(0)[0].message).toBe(
      "DISCONNECTED: The transport disconnected."
    );
    expect(feedOpeningListener.action.calls.count()).toBe(0);

    expect(feedOpenListener.opening.calls.count()).toBe(0);
    expect(feedOpenListener.open.calls.count()).toBe(0);
    expect(feedOpenListener.close.calls.count()).toBe(1);
    expect(feedOpenListener.close.calls.argsFor(0).length).toBe(1);
    expect(feedOpenListener.close.calls.argsFor(0)[0]).toEqual(
      jasmine.any(Error)
    );
    expect(feedOpenListener.close.calls.argsFor(0)[0].message).toBe(
      "DISCONNECTED: The transport disconnected."
    );
    expect(feedOpenListener.action.calls.count()).toBe(0);

    expect(feedClosingListener.opening.calls.count()).toBe(0);
    expect(feedClosingListener.open.calls.count()).toBe(0);
    expect(feedClosingListener.close.calls.count()).toBe(1);
    expect(feedClosingListener.close.calls.argsFor(0).length).toBe(1);
    expect(feedClosingListener.close.calls.argsFor(0)[0]).toEqual(
      jasmine.any(Error)
    );
    expect(feedClosingListener.close.calls.argsFor(0)[0].message).toBe(
      "DISCONNECTED: The transport disconnected."
    );
    expect(feedClosingListener.action.calls.count()).toBe(0);
  });

  // Transport calls - N/A (reconnecting tested above)

  // Callbacks

  it("should call client.action() callbacks", async () => {
    harness = harnessFactory();
    await harness.connectClient();
    const cb = jasmine.createSpy();
    harness.client.action("SomeAction", { Action: "Arg" }, cb);

    // Have the transport disconnect
    harness.transport.state.and.returnValue("disconnected");
    await harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    expect(cb.calls.count()).toBe(1);
    expect(cb.calls.argsFor(0).length).toBe(1);
    expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
    expect(cb.calls.argsFor(0)[0].message).toBe(
      "DISCONNECTED: The transport disconnected."
    );
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

/*

All of the valid/expected message cases are tested thoroughly above, except
for ViolationResponse, ActionRevelation, and FeedTermination.

Tested here:
  Structurally invalid server messages
    Invalid JSON
    Schema failure
  Sequentially invalid server messages
    HandshakeResponse
    ActionResponse
    FeedOpenResponse
    FeedCloseResponse
  ViolationResponse messages
  ActionRevelation messages
  FeedTermination messages

*/

describe("structurally invalid server messages", () => {
  describe("if the message is invalid JSON", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const clientListener = harness.createClientListener();
      await harness.transport.emit("message", "bad json");

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "INVALID_MESSAGE: Invalid JSON or schema violation."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("if schema validation fails", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const clientListener = harness.createClientListener();
      await harness.transport.emit("message", "{}");

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "INVALID_MESSAGE: Invalid JSON or schema violation."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });
});

describe("sequentially invalid server messages", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  describe("unexpected HandshakeResponse - before Handshake", () => {
    // Can't test, since Handshake is sent synchronously on transport connect
  });

  describe("unexpected HandshakeResponse - another after HandshakeResponse", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "HandshakeResponse",
          Success: true,
          Version: "0.1"
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected HandshakeResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected ActionResponse - before HandshakeResponse", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect");

      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionResponse",
          CallbackId: "SOME_CALLBACK_ID",
          Success: true,
          ActionData: { Action: "Data" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected ActionResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected ActionResponse - unrecognized callback id", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionResponse",
          CallbackId: "SOME_CALLBACK_ID",
          Success: true,
          ActionData: { Action: "Data" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected ActionResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedOpenResponse - before HandshakeResponse", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect");

      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SOME_FEED_NAME",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedOpenResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedOpenResponse - server feed was understood to be closed", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SOME_FEED_NAME",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedOpenResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedOpenResponse - server feed was understood to be open", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SOME_FEED_NAME",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedOpenResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedOpenResponse - server feed was understood to be closing", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );
      feed.desireClosed();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SOME_FEED_NAME",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedOpenResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedCloseResponse - before HandshakeResponse", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect");

      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedCloseResponse",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedCloseResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedCloseResponse - server feed was understood to be closed", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedCloseResponse",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedCloseResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedCloseResponse - server feed was understood to be opening", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedCloseResponse",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedCloseResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedCloseResponse - server feed was understood to be open", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedCloseResponse",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedCloseResponse."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected ActionRevelation - before HandshakeResponse", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect");

      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionRevelation",
          ActionName: "SomeAction",
          ActionData: { Action: "Data" },
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedDeltas: [],
          FeedMd5: "123451234512345123451234"
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected ActionRevelation."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected ActionRevelation - server feed was understood to be closed", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionRevelation",
          ActionName: "SomeAction",
          ActionData: { Action: "Data" },
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedDeltas: [],
          FeedMd5: "123451234512345123451234"
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected ActionRevelation."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected ActionRevelation - server feed was understood to be opening", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "ActionRevelation",
          ActionName: "SomeAction",
          ActionData: { Action: "Data" },
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedDeltas: [],
          FeedMd5: "123451234512345123451234"
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected ActionRevelation."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedTermination - before HandshakeResponse", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      await harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      await harness.transport.emit("connect");

      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedTermination",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          ErrorCode: "SOME_ERROR_CODE",
          ErrorData: { Error: "Data" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedTermination."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedTermination - server feed was understood to be closed", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedTermination",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          ErrorCode: "SOME_ERROR_CODE",
          ErrorData: { Error: "Data" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedTermination."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  describe("unexpected FeedTermination - server feed was understood to be opening", () => {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", async () => {
      const harness = harnessFactory();
      await harness.connectClient();
      const feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      const clientListener = harness.createClientListener();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedTermination",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          ErrorCode: "SOME_ERROR_CODE",
          ErrorData: { Error: "Data" }
        })
      );

      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0).length).toBe(1);
      expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(clientListener.badServerMessage.calls.argsFor(0)[0].message).toBe(
        "UNEXPECTED_MESSAGE: Unexpected FeedTermination."
      );
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);
    });

    // Transport calls - N/A

    // Callbacks - N/A
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("Structurally/sequentially valid ViolationResponse message", () => {
  // State functions - N/A

  // Events - N/A

  it("should emit badClientMessage", async () => {
    const harness = harnessFactory();
    await harness.connectClient();
    const clientListener = harness.createClientListener();
    await harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "ViolationResponse",
        Diagnostics: { Diagnostic: "Data" }
      })
    );

    expect(clientListener.connecting.calls.count()).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(0);
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(1);
    expect(clientListener.badClientMessage.calls.argsFor(0).length).toBe(1);
    expect(clientListener.badClientMessage.calls.argsFor(0)[0]).toEqual({
      Diagnostic: "Data"
    });
    expect(clientListener.transportError.calls.count()).toBe(0);
  });

  // Transport calls - N/A

  // Callbacks - N/A
});

describe("Structurally/sequentially valid ActionRevelation message", () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  describe("if the server feed is open", () => {
    let harness;
    let feedWantedOpen;
    let feedWantedClosed;
    beforeEach(async () => {
      harness = harnessFactory();
      await harness.connectClient();
      feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );
    });

    describe("if there is an invalid feed delta", () => {
      // State functions

      it("state functions", async () => {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a ActionRevelation with a bad delta
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["an", "invalid", "path"],
                Value: 123
              }
            ]
          })
        );

        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(() => {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", async () => {
        const clientListener = harness.createClientListener();
        const feedWantedOpenListener = harness.createFeedListener(
          feedWantedOpen
        );
        const feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the transport emit a ActionRevelation with a bad delta
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["an", "invalid", "path"],
                Value: 123
              }
            ]
          })
        );

        // Check client events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0);
        expect(clientListener.badServerMessage.calls.count()).toBe(1);
        expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
          jasmine.any(Error)
        );
        expect(
          clientListener.badServerMessage.calls.argsFor(0)[0].message
        ).toBe(
          "INVALID_DELTA: Received ActionRevelation with contextually invalid feed delta."
        );
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);

        // Check feed events
        expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedWantedOpenListener.close.calls.count()).toBe(1);
        expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
        expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
          jasmine.any(Error)
        );
        expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
          "BAD_ACTION_REVELATION: The server passed an invalid feed delta."
        );
        expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });

      // Transport calls

      it("transport calls", async () => {
        harness.transport.spyClear();

        // Have the transport emit a ActionRevelation with a bad delta
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["an", "invalid", "path"],
                Value: 123
              }
            ]
          })
        );

        // Check transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(1); // FeedClose
        expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
          JSON.stringify({
            MessageType: "FeedClose",
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" }
          })
        );
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });

      // Callbacks - N/A
    });

    describe("if there is an invalid feed data hash", () => {
      // State functions

      it("state functions", async () => {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a ActionRevelation with a bad hash
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["validpath"],
                Value: 123
              }
            ],
            FeedMd5: "123456789012345678901234"
          })
        );

        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(() => {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", async () => {
        const clientListener = harness.createClientListener();
        const feedWantedOpenListener = harness.createFeedListener(
          feedWantedOpen
        );
        const feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the transport emit a ActionRevelation with a bad hash
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["validpath"],
                Value: 123
              }
            ],
            FeedMd5: "123456789012345678901234"
          })
        );

        // Check client events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0);
        expect(clientListener.badServerMessage.calls.count()).toBe(1);
        expect(clientListener.badServerMessage.calls.argsFor(0)[0]).toEqual(
          jasmine.any(Error)
        );
        expect(
          clientListener.badServerMessage.calls.argsFor(0)[0].message
        ).toBe("INVALID_HASH: Feed data MD5 verification failed.");
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);

        // Check feed events
        expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedWantedOpenListener.close.calls.count()).toBe(1);
        expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
        expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
          jasmine.any(Error)
        );
        expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
          "BAD_ACTION_REVELATION: Hash verification failed."
        );
        expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });

      // Transport calls

      it("transport calls", async () => {
        harness.transport.spyClear();

        // Have the transport emit a ActionRevelation with a bad hash
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["validpath"],
                Value: 123
              }
            ],
            FeedMd5: "123456789012345678901234"
          })
        );

        // Check transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(1); // FeedClose
        expect(harness.transport.send.calls.argsFor(0)[0]).toBe(
          JSON.stringify({
            MessageType: "FeedClose",
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" }
          })
        );
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });

      // Callbacks - N/A
    });

    describe("if the revelation is valid", () => {
      // State functions

      it("state functions", async () => {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a valid ActionRevelation
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["Feed"],
                Value: "Data2"
              }
            ],
            FeedMd5: "wh+CI4D0VYuSbmN8BzeSxA=="
          })
        );

        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data2" });
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(() => {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", async () => {
        const clientListener = harness.createClientListener();
        const feedWantedOpenListener = harness.createFeedListener(
          feedWantedOpen
        );
        const feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the transport emit a valid ActionRevelation
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["Feed"],
                Value: "Data2"
              }
            ],
            FeedMd5: "wh+CI4D0VYuSbmN8BzeSxA=="
          })
        );

        // Check client events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0);
        expect(clientListener.badServerMessage.calls.count()).toBe(0);
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);

        // Check feed events
        expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedWantedOpenListener.action.calls.count()).toBe(1);
        expect(feedWantedOpenListener.action.calls.argsFor(0).length).toBe(4);
        expect(feedWantedOpenListener.action.calls.argsFor(0)[0]).toBe(
          "SomeAction"
        );
        expect(feedWantedOpenListener.action.calls.argsFor(0)[1]).toEqual({
          Action: "Data"
        });
        expect(feedWantedOpenListener.action.calls.argsFor(0)[2]).toEqual({
          Feed: "Data2"
        });
        expect(feedWantedOpenListener.action.calls.argsFor(0)[3]).toEqual({
          Feed: "Data"
        });
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });

      // Transport calls

      it("transport calls", async () => {
        harness.transport.spyClear();

        // Have the transport emit a valid ActionRevelation
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["Feed"],
                Value: "Data2"
              }
            ],
            FeedMd5: "wh+CI4D0VYuSbmN8BzeSxA=="
          })
        );

        // Check transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });

      // Callbacks - N/A
    });
  });

  describe("if the server feed is closing", () => {
    let harness;
    let feed;
    beforeEach(async () => {
      harness = harnessFactory();
      await harness.connectClient();
      feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );

      feed.desireClosed();

      await delay(DEFER_MS); // Flush events
    });

    describe("if there is an invalid feed delta", () => {
      // State functions

      it("state functions", async () => {
        // Check state functions
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(() => {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a ActionRevelation with a bad delta
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["an", "invalid", "path"],
                Value: 123
              }
            ]
          })
        );

        // Check state functions
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(() => {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", async () => {
        const clientListener = harness.createClientListener();
        const feedListener = harness.createFeedListener(feed);

        // Have the transport emit a ActionRevelation with a bad delta
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["an", "invalid", "path"],
                Value: 123
              }
            ]
          })
        );

        // Check client events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0);
        expect(clientListener.badServerMessage.calls.count()).toBe(0); // Message discarded due to closing - never processed
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);

        // Check feed events
        expect(feedListener.opening.calls.count()).toBe(0);
        expect(feedListener.open.calls.count()).toBe(0);
        expect(feedListener.close.calls.count()).toBe(0);
        expect(feedListener.action.calls.count()).toBe(0);
      });

      // Transport calls

      it("transport calls", async () => {
        harness.transport.spyClear();

        // Have the transport emit a ActionRevelation with a bad delta
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["an", "invalid", "path"],
                Value: 123
              }
            ]
          })
        );

        // Check transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0); // No need to FeedClose
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });

      // Callbacks - N/A
    });

    describe("if there is an invalid feed data hash", () => {
      // State functions

      it("state functions", async () => {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(() => {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a ActionRevelation with a bad hash
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["validpath"],
                Value: 123
              }
            ],
            FeedMd5: "123456789012345678901234"
          })
        );

        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(() => {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", async () => {
        const clientListener = harness.createClientListener();
        const feedListener = harness.createFeedListener(feed);

        // Have the transport emit a ActionRevelation with a bad hash
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["validpath"],
                Value: 123
              }
            ],
            FeedMd5: "123456789012345678901234"
          })
        );

        // Check client events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0);
        expect(clientListener.badServerMessage.calls.count()).toBe(0); // Discarded before process
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);

        // Check feed events
        expect(feedListener.opening.calls.count()).toBe(0);
        expect(feedListener.open.calls.count()).toBe(0);
        expect(feedListener.close.calls.count()).toBe(0);
        expect(feedListener.action.calls.count()).toBe(0);
      });

      // Transport calls

      it("transport calls", async () => {
        harness.transport.spyClear();

        // Have the transport emit a ActionRevelation with a bad hash
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["validpath"],
                Value: 123
              }
            ],
            FeedMd5: "123456789012345678901234"
          })
        );

        // Check transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0); // No need to FeedClose
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });

      // Callbacks - N/A
    });

    describe("if the revelation is valid", () => {
      // State functions

      it("state functions", async () => {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(() => {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a valid ActionRevelation
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["Feed"],
                Value: "Data2"
              }
            ],
            FeedMd5: "wh+CI4D0VYuSbmN8BzeSxA=="
          })
        );

        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(() => {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", async () => {
        const clientListener = harness.createClientListener();
        const feedListener = harness.createFeedListener(feed);
        const actionNameSpy = jasmine.createSpy();
        feed.on("action:SomeAction", actionNameSpy);

        // Have the transport emit a valid ActionRevelation
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["Feed"],
                Value: "Data2"
              }
            ],
            FeedMd5: "wh+CI4D0VYuSbmN8BzeSxA=="
          })
        );

        // Check client events
        expect(clientListener.connecting.calls.count()).toBe(0);
        expect(clientListener.connect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.count()).toBe(0);
        expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0);
        expect(clientListener.badServerMessage.calls.count()).toBe(0);
        expect(clientListener.badClientMessage.calls.count()).toBe(0);
        expect(clientListener.transportError.calls.count()).toBe(0);

        // Check feed events
        expect(feedListener.opening.calls.count()).toBe(0);
        expect(feedListener.open.calls.count()).toBe(0);
        expect(feedListener.close.calls.count()).toBe(0);
        expect(feedListener.action.calls.count()).toBe(0);
        expect(actionNameSpy.calls.count()).toBe(0);
      });

      // Transport calls

      it("transport calls", async () => {
        harness.transport.spyClear();

        // Have the transport emit a valid ActionRevelation
        await harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "ActionRevelation",
            ActionName: "SomeAction",
            ActionData: { Action: "Data" },
            FeedName: "SomeFeed",
            FeedArgs: { Feed: "Arg" },
            FeedDeltas: [
              {
                Operation: "Set",
                Path: ["Feed"],
                Value: "Data2"
              }
            ],
            FeedMd5: "wh+CI4D0VYuSbmN8BzeSxA=="
          })
        );

        // Check transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });

      // Callbacks - N/A
    });
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });
});

describe("Structurally/sequentially valid FeedTermination message", () => {
  describe("when the server feed is open", () => {
    let harness;
    let feedWantedOpen;
    let feedWantedClosed;
    beforeEach(async () => {
      harness = harnessFactory();
      await harness.connectClient();
      feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );
    });

    // State functions

    it("state functions", async () => {
      // Check state functions
      expect(harness.client.state()).toBe("connected");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("open");
      expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Have the transport emit a FeedTermination
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedTermination",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          ErrorCode: "SOME_ERROR_CODE",
          ErrorData: { Error: "Data" }
        })
      );

      // Check state functions
      expect(harness.client.state()).toBe("connected");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(() => {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(() => {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    // Events - client and feed

    it("events", async () => {
      const clientListener = harness.createClientListener();
      const feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      const feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Have the transport emit a FeedTermination
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedTermination",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          ErrorCode: "SOME_ERROR_CODE",
          ErrorData: { Error: "Data" }
        })
      );

      // Check client events
      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(0);
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);

      // Check feed events
      expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
      expect(feedWantedOpenListener.open.calls.count()).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(1);
      expect(feedWantedOpenListener.close.calls.argsFor(0).length).toBe(1);
      expect(feedWantedOpenListener.close.calls.argsFor(0)[0]).toEqual(
        jasmine.any(Error)
      );
      expect(feedWantedOpenListener.close.calls.argsFor(0)[0].message).toBe(
        "TERMINATED: The server terminated the feed."
      );
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);
    });

    // Transport calls

    it("transport calls", async () => {
      harness.transport.spyClear();

      // Have the transport emit a FeedTermination
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedTermination",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          ErrorCode: "SOME_ERROR_CODE",
          ErrorData: { Error: "Data" }
        })
      );

      // Check transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });

    // Callbacks - N/A
  });

  describe("when the server feed is closing", () => {
    let harness;
    let feed;
    beforeEach(async () => {
      harness = harnessFactory();
      await harness.connectClient();
      feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );

      feed.desireClosed();

      await delay(DEFER_MS); // Flush events
    });
    // State functions

    it("state functions", async () => {
      // Check state functions
      expect(harness.client.state()).toBe("connected");
      expect(feed.desiredState()).toBe("closed");
      expect(feed.state()).toBe("closed");
      expect(() => {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Have the transport emit a FeedTermination
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedTermination",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          ErrorCode: "SOME_ERROR_CODE",
          ErrorData: { Error: "Data" }
        })
      );

      // Check state functions
      expect(harness.client.state()).toBe("connected");
      expect(feed.desiredState()).toBe("closed");
      expect(feed.state()).toBe("closed");
      expect(() => {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    // Events - client and feed

    it("events", async () => {
      const clientListener = harness.createClientListener();
      const feedListener = harness.createFeedListener(feed);

      // Have the transport emit a FeedTermination
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedTermination",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          ErrorCode: "SOME_ERROR_CODE",
          ErrorData: { Error: "Data" }
        })
      );

      // Check client events
      expect(clientListener.connecting.calls.count()).toBe(0);
      expect(clientListener.connect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.count()).toBe(0);
      expect(clientListener.disconnect.calls.argsFor(0).length).toBe(0);
      expect(clientListener.badServerMessage.calls.count()).toBe(0);
      expect(clientListener.badClientMessage.calls.count()).toBe(0);
      expect(clientListener.transportError.calls.count()).toBe(0);

      // Check feed events
      expect(feedListener.opening.calls.count()).toBe(0);
      expect(feedListener.open.calls.count()).toBe(0);
      expect(feedListener.close.calls.count()).toBe(0);
      expect(feedListener.action.calls.count()).toBe(0);
    });

    // Transport calls

    it("transport calls", async () => {
      harness.transport.spyClear();

      // Have the transport emit a FeedTermination
      await harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedTermination",
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          ErrorCode: "SOME_ERROR_CODE",
          ErrorData: { Error: "Data" }
        })
      );

      // Check transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });

    // Callbacks - N/A
  });
});
