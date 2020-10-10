import { harness, toBe } from "../common";

describe("The client.feed() function", () => {
  describe("invalid application invocation", () => {
    it("feedName argument - invalid type", async () => {
      harness.initClient({
        transport: harness.mockTransport()
      });

      const trace = await harness.trace(() => {
        harness.clientWrapper.feed(undefined, { Feed: "Args" });
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "feed",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_ARGUMENT: Invalid feed name."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneTrace",
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

    it("feedArgs argument - invalid type", async () => {
      harness.initClient({
        transport: harness.mockTransport()
      });

      const trace = await harness.trace(() => {
        harness.clientWrapper.feed("FeedName");
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "feed",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_ARGUMENT: Invalid feed arguments object."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneTrace",
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

    it("feedArgs argument property - invalid type", async () => {
      harness.initClient({
        transport: harness.mockTransport()
      });

      const trace = await harness.trace(() => {
        harness.clientWrapper.feed("FeedName", { Something: undefined });
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitClientMethod",
        State: curState,
        Method: "feed",
        Result: {
          Error: {
            name: "Error",
            message: "INVALID_ARGUMENT: Invalid feed arguments object."
          }
        }
      });

      expect(trace[2]).toEqual({
        Phase: "DoneTrace",
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

  it("valid application invocation", async () => {
    harness.initClient({
      transport: harness.mockTransport()
    });

    let feed;
    const trace = await harness.trace(() => {
      feed = harness.clientWrapper.feed("FeedName", { Feed: "Args" });
    });

    expect(trace[0]).toEqual({
      Phase: "Start",
      State: jasmine.any(Object)
    });

    const curState = trace[0].State;

    curState.feeds = [
      {
        destroyed: { ReturnValue: false },
        desiredState: { ReturnValue: "closed" },
        state: { ReturnValue: "closed" },
        data: {
          Error: {
            name: "Error",
            message: "INVALID_FEED_STATE: The feed object is not open."
          }
        }
      }
    ];

    expect(trace[1]).toEqual({
      Invocation: "ExitClientMethod",
      State: curState,
      Method: "feed",
      Result: {
        ReturnValue: toBe(feed.actual)
      }
    });

    expect(trace[2]).toEqual({
      Phase: "DoneTrace",
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
