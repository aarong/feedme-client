import main from "../main";

describe("The main module", () => {
  it("should throw on invalid options", () => {
    expect(() => {
      main(123);
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid options argument."));
  });

  it("should otherwise return a client object", () => {
    expect(
      main({
        transport: {
          on: () => {},
          off: () => {},
          connect: () => {},
          disconnect: () => {},
          send: () => {},
          state: () => "disconnected"
        }
      })
    ).toBeInstanceOf(Object);
  });
});
