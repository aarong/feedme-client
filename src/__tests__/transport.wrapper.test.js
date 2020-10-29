import emitter from "component-emitter";
import transportWrapper from "../transport.wrapper";

const createWrapperListener = wrapper => {
  const listener = {};
  ["connecting", "connect", "message", "disconnect", "transportError"].forEach(
    evt => {
      listener[evt] = jest.fn();
      wrapper.on(evt, listener[evt]);
    }
  );
  return listener;
};

describe("The factory function", () => {
  it("should throw if the transport is not an object", () => {
    expect(() => {
      transportWrapper();
    }).toThrow(new Error("INVALID_ARGUMENT: Transport is not an object."));
  });

  it("should throw if the transport has no state() function", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        off: () => {},
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport does not implement state(), connect(), send(), or disconnect()."
      )
    );
  });

  it("should throw if the transport has no connect() function", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        off: () => {},
        state: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport does not implement state(), connect(), send(), or disconnect()."
      )
    );
  });

  it("should throw if the transport has no send() function", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        off: () => {},
        state: () => {},
        connect: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport does not implement state(), connect(), send(), or disconnect()."
      )
    );
  });

  it("should throw if the transport has no disconnect() function", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        off: () => {},
        state: () => {},
        connect: () => {},
        send: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport does not implement state(), connect(), send(), or disconnect()."
      )
    );
  });

  it("should throw if the transport does not implement on() or equivalent", () => {
    expect(() => {
      transportWrapper({
        state: () => {},
        connect: () => {},
        send: () => {},
        disconnect: () => {},
        off: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport does not implement on(), addListener(), or addEventListener()."
      )
    );
  });

  it("should throw if the transport does not implement off() or equivalent", () => {
    expect(() => {
      transportWrapper({
        state: () => {},
        connect: () => {},
        send: () => {},
        disconnect: () => {},
        on: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport does not implement off(), removeListener(), or removeEventListener()."
      )
    );
  });

  it("should throw if transport.state() throws", () => {
    const tErr = new Error("SOME_ERROR: ...");
    let err;
    try {
      transportWrapper({
        on: () => {},
        off: () => {},
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
        off: () => {},
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
        off: () => {},
        state: () => "connecting",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
      )
    );
  });

  it("should throw if transport.state() is connected", () => {
    expect(() => {
      transportWrapper({
        on: () => {},
        off: () => {},
        state: () => "connected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
      )
    );
  });

  it("should throw if transport.on() or equivalent throws", () => {
    const tErr = new Error("SOME_ERROR: ...");

    let err;
    try {
      transportWrapper({
        on: () => {
          throw tErr;
        },
        off: () => {},
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
      "TRANSPORT_ERROR: Transport threw an error when subscribing event listeners."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("should call on() if supplied", () => {
    const eventFn = jest.fn();
    transportWrapper({
      on: eventFn,
      off: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });

    expect(eventFn.mock.calls.length).toBe(4);
    for (let i = 0; i < 4; i += 1) {
      expect(eventFn.mock.calls[i].length).toBe(2);
    }
  });

  it("should call addListener() if supplied", () => {
    const eventFn = jest.fn();
    transportWrapper({
      addListener: eventFn,
      off: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });

    expect(eventFn.mock.calls.length).toBe(4);
    for (let i = 0; i < 4; i += 1) {
      expect(eventFn.mock.calls[i].length).toBe(2);
    }
  });

  it("should call addEventListener() if supplied", () => {
    const eventFn = jest.fn();
    transportWrapper({
      addEventListener: eventFn,
      off: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });

    expect(eventFn.mock.calls.length).toBe(4);
    for (let i = 0; i < 4; i += 1) {
      expect(eventFn.mock.calls[i].length).toBe(2);
    }
  });
});

describe("the state() function", () => {
  it("if the wrapper is destroyed, it should throw", () => {
    const wrapper = transportWrapper(
      emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      })
    );
    wrapper.destroy();

    expect(() => {
      wrapper.state();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("if the transport throws an error, it should throw TRANSPORT_ERROR", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
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
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
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
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    transport.state = () => "connecting";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
      )
    );
  });

  it("if the transport returns connected initially without a call to connect(), it should throw TRANSPORT_ERROR", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    transport.state = () => "connected";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
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
    transport.state = () => "disconnected";
    transport.emit("disconnect", new Error("TRANSPORT_FAILURE: ..."));

    transport.state = () => "connecting";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
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
    transport.state = () => "disconnected";
    transport.emit("disconnect", new Error("TRANSPORT_FAILURE: ..."));

    transport.state = () => "connected";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
      )
    );
  });

  it("if the transport unexpectedly synchronously changes state from disconnected to connecting, it should throw TRANSPORT_ERROR", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    // Transport state is disconnected on initialization
    // Synchronous state changes are not permitted

    expect(wrapper.state()).toBe("disconnected");

    transport.state = () => "connecting";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
      )
    );
  });

  it("if the transport unexpectedly synchronously changes state from disconnected to connected, it should throw TRANSPORT_ERROR", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    // Transport state is disconnected on initialization
    // Synchronous state changes are not permitted

    expect(wrapper.state()).toBe("disconnected");

    transport.state = () => "connected";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
      )
    );
  });

  it("if the transport unexpectedly synchronously changes state from connecting to disconnected, it should throw TRANSPORT_ERROR", async () => {
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

    // Transport state is connecting after call to connect()
    // Synchronous state changes are not permitted

    expect(wrapper.state()).toBe("connecting");

    transport.state = () => "disconnected";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'disconnected' on call to state() when 'connecting' was expected."
      )
    );
  });

  it("if the transport unexpectedly synchronously changes state from connecting to connected, it should throw TRANSPORT_ERROR", async () => {
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

    // Transport state is connecting after call to connect()
    // Synchronous state changes are not permitted

    expect(wrapper.state()).toBe("connecting");

    transport.state = () => "connected";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'connecting' was expected."
      )
    );
  });

  it("if the transport unexpectedly synchronously changes state from connected to disconnected, it should throw TRANSPORT_ERROR", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };
    wrapper.connect();

    // Transport state is connected after call to connect()
    // Synchronous state changes are not permitted

    expect(wrapper.state()).toBe("connected");

    transport.state = () => "disconnected";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'disconnected' on call to state() when 'connected' was expected."
      )
    );
  });

  it("if the transport unexpectedly synchronously changes state from connected to connecting, it should throw TRANSPORT_ERROR", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };
    wrapper.connect();

    // Transport state is connected after call to connect()
    // Synchronous state changes are not permitted

    expect(wrapper.state()).toBe("connected");

    transport.state = () => "connecting";

    expect(() => {
      wrapper.state();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'connected' was expected."
      )
    );
  });

  it("if the transport returns a valid disconnected state, it should return the state", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    expect(wrapper.state()).toBe("disconnected");
  });

  it("if the transport returns a valid connecting state, it should return the state", async () => {
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

    expect(wrapper.state()).toBe("connecting");
  });

  it("if the transport returns a valid connected state, it should return the state", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };
    wrapper.connect();

    expect(wrapper.state()).toBe("connected");
  });
});

