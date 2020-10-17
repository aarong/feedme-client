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

        it("transport throws on call to transport.disconnect(), after which state is disconnected", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
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

          // Transport state cannot change synchronously
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'disconnected' on call to state() when 'connecting' was expected."
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
                  "TRANSPORT_ERROR: Transport threw an error on call to disconnect().",
                transportError: {
                  name: "Error",
                  message: "SOME_ERROR: ..."
                }
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // Transport state connecting -> disconnected is valid after a deferral
          curState.state = { ReturnValue: "disconnected" };

          expect(trace[4]).toEqual({
            Phase: "DoneDefer",
            State: curState
          });

          expect(trace[5]).toEqual({
            Phase: "DoneTimers",
            State: curState
          });
        });

        it("transport throws on call to transport.disconnect(), after which state is connecting (no change)", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connecting";
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
            Phase: "DoneSync",
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

        it("transport throws on call to transport.disconnect(), after which state is connected", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingBeforeHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connected";
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

          // Transport state cannot change synchronously
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'connecting' was expected."
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
                  "TRANSPORT_ERROR: Transport threw an error on call to disconnect().",
                transportError: {
                  name: "Error",
                  message: "SOME_ERROR: ..."
                }
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // Transport state connecting -> connected is valid after a deferral
          // Handshake is not complete, so client state is connecting
          curState.state = { ReturnValue: "connecting" };

          expect(trace[4]).toEqual({
            Phase: "DoneDefer",
            State: curState
          });

          expect(trace[5]).toEqual({
            Phase: "DoneTimers",
            State: curState
          });
        });

        it("transport throws on call to transport.disconnect() due to a synchronous emission, after which state is disconnected", async () => {
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

          // Transport state cannot change synchronously (call to disconnect failed)
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'disconnected' on call to state() when 'connecting' was expected."
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
                  "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to disconnect()."
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // Transport state connecting -> disconnected is valid after a deferral
          curState.state = { ReturnValue: "disconnected" };

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
            Phase: "DoneSync",
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
            Phase: "DoneSync",
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

          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
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
                  "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // The last working call to transport.state() returned connecting
          // So connecting transport state is valid after a deferral

          curState.state = {
            ReturnValue: "connecting"
          };

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

          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
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
                  "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // The last working call to transport.state() returned connecting
          // So connected transport state is valid after a deferral
          // Handshake is not complete, so client state is connecting

          curState.state = {
            ReturnValue: "connecting"
          };

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

      it("valid transport behavior", async () => {
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
          Phase: "DoneSync",
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

    describe("client is connecting - transport connected but handshake pending", () => {
      describe("invalid transport behavior", () => {
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

        it("transport throws on call to transport.disconnect(), after which state is disconnected", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
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

          // Transport state cannot change synchronously
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'disconnected' on call to state() when 'connected' was expected."
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
                  "TRANSPORT_ERROR: Transport threw an error on call to disconnect().",
                transportError: {
                  name: "Error",
                  message: "SOME_ERROR: ..."
                }
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // Transport state connected -> disconnected is valid after deferral
          curState.state = { ReturnValue: "disconnected" };

          expect(trace[4]).toEqual({
            Phase: "DoneDefer",
            State: curState
          });

          expect(trace[5]).toEqual({
            Phase: "DoneTimers",
            State: curState
          });
        });

        it("transport throws on call to transport.disconnect(), after which state is connecting", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connecting";
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

          // Transport state cannot change synchronously
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'connected' was expected."
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
                  "TRANSPORT_ERROR: Transport threw an error on call to disconnect().",
                transportError: {
                  name: "Error",
                  message: "SOME_ERROR: ..."
                }
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // Transport state cannot go connected -> connecting even after a deferral
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            }
          };

          expect(trace[4]).toEqual({
            Phase: "DoneDefer",
            State: curState
          });

          expect(trace[5]).toEqual({
            Phase: "DoneTimers",
            State: curState
          });
        });

        it("transport throws on call to transport.disconnect(), after which state is connected (no change)", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport,
            connectTimeoutMs: 0
          });

          await harness.makeClientConnectingAfterHandshake();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connected";
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
            Phase: "DoneSync",
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

        it("transport throws on call to transport.disconnect() due to a synchronous emission, after which state is disconnected", async () => {
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

          // Transport state cannot change synchronously (call to disconnect failed)
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'disconnected' on call to state() when 'connected' was expected."
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
                  "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to disconnect()."
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // Transport state connected -> disconnected is valid after a deferral
          curState.state = { ReturnValue: "disconnected" };

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
            Phase: "DoneSync",
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
            Phase: "DoneSync",
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

          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
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
                  "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // The last working call to transport.state() returned connected
          // So connecting transport state is not valid after a deferral

          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            }
          };

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

          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
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
                  "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // The last working call to transport.state() returned connecting
          // So connected transport state is valid after a deferral
          // The handshake has not taken place, so client state is connecting

          curState.state = {
            ReturnValue: "connecting"
          };

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

      it("valid transport behavior", async () => {
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
          Phase: "DoneSync",
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

    describe("client is connected", () => {
      describe("invalid transport behavior", () => {
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

        it("transport throws on call to transport.disconnect(), after which state is disconnected", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "disconnected";
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

          // Transport state cannot change synchronously
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'disconnected' on call to state() when 'connected' was expected."
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
                  "TRANSPORT_ERROR: Transport threw an error on call to disconnect().",
                transportError: {
                  name: "Error",
                  message: "SOME_ERROR: ..."
                }
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // Transport state connected -> disconnected is valid after a deferral
          curState.state = { ReturnValue: "disconnected" };

          expect(trace[4]).toEqual({
            Phase: "DoneDefer",
            State: curState
          });

          expect(trace[5]).toEqual({
            Phase: "DoneTimers",
            State: curState
          });
        });

        it("transport throws on call to transport.disconnect(), after which state is connecting", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connecting";
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

          // Transport state cannot change synchronously
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'connected' was expected."
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
                  "TRANSPORT_ERROR: Transport threw an error on call to disconnect().",
                transportError: {
                  name: "Error",
                  message: "SOME_ERROR: ..."
                }
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // Transport state connected -> connecting is not valid after a deferral
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            }
          };

          expect(trace[4]).toEqual({
            Phase: "DoneDefer",
            State: curState
          });

          expect(trace[5]).toEqual({
            Phase: "DoneTimers",
            State: curState
          });
        });

        it("transport throws on call to transport.disconnect(), after which state is connected (no change)", async () => {
          const mockTransport = harness.mockTransport();
          harness.initClient({
            transport: mockTransport
          });

          await harness.makeClientConnected();

          mockTransport.disconnectImplementation = () => {
            mockTransport.stateImplementation = () => "connected";
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
            Phase: "DoneSync",
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

        it("transport throws on call to transport.disconnect() due to a synchronous emission, after which state is disconnected", async () => {
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

          // Transport state cannot change synchronously (call to disconnect failed)
          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'disconnected' on call to state() when 'connected' was expected."
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
                  "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to disconnect()."
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // Transport state connected -> disconnected is valid after a deferral
          curState.state = { ReturnValue: "disconnected" };

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
            Phase: "DoneSync",
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
            Phase: "DoneSync",
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

          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
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
                  "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // The last working call to transport.state() returned connected
          // So connecting is invalid after a deferral

          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            }
          };

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

          curState.state = {
            Error: {
              name: "Error",
              message:
                "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
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
                  "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
              }
            }
          });

          expect(trace[3]).toEqual({
            Phase: "DoneSync",
            State: curState
          });

          // The last working call to transport.state() returned connected
          // So connected is valid after a deferral

          curState.state = {
            ReturnValue: "connected"
          };

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

      it("valid transport behavior", async () => {
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
          Phase: "DoneSync",
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
