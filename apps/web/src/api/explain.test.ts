import { describe, expect, it } from "vitest";
import { ApiError, explain } from "./client.js";

describe("explain", () => {
  it("adds what would change a refusal to its message", () => {
    expect(explain(new ApiError(403, "authority-missing", "Classifying a data lane needs lane authority", "An administrator must issue it."), "x"))
      .toBe("Classifying a data lane needs lane authority. An administrator must issue it.");
    expect(explain(new ApiError(409, "stale", "This changed.", "Reload."), "x")).toBe("This changed. Reload.");
    expect(explain(new ApiError(400, "invalid", "Bad"), "x")).toBe("Bad");
    expect(explain("nope", "fallback")).toBe("fallback");
  });
  it("names a request that never reached the server, in every browser's words", () => {
    for (const m of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
      expect(explain(new TypeError(m), "x")).toBe("Could not reach Control Rod. Check your connection and try again.");
    }
    expect(explain(new TypeError("x is not a function"), "fallback")).toBe("x is not a function");
  });
});
