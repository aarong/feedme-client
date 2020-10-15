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

  it("should throw if the transport has no state() function", () => {
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

  it("should throw if the transport has no connect() function", () => {
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

  it("should throw if the transport has no send() function", () => {
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

  it("should throw if the transport has no disconnect() function", () => {
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
        "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
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
        "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
      )
    );
  });

  it("should throw if transport.on() throws", () => {
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
      "TRANSPORT_ERROR: Transport threw an error on call to on()."
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
        "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
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
    transport.emit("disconnect", new Error("FAILURE: ..."));

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
    transport.emit("disconnect", new Error("FAILURE: ..."));

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

  it("if the transport returns a valid connecting state, it should return the state", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connecting";
    };
    wrapper.connect();

    expect(wrapper.state()).toBe("connecting");
  });

  it("if the transport returns a valid connected state, it should return the state", async () => {
    const transport = {
      on: () => {},
      state: () => "disconnected",
      connect: () => {},
      send: () => {},
      disconnect: () => {}
    };
    const wrapper = transportWrapper(transport);

    transport.connect = () => {
      transport.state = () => "connected";
    };
    wrapper.connect();

    expect(wrapper.state()).toBe("connected");
  });
});

describe("the connect() function", () => {
  describe("if the state was disconnected", () => {
    it("if the transport threw an error it should throw TRANSPORT_ERROR", async () => {
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

    it("if the transport returned success and then threw on post-op state check, it should throw TRANSPORT_ERROR", async () => {
      const tErr = new Error("SOME_ERROR: ...");
      const transport = {
        on: () => {},
        state: () => "disconnected",
        connect: () => {
          // Success
          transport.state = () => {
            throw tErr;
          };
        },
        send: () => {},
        disconnect: () => {}
      };
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

    describe("if the transport returned success and post-op state was disconnected", () => {
      it("it should return successfully and accept a deferred state of disconnected", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("it should return successfully and reject a deferred state of connecting", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("it should return successfully and accept a deferred state of connecting", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connecting";

        expect(wrapper.state()).toBe("connecting");
      });

      it("it should return successfully and accept a deferred state of connected", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });

    describe("if the transport returned success and post-op state was connected", () => {
      it("it should return successfully and accept a deferred state of disconnected", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "disconnected";

        expect(wrapper.state()).toBe("disconnected");
      });

      it("it should return successfully and reject a deferred state of connecting", async () => {
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

        await Promise.resolve(); // Execute queued microtasks

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });
  });
});

describe("the send() function", () => {
  describe("if the state was connected", () => {
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
      const transport = {
        on: () => {},
        state: () => "disconnected",
        connect: () => {},
        send: () => {
          // Success
          transport.state = () => {
            throw tErr;
          };
        },
        disconnect: () => {}
      };
      const wrapper = transportWrapper(transport);

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
  describe("if the state was connecting", () => {
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
        on: () => {},
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
          "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
        )
      );
    });

    it("if the transport returned success and post-op state was connected, it should throw TRANSPORT_ERROR", async () => {
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
          "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
        )
      );
    });
  });

  describe("if the state was connected", () => {
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

    it("if the transport returned success and then threw on post-op state check, it should throw TRANSPORT_ERROR", async () => {
      const tErr = new Error("SOME_ERROR: ...");
      const transport = emitter({
        on: () => {},
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
          "TRANSPORT_ERROR: Transport returned state 'connecting' on call to state() when 'disconnected' was expected."
        )
      );
    });

    it("if the transport returned success and post-op state was connected, it should throw TRANSPORT_ERROR", async () => {
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
          "TRANSPORT_ERROR: Transport returned state 'connected' on call to state() when 'disconnected' was expected."
        )
      );
    });
  });
});

describe("the transport 'connecting' event", () => {
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

  it("if the library hasn't called connect() initially, it should throw", async () => {
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

  it("if the library hasn't called connect() after disconnect, it should throw", async () => {
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

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

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
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to connect()."
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
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
    wrapper.connect();

    transport.send = () => {
      transport.emit("connecting");
    };

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    let err;
    try {
      wrapper.send("msg");
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to send()."
    );
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to send()."
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
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

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

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
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connecting' event synchronously within a call to disconnect()."
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
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

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an error on call to state().")
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
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

    const connectingListener = jest.fn();
    wrapper.on("connecting", connectingListener);

    expect(() => {
      transport.emit("connecting");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(connectingListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectingListener.mock.calls.length).toBe(0);
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

      const connectingListener = jest.fn();
      wrapper.on("connecting", connectingListener);

      transport.emit("connecting");

      expect(connectingListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectingListener.mock.calls.length).toBe(1);
      expect(connectingListener.mock.calls[0].length).toBe(0);

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

      const connectingListener = jest.fn();
      wrapper.on("connecting", connectingListener);

      transport.emit("connecting");

      expect(connectingListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectingListener.mock.calls.length).toBe(1);
      expect(connectingListener.mock.calls[0].length).toBe(0);

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

      const connectingListener = jest.fn();
      wrapper.on("connecting", connectingListener);

      transport.emit("connecting");

      expect(connectingListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectingListener.mock.calls.length).toBe(1);
      expect(connectingListener.mock.calls[0].length).toBe(0);

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

      const connectingListener = jest.fn();
      wrapper.on("connecting", connectingListener);

      transport.emit("connecting");

      expect(connectingListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectingListener.mock.calls.length).toBe(1);
      expect(connectingListener.mock.calls[0].length).toBe(0);

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

      const connectingListener = jest.fn();
      wrapper.on("connecting", connectingListener);

      transport.emit("connecting");

      expect(connectingListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectingListener.mock.calls.length).toBe(1);
      expect(connectingListener.mock.calls[0].length).toBe(0);

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

      const connectingListener = jest.fn();
      wrapper.on("connecting", connectingListener);

      transport.emit("connecting");

      expect(connectingListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectingListener.mock.calls.length).toBe(1);
      expect(connectingListener.mock.calls[0].length).toBe(0);

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

      const connectingListener = jest.fn();
      wrapper.on("connecting", connectingListener);

      transport.emit("connecting");

      expect(connectingListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectingListener.mock.calls.length).toBe(1);
      expect(connectingListener.mock.calls[0].length).toBe(0);

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

      const connectingListener = jest.fn();
      wrapper.on("connecting", connectingListener);

      transport.emit("connecting");

      expect(connectingListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectingListener.mock.calls.length).toBe(1);
      expect(connectingListener.mock.calls[0].length).toBe(0);

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

      const connectingListener = jest.fn();
      wrapper.on("connecting", connectingListener);

      transport.emit("connecting");

      expect(connectingListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectingListener.mock.calls.length).toBe(1);
      expect(connectingListener.mock.calls[0].length).toBe(0);

      transport.state = () => "connected";

      expect(wrapper.state()).toBe("connected");
    });
  });
});

describe("the transport 'connect' event", () => {
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

  it("if there was no previous emission, it should throw", async () => {
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

  it("if the previous emission was disconnect, it should throw", async () => {
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

    transport.connect = () => {
      transport.state = () => "connected";
      transport.emit("connect");
    };

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

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
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to connect()."
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
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

    transport.send = () => {
      transport.state = () => "connected";
      transport.emit("connect");
    };

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

    let err;
    try {
      wrapper.send("msg");
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to send()."
    );
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to send()."
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
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

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

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
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'connect' event synchronously within a call to disconnect()."
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
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

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an error on call to state().")
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
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

    const connectListener = jest.fn();
    wrapper.on("connect", connectListener);

    expect(() => {
      transport.emit("connect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(connectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(connectListener.mock.calls.length).toBe(0);
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

      const connectListener = jest.fn();
      wrapper.on("connect", connectListener);

      transport.emit("connect");

      expect(connectListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectListener.mock.calls.length).toBe(1);
      expect(connectListener.mock.calls[0].length).toBe(0);

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

      const connectListener = jest.fn();
      wrapper.on("connect", connectListener);

      transport.emit("connect");

      expect(connectListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectListener.mock.calls.length).toBe(1);
      expect(connectListener.mock.calls[0].length).toBe(0);

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

      const connectListener = jest.fn();
      wrapper.on("connect", connectListener);

      transport.emit("connect");

      expect(connectListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectListener.mock.calls.length).toBe(1);
      expect(connectListener.mock.calls[0].length).toBe(0);

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

      const connectListener = jest.fn();
      wrapper.on("connect", connectListener);

      transport.emit("connect");

      expect(connectListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectListener.mock.calls.length).toBe(1);
      expect(connectListener.mock.calls[0].length).toBe(0);

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

      const connectListener = jest.fn();
      wrapper.on("connect", connectListener);

      transport.emit("connect");

      expect(connectListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectListener.mock.calls.length).toBe(1);
      expect(connectListener.mock.calls[0].length).toBe(0);

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

      const connectListener = jest.fn();
      wrapper.on("connect", connectListener);

      transport.emit("connect");

      expect(connectListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectListener.mock.calls.length).toBe(1);
      expect(connectListener.mock.calls[0].length).toBe(0);

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

      const connectListener = jest.fn();
      wrapper.on("connect", connectListener);

      transport.emit("connect");

      expect(connectListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectListener.mock.calls.length).toBe(1);
      expect(connectListener.mock.calls[0].length).toBe(0);

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

      const connectListener = jest.fn();
      wrapper.on("connect", connectListener);

      transport.emit("connect");

      expect(connectListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectListener.mock.calls.length).toBe(1);
      expect(connectListener.mock.calls[0].length).toBe(0);

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

      const connectListener = jest.fn();
      wrapper.on("connect", connectListener);

      transport.emit("connect");

      expect(connectListener.mock.calls.length).toBe(0);

      await Promise.resolve(); // Execute queued microtasks

      expect(connectListener.mock.calls.length).toBe(1);
      expect(connectListener.mock.calls[0].length).toBe(0);

      transport.state = () => "connected";

      expect(wrapper.state()).toBe("connected");
    });
  });
});

describe("the transport 'message' event", () => {
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message", "msg", "JUNK ARG");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted an invalid number of arguments with a 'message' event."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message", 123); // Bad arg
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a non-string argument '123' with a 'message' event."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
  });

  it("if there was no previous emission, it should throw", async () => {
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

  it("if the previous emission was disconnect, it should throw", async () => {
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

    transport.connect = () => {
      transport.emit("message", "msg");
    };

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

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
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to connect()."
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    let err;
    try {
      wrapper.send();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to send()."
    );
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to send()."
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

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
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'message' event synchronously within a call to disconnect()."
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message", "msg");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an error on call to state().")
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
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

    const messageListener = jest.fn();
    wrapper.on("message", messageListener);

    expect(() => {
      transport.emit("message", "msg");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(messageListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(messageListener.mock.calls.length).toBe(0);
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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "disconnected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connecting";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

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

        const messageListener = jest.fn();
        wrapper.on("message", messageListener);

        transport.state = () => "connected";

        transport.emit("message", "msg");

        expect(messageListener.mock.calls.length).toBe(0);

        await Promise.resolve(); // Execute queued microtasks

        expect(messageListener.mock.calls.length).toBe(1);
        expect(messageListener.mock.calls[0].length).toBe(1);
        expect(messageListener.mock.calls[0][0]).toBe("msg");

        transport.state = () => "connected";

        expect(wrapper.state()).toBe("connected");
      });
    });
  });
});

describe("the transport 'disconnect' event", () => {
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect", new Error(), "JUNK ARG");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted one or more extraneous arguments with a 'disconnect' event."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect", undefined); // Bad arg
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport emitted a non-Error argument 'undefined' with a 'disconnect' event."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  it("if there was no previous emission, it should throw", async () => {
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

  it("if the previous emission was disconnect, it should throw", async () => {
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

    transport.connect = () => {
      transport.state = () => "disconnected";
      transport.emit("disconnect");
    };

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

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
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to connect()."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
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

    transport.send = () => {
      transport.state = () => "disconnected";
      transport.emit("disconnect");
    };

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    let err;
    try {
      wrapper.send();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "TRANSPORT_ERROR: Transport threw an error on call to send()."
    );
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to send()."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
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

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

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
    expect(err.transportError).toBeInstanceOf(Error);
    expect(err.transportError.message).toBe(
      "TRANSPORT_ERROR: Transport emitted a 'disconnect' event synchronously within a call to disconnect()."
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
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

    transport.state = () => {
      throw new Error("SOME_ERROR: ...");
    };

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error("TRANSPORT_ERROR: Transport threw an error on call to state().")
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
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

    transport.state = () => "bad_state";

    const disconnectListener = jest.fn();
    wrapper.on("disconnect", disconnectListener);

    expect(() => {
      transport.emit("disconnect");
    }).toThrow(
      new Error(
        "TRANSPORT_ERROR: Transport returned invalid state 'bad_state' on call to state()."
      )
    );

    expect(disconnectListener.mock.calls.length).toBe(0);

    await Promise.resolve(); // Execute queued microtasks

    expect(disconnectListener.mock.calls.length).toBe(0);
  });

  describe("if there was an error argument", () => {
    describe("if the previous emission was connecting", () => {
      describe("if emission was valid and transport returns 'disconnected' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          transport.state = () => "disconnected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

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

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
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

          transport.state = () => "disconnected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

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

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          transport.state = () => "connecting";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

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

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          transport.state = () => "connected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

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

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
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

          transport.state = () => "disconnected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

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

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          transport.state = () => "connecting";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

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

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          transport.state = () => "connected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

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

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
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

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

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

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

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

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect", new Error("SOME_ERROR: ..."));

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(1);
          expect(disconnectListener.mock.calls[0][0]).toBeInstanceOf(Error);
          expect(disconnectListener.mock.calls[0][0].message).toBe(
            "SOME_ERROR: ..."
          );

          await Promise.resolve(); // Execute queued microtasks

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
            disconnect: () => {}
          });
          const wrapper = transportWrapper(transport);
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

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

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
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

          transport.state = () => "disconnected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

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

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          transport.state = () => "connecting";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

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

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          transport.state = () => "connected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

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

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
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

          transport.state = () => "disconnected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

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

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          transport.state = () => "connecting";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

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

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          transport.state = () => "connected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

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

        it("should return success, asynchronously emit disconnect, and reject a deferred state of connected", async () => {
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

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "disconnected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

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

      describe("if emission was valid and transport returns 'connecting' state", () => {
        it("should return success, asynchronously emit disconnect, and accept a deferred state of disconnected", async () => {
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

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connecting";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

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
          wrapper.connect();
          transport.state = () => "connecting";
          transport.emit("connecting");
          transport.state = () => "connected";
          transport.emit("connect");
          transport.emit("message", "msg");

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

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

        it("should return success, asynchronously emit disconnect, and accept a deferred state of connected", async () => {
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

          const disconnectListener = jest.fn();
          wrapper.on("disconnect", disconnectListener);

          transport.state = () => "connected";

          transport.emit("disconnect");

          expect(disconnectListener.mock.calls.length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          expect(disconnectListener.mock.calls.length).toBe(1);
          expect(disconnectListener.mock.calls[0].length).toBe(0);

          await Promise.resolve(); // Execute queued microtasks

          transport.state = () => "connected";

          expect(wrapper.state()).toBe("connected");
        });
      });
    });
  });
});