describe("the connect() function", () => {
  it("if the wrapper is destroyed, it should throw", () => {
    const wrapper = transportWrapper(
      emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      })
    );
    wrapper.destroy();

    expect(() => {
      wrapper.connect();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("if the starting transport state check throws, it should throw TRANSPORT_ERROR", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const tErr = new Error("SOME_ERROR: ...");
    transport.state = () => {
      throw tErr;
    };

    let err;
    try {
      wrapper.connect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("if the starting transport returns invalid state, it should throw TRANSPORT_ERROR", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.state = () => "bad_state";

    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );
  });

  it("if the starting transport state is connecting, it should throw INVALID_STATE", () => {
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

    expect(() => {
      wrapper.connect();
    }).toThrow(new Error("INVALID_STATE: Not disconnected."));
  });

  it("if the starting transport state is connected, it should throw INVALID_STATE", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };
    wrapper.connect();

    expect(() => {
      wrapper.connect();
    }).toThrow(new Error("INVALID_STATE: Not disconnected."));
  });

  describe("if the starting transport state is disconnected", () => {
    it("if the transport threw an error it should throw TRANSPORT_ERROR", async () => {
      const tErr = new Error("SOME_ERROR: ...");
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          throw tErr;
        },
        send: () => {},
        disconnect: () => {}
      });
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

    it("if the transport returned success and then threw on post-op state check, it should throw TRANSPORT_ERROR", async () => {
      const tErr = new Error("SOME_ERROR: ...");
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          // Success
          transport.state = () => {
            throw tErr;
          };
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);

      transport.state = () => {
        throw tErr;
      };

      let err;
      try {
        wrapper.connect();
      } catch (e) {
        err = e;
      }

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe(
        "TRANSPORT_ERROR: Transport threw an error on call to state()."
      );
      expect(err.transportError).toBe(tErr);
    });

    it("if the transport returned success and post-op state was invalid, it should throw TRANSPORT_ERROR", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          // Success
          transport.state = () => "bad_state";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);

      expect(() => {
        wrapper.connect();
      }).toThrow(
        new Error(
          "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
        )
      );
    });

    describe("if the transport returned success and post-op state was disconnected", () => {
      it("it should return successfully and accept a deferred state of disconnected", async () => {
        const transport = emitter({
          state: () => "disconnected",
          connect: () => {
            // Success
            transport.state = () => "disconnected";
          },
          send: () => {},
          disconnect: () => {}
        });
        const wrapper = transportWrapper(transport);

        expect(wrapper.connect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("it should return successfully and reject a deferred state of connecting", async () => {
        const transport = emitter({
          state: () => "disconnected",
          connect: () => {
            // Success
            transport.state = () => "disconnected";
          },
          send: () => {},
          disconnect: () => {}
        });
        const wrapper = transportWrapper(transport);

        expect(wrapper.connect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
          )
        );
      });

      it("it should return successfully and reject a deferred state of connected", async () => {
        const transport = emitter({
          state: () => "disconnected",
          connect: () => {
            // Success
            transport.state = () => "disconnected";
          },
          send: () => {},
          disconnect: () => {}
        });
        const wrapper = transportWrapper(transport);

        expect(wrapper.connect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connected";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
          )
        );
      });
    });

    describe("if the transport returned success and post-op state was connecting", () => {
      it("it should return successfully and accept a deferred state of disconnected", async () => {
        const transport = emitter({
          state: () => "disconnected",
          connect: () => {
            // Success
            transport.state = () => "connecting";
          },
          send: () => {},
          disconnect: () => {}
        });
        const wrapper = transportWrapper(transport);

        expect(wrapper.connect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("it should return successfully and accept a deferred state of connecting", async () => {
        const transport = emitter({
          state: () => "disconnected",
          connect: () => {
            // Success
            transport.state = () => "connecting";
          },
          send: () => {},
          disconnect: () => {}
        });
        const wrapper = transportWrapper(transport);

        expect(wrapper.connect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connecting";

        expect(wrapper.state()).toBe("connecting");
      });

      it("it should return successfully and accept a deferred state of connected", async () => {
        const transport = emitter({
          state: () => "disconnected",
          connect: () => {
            // Success
            transport.state = () => "connecting";
          },
          send: () => {},
          disconnect: () => {}
        });
        const wrapper = transportWrapper(transport);

        expect(wrapper.connect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });

    describe("if the transport returned success and post-op state was connected", () => {
      it("it should return successfully and accept a deferred state of disconnected", async () => {
        const transport = emitter({
          state: () => "disconnected",
          connect: () => {
            // Success
            transport.state = () => "connected";
          },
          send: () => {},
          disconnect: () => {}
        });
        const wrapper = transportWrapper(transport);

        expect(wrapper.connect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("it should return successfully and reject a deferred state of connecting", async () => {
        const transport = emitter({
          state: () => "disconnected",
          connect: () => {
            // Success
            transport.state = () => "connected";
          },
          send: () => {},
          disconnect: () => {}
        });
        const wrapper = transportWrapper(transport);

        expect(wrapper.connect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
          )
        );
      });

      it("it should return successfully and accept a deferred state of connected", async () => {
        const transport = emitter({
          state: () => "disconnected",
          connect: () => {
            // Success
            transport.state = () => "connected";
          },
          send: () => {},
          disconnect: () => {}
        });
        const wrapper = transportWrapper(transport);

        expect(wrapper.connect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });
  });
});

describe("the send() function", () => {
  it("if the wrapper is destroyed, it should throw", () => {
    const wrapper = transportWrapper(
      emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      })
    );

    wrapper.destroy();

    expect(() => {
      wrapper.send("msg");
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("if the message was invalid, it should throw", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };

    expect(() => {
      wrapper.send(undefined);
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid message."));
  });

  it("if the starting transport state check throws, it should throw TRANSPORT_ERROR", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const tErr = new Error("SOME_ERROR: ...");
    transport.state = () => {
      throw tErr;
    };

    let err;
    try {
      wrapper.send("msg");
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("if the starting transport returns invalid state, it should throw TRANSPORT_ERROR", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.state = () => "bad_state";

    expect(() => {
      wrapper.send("msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );
  });

  it("if the starting transport state is disconnected, it should throw INVALID_STATE", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    expect(() => {
      wrapper.send("msg");
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  it("if the starting transport state is connecting, it should throw INVALID_STATE", () => {
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

    expect(() => {
      wrapper.send("msg");
    }).toThrow(new Error("INVALID_STATE: Not connected."));
  });

  describe("if the starting transport state is connected", () => {
    it("if the transport threw an error, it should throw TRANSPORT_ERROR", async () => {
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

    it("if the transport returned success and then threw on post-op state check, it should throw TRANSPORT_ERROR", async () => {
      const tErr = new Error("SOME_ERROR: ...");
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {
          // Success
          transport.state = () => {
            throw tErr;
          };
        },
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);

      transport.connect = () => {
        transport.state = () => "connected";
      };
      wrapper.connect();

      let err;
      try {
        wrapper.send("msg");
      } catch (e) {
        err = e;
      }

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe(
        "TRANSPORT_ERROR: Transport threw an error on call to state()."
      );
      expect(err.transportError).toBe(tErr);
    });

    it("if the transport returned success and post-op state was invalid, it should throw TRANSPORT_ERROR", async () => {
      const transport = emitter({
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

    describe("if the transport returned success and post-op state was disconnected", () => {
      it("it should return success and accept a deferred state of disconnected", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("it should return success and reject a deferred state of connecting", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
          )
        );
      });

      it("it should return success and reject a deferred state of connected", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connected";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
          )
        );
      });
    });

    it("if the transport returned success and post-op state was connecting, it should throw TRANSPORT_ERROR", async () => {
      const transport = emitter({
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
          "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
        )
      );
    });

    describe("if the transport returned success and post-op state was connected", () => {
      it("it should return success and accept a deferred state of disconnected", async () => {
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

        expect(wrapper.send("hi")).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("it should return success and reject a deferred state of connecting", async () => {
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

        expect(wrapper.send("hi")).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
          )
        );
      });

      it("it should return success and accept a deferred state of connected", async () => {
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

        expect(wrapper.send("hi")).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });
  });
});

describe("the disconnect() function", () => {
  it("if the wrapper is destroyed, it should throw", () => {
    const wrapper = transportWrapper(
      emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      })
    );

    wrapper.destroy();

    expect(() => {
      wrapper.disconnect();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("if there was an invalid error argument, it should throw", () => {
    const wrapper = transportWrapper(
      emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      })
    );

    expect(() => {
      wrapper.disconnect(undefined);
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid error object."));
  });

  it("if the starting transport state check throws, it should throw TRANSPORT_ERROR", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const tErr = new Error("SOME_ERROR: ...");
    transport.state = () => {
      throw tErr;
    };

    let err;
    try {
      wrapper.disconnect();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("if the starting transport returns invalid state, it should throw TRANSPORT_ERROR", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.state = () => "bad_state";

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );
  });

  it("if the starting transport state is disconnected, it should throw INVALID_STATE", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(new Error("INVALID_STATE: Already disconnected."));
  });

  describe("if the starting transport state is connecting", () => {
    it("if the transport threw an error, it should trow TRANSPORT_ERROR", async () => {
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

    it("if the transport returned success and then threw on post-op state check, it should throw TRANSPORT_ERROR", async () => {
      const tErr = new Error("SOME_ERROR: ...");
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {
          // Success
          transport.state = () => {
            throw tErr;
          };
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
        "TRANSPORT_ERROR: Transport threw an error on call to state()."
      );
      expect(err.transportError).toBe(tErr);
    });

    it("if the transport returned success and post-op state was invalid, it should throw TRANSPORT_ERROR", async () => {
      const transport = emitter({
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

    describe("if the transport returned success and the post-op state was disconnected", () => {
      it("it should return success and accept a deferred state of disconnected", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("it should return success and reject a deferred state of connecting", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
          )
        );
      });

      it("it should return success and reject a deferred state of connected", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connected";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
          )
        );
      });
    });

    it("if the transport returned success and post-op state was connecting, it should throw TRANSPORT_ERROR", async () => {
      const transport = emitter({
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
          "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
        )
      );
    });

    it("if the transport returned success and post-op state was connected, it should throw TRANSPORT_ERROR", async () => {
      const transport = emitter({
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
          "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
        )
      );
    });
  });

  describe("if the starting transport state is connected", () => {
    it("if the transport threw an error, it should trow TRANSPORT_ERROR", async () => {
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
      transport.emit("connect");

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

    it("if the transport returned success and then threw on post-op state check, it should throw TRANSPORT_ERROR", async () => {
      const tErr = new Error("SOME_ERROR: ...");
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {
          // Success
          transport.state = () => {
            throw tErr;
          };
        }
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();
      transport.state = () => "connecting";
      transport.emit("connecting");
      transport.state = () => "connected";
      transport.emit("connect");

      let err;
      try {
        wrapper.disconnect();
      } catch (e) {
        err = e;
      }

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe(
        "TRANSPORT_ERROR: Transport threw an error on call to state()."
      );
      expect(err.transportError).toBe(tErr);
    });

    it("if the transport returned success and post-op state was invalid, it should throw TRANSPORT_ERROR", async () => {
      const transport = emitter({
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

    describe("if the transport returned success and the post-op state was disconnected", () => {
      it("it should return success and accept a deferred state of disconnected", async () => {
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

      it("it should return success and reject a deferred state of connecting", async () => {
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

        expect(wrapper.disconnect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
          )
        );
      });

      it("it should return success and reject a deferred state of connected", async () => {
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

        expect(wrapper.disconnect()).toBeUndefined();

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connected";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
          )
        );
      });
    });

    it("if the transport returned success and post-op state was connecting, it should throw TRANSPORT_ERROR", async () => {
      const transport = emitter({
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
          "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
        )
      );
    });

    it("if the transport returned success and post-op state was connected, it should throw TRANSPORT_ERROR", async () => {
      const transport = emitter({
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
          "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
        )
      );
    });
  });
});

describe("the destroy() function", () => {
  it("should throw if already destroyed", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.destroy();
    expect(() => {
      wrapper.destroy();
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("if the starting transport state check throws, it should throw TRANSPORT_ERROR", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const tErr = new Error("SOME_ERROR: ...");
    transport.state = () => {
      throw tErr;
    };

    let err;
    try {
      wrapper.destroy();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
    expect(err.transportError).toBe(tErr);
  });

  it("if the starting transport returns invalid state, it should throw TRANSPORT_ERROR", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.state = () => "bad_state";

    expect(() => {
      wrapper.destroy();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );
  });

  it("if the starting transport is connecting, it should throw INVALID_STATE", () => {
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

    expect(() => {
      wrapper.destroy();
    }).toThrow(new Error("INVALID_STATE: Not disconnected."));
  });

  it("if the starting transport is connected, it should throw INVALID_STATE", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };
    wrapper.connect();

    expect(() => {
      wrapper.destroy();
    }).toThrow(new Error("INVALID_STATE: Not disconnected."));
  });

  describe("if the starting transport state is disconnected", () => {
    it("should call transport.off() if supplied", () => {
      const transport = {
        on: () => {},
        off: jest.fn(),
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      };
      const wrapper = transportWrapper(transport);

      wrapper.destroy();

      expect(transport.off.mock.calls.length).toBe(4);
      for (let i = 0; i < 4; i += 1) {
        expect(transport.off.mock.calls[i].length).toBe(2);
      }
    });

    it("should call transport.removeListener() if supplied", () => {
      const transport = {
        addListener: () => {},
        removeListener: jest.fn(),
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      };
      const wrapper = transportWrapper(transport);

      wrapper.destroy();

      expect(transport.removeListener.mock.calls.length).toBe(4);
      for (let i = 0; i < 4; i += 1) {
        expect(transport.removeListener.mock.calls[i].length).toBe(2);
      }
    });

    it("should call transport.removeEventListener() if supplied", () => {
      const transport = {
        addEventListener: () => {},
        removeEventListener: jest.fn(),
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      };
      const wrapper = transportWrapper(transport);

      wrapper.destroy();

      expect(transport.removeEventListener.mock.calls.length).toBe(4);
      for (let i = 0; i < 4; i += 1) {
        expect(transport.removeEventListener.mock.calls[i].length).toBe(2);
      }
    });

    it("should succeed if transport.off() or equivalent throws", () => {
      const transport = {
        addEventListener: () => {},
        off: () => {
          throw new Error("SOME_ERROR: ...");
        },
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      };
      const wrapper = transportWrapper(transport);

      expect(wrapper.destroy()).toBeUndefined();
    });

    it("should not call transport.disconnect() if state() returns disconnected", () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: jest.fn()
      });
      const wrapper = transportWrapper(transport);

      wrapper.destroy();

      expect(transport.disconnect.mock.calls.length).toBe(0);
    });

    it("should call transport.disconnect() if state() throws", () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: jest.fn()
      });
      const wrapper = transportWrapper(transport);

      // Throw on second call
      transport.state = () => {
        transport.state = () => {
          throw new Error("SOME_ERROR: ...");
        };
        return "disconnected";
      };
      wrapper.destroy();

      expect(transport.disconnect.mock.calls.length).toBe(1);
      expect(transport.disconnect.mock.calls[0].length).toBe(0);
    });

    it("should call transport.disconnect() if state() returns anything other than disconnected", () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: jest.fn()
      });
      const wrapper = transportWrapper(transport);

      // Pass first state check validating app/library behavior, then return invalid
      transport.state = () => {
        transport.state = () => "bad_state";
        return "disconnected";
      };

      wrapper.destroy();

      expect(transport.disconnect.mock.calls.length).toBe(1);
      expect(transport.disconnect.mock.calls[0].length).toBe(0);
    });

    it("should not emit disconnect or transportError if there was no last emission", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);

      const wrapperListener = createWrapperListener(wrapper);

      wrapper.destroy();

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);
    });

    it("should not emit disconnect or transportError if last emission was disconnect", async () => {
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

      transport.disconnect = () => {
        transport.state = () => "disconnected";
      };
      wrapper.disconnect();
      transport.emit("disconnect");

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      wrapper.destroy();

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);
    });

    it("should asynchronously emit disconnect but not transportError if last emission was connecting", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);

      wrapper.connect();
      transport.emit("connecting");

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      wrapper.destroy();

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
      expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
      expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
        "DESTROYED: The client instance has been destroyed."
      );
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);
    });

    it("should asynchronously emit disconnect but not transportError if last emission was connect", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);

      wrapper.connect();
      transport.emit("connecting");
      transport.emit("connect");

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      wrapper.destroy();

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
      expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
      expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
        "DESTROYED: The client instance has been destroyed."
      );
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);
    });

    it("should asynchronously emit disconnect but not transportError if last emission was message", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);

      wrapper.connect();
      transport.emit("connecting");
      transport.emit("connect");
      transport.emit("message", "msg");

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      wrapper.destroy();

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
      expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
      expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
        "DESTROYED: The client instance has been destroyed."
      );
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);
    });
  });
});

describe("the destroyed() function", () => {
  it("should return false before destroy() and true after", () => {
    const wrapper = transportWrapper(
      emitter({
        state: () => "disconnected",
        connect: () => {},
        send: () => {},
        disconnect: () => {}
      })
    );

    expect(wrapper.destroyed()).toBe(false);

    wrapper.destroy();

    expect(wrapper.destroyed()).toBe(true);
  });
});

describe("the transport 'connecting' event", () => {
  it("if the wrapper is destroyed, it should throw", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });

    transport.off = () => {
      // Prevent destroy from unsubscribing from events
    };

    const wrapper = transportWrapper(transport);

    wrapper.destroy();

    expect(() => {
      transport.emit("connecting");
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("if there was an extraneous argument, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connecting", "JUNK ARG");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connecting' event."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connecting' event."
    );
  });

  it("if the previous emission was connecting, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'connecting' emission."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'connecting' emission."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'connecting' emission."
    );
  });

  it("if the previous emission was connect, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'connect' emission."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'connect' emission."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'connect' emission."
    );
  });

  it("if the previous emission was message, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'message' emission."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'message' emission."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event following a 'message' emission."
    );
  });

  it("if the emission occurred synchronously witin transport.connect(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connecting";
      transport.emit("connecting");
    };

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to connect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to connect()."
    );
  });

  it("if the emission occurred synchronously witin transport.send(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {
        transport.state = () => "connecting";
      },
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };
    wrapper.connect();

    transport.send = () => {
      transport.emit("connecting");
    };

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.send("msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to send()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to send()."
    );
  });

  it("if the emission occurred synchronously witin transport.disconnect(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {
        transport.state = () => "connecting";
      },
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();

    transport.disconnect = () => {
      transport.state = () => "disconnected";
      transport.emit("connecting");
    };

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to disconnect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to disconnect()."
    );
  });

  it("if the library never called transport.connect(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event without a library call to connect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event without a library call to connect()."
    );
  });

  it("if the library called transport.connect() N-1 times and this is the Nth connecting emission, it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {
        transport.state = () => "connecting";
      },
      send: () => {},
      disconnect: () => {
        transport.state = () => "disconnected";
      }
    });
    const wrapper = transportWrapper(transport);

    wrapper.connect();
    wrapper.disconnect();
    wrapper.connect();
    wrapper.disconnect();

    transport.emit("connecting");
    transport.emit("disconnect");
    transport.emit("connecting");
    transport.emit("disconnect");

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connecting' event without a library call to connect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(2); // Two, not three
    expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
    expect(wrapperListener.connecting.mock.calls[1].length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(2);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls[1].length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event without a library call to connect()."
    );
  });

  it("if emission was valid but the transport throws on call to state(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {
        transport.state = () => "connecting";
      },
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();

    transport.state = () => {
      throw new Error("SOME_ERROR: ...");
    };

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an error on call to state().")
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
  });

  it("if emission was valid but the transport returns invalid value on call to state(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {
        transport.state = () => "connecting";
      },
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();

    transport.state = () => "bad_state";

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  describe("if emission was valid and transport returns 'disconnected' state", () => {
    it("should return success, asynchronously emit connecting, and accept a deferred state of disconnected", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          transport.state = () => "connecting";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();

      transport.state = () => "disconnected";

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connecting");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(1);
      expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "disconnected";

      expect(wrapper.state()).toBe("disconnected");
    });

    it("should return success, asynchronously emit connecting, and reject a deferred state of connecting", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          transport.state = () => "connecting";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();

      transport.state = () => "disconnected";

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connecting");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(1);
      expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connecting";

      expect(() => {
        wrapper.state();
      }).toThrow(
        new Error(
          "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
        )
      );
    });

    it("should return success, asynchronously emit connecting, and reject a deferred state of connected", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          transport.state = () => "connecting";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();

      transport.state = () => "disconnected";

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connecting");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(1);
      expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connected";

      expect(() => {
        wrapper.state();
      }).toThrow(
        new Error(
          "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
        )
      );
    });
  });

  describe("if emission was valid and transport returns 'connecting' state", () => {
    it("should return success, asynchronously emit connecting, and accept a deferred state of disconnected", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          transport.state = () => "connecting";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();

      transport.state = () => "connecting";

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connecting");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(1);
      expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "disconnected";

      expect(wrapper.state()).toBe("disconnected");
    });

    it("should return success, asynchronously emit connecting, and accept a deferred state of connecting", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          transport.state = () => "connecting";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();

      transport.state = () => "connecting";

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connecting");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(1);
      expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connecting";

      expect(wrapper.state()).toBe("connecting");
    });

    it("should return success, asynchronously emit connecting, and accept a deferred state of connected", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          transport.state = () => "connecting";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();

      transport.state = () => "connecting";

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connecting");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(1);
      expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connected";

      expect(wrapper.state()).toBe("connected");
    });
  });

  describe("if emission was valid and transport returns 'connected' state", () => {
    it("should return success, asynchronously emit connecting, and accept a deferred state of disconnected", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          transport.state = () => "connecting";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();

      transport.state = () => "connected";

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connecting");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(1);
      expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "disconnected";

      expect(wrapper.state()).toBe("disconnected");
    });

    it("should return success, asynchronously emit connecting, and reject a deferred state of connecting", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          transport.state = () => "connecting";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();

      transport.state = () => "connected";

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connecting");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(1);
      expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connecting";

      expect(() => {
        wrapper.state();
      }).toThrow(
        new Error(
          "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
        )
      );
    });

    it("should return success, asynchronously emit connecting, and accept a deferred state of connected", async () => {
      const transport = emitter({
        state: () => "disconnected",
        connect: () => {
          transport.state = () => "connecting";
        },
        send: () => {},
        disconnect: () => {}
      });
      const wrapper = transportWrapper(transport);
      wrapper.connect();

      transport.state = () => "connected";

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connecting");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(1);
      expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connected";

      expect(wrapper.state()).toBe("connected");
    });
  });
});

