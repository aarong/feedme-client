/*

Build integration/functional tests run on Node and in the browser.
Assume an in-scope feedmeClient() factory function.

Tests API promises in the user documentation, ensures that the client
interacts appropriately with the transport, and ensures that messages
send via the transport abide by the Feedme spec.

1. Do configuration options work as documented?
2. Do app-initiated operations work as documented?
3. Do transport-initiated operations work as documented?

There is no access to external modules (also runs in the browser), so
basic event emitter functionality for the transport is included inline.

*/
var epsilon = 1;

var harnessProto = {};
var harnessFactory = function(options) {
  // Mock transport is added to any other specified options
  options = options || {};
  var harness = Object.create(harnessProto);

  // Create the transport basics
  var t = {};
  harness.transport = t;
  options.transport = t;

  // Transport event emitter fuctionality
  t._listeners = {}; // properties are arrays
  t.on = function(event, listener) {
    if (!t._listeners[event]) {
      t._listeners[event] = [];
    }
    t._listeners[event].push(listener);
  };
  t.emit = function(event, arg) {
    // max one arg
    if (t._listeners[event]) {
      for (var i = 0; i < t._listeners[event].length; i++) {
        if (arg !== undefined) {
          t._listeners[event][i](arg);
        } else {
          t._listeners[event][i]();
        }
      }
    }
  };

  // Transport spies
  t.connect = jasmine.createSpy();
  t.send = jasmine.createSpy();
  t.disconnect = jasmine.createSpy();
  t.state = jasmine.createSpy();
  t.state.and.returnValue("disconnected");
  t.spyClear = function() {
    t.connect.calls.reset();
    t.send.calls.reset();
    t.disconnect.calls.reset();
    t.state.calls.reset();
  };

  // Create the client
  harness.client = feedmeClient(options);

  return harness;
};

