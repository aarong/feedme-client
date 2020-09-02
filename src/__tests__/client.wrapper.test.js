import check from "check-types";
import emitter from "component-emitter";
import clientWrapper from "../client.wrapper";

// Client wrapper methods

describe("The clientWrapper() factory function", () => {
  it("should throw on invalid clientSync argument", () => {
    expect(() => {
      clientWrapper("junk");
    }).toThrow(new Error("INVALID_ARGUMENT: Argument must be an object."));
  });

  it("should return an object on success", () => {
    expect(check.object(clientWrapper(emitter({})))).toBe(true);
  });
});

describe("The clientWrapper.state() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        state: mockFn
      })
    );
    wrapper.state("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        state: () => {
          throw err;
        }
      })
    );
    expect(() => {
      wrapper.state();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        state: () => "some_value"
      })
    );
    expect(wrapper.state()).toBe("some_value");
  });
});

describe("The clientWrapper.connect() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        connect: mockFn
      })
    );
    wrapper.connect("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        connect: () => {
          throw err;
        }
      })
    );
    expect(() => {
      wrapper.connect();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        connect: () => "some_value"
      })
    );
    expect(wrapper.connect()).toBe("some_value");
  });
});

describe("The clientWrapper.disconnect() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        disconnect: mockFn
      })
    );
    wrapper.disconnect("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        disconnect: () => {
          throw err;
        }
      })
    );
    expect(() => {
      wrapper.disconnect();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        disconnect: () => "some_value"
      })
    );
    expect(wrapper.disconnect()).toBe("some_value");
  });
});

describe("The clientWrapper.id() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        id: mockFn
      })
    );
    wrapper.id("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        id: () => {
          throw err;
        }
      })
    );
    expect(() => {
      wrapper.id();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        id: () => "some_value"
      })
    );
    expect(wrapper.id()).toBe("some_value");
  });
});

