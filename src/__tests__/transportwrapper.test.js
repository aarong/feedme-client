import emitter from "component-emitter";
import transportWrapper from "../transportwrapper";

describe("The factory function", () => {
  it("should throw if the transport is not an object", () => {
    expect(() => {
      transportWrapper();
    }).toThrow(
      new Error("INVALID_ARGUMENT: The supplied transport is not an object.")
    );
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
        "INVALID_ARGUMENT: The supplied transport does not implement the required API."
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
        "INVALID_ARGUMENT: The supplied transport does not implement the required API."
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
        "INVALID_ARGUMENT: The supplied transport does not implement the required API."
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
        "INVALID_ARGUMENT: The supplied transport does not implement the required API."
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
        "INVALID_ARGUMENT: The supplied transport does not implement the required API."
      )
    );
  });

  it("should throw if the transport is not disconnected", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        state: () => "connecting",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error("INVALID_ARGUMENT: The supplied transport is not disconnected.")
    );
  });
});

describe("the state() function", () => {
  it(`if the transport throws an error,
  it should throw TRANSPORT_ERROR and emit transportError`, () => {
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
    transport.state = () => {
      throw new Error("JUNK_ERROR: ...");
    };
    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error("TRANSPORT_ERROR: The transport unexpectedly threw an error.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an error on call to state()."
    );
    expect(listener.mock.calls[0][0].transportError).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].transportError.message).toBe(
      "JUNK_ERROR: ..."
    );
  });

  it(`if the transport returns an invalid state given the emission sequence,
  it should throw TRANSPORT_ERROR and emit transportError`, () => {
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
    transport.state = () => "connecting";
    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error("TRANSPORT_ERROR: The transport returned an unexpected state.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport unexpectedly returned 'connecting' on a call to state() when previous emission was 'disconnect'."
    );
  });

  it(`if the transport returns a valid state given the emission sequence,
  it should emit nothing and return the state`, () => {
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
    expect(listener.mock.calls.length).toBe(0);
  });
});

describe("the connect() function", () => {
  it(`if the state was disconnected and the transport threw an error,
  it should throw a TRANSPORT_ERROR and emit transportError`, () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {
        throw new Error("JUNK_ERROR: ...");
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
      new Error("TRANSPORT_ERROR: Transport unexpectedly threw an error.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an error on a call to connect() when previous emission was 'disconnect'."
    );
    expect(listener.mock.calls[0][0].transportError).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].transportError.message).toBe(
      "JUNK_ERROR: ..."
    );
  });

  it(`if the state was disconnected and the transport returned success,
  it should relay success (expected)`, () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {
        // Success
      },
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(wrapper.connect()).toBeUndefined();
    expect(listener.mock.calls.length).toBe(0);
  });

  it(`if the state was not disconnected and the transport threw a NOT_DISCONNECTED error,
  it should relay that error (expected)`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    wrapper.connect();
    transport.emit("connecting");
    transport.connect = () => {
      throw new Error("NOT_DISCONNECTED: ...");
    };
    expect(() => {
      wrapper.connect();
    }).toThrow(new Error("NOT_DISCONNECTED: ..."));
    expect(listener.mock.calls.length).toBe(0);
  });

  it(`if the state was not disconnected and the transport threw any other error,
  it should throw a TRANSPORT_ERROR and emit transportError`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    wrapper.connect();
    transport.emit("connecting");
    transport.connect = () => {
      throw new Error("JUNK_ERROR: ...");
    };
    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an unexpected error.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an invalid error on a call to connect()."
    );
    expect(listener.mock.calls[0][0].transportError).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].transportError.message).toBe(
      "JUNK_ERROR: ..."
    );
  });

  it(`if the state was not disconnected and the transport returned success,
  it should trow a TRANSPORT_ERROR and emit transportError`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    wrapper.connect();
    transport.emit("connecting");
    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport accepted an invalid call.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport accepted an invalid call to connect()."
    );
  });
});

describe("the send() function", () => {
  it(`if the state was connected and the transport threw an error,
  it should throw a TRANSPORT_ERROR and emit transportError`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {
        throw new Error("JUNK_ERROR: ...");
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
      wrapper.send("hi");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport unexpectedly threw an error.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an error on a call to send() when previous emission was 'connect'."
    );
    expect(listener.mock.calls[0][0].transportError).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].transportError.message).toBe(
      "JUNK_ERROR: ..."
    );
  });

  it(`if the state was connected and the transport returned success,
  it should relay success (expected)`, () => {
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
    expect(listener.mock.calls.length).toBe(0);
  });

  it(`if the state was not connected and the transport threw a NOT_CONNECTED error,
  it should relay that error (expected)`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {
        throw new Error("NOT_CONNECTED: ...");
      },
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(() => {
      wrapper.send("hi");
    }).toThrow(new Error("NOT_CONNECTED: ..."));
    expect(listener.mock.calls.length).toBe(0);
  });

  it(`if the state was not connected and the transport threw any other error,
  it should throw a TRANSPORT_ERROR and emit transportError`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {
        throw new Error("JUNK_ERROR: ...");
      },
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(() => {
      wrapper.send("hi");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an unexpected error.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an invalid error on a call to send()."
    );
    expect(listener.mock.calls[0][0].transportError).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].transportError.message).toBe(
      "JUNK_ERROR: ..."
    );
  });

  it(`if the state was not connected and the transport returned success,
  it should throw a TRANSPORT_ERROR and emit transportError`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(() => {
      wrapper.send("hi");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport accepted an invalid call.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport accepted an invalid call to send()."
    );
  });
});

