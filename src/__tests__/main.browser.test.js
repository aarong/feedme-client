import main from "../main.browser";

describe("The main module", () => {
  it("should be a factory function", () => {
    expect(main).toBeInstanceOf(Function);
  });
});
