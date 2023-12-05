import check from "check-types";
import emitter from "component-emitter";
import FeedNameArgs from "feedme-util/feednameargs";
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
        state: mockFn,
      }),
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
        },
      }),
    );
    expect(() => {
      wrapper.state();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        state: () => "some_value",
      }),
    );
    expect(wrapper.state()).toBe("some_value");
  });
});

describe("The sessionWrapper.connect() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        connect: mockFn,
      }),
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
        },
      }),
    );
    expect(() => {
      wrapper.connect();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        connect: () => "some_value",
      }),
    );
    expect(wrapper.connect()).toBe("some_value");
  });
});

describe("The sessionWrapper.disconnect() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        disconnect: mockFn,
      }),
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
        },
      }),
    );
    expect(() => {
      wrapper.disconnect();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        disconnect: () => "some_value",
      }),
    );
    expect(wrapper.disconnect()).toBe("some_value");
  });
});

describe("The sessionWrapper.feedState() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        feedState: mockFn,
      }),
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
        },
      }),
    );
    expect(() => {
      wrapper.feedState();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        feedState: () => "some_value",
      }),
    );
    expect(wrapper.feedState()).toBe("some_value");
  });
});

describe("The sessionWrapper.feedData() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        feedData: mockFn,
      }),
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
        },
      }),
    );
    expect(() => {
      wrapper.feedData();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        feedData: () => "some_value",
      }),
    );
    expect(wrapper.feedData()).toBe("some_value");
  });
});

describe("The sessionWrapper.destroy() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        destroy: mockFn,
      }),
    );
    wrapper.destroy("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = sessionWrapper(
      emitter({
        destroy: () => {
          throw err;
        },
      }),
    );
    expect(() => {
      wrapper.destroy();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        destroy: () => "some_value",
      }),
    );
    expect(wrapper.destroy()).toBe("some_value");
  });
});

describe("The sessionWrapper.destroyed() function", () => {
  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        destroyed: mockFn,
      }),
    );
    wrapper.destroyed("some", "args");
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0]).toBe("some");
    expect(mockFn.mock.calls[0][1]).toBe("args");
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = sessionWrapper(
      emitter({
        destroyed: () => {
          throw err;
        },
      }),
    );
    expect(() => {
      wrapper.destroyed();
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        destroyed: () => "some_value",
      }),
    );
    expect(wrapper.destroyed()).toBe("some_value");
  });
});

