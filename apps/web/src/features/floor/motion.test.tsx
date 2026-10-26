import { describe, it, expect } from "vitest";
import { effectiveMotion, submissionTransitions } from "./motion.js";
import type { FloorEntity } from "./types.js";
const entity = (sourceState: string) =>
  ({ id: "run:R1", kind: "run", sourceState }) as FloorEntity;
describe("truthful motion", () => {
  it("honors reduced motion, tab visibility and snapshot health", () => {
    expect(effectiveMotion("full", true, true, "healthy")).toBe("still");
    expect(effectiveMotion("full", false, false, "healthy")).toBe("still");
    expect(effectiveMotion("full", false, true, "stale")).toBe("still");
    expect(effectiveMotion("quiet", false, true, "healthy")).toBe("quiet");
  });
  it("only submits after a real same-run transition in a healthy baseline", () => {
    expect(
      submissionTransitions(new Map(), [entity("succeeded")], false),
    ).toEqual([]);
    expect(
      submissionTransitions(
        new Map([["run:R1", "succeeded"]]),
        [entity("succeeded")],
        true,
      ),
    ).toEqual([]);
    expect(
      submissionTransitions(
        new Map([["run:R1", "running"]]),
        [entity("succeeded")],
        true,
      ),
    ).toEqual(["run:R1"]);
    expect(
      submissionTransitions(
        new Map([["run:R1", "running"]]),
        [entity("lost")],
        true,
      ),
    ).toEqual([]);
  });
});
