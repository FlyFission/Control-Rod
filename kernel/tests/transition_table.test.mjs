// The WebAssembly build of the kernel (services/api/kernel/, the one the control plane loads)
// against the table the Rust kernel wrote (transition-table.tsv, see transition_table.rs). Every
// row's request is built the way the table's header describes, sent through decide_json, and
// must come back with the same decision, reason and next state.
//   node --test kernel/tests/transition_table.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { decide_json } = require("../../services/api/kernel/controlrod_kernel.js");
const table = readFileSync(new URL("./transition-table.tsv", import.meta.url), "utf8");

function rows() {
  const lines = table.split("\n").filter((l) => l && !l.startsWith("#"));
  const columns = lines.shift().split("\t");
  return lines.map((l) => Object.fromEntries(l.split("\t").map((v, i) => [columns[i], v])));
}

function request(row) {
  const signed = row.signature === "passkey";
  return {
    status: row.status,
    action: row.action,
    actor_kind: row.actor,
    actor_id: "actor-1",
    author_baseline: "author-1",
    checker_baseline: "checker-1",
    author_runtime: { provider: "claude", model: "default" },
    checker_runtime: { provider: "codex", model: "default" },
    owner_override_verified: false,
    pre_check: "pass",
    assertion_verified: signed,
    digest_matches: signed,
    policy_signed: row.signature === "policy",
    reason_given: true,
    preparation: null,
  };
}

test("the table covers 6 states, 10 actions, 3 actor kinds and 3 signatures", () => {
  const all = rows();
  assert.equal(all.length, 6 * 10 * 3 * 3);
  const keys = new Set(all.map((r) => `${r.status} ${r.action} ${r.actor} ${r.signature}`));
  assert.equal(keys.size, all.length, "each combination appears once");
});

test("the WebAssembly kernel decides every row as the Rust kernel did", () => {
  const differ = [];
  for (const row of rows()) {
    const out = JSON.parse(decide_json(JSON.stringify(request(row))));
    const got = `${out.allowed ? "yes" : "no"} ${out.reason} ${out.next ?? "-"}`;
    const want = `${row.allowed} ${row.reason} ${row.next}`;
    if (got !== want) differ.push(`${row.status} ${row.action} ${row.actor} ${row.signature}: want ${want}, got ${got}`);
  }
  assert.deepEqual(differ, []);
});

test("a request the table builder would not send is refused, never guessed", () => {
  const out = JSON.parse(decide_json(JSON.stringify({ ...request(rows()[0]), surprise: true })));
  assert.equal(out.allowed, false);
});
