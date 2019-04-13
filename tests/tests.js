// Build integration tests run on Node and in the browser
// Assume an in-scope feedmeClient() factory function

describe("The build", function() {
  it("should throw on invalid options", function() {
    expect(function() {
      console.log(feedmeClient);
      feedmeClient();
    }).toThrow(new Error("INVALID_ARGUMENT: Invalid options argument."));
  });
});
