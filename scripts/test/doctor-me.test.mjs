// Regression test for issue #203: `pnpm cr doctor` must not print a literal ${me} placeholder.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const src = readFileSync(resolve(fileURLToPath(new URL("../cr.mjs", import.meta.url))), "utf8");

// The unfixed form: double-quoted string starting the agentChecks fallback message.
const BROKEN = '"--    agents: the daemon\'s checks could not run here; `${me} start`';

// The fixed form: template literal starting the same message (backslash-escaped inner backticks).
const FIXED = '`--    agents: the daemon\'s checks could not run here; \\`${me} start\\`';

test("agentChecks fallback message is not a plain double-quoted string with literal ${me}", () => {
  assert.equal(
    src.includes(BROKEN),
    false,
    "Found the unfixed double-quoted agentChecks message in scripts/cr.mjs — use a template literal",
  );
});

test("agentChecks fallback message is a template literal that interpolates the command name", () => {
  assert.ok(
    src.includes(FIXED),
    "Could not find the fixed template-literal agentChecks message in scripts/cr.mjs",
  );
});
