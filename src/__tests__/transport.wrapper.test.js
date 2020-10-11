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
        "TRANSPORT_ERROR: Transport does not implement the required API."
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
        "TRANSPORT_ERROR: Transport does not implement the required API."
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
        "TRANSPORT_ERROR: Transport does not implement the required API."
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
        "TRANSPORT_ERROR: Transport does not implement the required API."
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
        "TRANSPORT_ERROR: Transport does not implement the required API."
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
        "TRANSPORT_ERROR: Transport returned state 'connecting' without library call to connect()."
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
        "TRANSPORT_ERROR: Transport returned state 'connected' without library call to connect()."
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
  it("if the transport throws an error, it should throw TRANSPORT_ERROR", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);

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
  });

  it("if the transport returns an invalid state, it should throw TRANSPORT_ERROR", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);
    transport.state = () => "junk";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'junk' on call to state()."
      )
    );
  });

  it("if the transport returns connecting initially without a call to connect(), it should throw TRANSPORT_ERROR", async () => {
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
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connecting' without library call to connect()."
      )
    );
  });

  it("if the transport returns connected initially without a call to connect(), it should throw TRANSPORT_ERROR", async () => {
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
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connected' without library call to connect()."
      )
    );
  });

  it("if the transport returns connecting after disconnect without a call to connect(), it should throw TRANSPORT_ERROR", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connecting";
    };
    wrapper.connect();
    transport.emit("connecting");
    transport.emit("disconnect", new Error("FAILURE: ..."));

    transport.state = () => "connecting";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connecting' without library call to connect()."
      )
    );
  });

  it("if the transport returns connected after disconnect without a call to connect(), it should throw TRANSPORT_ERROR", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connecting";
    };
    wrapper.connect();
    transport.emit("connecting");
    transport.emit("disconnect", new Error("FAILURE: ..."));

    transport.state = () => "connected";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connected' without library call to connect()."
      )
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

    expect(wrapper.state()).toBe("disconnected");
  });
});

describe("the connect() function", () => {
  it("if the state was disconnected and the transport threw an error, it should throw TRANSPORT_ERROR", async () => {
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

    let err;
    try {
      wrapper.connect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to connect()."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("if the state was disconnected, the transport returned success, and post-op state was invalid, it should throw TRANSPORT_ERROR", async () => {
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

    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
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

    expect(wrapper.connect()).toBeUndefined();
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

    expect(wrapper.connect()).toBeUndefined();
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

    expect(wrapper.connect()).toBeUndefined();
  });
});

describe("the send() function", () => {
  it("if the state was connected and the transport threw an error, it should throw TRANSPORT_ERROR", async () => {
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

    let err;
    try {
      wrapper.send("hi");
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to send()."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("if the state was connected, the transport returned success, and post-op state was invalid, it should throw TRANSPORT_ERROR", async () => {
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

    expect(() => {
      wrapper.send("msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );
  });

  it("if the state was connected, the transport returned success, and post-op state was connecting, it should throw TRANSPORT_ERROR", async () => {
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

    expect(() => {
      wrapper.send("msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connecting' after a call to send()."
      )
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

    expect(wrapper.send("hi")).toBeUndefined();
  });
});

describe("the disconnect() function", () => {
  it("if the state was connecting and the transport threw an error, it should trow TRANSPORT_ERROR", async () => {
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

    let err;
    try {
      wrapper.disconnect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to disconnect()."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("if the state was connecting, the transport returned success, and post-op state was invalid, it should throw TRANSPORT_ERROR", async () => {
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

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );
  });

  it("if the state was connecting, the transport returned success, and post-op state was connecting, it should throw TRANSPORT_ERROR", async () => {
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

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connecting' after a call to disconnect()."
      )
    );
  });

  it("if the state was connecting, the transport returned success, and post-op state was connected, it should throw TRANSPORT_ERROR", async () => {
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

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connected' after a call to disconnect()."
      )
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

    expect(wrapper.disconnect()).toBeUndefined();
  });

  it("if the state was connected and the transport threw an error, it should trow TRANSPORT_ERROR", async () => {
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

    let err;
    try {
      wrapper.disconnect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to disconnect()."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("if the state was connected, the transport returned success, and post-op state was invalid, it should throw TRANSPORT_ERROR", async () => {
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

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );
  });

  it("if the state was connected, the transport returned success, and post-op state was connecting, it should throw TRANSPORT_ERROR", async () => {
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

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connecting' after a call to disconnect()."
      )
    );
  });

  it("if the state was connected, the transport returned success, and post-op state was connected, it should throw TRANSPORT_ERROR", async () => {
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

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport state was 'connected' after a call to disconnect()."
      )
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

    expect(wrapper.disconnect(new Error("SOME_ERROR"))).toBeUndefined();
  });
});

describe("the transport 'connecting' event", () => {
  it("if the library hasn't called connect() initially, it should throw an error", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event without a library call to connect()."
      )
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if the library hasn't called connect() after disconnect, it should throw an error", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connecting";
    };
    wrapper.connect();
    transport.emit("connecting");
    transport.emit("disconnect", new Error("FAILURE: ..."));

    await Promise.resolve(); // Execute queued microtasks

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event without a library call to connect()."
      )
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connecting, it should throw unhandled error", async () => {
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

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'connecting' emission."
      )
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connect, it should throw unhandled error", async () => {
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

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'connect' emission."
      )
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was message, it should throw unhandled error", async () => {
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
    transport.emit("message", "some message");

    await Promise.resolve(); // Execute queued microtasks

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'message' emission."
      )
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if there was no previous emission and extraneous argument, it should throw unhandled error", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    await Promise.resolve(); // Execute queued microtasks

    wrapper.connect();
    transport.state = () => "connecting";

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    expect(() => {
      transport.emit("connecting", "JUNK ARG");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connecting' event."
      )
    );
    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if there was no previous emission and no extraneous argument, it should asynchronously emit connecting", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(1);
    expect(connectingListener.mock.calls[0].length).toBe(0);
  });

  it("if the previous emission was disconnect and extraneous argument, it should throw unhandled error", async () => {
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

    wrapper.connect();
    transport.state = () => "connecting";

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    expect(() => {
      transport.emit("connecting", "JUNK ARG");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connecting' event."
      )
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was disconnect and no extraneous argument, it should asynchronously emit connecting", async () => {
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

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);
    wrapper.connect();
    transport.state = () => "connecting";
    transport.emit("connecting");

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(1);
    expect(connectingListener.mock.calls[0].length).toBe(0);
  });
});

