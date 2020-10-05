import emitter from "component-emitter";
import transportWrapper from "../transport.wrapper";

describe("The factory function", () => {
  it("should throw if the transport is not an object", () => {
    expect(() => {
      transportWrapper();
    }).toThrow(new Error("INVALID_ARGUMENT: Transport is not an object."));
  });

  it("should throw if the transport is not an event emitter", () => {
    expect(() => {
      transportWrapper({
        state: () => {},
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "INVALID_ARGUMENT: Transport does not implement the required API."
      )
    );
  });

  it("should throw if the transport contains no state() function", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "INVALID_ARGUMENT: Transport does not implement the required API."
      )
    );
  });

  it("should throw if the transport contains no connect() function", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        state: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "INVALID_ARGUMENT: Transport does not implement the required API."
      )
    );
  });

  it("should throw if the transport contains no send() function", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        state: () => {},
        connect: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "INVALID_ARGUMENT: Transport does not implement the required API."
      )
    );
  });

  it("should throw if the transport contains no disconnect() function", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        state: () => {},
        connect: () => {},
        send: () => {}
      });
    }).toThrow(
      new Error(
        "INVALID_ARGUMENT: Transport does not implement the required API."
      )
    );
  });

  it("should throw if transport.state() throws", () => {
    const tErr = new Error("SOME_ERROR: ...");
    let err;
    try {
      transportWrapper({
        on: () => {},
        state: () => {
          throw tErr;
        },
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("should throw if transport.state() is invalid", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        state: () => "bad_state",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );
  });

  it("should throw if transport.state() is connecting", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        state: () => "connecting",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'connecting' on call to state(). Must be 'disconnected' at initialization."
      )
    );
  });

  it("should throw if transport.state() is connected", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        state: () => "connected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'connected' on call to state(). Must be 'disconnected' at initialization."
      )
    );
  });

  it("should throw if transport.on() throws an error", () => {
    const tErr = new Error("SOME_ERROR: ...");

    let err;
    try {
      transportWrapper({
        on: () => {
          throw tErr;
        },
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to .on()."
    );
    expect(err.transportError).toBe(tErr);
  });
});

describe("the state() function", () => {
  it("if the transport throws an error, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    const tErr = new Error("SOME_ERROR: ...");
    transport.state = () => {
      throw tErr;
    };

    let err;
    try {
      wrapper.state();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
    expect(err.transportError).toBe(tErr);

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an error on call to state()."
    );
    expect(listener.mock.calls[0][0].transportError).toBe(tErr);
  });

  it("if the transport returns an invalid state, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    transport.state = () => "junk";
    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'junk' on call to state()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport returned invalid state 'junk' on call to state()."
    );
  });

  it("if the transport returns a valid state, it should emit nothing and return the state", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(wrapper.state()).toBe("disconnected");

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(0);
  });
});

describe("the connect() function", () => {
  it("if the state was initially invalid, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);

    transport.state = () => "bad_state";

    let err;
    try {
      wrapper.connect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  it("if the state was connecting then it should throw LIBRARY_ERROR", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    transport.state = () => "connecting";

    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error(
        "LIBRARY_ERROR: Tried to call transport.connect() when state was 'connecting'."
      )
    );
  });

  it("if the state was connected then it should throw LIBRARY_ERROR", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    transport.state = () => "connected";

    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error(
        "LIBRARY_ERROR: Tried to call transport.connect() when state was 'connected'."
      )
    );
  });

  it("if the state was disconnected and the transport threw an error, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const tErr = new Error("SOME_ERROR: ...");
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {
        throw tErr;
      },
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);

    let err;
    try {
      wrapper.connect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to connect() when state was 'disconnected'."
    );
    expect(err.transportError).toBe(tErr);

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an error on call to connect() when state was 'disconnected'."
    );
    expect(listener.mock.calls[0][0].transportError).toBe(tErr);
  });

  it("if the state was disconnected, the transport returned success, and post-op state was invalid, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {
        // Success
        transport.state = () => "bad_state";
      },
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  it("if the state was disconnected, the transport returned success, and post-op state was connecting, it should return successfully", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {
        // Success
        transport.state = () => "connecting";
      },
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);

    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(wrapper.connect()).toBeUndefined();

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(0);
  });

  it("if the state was disconnected, the transport returned success, and post-op state was connected, it should return successfully", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {
        // Success
        transport.state = () => "connected";
      },
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);

    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(wrapper.connect()).toBeUndefined();

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(0);
  });

  it("if the state was disconnected, the transport returned success, and post-op state was disconnected, it should return successfully", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {
        // Success
        transport.state = () => "disconnected";
      },
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);

    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(wrapper.connect()).toBeUndefined();

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(0);
  });
});