describe("the disconnect() function", () => {
  it(`if the state was disconnected and the transport threw a DISCONNECTED error,
  it should relay that error (expected)`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        throw new Error("DISCONNECTED: ...");
      }
    });
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(() => {
      wrapper.disconnect();
    }).toThrow(new Error("DISCONNECTED: ..."));
    expect(listener.mock.calls.length).toBe(0);
  });

  it(`if the state was disconnected and the transport threw any other error,
  it should trow a TRANSPORT_ERROR and emit transportError`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        throw new Error("JUNK_ERROR: ...");
      }
    });
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an unexpected error.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an invalid error on a call to disconnect()."
    );
    expect(listener.mock.calls[0][0].transportError).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].transportError.message).toBe(
      "JUNK_ERROR: ..."
    );
  });

  it(`if the state was disconnected and the transport returned success,
  it should trow a TRANSPORT_ERROR and emit transportError`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        // Success
      }
    });
    const wrapper = transportWrapper(transport);
    const listener = jest.fn();
    wrapper.on("transportError", listener);
    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport accepted an invalid call.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport accepted an invalid call to disconnect()."
    );
  });

  it(`if the state was not disconnected and the transport threw an error,
  it should trow a TRANSPORT_ERROR and emit transportError`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        throw new Error("DISCONNECTED: ...");
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
      new Error("TRANSPORT_ERROR: Transport unexpectedly threw an error.")
    );
    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].message).toBe(
      "INVALID_RESULT: Transport threw an error on a call to disconnect() when previous emission was 'connecting' or 'connect'."
    );
    expect(listener.mock.calls[0][0].transportError).toBeInstanceOf(Error);
    expect(listener.mock.calls[0][0].transportError.message).toBe(
      "DISCONNECTED: ..."
    );
  });

  it(`if the state was not disconnected and the transport returned success,
  it should relay that success (expected)`, () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {
        // Success
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
    expect(wrapper.disconnect()).toBeUndefined();
    expect(listener.mock.calls.length).toBe(0);
  });
});

describe("the transport 'connecting' event", () => {
  it(`if the state was not disconnected, it should emit transportError`, () => {
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
    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);
    transport.emit("connecting");

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'connecting' event following a 'connect' emission."
    );

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it(`if the state was disconnected and arguments were invalid, it should emit transportError`, () => {
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
    transport.emit("connecting", "JUNK ARG");

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Transport passed one or more extraneous arguments with the 'connecting' event."
    );

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it(`if the state was disconnected, it should emit the event`, () => {
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

    expect(connectingListener.mock.calls.length).toBe(1);
    expect(connectingListener.mock.calls[0].length).toBe(0);
  });
});

describe("the transport 'connect' event", () => {
  it(`if the state was not connecting, it should emit transportError`, () => {
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

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'connect' event following an emission other than 'connecting'."
    );

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it(`if the state was connecting and arguments were invalid, it should emit transportError`, () => {
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

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Transport passed one or more extraneous arguments with the 'connect' event."
    );

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it(`if the state was connecting, it should emit the event`, () => {
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

    expect(connectListener.mock.calls.length).toBe(1);
    expect(connectListener.mock.calls[0].length).toBe(0);
  });
});

describe("the transport 'message' event", () => {
  it(`if the state was not connected, it should emit transportError`, () => {
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

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a 'message' event when the previous emission was 'disconnect'."
    );

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it(`if the state was connected and arguments were invalid, it should emit transportError`, () => {
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

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Received an invalid number of arguments with a 'message' event."
    );

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it(`if the state was connected, it should emit the event`, () => {
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

    expect(messageListener.mock.calls.length).toBe(1);
    expect(messageListener.mock.calls[0].length).toBe(1);
    expect(messageListener.mock.calls[0][0]).toBe("a valid message");
  });
});

describe("the transport 'disconnect' event", () => {
  it(`if the state was disconnected, it should emit transportError`, () => {
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

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "UNEXPECTED_EVENT: Transport emitted a  'disconnect' event when the previous emission was 'disconnect'."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it(`if the state was not disconnected and arguments were invalid, it should emit transportError`, () => {
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

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Received one or more extraneous arguments with the 'disconnect' event."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it(`if the state was not disconnected and argument was not an error, it should emit transportError`, () => {
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

    expect(transportErrorListener.mock.calls.length).toBe(1);
    expect(transportErrorListener.mock.calls[0].length).toBe(1);
    expect(transportErrorListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(transportErrorListener.mock.calls[0][0].message).toBe(
      "BAD_EVENT_ARGUMENT: Received a non-Error argument with the 'disconnect' event."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it(`if the state was not disconnected, it should emit the event`, () => {
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

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(1);
    expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(disconnectListener.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
  });
});
