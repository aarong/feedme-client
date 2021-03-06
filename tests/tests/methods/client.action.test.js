// import { harness, toBe } from "../common";

// describe("The client.action() function - callback usage", () => {
//   describe("invalid application invocation", () => {
//     it("actionName argument - invalid type", async () => {
//       harness.initClient({
//         transport: harness.mockTransport()
//       });

//       const trace = await harness.trace(() => {
//         harness.clientWrapper.action(undefined, { Action: "Args" }, () => {});
//       });

//       expect(trace[0]).toEqual({
//         Phase: "Start",
//         State: jasmine.any(Object)
//       });

//       const curState = trace[0].State;

//       expect(trace[1]).toEqual({
//         Invocation: "ExitClientMethod",
//         State: curState,
//         Method: "action",
//         Result: {
//           Error: {
//             name: "Error",
//             message: "INVALID_ARGUMENT: Invalid action name."
//           }
//         }
//       });

//       expect(trace[2]).toEqual({
//         Phase: "DoneSync",
//         State: curState
//       });

//       expect(trace[3]).toEqual({
//         Phase: "DoneDefer",
//         State: curState
//       });

//       expect(trace[4]).toEqual({
//         Phase: "DoneTimers",
//         State: curState
//       });
//     });

//     it("actionArgs argument - invalid type", async () => {
//       harness.initClient({
//         transport: harness.mockTransport()
//       });

//       const trace = await harness.trace(() => {
//         harness.clientWrapper.action("ActionName", undefined, () => {});
//       });

//       expect(trace[0]).toEqual({
//         Phase: "Start",
//         State: jasmine.any(Object)
//       });

//       const curState = trace[0].State;

//       expect(trace[1]).toEqual({
//         Invocation: "ExitClientMethod",
//         State: curState,
//         Method: "action",
//         Result: {
//           Error: {
//             name: "Error",
//             message: "INVALID_ARGUMENT: Invalid action arguments object."
//           }
//         }
//       });

//       expect(trace[2]).toEqual({
//         Phase: "DoneSync",
//         State: curState
//       });

//       expect(trace[3]).toEqual({
//         Phase: "DoneDefer",
//         State: curState
//       });

//       expect(trace[4]).toEqual({
//         Phase: "DoneTimers",
//         State: curState
//       });
//     });

//     it("actionArgs argument - not JSON-expressible", async () => {
//       harness.initClient({
//         transport: harness.mockTransport()
//       });

//       const trace = await harness.trace(() => {
//         harness.clientWrapper.action(
//           "ActionName",
//           { Something: undefined },
//           () => {}
//         );
//       });

//       expect(trace[0]).toEqual({
//         Phase: "Start",
//         State: jasmine.any(Object)
//       });

//       const curState = trace[0].State;

//       expect(trace[1]).toEqual({
//         Invocation: "ExitClientMethod",
//         State: curState,
//         Method: "action",
//         Result: {
//           Error: {
//             name: "Error",
//             message:
//               "INVALID_ARGUMENT: Action arguments must be JSON-expressible."
//           }
//         }
//       });

//       expect(trace[2]).toEqual({
//         Phase: "DoneSync",
//         State: curState
//       });

//       expect(trace[3]).toEqual({
//         Phase: "DoneDefer",
//         State: curState
//       });

//       expect(trace[4]).toEqual({
//         Phase: "DoneTimers",
//         State: curState
//       });
//     });

//     it("callback argument - invalid type", async () => {
//       harness.initClient({
//         transport: harness.mockTransport()
//       });

//       const trace = await harness.trace(() => {
//         harness.clientWrapper.action(
//           "ActionName",
//           { Action: "Args" },
//           123 // Cannot be falsy, as tha would select promise usage
//         );
//       });

//       expect(trace[0]).toEqual({
//         Phase: "Start",
//         State: jasmine.any(Object)
//       });

//       const curState = trace[0].State;

//       expect(trace[1]).toEqual({
//         Invocation: "ExitClientMethod",
//         State: curState,
//         Method: "action",
//         Result: {
//           Error: {
//             name: "Error",
//             message: "INVALID_ARGUMENT: Invalid callback."
//           }
//         }
//       });