describe("the send() function", () => {
  it("if the state was initially invalid, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");
    const listener = jest.fn();
    wrapper.on("transportError", listener);

    transport.state = () => "bad_state";

    let err;
    try {
      wrapper.send("hi");
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  it("if the state was disconnected then it should throw LIBRARY_ERROR", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    transport.state = () => "disconnected";

    expect(() => {
      wrapper.send();
    }).toThrow(
      new Error(
        "LIBRARY_ERROR: Tried to call transport.send() when state was 'disconnected'."
      )
    );
  });

  it("if the state was connecting then it should throw LIBRARY_ERROR", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    transport.state = () => "connecting";

    expect(() => {
      wrapper.send();
    }).toThrow(
      new Error(
        "LIBRARY_ERROR: Tried to call transport.send() when state was 'connecting'."
      )
    );
  });

  it("if the state was connected and the transport threw an error, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const tErr = new Error("SOME_ERROR: ...");
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {
        throw tErr;
      },
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");
    const listener = jest.fn();
    wrapper.on("transportError", listener);

    let err;
    try {
      wrapper.send("hi");
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to send() when state was 'connected'."
    );
    expect(err.transportError).toBe(tErr);

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an error on call to send() when state was 'connected'."
    );
    expect(listener.mock.calls[0][0].transportError).toBe(tErr);
  });

  it("if the state was connected, the transport returned success, and post-op state was invalid, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {
        // Success
        transport.state = () => "bad_state";
      },
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(() => {
      wrapper.send("msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  it("if the state was connected, the transport returned success, and post-op state was connecting, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {
        // Success
        transport.state = () => "connecting";
      },
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(() => {
      wrapper.send("msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connecting' after a call to send()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport state was 'connecting' after a call to send()."
    );
  });

  it("if the state was connected, and the transport returned success, and post-op state was connected, it should return success", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(wrapper.send("hi")).toBeUndefined();

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(0);
  });

  it("if the state was connected, and the transport returned success, and post-op state was disconnected, it should return success", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {
        // Success
        transport.state = () => "disconnected";
      },
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(wrapper.send("hi")).toBeUndefined();

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(0);
  });
});

