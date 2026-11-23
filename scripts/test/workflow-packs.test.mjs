import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(dirname(fileURLToPath(import.meta.url)));
const generator = "generate-workflow-packs.mjs";
const synchronizer = "sync-workflow-packs.mjs";
const pack = "pocock";

function run(command, args, status = 0) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, status, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

function put(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "workflow-packs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const out = join(root, "packs", "workflows");
  const from = join(root, "upstream");
  const localPack = join(out, pack);
  const pinsPath = join(out, "pins.json");
  mkdirSync(from);
  const git = (...args) => run("git", ["-C", from, ...args]).trim();
  git("init", "-q");
  const commit = () => {
    git("add", ".");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
      "-c", "commit.gpgSign=false", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  const skill = (name, contents, group = "engineering") =>
    put(join(from, "skills", group, name, "SKILL.md"), contents);
  put(join(from, "LICENSE"), "MIT fixture\r\n");
  skill("keep", "before\r\ncommon\r\n");
  put(join(from, "skills/engineering/keep/nested/notes.md"), "notes\r\n");
  put(join(from, "skills/engineering/keep/ignored.yaml"), "ignored\n");
  skill("excluded", "excluded", "misc");
  skill("old-name", "---\nname: shared-name\n---\nold body\n");
  skill("old-body", "---\nname: first\n---\na\nb\nc\n");
  skill("gone", "removed only\n");
  const head = commit();
  const pins = { [pack]: {
    upstream: "https://github.com/example/fixture", commit: head, license: "MIT",
    sources: ["skills/engineering", "skills/productivity"],
  } };
  mkdirSync(join(from, "skills/productivity"));
  put(pinsPath, JSON.stringify(pins));
  mkdirSync(join(root, "scripts"));
  for (const script of [generator, synchronizer]) cpSync(join(scripts, script), join(root, "scripts", script));
  const cli = (script, args, status) => run(process.execPath, [join(root, "scripts", script), ...args], status);
  const args = ["--pack", pack, "--from", from];
  return { root, out, from, localPack, pins, pinsPath, head, commit, skill, cli, args };
}

test("generation normalizes Markdown and license bytes and preserves controller files", (t) => {
  const { root, localPack, cli, args, head } = setup(t);
  const controller = {
    "workflow.json": '{"stages":{"intake":{"card":"stages/intake.md","skills":[]},"author":{"card":"stages/author.md","skills":["pocock:keep"]},"pre-check":{"card":"stages/pre-check.md","skills":[]}}}\n',
    "stages/intake.md": "Intake card\n",
    "stages/author.md": "Author card\n",
    "stages/pre-check.md": "Pre-check card\n",
    "budgets.json": "{}\n",
  };
  for (const [path, contents] of Object.entries(controller)) put(join(localPack, path), contents);
  put(join(localPack, "reference/stale/legacy.md"), "stale");
  cli(generator, args);
  const manifest = JSON.parse(readFileSync(join(localPack, "manifest.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest), ["workflow", "upstream", "commit", "license", "generated_by", "skills", "excluded", "files"]);
  assert.equal(manifest.commit, head);
  assert.deepEqual(manifest.skills.keep, ["reference/keep/SKILL.md", "reference/keep/nested/notes.md"]);
  assert.equal(readFileSync(join(localPack, manifest.skills.keep[0]), "utf8"), "before\ncommon\n");
  assert.equal(readFileSync(join(root, "third_party/licenses/example__fixture/LICENSE"), "utf8"), "MIT fixture\n");
  assert.ok(!existsSync(join(localPack, "reference/keep/ignored.yaml")));
  assert.ok(!existsSync(join(localPack, "reference/stale")));
  assert.ok(!Object.hasOwn(manifest.skills, "excluded"));
  for (const [path, contents] of Object.entries(controller)) {
    assert.equal(readFileSync(join(localPack, path), "utf8"), contents);
  }
  cli(generator, ["--check"]);
});

test("generation rejects pin mismatch, duplicate skills and absent SKILL.md", (t) => {
  const { from, cli, args, head, skill, commit, pins, pinsPath } = setup(t);
  skill("keep", "duplicate", "productivity");
  const next = commit();
  const mismatch = cli(generator, args, 1);
  assert.ok(mismatch.includes(head) && mismatch.includes(next), mismatch);
  pins[pack].commit = next;
  put(pinsPath, JSON.stringify(pins));
  assert.match(cli(generator, args, 1), /duplicate skill.*keep/);
  rmSync(join(from, "skills/productivity/keep/SKILL.md"));
  put(join(from, "skills/productivity/keep/readme.md"), "no skill");
  pins[pack].commit = commit();
  put(pinsPath, JSON.stringify(pins));
  assert.match(cli(generator, args, 1), /duplicate skill.*keep/);
  rmSync(join(from, "skills/engineering/keep"), { recursive: true });
  pins[pack].commit = commit();
  put(pinsPath, JSON.stringify(pins));
  assert.match(cli(generator, args, 1), /keep.*SKILL\.md/);
});

test("check aggregates manifest, reference and stage problems", (t) => {
  const { out, localPack, cli, args, pins, pinsPath } = setup(t);
  cli(generator, args);
  put(join(localPack, "reference/keep/SKILL.md"), "hand edit");
  put(join(localPack, "reference/extra.txt"), "extra");
  rmSync(join(localPack, "reference/gone/SKILL.md"));
  rmSync(join(localPack, "LICENSE"));
  pins[pack].commit = "wrong";
  put(pinsPath, JSON.stringify(pins));
  put(join(out, "hybrid/workflow.json"), JSON.stringify({ hybrid_of: [pack], stages: {
    author: { card: "stages/missing.md", skills: ["pocock:missing"] },
    extra: { card: "stages/empty.md", skills: [] },
  } }));
  put(join(out, "hybrid/stages/empty.md"), " \n");
  const problems = cli(generator, ["--check", "--out", out], 1);
  for (const pattern of [
    /keep\/SKILL\.md: digest/, /extra\.txt: not in manifest/, /gone\/SKILL\.md: missing/,
    /LICENSE: missing/, /commit.*wrong/, /pocock:missing/, /missing\.md: missing/,
    /extra.*unknown stage/, /empty\.md: empty/,
  ]) assert.match(problems, pattern);
});

test("generation ships the pinned commit, never local edits or untracked files in the checkout", (t) => {
  const { from, localPack, cli, args } = setup(t);
  // The checkout's HEAD still matches the pin, but its working tree has changed since.
  put(join(from, "skills/engineering/keep/SKILL.md"), "an uncommitted instruction\n");
  put(join(from, "skills/engineering/keep/untracked.md"), "untracked\n");
  put(join(from, "skills/engineering/brand-new/SKILL.md"), "untracked skill\n");
  put(join(from, "LICENSE"), "edited licence\n");
  cli(generator, args);
  assert.equal(readFileSync(join(localPack, "reference/keep/SKILL.md"), "utf8"), "before\ncommon\n");
  assert.equal(readFileSync(join(localPack, "LICENSE"), "utf8"), "MIT fixture\n");
  assert.equal(existsSync(join(localPack, "reference/keep/untracked.md")), false);
  assert.equal(existsSync(join(localPack, "reference/brand-new")), false);
  const manifest = JSON.parse(readFileSync(join(localPack, "manifest.json"), "utf8"));
  assert.equal(Object.hasOwn(manifest.skills, "brand-new"), false);
});

test("generation refuses a symlink committed under a skill", (t) => {
  const { from, cli, args, pins, pinsPath, commit } = setup(t);
  run("ln", ["-s", "../../../LICENSE", join(from, "skills/engineering/keep/link.md")]);
  pins[pack].commit = commit();
  put(pinsPath, JSON.stringify(pins));
  assert.match(cli(generator, args, 1), /link\.md: not a regular file .*mode 120000/);
});

test("check refuses a skill list without digests and a pinned pack without a manifest", (t) => {
  const { out, localPack, cli, args, pins, pinsPath } = setup(t);
  cli(generator, args);
  const manifestPath = join(localPack, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  // A file named in a skill's list but carrying no digest, and one outside the skill's folder.
  manifest.skills.keep.push("reference/keep/unlisted.md", "reference/gone/SKILL.md");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  pins.other = { ...pins[pack] };
  put(pinsPath, JSON.stringify(pins));
  const problems = cli(generator, ["--check", "--out", out], 1);
  assert.match(problems, /skill keep lists reference\/keep\/unlisted\.md, which has no digest/);
  assert.match(problems, /skill keep lists reference\/gone\/SKILL\.md, which has no digest in its skill folder/);
  assert.match(problems, /other: pinned but has no manifest\.json/);
});

test("sync reports additions, removals, both rename rules, line counts and unresolved stages", (t) => {
  const { root, out, from, localPack, cli, args, head, commit, skill, pinsPath } = setup(t);
  // A real pack always carries a complete map; this one names a skill that survives the sync.
  put(join(localPack, "workflow.json"), '{"stages":{"intake":{"card":"stages/card.md","skills":[]},"author":{"card":"stages/card.md","skills":["pocock:keep"]},"pre-check":{"card":"stages/card.md","skills":[]}}}');
  put(join(localPack, "stages/card.md"), "Card\n");
  cli(generator, args);
  for (const name of ["old-name", "old-body", "gone"]) {
    rmSync(join(from, "skills/engineering", name), { recursive: true });
  }
  skill("new-name", "---\nname: shared-name\n---\nnew body\n");
  skill("new-body", "---\nname: second\n---\na\nb\nc\nextra\n");
  skill("added", "new only\n");
  skill("keep", "after\ncommon\nadditional\n");
  const next = commit();
  put(join(out, "hybrid/workflow.json"), '{"hybrid_of":["pocock"],"stages":{"intake":{"card":"stages/author.md","skills":[]},"author":{"card":"stages/author.md","skills":["pocock:gone"]},"pre-check":{"card":"stages/author.md","skills":[]}}}');
  put(join(out, "hybrid/stages/author.md"), "Card");
  const reportPath = join(root, "sync.md");
  cli(synchronizer, [...args, "--report", reportPath], 2);
  const report = readFileSync(reportPath, "utf8");
  for (const pattern of [
    new RegExp(head), new RegExp(next), /Added[\s\S]*?\x60added\x60/, /Removed[\s\S]*?\x60gone\x60/,
    /old-name.*new-name.*frontmatter/, /old-body.*new-body.*60%/,
    /keep[\s\S]*?SKILL\.md.*\+2.*-1/, /hybrid.*pocock:gone/, /person must update.*workflow\.json/,
  ]) assert.match(report, pattern);
  assert.equal(JSON.parse(readFileSync(pinsPath, "utf8"))[pack].commit, next);
  rmSync(join(out, "hybrid"), { recursive: true });
  assert.match(cli(synchronizer, args), /Stage skills that no longer resolve\n\nNone/);
  cli(generator, ["--check"]);
});

test("excluded skills are not shipped, are recorded with their reason, and must match pins.json", (t) => {
  const { out, localPack, cli, args, pins, pinsPath } = setup(t);
  pins[pack].exclude = { "old-body": "third-party material under another licence" };
  put(pinsPath, JSON.stringify(pins));
  cli(generator, args);
  const manifest = JSON.parse(readFileSync(join(localPack, "manifest.json"), "utf8"));
  assert.equal(existsSync(join(localPack, "reference/old-body")), false);
  assert.equal(Object.hasOwn(manifest.skills, "old-body"), false);
  assert.deepEqual(manifest.excluded, { "old-body": "third-party material under another licence" });
  pins[pack].exclude = {};
  put(pinsPath, JSON.stringify(pins));
  assert.match(cli(generator, ["--check", "--out", out], 1), /manifest exclusions \[old-body\] differ from pins\.json/);
  pins[pack].exclude = { keep: " " };
  put(pinsPath, JSON.stringify(pins));
  assert.match(cli(generator, args, 1), /exclusion of keep needs a reason/);
});

test("check requires a complete map and a current lock.json", (t) => {
  const { out, localPack, cli, args } = setup(t);
  cli(generator, args);
  // No map at all for a generated pack.
  assert.match(cli(generator, ["--check", "--out", out], 1), /pocock: no workflow\.json/);
  put(join(localPack, "workflow.json"), '{"stages":{"author":{"card":"stages/author.md","skills":["pocock:keep"]}}}');
  put(join(localPack, "stages/author.md"), "Author card\n");
  cli(generator, ["--lock", "--out", out]);
  const partial = cli(generator, ["--check", "--out", out], 1);
  assert.match(partial, /no intake stage/);
  assert.match(partial, /no pre-check stage/);
  // A card edited after locking is reported until --lock is run again.
  put(join(localPack, "stages/author.md"), "Edited card\n");
  assert.match(cli(generator, ["--check", "--out", out], 1), /lock\.json: pocock\/stages\/author\.md changed; run --lock/);
});

test("committed workflow packs pass --check", () => {
  run(process.execPath, [join(scripts, generator), "--check"]);
});
