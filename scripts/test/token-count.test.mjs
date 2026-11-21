import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { countTokens } from "../lib/token-count.mjs";
import { FIXTURE, PYTHON, SAMPLES, pythonCounts } from "./record-token-counts.mjs";

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
const NGCE = process.env.NGCE_DIR ?? "/home/claude/ngce";
const live = existsSync(join(NGCE, "nuclear_grade", "tokens.py"));

test("fixture was recorded from the current sample list", () => {
  assert.deepEqual(
    fixture.cases.map((c) => c.text),
    SAMPLES,
  );
});

test("countTokens matches the counts NGCE's Python count_tokens recorded", () => {
  for (const { text, tokens } of fixture.cases) {
    assert.equal(countTokens(text), tokens, JSON.stringify(text));
  }
});

test("countTokens matches NGCE's count_tokens run live", { skip: !live && `no NGCE checkout at ${NGCE}` }, () => {
  const expected = pythonCounts(NGCE, SAMPLES);
  SAMPLES.forEach((text, i) => assert.equal(countTokens(text), expected[i], JSON.stringify(text)));
});

// Every code point Python's Unicode database assigns, alone, repeated, and
// inside letter and digit runs. Code points unassigned in Python's database
// are left out: newer Unicode in Node may classify them, Python cannot.
test(
  "countTokens matches NGCE's count_tokens on every assigned code point",
  { skip: (!live && `no NGCE checkout at ${NGCE}`) || (!process.env.NGCE_EXHAUSTIVE && "set NGCE_EXHAUSTIVE=1") },
  () => {
    const script = `${PYTHON.replace(/samples = json.*\n.*\n$/s, "")}
import unicodedata
rows = []
for cp in range(sys.maxunicode + 1):
    c = chr(cp)
    if unicodedata.category(c) in ("Cn", "Cs"):
        continue
    rows.append("%d %d %d %d %d" % (cp, module.count_tokens(c), module.count_tokens(c * 5),
        module.count_tokens("ab" + c + "cd"), module.count_tokens("7" + c + "x")))
sys.stdout.write("\\n".join(rows))
`;
    const out = execFileSync("python3", ["-I", "-c", script, join(NGCE, "nuclear_grade", "tokens.py")], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
    });
    const mismatches = [];
    for (const row of out.split("\n")) {
      const [cp, ...want] = row.split(" ").map(Number);
      const c = String.fromCodePoint(cp);
      const got = [countTokens(c), countTokens(c.repeat(5)), countTokens(`ab${c}cd`), countTokens(`7${c}x`)];
      if (got.join() !== want.join()) mismatches.push(cp.toString(16));
    }
    assert.deepEqual(mismatches, []);
  },
);
