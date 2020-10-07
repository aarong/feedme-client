import { harness } from "../common";

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
    // it("transport returns invalid state initially", async () => {
    //   const mockTransport = harness.mockTransport();
    //   harness.initClient({
    //     transport: mockTransport,
    //     connectTimeoutMs: 0
    //   });

    //   mockTransport.stateImplementation = () => "bad_state";

    //   /*

    //   The problem is that GETTING the state results in another transportError
    //   being added to the trace, which itself tries to get a state

    //   What to do?
    //   Maybe you don't emit transportError for method calls, only for event
    //   emissions!!! For method calls, you can just throw...
    //     BUT WAIT -- what if you are running inside a timer function? The
    //     application may not have directly requested the transport call...

    //     One option would be to try/catch those errors and emit from session/client
    //     Is that a reasonable change for tests alone?
    //     And isn't it nice to be able to see all transport errors in one place?

    //   Maybe you don't get transport state in some circumstances?
    //     Perhaps just not on transportError events? Easiest way, but is this
    //     something that you want to be able to test?
    //     You STILL get a buttload of transportErrors in the trace, just no
    //     infinite loop (because at each invocation you're still geting state)

    //   So I'm leaning toward not emitting on method calls, and doing so in the
    //   client/session on timer functions. Does this for sure fix the problem? I believe so
    //   So the transportError event is for internal transport errors -- anything not
    //   thrown directly on an application method call. This also gets rid of my
    //   annoying emitErr/throwErr duplication in the transport. And as a general
    //   rule, if you're throwing, you should probably not have other side effets. Perfect.

    //   And make it emit only TRANSPORT_ERROR

    //   */

    //   const trace = await harness.trace(() => {
    //     harness.clientWrapper.connect();
    //   });

    //   expect(trace[0]).toEqual({
    //     Phase: "Start",
    //     State: jasmine.any(Object)
    //   });

    //   const curState = trace[0].State;

    //   curState.state = {
    //     Error: {
    //       name: "Error",
    //       message:
    //         "TRANSPORT_ERROR2: Transport returned invalid state 'bad_state' on call to state()."
    //     }
    //   };

    //   console.log(trace);

    //   expect(trace[1]).toEqual({
    //     Invocation: "ExitClientMethod",
    //     State: curState,
    //     Method: "connect",
    //     Result: {
    //       Error: {
    //         name: "Error",
    //         message:
    //           "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    //       }
    //     }
    //   });

    //   expect(trace[2]).toEqual({
    //     Invocation: "EmitClientEvent",
    //     State: curState,
    //     Event: "transportError",
    //     Args: [],
    //     Context: toBe(harness.clientActual)
    //   });

    //   expect(trace[2]).toEqual({
    //     Phase: "DoneTrace",
    //     State: curState
    //   });

    //   expect(trace[3]).toEqual({
    //     Phase: "DoneDefer",
    //     State: curState
    //   });

    //   expect(trace[4]).toEqual({
    //     Phase: "DoneTimers",
    //     State: curState
    //   });
    // });

    // WHAT IF TRANSPORT THROWS on STATE???

    it("transport returns invalid state before call to transport.connect()", async () => {});

    it("transport throws on valid call to transport.connect()", async () => {});

    it("transport returns invalid state after call to transport.connect()", async () => {});
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
