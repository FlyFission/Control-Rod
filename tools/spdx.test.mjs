// Run: node --test tools/spdx.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { expressionAllowed } from "./spdx.mjs";

const ok = new Set(["MIT", "Apache-2.0", "BSD-3-Clause", "Zlib"]);

test("plain and combined expressions", () => {
  assert.equal(expressionAllowed("MIT", ok), true);
  assert.equal(expressionAllowed("GPL-3.0-only", ok), false);
  assert.equal(expressionAllowed("(MIT AND Zlib)", ok), true);
  assert.equal(expressionAllowed("MIT OR GPL-3.0-only", ok), true);
  assert.equal(expressionAllowed("MIT AND GPL-3.0-only", ok), false);
});

test("AND binds tighter than OR, and parentheses group", () => {
  // Codex round 2's case: the outer AND with GPL must fail.
  assert.equal(expressionAllowed("(MIT AND Apache-2.0 OR BSD-3-Clause) AND GPL-3.0-only", ok), false);
  assert.equal(expressionAllowed("GPL-3.0-only AND MIT OR Apache-2.0", ok), true);
  assert.equal(expressionAllowed("GPL-3.0-only AND (MIT OR Apache-2.0)", ok), false);
  assert.equal(expressionAllowed("((MIT))", ok), true);
});

test("fails closed on anything it does not understand", () => {
  for (const e of ["", "(MIT", "MIT)", "MIT AND", "OR MIT", "MIT WITH Classpath-exception-2.0", "MIT MIT", "LicenseRef-x"]) {
    assert.equal(expressionAllowed(e, ok), false, e);
  }
});