harnessProto.createClientListener = function() {
  var l = {
    connecting: jasmine.createSpy(),
    connect: jasmine.createSpy(),
    disconnect: jasmine.createSpy(),
    badServerMessage: jasmine.createSpy(),
    badClientMessage: jasmine.createSpy(),
    transportError: jasmine.createSpy()
  };
  l.spyClear = function() {
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

harnessProto.createFeedListener = function(feed) {
  var l = {
    opening: jasmine.createSpy(),
    open: jasmine.createSpy(),
    close: jasmine.createSpy(),
    action: jasmine.createSpy()
  };
  l.spyClear = function() {
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

harnessProto.connectClient = function() {
  this.client.connect();
  this.transport.state.and.returnValue("connecting");
  this.transport.emit("connecting");
  this.transport.state.and.returnValue("connected");
  this.transport.emit("connect");
  this.transport.emit(
    "message",
    JSON.stringify({
      MessageType: "HandshakeResponse",
      Success: true,
      Version: "0.1",
      ClientId: "SOME_CLIENT_ID"
    })
  );
};

/*

Configuration tests and associated functionality.
Ensure that initialization options behave as documented.

*/

describe("The connectTimeoutMs option", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  it("if greater than zero, should time out appropriately", function() {
    var opts = {
      connectTimeoutMs: 1000
    };
    var harness = harnessFactory(opts);
    var clientListener = harness.createClientListener();

    // Begin connection attempt
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    harness.transport.emit("connecting");

    // Advance to immediately before the timeout and verify that
    // transport.disconnect() was not called
    harness.transport.spyClear();
    jasmine.clock().tick(opts.connectTimeoutMs - epsilon);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    expect(harness.transport.state.calls.count()).toBe(0);

    // Advance to immediately after the timeout and ensure that
    // transport.disconnect() was called
    harness.transport.spyClear();
    jasmine.clock().tick(2 * epsilon);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(1);
    for (var i = 0; i < harness.transport.state.calls.count(); i++) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }

    // Emit transport disconnect and check the client disconnect event
    clientListener.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("TIMEOUT: ..."));
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

  it("if zero, should never time out", function() {
    var opts = {
      connectTimeoutMs: 0
    };
    var harness = harnessFactory(opts);
    var clientListener = harness.createClientListener();

    // Begin connection attempt
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    harness.transport.emit("connecting");

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

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The connectRetryMs option", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  it("if greater than zero, should wait appropriately between connection retries", function() {
    var opts = {
      connectRetryMs: 1000
    };
    var harness = harnessFactory(opts);
    var clientListener = harness.createClientListener();

    // Begin connection attempt and have it fail
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    harness.transport.emit("connecting");
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    // Advance to immediately before the retry and verify that
    // transport.connect() was not called
    harness.transport.spyClear();
    jasmine.clock().tick(opts.connectRetryMs - epsilon);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    expect(harness.transport.state.calls.count()).toBe(0);

    // Advance to immediately after the retry and ensure that
    // transport.connect() was called
    harness.transport.spyClear();
    jasmine.clock().tick(2 * epsilon);
    expect(harness.transport.connect.calls.count()).toBe(1);
    expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (var i = 0; i < harness.transport.state.calls.count(); i++) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }

    // Emit transport connecting and check the client connecting event
    clientListener.spyClear();
    harness.transport.state.and.returnValue("connecting");
    harness.transport.emit("connecting");
    expect(clientListener.connecting.calls.count()).toBe(1);
    expect(clientListener.connecting.calls.argsFor(0).length).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(0);
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(0);
  });

  it("if zero, should immediately attempt a connection retry", function() {
    var opts = {
      connectRetryMs: 0
    };
    var harness = harnessFactory(opts);
    var clientListener = harness.createClientListener();

    // Begin connection attempt
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    harness.transport.emit("connecting");

    // Have the connection attempt fail, and verify that there is an
    // immediate call to transport.connect()
    harness.transport.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("FAILURE: ..."));
    jasmine.clock().tick(0); // The retry is async
    expect(harness.transport.connect.calls.count()).toBe(1);
    expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (var i = 0; i < harness.transport.state.calls.count(); i++) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }

    // Emit transport connecting and check the client connecting event
    clientListener.spyClear();
    harness.transport.state.and.returnValue("connecting");
    harness.transport.emit("connecting");
    expect(clientListener.connecting.calls.count()).toBe(1);
    expect(clientListener.connecting.calls.argsFor(0).length).toBe(0);
    expect(clientListener.connect.calls.count()).toBe(0);
    expect(clientListener.disconnect.calls.count()).toBe(0);
    expect(clientListener.badServerMessage.calls.count()).toBe(0);
    expect(clientListener.badClientMessage.calls.count()).toBe(0);
    expect(clientListener.transportError.calls.count()).toBe(0);
  });

  it("if less than zero, should not attempt a connection retry", function() {
    var opts = {
      connectRetryMs: -1
    };
    var harness = harnessFactory(opts);
    var clientListener = harness.createClientListener();

    // Begin connection attempt
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    harness.transport.emit("connecting");

    // Have the connection attempt fail and verify that there is no subsequent
    // call to transport.connect()
    harness.transport.spyClear();
    clientListener.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("FAILURE: ..."));
    jasmine.clock().tick(Number.MAX_SAFE_INTEGER);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (var i = 0; i < harness.transport.state.calls.count(); i++) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }
  });

  it("should not attempt a reconnect on HANDSHAKE_REJECTED failure", function() {
    var opts = {
      connectRetryMs: 1000
    };
    var harness = harnessFactory(opts);
    var clientListener = harness.createClientListener();

    // Connect the transport
    harness.client.connect();
    harness.transport.state.and.returnValue("connecting");
    harness.transport.emit("connecting");
    harness.transport.state.and.returnValue("connected");
    harness.transport.emit("connect");

    // Have the trensport reject the handshake and verify that there is
    // a subsequent call to transport.disconnect(err) and no call to
    // transport.connect()
    harness.transport.spyClear();
    harness.transport.emit(
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
    for (var i = 0; i <= harness.transport.state.calls.count(); i++) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }

    // Emit transport disconnect, advance forever, and check that
    // transport.connect() is never called
    harness.transport.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit(
      "disconnect",
      new Error("HANDSHAKE_REJECTED: The server rejected the handshake.")
    );
    jasmine.clock().tick(Number.MAX_SAFE_INTEGER);
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (var i = 0; i <= harness.transport.state.calls.count(); i++) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The connectRetryBackoffMs and connectRetryMaxMs options", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  it("should back off as configured", function() {
    var opts = {
      connectRetryMs: 1000,
      connectRetryBackoffMs: 1000,
      connectRetryMaxMs: 10000
    };
    var harness = harnessFactory(opts);

    // Run a bunch of retries
    harness.client.connect();
    for (var i = 0; i < 20; i++) {
      // How long should it wait?
      var ms = Math.min(
        opts.connectRetryMs + i * opts.connectRetryBackoffMs,
        opts.connectRetryMaxMs
      );

      // Begin connection attempt and have it fail
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect", new Error("FAILURE: ..."));

      // Advance to immediately before the retry and verify that
      // transport.connect() was not called
      harness.transport.spyClear();
      jasmine.clock().tick(ms - epsilon);
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count()).toBe(0);

      // Advance to immediately after the retry and ensure that
      // transport.connect() was called
      harness.transport.spyClear();
      jasmine.clock().tick(2 * epsilon);
      expect(harness.transport.connect.calls.count()).toBe(1);
      expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      for (var j = 0; j < harness.transport.state.calls.count(); j++) {
        expect(harness.transport.state.calls.argsFor(j).length).toBe(0);
      }
    }
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The connectRetryMaxAttempts option", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  it("if greater than zero, should stop connection retries as configured", function() {
    var opts = {
      connectRetryMs: 0,
      connectRetryBackoffMs: 0,
      connectRetryMaxAttempts: 10
    };
    var harness = harnessFactory(opts);

    // Run a bunch of retries
    harness.client.connect();
    for (var i = 0; i <= opts.connectRetryMaxAttempts; i++) {
      // Begin connection attempt and have it fail
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect", new Error("FAILURE: ..."));

      // Advance to immediately after the retry and ensure that
      // transport.connect() was called if fewer than max retries and
      // not called otherwise
      harness.transport.spyClear();
      jasmine.clock().tick(0); // async
      if (i < opts.connectRetryMaxAttempts) {
        expect(harness.transport.connect.calls.count()).toBe(1);
        expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
      } else {
        expect(harness.transport.connect.calls.count()).toBe(0);
      }
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      for (var j = 0; j < harness.transport.state.calls.count(); j++) {
        expect(harness.transport.state.calls.argsFor(j).length).toBe(0);
      }
    }
  });

  it("if zero, should always make connection retries", function() {
    var opts = {
      connectRetryMs: 0,
      connectRetryBackoffMs: 0,
      connectRetryMaxAttempts: 0
    };
    var harness = harnessFactory(opts);

    // Run a bunch of retries
    harness.client.connect();
    for (var i = 0; i <= 100; i++) {
      // Begin connection attempt and have it fail
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect", new Error("FAILURE: ..."));

      // Advance to immediately after the retry and ensure that
      // transport.connect() was called
      harness.transport.spyClear();
      jasmine.clock().tick(0); // async
      expect(harness.transport.connect.calls.count()).toBe(1);
      expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      for (var j = 0; j < harness.transport.state.calls.count(); j++) {
        expect(harness.transport.state.calls.argsFor(j).length).toBe(0);
      }
    }
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The actionTimeoutMs option", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  it("if greater than zero, should timeout as configured", function() {
    var opts = {
      actionTimeoutMs: 1000
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Invoke the action
    var cb = jasmine.createSpy();
    var cbLate = jasmine.createSpy();
    harness.client.action("SomeAction", { Some: "Args" }, cb, cbLate);

    // Advance to immediately before the timeout and ensure that
    // neither callback was called
    jasmine.clock().tick(opts.actionTimeoutMs - epsilon);
    expect(cb.calls.count()).toBe(0);
    expect(cbLate.calls.count()).toBe(0);

    // Advance to immediately after the timeout and ensure that cb was called
    jasmine.clock().tick(2 * epsilon);
    expect(cb.calls.count()).toBe(1);
    expect(cb.calls.argsFor(0).length).toBe(1);
    expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
    expect(cb.calls.argsFor(0)[0].message).toBe(
      "TIMEOUT: The server did not respond within the allocated time."
    );
    expect(cbLate.calls.count()).toBe(0);
  });

  it("if zero, should never timeout", function() {
    var opts = {
      actionTimeoutMs: 0
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Invoke the action
    var cb = jasmine.createSpy();
    var cbLate = jasmine.createSpy();
    harness.client.action("SomeAction", { Some: "Args" }, cb, cbLate);

    // Advance to the end of time and ensure no callbacks
    jasmine.clock().tick(Number.MAX_SAFE_INTEGER);
    expect(cb.calls.count()).toBe(0);
    expect(cbLate.calls.count()).toBe(0);
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The feedTimeoutMs option", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  it("if greater than zero, should timeout as configured", function() {
    var opts = {
      feedTimeoutMs: 1000
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Ask to open the feed
    var feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();

    // Advance to immediately before the timeout and ensure that no events have fired
    var feedListener = harness.createFeedListener(feed);
    jasmine.clock().tick(opts.feedTimeoutMs - epsilon);
    expect(feedListener.opening.calls.count()).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);

    // Advance to immediately after the timeout and ensure that close was fired
    jasmine.clock().tick(2 * epsilon);
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

  it("if zero, should never timeout", function() {
    var opts = {
      feedTimeoutMs: 0
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Ask to open the feed
    var feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();

    // Advance to the end of time and ensure that no events have fired
    var feedListener = harness.createFeedListener(feed);
    jasmine.clock().tick(Math.MAX_SAFE_INTEGER);
    expect(feedListener.opening.calls.count()).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The reconnect option", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  it("if true, should reconnect if the connection fails", function() {
    var opts = {
      reconnect: true
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Disconnect the transport and ensure that transport.connect() is called
    harness.transport.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("FAILURE: ..."));
    expect(harness.transport.connect.calls.count()).toBe(1);
    expect(harness.transport.connect.calls.argsFor(0).length).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (var i = 0; i < harness.transport.state.calls.count(); i++) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }
  });

  it("if false, should not reconnect if the connection fails", function() {
    var opts = {
      reconnect: false
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Disconnect the transport and ensure that transport.connect() is not called
    harness.transport.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("FAILURE: ..."));
    expect(harness.transport.connect.calls.count()).toBe(0);
    expect(harness.transport.send.calls.count()).toBe(0);
    expect(harness.transport.disconnect.calls.count()).toBe(0);
    for (var i = 0; i < harness.transport.state.calls.count(); i++) {
      expect(harness.transport.state.calls.argsFor(i).length).toBe(0);
    }
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The reopenMaxAttempts and reopenTrailingMs options", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  it("if reopenMaxAttempts is negative, should always try to re-open the feed", function() {
    var opts = {
      reopenMaxAttempts: -1
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Open the feed
    var feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();
    harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        Success: true,
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" },
        FeedData: {}
      })
    );

    var feedListener = harness.createFeedListener(feed);
    for (i = 0; i < 20; i++) {
      feedListener.spyClear();

      // Transmit a bad action revelation; the session will ask to close the feed
      harness.transport.emit(
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
      harness.transport.emit(
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
      harness.transport.emit(
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

  it("if reopenMaxAttempts is zero, should not try to re-open the feed", function() {
    var opts = {
      reopenMaxAttempts: 0
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Open the feed
    var feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();
    harness.transport.emit(
      "message",
      JSON.stringify({
        MessageType: "FeedOpenResponse",
        Success: true,
        FeedName: "SomeFeed",
        FeedArgs: { Feed: "Args" },
        FeedData: {}
      })
    );

    var feedListener = harness.createFeedListener(feed);

    // Transmit a bad action revelation; the session will ask to close the feed
    harness.transport.emit(
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
    harness.transport.emit(
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

  it("if reopenMaxAttempts is positive and reopenTrailingMs is positive, should respect that limit", function() {
    var opts = {
      reopenMaxAttempts: 5,
      reopenTrailingMs: 1000
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Open the feed
    var feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();
    harness.transport.emit(
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
    var feedListener = harness.createFeedListener(feed);
    for (i = 0; i < opts.reopenMaxAttempts; i++) {
      // Transmit a bad action revelation; the session will ask to close the feed
      harness.transport.emit(
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
      harness.transport.emit(
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
      harness.transport.emit(
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
    harness.transport.emit(
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
    harness.transport.emit(
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
    expect(feedListener.opening.calls.count()).toBe(1);
    expect(feedListener.opening.calls.argsFor(0).length).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);
  });

  it("if reopenMaxAttempts is positive and reopenTrailingMs is zero, should respect that limit over the duration of the connection", function() {
    var opts = {
      reopenMaxAttempts: 5,
      reopenTrailingMs: 0
    };
    var harness = harnessFactory(opts);
    harness.connectClient();

    // Open the feed
    var feed = harness.client.feed("SomeFeed", { Feed: "Args" });
    feed.desireOpen();
    harness.transport.emit(
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
    var feedListener = harness.createFeedListener(feed);
    for (i = 0; i < opts.reopenMaxAttempts; i++) {
      // Transmit a bad action revelation; the session will ask to close the feed
      harness.transport.emit(
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
      harness.transport.emit(
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
      harness.transport.emit(
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
    harness.transport.emit(
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
    harness.transport.emit(
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
    harness.client.disconnect();
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect");
    feedListener.spyClear();
    harness.connectClient();
    expect(feedListener.opening.calls.count()).toBe(1);
    expect(feedListener.opening.calls.argsFor(0).length).toBe(0);
    expect(feedListener.open.calls.count()).toBe(0);
    expect(feedListener.close.calls.count()).toBe(0);
    expect(feedListener.action.calls.count()).toBe(0);
  });

  afterEach(function() {
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
      client.id()
      feed.desiredState()
      feed.state()
      feed.data()
  - Client and feed events
  - Transport calls
  - Callbacks

*/

describe("The client.connect() function", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  // Errors and return values

  describe("throw and return", function() {
    it("should throw if connecting", function() {
      var harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      expect(function() {
        harness.client.connect();
      }).toThrow(new Error("INVALID_STATE: Already connecting or connected."));
    });

    it("should throw if connected", function() {
      var harness = harnessFactory();
      harness.connectClient();
      expect(function() {
        harness.client.connect();
      }).toThrow(new Error("INVALID_STATE: Already connecting or connected."));
    });

    it("should return nothing on success", function() {
      var harness = harnessFactory();
      expect(harness.client.connect()).toBeUndefined();
    });
  });

  // Client and feed state functions

  describe("client and feed state function effects", function() {
    it("should work correctly through a successful connection cycle", function() {
      // Create a disconnected client and feed objects
      var harness = harnessFactory();
      var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Check all state functions
      expect(harness.client.state()).toBe("disconnected");
      expect(function() {
        harness.client.id();
      }).toThrow(new Error("INVALID_STATE: Not connected."));
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Call client.connect() and have the transport emit connecting
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");

      // Check all state functions
      expect(harness.client.state()).toBe("connecting");
      expect(function() {
        harness.client.id();
      }).toThrow(new Error("INVALID_STATE: Not connected."));
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Have the transport emit connect and emit a successful handshake response
      // so that the client becomes connected
      harness.transport.state.and.returnValue("connected");
      harness.transport.emit("connect");
      harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "HandshakeResponse",
          Success: true,
          Version: "0.1",
          ClientId: "SOME_CLIENT_ID"
        })
      );

      // Check all state functions
      expect(harness.client.state()).toBe("connected");
      expect(harness.client.id()).toBe("SOME_CLIENT_ID");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("opening");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Have the transport return success to feed open request
      harness.transport.emit(
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
      expect(harness.client.id()).toBe("SOME_CLIENT_ID");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("open");
      expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    describe("should work correctly through a failing connection cycle", function() {
      var harness;
      var feedWantedOpen;
      var feedWantedClosed;
      beforeEach(function() {
        // Create a connecting client and two feeds
        harness = harnessFactory();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        harness.client.connect();
        harness.transport.state.and.returnValue("connecting");
        harness.transport.emit("connecting");
      });

      it("if due to timeout, should update appropriately", function() {
        // Trigger the timeout
        jasmine
          .clock()
          .tick(harness.client._options.connectTimeoutMs + epsilon);
        // The client will disconnect the transport
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit(
          "disconnect",
          harness.transport.disconnect.calls.argsFor(0)[0]
        );

        // Check all state functions
        expect(harness.client.state()).toBe("disconnected");
        expect(function() {
          harness.client.id();
        }).toThrow(new Error("INVALID_STATE: Not connected."));
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(function() {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("if due to app call to client.disconnect(), should update appropriately", function() {
        // Have the client disconnect
        harness.client.disconnect();
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit("disconnect"); // Requested

        // Check all state functions
        expect(harness.client.state()).toBe("disconnected");
        expect(function() {
          harness.client.id();
        }).toThrow(new Error("INVALID_STATE: Not connected."));
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(function() {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("if due to transport internal failure, should update appropriately", function() {
        // Have the transport disconnect
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit("disconnect", new Error("FAILURE: ..."));

        // Check all state functions
        expect(harness.client.state()).toBe("disconnected");
        expect(function() {
          harness.client.id();
        }).toThrow(new Error("INVALID_STATE: Not connected."));
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(function() {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("if due to handshake rejection, should update appropriately", function() {
        // Have the transport connect and emit a handshake failure
        harness.transport.state.and.returnValue("connected");
        harness.transport.emit("connect");
        harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: false
          })
        ); // The client will disconnect the transport
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit(
          "disconnect",
          harness.transport.disconnect.calls.argsFor(0)[0]
        );

        // Check all state functions
        expect(harness.client.state()).toBe("disconnected");
        expect(function() {
          harness.client.id();
        }).toThrow(new Error("INVALID_STATE: Not connected."));
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(function() {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });
    });
  });

  // Client and feed events

  describe("client and feed event effects", function() {
    it("should work correctly through a successful connection cycle", function() {
      // Create a disconnected client and feed objects
      var harness = harnessFactory();
      var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Create listeners
      var clientListener = harness.createClientListener();
      var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      var feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Call client.connect() and have the transport emit connecting
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");

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
      harness.transport.emit("connect");
      harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "HandshakeResponse",
          Success: true,
          Version: "0.1",
          ClientId: "SOME_CLIENT_ID"
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
      harness.transport.emit(
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
      expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
      expect(feedWantedOpenListener.close.calls.count()).toBe(0);
      expect(feedWantedOpenListener.action.calls.count()).toBe(0);
      expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
      expect(feedWantedClosedListener.open.calls.count()).toBe(0);
      expect(feedWantedClosedListener.close.calls.count()).toBe(0);
      expect(feedWantedClosedListener.action.calls.count()).toBe(0);
    });

    describe("should work correctly through a failing connection cycle", function() {
      var harness;
      var feedWantedOpen;
      var feedWantedClosed;
      beforeEach(function() {
        // Create a connecting client and two feeds
        harness = harnessFactory();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        harness.client.connect();
        harness.transport.state.and.returnValue("connecting");
        harness.transport.emit("connecting");
      });

      it("if due to timeout, should update appropriately", function() {
        // Create listeners
        var clientListener = harness.createClientListener();
        var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
        var feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Trigger the timeout
        jasmine
          .clock()
          .tick(harness.client._options.connectTimeoutMs + epsilon);
        // The client will disconnect the transport
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit(
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

      it("if due to app call to client.disconnect(), should update appropriately", function() {
        // Create listeners
        var clientListener = harness.createClientListener();
        var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
        var feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the client disconnect
        harness.client.disconnect();
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit("disconnect"); // Requested

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

      it("if due to transport internal failure, should update appropriately", function() {
        // Create listeners
        var clientListener = harness.createClientListener();
        var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
        var feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the transport disconnect
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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

      it("if due to handshake rejection, should update appropriately", function() {
        // Create listeners
        var clientListener = harness.createClientListener();
        var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
        var feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the transport connect and emit a handshake failure
        harness.transport.state.and.returnValue("connected");
        harness.transport.emit("connect");
        harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: false
          })
        ); // The client will disconnect the transport
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit(
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

  describe("transport calls", function() {
    describe("should work correctly through a successful connection cycle", function() {
      it("if a feed is desired open, make appropriate transport calls", function() {
        // Create a disconnected client and feed objects
        var harness = harnessFactory();
        var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
        harness.transport.emit("connecting");

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport emit connect
        harness.transport.state.and.returnValue("connected");
        harness.transport.emit("connect");

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
        harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: true,
            Version: "0.1",
            ClientId: "SOME_CLIENT_ID"
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
        harness.transport.emit(
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

      it("if no feeds are desired open, make appropriate transport calls", function() {
        // Create a disconnected client and feed objects
        var harness = harnessFactory();
        var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
        harness.transport.emit("connecting");

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport emit connect
        harness.transport.state.and.returnValue("connected");
        harness.transport.emit("connect");

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
        harness.transport.emit(
          "message",
          JSON.stringify({
            MessageType: "HandshakeResponse",
            Success: true,
            Version: "0.1",
            ClientId: "SOME_CLIENT_ID"
          })
        );

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);
      });
    });

    describe("should work correctly through a failing connection cycle", function() {
      var harness;
      var feedWantedOpen;
      beforeEach(function() {
        // Create a connecting client and two feeds
        harness = harnessFactory();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        harness.client.connect();
        harness.transport.state.and.returnValue("connecting");
        harness.transport.emit("connecting");
      });

      it("if due to timeout, should be appropriate", function() {
        // Reset transport spies
        harness.transport.spyClear();

        // Trigger the timeout
        jasmine
          .clock()
          .tick(harness.client._options.connectTimeoutMs + epsilon);
        // The client will disconnect the transport
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit(
          "disconnect",
          harness.transport.disconnect.calls.argsFor(0)[0]
        );

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

      it("if due to app call to client.disconnect(), should be appropriate", function() {
        // Reset transport spies
        harness.transport.spyClear();

        // Have the client disconnect
        harness.client.disconnect();
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit("disconnect"); // Requested

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(1);
        expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(0); // Requested
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Connection retries are tested alongside configuration
      });

      it("if due to transport internal failure, should be appropriate", function() {
        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport disconnect
        harness.transport.state.and.returnValue("disconnected");
        harness.transport.emit("disconnect", new Error("FAILURE: ..."));

        // Check all transport calls
        expect(harness.transport.connect.calls.count()).toBe(0);
        expect(harness.transport.disconnect.calls.count()).toBe(0);
        expect(harness.transport.send.calls.count()).toBe(0);
        expect(harness.transport.state.calls.count() >= 0).toBe(true);

        // Connection retries are tested alongside configuration
      });

      it("if due to handshake rejection, should be appropriate", function() {
        // Reset transport spies
        harness.transport.spyClear();

        // Have the transport connect so the client submits a handshake
        harness.transport.state.and.returnValue("connected");
        harness.transport.emit("connect");

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

        // Have the transport handshake failure
        harness.transport.emit(
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
    });
  });

  // Callbacks - N/A

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The client.disconnect() function", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  // Errors and return values

  describe("throw and return", function() {
    it("should throw if disconnected", function() {
      var harness = harnessFactory();
      expect(function() {
        harness.client.disconnect();
      }).toThrow(new Error("INVALID_STATE: Already disconnected."));
    });

    it("should return void if not disconnected", function() {
      var harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      expect(harness.client.disconnect()).toBeUndefined();
    });
  });

  // Client and feed state functions

  describe("client and feed state function effects", function() {
    it("should work correctly if called while transport connecting", function() {
      // Create a disconnected client and two feeds
      var harness = harnessFactory();
      var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Put the client in a connecting state
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");

      // Check all state functions
      expect(harness.client.state()).toBe("connecting");
      expect(function() {
        harness.client.id();
      }).toThrow(new Error("INVALID_STATE: Not connected."));
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Call disconnect and have the transport emit disconnect
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

      // Check all state functions
      expect(harness.client.state()).toBe("disconnected");
      expect(function() {
        harness.client.id();
      }).toThrow(new Error("INVALID_STATE: Not connected."));
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    it("should work correctly if called while awaiting handshake response", function() {
      // Create a disconnected client and two feeds
      var harness = harnessFactory();
      var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Get the client so it is awaiting a handshake response
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      harness.transport.emit("connect"); // Transport will send Handshake message

      // Check all state functions
      expect(harness.client.state()).toBe("connecting");
      expect(function() {
        harness.client.id();
      }).toThrow(new Error("INVALID_STATE: Not connected."));
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Call disconnect and have the transport emit disconnect
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

      // Check all state functions
      expect(harness.client.state()).toBe("disconnected");
      expect(function() {
        harness.client.id();
      }).toThrow(new Error("INVALID_STATE: Not connected."));
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    it("should work correctly if called while while client is connected", function() {
      // Create a connected client and two feeds
      var harness = harnessFactory();
      var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      harness.connectClient();

      // Check all state functions
      expect(harness.client.state()).toBe("connected");
      expect(harness.client.id()).toBe("SOME_CLIENT_ID");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("opening");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Call disconnect and have the transport emit disconnect
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

      // Check all state functions
      expect(harness.client.state()).toBe("disconnected");
      expect(function() {
        harness.client.id();
      }).toThrow(new Error("INVALID_STATE: Not connected."));
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });
  });

  // Client and feed events

  describe("client and feed event effects", function() {
    it("should work correctly if called while transport connecting", function() {
      // Create a disconnected client and two feeds
      var harness = harnessFactory();
      var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Put the client in a connecting state
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");

      // Create listeners
      var clientListener = harness.createClientListener();
      var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      var feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Call disconnect and have the transport emit disconnect
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

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

    it("should work correctly if called while awaiting handshake response", function() {
      // Create a disconnected client and two feeds
      var harness = harnessFactory();
      var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Get the client so it is awaiting a handshake response
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      harness.transport.emit("connect"); // Transport will send Handshake message

      // Create listeners
      var clientListener = harness.createClientListener();
      var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      var feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Call disconnect and have the transport emit disconnect
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

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

    it("should work correctly if called while while client is connected", function() {
      // Create a connected client and two feeds
      var harness = harnessFactory();
      harness.connectClient();
      var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Create listeners
      var clientListener = harness.createClientListener();
      var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      var feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Call disconnect and have the transport emit disconnect
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

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

  describe("transport calls", function() {
    it("should work correctly if called while transport connecting", function() {
      // Create a disconnected client and two feeds
      var harness = harnessFactory();

      // Put the client in a connecting state
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");

      // Reset transport spies
      harness.transport.spyClear();

      // Call disconnect and have the transport emit disconnect
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(1);
      expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });

    it("should work correctly if called while awaiting handshake response", function() {
      // Create a disconnected client and two feeds
      var harness = harnessFactory();

      // Get the client so it is awaiting a handshake response
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      harness.transport.emit("connect"); // Transport will send Handshake message

      // Reset transport spies
      harness.transport.spyClear();

      // Call disconnect and have the transport emit disconnect
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(1);
      expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });

    it("should work correctly if called while while client is connected", function() {
      // Create a connected client and two feeds
      var harness = harnessFactory();
      harness.connectClient();

      // Reset transport spies
      harness.transport.spyClear();

      // Call disconnect and have the transport emit disconnect
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(1);
      expect(harness.transport.disconnect.calls.argsFor(0).length).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });
  });

  // Callbacks - N/A

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The client.action() function", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  // Errors and return values

  describe("throw and return", function() {
    it("should throw on bad argument (just test one)", function() {
      var harness = harnessFactory();
      harness.connectClient();
      expect(function() {
        harness.client.action(); // no args
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid action name."));
    });

    it("should throw if not connected", function() {
      var harness = harnessFactory();
      expect(function() {
        harness.client.action("SomeAction", {}, function() {});
      }).toThrow(new Error("INVALID_STATE: Not connected."));
    });

    it("should return void on success", function() {
      var harness = harnessFactory();
      harness.connectClient();
      expect(
        harness.client.action("SomeAction", {}, function() {})
      ).toBeUndefined();
    });
  });

  // Client and feed state functions - N/A

  // Client and feed events - N/A

  // Transport calls

  describe("transport calls", function() {
    it("should send an Action message on the transport", function() {
      var harness = harnessFactory();
      harness.connectClient();

      // Reset transport spies
      harness.transport.spyClear();

      // Invoke an action
      harness.client.action("SomeAction", { Action: "Arg" }, function() {});

      // Check all transport calls
      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(1);
      expect(harness.transport.send.calls.argsFor(0).length).toBe(1);
      // You can't check the whole message in one go, since callback id is created internally
      var msg = JSON.parse(harness.transport.send.calls.argsFor(0)[0]);
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

  describe("callbacks", function() {
    it("should operate correctly through a timeout cycle to final success", function() {
      var harness = harnessFactory();
      harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      var cb = jasmine.createSpy();
      var cbLate = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb, cbLate);

      // Get the CallbackId sent with the Action message
      var serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
      expect(cbLate.calls.count()).toBe(0);

      // Run the timeout
      jasmine.clock().tick(harness.client._options.actionTimeoutMs);

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "TIMEOUT: The server did not respond within the allocated time."
      );
      expect(cbLate.calls.count()).toBe(0);

      // Reset the callbacks
      cb.calls.reset();
      cbLate.calls.reset();

      // Have the server return success
      harness.transport.emit(
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
      expect(cbLate.calls.count()).toBe(1);
      expect(cbLate.calls.argsFor(0).length).toBe(2);
      expect(cbLate.calls.argsFor(0)[0]).toBeUndefined();
      expect(cbLate.calls.argsFor(0)[1]).toEqual({ Action: "Data" });
    });

    it("should operate correctly through a timeout cycle to final disconnect", function() {
      var harness = harnessFactory();
      harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      var cb = jasmine.createSpy();
      var cbLate = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb, cbLate);

      // Get the CallbackId sent with the Action message
      var serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
      expect(cbLate.calls.count()).toBe(0);

      // Run the timeout
      jasmine.clock().tick(harness.client._options.actionTimeoutMs);

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "TIMEOUT: The server did not respond within the allocated time."
      );
      expect(cbLate.calls.count()).toBe(0);

      // Reset the callbacks
      cb.calls.reset();
      cbLate.calls.reset();

      // Have the client disconnect (requested in this case)
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
      expect(cbLate.calls.count()).toBe(1);
      expect(cbLate.calls.argsFor(0).length).toBe(1);
      expect(cbLate.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cbLate.calls.argsFor(0)[0].message).toBe(
        "DISCONNECTED: The transport disconnected."
      );
    });

    it("should operate correctly through a timeout cycle to final reject", function() {
      var harness = harnessFactory();
      harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      var cb = jasmine.createSpy();
      var cbLate = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb, cbLate);

      // Get the CallbackId sent with the Action message
      var serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
      expect(cbLate.calls.count()).toBe(0);

      // Run the timeout
      jasmine.clock().tick(harness.client._options.actionTimeoutMs);

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "TIMEOUT: The server did not respond within the allocated time."
      );
      expect(cbLate.calls.count()).toBe(0);

      // Reset the callbacks
      cb.calls.reset();
      cbLate.calls.reset();

      // Have the server reject the action
      harness.transport.emit(
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
      expect(cbLate.calls.count()).toBe(1);
      expect(cbLate.calls.argsFor(0).length).toBe(1);
      expect(cbLate.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cbLate.calls.argsFor(0)[0].message).toBe(
        "REJECTED: Server rejected the action request."
      );
      expect(cbLate.calls.argsFor(0)[0].serverErrorCode).toBe(
        "SERVER_ERROR_CODE"
      );
      expect(cbLate.calls.argsFor(0)[0].serverErrorData).toEqual({
        Server: "Data"
      });
    });

    it("should operate correctly on success", function() {
      var harness = harnessFactory();
      harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      var cb = jasmine.createSpy();
      var cbLate = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb, cbLate);

      // Get the CallbackId sent with the Action message
      var serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
      expect(cbLate.calls.count()).toBe(0);

      // Have the server return success
      harness.transport.emit(
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
      expect(cbLate.calls.count()).toBe(0);
    });

    it("should operate correctly on disconnect", function() {
      var harness = harnessFactory();
      harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      var cb = jasmine.createSpy();
      var cbLate = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb, cbLate);

      // Get the CallbackId sent with the Action message
      var serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
      expect(cbLate.calls.count()).toBe(0);

      // Have the client disconnect (requested in this case)
      harness.client.disconnect();
      harness.transport.state.and.returnValue("disconnected");
      harness.transport.emit("disconnect");

      // Check callbacks
      expect(cb.calls.count()).toBe(1);
      expect(cb.calls.argsFor(0).length).toBe(1);
      expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
      expect(cb.calls.argsFor(0)[0].message).toBe(
        "DISCONNECTED: The transport disconnected."
      );
      expect(cbLate.calls.count()).toBe(0);
    });

    it("should operate correctly on reject", function() {
      var harness = harnessFactory();
      harness.connectClient();

      // Reset the transport so you can get the callback
      harness.transport.spyClear();

      // Create callbacks and invoke an action
      var cb = jasmine.createSpy();
      var cbLate = jasmine.createSpy();
      harness.client.action("SomeAction", { Action: "Arg" }, cb, cbLate);

      // Get the CallbackId sent with the Action message
      var serverCb = JSON.parse(harness.transport.send.calls.argsFor(0)[0])
        .CallbackId;

      // Check callbacks
      expect(cb.calls.count()).toBe(0);
      expect(cbLate.calls.count()).toBe(0);

      // Have the server reject the action
      harness.transport.emit(
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
      expect(cbLate.calls.count()).toBe(0);
    });
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The client.feed() function", function() {
  // Errors and return values

  describe("throw and return", function() {
    it("should throw on bad argument (check one)", function() {
      var harness = harnessFactory();
      expect(function() {
        harness.client.feed(); // No args
      }).toThrow(new Error("INVALID_ARGUMENT: Invalid feed name."));
    });

    it("should return an object on success", function() {
      var harness = harnessFactory();
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

describe("The feed.desireOpen() function", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  describe("throw and return", function() {
    it("should throw if already desired open", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      expect(function() {
        feed.desireOpen();
      }).toThrow(
        new Error("INVALID_FEED_STATE: The feed is already desired open.")
      );
    });

    it("should throw if destroyed", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.destroy();
      expect(function() {
        feed.desireOpen();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should return void on success", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      expect(feed.desireOpen()).toBeUndefined();
    });
  });

  describe("if disconnected", function() {
    var harness;
    beforeEach(function() {
      harness = harnessFactory();
    });

    it("state functions", function() {
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      // Check state functions
      expect(feed.desiredState()).toBe("closed");
      expect(feed.state()).toBe("closed");
      expect(function() {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Desire open
      feed.desireOpen();

      // Check state functions
      expect(feed.desiredState()).toBe("open");
      expect(feed.state()).toBe("closed");
      expect(function() {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    it("events", function() {
      var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      var feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      var feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      feedWantedOpen.desireOpen();

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

    it("transport calls", function() {
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

      harness.transport.spyClear();

      feed.desireOpen();

      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });
  });

  describe("if connected and no other feed objects are desired open", function() {
    describe("if the server feed is closed", function() {
      var harness;
      beforeEach(function() {
        harness = harnessFactory();
        harness.connectClient();
      });

      describe("if the server responds to FeedOpen with success", function() {
        it("state functions", function() {
          // Desire feed open
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success
          harness.transport.emit(
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

        it("events", function() {
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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

      describe("if the server responds to FeedOpen with failure", function() {
        it("state functions", function() {
          // Desire feed open
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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

      describe("if the client disconnects before the server responds to FeedOpen", function() {
        it("state functions", function() {
          // Desire feed open
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

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

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is opening", function() {
      var harness;
      beforeEach(function() {
        harness = harnessFactory();
        harness.connectClient();

        // Get the server feed into the opening state
        var earlierFeed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        earlierFeed.desireOpen();
      });

      describe("if the server responds to earlier FeedOpen with success", function() {
        it("state functions", function() {
          // Desire feed open
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success
          harness.transport.emit(
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

        it("events", function() {
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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

      describe("if the server responds to earlier FeedOpen with failure", function() {
        it("state functions", function() {
          // Desire feed open
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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

      describe("if the client disconnects before the server responds to earlier FeedOpen", function() {
        it("state functions", function() {
          // Desire feed open
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          feedWantedOpen.desireOpen();

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

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is open", function() {
      // Can't happen - server feed would be closing if no other feeds objects desired open
    });

    describe("if the server feed is closing", function() {
      var harness;
      beforeEach(function() {
        // Get the server feed into the closing state
        harness = harnessFactory();
        harness.connectClient();

        var earlierFeed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        earlierFeed.desireOpen();

        harness.transport.emit(
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
      });

      describe("if the server responds to earlier FeedClose with success and subsequent FeedOpen with success", function() {
        it("state functions", function() {
          // Desire feed open
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to the FeedOpen message
          harness.transport.emit(
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

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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
          harness.transport.emit(
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
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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
          harness.transport.emit(
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

      describe("if the server responds to earlier FeedClose with success and subsequent FeedOpen with failure", function() {
        it("state functions", function() {
          // Desire feed open
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to the FeedOpen message
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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
          harness.transport.emit(
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

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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
          harness.transport.emit(
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

      describe("if client disconnects before the server responds to the ealier FeedClose", function() {
        it("state functions", function() {
          // Desire feed open
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feed.desireOpen();

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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

          // Have the transport disconnect
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });
  });

  describe("if connected and another feed object is desired open", function() {
    describe("if the server feed is closed", function() {
      var harness;
      var feedAlreadyWantedOpen;
      beforeEach(function() {
        // Set up a connected client with a feed desired open but actually closed
        harness = harnessFactory();
        harness.connectClient();
        feedAlreadyWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedAlreadyWantedOpen.desireOpen();
        harness.transport.emit(
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

      describe("if the server responds to FeedOpen with success", function() {
        it("state functions", function() {
          // Desire feed open
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to FeedOpen
          harness.transport.emit(
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

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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
          ).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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

      describe("if the server responds to FeedOpen with failure", function() {
        it("state functions", function() {
          // Desire feed open
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure to FeedOpen
          harness.transport.emit(
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
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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

      describe("if the client disconnects before the server responds to FeedOpen", function() {
        it("state functions", function() {
          // Desire feed open
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the client disconnect
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("closed");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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

          // Have the client disconnect
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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

          // Reset listeners
          feedWantedOpenListener.spyClear();
          feedWantedClosedListener.spyClear();
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is opening", function() {
      var harness;
      var feedAlreadyWantedOpen;
      beforeEach(function() {
        // Set up a connected client with a feed desired open and server feed opening
        harness = harnessFactory();
        harness.connectClient();
        feedAlreadyWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedAlreadyWantedOpen.desireOpen();
      });

      describe("if the server responds to earlier FeedOpen with success", function() {
        it("state functions", function() {
          // Desire feed open
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success
          harness.transport.emit(
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

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire the feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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
          ).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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

      describe("if the server responds to earlier FeedOpen with failure", function() {
        it("state functions", function() {
          // Desire feed open
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure
          harness.transport.emit(
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
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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

      describe("if the client disconnects before the server responds to earlier FeedOpen", function() {
        it("state functions", function() {
          // Desire feed open
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("closed");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is open", function() {
      var harness;
      var feedAlreadyWantedOpen;
      beforeEach(function() {
        // Set up a connected client with a feed desired open and server feed open
        harness = harnessFactory();
        harness.connectClient();
        feedAlreadyWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedAlreadyWantedOpen.desireOpen();
        harness.transport.emit(
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

      it("state functions", function() {
        // Desire feed open
        var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();

        // Check state functions
        expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
        expect(feedAlreadyWantedOpen.state()).toBe("open");
        expect(feedAlreadyWantedOpen.data()).toEqual({ Feed: "Data" });
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
      });

      it("events", function() {
        // Create feed listeners
        var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        var feedWantedClosed = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        var feedAlreadyWantedOpenListener = harness.createFeedListener(
          feedAlreadyWantedOpen
        );
        var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
        var feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Desire the feed open
        feedWantedOpen.desireOpen();

        // Check events
        expect(feedAlreadyWantedOpenListener.opening.calls.count()).toBe(0);
        expect(feedAlreadyWantedOpenListener.open.calls.count()).toBe(0);
        expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedOpenListener.opening.calls.count()).toBe(1);
        expect(feedWantedOpenListener.opening.calls.argsFor(0).length).toBe(0);
        expect(feedWantedOpenListener.open.calls.count()).toBe(1);
        expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
        expect(feedWantedOpenListener.close.calls.count()).toBe(0);
        expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });

      it("transport calls", function() {
        var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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

    describe("if the server feed is closing", function() {
      var harness;
      var feedAlreadyWantedOpen;
      beforeEach(function() {
        // Get the server feed into the closing state with a feed desired open
        harness = harnessFactory();
        harness.connectClient();

        feedAlreadyWantedOpen = harness.client.feed("SomeFeed", {
          Feed: "Arg"
        });
        feedAlreadyWantedOpen.desireOpen();

        harness.transport.emit(
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
      });

      describe("if the server responds to earlier FeedClose with success and subsequent FeedOpen with success", function() {
        it("state functions", function() {
          // Desire feed open
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          harness.transport.emit(
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
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to the FeedOpen message
          harness.transport.emit(
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

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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
          harness.transport.emit(
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
          ).toBe(0);
          expect(feedAlreadyWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedAlreadyWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedOpenListener.opening.calls.count()).toBe(0);
          expect(feedWantedOpenListener.open.calls.count()).toBe(1);
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
          expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
          expect(feedWantedClosedListener.open.calls.count()).toBe(0);
          expect(feedWantedClosedListener.close.calls.count()).toBe(0);
          expect(feedWantedClosedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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
          harness.transport.emit(
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

      describe("if the server responds to earlier FeedClose with success and subsequent FeedOpen with failure", function() {
        it("state functions", function() {
          // Desire feed open
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          harness.transport.emit(
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
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to the FeedOpen message
          harness.transport.emit(
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
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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
          harness.transport.emit(
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

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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
          harness.transport.emit(
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

      describe("if client disconnects before the server responds to the ealier FeedClose", function() {
        it("state functions", function() {
          // Desire feed open
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          feedWantedOpen.desireOpen();

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("opening");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to the earlier FeedClose
          // Client will send FeedOpen message
          harness.transport.emit(
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
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedAlreadyWantedOpen.desiredState()).toBe("open");
          expect(feedAlreadyWantedOpen.state()).toBe("closed");
          expect(function() {
            feedAlreadyWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          // Create feed listeners
          var feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
          var feedWantedClosed = harness.client.feed("SomeFeed", {
            Feed: "Arg"
          });
          var feedAlreadyWantedOpenListener = harness.createFeedListener(
            feedAlreadyWantedOpen
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );

          // Desire feed open
          feedWantedOpen.desireOpen();

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
          harness.transport.emit(
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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
        });

        it("transport calls", function() {
          var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });

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
          harness.transport.emit(
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Tries to reconnect by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The feed.desireClosed() function", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  describe("throw and return", function() {
    it("should throw if already desired closed", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      expect(function() {
        feed.desireClosed();
      }).toThrow(
        new Error("INVALID_FEED_STATE: The feed is already desired closed.")
      );
    });

    it("should throw if destroyed", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.destroy();
      expect(function() {
        feed.desireClosed();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should return void on success", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      expect(feed.desireClosed()).toBeUndefined();
    });
  });

  describe("if disconnected", function() {
    var harness;
    var feedWantedOpen;
    var feedWantedClosed;
    beforeEach(function() {
      harness = harnessFactory();
      feedWantedOpen = harness.client.feed("SomeFeed", {
        Feed: "Arg"
      });
      feedWantedOpen.desireOpen();
      feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedClosed.desireOpen();
    });

    it("state functions", function() {
      // Check state functions
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("open");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Desire closed
      feedWantedClosed.desireClosed();

      // Check state functions
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    it("events", function() {
      var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      var feedWantedClosedListener = harness.createFeedListener(
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

    it("transport calls", function() {
      harness.transport.spyClear();

      feedWantedClosed.desireClosed();

      expect(harness.transport.connect.calls.count()).toBe(0);
      expect(harness.transport.disconnect.calls.count()).toBe(0);
      expect(harness.transport.send.calls.count()).toBe(0);
      expect(harness.transport.state.calls.count() >= 0).toBe(true);
    });
  });

  describe("if connected and no other feed objects are desired open", function() {
    describe("if the server feed is closed", function() {
      var harness;
      var feed;
      beforeEach(function() {
        // Set up a feed object desired open but with the server feed closed (rejected)
        harness = harnessFactory();
        harness.connectClient();
        feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feed.desireOpen();
        harness.transport.emit(
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

      it("state functions", function() {
        // Check state functions
        expect(feed.desiredState()).toBe("open");
        expect(feed.state()).toBe("closed");
        expect(function() {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Desire closed
        feed.desireClosed();

        // Check state functions
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(function() {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("events", function() {
        var feedListener = harness.createFeedListener(feed);

        feed.desireClosed();

        // Check events
        expect(feedListener.opening.calls.count()).toBe(0);
        expect(feedListener.open.calls.count()).toBe(0);
        expect(feedListener.close.calls.count()).toBe(1);
        expect(feedListener.close.calls.argsFor(0).length).toBe(0);
        expect(feedListener.action.calls.count()).toBe(0);
      });

      it("transport calls", function() {
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

    describe("if the server feed is opening", function() {
      var harness;
      var feed;
      beforeEach(function() {
        // Set up an opening feed
        harness = harnessFactory();
        harness.connectClient();
        feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feed.desireOpen();
      });

      describe("if the client disconnects before FeedOpenResponse", function() {
        it("state functions", function() {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with failure", function() {
        it("state functions", function() {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with failure
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedOpen with failure
          harness.transport.emit(
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

        it("transport calls", function() {
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
          harness.transport.emit(
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

      describe("if the server responds to FeedOpen with success and then disconnects before FeedCloseResponse", function() {
        it("state functions", function() {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with success
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedOpen with success
          harness.transport.emit(
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
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
          harness.transport.emit(
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with success and FeedClose with success", function() {
        it("state functions", function() {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with success
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedClose with success
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedOpen with success
          harness.transport.emit(
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
          harness.transport.emit(
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

        it("transport calls", function() {
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
          harness.transport.emit(
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
          harness.transport.emit(
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

    describe("if the server feed is open", function() {
      var harness;
      var feed;
      beforeEach(function() {
        // Set up an open feed
        harness = harnessFactory();
        harness.connectClient();
        feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feed.desireOpen();
        harness.transport.emit(
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

      describe("if the server disconnects before FeedCloseResponse", function() {
        it("state functions", function() {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("open");
          expect(feed.data()).toEqual({ Feed: "Data" });

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedClose with success", function() {
        it("state functions", function() {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("open");
          expect(feed.data()).toEqual({ Feed: "Data" });

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedClose with success
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedClose with success
          harness.transport.emit(
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

        it("transport calls", function() {
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
          harness.transport.emit(
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

    describe("if the server feed is closing", function() {
      var harness;
      var feed;
      beforeEach(function() {
        // Set up a closing feed desired open
        harness = harnessFactory();
        harness.connectClient();
        feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feed.desireOpen();
        harness.transport.emit(
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
      });

      describe("if the server disconnects before FeedCloseResponse", function() {
        it("state functions", function() {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedClose with success", function() {
        it("state functions", function() {
          // Check state functions
          expect(feed.desiredState()).toBe("open");
          expect(feed.state()).toBe("opening");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feed.desireClosed();

          // Check state functions
          expect(feed.desiredState()).toBe("closed");
          expect(feed.state()).toBe("closed");
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedClose with success
          harness.transport.emit(
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
          expect(function() {
            feed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedListener = harness.createFeedListener(feed);

          feed.desireClosed();

          // Check events
          expect(feedListener.opening.calls.count()).toBe(0);
          expect(feedListener.open.calls.count()).toBe(0);
          expect(feedListener.close.calls.count()).toBe(1);
          expect(feedListener.close.calls.argsFor(0).length).toBe(0);
          expect(feedListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedListener.spyClear();

          // Have the server respond to FeedClose with success
          harness.transport.emit(
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

        it("transport calls", function() {
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
          harness.transport.emit(
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

  describe("if connected and another feed object is desired open", function() {
    describe("if the server feed is closed", function() {
      var harness;
      var feedWantedClosed;
      var feedWantedOpen;
      beforeEach(function() {
        // Set up a feed object desired open but with the server feed closed (rejected)
        harness = harnessFactory();
        harness.connectClient();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedClosed.desireOpen();
        harness.transport.emit(
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

      it("state functions", function() {
        // Check state functions
        expect(feedWantedClosed.desiredState()).toBe("open");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(function() {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Desire closed
        feedWantedClosed.desireClosed();

        // Check state functions
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(function() {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      it("events", function() {
        var feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );
        var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);

        feedWantedClosed.desireClosed();

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

      it("transport calls", function() {
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

    describe("if the server feed is opening", function() {
      var harness;
      var feedWantedClosed;
      var feedWantedOpen;
      beforeEach(function() {
        // Set up an opening feed
        harness = harnessFactory();
        harness.connectClient();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedClosed.desireOpen();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
      });

      describe("if the client disconnects before FeedOpenResponse", function() {
        it("state functions", function() {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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

        it("transport calls", function() {
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the server responds to FeedOpen with failure", function() {
        it("state functions", function() {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with failure
          harness.transport.emit(
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
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

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
          harness.transport.emit(
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

        it("transport calls", function() {
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
          harness.transport.emit(
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

      describe("if the server responds to FeedOpen with success and then eventually disconnects", function() {
        it("state functions", function() {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server respond to FeedOpen with success
          harness.transport.emit(
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
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

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
          harness.transport.emit(
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
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);

          // Reset listeners
          feedWantedClosedListener.spyClear();
          feedWantedOpenListener.spyClear();

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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

        it("transport calls", function() {
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
          harness.transport.emit(
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is open", function() {
      var harness;
      var feedWantedClosed;
      var feedWantedOpen;
      beforeEach(function() {
        // Set up an open feed
        harness = harnessFactory();
        harness.connectClient();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedClosed.desireOpen();
        feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedOpen.desireOpen();
        harness.transport.emit(
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

      describe("when the client eventually disconnects", function() {
        it("state functions", function() {
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
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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

        it("transport calls", function() {
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });
    });

    describe("if the server feed is closing", function() {
      var harness;
      var feedWantedClosed;
      var feedWantedOpen;
      beforeEach(function() {
        // Set up a closing feed desired open by two objects
        harness = harnessFactory();
        harness.connectClient();
        feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
        feedWantedClosed.desireOpen();
        harness.transport.emit(
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
      });

      describe("if the client disconnects before receiving a response to earlier FeedClose", function() {
        it("state functions", function() {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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

        it("transport calls", function() {
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the earlier FeedClose succeeds then client disconnects before FeedOpenResponse", function() {
        it("state functions", function() {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return FeedCloseResponse success
          harness.transport.emit(
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
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the transport disconnect from the server
          harness.transport.state.and.returnValue("disconnected");
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

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
          harness.transport.emit(
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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

        it("transport calls", function() {
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
          harness.transport.emit(
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
          harness.transport.emit("disconnect", new Error("FAILURE: ..."));

          // Check transport calls
          expect(harness.transport.connect.calls.count() >= 0).toBe(true); // Reconnects by default
          expect(harness.transport.disconnect.calls.count()).toBe(0);
          expect(harness.transport.send.calls.count()).toBe(0);
          expect(harness.transport.state.calls.count() >= 0).toBe(true);
        });
      });

      describe("if the earlier FeedClose succeeds and FeedOpen fails", function() {
        it("state functions", function() {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return FeedCloseResponse success
          harness.transport.emit(
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
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return failure to FeedOpen
          harness.transport.emit(
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
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("closed");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
        });

        it("events", function() {
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

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
          harness.transport.emit(
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
          harness.transport.emit(
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

        it("transport calls", function() {
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
          harness.transport.emit(
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
          harness.transport.emit(
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

      describe("if the earlier FeedClose succeeds and FeedOpen succeeds", function() {
        it("state functions", function() {
          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("open");
          expect(feedWantedClosed.state()).toBe("opening");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Desire feed closed
          feedWantedClosed.desireClosed();

          // Check state functions
          expect(feedWantedClosed.desiredState()).toBe("closed");
          expect(feedWantedClosed.state()).toBe("closed");
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return FeedCloseResponse success
          harness.transport.emit(
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
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("opening");
          expect(function() {
            feedWantedOpen.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );

          // Have the server return success to FeedOpen
          harness.transport.emit(
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
          expect(function() {
            feedWantedClosed.data();
          }).toThrow(
            new Error("INVALID_FEED_STATE: The feed object is not open.")
          );
          expect(feedWantedOpen.desiredState()).toBe("open");
          expect(feedWantedOpen.state()).toBe("open");
          expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        });

        it("events", function() {
          var feedWantedClosedListener = harness.createFeedListener(
            feedWantedClosed
          );
          var feedWantedOpenListener = harness.createFeedListener(
            feedWantedOpen
          );

          feedWantedClosed.desireClosed();

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
          harness.transport.emit(
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
          harness.transport.emit(
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
          expect(feedWantedOpenListener.open.calls.argsFor(0).length).toBe(0);
          expect(feedWantedOpenListener.close.calls.count()).toBe(0);
          expect(feedWantedOpenListener.action.calls.count()).toBe(0);
        });

        it("transport calls", function() {
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
          harness.transport.emit(
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
          harness.transport.emit(
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

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("The feed.destroy() function", function() {
  // Errors and return values

  describe("throw and return", function() {
    it("should throw if desired open", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      expect(function() {
        feed.destroy();
      }).toThrow(
        new Error(
          "INVALID_FEED_STATE: Only feeds desired closed can be destroyed."
        )
      );
    });

    it("should throw if already destroyed", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.destroy();
      expect(function() {
        feed.destroy();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should return void", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      expect(feed.destroy()).toBeUndefined();
    });
  });

  // Client and feed state functions - N/A

  // Client and feed events - N/A

  // Transport calls - N/A

  // Callbacks - N/A
});

describe("The feed.client() function", function() {
  // Errors and return values

  describe("throw and return", function() {
    it("should throw if already destroyed", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.destroy();
      expect(function() {
        feed.client();
      }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
    });

    it("should return the client", function() {
      var harness = harnessFactory();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      expect(feed.client()).toBe(harness.client);
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

describe("The client.state() function", function() {
  // No errors
});

describe("The client.id() function", function() {
  // INVALID_STATE tested through the connection cycle above
});

describe("The feed.desiredState() function", function() {
  it("should throw if destroyed", function() {
    var harness = harnessFactory();
    var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
    feed.destroy();
    expect(function() {
      feed.desiredState();
    }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
  });
});

describe("The feed.state() function", function() {
  it("should throw if destroyed", function() {
    var harness = harnessFactory();
    var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
    feed.destroy();
    expect(function() {
      feed.state();
    }).toThrow(new Error("DESTROYED: The feed object has been destroyed."));
  });
});

describe("The feed.data() function", function() {
  // INVALID_FEED_STATE tested through the connection cycle above
  it("should throw if destroyed", function() {
    var harness = harnessFactory();
    var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
    feed.destroy();
    expect(function() {
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

describe("if the transport violates a library requirement", function() {
  // State functions - N/A

  // Events

  it("should emit transportError on the client", function() {
    // Just test one unexpected behavior - unit tests handle the rest
    var harness = harnessFactory();
    var clientListener = harness.createClientListener();
    harness.transport.emit("disconnect"); // Unexpected
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
      "UNEXPECTED_EVENT: Transport emitted a  'disconnect' event when the previous emission was 'disconnect'."
    );
  });

  // Transport calls - N/A

  // Callbacks - N/A
});

describe("if the transport unexpectedly disconnects", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });
  var harness;
  var feedDesiredClosed;
  var feedClosed;
  var feedOpening;
  var feedOpen;
  var feedClosing;
  beforeEach(function() {
    // Set up a connected client and feeds in all states
    harness = harnessFactory();
    harness.connectClient();

    feedDesiredClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });

    feedClosed = harness.client.feed("SomeFeed2", { Feed: "Arg" });
    feedClosed.desireOpen();
    harness.transport.emit(
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
    harness.transport.emit(
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
    harness.transport.emit(
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
  });

  // State functions

  it("should update state functions", function() {
    // Check state functions
    expect(harness.client.state()).toBe("connected");
    expect(harness.client.id()).toBe("SOME_CLIENT_ID");
    expect(feedDesiredClosed.desiredState()).toBe("closed");
    expect(feedDesiredClosed.state()).toBe("closed");
    expect(function() {
      feedDesiredClosed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedClosed.desiredState()).toBe("open");
    expect(feedClosed.state()).toBe("closed");
    expect(function() {
      feedClosed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedOpening.desiredState()).toBe("open");
    expect(feedOpening.state()).toBe("opening");
    expect(function() {
      feedOpening.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedOpen.desiredState()).toBe("open");
    expect(feedOpen.state()).toBe("open");
    expect(feedOpen.data()).toEqual({ Feed: "Data" });
    expect(feedClosing.desiredState()).toBe("open");
    expect(feedClosing.state()).toBe("opening");
    expect(function() {
      feedClosing.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

    // Have the transport disconnect
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    // Check state functions
    expect(harness.client.state()).toBe("disconnected");
    expect(function() {
      harness.client.id();
    }).toThrow(new Error("INVALID_STATE: Not connected."));
    expect(feedDesiredClosed.desiredState()).toBe("closed");
    expect(feedDesiredClosed.state()).toBe("closed");
    expect(function() {
      feedDesiredClosed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedClosed.desiredState()).toBe("open");
    expect(feedClosed.state()).toBe("closed");
    expect(function() {
      feedClosed.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedOpening.desiredState()).toBe("open");
    expect(feedOpening.state()).toBe("closed");
    expect(function() {
      feedOpening.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedOpen.desiredState()).toBe("open");
    expect(feedOpen.state()).toBe("closed");
    expect(function() {
      feedOpen.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    expect(feedClosing.desiredState()).toBe("open");
    expect(feedClosing.state()).toBe("closed");
    expect(function() {
      feedClosing.data();
    }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
  });

  // Events

  it("should emit events", function() {
    // Create listeners
    var clientListener = harness.createClientListener();
    var feedDesiredClosedListener = harness.createFeedListener(
      feedDesiredClosed
    );
    var feedClosedListener = harness.createFeedListener(feedClosed);
    var feedOpeningListener = harness.createFeedListener(feedOpening);
    var feedOpenListener = harness.createFeedListener(feedOpen);
    var feedClosingListener = harness.createFeedListener(feedClosing);

    // Have the transport disconnect
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("FAILURE: ..."));

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

  it("should call client.action() callbacks", function() {
    var harness = harnessFactory();
    harness.connectClient();
    var cb = jasmine.createSpy();
    harness.client.action("SomeAction", { Action: "Arg" }, cb);

    // Have the transport disconnect
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("FAILURE: ..."));

    expect(cb.calls.count()).toBe(1);
    expect(cb.calls.argsFor(0).length).toBe(1);
    expect(cb.calls.argsFor(0)[0]).toEqual(jasmine.any(Error));
    expect(cb.calls.argsFor(0)[0].message).toBe(
      "DISCONNECTED: The transport disconnected."
    );
  });

  afterEach(function() {
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

describe("structurally invalid server messages", function() {
  describe("if the message is invalid JSON", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var clientListener = harness.createClientListener();
      harness.transport.emit("message", "bad json");

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

  describe("if schema validation fails", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var clientListener = harness.createClientListener();
      harness.transport.emit("message", "{}");

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

describe("sequentially invalid server messages", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  describe("unexpected HandshakeResponse - before Handshake", function() {
    // Can't test, since Handshake is sent synchronously on transport connect
  });

  describe("unexpected HandshakeResponse - another after HandshakeResponse", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var clientListener = harness.createClientListener();
      harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "HandshakeResponse",
          Success: true,
          Version: "0.1",
          ClientId: "SOME_CLIENT_ID"
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

  describe("unexpected ActionResponse - before HandshakeResponse", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      harness.transport.emit("connect");
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected ActionResponse - unrecognized callback id", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedOpenResponse - before HandshakeResponse", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      harness.transport.emit("connect");
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedOpenResponse - server feed was understood to be closed", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedOpenResponse - server feed was understood to be open", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedOpenResponse - server feed was understood to be closing", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      harness.transport.emit(
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
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedCloseResponse - before HandshakeResponse", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      harness.transport.emit("connect");
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedCloseResponse - server feed was understood to be closed", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedCloseResponse - server feed was understood to be opening", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedCloseResponse - server feed was understood to be open", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      harness.transport.emit(
        "message",
        JSON.stringify({
          MessageType: "FeedOpenResponse",
          Success: true,
          FeedName: "SomeFeed",
          FeedArgs: { Feed: "Arg" },
          FeedData: { Feed: "Data" }
        })
      );
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected ActionRevelation - before HandshakeResponse", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      harness.transport.emit("connect");
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected ActionRevelation - server feed was understood to be closed", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected ActionRevelation - server feed was understood to be opening", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedTermination - before HandshakeResponse", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.client.connect();
      harness.transport.state.and.returnValue("connecting");
      harness.transport.emit("connecting");
      harness.transport.state.and.returnValue("connected");
      harness.transport.emit("connect");
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedTermination - server feed was understood to be closed", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  describe("unexpected FeedTermination - server feed was understood to be opening", function() {
    // State functions - N/A

    // Events

    it("should emit badServerMessage", function() {
      var harness = harnessFactory();
      harness.connectClient();
      var feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      var clientListener = harness.createClientListener();
      harness.transport.emit(
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

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("Structurally/sequentially valid ViolationResponse message", function() {
  // State functions - N/A

  // Events - N/A

  it("should emit badClientMessage", function() {
    var harness = harnessFactory();
    harness.connectClient();
    var clientListener = harness.createClientListener();
    harness.transport.emit(
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

describe("Structurally/sequentially valid ActionRevelation message", function() {
  beforeEach(function() {
    jasmine.clock().install();
  });

  describe("if the server feed is open", function() {
    var harness;
    var feedWantedOpen;
    var feedWantedClosed;
    beforeEach(function() {
      harness = harnessFactory();
      harness.connectClient();
      feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      harness.transport.emit(
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

    describe("if there is an invalid feed delta", function() {
      // State functions

      it("state functions", function() {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a ActionRevelation with a bad delta
        harness.transport.emit(
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
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(function() {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", function() {
        var clientListener = harness.createClientListener();
        var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
        var feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the transport emit a ActionRevelation with a bad delta
        harness.transport.emit(
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

      it("transport calls", function() {
        harness.transport.spyClear();

        // Have the transport emit a ActionRevelation with a bad delta
        harness.transport.emit(
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

    describe("if there is an invalid feed data hash", function() {
      // State functions

      it("state functions", function() {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a ActionRevelation with a bad hash
        harness.transport.emit(
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
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("closed");
        expect(function() {
          feedWantedOpen.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", function() {
        var clientListener = harness.createClientListener();
        var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
        var feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );

        // Have the transport emit a ActionRevelation with a bad hash
        harness.transport.emit(
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

      it("transport calls", function() {
        harness.transport.spyClear();

        // Have the transport emit a ActionRevelation with a bad hash
        harness.transport.emit(
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

    describe("if the revelation is valid", function() {
      // State functions

      it("state functions", function() {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a valid ActionRevelation
        harness.transport.emit(
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
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feedWantedOpen.desiredState()).toBe("open");
        expect(feedWantedOpen.state()).toBe("open");
        expect(feedWantedOpen.data()).toEqual({ Feed: "Data2" });
        expect(feedWantedClosed.desiredState()).toBe("closed");
        expect(feedWantedClosed.state()).toBe("closed");
        expect(function() {
          feedWantedClosed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", function() {
        var clientListener = harness.createClientListener();
        var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
        var feedWantedClosedListener = harness.createFeedListener(
          feedWantedClosed
        );
        var actionNameSpy = jasmine.createSpy();
        feedWantedOpen.on("action:SomeAction", actionNameSpy);

        // Have the transport emit a valid ActionRevelation
        harness.transport.emit(
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
        expect(actionNameSpy.calls.count()).toBe(1);
        expect(actionNameSpy.calls.argsFor(0).length).toBe(3);
        expect(actionNameSpy.calls.argsFor(0)[0]).toEqual({
          Action: "Data"
        });
        expect(actionNameSpy.calls.argsFor(0)[1]).toEqual({
          Feed: "Data2"
        });
        expect(actionNameSpy.calls.argsFor(0)[2]).toEqual({
          Feed: "Data"
        });
        expect(feedWantedClosedListener.opening.calls.count()).toBe(0);
        expect(feedWantedClosedListener.open.calls.count()).toBe(0);
        expect(feedWantedClosedListener.close.calls.count()).toBe(0);
        expect(feedWantedClosedListener.action.calls.count()).toBe(0);
      });

      // Transport calls

      it("transport calls", function() {
        harness.transport.spyClear();

        // Have the transport emit a valid ActionRevelation
        harness.transport.emit(
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

  describe("if the server feed is closing", function() {
    var harness;
    var feed;
    beforeEach(function() {
      harness = harnessFactory();
      harness.connectClient();
      feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      harness.transport.emit(
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
    });

    describe("if there is an invalid feed delta", function() {
      // State functions

      it("state functions", function() {
        // Check state functions
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(function() {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a ActionRevelation with a bad delta
        harness.transport.emit(
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
        expect(function() {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", function() {
        var clientListener = harness.createClientListener();
        var feedListener = harness.createFeedListener(feed);

        // Have the transport emit a ActionRevelation with a bad delta
        harness.transport.emit(
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

      it("transport calls", function() {
        harness.transport.spyClear();

        // Have the transport emit a ActionRevelation with a bad delta
        harness.transport.emit(
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

    describe("if there is an invalid feed data hash", function() {
      // State functions

      it("state functions", function() {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(function() {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a ActionRevelation with a bad hash
        harness.transport.emit(
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
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(function() {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", function() {
        var clientListener = harness.createClientListener();
        var feedListener = harness.createFeedListener(feed);

        // Have the transport emit a ActionRevelation with a bad hash
        harness.transport.emit(
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

      it("transport calls", function() {
        harness.transport.spyClear();

        // Have the transport emit a ActionRevelation with a bad hash
        harness.transport.emit(
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

    describe("if the revelation is valid", function() {
      // State functions

      it("state functions", function() {
        // Check state functions
        expect(harness.client.state()).toBe("connected");
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(function() {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );

        // Have the transport emit a valid ActionRevelation
        harness.transport.emit(
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
        expect(harness.client.id()).toBe("SOME_CLIENT_ID");
        expect(feed.desiredState()).toBe("closed");
        expect(feed.state()).toBe("closed");
        expect(function() {
          feed.data();
        }).toThrow(
          new Error("INVALID_FEED_STATE: The feed object is not open.")
        );
      });

      // Events - client and feed

      it("events", function() {
        var clientListener = harness.createClientListener();
        var feedListener = harness.createFeedListener(feed);
        var actionNameSpy = jasmine.createSpy();
        feed.on("action:SomeAction", actionNameSpy);

        // Have the transport emit a valid ActionRevelation
        harness.transport.emit(
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

      it("transport calls", function() {
        harness.transport.spyClear();

        // Have the transport emit a valid ActionRevelation
        harness.transport.emit(
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

  afterEach(function() {
    jasmine.clock().uninstall();
  });
});

describe("Structurally/sequentially valid FeedTermination message", function() {
  describe("when the server feed is open", function() {
    var harness;
    var feedWantedOpen;
    var feedWantedClosed;
    beforeEach(function() {
      harness = harnessFactory();
      harness.connectClient();
      feedWantedOpen = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feedWantedOpen.desireOpen();
      feedWantedClosed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      harness.transport.emit(
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

    it("state functions", function() {
      // Check state functions
      expect(harness.client.state()).toBe("connected");
      expect(harness.client.id()).toBe("SOME_CLIENT_ID");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("open");
      expect(feedWantedOpen.data()).toEqual({ Feed: "Data" });
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Have the transport emit a FeedTermination
      harness.transport.emit(
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
      expect(harness.client.id()).toBe("SOME_CLIENT_ID");
      expect(feedWantedOpen.desiredState()).toBe("open");
      expect(feedWantedOpen.state()).toBe("closed");
      expect(function() {
        feedWantedOpen.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
      expect(feedWantedClosed.desiredState()).toBe("closed");
      expect(feedWantedClosed.state()).toBe("closed");
      expect(function() {
        feedWantedClosed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    // Events - client and feed

    it("events", function() {
      var clientListener = harness.createClientListener();
      var feedWantedOpenListener = harness.createFeedListener(feedWantedOpen);
      var feedWantedClosedListener = harness.createFeedListener(
        feedWantedClosed
      );

      // Have the transport emit a FeedTermination
      harness.transport.emit(
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

    it("transport calls", function() {
      harness.transport.spyClear();

      // Have the transport emit a FeedTermination
      harness.transport.emit(
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

  describe("when the server feed is closing", function() {
    var harness;
    var feed;
    beforeEach(function() {
      harness = harnessFactory();
      harness.connectClient();
      feed = harness.client.feed("SomeFeed", { Feed: "Arg" });
      feed.desireOpen();
      harness.transport.emit(
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
    });
    // State functions

    it("state functions", function() {
      // Check state functions
      expect(harness.client.state()).toBe("connected");
      expect(harness.client.id()).toBe("SOME_CLIENT_ID");
      expect(feed.desiredState()).toBe("closed");
      expect(feed.state()).toBe("closed");
      expect(function() {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));

      // Have the transport emit a FeedTermination
      harness.transport.emit(
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
      expect(harness.client.id()).toBe("SOME_CLIENT_ID");
      expect(feed.desiredState()).toBe("closed");
      expect(feed.state()).toBe("closed");
      expect(function() {
        feed.data();
      }).toThrow(new Error("INVALID_FEED_STATE: The feed object is not open."));
    });

    // Events - client and feed

    it("events", function() {
      var clientListener = harness.createClientListener();
      var feedListener = harness.createFeedListener(feed);

      // Have the transport emit a FeedTermination
      harness.transport.emit(
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

    it("transport calls", function() {
      harness.transport.spyClear();

      // Have the transport emit a FeedTermination
      harness.transport.emit(
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
