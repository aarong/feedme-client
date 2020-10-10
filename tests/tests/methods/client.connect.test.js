import { harness, toBe } from "../common";

describe("The client.connect() function", () => {
  describe("invalid application invocation - client is not disconnected", () => {
    it("client is connecting - transport connecting", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        connectTimeoutMs: 0
      });
      await harness.makeClientConnectingBeforeHandshake();

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

    it("client is connecting - transport connected and handshake pending", async () => {
      harness.initClient({
        transport: harness.mockTransport(),
        connectTimeoutMs: 0
      });
      await harness.makeClientConnectingAfterHandshake();

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
        transport: harness.mockTransport()
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

  describe("valid application invocation - client is disconnected", () => {
    describe("invalid transport behavior", () => {
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

    describe("valid transport behavior", () => {
      describe("post-connect transport state is disconnected", () => {
        it("connect retry timer was not pending", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          mockTransport.connectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
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
              ReturnValue: undefined
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

        it("connect retry timer was pending", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnectTimeoutTransport();

          mockTransport.connectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
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
              ReturnValue: undefined
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

      describe("post-connect transport state is connecting", () => {
        it("connect retry timer was not pending", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          mockTransport.connectImplementation = () => {
            mockTransport.stateImplementation = () => "connecting";
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

          curState.state = { ReturnValue: "connecting" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "connect",
            Result: {
              ReturnValue: undefined
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

        it("connect retry timer was pending", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnectTimeoutTransport();

          mockTransport.connectImplementation = () => {
            mockTransport.stateImplementation = () => "connecting";
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

          curState.state = { ReturnValue: "connecting" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "connect",
            Result: {
              ReturnValue: undefined
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

      describe("post-connect transport state is connected", () => {
        it("connect retry timer was not pending", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          mockTransport.connectImplementation = () => {
            mockTransport.stateImplementation = () => "connected";
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

          curState.state = { ReturnValue: "connecting" }; // Handshake not complete

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "connect",
            Result: {
              ReturnValue: undefined
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

        it("connect retry timer was pending", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnectTimeoutTransport();

          mockTransport.connectImplementation = () => {
            mockTransport.stateImplementation = () => "connected";
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

          curState.state = { ReturnValue: "connecting" }; // Handshake not complete

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "connect",
            Result: {
              ReturnValue: undefined
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
    });
  });
});