//       expect(trace[2]).toEqual({
//         Phase: "DoneSync",
//         State: curState
//       });

//       expect(trace[3]).toEqual({
//         Phase: "DoneDefer",
//         State: curState
//       });

//       expect(trace[4]).toEqual({
//         Phase: "DoneTimers",
//         State: curState
//       });
//     });
//   });

//   describe("valid application invocation", () => {
//     describe("client is disconnected", () => {
//       describe("invalid transport behavior", () => {
//         it("transport throws on initial state check", async () => {
//           const mockTransport = harness.mockTransport();
//           harness.initClient({
//             transport: mockTransport
//           });

//           mockTransport.stateImplementation = () => {
//             throw new Error("SOME_ERROR: ...");
//           };

//           const trace = await harness.trace(() => {
//             harness.clientWrapper.action(
//               "ActionName",
//               { Action: "Args" },
//               () => {} // Callback mode
//             );
//           });

//           expect(trace[0]).toEqual({
//             Phase: "Start",
//             State: jasmine.any(Object)
//           });

//           const curState = trace[0].State;

//           expect(trace[1]).toEqual({
//             Invocation: "ExitClientMethod",
//             State: curState,
//             Method: "action",
//             Result: {
//               Error: {
//                 name: "Error",
//                 message:
//                   "TRANSPORT_ERROR: Transport threw an error on call to state().",
//                 transportError: {
//                   name: "Error",
//                   message: "SOME_ERROR: ..."
//                 }
//               }
//             }
//           });

//           expect(trace[2]).toEqual({
//             Phase: "DoneSync",
//             State: curState
//           });

//           expect(trace[3]).toEqual({
//             Phase: "DoneDefer",
//             State: curState
//           });

//           expect(trace[4]).toEqual({
//             Phase: "DoneTimers",
//             State: curState
//           });
//         });

//         it("transport returns invalid value on initial state check", async () => {
//           const mockTransport = harness.mockTransport();
//           harness.initClient({
//             transport: mockTransport
//           });

//           mockTransport.stateImplementation = () => "bad_state";

//           const trace = await harness.trace(() => {
//             harness.clientWrapper.action(
//               "ActionName",
//               { Action: "Args" },
//               () => {} // Callback mode
//             );
//           });

//           expect(trace[0]).toEqual({
//             Phase: "Start",
//             State: jasmine.any(Object)
//           });

//           const curState = trace[0].State;

//           expect(trace[1]).toEqual({
//             Invocation: "ExitClientMethod",
//             State: curState,
//             Method: "action",
//             Result: {
//               Error: {
//                 name: "Error",
//                 message:
//                   "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
//               }
//             }
//           });

//           expect(trace[2]).toEqual({
//             Phase: "DoneSync",
//             State: curState
//           });

//           expect(trace[3]).toEqual({
//             Phase: "DoneDefer",
//             State: curState
//           });

//           expect(trace[4]).toEqual({
//             Phase: "DoneTimers",
//             State: curState
//           });
//         });

//         it("transport returns 'connecting' on initial state check", async () => {
//           const mockTransport = harness.mockTransport();
//           harness.initClient({
//             transport: mockTransport
//           });

//           mockTransport.stateImplementation = () => "connecting";

//           const trace = await harness.trace(() => {
//             harness.clientWrapper.action(
//               "ActionName",
//               { Action: "Args" },
//               () => {} // Callback mode
//             );
//           });

//           expect(trace[0]).toEqual({
//             Phase: "Start",
//             State: jasmine.any(Object)
//           });

//           const curState = trace[0].State;

//           expect(trace[1]).toEqual({
//             Invocation: "ExitClientMethod",
//             State: curState,
//             Method: "action",
//             Result: {
//               Error: {
//                 name: "Error",
//                 message:
//                   "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
//               }
//             }
//           });

//           expect(trace[2]).toEqual({
//             Phase: "DoneSync",
//             State: curState
//           });

//           expect(trace[3]).toEqual({
//             Phase: "DoneDefer",
//             State: curState
//           });

//           expect(trace[4]).toEqual({
//             Phase: "DoneTimers",
//             State: curState
//           });
//         });

//         it("transport returns 'connected' on initial state check", async () => {
//           const mockTransport = harness.mockTransport();
//           harness.initClient({
//             transport: mockTransport
//           });

