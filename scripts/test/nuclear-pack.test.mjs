import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { check, generate } from "../generate-nuclear-pack.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK = join(REPO, "packs", "nuclear-grade");
const NGCE = process.env.NGCE_DIR ?? "/home/claude/ngce";
const live = existsSync(join(NGCE, "CORE.md"));

function copyPack() {
  const dir = mkdtempSync(join(tmpdir(), "nuclear-pack-"));
  cpSync(PACK, dir, { recursive: true });
  return dir;
}

test("committed pack matches its manifest (--check)", () => {
  assert.deepEqual(check({ out: PACK }), []);
});

test("manifest names the upstream, license and every card", () => {
  const manifest = JSON.parse(readFileSync(join(PACK, "manifest.json"), "utf8"));
  assert.equal(manifest.upstream, "https://github.com/FlyFission/nuclear-grade-context-engineering");
  assert.equal(manifest.license, "MIT");
  assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  assert.equal(manifest.core.skills.length, 7);
  assert.deepEqual(Object.keys(manifest.clusters).sort(), [
    "agent-authority",
    "claims-discipline",
    "configuration-management",
    "hygiene",
    "incident-deficiency",
    "review-panel",
  ]);
  for (const mode of ["quick", "standard", "cm"]) assert.ok(manifest.templates[mode].length > 0);
});

test("check catches a hand edit, an added file and a removed file", () => {
  const dir = copyPack();
  try {
    appendFileSync(join(dir, "core.md"), "\nhand edit\n");
    writeFileSync(join(dir, "extra.md"), "x\n");
    rmSync(join(dir, "templates", "quick", "risk.md"));
    const problems = check({ out: dir });
    assert.ok(problems.some((p) => p.startsWith("core.md: digest")), problems.join("\n"));
    assert.ok(problems.some((p) => p.startsWith("core.md: does not match")), problems.join("\n"));
    assert.ok(problems.includes("extra.md: not in manifest"), problems.join("\n"));
    assert.ok(problems.includes("templates/quick/risk.md: missing"), problems.join("\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("check catches a card edited together with its manifest digest", () => {
  const dir = copyPack();
  try {
    const card = join(dir, "clusters", "hygiene.md");
    appendFileSync(card, "\nhand edit\n");
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    manifest.files["clusters/hygiene.md"] = `sha256:${createHash("sha256").update(readFileSync(card)).digest("hex")}`;
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    const problems = check({ out: dir });
    assert.deepEqual(problems, ["clusters/hygiene.md: does not match what its reference skills compile to"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("regenerating from the NGCE checkout reproduces the committed pack", { skip: !live && `no NGCE checkout at ${NGCE}` }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), "nuclear-pack-gen-"));
  try {
    generate({ from: NGCE, out: dir });
    const fresh = readFileSync(join(dir, "manifest.json"), "utf8");
    const committed = readFileSync(join(PACK, "manifest.json"), "utf8");
    if (JSON.parse(fresh).commit !== JSON.parse(committed).commit) {
      t.skip("a different NGCE commit is checked out");
      return;
    }
    assert.equal(fresh, committed);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
