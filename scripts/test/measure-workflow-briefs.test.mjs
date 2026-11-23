import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BUDGETS_PATH, check, inputsRecord, measure } from "../measure-workflow-briefs.mjs";

test("the committed workflow budgets hold for every workflow and stage", async () => {
  const budgets = JSON.parse(readFileSync(BUDGETS_PATH, "utf8"));
  const rows = await measure();
  assert.equal(rows.length, 9);
  assert.deepEqual(check(budgets, rows, inputsRecord()), []);
});

test("a stage that grows past its budget, or changed inputs, fails the check", async () => {
  const budgets = JSON.parse(readFileSync(BUDGETS_PATH, "utf8"));
  const rows = await measure();
  const grown = rows.map((r) => (r.workflow === "pocock" && r.stage === "pre-check" ? { ...r, brief_tokens: r.brief_tokens + 1 } : r));
  const problems = check(budgets, grown, { ...inputsRecord(), inputs_sha256: "changed" });
  assert.ok(problems.some((p) => /pocock pre-check: brief .* > budget/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /inputs changed/.test(p)), problems.join("\n"));
});
