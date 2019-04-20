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

describe("The connectRetryBackoffMs option", function() {});

describe("The connectRetryMaxMs option", function() {});

describe("The connectRetryMaxAttempts option", function() {});

describe("The actionTimeout option", function() {});

describe("The feedTimeout option", function() {});

describe("The reconnect option", function() {});

describe("The reopenMaxAttempts and reopenTrailingMs options", function() {});

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
