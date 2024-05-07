import check from "check-types";
import harness from "./common.mjs";

describe("The harness object", () => {
  it("should contain a feedme object", async () => {
    expect(check.object(harness()._fmClient)).toBe(true);
  });
});