describe("the disconnect() function", () => {
  it("if the state was initially invalid, it should trow TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    const listener = jest.fn();
    wrapper.on("transportError", listener);

    transport.state = () => "bad_state";

    let err;
    try {
      wrapper.disconnect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  it("if the state was disconnected then it should throw LIBRARY_ERROR", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "LIBRARY_ERROR: Tried to call transport.disconnect() when state was 'disconnected'."
      )
    );
  });

  it("if the state was connecting and the transport threw an error, it should trow TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const tErr = new Error("SOME_ERROR: ...");
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        throw tErr;
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    const listener = jest.fn();
    wrapper.on("transportError", listener);

    let err;
    try {
      wrapper.disconnect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to disconnect() when state was 'connecting'."
    );
    expect(err.transportError).toBe(tErr);

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an error on call to disconnect() when state was 'connecting'."
    );
    expect(listener.mock.calls[0][0].transportError).toBe(tErr);
  });

  it("if the state was connecting, the transport returned success, and post-op state was invalid, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        // Success
        transport.state = () => "bad_state";
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  it("if the state was connecting, the transport returned success, and post-op state was connecting, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        // Success
        transport.state = () => "connecting";
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connecting' after a call to disconnect()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport state was 'connecting' after a call to disconnect()."
    );
  });

  it("if the state was connecting, the transport returned success, and post-op state was connected, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        // Success
        transport.state = () => "connected";
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connected' after a call to disconnect()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport state was 'connected' after a call to disconnect()."
    );
  });

  it("if the state was connecting, the transport returned success, and the post-op state was disconnected, it should return success", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        transport.state = () => "disconnected";
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(wrapper.disconnect()).toBeUndefined();

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(0);
  });

  it("if the state was connected and the transport threw an error, it should trow TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const tErr = new Error("SOME_ERROR: ...");
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        throw tErr;
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connected");
    const listener = jest.fn();
    wrapper.on("transportError", listener);

    let err;
    try {
      wrapper.disconnect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to disconnect() when state was 'connected'."
    );
    expect(err.transportError).toBe(tErr);

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an error on call to disconnect() when state was 'connected'."
    );
    expect(listener.mock.calls[0][0].transportError).toBe(tErr);
  });

  it("if the state was connected, the transport returned success, and post-op state was invalid, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        // Success
        transport.state = () => "bad_state";
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  it("if the state was connected, the transport returned success, and post-op state was connecting, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        // Success
        transport.state = () => "connecting";
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connecting' after a call to disconnect()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport state was 'connecting' after a call to disconnect()."
    );
  });

  it("if the state was connected, the transport returned success, and post-op state was connected, it should throw TRANSPORT_ERROR and asynchronously emit transportError", async () => {
    const transport = emitter({
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        // Success
        transport.state = () => "connected";
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connected' after a call to disconnect()."
      )
    );

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport state was 'connected' after a call to disconnect()."
    );
  });

  it("if the state was connected, the transport returned success, and the post-op state was disconnected, it should return success", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        transport.state = () => "disconnected";
      }
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const listener = jest.fn();
    wrapper.on("transportError", listener);

    expect(wrapper.disconnect(new Error("SOME_ERROR"))).toBeUndefined();

    await Promise.resolve(); // Execute queued microtasks

    expect(listener.mock.calls.length).toBe(0);
  });
});

describe("the transport 'connecting' event", () => {
  it("if the previous state emission was connecting, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    await Promise.resolve(); // Execute queued microtasks

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);
    transport.emit("connecting");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'connecting' event following a 'connecting' emission."
    );

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connect, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    await Promise.resolve(); // Execute queued microtasks

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);
    transport.emit("connecting");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'connecting' event following a 'connect' emission."
    );

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if there was no previous state emission and extraneous argument, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    await Promise.resolve(); // Execute queued microtasks

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting", "JUNK ARG");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Transport passed one or more extraneous arguments with a 'connecting' event."
    );

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if there was no previous state emission and no extraneous argument, it should asynchronously emit connecting", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(0);

    expect(connectingListener.mock.calls.length).toBe(1);
    expect(connectingListener.mock.calls[0].length).toBe(0);
  });

  it("if the previous state emission was disconnect and extraneous argument, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");
    transport.state = () => "disconnected";
    transport.emit("disconnect");

    await Promise.resolve(); // Execute queued microtasks

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting", "JUNK ARG");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Transport passed one or more extraneous arguments with a 'connecting' event."
    );

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was disconnect and no extraneous argument, it should asynchronously emit connecting", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");
    transport.state = () => "disconnected";
    transport.emit("disconnect");

    await Promise.resolve(); // Execute queued microtasks

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(0);

    expect(connectingListener.mock.calls.length).toBe(1);
    expect(connectingListener.mock.calls[0].length).toBe(0);
  });
});