//           mockTransport.stateImplementation = () => "connected";

//           const trace = await harness.trace(() => {
//             harness.clientWrapper.action(
//               "ActionName",
//               { Action: "Args" },
//               () => {} // Callback mode
//             );
//           });

//           expect(trace[0]).toEqual({
//             Phase: "Start",
//             State: jasmine.any(Object)
//           });

//           const curState = trace[0].State;

//           expect(trace[1]).toEqual({
//             Invocation: "ExitClientMethod",
//             State: curState,
//             Method: "action",
//             Result: {
//               Error: {
//                 name: "Error",
//                 message:
//                   "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
//               }
//             }
//           });

//           expect(trace[2]).toEqual({
//             Phase: "DoneSync",
//             State: curState
//           });

//           expect(trace[3]).toEqual({
//             Phase: "DoneDefer",
//             State: curState
//           });

//           expect(trace[4]).toEqual({
//             Phase: "DoneTimers",
//             State: curState
//           });
//         });
//       });

//       it("valid transport behavior", async () => {
//         harness.initClient({
//           transport: harness.mockTransport()
//         });

//         let actionNumber;
//         const trace = await harness.trace(() => {
//           actionNumber = harness.clientWrapper.action(
//             "ActionName",
//             { Action: "Args" },
//             () => {} // Callback mode
//           );
//         });

//         expect(trace[0]).toEqual({
//           Phase: "Start",
//           State: jasmine.any(Object)
//         });

//         const curState = trace[0].State;

//         expect(trace[1]).toEqual({
//           Invocation: "ExitClientMethod",
//           State: curState,
//           Method: "action",
//           Result: { ReturnValue: undefined }
//         });

//         expect(trace[2]).toEqual({
//           Phase: "DoneSync",
//           State: curState
//         });

//         expect(trace[3]).toEqual({
//           Invocation: "CallbackAction",
//           State: curState,
//           ActionNumber: actionNumber,
//           Args: [
//             {
//               name: "Error",
//               message: "NOT_CONNECTED: The client is not connected."
//             }
//           ],
//           Context: undefined
//         });

//         expect(trace[4]).toEqual({
//           Phase: "DoneDefer",
//           State: curState
//         });

//         expect(trace[5]).toEqual({
//           Phase: "DoneTimers",
//           State: curState
//         });
//       });
//     });

//     describe("client is connecting - transport connecting", () => {
//       describe("invalid transport behavior", () => {
//         it("transport throws on initial state check", () => {
//           // //
//         });

//         it("transport returns invalid value on initial state check", () => {
//           // //
//         });

//         it("transport returns 'disconnected' on initial state check", () => {
//           // //
//         });

//         it("transport returns 'connected' on initial state check", () => {
//           // //
//         });
//       });

//       it("valid transport behavior", async () => {
//         harness.initClient({
//           transport: harness.mockTransport(),
//           connectTimeoutMs: 0
//         });

//         await harness.makeClientConnectingBeforeHandshake();

//         let actionNumber;
//         const trace = await harness.trace(() => {
//           actionNumber = harness.clientWrapper.action(
//             "ActionName",
//             { Action: "Args" },
//             () => {} // Callback mode
//           );
//         });

//         expect(trace[0]).toEqual({
//           Phase: "Start",
//           State: jasmine.any(Object)
//         });

//         const curState = trace[0].State;

//         expect(trace[1]).toEqual({
//           Invocation: "ExitClientMethod",
//           State: curState,
//           Method: "action",
//           Result: { ReturnValue: undefined }
//         });

//         expect(trace[2]).toEqual({
//           Phase: "DoneSync",
//           State: curState
//         });

//         expect(trace[3]).toEqual({
//           Invocation: "CallbackAction",
//           State: curState,
//           ActionNumber: actionNumber,
//           Args: [
//             {
//               name: "Error",
//               message: "NOT_CONNECTED: The client is not connected."
//             }
//           ],
//           Context: undefined
//         });

//         expect(trace[4]).toEqual({
//           Phase: "DoneDefer",
//           State: curState
//         });

//         expect(trace[5]).toEqual({
//           Phase: "DoneTimers",
//           State: curState
//         });
//       });
//     });