describe("The clientWrapper.action() function", () => {
  describe("callback style", () => {
    it("should call the underlying with the correct args", () => {
      const mockFn = jest.fn();
      const wrapper = clientWrapper(
        emitter({
          action: mockFn
        })
      );
      wrapper.action("some_action", { action: "args" }, () => {});
      expect(mockFn.mock.calls.length).toBe(1);
      expect(mockFn.mock.calls[0].length).toBe(3);
      expect(mockFn.mock.calls[0][0]).toBe("some_action");
      expect(mockFn.mock.calls[0][1]).toEqual({ action: "args" });
      expect(check.function(mockFn.mock.calls[0][2])).toBe(true);
    });

    it("should relay error if the underlying throws", () => {
      const err = new Error("SOME_ERROR");
      const wrapper = clientWrapper(
        emitter({
          action: () => {
            throw err;
          }
        })
      );
      expect(() => {
        wrapper.action("some_action", { action: "args" }, () => {});
      }).toThrow(err);
    });

    it("should relay return value if the underlying succeeds", () => {
      const wrapper = clientWrapper(
        emitter({
          action: () => undefined
        })
      );
      expect(wrapper.action("some_action", { action: "args" }, () => {})).toBe(
        undefined
      );
    });

    it("should callback async if underlying calls back success sync", async () => {
      const wrapper = clientWrapper(
        emitter({
          action: (an, aa, cb) => {
            cb(undefined, { action: "data" });
          }
        })
      );
      const mockCb = jest.fn();
      wrapper.action("some_action", { action: "args" }, mockCb);

      expect(mockCb.mock.calls.length).toBe(0);

      await Promise.resolve();

      expect(mockCb.mock.calls.length).toBe(1);
      expect(mockCb.mock.calls[0].length).toBe(2);
      expect(mockCb.mock.calls[0][0]).toBe(undefined);
      expect(mockCb.mock.calls[0][1]).toEqual({ action: "data" });
    });

    it("should callback async if underlying calls back success async", async () => {
      const wrapper = clientWrapper(
        emitter({
          action: (an, aa, cb) => {
            Promise.resolve().then(() => {
              cb(undefined, { action: "data" });
            });
          }
        })
      );
      const mockCb = jest.fn();
      wrapper.action("some_action", { action: "args" }, mockCb);

      expect(mockCb.mock.calls.length).toBe(0);

      await Promise.resolve(); // Move past underlying callback

      expect(mockCb.mock.calls.length).toBe(0);

      await Promise.resolve();

      expect(mockCb.mock.calls.length).toBe(1);
      expect(mockCb.mock.calls[0].length).toBe(2);
      expect(mockCb.mock.calls[0][0]).toBe(undefined);
      expect(mockCb.mock.calls[0][1]).toEqual({ action: "data" });
    });

    it("should callback async if underlying calls back failure sync", async () => {
      const wrapper = clientWrapper(
        emitter({
          action: (an, aa, cb) => {
            cb(new Error("SOME_ERROR: ..."));
          }
        })
      );
      const mockCb = jest.fn();
      wrapper.action("some_action", { action: "args" }, mockCb);

      expect(mockCb.mock.calls.length).toBe(0);

      await Promise.resolve();

      expect(mockCb.mock.calls.length).toBe(1);
      expect(mockCb.mock.calls[0].length).toBe(1);
      expect(mockCb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(mockCb.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
    });

    it("should callback async if underlying calls back failure async", async () => {
      const wrapper = clientWrapper(
        emitter({
          action: (an, aa, cb) => {
            Promise.resolve().then(() => {
              cb(new Error("SOME_ERROR: ..."));
            });
          }
        })
      );
      const mockCb = jest.fn();
      wrapper.action("some_action", { action: "args" }, mockCb);

      expect(mockCb.mock.calls.length).toBe(0);

      await Promise.resolve(); // Move past underlying callback

      expect(mockCb.mock.calls.length).toBe(0);

      await Promise.resolve();

      expect(mockCb.mock.calls.length).toBe(1);
      expect(mockCb.mock.calls[0].length).toBe(1);
      expect(mockCb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(mockCb.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
    });
  });

  describe("promise style", () => {
    it("should call the underlying with the correct args", () => {
      const mockFn = jest.fn();
      const wrapper = clientWrapper(
        emitter({
          action: mockFn
        })
      );
      wrapper.action("some_action", { action: "args" });
      expect(mockFn.mock.calls.length).toBe(1);
      expect(mockFn.mock.calls[0].length).toBe(3);
      expect(mockFn.mock.calls[0][0]).toBe("some_action");
      expect(mockFn.mock.calls[0][1]).toEqual({ action: "args" });
      expect(check.function(mockFn.mock.calls[0][2])).toBe(true);
    });

    it("should relay error if the underlying throws", () => {
      const err = new Error("SOME_ERROR");
      const wrapper = clientWrapper(
        emitter({
          action: () => {
            throw err;
          }
        })
      );
      expect(() => {
        wrapper.action("some_action", { action: "args" });
      }).toThrow(err);
    });

    it("should return a promise if the underlying succeeds", () => {
      const wrapper = clientWrapper(
        emitter({
          action: jest.fn()
        })
      );
      expect(wrapper.action("some_action", { action: "args" })).toBeInstanceOf(
        Promise
      );
    });

    it("should resolve if underlying calls back success sync", async () => {
      const wrapper = clientWrapper(
        emitter({
          action: (an, aa, cb) => {
            cb(undefined, { action: "data" });
          }
        })
      );

      const actionData = await wrapper.action("some_action", {
        action: "args"
      });

      expect(actionData).toEqual({ action: "data" });
    });

    it("should resolve if underlying calls back success async", async () => {
      const wrapper = clientWrapper(
        emitter({
          action: (an, aa, cb) => {
            Promise.resolve().then(() => {
              cb(undefined, { action: "data" });
            });
          }
        })
      );

      const actionData = await wrapper.action("some_action", {
        action: "args"
      });

      expect(actionData).toEqual({ action: "data" });
    });

    it("should reject if underlying calls back failure sync", async () => {
      const wrapper = clientWrapper(
        emitter({
          action: (an, aa, cb) => {
            cb(new Error("SOME_ERROR: ..."));
          }
        })
      );

      try {
        await wrapper.action("some_action", { action: "args" });
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe("SOME_ERROR: ...");
      }
    });

    it("should reject if underlying calls back failure async", async () => {
      const wrapper = clientWrapper(
        emitter({
          action: (an, aa, cb) => {
            Promise.resolve().then(() => {
              cb(new Error("SOME_ERROR: ..."));
            });
          }
        })
      );

      try {
        await wrapper.action("some_action", { action: "args" });
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe("SOME_ERROR: ...");
      }
    });
  });
});

describe("The clientWrapper.feed() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn(() => emitter({})); // feed() fails if not emitter
    const wrapper = clientWrapper(
      emitter({
        feed: mockFn
      })
    );
    wrapper.feed("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const wrapper = clientWrapper(
      emitter({
        feed: () => {
          throw new Error("SOME_ERROR: ...");
        }
      })
    );
    expect(() => {
      wrapper.feed("some", "args");
    }).toThrow(new Error("SOME_ERROR: ..."));
  });

  it("should return an object", () => {
    const wrapper = clientWrapper(
      emitter({
        feed: () => emitter({})
      })
    );
    expect(check.object(wrapper.feed("some", "args"))).toBe(true);
  });
});

// Feed wrapper methods

describe("The feedWrapper.desireOpen() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            desireOpen: mockFn
          })
      })
    );
    wrapper.feed("some_feed", { feed: "args" }).desireOpen("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            desireOpen: () => {
              throw err;
            }
          })
      })
    );
    expect(() => {
      wrapper.feed("some_feed", { feed: "args" }).desireOpen("some", "args");
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            desireOpen: () => "some_value"
          })
      })
    );
    expect(wrapper.feed("some_feed", { feed: "args" }).desireOpen()).toBe(
      "some_value"
    );
  });
});

