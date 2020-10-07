import { harness, toBe } from "../common";

describe("The client.connect() function", () => {
  describe("application-related failures", () => {
    it("client is connecting", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        connectTimeoutMs: 0
      });
      await harness.makeClientConnecting();

      const trace = await harness.trace(() => {
        harness.clientWrapper.connect();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_STATE: Already connecting or connected."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneTrace",
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

    it("client is connected", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        connectTimeoutMs: 0
      });
      await harness.makeClientConnected();

      const trace = await harness.trace(() => {
        harness.clientWrapper.connect();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_STATE: Already connecting or connected."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneTrace",
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

  describe("transport-related failures", () => {
    it("transport throws on pre-connect state check", async () => {
      const mockTransport = harness.mockTransport();
      harness.initClient({
        transport: mockTransport
      });

      mockTransport.stateImplementation = () => {
        throw new Error("SOME_ERROR: ...");
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
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
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
        Phase: "DoneTrace",
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

    it("transport returns invalid value on pre-connect state check", async () => {
      const mockTransport = harness.mockTransport();
      harness.initClient({
        transport: mockTransport
      });

      mockTransport.stateImplementation = () => "bad_state";

      const trace = await harness.trace(() => {
        harness.clientWrapper.connect();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
        Result: {
          Error: {
            name: "Error",
            message:
              "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneTrace",
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

    it("transport throws on call to transport.connect()", async () => {
      const mockTransport = harness.mockTransport();
      harness.initClient({
        transport: mockTransport
      });

      mockTransport.connectImplementation = () => {
        throw new Error("SOME_ERROR: ...");
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
        Context: toBe(mockTransport)
      });

      expect(trace[2]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
        Result: {
          Error: {
            name: "Error",
            message:
              "TRANSPORT_ERROR: Transport threw an error on call to connect().",
            transportError: {
              name: "Error",
              message: "SOME_ERROR: ..."
            }
          }
        }
      });

      expect(trace[3]).toEqual({
        Phase: "DoneTrace",
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

    it("transport throws on post-connect state check", async () => {
      const mockTransport = harness.mockTransport();
      harness.initClient({
        transport: mockTransport
      });

      mockTransport.connectImplementation = () => {
        mockTransport.stateImplementation = () => {
          throw new Error("SOME_ERROR: ...");
        };
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
        Context: toBe(mockTransport)
      });

      curState.state = {
        Error: {
          name: "Error",
          message:
            "TRANSPORT_ERROR: Transport threw an error on call to state().",
          transportError: {
            name: "Error",
            message: "SOME_ERROR: ..."
          }
        }
      };

      expect(trace[2]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
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

      expect(trace[3]).toEqual({
        Phase: "DoneTrace",
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

    it("transport returns invalid value on post-connect state check", async () => {
      const mockTransport = harness.mockTransport();
      harness.initClient({
        transport: mockTransport
      });

      mockTransport.connectImplementation = () => {
        mockTransport.stateImplementation = () => "bad_state";
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
        Context: toBe(mockTransport)
      });

      curState.state = {
        Error: {
          name: "Error",
          message:
            "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
        }
      };

      expect(trace[2]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "connect",
        Result: {
          Error: {
            name: "Error",
            message:
              "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
          }
        }
      });

      expect(trace[3]).toEqual({
        Phase: "DoneTrace",
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
  });

  describe("success", () => {
    describe("ending state is disconnected", () => {
      describe("connect retry timer is not pending", () => {});

      describe("connect retry timer is pending", () => {});
    });

    describe("ending state is connecting", () => {
      describe("options.connectTimeoutMs > 0", () => {
        describe("connect retry timer is not pending", () => {});

        describe("connect retry timer is pending", () => {});
      });

      describe("options.connectTimeoutMs === 0", () => {
        describe("connect retry timer is not pending", () => {});

        describe("connect retry timer is pending", () => {});
      });
    });

    describe("ending state is connected", () => {
      describe("options.connectTimeoutMs > 0", () => {
        describe("connect retry timer is not pending", () => {});

        describe("connect retry timer is pending", () => {});
      });

      describe("options.connectTimeoutMs === 0", () => {
        describe("connect retry timer is not pending", () => {});

        describe("connect retry timer is pending", () => {});
      });
    });
  });
});