//     describe("client is connecting - transport connected and handshake pending", () => {
//       describe("invalid transport behavior", () => {
//         it("transport throws on initial state check", () => {
//           // //
//         });

//         it("transport returns invalid value on initial state check", () => {
//           // //
//         });

//         it("transport returns 'disconnected' on initial state check", () => {
//           // //
//         });

//         it("transport returns 'connected' on initial state check", () => {
//           // //
//         });
//       });

//       it("valid transport behavior", async () => {
//         harness.initClient({
//           transport: harness.mockTransport(),
//           connectTimeoutMs: 0
//         });

//         await harness.makeClientConnectingAfterHandshake();

//         let actionNumber;
//         const trace = await harness.trace(() => {
//           actionNumber = harness.clientWrapper.action(
//             "ActionName",
//             { Action: "Args" },
//             () => {} // Callback mode
//           );
//         });

//         expect(trace[0]).toEqual({
//           Phase: "Start",
//           State: jasmine.any(Object)
//         });

//         const curState = trace[0].State;

//         expect(trace[1]).toEqual({
//           Invocation: "ExitClientMethod",
//           State: curState,
//           Method: "action",
//           Result: { ReturnValue: undefined }
//         });

//         expect(trace[2]).toEqual({
//           Phase: "DoneSync",
//           State: curState
//         });

//         expect(trace[3]).toEqual({
//           Invocation: "CallbackAction",
//           State: curState,
//           ActionNumber: actionNumber,
//           Args: [
//             {
//               name: "Error",
//               message: "NOT_CONNECTED: The client is not connected."
//             }
//           ],
//           Context: undefined
//         });

//         expect(trace[4]).toEqual({
//           Phase: "DoneDefer",
//           State: curState
//         });

//         expect(trace[5]).toEqual({
//           Phase: "DoneTimers",
//           State: curState
//         });
//       });
//     });

//     describe("client is connected", () => {
//       describe("invalid transport behavior", () => {
//         it("transport throws on pre-send state check", () => {
//           // //
//         });

//         it("transport returns invalid value on pre-send state check", () => {
//           // //
//         });

//         it("transport returns 'disconnected' on pre-send state check", () => {
//           // //
//         });

//         it("transport returns 'connecting' on pre-send state check", () => {
//           // //
//         });

//         it("transport throws on call to transport.send()", () => {
//           // //
//         });

//         it("transport throws on post-send state check", () => {
//           // //
//         });

//         it("transport returns invalid value on post-send state check", () => {
//           // //
//         });

//         it("transport returns 'connecting' on post-send state check", () => {
//           // //
//         });

//         it("transport emits disconnect synchronously", () => {});

//         it("transport emits connecting synchronously", () => {});

//         it("transport emits connect synchronously", () => {});

//         it("transport emits message synchronously", () => {});
//       });

//       describe("valid transport behavior", () => {
//         describe("post-send transport state is disconnected", () => {
//           it("options.actionTimeoutMs === 0", () => {
//             // //
//           });

//           it("options.actionTimeoutMs > 0", () => {
//             // //
//           });
//         });

//         describe("post-send transport state is connected", () => {
//           it("options.actionTimeoutMs === 0", async () => {
//             const mockTransport = harness.mockTransport();
//             harness.initClient({
//               transport: mockTransport,
//               actionTimeoutMs: 0
//             });

//             await harness.makeClientConnected();

//             const trace = await harness.trace(() => {
//               harness.clientWrapper.action(
//                 "ActionName",
//                 { Action: "Args" },
//                 () => {} // Callback mode
//               );
//             });

//             expect(trace[0]).toEqual({
//               Phase: "Start",
//               State: jasmine.any(Object)
//             });

//             const curState = trace[0].State;

//             expect(trace[1]).toEqual({
//               Invocation: "CallTransportMethod",
//               State: curState,
//               Method: "send",
//               Args: [
//                 JSON.stringify({
//                   MessageType: "Action",
//                   ActionName: "ActionName",
//                   ActionArgs: { Action: "Args" },
//                   CallbackId: "1"
//                 })
//               ],
//               Context: toBe(mockTransport)
//             });