describe("the transport 'connect' event", () => {
  it("if there was no previous state emission, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);
    transport.emit("connect");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'connect' event when the previous state emission was 'disconnect'."
    );
  });

  it("if the previous state emission was connect, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    await Promise.resolve(); // Execute queued microtasks

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);
    transport.emit("connect");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'connect' event when the previous state emission was 'connect'."
    );

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was disconnect, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "disconnected";
    transport.emit("disconnect");

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);
    transport.emit("connect");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'connect' event when the previous state emission was 'disconnect'."
    );

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connecting and extraneous argument, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);
    transport.emit("connect", "JUNK ARG");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Transport passed one or more extraneous arguments with a 'connect' event."
    );

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connecting and no extraneous argument, it should asynchronously emit connect", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);
    transport.emit("connect");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(0);

    expect(connectListener.mock.calls.length).toBe(1);
    expect(connectListener.mock.calls[0].length).toBe(0);
  });
});

describe("the transport 'message' event", () => {
  it("if there was no previous state emission, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const messageListener = jest.fn();
    wrapper.on("message", messageListener);
    transport.emit("message", "some message");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a 'message' event when the previous state emission was 'disconnect'."
    );

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connecting, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const messageListener = jest.fn();
    wrapper.on("message", messageListener);
    transport.emit("message", "some message");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a 'message' event when the previous state emission was 'connecting'."
    );

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was disconnect, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");
    transport.state = () => "disconnected";
    transport.emit("disconnect");

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const messageListener = jest.fn();
    wrapper.on("message", messageListener);
    transport.emit("message", "some message");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a 'message' event when the previous state emission was 'disconnect'."
    );

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connect and invalid number of arguments, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");
    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const messageListener = jest.fn();
    wrapper.on("message", messageListener);
    transport.emit("message"); // No args

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Received an invalid number of arguments with a 'message' event."
    );

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connect and non-string argument, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");
    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const messageListener = jest.fn();
    wrapper.on("message", messageListener);
    transport.emit("message", 123); // Bad arg type

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Received a non-string argument with a 'message' event."
    );

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connect and no extraneous argument, it should asynchronously emit message", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");
    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const messageListener = jest.fn();
    wrapper.on("message", messageListener);
    transport.emit("message", "a valid message");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(0);

    expect(messageListener.mock.calls.length).toBe(1);
    expect(messageListener.mock.calls[0].length).toBe(1);
    expect(messageListener.mock.calls[0][0]).toBe("a valid message");
  });
});

describe("the transport 'disconnect' event", () => {
  it("if there was no previous state emission, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);
    transport.emit("disconnect");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'disconnect' event when the previous state emission was 'disconnect'."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was disconnect, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");
    transport.state = () => "disconnected";
    transport.emit("disconnect");

    await Promise.resolve(); // Execute queued microtasks

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);
    transport.emit("disconnect");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'disconnect' event when the previous state emission was 'disconnect'."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was not disconnect and extraneous argument, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);
    transport.emit("disconnect", new Error(), new Error());

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Received one or more extraneous arguments with a 'disconnect' event."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connecting and argument present but not an error, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);
    transport.emit("disconnect", "not an error");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Received a non-Error argument with a 'disconnect' event."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connecting and no argument present, it should asynchronously emit disconnect", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(0);

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(0);
  });

  it("if the previous state emission was connecting and error argument present, it should asynchronously emit disconnect", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect", new Error("SOME_ERROR: ..."));

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(0);

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(1);
    expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(disconnectListener.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
  });

  it("if the previous state emission was connect and argument present but not an error, it should asynchronously emit transportError", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);
    transport.emit("disconnect", "not an error");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Received a non-Error argument with a 'disconnect' event."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous state emission was connect and no argument present, it should asynchronously emit disconnect", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect");

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(0);

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(0);
  });

  it("if the previous state emission was connect and error argument present, it should asynchronously emit disconnect", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");
    transport.state = () => "connected";
    transport.emit("connect");

    const transportErrorListener = jest.fn();
    wrapper.on("transportError", transportErrorListener);
    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect", new Error("SOME_ERROR: ..."));

    expect(transportErrorListener.mock.calls.length).toBe(0);
    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(transportErrorListener.mock.calls.length).toBe(0);

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(1);
    expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(disconnectListener.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
  });
});