describe("The feedWrapper.desireClosed() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            desireClosed: mockFn
          })
      })
    );
    wrapper.feed("some_feed", { feed: "args" }).desireClosed("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            desireClosed: () => {
              throw err;
            }
          })
      })
    );
    expect(() => {
      wrapper.feed("some_feed", { feed: "args" }).desireClosed("some", "args");
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            desireClosed: () => "some_value"
          })
      })
    );
    expect(wrapper.feed("some_feed", { feed: "args" }).desireClosed()).toBe(
      "some_value"
    );
  });
});

describe("The feedWrapper.desiredState() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            desiredState: mockFn
          })
      })
    );
    wrapper.feed("some_feed", { feed: "args" }).desiredState("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            desiredState: () => {
              throw err;
            }
          })
      })
    );
    expect(() => {
      wrapper.feed("some_feed", { feed: "args" }).desiredState("some", "args");
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            desiredState: () => "some_value"
          })
      })
    );
    expect(wrapper.feed("some_feed", { feed: "args" }).desiredState()).toBe(
      "some_value"
    );
  });
});

describe("The feedWrapper.state() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            state: mockFn
          })
      })
    );
    wrapper.feed("some_feed", { feed: "args" }).state("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            state: () => {
              throw err;
            }
          })
      })
    );
    expect(() => {
      wrapper.feed("some_feed", { feed: "args" }).state("some", "args");
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            state: () => "some_value"
          })
      })
    );
    expect(wrapper.feed("some_feed", { feed: "args" }).state()).toBe(
      "some_value"
    );
  });
});

describe("The feedWrapper.data() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            data: mockFn
          })
      })
    );
    wrapper.feed("some_feed", { feed: "args" }).data("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            data: () => {
              throw err;
            }
          })
      })
    );
    expect(() => {
      wrapper.feed("some_feed", { feed: "args" }).data("some", "args");
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            data: () => "some_value"
          })
      })
    );
    expect(wrapper.feed("some_feed", { feed: "args" }).data()).toBe(
      "some_value"
    );
  });
});

