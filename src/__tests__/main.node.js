import main from "../main.node";

describe("The main module", () => {
  it("should be a factory function", () => {
    expect(main).toBeInstanceOf(Function);
  });
});
