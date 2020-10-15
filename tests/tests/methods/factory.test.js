import { harness, toBe } from "../common";
import config from "../../../src/config";

describe("The feedmeClient() factory function", () => {
  describe("invalid application invocation", () => {
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

    it("options.connectTimeoutMs - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectTimeoutMs: undefined
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
            message: "INVALID_ARGUMENT: Invalid options.connectTimeoutMs."
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

    it("options.connectTimeoutMs - decimal", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectTimeoutMs: 1.1
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
            message: "INVALID_ARGUMENT: Invalid options.connectTimeoutMs."
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

    it("options.connectTimeoutMs - negative", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectTimeoutMs: -1
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
            message: "INVALID_ARGUMENT: Invalid options.connectTimeoutMs."
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

    it("options.connectRetryMs - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMs: undefined
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryMs."
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

    it("options.connectRetryMs - decimal", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMs: 1.1
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryMs."
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

    it("options.connectRetryBackoffMs - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryBackoffMs: undefined
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryBackoffMs."
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

    it("options.connectRetryBackoffMs - decimal", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryBackoffMs: 1.1
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryBackoffMs."
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

    it("options.connectRetryBackoffMs - negative", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryBackoffMs: -1
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryBackoffMs."
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

    it("options.connectRetryMaxMs - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMaxMs: undefined
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryMaxMs."
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

    it("options.connectRetryMaxMs - decimal", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMaxMs: 1.1
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryMaxMs."
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

    it("options.connectRetryMaxMs - negative", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMaxMs: -1
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryMaxMs."
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

    it("options.connectRetryMaxMs - less than explicit connectRetryMs", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMs: 2,
          connectRetryMaxMs: 1
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryMaxMs."
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

    it("options.connectRetryMaxMs - less than default connectRetryMs", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMaxMs: config.defaults.connectRetryMs - 1
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
            message: "INVALID_ARGUMENT: Invalid options.connectRetryMaxMs."
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

    it("options.connectRetryMaxAttempts - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMaxAttempts: undefined
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
              "INVALID_ARGUMENT: Invalid options.connectRetryMaxAttempts."
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

    it("options.connectRetryMaxAttempts - decimal", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMaxAttempts: 1.1
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
              "INVALID_ARGUMENT: Invalid options.connectRetryMaxAttempts."
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

    it("options.connectRetryMaxAttempts - negative", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectRetryMaxAttempts: -1
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
              "INVALID_ARGUMENT: Invalid options.connectRetryMaxAttempts."
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

    it("options.actionTimeoutMs - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          actionTimeoutMs: undefined
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
            message: "INVALID_ARGUMENT: Invalid options.actionTimeoutMs."
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

    it("options.actionTimeoutMs - decimal", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          actionTimeoutMs: 1.1
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
            message: "INVALID_ARGUMENT: Invalid options.actionTimeoutMs."
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

    it("options.actionTimeoutMs - negative", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          actionTimeoutMs: -1
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
            message: "INVALID_ARGUMENT: Invalid options.actionTimeoutMs."
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

    it("options.feedTimeoutMs - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          feedTimeoutMs: undefined
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
            message: "INVALID_ARGUMENT: Invalid options.feedTimeoutMs."
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

    it("options.feedTimeoutMs - decimal", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          feedTimeoutMs: 1.1
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
            message: "INVALID_ARGUMENT: Invalid options.feedTimeoutMs."
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

    it("options.feedTimeoutMs - negative", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          feedTimeoutMs: -1
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
            message: "INVALID_ARGUMENT: Invalid options.feedTimeoutMs."
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

    it("options.reconnect - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          reconnect: undefined
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
            message: "INVALID_ARGUMENT: Invalid options.reconnect."
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

    it("options.reopenMaxAttempts - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          reopenMaxAttempts: undefined
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
            message: "INVALID_ARGUMENT: Invalid options.reopenMaxAttempts."
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

    it("options.reopenMaxAttempts - decimal", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          reopenMaxAttempts: 1.1
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
            message: "INVALID_ARGUMENT: Invalid options.reopenMaxAttempts."
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

    it("options.reopenTrailingMs - invalid type", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          reopenTrailingMs: undefined
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
            message: "INVALID_ARGUMENT: Invalid options.reopenTrailingMs."
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

    it("options.reopenTrailingMs - decimal", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          reopenTrailingMs: 1.1
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
            message: "INVALID_ARGUMENT: Invalid options.reopenTrailingMs."
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

    it("options.reopenTrailingMs - negative", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          reopenTrailingMs: -1
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
            message: "INVALID_ARGUMENT: Invalid options.reopenTrailingMs."
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

    it("options.transport - invalid type", async () => {
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

    it("options.transport - invalid transport.on type", async () => {
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
              "TRANSPORT_ERROR: Transport does not implement the required API."
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

    it("options.transport - invalid transport.connect type", async () => {
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
              "TRANSPORT_ERROR: Transport does not implement the required API."
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

    it("options.transport - invalid transport.disconnect type", async () => {
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
              "TRANSPORT_ERROR: Transport does not implement the required API."
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

    it("options.transport - invalid transport.send type", async () => {
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
              "TRANSPORT_ERROR: Transport does not implement the required API."
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

    it("options.transport - invalid transport.state type", async () => {
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
              "TRANSPORT_ERROR: Transport does not implement the required API."
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

    it("options.transport - transport.state() throws", async () => {
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

    it("options.transport - transport.state() returns invalid state", async () => {
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

    it("options.transport - transport.state() returns connecting", async () => {
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
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
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

    it("options.transport - transport.state() returns connected", async () => {
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
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
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

    it("options.transport - transport.on() throws", async () => {
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
              "TRANSPORT_ERROR: Transport threw an error on call to on().",
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

  describe("valid application invocation", () => {
    it("all default options", async () => {
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
        Result: {
          ReturnValue: toBe(harness.clientActual)
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

    it("all explicit options", async () => {
      const trace = await harness.trace(() => {
        harness.initClient({
          transport: harness.mockTransport(),
          connectTimeoutMs: 1,
          connectRetryMs: 1,
          connectRetryBackoffMs: 1,
          connectRetryMaxMs: 1,
          connectRetryMaxAttempts: 1,
          actionTimeoutMs: 1,
          feedTimeoutMs: 1,
          reconnect: true,
          reopenMaxAttempts: 1,
          reopenTrailingMs: 1
        });
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
        Result: {
          ReturnValue: toBe(harness.clientActual)
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
