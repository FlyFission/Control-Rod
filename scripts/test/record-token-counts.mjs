#!/usr/bin/env node
// Records the expected token counts for scripts/test/token-count.test.mjs by
// running NGCE's own count_tokens under `python3 -I`. The fixture keeps the
// inputs, the outputs, the NGCE commit, the digest of tokens.py and the Python
// version, so the numbers are never typed by hand.
//
//   node scripts/test/record-token-counts.mjs [--from <ngce checkout>]

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCommit } from "../generate-nuclear-pack.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE = join(HERE, "fixtures", "token-counts.json");

export const SAMPLES = [
  "",
  "hello world",
  "Every claim maps to evidence, a gap, or an explicit non-claim.",
  "version 0.7.0 shipped on 2026-11-21 with 33 skills",
  "snake_case_name and __dunder__ and a_b",
  "`ng validate --strict-custody` -> OK: .nuclear/changes/x",
  "| # | Skill | What it carries |\n|---|---|---|\n| 1 | [`questioning-attitude`](skills/questioning-attitude/SKILL.md) | x |",
  "line one\r\nline two\rline three\n",
  "naïve café façade Ünïcödé",
  "Ελληνικά кириллица 日本語のテキスト 한국어",
  "x² + y³ = z¹, ① ② ③, H₂O, ⁴⁵⁶",
  "١٢٣ ٤٥٦ Arabic-Indic digits and ０１２ fullwidth",
  "é combining acute, emoji 👍🏽 and 🚀🚀🚀",
  "tabs\tand nbsp em-space　ideographic\u001cfile-sep",
  "Ⅻ roman numeral letters ⅰⅱⅲ and ½ ¾",
  "--- \n name: x\ndescription: \"quoted\"\n---\n",
];

export const PYTHON = `
import importlib.util, json, sys
sys.dont_write_bytecode = True  # never write into the NGCE checkout
path = sys.argv[1]
spec = importlib.util.spec_from_file_location("ngce_tokens", path)
module = importlib.util.module_from_spec(spec)
sys.modules["ngce_tokens"] = module
spec.loader.exec_module(module)
samples = json.loads(sys.stdin.read())
print(json.dumps([module.count_tokens(s) for s in samples]))
`;

export function pythonCounts(from, samples) {
  const tokensPy = join(from, "nuclear_grade", "tokens.py");
  const out = execFileSync("python3", ["-I", "-c", PYTHON, tokensPy], {
    input: JSON.stringify(samples),
    encoding: "utf8",
  });
  return JSON.parse(out);
}


if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--from");
  const from = resolve(i >= 0 ? process.argv[i + 1] : "/home/claude/ngce");
  const tokensPy = join(from, "nuclear_grade", "tokens.py");
  const counts = pythonCounts(from, SAMPLES);
  const fixture = {
    recorded_by: "scripts/test/record-token-counts.mjs",
    upstream: "https://github.com/FlyFission/nuclear-grade-context-engineering",
    commit: resolveCommit(from),
    tokens_py: `sha256:${createHash("sha256").update(readFileSync(tokensPy)).digest("hex")}`,
    python: execFileSync("python3", ["-I", "-c", "import sys, unicodedata; print(sys.version.split()[0], unicodedata.unidata_version)"], { encoding: "utf8" }).trim(),
    cases: SAMPLES.map((text, n) => ({ text, tokens: counts[n] })),
  };
  writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`wrote ${FIXTURE} (${SAMPLES.length} cases)`);
}
