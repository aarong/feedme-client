import check from "check-types";
import emitter from "component-emitter";
import sessionWrapper from "../session.wrapper";

// Session wrapper functions

describe("The sessionWrapper() factory function", () => {
  it("should throw on invalid sessionSync argument", () => {
    expect(() => {
      sessionWrapper("junk");
    }).toThrow(new Error("INVALID_ARGUMENT: Argument must be an object."));
  });

  it("should return an object on success", () => {
    expect(check.object(sessionWrapper(emitter({})))).toBe(true);
  });
});

describe("The sessionWrapper.state() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
      emitter({
        state: () => "some_value"
      })
    );
    expect(wrapper.state()).toBe("some_value");
  });
});

describe("The sessionWrapper.connect() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
      emitter({
        connect: () => "some_value"
      })
    );
    expect(wrapper.connect()).toBe("some_value");
  });
});

describe("The sessionWrapper.disconnect() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
      emitter({
        disconnect: () => "some_value"
      })
    );
    expect(wrapper.disconnect()).toBe("some_value");
  });
});

describe("The sessionWrapper.id() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
      emitter({
        id: () => "some_value"
      })
    );
    expect(wrapper.id()).toBe("some_value");
  });
});

describe("The sessionWrapper.feedState() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        feedState: mockFn
      })
    );
    wrapper.feedState("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = sessionWrapper(
      emitter({
        feedState: () => {
          throw err;
        }
      })
    );
    expect(() => {
      wrapper.feedState();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        feedState: () => "some_value"
      })
    );
    expect(wrapper.feedState()).toBe("some_value");
  });
});

describe("The sessionWrapper.feedData() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        feedData: mockFn
      })
    );
    wrapper.feedData("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = sessionWrapper(
      emitter({
        feedData: () => {
          throw err;
        }
      })
    );
    expect(() => {
      wrapper.feedData();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        feedData: () => "some_value"
      })
    );
    expect(wrapper.feedData()).toBe("some_value");
  });
});

describe("The sessionWrapper.action() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
      emitter({
        action: () => undefined
      })
    );
    expect(wrapper.action("some_action", { action: "args" }, () => {})).toBe(
      undefined
    );
  });

  it("should callback async if underlying calls back success sync", async () => {
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
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
    const wrapper = sessionWrapper(
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

describe("The sessionWrapper.feedOpen() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: mockFn
      })
    );
    wrapper.feedOpen("some_feedOpen", { feedOpen: "args" }, () => {});
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(3);
    expect(mockFn.mock.calls[0][0]).toBe("some_feedOpen");
    expect(mockFn.mock.calls[0][1]).toEqual({ feedOpen: "args" });
    expect(check.function(mockFn.mock.calls[0][2])).toBe(true);
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: () => {
          throw err;
        }
      })
    );
    expect(() => {
      wrapper.feedOpen("some_feedOpen", { feedOpen: "args" }, () => {});
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: () => undefined
      })
    );
    expect(
      wrapper.feedOpen("some_feedOpen", { feedOpen: "args" }, () => {})
    ).toBe(undefined);
  });

  it("should callback async if underlying calls back success sync", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: (an, aa, cb) => {
          cb(undefined, { feedOpen: "data" });
        }
      })
    );
    const mockCb = jest.fn();
    wrapper.feedOpen("some_feedOpen", { feedOpen: "args" }, mockCb);

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(2);
    expect(mockCb.mock.calls[0][0]).toBe(undefined);
    expect(mockCb.mock.calls[0][1]).toEqual({ feedOpen: "data" });
  });

  it("should callback async if underlying calls back success async", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: (an, aa, cb) => {
          Promise.resolve().then(() => {
            cb(undefined, { feedOpen: "data" });
          });
        }
      })
    );
    const mockCb = jest.fn();
    wrapper.feedOpen("some_feedOpen", { feedOpen: "args" }, mockCb);

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve(); // Move past underlying callback

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(2);
    expect(mockCb.mock.calls[0][0]).toBe(undefined);
    expect(mockCb.mock.calls[0][1]).toEqual({ feedOpen: "data" });
  });

  it("should callback async if underlying calls back failure sync", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: (an, aa, cb) => {
          cb(new Error("SOME_ERROR: ..."));
        }
      })
    );
    const mockCb = jest.fn();
    wrapper.feedOpen("some_feedOpen", { feedOpen: "args" }, mockCb);

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(1);
    expect(mockCb.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(mockCb.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
  });

  it("should callback async if underlying calls back failure async", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: (an, aa, cb) => {
          Promise.resolve().then(() => {
            cb(new Error("SOME_ERROR: ..."));
          });
        }
      })
    );
    const mockCb = jest.fn();
    wrapper.feedOpen("some_feedOpen", { feedOpen: "args" }, mockCb);

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

