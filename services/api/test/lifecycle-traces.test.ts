import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type KernelOutcome, type KernelRequest, decide } from "../src/kernel.js";

/**
 * Replays the package lifecycle conformance traces (models/traces/package-lifecycle/v1)
 * through the compiled kernel this API runs (services/api/kernel). The Rust test
 * kernel/bindings/wasm/tests/lifecycle_traces.rs replays the same traces natively, so a
 * stale WebAssembly build or a drift between the model and the kernel fails one of the two.
 * Pattern PL2 in docs/patterns/plannotator.md.
 */
const DIR = new URL("../../../models/traces/package-lifecycle/v1/", import.meta.url);
const FORMAT = "controlrod-package-lifecycle-trace";

interface Step {
  request: KernelRequest;
  expect: KernelOutcome;
}
interface Trace {
  format: string;
  version: number;
  name: string;
  known_violations: { step: number; today: KernelOutcome }[];
  steps: Step[];
}

const text = (file: string) => readFileSync(new URL(file, DIR), "utf8");
const index = JSON.parse(text("index.json")) as {
  format: string;
  version: number;
  traces: { file: string; sha256: string }[];
};

describe("package lifecycle conformance traces", () => {
  it("are listed with the digests of the files on disk", () => {
    expect(index.format).toBe(FORMAT);
    expect(index.version).toBe(1);
    expect(index.traces.length).toBeGreaterThan(0);
    for (const t of index.traces) {
      expect(createHash("sha256").update(text(t.file)).digest("hex"), t.file).toBe(t.sha256);
    }
  });

  it("match the compiled kernel at every step", () => {
    const mismatches: string[] = [];
    let steps = 0;
    for (const { file } of index.traces) {
      const trace = JSON.parse(text(file)) as Trace;
      expect(trace.format).toBe(FORMAT);
      trace.steps.forEach((step, i) => {
        steps += 1;
        const want = trace.known_violations.find((v) => v.step === i)?.today ?? step.expect;
        const out = decide(step.request);
        const got = { allowed: out.allowed, reason: out.reason, next: out.next };
        if (Object.keys(out).length !== 3 || JSON.stringify(got) !== JSON.stringify(want)) {
          mismatches.push(`${file} step ${i}: kernel ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
        }
      });
    }
    expect(steps).toBeGreaterThan(0);
    expect(mismatches.slice(0, 20)).toEqual([]);
  });
});