describe("The sessionWrapper.action() function", () => {
  it("should throw on non-function argument", () => {
    const wrapper = sessionWrapper(emitter({}));
    expect(() => {
      wrapper.action("some_action", { action: "args" }, 123);
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid callback."));
  });

  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        action: mockFn,
      }),
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
        },
      }),
    );
    expect(() => {
      wrapper.action("some_action", { action: "args" }, () => {});
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        action: () => undefined,
      }),
    );
    expect(wrapper.action("some_action", { action: "args" }, () => {})).toBe(
      undefined,
    );
  });

  it("should callback async if underlying calls back success sync", async () => {
    const wrapper = sessionWrapper(
      emitter({
        action: (an, aa, cb) => {
          cb(undefined, { action: "data" });
        },
      }),
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
        },
      }),
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
        },
      }),
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
        },
      }),
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
  it("should throw on non-function argument", () => {
    const wrapper = sessionWrapper(emitter({}));
    expect(() => {
      wrapper.feedOpen(FeedNameArgs("some_feed", { feed: "args" }), 123);
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid callback."));
  });

  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: mockFn,
      }),
    );
    wrapper.feedOpen(
      FeedNameArgs("some_feedOpen", { feedOpen: "args" }),
      () => {},
    );
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0].name()).toBe("some_feedOpen");
    expect(mockFn.mock.calls[0][0].args()).toEqual({ feedOpen: "args" });
    expect(check.function(mockFn.mock.calls[0][1])).toBe(true);
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: () => {
          throw err;
        },
      }),
    );
    expect(() => {
      wrapper.feedOpen(
        FeedNameArgs("some_feedOpen", { feedOpen: "args" }),
        () => {},
      );
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: () => undefined,
      }),
    );
    expect(
      wrapper.feedOpen(
        FeedNameArgs("some_feedOpen", { feedOpen: "args" }),
        () => {},
      ),
    ).toBe(undefined);
  });

  it("should callback async if underlying calls back success sync", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: (fna, cb) => {
          cb(undefined, { feedOpen: "data" });
        },
      }),
    );
    const mockCb = jest.fn();
    wrapper.feedOpen(
      FeedNameArgs("some_feedOpen", { feedOpen: "args" }),
      mockCb,
    );

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(2);
    expect(mockCb.mock.calls[0][0]).toBe(undefined);
    expect(mockCb.mock.calls[0][1]).toEqual({ feedOpen: "data" });
    expect(mockCb.mock.instances[0]).toBe(undefined);
  });

  it("should callback async if underlying calls back success async", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: (fna, cb) => {
          Promise.resolve().then(() => {
            cb(undefined, { feedOpen: "data" });
          });
        },
      }),
    );
    const mockCb = jest.fn();
    wrapper.feedOpen(
      FeedNameArgs("some_feedOpen", { feedOpen: "args" }),
      mockCb,
    );

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve(); // Move past underlying callback

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(2);
    expect(mockCb.mock.calls[0][0]).toBe(undefined);
    expect(mockCb.mock.calls[0][1]).toEqual({ feedOpen: "data" });
    expect(mockCb.mock.instances[0]).toBe(undefined);
  });

  it("should callback async if underlying calls back failure sync", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: (fna, cb) => {
          cb(new Error("SOME_ERROR: ..."));
        },
      }),
    );
    const mockCb = jest.fn();
    wrapper.feedOpen(
      FeedNameArgs("some_feedOpen", { feedOpen: "args" }),
      mockCb,
    );

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(1);
    expect(mockCb.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(mockCb.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
    expect(mockCb.mock.instances[0]).toBe(undefined);
  });

  it("should callback async if underlying calls back failure async", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedOpen: (fna, cb) => {
          Promise.resolve().then(() => {
            cb(new Error("SOME_ERROR: ..."));
          });
        },
      }),
    );
    const mockCb = jest.fn();
    wrapper.feedOpen(
      FeedNameArgs("some_feedOpen", { feedOpen: "args" }),
      mockCb,
    );

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve(); // Move past underlying callback

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(1);
    expect(mockCb.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(mockCb.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
    expect(mockCb.mock.instances[0]).toBe(undefined);
  });
});

