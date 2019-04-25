var emitter = require("component-emitter");

// Build integration tests run on Node and in the browser
// Test API promises in the user documentation
// Assume an in-scope feedmeClient() factory function

var epsilon = 1;

var harnessProto = {};
var harnessFactory = function(options) {
  // Mock transport is added to any other specified options
  options = options || {};
  var harness = Object.create(harnessProto);

  // Create the transport
  var t = {};
  emitter(t);
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
  harness.transport = t;

  // Create the client
  options.transport = t;
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

// Configuration

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
    harness.transport.emit("disconnect", new Error("DISCONNECTED: ..."));

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
    harness.transport.emit("disconnect", new Error("DISCONNECTED: ..."));
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
    harness.transport.emit("disconnect", new Error("DISCONNECTED: ..."));
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
      harness.transport.emit("disconnect", new Error("DISCONNECTED: ..."));

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
      harness.transport.emit("disconnect", new Error("DISCONNECTED: ..."));

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
      harness.transport.emit("disconnect", new Error("DISCONNECTED: ..."));

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
    harness.transport.emit("disconnect", new Error("DISCONNECTED: ..."));
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

    // Disconnect the transport and ensure that transport.connect() is called
    harness.transport.spyClear();
    harness.transport.state.and.returnValue("disconnected");
    harness.transport.emit("disconnect", new Error("DISCONNECTED: ..."));
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

// Client functions

describe("The client.connect() function", function() {
  // Events (client and feed)
  // State functions
  // Transport -- NO, just the client-facing stuff!
  // Callbacks
  // Return value
});

describe("The client.disconnect() function", function() {});

describe("The client.action() function", function() {});

describe("The client.feed() function", function() {});

// Client events

describe("The client connecting event", function() {});

describe("The client connect event", function() {});

describe("The client disconnect event", function() {});

describe("The client badServerMessage event", function() {});

describe("The client badClientMessage event", function() {});

describe("The client transportError event", function() {});

// Feed functions

describe("The feed.desireOpen() function", function() {});

describe("The feed.desireClosed() function", function() {});

describe("The feed.destroy() function", function() {});

// Feed events

describe("The feed opening event", function() {});

describe("The feed open event", function() {});

describe("The feed close event", function() {});

describe("The feed action and action:name events", function() {});
