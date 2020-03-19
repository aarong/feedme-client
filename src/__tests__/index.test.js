import index from "../index";

describe("The index module", () => {
  it("should be a factory function", () => {
    expect(index).toBeInstanceOf(Function);
  });
});
