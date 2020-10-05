import { harness } from "../common";

// Dependent-invoked methods

describe("The feedmeClient() factory function", () => {
  describe("invalid application behavior", () => {
    it("invalid options argument type", async () => {
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

    it("invalid options.transport type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({});
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

    it("options.transport argument - invalid transport.on type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            state: () => "disconnected",
            connect: () => {},
            disconnect: () => {},
            send: () => {}
          }
        });
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
            message:
              "INVALID_ARGUMENT: Transport does not implement the required API."
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

    it("options.transport argument - invalid transport.connect type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            state: () => "disconnected",
            disconnect: () => {},
            send: () => {},
            on: () => {}
          }
        });
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
            message:
              "INVALID_ARGUMENT: Transport does not implement the required API."
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

    it("options.transport argument - invalid transport.disconnect type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            on: () => {}
          }
        });
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
            message:
              "INVALID_ARGUMENT: Transport does not implement the required API."
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

    it("options.transport argument - invalid transport.send type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            state: () => "disconnected",
            connect: () => {},
            disconnect: () => {},
            on: () => {}
          }
        });
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
            message:
              "INVALID_ARGUMENT: Transport does not implement the required API."
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

    it("options.transport argument - invalid transport.state type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            connect: () => {},
            disconnect: () => {},
            send: () => {},
            on: () => {}
          }
        });
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
            message:
              "INVALID_ARGUMENT: Transport does not implement the required API."
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

    it("options.transport argument - transport.state() throws", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            state: () => {
              throw new Error("SOME_ERROR: ...");
            },
            connect: () => {},
            disconnect: () => {},
            send: () => {},
            on: () => {}
          }
        });
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
            message:
              "TRANSPORT_ERROR: Transport threw an error on call to state().",
            transportError: {
              name: "Error",
              message: "SOME_ERROR: ..."
            }
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

    it("options.transport argument - transport.state() returns invalid state", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            state: () => "bad_state",
            connect: () => {},
            disconnect: () => {},
            send: () => {},
            on: () => {}
          }
        });
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
            message:
              "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
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

    it("options.transport argument - transport.state() returns connecting", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            state: () => "connecting",
            connect: () => {},
            disconnect: () => {},
            send: () => {},
            on: () => {}
          }
        });
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
            message:
              "TRANSPORT_ERROR: Transport returned invalid state 'connecting' on call to state(). Must be 'disconnected' at initialization."
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

    it("options.transport argument - transport.state() returns connected", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            state: () => "connected",
            connect: () => {},
            disconnect: () => {},
            send: () => {},
            on: () => {}
          }
        });
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
            message:
              "TRANSPORT_ERROR: Transport returned invalid state 'connected' on call to state(). Must be 'disconnected' at initialization."
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

    it("options.transport argument - transport.on() throws", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: {
            state: () => "disconnected",
            connect: () => {},
            disconnect: () => {},
            send: () => {},
            on: () => {
              throw new Error("SOME_ERROR: ...");
            }
          }
        });
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
            message:
              "TRANSPORT_ERROR: Transport threw an error on call to .on().",
            transportError: {
              name: "Error",
              message: "SOME_ERROR: ..."
            }
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

// Dependency-invoked methods

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
