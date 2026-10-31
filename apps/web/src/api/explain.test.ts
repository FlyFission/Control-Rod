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
});
