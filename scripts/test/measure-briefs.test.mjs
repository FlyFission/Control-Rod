import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BUDGETS_PATH, exceeded, measure } from "../measure-briefs.mjs";

const budgets = JSON.parse(readFileSync(BUDGETS_PATH, "utf8"));

test("every fixture's Light and Nuclear brief stays within its recorded budget", async () => {
  const { rows } = await measure();
  assert.equal(rows.length, budgets.briefs.length);
  assert.deepEqual(exceeded(rows, budgets), []);
});

test("budgets.json records its measured inputs and budgets equal to measurements", () => {
  assert.match(budgets.inputs_sha256, /^[0-9a-f]{64}$/);
  assert.ok(budgets.inputs.length > 0 && budgets.inputs.every((i) => /^[0-9a-f]{64}$/.test(i.sha256)));
  for (const b of budgets.briefs) {
    assert.equal(b.light.budget, b.light.tokens, b.fixture);
    assert.equal(b.nuclear.budget, b.nuclear.tokens, b.fixture);
  }
});

test("a brief one token over its budget is reported", async () => {
  const { rows } = await measure();
  const tight = structuredClone(budgets);
  tight.briefs[0].nuclear.budget = rows.find((r) => r.fixture === tight.briefs[0].fixture).nuclear_tokens - 1;
  assert.equal(exceeded(rows, tight).length, 1);
});
