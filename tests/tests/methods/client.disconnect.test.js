import { harness, toBe } from "../common";

describe("The client.disconnect() function", () => {
  describe("invalid application invocation - client is disconnected", () => {
    it("client is disconnected", async () => {
      harness.initClient({
        transport: harness.mockTransport()
      });

      const trace = await harness.trace(() => {
        harness.clientWrapper.disconnect();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "disconnect",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_STATE: Already disconnected."
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

  describe("valid application invocation - client is not disconnected", () => {
    describe("client is connecting - transport connecting", () => {
      describe("invalid transport behavior - post-disconnect state is not disconnected", () => {
        it("transport throws on pre-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.stateImplementation = () => {
            throw new Error("SOME_ERROR: ...");
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
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

        it("transport returns invalid value on pre-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.stateImplementation = () => "bad_state";

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
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

        it("transport throws on call to transport.disconnect()", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            throw new Error("SOME_ERROR: ...");
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: {
              Error: {
                name: "Error",
                message:
                  "TRANSPORT_ERROR: Transport threw an error on call to disconnect().",
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

        it("transport throws on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => {
              throw new Error("SOME_ERROR: ...");
            };
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
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
            Method: "disconnect",
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

        it("transport returns invalid value on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "bad_state";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
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
            Method: "disconnect",
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

        it("transport returns 'connecting' on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connecting";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "connecting" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: {
              Error: {
                name: "Error",
                message:
                  "TRANSPORT_ERROR: Transport state was 'connecting' after a call to disconnect()."
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

        it("transport returns 'connected' on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connected";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "connecting" }; // Handshake not complete

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: {
              Error: {
                name: "Error",
                message:
                  "TRANSPORT_ERROR: Transport state was 'connected' after a call to disconnect()."
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

      describe("valid transport behavior - post-disconnect state is disconnected", () => {
        it("transport emits disconnect synchronously", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "disconnected" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: { ReturnValue: undefined }
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

        it("transport does not emit disconnect synchronously", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
            mockTransport.emit("disconnect");
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "disconnected" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: { ReturnValue: undefined }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneTrace",
            State: curState
          });

          expect(trace[4]).toEqual({
            Invocation: "EmitClientEvent",
            State: curState,
            Event: "disconnect",
            Args: [],
            Context: toBe(harness.clientActual)
          });

          expect(trace[5]).toEqual({
            Phase: "DoneDefer",
            State: curState
          });

          expect(trace[6]).toEqual({
            Phase: "DoneTimers",
            State: curState
          });
        });
      });
    });

    describe("client is connecting - transport connected but handshake pending", () => {
      describe("invalid transport behavior - post-disconnect state is not disconnected", () => {
        it("transport throws on pre-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.stateImplementation = () => {
            throw new Error("SOME_ERROR: ...");
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
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

        it("transport returns invalid value on pre-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.stateImplementation = () => "bad_state";

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
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

        it("transport throws on call to transport.disconnect()", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            throw new Error("SOME_ERROR: ...");
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: {
              Error: {
                name: "Error",
                message:
                  "TRANSPORT_ERROR: Transport threw an error on call to disconnect().",
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

        it("transport throws on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => {
              throw new Error("SOME_ERROR: ...");
            };
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
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
            Method: "disconnect",
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

        it("transport returns invalid value on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "bad_state";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
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
            Method: "disconnect",
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

        it("transport returns 'connecting' on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connecting";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "connecting" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: {
              Error: {
                name: "Error",
                message:
                  "TRANSPORT_ERROR: Transport state was 'connecting' after a call to disconnect()."
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

        it("transport returns 'connected' on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connected";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "connecting" }; // Handshake not complete

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: {
              Error: {
                name: "Error",
                message:
                  "TRANSPORT_ERROR: Transport state was 'connected' after a call to disconnect()."
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

      describe("valid transport behavior - post-disconnect state is disconnected", () => {
        it("transport emits disconnect synchronously", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "disconnected" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: { ReturnValue: undefined }
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

        it("transport does not emit disconnect synchronously", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
            mockTransport.emit("disconnect");
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "disconnected" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: { ReturnValue: undefined }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneTrace",
            State: curState
          });

          expect(trace[4]).toEqual({
            Invocation: "EmitClientEvent",
            State: curState,
            Event: "disconnect",
            Args: [],
            Context: toBe(harness.clientActual)
          });

          expect(trace[5]).toEqual({
            Phase: "DoneDefer",
            State: curState
          });

          expect(trace[6]).toEqual({
            Phase: "DoneTimers",
            State: curState
          });
        });
      });
    });

    describe("client is connected", () => {
      describe("invalid transport behavior - post-disconnect state is not disconnected", () => {
        it("transport throws on pre-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.stateImplementation = () => {
            throw new Error("SOME_ERROR: ...");
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
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

        it("transport returns invalid value on pre-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.stateImplementation = () => "bad_state";

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
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

        it("transport throws on call to transport.disconnect()", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            throw new Error("SOME_ERROR: ...");
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: {
              Error: {
                name: "Error",
                message:
                  "TRANSPORT_ERROR: Transport threw an error on call to disconnect().",
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

        it("transport throws on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => {
              throw new Error("SOME_ERROR: ...");
            };
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
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
            Method: "disconnect",
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

        it("transport returns invalid value on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "bad_state";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
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
            Method: "disconnect",
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

        it("transport returns 'connecting' on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connecting";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "connecting" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: {
              Error: {
                name: "Error",
                message:
                  "TRANSPORT_ERROR: Transport state was 'connecting' after a call to disconnect()."
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

        it("transport returns 'connected' on post-disconnect state check", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connected";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "connected" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: {
              Error: {
                name: "Error",
                message:
                  "TRANSPORT_ERROR: Transport state was 'connected' after a call to disconnect()."
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

      describe("valid transport behavior - post-disconnect state is disconnected", () => {
        it("transport emits disconnect synchronously", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "disconnected" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: { ReturnValue: undefined }
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

        it("transport does not emit disconnect synchronously", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
            mockTransport.emit("disconnect");
          };

          const trace = await harness.trace(() => {
            harness.clientWrapper.disconnect();
          });

          expect(trace[0]).toEqual({
            Phase: "Start",
            State: jasmine.any(Object)
          });

          const curState = trace[0].State;

          expect(trace[1]).toEqual({
            Invocation: "CallTransportMethod",
            State: curState,
            Method: "disconnect",
            Args: [],
            Context: toBe(mockTransport)
          });

          curState.state = { ReturnValue: "disconnected" };

          expect(trace[2]).toEqual({
            Invocation: "ExitClientMethod",
            State: curState,
            Method: "disconnect",
            Result: { ReturnValue: undefined }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneTrace",
            State: curState
          });

          expect(trace[4]).toEqual({
            Invocation: "EmitClientEvent",
            State: curState,
            Event: "disconnect",
            Args: [],
            Context: toBe(harness.clientActual)
          });

          expect(trace[5]).toEqual({
            Phase: "DoneDefer",
            State: curState
          });

          expect(trace[6]).toEqual({
            Phase: "DoneTimers",
            State: curState
          });
        });
      });
    });
  });
});