//             expect(trace[2]).toEqual({
//               Invocation: "ExitClientMethod",
//               State: curState,
//               Method: "action",
//               Result: { ReturnValue: undefined }
//             });

//             expect(trace[3]).toEqual({
//               Phase: "DoneSync",
//               State: curState
//             });

//             expect(trace[4]).toEqual({
//               Phase: "DoneDefer",
//               State: curState
//             });

//             expect(trace[5]).toEqual({
//               Phase: "DoneTimers",
//               State: curState
//             });
//           });

//           it("options.actionTimeoutMs > 0", async () => {
//             const mockTransport = harness.mockTransport();
//             harness.initClient({
//               transport: mockTransport,
//               actionTimeoutMs: 1
//             });

//             await harness.makeClientConnected();

//             let actionNumber;
//             const trace = await harness.trace(() => {
//               actionNumber = harness.clientWrapper.action(
//                 "ActionName",
//                 { Action: "Args" },
//                 () => {} // Callback mode
//               );
//             });

//             expect(trace[0]).toEqual({
//               Phase: "Start",
//               State: jasmine.any(Object)
//             });

//             const curState = trace[0].State;

//             expect(trace[1]).toEqual({
//               Invocation: "CallTransportMethod",
//               State: curState,
//               Method: "send",
//               Args: [
//                 JSON.stringify({
//                   MessageType: "Action",
//                   ActionName: "ActionName",
//                   ActionArgs: { Action: "Args" },
//                   CallbackId: "1"
//                 })
//               ],
//               Context: toBe(mockTransport)
//             });

//             expect(trace[2]).toEqual({
//               Invocation: "ExitClientMethod",
//               State: curState,
//               Method: "action",
//               Result: { ReturnValue: undefined }
//             });

//             expect(trace[3]).toEqual({
//               Phase: "DoneSync",
//               State: curState
//             });

//             expect(trace[4]).toEqual({
//               Phase: "DoneDefer",
//               State: curState
//             });

//             expect(trace[5]).toEqual({
//               Invocation: "CallbackAction",
//               State: curState,
//               ActionNumber: actionNumber,
//               Args: [
//                 {
//                   name: "Error",
//                   message:
//                     "TIMEOUT: The server did not respond within the allocated time."
//                 }
//               ],
//               Context: undefined
//             });

//             expect(trace[6]).toEqual({
//               Phase: "DoneTimers",
//               State: curState
//             });
//           });
//         });
//       });
//     });
//   });
// });

// describe("The client.action() function - promise usage", () => {
//   describe("invalid application invocation", () => {
//     it("actionName argument - invalid type", async () => {
//       harness.initClient({
//         transport: harness.mockTransport()
//       });

//       const trace = await harness.trace(() => {
//         harness.clientWrapper.action(undefined, { Action: "Args" });
//       });

//       expect(trace[0]).toEqual({
//         Phase: "Start",
//         State: jasmine.any(Object)
//       });

//       const curState = trace[0].State;

//       expect(trace[1]).toEqual({
//         Invocation: "ExitClientMethod",
//         State: curState,
//         Method: "action",
//         Result: {
//           Error: {
//             name: "Error",
//             message: "INVALID_ARGUMENT: Invalid action name."
//           }
//         }
//       });

//       expect(trace[2]).toEqual({
//         Phase: "DoneSync",
//         State: curState
//       });

//       expect(trace[3]).toEqual({
//         Phase: "DoneDefer",
//         State: curState
//       });

//       expect(trace[4]).toEqual({
//         Phase: "DoneTimers",
//         State: curState
//       });
//     });

//     it("actionArgs argument - invalid type", async () => {
//       harness.initClient({
//         transport: harness.mockTransport()
//       });

//       const trace = await harness.trace(() => {
//         harness.clientWrapper.action("ActionName", undefined);
//       });

//       expect(trace[0]).toEqual({
//         Phase: "Start",
//         State: jasmine.any(Object)
//       });

//       const curState = trace[0].State;

//       expect(trace[1]).toEqual({
//         Invocation: "ExitClientMethod",
//         State: curState,
//         Method: "action",
//         Result: {
//           Error: {
//             name: "Error",
//             message: "INVALID_ARGUMENT: Invalid action arguments object."
//           }
//         }
//       });

