import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadValidator, schemaDir } from "../src/schemas.js";

/**
 * The intake brief and the WorkPackage contract must agree. A first macOS install (2026-11-23) lost
 * a card because the brief never asked for `title`, `design_inputs[].use` or `assumptions[].basis`,
 * so every draft the agent wrote was refused. These tests keep the two from drifting again.
 */
const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const brief = readFileSync(join(repo, "packs", "general", "roles", "intake.md"), "utf8");
const schema = (name: string) => JSON.parse(readFileSync(join(schemaDir, `${name}.json`), "utf8")) as { required?: string[] };

/** Fields finishIntake stamps over whatever the agent wrote, so the brief need not name them correctly. */
const STAMPED = new Set(["schema_version"]);

describe("intake brief", () => {
  for (const name of ["WorkPackage", "DesignInput", "Assumption", "Deliverable"]) {
    it(`names every field ${name} requires`, () => {
      const missing = (schema(name).required ?? []).filter((f) => !STAMPED.has(f) && !new RegExp("`" + f + "[`:]").test(brief));
      expect(missing, `the intake brief does not mention ${missing.join(", ")}`).toEqual([]);
    });
  }

  it("a draft written to the brief validates as a WorkPackage once intake stamps it", () => {
    // Written field by field from the brief, as an agent would, then stamped the way finishIntake does.
    const draft = {
      id: "BUG-FIX",
      title: "Fix the reported bug",
      revision: 0,
      status: "draft",
      mode: "software",
      project: "general",
      rigor_mode: "standard",
      data_lane: "internal",
      objective: "Find and fix the bug the owner reported.",
      deliverables: [{ id: "D1", type: "code-change", format: ["diff"] }],
      design_inputs: [{ doc: "request", revision: "0", use: "The owner's description of the bug." }],
      agent_assignment: [{ role: "software-author", agent_baseline: "author", baseline_revision: 0 }],
      acceptance_criteria: ["A regression test fails before the fix and passes after it."],
      verification: {
        method: "agent-pre-check",
        verifier: "checker",
        verifier_receives: ["deliverables", "acceptance criteria", "design inputs"],
        required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
      },
      assumptions: [{ id: "A1", statement: "The bug reproduces on main.", basis: "The request names main.", requires_confirmation: true, owner: "owner" }],
    };
    const ajv = loadValidator();
    const validate = ajv.getSchema("WorkPackage.json")!;
    const ok = validate({ ...draft, schema_version: "0.1.0", revision: 0, status: "draft" });
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });
});