describe("The sessionWrapper.feedClose() function", () => {
  it("should throw on non-function argument", () => {
    const wrapper = sessionWrapper(emitter({}));
    expect(() => {
      wrapper.feedClose(FeedNameArgs("some_feed", { feed: "args" }), 123);
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid callback."));
  });

  it("should call the underlying with the correct args", () => {
    const mockFn = jest.fn();
    const wrapper = sessionWrapper(
      emitter({
        feedClose: mockFn,
      }),
    );
    wrapper.feedClose(
      FeedNameArgs("some_feedClose", { feedClose: "args" }),
      () => {},
    );
    expect(mockFn.mock.calls.length).toBe(1);
    expect(mockFn.mock.calls[0].length).toBe(2);
    expect(mockFn.mock.calls[0][0].name()).toBe("some_feedClose");
    expect(mockFn.mock.calls[0][0].args()).toEqual({ feedClose: "args" });
    expect(check.function(mockFn.mock.calls[0][1])).toBe(true);
  });

  it("should relay error if the underlying throws", () => {
    const err = new Error("SOME_ERROR");
    const wrapper = sessionWrapper(
      emitter({
        feedClose: () => {
          throw err;
        },
      }),
    );
    expect(() => {
      wrapper.feedClose(
        FeedNameArgs("some_feedClose", { feedClose: "args" }),
        () => {},
      );
    }).toThrow(err);
  });

  it("should relay return value if the underlying succeeds", () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: () => undefined,
      }),
    );
    expect(
      wrapper.feedClose(
        FeedNameArgs("some_feedClose", { feedClose: "args" }),
        () => {},
      ),
    ).toBe(undefined);
  });

  it("should callback async if underlying calls back success sync", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: (fna, cb) => {
          cb(undefined, { feedClose: "data" });
        },
      }),
    );
    const mockCb = jest.fn();
    wrapper.feedClose(
      FeedNameArgs("some_feedClose", { feedClose: "args" }),
      mockCb,
    );

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(2);
    expect(mockCb.mock.calls[0][0]).toBe(undefined);
    expect(mockCb.mock.calls[0][1]).toEqual({ feedClose: "data" });
    expect(mockCb.mock.instances[0]).toBe(undefined);
  });

  it("should callback async if underlying calls back success async", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: (fna, cb) => {
          Promise.resolve().then(() => {
            cb(undefined, { feedClose: "data" });
          });
        },
      }),
    );
    const mockCb = jest.fn();
    wrapper.feedClose(
      FeedNameArgs("some_feedClose", { feedClose: "args" }),
      mockCb,
    );

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve(); // Move past underlying callback

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(2);
    expect(mockCb.mock.calls[0][0]).toBe(undefined);
    expect(mockCb.mock.calls[0][1]).toEqual({ feedClose: "data" });
    expect(mockCb.mock.instances[0]).toBe(undefined);
  });

  it("should callback async if underlying calls back failure sync", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: (fna, cb) => {
          cb(new Error("SOME_ERROR: ..."));
        },
      }),
    );
    const mockCb = jest.fn();
    wrapper.feedClose(
      FeedNameArgs("some_feedClose", { feedClose: "args" }),
      mockCb,
    );

    expect(mockCb.mock.calls.length).toBe(0);

    await Promise.resolve();

    expect(mockCb.mock.calls.length).toBe(1);
    expect(mockCb.mock.calls[0].length).toBe(1);
    expect(mockCb.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(mockCb.mock.calls[0][0].message).toBe("SOME_ERROR: ...");
    expect(mockCb.mock.instances[0]).toBe(undefined);
  });

  it("should callback async if underlying calls back failure async", async () => {
    const wrapper = sessionWrapper(
      emitter({
        feedClose: (fna, cb) => {
          Promise.resolve().then(() => {
            cb(new Error("SOME_ERROR: ..."));
          });
        },
      }),
    );
    const mockCb = jest.fn();
    wrapper.feedClose(
      FeedNameArgs("some_feedClose", { feedClose: "args" }),
      mockCb,
    );

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

describe("The sessionWrapper feedAction event", () => {
  it("should be emitted asynchronously", async () => {
    const underlying = emitter({});
    const wrapper = sessionWrapper(underlying);
    const listener = jest.fn();
    wrapper.on("feedAction", listener);

    underlying.emit("feedAction", "some", "args");

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

// Deferral ordering

it("On disconnect, any outstanding action callbacks should be invoked before disconnect event", async () => {
  let underlyingActionCb;
  const underlying = emitter({
    action: (an, aa, cb) => {
      underlyingActionCb = cb;
    },
  });
  const wrapper = sessionWrapper(underlying);

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
  underlying.emit("disconnect", new Error("TRANSPORT_FAILURE: ..."));

  expect(actionCb.mock.calls.length).toBe(0);
  expect(disconnectListener.mock.calls.length).toBe(0);

  await Promise.resolve();

  expect(actionCb.mock.calls.length).toBe(1);
  expect(disconnectListener.mock.calls.length).toBe(1);

  expect(order).toEqual(["callback", "disconnect"]);
});

it("On disconnect, any outstanding feedOpen callbacks should be invoked before disconnect event", async () => {
  let underlyingFeedOpenCb;
  const underlying = emitter({
    feedOpen: (fna, cb) => {
      underlyingFeedOpenCb = cb;
    },
  });
  const wrapper = sessionWrapper(underlying);

  const order = [];

  const disconnectListener = jest.fn(() => {
    order.push("disconnect");
  });
  wrapper.on("disconnect", disconnectListener);

  const feedOpenCb = jest.fn(() => {
    order.push("callback");
  });

  wrapper.feedOpen(FeedNameArgs("some_feed", { feed: "args" }), feedOpenCb);

  underlyingFeedOpenCb();
  underlying.emit("disconnect", new Error("TRANSPORT_FAILURE: ..."));

  expect(feedOpenCb.mock.calls.length).toBe(0);
  expect(disconnectListener.mock.calls.length).toBe(0);

  await Promise.resolve();

  expect(feedOpenCb.mock.calls.length).toBe(1);
  expect(disconnectListener.mock.calls.length).toBe(1);

  expect(order).toEqual(["callback", "disconnect"]);
});

it("On disconnect, any outstanding feedClose callbacks should be invoked before disconnect event", async () => {
  let underlyingFeedCloseCb;
  const underlying = emitter({
    feedClose: (fna, cb) => {
      underlyingFeedCloseCb = cb;
    },
  });
  const wrapper = sessionWrapper(underlying);

  const order = [];

  const disconnectListener = jest.fn(() => {
    order.push("disconnect");
  });
  wrapper.on("disconnect", disconnectListener);

  const feedCloseCb = jest.fn(() => {
    order.push("callback");
  });

  wrapper.feedClose(FeedNameArgs("some_feed", { feed: "args" }), feedCloseCb);

  underlyingFeedCloseCb();
  underlying.emit("disconnect", new Error("TRANSPORT_FAILURE: ..."));

  expect(feedCloseCb.mock.calls.length).toBe(0);
  expect(disconnectListener.mock.calls.length).toBe(0);

  await Promise.resolve();

  expect(feedCloseCb.mock.calls.length).toBe(1);
  expect(disconnectListener.mock.calls.length).toBe(1);

  expect(order).toEqual(["callback", "disconnect"]);
});

it("On disconnect, any action callbacks should be invoked before any feed callbacks and disconnect event", async () => {
  let underlyingActionCb;
  let underlyingFeedCloseCb;
  const underlying = emitter({
    action: (an, aa, cb) => {
      underlyingActionCb = cb;
    },
    feedClose: (fna, cb) => {
      underlyingFeedCloseCb = cb;
    },
  });
  const wrapper = sessionWrapper(underlying);

  const order = [];

  const disconnectListener = jest.fn(() => {
    order.push("disconnect");
  });
  wrapper.on("disconnect", disconnectListener);

  const actionCb = jest.fn(() => {
    order.push("action");
  });
  wrapper.action("some_action", { action: "args" }, actionCb);

  const feedCloseCb = jest.fn(() => {
    order.push("feed");
  });
  wrapper.feedClose(FeedNameArgs("some_feed", { feed: "args" }), feedCloseCb);

  underlyingActionCb();
  underlyingFeedCloseCb();
  underlying.emit("disconnect", new Error("TRANSPORT_FAILURE: ..."));

  expect(actionCb.mock.calls.length).toBe(0);
  expect(feedCloseCb.mock.calls.length).toBe(0);
  expect(disconnectListener.mock.calls.length).toBe(0);

  await Promise.resolve();

  expect(actionCb.mock.calls.length).toBe(1);
  expect(feedCloseCb.mock.calls.length).toBe(1);
  expect(disconnectListener.mock.calls.length).toBe(1);

  expect(order).toEqual(["action", "feed", "disconnect"]);
});