describe("the transport 'connect' event", () => {
  it("if there was no previous emission, it should throw unhandled error", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'disconnect'."
      )
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connect, it should throw unhandled error", async () => {
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

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'connect'."
      )
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was message, it should throw unhandled error", async () => {
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
    transport.emit("message", "some message");

    await Promise.resolve(); // Execute queued microtasks

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'message'."
      )
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was disconnect, it should throw unhandled error", async () => {
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

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'disconnect'."
      )
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connecting and extraneous argument, it should throw unhandled error", async () => {
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

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

    expect(() => {
      transport.emit("connect", "JUNK ARG");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connect' event."
      )
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connecting and no extraneous argument, it should asynchronously emit connect", async () => {
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
    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);
    transport.emit("connect");

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(1);
    expect(connectListener.mock.calls[0].length).toBe(0);
  });
});

describe("the transport 'message' event", () => {
  it("if there was no previous emission, it should throw unhandled error", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);
    expect(() => {
      transport.emit("message", "some message");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'disconnect'."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connecting, it should throw unhandled error", async () => {
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message", "some message");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'connecting'."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was disconnect, it should throw unhandled error", async () => {
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message", "some message");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'disconnect'."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connect and invalid number of arguments, it should throw unhandled error", async () => {
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message"); // No args
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connect and non-string argument, it should throw unhandled error", async () => {
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message", 123); // Bad arg type
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a non-string argument '123' with a 'message' event."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connect and no extraneous argument, it should asynchronously emit message", async () => {
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
    const messageListener = jest.fn();
    wrapper.on("message", messageListener);
    transport.emit("message", "a valid message");

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(1);
    expect(messageListener.mock.calls[0].length).toBe(1);
    expect(messageListener.mock.calls[0][0]).toBe("a valid message");
  });

  it("if the previous emission was message and invalid number of arguments, it should throw unhandled error", async () => {
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
    transport.emit("message", "some message");

    await Promise.resolve(); // Execute queued microtasks

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message"); // No args
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was message and non-string argument, it should throw unhandled error", async () => {
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
    transport.emit("message", "some message");

    await Promise.resolve(); // Execute queued microtasks

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message", 123); // Bad arg type
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a non-string argument '123' with a 'message' event."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was message and no extraneous argument, it should asynchronously emit message", async () => {
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
    transport.emit("message", "some message");

    await Promise.resolve(); // Execute queued microtasks

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    transport.emit("message", "a valid message");

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(1);
    expect(messageListener.mock.calls[0].length).toBe(1);
    expect(messageListener.mock.calls[0][0]).toBe("a valid message");
  });
});

describe("the transport 'disconnect' event", () => {
  it("if there was no previous emission, it should throw unhandled error", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'disconnect' event when the previous emission was 'disconnect'."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was disconnect, it should throw unhandled error", async () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'disconnect' event when the previous emission was 'disconnect'."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connecting and extraneous argument, it should throw unhandled error", async () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect", new Error(), new Error());
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted one or more extraneous arguments with a 'disconnect' event."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connecting and argument present but not an error, it should throw unhandled error", async () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect", "not an error");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a non-Error argument 'not an error' with a 'disconnect' event."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connecting and no argument present, it should asynchronously emit disconnect", async () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect");

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(0);
  });

  it("if the previous emission was connecting and error argument present, it should asynchronously emit disconnect", async () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect", new Error("SOME_ERROR: ..."));

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(1);
    expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(disconnectListener.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
  });

  it("if the previous emission was connect and extraneous argument, it should throw unhandled error", async () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect", new Error(), new Error());
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted one or more extraneous arguments with a 'disconnect' event."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connect and argument present but not an error, it should throw unhandled error", async () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect", "not an error");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a non-Error argument 'not an error' with a 'disconnect' event."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was connect and no argument present, it should asynchronously emit disconnect", async () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect");

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(0);
  });

  it("if the previous emission was connect and error argument present, it should asynchronously emit disconnect", async () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect", new Error("SOME_ERROR: ..."));

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(1);
    expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(disconnectListener.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
  });

  it("if the previous emission was message and extraneous argument, it should throw unhandled error", async () => {
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
    transport.emit("message", "some message");

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect", new Error(), new Error());
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted one or more extraneous arguments with a 'disconnect' event."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was message and argument present but not an error, it should throw unhandled error", async () => {
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
    transport.emit("message", "some message");

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect", "not an error");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a non-Error argument 'not an error' with a 'disconnect' event."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if the previous emission was message and no argument present, it should asynchronously emit disconnect", async () => {
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
    transport.emit("message", "some message");

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect");

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(0);
  });

  it("if the previous emission was message and error argument present, it should asynchronously emit disconnect", async () => {
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
    transport.emit("message", "some message");

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    transport.emit("disconnect", new Error("SOME_ERROR: ..."));

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(1);
    expect(disconnectListener.mock.calls[0].length).toBe(1);
    expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(disconnectListener.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
  });
});