//       expect(trace[2]).toEqual({
//         Phase: "DoneSync",
//         State: curState
//       });

//       expect(trace[3]).toEqual({
//         Phase: "DoneDefer",
//         State: curState
//       });

//       expect(trace[4]).toEqual({
//         Phase: "DoneTimers",
//         State: curState
//       });
//     });

//     it("actionArgs argument - not JSON-expressible", async () => {
//       harness.initClient({
//         transport: harness.mockTransport()
//       });

//       const trace = await harness.trace(() => {
//         harness.clientWrapper.action("ActionName", { Something: undefined });
//       });

//       expect(trace[0]).toEqual({
//         Phase: "Start",
//         State: jasmine.any(Object)
//       });

//       const curState = trace[0].State;

//       expect(trace[1]).toEqual({
//         Invocation: "ExitClientMethod",
//         State: curState,
//         Method: "action",
//         Result: {
//           Error: {
//             name: "Error",
//             message:
//               "INVALID_ARGUMENT: Action arguments must be JSON-expressible."
//           }
//         }
//       });

//       expect(trace[2]).toEqual({
//         Phase: "DoneSync",
//         State: curState
//       });

//       expect(trace[3]).toEqual({
//         Phase: "DoneDefer",
//         State: curState
//       });

//       expect(trace[4]).toEqual({
//         Phase: "DoneTimers",
//         State: curState
//       });
//     });
//   });

//   describe("valid application invocation", () => {
//     describe("client is disconnected", () => {
//       describe("invalid transport behavior", () => {
//         it("transport throws on initial state check", () => {
//           // //
//         });

//         it("transport returns invalid value on initial state check", () => {
//           // //
//         });

//         it("transport returns 'connecting' on initial state check", () => {
//           // //
//         });

//         it("transport returns 'connected' on initial state check", () => {
//           // //
//         });
//       });

//       it("valid transport behavior", async () => {
//         harness.initClient({
//           transport: harness.mockTransport()
//         });

//         let actionNumber;
//         const trace = await harness.trace(() => {
//           actionNumber = harness.clientWrapper.action("ActionName", {
//             Action: "Args"
//           });
//         });

//         expect(trace[0]).toEqual({
//           Phase: "Start",
//           State: jasmine.any(Object)
//         });

//         const curState = trace[0].State;

//         expect(trace[1]).toEqual({
//           Invocation: "ExitClientMethod",
//           State: curState,
//           Method: "action",
//           Result: { ReturnValue: jasmine.any(Promise) }
//         });

//         expect(trace[2]).toEqual({
//           Phase: "DoneSync",
//           State: curState
//         });

//         expect(trace[3]).toEqual({
//           Invocation: "RejectAction",
//           State: curState,
//           ActionNumber: actionNumber,
//           Error: {
//             name: "Error",
//             message: "NOT_CONNECTED: The client is not connected."
//           },
//           Context: undefined
//         });

//         expect(trace[4]).toEqual({
//           Phase: "DoneDefer",
//           State: curState
//         });

//         expect(trace[5]).toEqual({
//           Phase: "DoneTimers",
//           State: curState
//         });
//       });
//     });

//     describe("client is connecting - transport connecting", () => {
//       describe("invalid transport behavior", () => {
//         it("transport throws on initial state check", () => {
//           // //
//         });

//         it("transport returns invalid value on initial state check", () => {
//           // //
//         });

//         it("transport returns 'disconnected' on initial state check", () => {
//           // //
//         });

//         it("transport returns 'connected' on initial state check", () => {
//           // //
//         });
//       });

//       it("valid transport behavior", async () => {
//         harness.initClient({
//           transport: harness.mockTransport(),
//           connectTimeoutMs: 0
//         });

//         await harness.makeClientConnectingBeforeHandshake();

//         let actionNumber;
//         const trace = await harness.trace(() => {
//           actionNumber = harness.clientWrapper.action("ActionName", {
//             Action: "Args"
//           });
//         });

//         expect(trace[0]).toEqual({
//           Phase: "Start",
//           State: jasmine.any(Object)
//         });

//         const curState = trace[0].State;

//         expect(trace[1]).toEqual({
//           Invocation: "ExitClientMethod",
//           State: curState,
//           Method: "action",
//           Result: { ReturnValue: jasmine.any(Promise) }
//         });

