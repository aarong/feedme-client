// import { harness } from "../common";

describe("The feed.desireOpen() function", () => {
  describe("invalid application invocation", () => {
    it("feed is destroyed", () => {});

    it("feed is already desired open", () => {});
  });

  describe("valid application invocation", () => {
    describe("client is disconnected", () => {
      describe("invalid transport behavior", () => {
        it("transport throws on initial state check", () => {});

        it("transport returns invalid value on initial state check", () => {});
      });

      it("valid transport behavior", () => {});
    });

    describe("client is connecting - transport is connecting", () => {
      describe("invalid transport behavior", () => {
        it("transport throws on initial state check", () => {});

        it("transport returns invalid value on initial state check", () => {});
      });

      it("valid transport behavior", () => {});
    });

    describe("client is connecting - transport is connected and handshake is pending", () => {
      describe("invalid transport behavior", () => {
        it("transport throws on initial state check", () => {});

        it("transport returns invalid value on initial state check", () => {});
      });

      it("valid transport behavior", () => {});
    });

    describe("client is connected", () => {
      describe("server feed is closed", () => {
        describe("invalid transport behavior", () => {
          it("transport throws on pre-send state check", () => {});

          it("transport returns invalid value on pre-send state check", () => {});

          it("transport throws on call to transport.send()", () => {});

          it("transport throws on post-send state check", () => {});

          it("transport returns invalid value on post-send state check", () => {});

          it("transport returns 'connecting' on post-send state check", () => {});
        });

        describe("valid transport behavior", () => {
          describe("post-send transport state is disconnected", () => {
            it("transport emits disconnect synchronously", () => {});

            it("transport does not emit disconnect synchronously", () => {});
          });

          it("post-send transport state is connected", () => {});
        });
      });

      describe("server feed is opening", () => {
        describe("invalid transport behavior", () => {
          it("transport throws on pre-send state check", () => {});

          it("transport returns invalid value on pre-send state check", () => {});
        });

        it("valid transport behavior", () => {});
      });

      describe("server feed is open", () => {
        describe("invalid transport behavior", () => {
          it("transport throws on pre-send state check", () => {});

          it("transport returns invalid value on pre-send state check", () => {});
        });

        it("valid transport behavior", () => {});
      });

      describe("server feed is closing", () => {
        describe("invalid transport behavior", () => {
          it("transport throws on pre-send state check", () => {});

          it("transport returns invalid value on pre-send state check", () => {});
        });

        it("valid transport behavior", () => {});
      });

      describe("server feed is terminated", () => {
        describe("invalid transport behavior", () => {
          it("transport throws on pre-send state check", () => {});

          it("transport returns invalid value on pre-send state check", () => {});
        });

        it("valid transport behavior", () => {});
      });
    });
  });
});
