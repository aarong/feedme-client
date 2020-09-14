import { harness } from "./common";

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