describe("The feedWrapper.destroy() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            destroy: mockFn
          })
      })
    );
    wrapper.feed("some_feed", { feed: "args" }).destroy("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            destroy: () => {
              throw err;
            }
          })
      })
    );
    expect(() => {
      wrapper.feed("some_feed", { feed: "args" }).destroy("some", "args");
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = clientWrapper(
      emitter({
        feed: () =>
          emitter({
            destroy: () => "some_value"
          })
      })
    );
    expect(wrapper.feed("some_feed", { feed: "args" }).destroy()).toBe(
      "some_value"
    );
  });
});

// Client wrapper events

describe("The client connecting event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = clientWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("connecting", listener);

    underlying.emit("connecting", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The client connect event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = clientWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("connect", listener);

    underlying.emit("connect", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The client disconnect event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = clientWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("disconnect", listener);

    underlying.emit("disconnect", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The client badServerMessage event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = clientWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("badServerMessage", listener);

    underlying.emit("badServerMessage", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The client badClientMessage event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = clientWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("badClientMessage", listener);

    underlying.emit("badClientMessage", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The client transportError event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = clientWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("transportError", listener);

    underlying.emit("transportError", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

// Feed wrapper events

describe("The feed opening event", () => {
  it("should be emitted asynchronously", async () => {
    let underlyingFeed;
    const underlyingClient = emitter({
      feed: () => {
        underlyingFeed = emitter({});
        return underlyingFeed;
      }
    });
    const cWrapper = clientWrapper(underlyingClient);
    const fWrapper = cWrapper.feed("some_feed", { feed: "args" });

    const listener = jest.fn();
    fWrapper.on("opening", listener);

    underlyingFeed.emit("opening", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The feed open event", () => {
  it("should be emitted asynchronously", async () => {
    let underlyingFeed;
    const underlyingClient = emitter({
      feed: () => {
        underlyingFeed = emitter({});
        return underlyingFeed;
      }
    });
    const cWrapper = clientWrapper(underlyingClient);
    const fWrapper = cWrapper.feed("some_feed", { feed: "args" });

    const listener = jest.fn();
    fWrapper.on("open", listener);

    underlyingFeed.emit("open", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The feed close event", () => {
  it("should be emitted asynchronously", async () => {
    let underlyingFeed;
    const underlyingClient = emitter({
      feed: () => {
        underlyingFeed = emitter({});
        return underlyingFeed;
      }
    });
    const cWrapper = clientWrapper(underlyingClient);
    const fWrapper = cWrapper.feed("some_feed", { feed: "args" });

    const listener = jest.fn();
    fWrapper.on("close", listener);

    underlyingFeed.emit("close", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The feed action event", () => {
  it("should be emitted asynchronously", async () => {
    let underlyingFeed;
    const underlyingClient = emitter({
      feed: () => {
        underlyingFeed = emitter({});
        return underlyingFeed;
      }
    });
    const cWrapper = clientWrapper(underlyingClient);
    const fWrapper = cWrapper.feed("some_feed", { feed: "args" });

    const listener = jest.fn();
    fWrapper.on("action", listener);

    underlyingFeed.emit("action", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("Emissions, callbacks, and promise settlement should order correctly", () => {
  it("should asynchronously order correctly across client and feed", async () => {
    const actionCallbacks = [];
    let fUnderlying;
    const cUnderlying = emitter({
      feed: () => {
        fUnderlying = emitter({});
        return fUnderlying;
      },
      action: (an, aa, cb) => {
        actionCallbacks.push(cb);
      }
    });
    const cWrapper = clientWrapper(cUnderlying);
    const fWrapper = cWrapper.feed("some_feed", { feed: "args" });

    const calls = [];

    cWrapper.on("connecting", () => {
      calls.push("client connecting event");
    });
    fWrapper.on("opening", () => {
      calls.push("feed opening event");
    });

    cWrapper.action("some_action", { action: "args" }, () => {
      calls.push("callback action returned");
    });

    cWrapper.action("some_action", { action: "args" }).then(() => {
      calls.push("promise action returned");
    });

    cUnderlying.emit("connecting");
    fUnderlying.emit("opening");
    actionCallbacks[0]();
    fUnderlying.emit("opening");
    cUnderlying.emit("connecting");
    actionCallbacks[1]();
    cUnderlying.emit("connecting");
    fUnderlying.emit("opening");

    expect(calls).toEqual([]);

    await Promise.resolve();

    expect(calls).toEqual([
      "client connecting event",
      "feed opening event",
      "callback action returned",
      "feed opening event",
      "client connecting event",
      "promise action returned",
      "client connecting event",
      "feed opening event"
    ]);
  });
});

// Deferral ordering

it("On disconnect, any outstanding action callbacks should be invoked before disconnect event", async () => {
  let underlyingActionCb;
  const underlying = emitter({
    action: (an, aa, cb) => {
      underlyingActionCb = cb;
    }
  });
  const wrapper = clientWrapper(underlying);

  const order = [];

  const disconnectListener = jest.fn(() => {
    order.push("disconnect");
  });
  wrapper.on("disconnect", disconnectListener);

  const actionCb = jest.fn(() => {
    order.push("callback");
  });

  wrapper.action("some_action", { action: "args" }, actionCb);

  underlyingActionCb();
  underlying.emit("disconnect", new Error("FAILURE: ..."));

  expect(actionCb.mock.calls.length).toBe(0);
  expect(disconnectListener.mock.calls.length).toBe(0);

  await Promise.resolve();

  expect(actionCb.mock.calls.length).toBe(1);
  expect(disconnectListener.mock.calls.length).toBe(1);

  expect(order).toEqual(["callback", "disconnect"]);
});

it("On disconnect, any outstanding action rejections should be invoked before disconnect event", async () => {
  let underlyingActionCb;
  const underlying = emitter({
    action: (an, aa, cb) => {
      underlyingActionCb = cb;
    }
  });
  const wrapper = clientWrapper(underlying);

  const order = [];

  const disconnectListener = jest.fn(() => {
    order.push("disconnect");
  });
  wrapper.on("disconnect", disconnectListener);

  const actionSettle = jest.fn(() => {
    order.push("settle");
  });

  wrapper.action("some_action", { action: "args" }).then(actionSettle);

  underlyingActionCb();
  underlying.emit("disconnect", new Error("FAILURE: ..."));

  expect(actionSettle.mock.calls.length).toBe(0);
  expect(disconnectListener.mock.calls.length).toBe(0);

  await Promise.resolve();

  expect(actionSettle.mock.calls.length).toBe(1);
  expect(disconnectListener.mock.calls.length).toBe(1);

  expect(order).toEqual(["settle", "disconnect"]);
});

it("On disconnect, any feed close events should be invoked before disconnect event", async () => {
  let underlyingFeed;
  const underlying = emitter({
    feed: () => {
      underlyingFeed = emitter({});
      return underlyingFeed;
    }
  });
  const wrapper = clientWrapper(underlying);

  const order = [];

  const disconnectListener = jest.fn(() => {
    order.push("disconnect");
  });
  wrapper.on("disconnect", disconnectListener);

  const feed = wrapper.feed("some_feed", { feed: "args" });

  const closeListener = jest.fn(() => {
    order.push("close");
  });
  feed.on("close", closeListener);

  underlyingFeed.emit("close", new Error("DISCONNECTED: ..."));
  underlying.emit("disconnect", new Error("FAILURE: ..."));

  expect(closeListener.mock.calls.length).toBe(0);
  expect(disconnectListener.mock.calls.length).toBe(0);

  await Promise.resolve();

  expect(closeListener.mock.calls.length).toBe(1);
  expect(disconnectListener.mock.calls.length).toBe(1);

  expect(order).toEqual(["close", "disconnect"]);
});
