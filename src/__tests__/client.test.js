import check from "check-types";
import Emitter from "component-emitter";
import client from "../client";

describe("The factory function", () => {
  it("should return an object", () => {
    expect(check.object(client({ session: Emitter({}) }))).toBe(true);
  });
});