describe("the transport 'connect' event", () => {
  it("if the wrapper is destroyed, it should throw", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });

    transport.off = () => {
      // Prevent destroy from unsubscribing from events
    };

    const wrapper = transportWrapper(transport);

    wrapper.destroy();

    expect(() => {
      transport.emit("connect");
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("if there was an extraneous argument, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connect", "JUNK ARG");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connect' event."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connect' event."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport passed one or more extraneous arguments with a 'connect' event."
    );
  });

  it("if there was no previous emission, it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'disconnect'."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'disconnect'."
    );
  });

  it("if the previous emission was connect, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'connect'."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'connect'."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'connect'."
    );
  });

  it("if the previous emission was message, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'message'."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'message'."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'message'."
    );
  });

  it("if the previous emission was disconnect, it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };
    wrapper.connect();
    transport.emit("connecting");
    transport.emit("connect");

    transport.disconnect = () => {
      transport.state = () => "disconnected";
    };
    wrapper.disconnect();
    transport.emit("disconnect");

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'disconnect'."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event when the previous emission was 'disconnect'."
    );
  });

  it("if the emission occurred synchronously witin transport.connect(), it should throw", async () => {
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

    await Promise.resolve(); // No synchronous state changes

    transport.state = () => "disconnected";

    transport.connect = () => {
      transport.emit("connect");
    };

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to connect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to connect()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to connect()."
    );
  });

  it("if the emission occurred synchronously witin transport.send(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connected";
    transport.emit("connecting");

    transport.send = () => {
      transport.emit("connect");
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.send("msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to send()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to send()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to send()."
    );
  });

  it("if the emission occurred synchronously witin transport.disconnect(), it should throw", async () => {
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

    transport.disconnect = () => {
      transport.state = () => "connected";
      transport.emit("connect");
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to disconnect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to disconnect()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to disconnect()."
    );
  });

  it("if emission was valid but the transport throws on call to state(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {
        transport.state = () => "connecting";
      },
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.emit("connecting");

    transport.state = () => {
      throw new Error("SOME_ERROR: ...");
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an error on call to state().")
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe("TRANSPORT_ERROR: Transport threw an error on call to state().");
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
  });

  it("if emission was valid but the transport returns invalid state on call to state(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {
        transport.state = () => "connecting";
      },
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.emit("connecting");

    transport.state = () => "bad_state";

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  describe("if emission was valid and transport returns 'disconnected' state", () => {
    it("should return success, asynchronously emit connect, and accept a deferred state of disconnected", async () => {
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

      transport.state = () => "disconnected";

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connect");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(1);
      expect(wrapperListener.connect.mock.calls[0].length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "disconnected";

      expect(wrapper.state()).toBe("disconnected");
    });

    it("should return success, asynchronously emit connect, and reject a deferred state of connecting", async () => {
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

      transport.state = () => "disconnected";

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connect");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(1);
      expect(wrapperListener.connect.mock.calls[0].length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connecting";

      expect(() => {
        wrapper.state();
      }).toThrow(
        new Error(
          "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
        )
      );
    });

    it("should return success, asynchronously emit connect, and reject a deferred state of connected", async () => {
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

      transport.state = () => "disconnected";

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connect");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(1);
      expect(wrapperListener.connect.mock.calls[0].length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connected";

      expect(() => {
        wrapper.state();
      }).toThrow(
        new Error(
          "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
        )
      );
    });
  });

  describe("if emission was valid and transport returns 'connecting' state", () => {
    it("should return success, asynchronously emit connect, and accept a deferred state of disconnected", async () => {
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

      transport.state = () => "connecting";

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connect");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(1);
      expect(wrapperListener.connect.mock.calls[0].length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "disconnected";

      expect(wrapper.state()).toBe("disconnected");
    });

    it("should return success, asynchronously emit connect, and accept a deferred state of connecting", async () => {
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

      transport.state = () => "connecting";

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connect");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(1);
      expect(wrapperListener.connect.mock.calls[0].length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connecting";

      expect(wrapper.state()).toBe("connecting");
    });

    it("should return success, asynchronously emit connect, and accept a deferred state of connected", async () => {
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

      transport.state = () => "connecting";

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connect");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(1);
      expect(wrapperListener.connect.mock.calls[0].length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connected";

      expect(wrapper.state()).toBe("connected");
    });
  });

  describe("if emission was valid and transport returns 'connected' state", () => {
    it("should return success, asynchronously emit connect, and accept a deferred state of disconnected", async () => {
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

      transport.state = () => "connected";

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connect");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(1);
      expect(wrapperListener.connect.mock.calls[0].length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "disconnected";

      expect(wrapper.state()).toBe("disconnected");
    });

    it("should return success, asynchronously emit connect, and reject a deferred state of connecting", async () => {
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

      transport.state = () => "connected";

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connect");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(1);
      expect(wrapperListener.connect.mock.calls[0].length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connecting";

      expect(() => {
        wrapper.state();
      }).toThrow(
        new Error(
          "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
        )
      );
    });

    it("should return success, asynchronously emit connect, and accept a deferred state of connected", async () => {
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

      transport.state = () => "connected";

      await Promise.resolve(); // Execute queued microtasks

      const wrapperListener = createWrapperListener(wrapper);

      transport.emit("connect");

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(wrapperListener.connecting.mock.calls.length).toBe(0);
      expect(wrapperListener.connect.mock.calls.length).toBe(1);
      expect(wrapperListener.connect.mock.calls[0].length).toBe(0);
      expect(wrapperListener.message.mock.calls.length).toBe(0);
      expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
      expect(wrapperListener.transportError.mock.calls.length).toBe(0);

      transport.state = () => "connected";

      expect(wrapper.state()).toBe("connected");
    });
  });
});

describe("the transport 'message' event", () => {
  it("if the wrapper is destroyed, it should throw", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });

    transport.off = () => {
      // Prevent destroy from unsubscribing from events
    };

    const wrapper = transportWrapper(transport);

    wrapper.destroy();

    expect(() => {
      transport.emit("message", "msg");
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("if there were no arguments, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("message");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
    );
  });

  it("if there was an extraneous argument, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("message", "msg", "JUNK ARG");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
    );
  });

  it("if there was a non-string argument, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("message", 123); // Bad arg
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a non-string argument '123' with a 'message' event."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a non-string argument '123' with a 'message' event."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a non-string argument '123' with a 'message' event."
    );
  });

  it("if there was no previous emission, it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("message", "some message");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'disconnect'."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'disconnect'."
    );
  });

  it("if the previous emission was connecting, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("message", "some message");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'connecting'."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'connecting'."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'connecting'."
    );
  });

  it("if the previous emission was disconnect, it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };
    wrapper.connect();
    transport.emit("connecting");
    transport.emit("connect");

    transport.disconnect = () => {
      transport.state = () => "disconnected";
    };
    wrapper.disconnect();
    transport.emit("disconnect");

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("message", "some message");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'disconnect'."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event when the previous emission was 'disconnect'."
    );
  });

  it("if the emission occurred synchronously witin transport.connect(), it should throw", async () => {
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

    await Promise.resolve(); // No synchronous state changes

    transport.state = () => "disconnected";

    transport.connect = () => {
      transport.emit("message", "msg");
    };

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to connect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to connect()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to connect()."
    );
  });

  it("if the emission occurred synchronously witin transport.send(), it should throw", async () => {
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

    transport.send = () => {
      transport.emit("message", "msg");
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.send("msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to send()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to send()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to send()."
    );
  });

  it("if the emission occurred synchronously witin transport.disconnect(), it should throw", async () => {
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

    transport.disconnect = () => {
      transport.emit("message", "msg");
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to disconnect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to disconnect()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to disconnect()."
    );
  });

  it("if emission was valid but the transport throws on call to state(), it should throw", async () => {
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

    transport.state = () => {
      throw new Error("SOME_ERROR: ...");
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("message", "msg");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an error on call to state().")
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe("TRANSPORT_ERROR: Transport threw an error on call to state().");
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
  });

  it("if emission was valid but the transport returns invalid value on call to state(), it should throw", async () => {
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

    transport.state = () => "bad_state";

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("message", "msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  describe("if the previous emission was connect", () => {
    describe("if emission was valid and transport returns 'disconnected' state", () => {
      it("should return success, asynchronously emit message, and accept a deferred state of disconnected", async () => {
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

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("should return success, asynchronously emit message, and reject a deferred state of connecting", async () => {
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

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
          )
        );
      });

      it("should return success, asynchronously emit message, and reject a deferred state of connected", async () => {
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

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connected";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
          )
        );
      });
    });

    describe("if emission was valid and transport returns 'connecting' state", () => {
      it("should return success, asynchronously emit message, and accept a deferred state of disconnected", async () => {
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

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("should return success, asynchronously emit message, and accept a deferred state of connecting", async () => {
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

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connecting";

        expect(wrapper.state()).toBe("connecting");
      });

      it("should return success, asynchronously emit message, and accept a deferred state of connected", async () => {
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

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });

    describe("if emission was valid and transport returns 'connected' state", () => {
      it("should return success, asynchronously emit message, and accept a deferred state of disconnected", async () => {
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

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("should return success, asynchronously emit message, and reject a deferred state of connecting", async () => {
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

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
          )
        );
      });

      it("should return success, asynchronously emit message, and accept a deferred state of connected", async () => {
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

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });
  });

  describe("if the previous emission was message", () => {
    describe("if emission was valid and transport returns 'disconnected' state", () => {
      it("should return success, asynchronously emit message, and accept a deferred state of disconnected", async () => {
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
        transport.emit("message", "msg");

        await Promise.resolve(); // Execute queued microtasks

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("should return success, asynchronously emit message, and reject a deferred state of connecting", async () => {
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
        transport.emit("message", "msg");

        await Promise.resolve(); // Execute queued microtasks

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
          )
        );
      });

      it("should return success, asynchronously emit message, and reject a deferred state of connected", async () => {
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
        transport.emit("message", "msg");

        await Promise.resolve(); // Execute queued microtasks

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connected";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
          )
        );
      });
    });

    describe("if emission was valid and transport returns 'connecting' state", () => {
      it("should return success, asynchronously emit message, and accept a deferred state of disconnected", async () => {
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
        transport.emit("message", "msg");

        await Promise.resolve(); // Execute queued microtasks

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("should return success, asynchronously emit message, and accept a deferred state of connecting", async () => {
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
        transport.emit("message", "msg");

        await Promise.resolve(); // Execute queued microtasks

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connecting";

        expect(wrapper.state()).toBe("connecting");
      });

      it("should return success, asynchronously emit message, and accept a deferred state of connected", async () => {
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
        transport.emit("message", "msg");

        await Promise.resolve(); // Execute queued microtasks

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });

    describe("if emission was valid and transport returns 'connected' state", () => {
      it("should return success, asynchronously emit message, and accept a deferred state of disconnected", async () => {
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
        transport.emit("message", "msg");

        await Promise.resolve(); // Execute queued microtasks

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("should return success, asynchronously emit message, and reject a deferred state of connecting", async () => {
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
        transport.emit("message", "msg");

        await Promise.resolve(); // Execute queued microtasks

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connecting";

        expect(() => {
          wrapper.state();
        }).toThrow(
          new Error(
            "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
          )
        );
      });

      it("should return success, asynchronously emit message, and accept a deferred state of connected", async () => {
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
        transport.emit("message", "msg");

        await Promise.resolve(); // Execute queued microtasks

        const wrapperListener = createWrapperListener(wrapper);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(0);
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(wrapperListener.connecting.mock.calls.length).toBe(0);
        expect(wrapperListener.connect.mock.calls.length).toBe(0);
        expect(wrapperListener.message.mock.calls.length).toBe(1);
        expect(wrapperListener.message.mock.calls[0].length).toBe(1);
        expect(wrapperListener.message.mock.calls[0][0]).toBe("msg");
        expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
        expect(wrapperListener.transportError.mock.calls.length).toBe(0);

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });
  });
});

describe("the transport 'disconnect' event", () => {
  it("if the wrapper is destroyed, it should throw", () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });

    transport.off = () => {
      // Prevent destroy from unsubscribing from events
    };

    const wrapper = transportWrapper(transport);

    wrapper.destroy();

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(new Error("DESTROYED: The client instance has been destroyed."));
  });

  it("if there was an extraneous argument, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("disconnect", new Error(), "JUNK ARG");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted one or more extraneous arguments with a 'disconnect' event."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted one or more extraneous arguments with a 'disconnect' event."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted one or more extraneous arguments with a 'disconnect' event."
    );
  });

  it("if there was a non-Error argument, it should throw", async () => {
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

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("disconnect", undefined); // Bad arg
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a non-Error argument 'undefined' with a 'disconnect' event."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a non-Error argument 'undefined' with a 'disconnect' event."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a non-Error argument 'undefined' with a 'disconnect' event."
    );
  });

  it("if there was no previous emission, it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'disconnect' event when the previous emission was 'disconnect'."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event when the previous emission was 'disconnect'."
    );
  });

  it("if the previous emission was disconnect, it should throw", async () => {
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

    transport.disconnect = () => {
      transport.state = () => "disconnected";
    };
    wrapper.disconnect();
    transport.emit("disconnect");

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'disconnect' event when the previous emission was 'disconnect'."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event when the previous emission was 'disconnect'."
    );
  });

  it("if the emission occurred synchronously witin transport.connect(), it should throw", async () => {
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

    await Promise.resolve(); // No synchronous state changes

    transport.state = () => "disconnected";

    transport.connect = () => {
      transport.emit("disconnect");
    };

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.connect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to connect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to connect()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to connect()."
    );
  });

  it("if the emission occurred synchronously witin transport.send(), it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    });
    const wrapper = transportWrapper(transport);
    wrapper.connect();
    transport.state = () => "connected";
    transport.emit("connecting");
    transport.emit("connect");

    transport.send = () => {
      transport.state = () => "disconnected";
      transport.emit("disconnect");
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.send("msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to send()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to send()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to send()."
    );
  });

  it("if the emission occurred synchronously witin transport.disconnect(), it should throw", async () => {
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

    transport.disconnect = () => {
      transport.state = () => "disconnected";
      transport.emit("disconnect");
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      wrapper.disconnect();
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to disconnect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to disconnect()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to disconnect()."
    );
  });

  it("if there was no error argument and the library never called transport.disconnect(), it should throw", async () => {
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

    transport.disconnect = () => {
      transport.state = () => "disconnected";
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'disconnect' event with no error argument without a library call disconnect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event with no error argument without a library call disconnect()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event with no error argument without a library call disconnect()."
    );
  });

  it("if there was no error argument N times and library only called transport.disconnect() N-1 times, it should throw", async () => {
    const transport = emitter({
      state: () => "disconnected",
      connect: () => {
        transport.state = () => "connecting";
      },
      send: () => {},
      disconnect: () => {
        transport.state = () => "disconnected";
      }
    });
    const wrapper = transportWrapper(transport);

    wrapper.connect();
    wrapper.disconnect(new Error("ERROR_ONE: ..."));
    wrapper.connect();
    wrapper.disconnect(new Error("ERROR_TWO: ..."));
    wrapper.connect();

    transport.emit("connecting");
    transport.emit("disconnect");
    transport.emit("connecting");
    transport.emit("disconnect");
    transport.emit("connecting");

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a 'disconnect' event with no error argument without a library call disconnect()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(3);
    expect(wrapperListener.connecting.mock.calls[0].length).toBe(0);
    expect(wrapperListener.connecting.mock.calls[1].length).toBe(0);
    expect(wrapperListener.connecting.mock.calls[2].length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(3);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "ERROR_ONE: ..."
    );
    expect(wrapperListener.disconnect.mock.calls[1].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[1][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[1][0].message).toBe(
      "ERROR_TWO: ..."
    );
    expect(wrapperListener.disconnect.mock.calls[2].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[2][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[2][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[2][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[2][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event with no error argument without a library call disconnect()."
    );
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event with no error argument without a library call disconnect()."
    );
  });

  it("if emission was valid but the transport throws on call to state(), it should throw", async () => {
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

    transport.disconnect = () => {
      transport.state = () => "disconnected";
    };
    wrapper.disconnect();

    transport.state = () => {
      throw new Error("SOME_ERROR: ...");
    };

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an error on call to state().")
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe("TRANSPORT_ERROR: Transport threw an error on call to state().");
    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to state()."
    );
  });

  it("if emission was valid but the transport throws on call to state(), it should throw", async () => {
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

    transport.disconnect = () => {
      transport.state = () => "disconnected";
    };
    wrapper.disconnect();

    transport.state = () => "bad_state";

    await Promise.resolve(); // Execute queued microtasks

    const wrapperListener = createWrapperListener(wrapper);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
    expect(wrapperListener.transportError.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(wrapperListener.connecting.mock.calls.length).toBe(0);
    expect(wrapperListener.connect.mock.calls.length).toBe(0);
    expect(wrapperListener.message.mock.calls.length).toBe(0);
    expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
    expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
      "DESTROYED: The transport violated a library requirement."
    );
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError
    ).toBeInstanceOf(Error);
    expect(
      wrapperListener.disconnect.mock.calls[0][0].transportError.message
    ).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );

    expect(wrapperListener.transportError.mock.calls.length).toBe(1);
    expect(wrapperListener.transportError.mock.calls[0][0]).toBeInstanceOf(
      Error
    );
    expect(wrapperListener.transportError.mock.calls[0][0].message).toBe(
      "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
    );
  });

  describe("if there was an error argument originating from the transport", () => {
    describe("if the previous emission was connecting", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {
              transport.state = () => "disconnected";
            }
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
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

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
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

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
            )
          );
        });
      });

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connecting", async () => {
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

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(wrapper.state()).toBe("connecting");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });

      describe("if emission was valid and transport returns 'connected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
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

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });

    describe("if the previous emission was connect", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
            )
          );
        });
      });

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(wrapper.state()).toBe("connecting");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });

      describe("if emission was valid and transport returns 'connected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });

    describe("if the previous emission was message", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
            )
          );
        });
      });

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(wrapper.state()).toBe("connecting");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });

      describe("if emission was valid and transport returns 'connected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          await Promise.resolve(); // No synchronous state changes

          transport.state = () => "disconnected"; // Transport disconnects and event is queued

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "TRANSPORT_FAILURE: The transport connection failed."
          );
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError
          ).toBeInstanceOf(Error);
          expect(
            wrapperListener.disconnect.mock.calls[0][0].transportError.message
          ).toBe("SOME_ERROR: ...");
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });
  });

  describe("if there was an error argument originating from the library", () => {
    describe("if the previous emission was connecting", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {
              transport.state = () => "disconnected";
            }
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
            )
          );
        });
      });

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connecting", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(wrapper.state()).toBe("connecting");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });

      describe("if emission was valid and transport returns 'connected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });

    describe("if the previous emission was connect", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
            )
          );
        });
      });

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(wrapper.state()).toBe("connecting");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });

      describe("if emission was valid and transport returns 'connected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });

    describe("if the previous emission was message", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
            )
          );
        });
      });

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(wrapper.state()).toBe("connecting");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });

      describe("if emission was valid and transport returns 'connected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect(new Error("SOME_ERROR: ..."));

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0][0]).toBeInstanceOf(
            Error
          );
          expect(wrapperListener.disconnect.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });
  });

  describe("if there was no error argument", () => {
    describe("if the previous emission was connecting", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {
              transport.state = () => "disconnected";
            }
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
            )
          );
        });
      });

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connecting", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(wrapper.state()).toBe("connecting");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });

      describe("if emission was valid and transport returns 'connected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });

    describe("if the previous emission was connect", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
            )
          );
        });
      });

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(wrapper.state()).toBe("connecting");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });

      describe("if emission was valid and transport returns 'connected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });

    describe("if the previous emission was message", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
            )
          );
        });
      });

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(wrapper.state()).toBe("connecting");
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connecting";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });

      describe("if emission was valid and transport returns 'connected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "disconnected";

          expect(wrapper.state()).toBe("disconnected");
        });

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connecting", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connecting";

          expect(() => {
            wrapper.state();
          }).toThrow(
            new Error(
              "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' or 'connected' was expected."
            )
          );
        });

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
          const transport = emitter({
            state: () => "disconnected",
            connect: () => {},
            send: () => {},
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.disconnect = () => {
            transport.state = () => "disconnected";
          };
          wrapper.disconnect();

          transport.connect = () => {
            transport.state = () => "connected";
          };
          wrapper.connect();

          transport.emit("connecting");
          transport.emit("connect");
          transport.emit("message", "msg");

          await Promise.resolve(); // Execute queued microtasks

          const wrapperListener = createWrapperListener(wrapper);

          transport.emit("disconnect");

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(wrapperListener.connecting.mock.calls.length).toBe(0);
          expect(wrapperListener.connect.mock.calls.length).toBe(0);
          expect(wrapperListener.message.mock.calls.length).toBe(0);
          expect(wrapperListener.disconnect.mock.calls.length).toBe(1);
          expect(wrapperListener.disconnect.mock.calls[0].length).toBe(0);
          expect(wrapperListener.transportError.mock.calls.length).toBe(0);

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });
  });
});