//         expect(trace[2]).toEqual({
//           Phase: "DoneSync",
//           State: curState
//         });

//         expect(trace[3]).toEqual({
//           Invocation: "RejectAction",
//           State: curState,
//           ActionNumber: actionNumber,
//           Error: {
//             name: "Error",
//             message: "NOT_CONNECTED: The client is not connected."
//           },
//           Context: undefined
//         });

//         expect(trace[4]).toEqual({
//           Phase: "DoneDefer",
//           State: curState
//         });

//         expect(trace[5]).toEqual({
//           Phase: "DoneTimers",
//           State: curState
//         });
//       });
//     });

//     describe("client is connecting - transport connected and handshake pending", () => {
//       describe("invalid transport behavior", () => {
//         it("transport throws on initial state check", () => {
//           // //
//         });

//         it("transport returns invalid value on initial state check", () => {
//           // //
//         });

//         it("transport returns 'disconnected' on initial state check", () => {
//           // //
//         });

//         it("transport returns 'connected' on initial state check", () => {
//           // //
//         });
//       });

//       it("valid transport behavior", async () => {
//         harness.initClient({
//           transport: harness.mockTransport(),
//           connectTimeoutMs: 0
//         });

//         await harness.makeClientConnectingAfterHandshake();

//         let actionNumber;
//         const trace = await harness.trace(() => {
//           actionNumber = harness.clientWrapper.action("ActionName", {
//             Action: "Args"
//           });
//         });

//         expect(trace[0]).toEqual({
//           Phase: "Start",
//           State: jasmine.any(Object)
//         });

//         const curState = trace[0].State;

//         expect(trace[1]).toEqual({
//           Invocation: "ExitClientMethod",
//           State: curState,
//           Method: "action",
//           Result: { ReturnValue: jasmine.any(Promise) }
//         });

//         expect(trace[2]).toEqual({
//           Phase: "DoneSync",
//           State: curState
//         });

//         expect(trace[3]).toEqual({
//           Invocation: "RejectAction",
//           State: curState,
//           ActionNumber: actionNumber,
//           Error: {
//             name: "Error",
//             message: "NOT_CONNECTED: The client is not connected."
//           },
//           Context: undefined
//         });

//         expect(trace[4]).toEqual({
//           Phase: "DoneDefer",
//           State: curState
//         });

//         expect(trace[5]).toEqual({
//           Phase: "DoneTimers",
//           State: curState
//         });
//       });
//     });

//     describe("client is connected", () => {
//       describe("invalid transport behavior", () => {
//         it("transport throws on pre-send state check", () => {
//           // //
//         });

//         it("transport returns invalid value on pre-send state check", () => {
//           // //
//         });

//         it("transport returns 'disconnected' on pre-send state check", () => {
//           // //
//         });

//         it("transport returns 'connecting' on pre-send state check", () => {
//           // //
//         });

//         it("transport throws on call to transport.send()", () => {
//           // //
//         });

//         it("transport throws on post-send state check", () => {
//           // //
//         });

//         it("transport returns invalid value on post-send state check", () => {
//           // //
//         });

//         it("transport returns 'connecting' on post-send state check", () => {
//           // //
//         });

//         it("transport emits disconnect synchronously", () => {});

//         it("transport emits connecting synchronously", () => {});

//         it("transport emits connect synchronously", () => {});

//         it("transport emits message synchronously", () => {});
//       });

//       describe("valid transport behavior", () => {
//         describe("post-send transport state is disconnected", () => {
//           it("options.actionTimeoutMs === 0", () => {
//             // //
//           });

//           it("options.actionTimeoutMs > 0", () => {
//             // //
//           });
//         });

//         describe("post-send transport state is connected", () => {
//           it("options.actionTimeoutMs === 0", async () => {
//             const mockTransport = harness.mockTransport();
//             harness.initClient({
//               transport: mockTransport,
//               actionTimeoutMs: 0
//             });

//             await harness.makeClientConnected();

//             const trace = await harness.trace(() => {
//               harness.clientWrapper.action("ActionName", { Action: "Args" });
//             });

//             expect(trace[0]).toEqual({
//               Phase: "Start",
//               State: jasmine.any(Object)
//             });