describe("The sessionWrapper.feedClose() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        feedClose: mockFn
      })
    );
    wrapper.feedClose("some_feedClose", { feedClose: "args" }, () => {});
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(3);
    expect(mockFn.mock.calls[0][0]).toBe("some_feedClose");
    expect(mockFn.mock.calls[0][1]).toEqual({ feedClose: "args" });
    expect(check.function(mockFn.mock.calls[0][2])).toBe(true);
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = sessionWrapper(
      emitter({
        feedClose: () => {
          throw err;
        }
      })
    );
    expect(() => {
      wrapper.feedClose("some_feedClose", { feedClose: "args" }, () => {});
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: () => undefined
      })
    );
    expect(
      wrapper.feedClose("some_feedClose", { feedClose: "args" }, () => {})
    ).toBe(undefined);
  });

  it("should callback async if underlying calls back success sync", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: (an, aa, cb) => {
          cb(undefined, { feedClose: "data" });
        }
      })
    );
    const mockCb = jest.fn();
    wrapper.feedClose("some_feedClose", { feedClose: "args" }, mockCb);

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(2);
    expect(mockCb.mock.calls[0][0]).toBe(undefined);
    expect(mockCb.mock.calls[0][1]).toEqual({ feedClose: "data" });
  });

  it("should callback async if underlying calls back success async", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: (an, aa, cb) => {
          Promise.resolve().then(() => {
            cb(undefined, { feedClose: "data" });
          });
        }
      })
    );
    const mockCb = jest.fn();
    wrapper.feedClose("some_feedClose", { feedClose: "args" }, mockCb);

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve(); // Move past underlying callback

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(2);
    expect(mockCb.mock.calls[0][0]).toBe(undefined);
    expect(mockCb.mock.calls[0][1]).toEqual({ feedClose: "data" });
  });

  it("should callback async if underlying calls back failure sync", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: (an, aa, cb) => {
          cb(new Error("SOME_ERROR: ..."));
        }
      })
    );
    const mockCb = jest.fn();
    wrapper.feedClose("some_feedClose", { feedClose: "args" }, mockCb);

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(1);
    expect(mockCb.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(mockCb.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
  });

  it("should callback async if underlying calls back failure async", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: (an, aa, cb) => {
          Promise.resolve().then(() => {
            cb(new Error("SOME_ERROR: ..."));
          });
        }
      })
    );
    const mockCb = jest.fn();
    wrapper.feedClose("some_feedClose", { feedClose: "args" }, mockCb);

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

// Session wrapper events

describe("The sessionWrapper connecting event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
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

describe("The sessionWrapper connect event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
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

describe("The sessionWrapper disconnect event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
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

describe("The sessionWrapper actionRevelation event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("actionRevelation", listener);

    underlying.emit("actionRevelation", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The sessionWrapper unexpectedFeedClosing event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("unexpectedFeedClosing", listener);

    underlying.emit("unexpectedFeedClosing", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The sessionWrapper unexpectedFeedClosed event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("unexpectedFeedClosed", listener);

    underlying.emit("unexpectedFeedClosed", "some", "args");

    expect(listener.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(listener.mock.calls.length).toBe(1);
    expect(listener.mock.calls[0].length).toBe(2);
    expect(listener.mock.calls[0][0]).toBe("some");
    expect(listener.mock.calls[0][1]).toBe("args");
  });
});

describe("The sessionWrapper badServerMessage event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
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

describe("The sessionWrapper badClientMessage event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
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

describe("The sessionWrapper transportError event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
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
