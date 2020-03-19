import main from "../main";

describe("The main module", () => {
  it("should be a factory function", () => {
    expect(main).toBeInstanceOf(Function);
  });
});