//             const curState = trace[0].State;

//             expect(trace[1]).toEqual({
//               Invocation: "CallTransportMethod",
//               State: curState,
//               Method: "send",
//               Args: [
//                 JSON.stringify({
//                   MessageType: "Action",
//                   ActionName: "ActionName",
//                   ActionArgs: { Action: "Args" },
//                   CallbackId: "1"
//                 })
//               ],
//               Context: toBe(mockTransport)
//             });

//             expect(trace[2]).toEqual({
//               Invocation: "ExitClientMethod",
//               State: curState,
//               Method: "action",
//               Result: { ReturnValue: jasmine.any(Promise) }
//             });

//             expect(trace[3]).toEqual({
//               Phase: "DoneSync",
//               State: curState
//             });

//             expect(trace[4]).toEqual({
//               Phase: "DoneDefer",
//               State: curState
//             });

//             expect(trace[5]).toEqual({
//               Phase: "DoneTimers",
//               State: curState
//             });
//           });

//           it("options.actionTimeoutMs > 0", async () => {
//             const mockTransport = harness.mockTransport();
//             harness.initClient({
//               transport: mockTransport,
//               actionTimeoutMs: 1
//             });

//             await harness.makeClientConnected();

//             let actionNumber;
//             const trace = await harness.trace(() => {
//               actionNumber = harness.clientWrapper.action("ActionName", {
//                 Action: "Args"
//               });
//             });

//             expect(trace[0]).toEqual({
//               Phase: "Start",
//               State: jasmine.any(Object)
//             });

//             const curState = trace[0].State;

//             expect(trace[1]).toEqual({
//               Invocation: "CallTransportMethod",
//               State: curState,
//               Method: "send",
//               Args: [
//                 JSON.stringify({
//                   MessageType: "Action",
//                   ActionName: "ActionName",
//                   ActionArgs: { Action: "Args" },
//                   CallbackId: "1"
//                 })
//               ],
//               Context: toBe(mockTransport)
//             });

//             expect(trace[2]).toEqual({
//               Invocation: "ExitClientMethod",
//               State: curState,
//               Method: "action",
//               Result: { ReturnValue: jasmine.any(Promise) }
//             });

//             expect(trace[3]).toEqual({
//               Phase: "DoneSync",
//               State: curState
//             });

//             expect(trace[4]).toEqual({
//               Phase: "DoneDefer",
//               State: curState
//             });

//             expect(trace[5]).toEqual({
//               Invocation: "RejectAction",
//               State: curState,
//               ActionNumber: actionNumber,
//               Error: {
//                 name: "Error",
//                 message:
//                   "TIMEOUT: The server did not respond within the allocated time."
//               },
//               Context: undefined
//             });

//             expect(trace[6]).toEqual({
//               Phase: "DoneTimers",
//               State: curState
//             });
//           });
//         });
//       });
//     });
//   });
// });

// describe("The client.action() function - async/await usage", () => {
//   // Primarily tested in promise usage section
//   // Just confirm that async/await usage works

//   it("should work with action reject", async () => {
//     harness.initClient({
//       transport: harness.mockTransport()
//     });

//     let err;
//     try {
//       await harness.clientActual.action("ActionName", { Action: "Args" });
//     } catch (e) {
//       err = e;
//     }

//     expect(err).toEqual(jasmine.any(Error));
//     expect(err.message).toBe("NOT_CONNECTED: The client is not connected.");
//   });

//   it("should work with action resolve", async () => {
//     const mockTransport = harness.mockTransport();

//     harness.initClient({
//       transport: mockTransport
//     });

//     await harness.makeClientConnected();

//     mockTransport.sendImplementation = () => {
//       // Emit ActionResponse message asynchronously
//       process.nextTick(() => {
//         mockTransport.emit(
//           "message",
//           JSON.stringify({
//             MessageType: "ActionResponse",
//             CallbackId: "1",
//             Success: true,
//             ActionData: { Action: "Data" }
//           })
//         );
//       });
//     };

//     const actionData = await harness.clientActual.action("ActionName", {
//       Action: "Args"
//     });

//     expect(actionData).toEqual({
//       Action: "Data"
//     });
//   });
// });
