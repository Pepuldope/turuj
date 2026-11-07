import { describe, expect, it } from "vitest";
import { redirectTarget } from "./slugRedirects";

const table = { "volovec-woowiec": "volovec-zapadne-tatry", "a": "b", "b": "c", "loop1": "loop2", "loop2": "loop1" };

describe("redirectTarget", () => {
  it("finds the new slug of a renamed trip", () => {
    expect(redirectTarget("volovec-woowiec", table)).toBe("volovec-zapadne-tatry");
  });
  it("follows chains to the last slug", () => {
    expect(redirectTarget("a", table)).toBe("c");
  });
  it("knows nothing about a slug that was never renamed", () => {
    expect(redirectTarget("rysy", table)).toBeNull();
  });
  it("survives a loop in the table", () => {
    expect(redirectTarget("loop1", table)).not.toBe("loop1");
  });
});
