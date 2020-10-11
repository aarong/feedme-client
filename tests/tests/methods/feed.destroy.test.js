import { harness, toBe } from "../common";

describe("The feed.destroy() function", () => {
  describe("invalid application invocation", () => {
    it("feed is desired open", async () => {
      harness.initClient({
        transport: harness.mockTransport()
      });

      const feed = await harness.makeDesiredOpenFeed("FeedName", {
        Feed: "Args"
      });

      const trace = await harness.trace(() => {
        feed.wrapper.destroy();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitFeedMethod",
        State: curState,
        Feed: toBe(feed.actual),
        Method: "destroy",
        Result: {
          Error: {
            name: "Error",
            message:
              "INVALID_FEED_STATE: Only feeds desired closed can be destroyed."
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

    it("feed is already destroyed", async () => {
      harness.initClient({
        transport: harness.mockTransport()
      });

      const feed = harness.clientWrapper.feed("FeedName", { Feed: "Args" });
      feed.wrapper.destroy();

      const trace = await harness.trace(() => {
        feed.wrapper.destroy();
      });

      expect(trace[0]).toEqual({
        Phase: "Start",
        State: jasmine.any(Object)
      });

      const curState = trace[0].State;

      expect(trace[1]).toEqual({
        Invocation: "ExitFeedMethod",
        State: curState,
        Feed: toBe(feed.actual),
        Method: "destroy",
        Result: {
          Error: {
            name: "Error",
            message: "DESTROYED: The feed object has been destroyed."
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

    const feed = harness.clientWrapper.feed("FeedName", { Feed: "Args" });

    const trace = await harness.trace(() => {
      feed.wrapper.destroy();
    });

    expect(trace[0]).toEqual({
      Phase: "Start",
      State: jasmine.any(Object)
    });

    const curState = trace[0].State;

    curState.feeds[0] = {
      destroyed: { ReturnValue: true },
      desiredState: {
        Error: {
          name: "Error",
          message: "DESTROYED: The feed object has been destroyed."
        }
      },
      state: {
        Error: {
          name: "Error",
          message: "DESTROYED: The feed object has been destroyed."
        }
      },
      data: {
        Error: {
          name: "Error",
          message: "DESTROYED: The feed object has been destroyed."
        }
      }
    };

    expect(trace[1]).toEqual({
      Invocation: "ExitFeedMethod",
      State: curState,
      Feed: toBe(feed.actual),
      Method: "destroy",
      Result: { ReturnValue: undefined }
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
