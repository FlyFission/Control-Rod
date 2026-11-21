#!/usr/bin/env node
// Measures BRIEF.md token counts under the Light and Nuclear context profiles and records them,
// with their inputs, as packs/nuclear-grade/budgets.json. Each budget is the measured count: a
// ceiling the brief may not grow past without a new measurement.
//
//   node scripts/measure-briefs.mjs            write packs/nuclear-grade/budgets.json
//   node scripts/measure-briefs.mjs --check    fail if a brief exceeds its budget or the inputs changed
//
// Briefs are composed with the API's own pure code (services/api/src/brief.ts and
// context-profile.ts, loaded through Node's type stripping) from the real packs/nuclear-grade,
// for the fixture packages in scripts/test/fixtures/brief-packages.json. Tokens are counted with
// scripts/lib/token-count.mjs. Light is the brief with no Nuclear sections: what every one of
// these packages carried before context profiles existed (Safety and Material grade work can no
// longer run Light; their Light row is that pre-profile brief).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { countTokens } from "./lib/token-count.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = join(REPO, "packs", "nuclear-grade");
export const BUDGETS_PATH = join(PACK, "budgets.json");
const FIXTURES = join(REPO, "scripts", "test", "fixtures", "brief-packages.json");
const ROLE = join(REPO, "packs", "general", "roles", "general-author.md");
const BRIEF_SRC = join(REPO, "services", "api", "src", "brief.ts");
const PROFILE_SRC = join(REPO, "services", "api", "src", "context-profile.ts");
const COUNTER = join(REPO, "scripts", "lib", "token-count.mjs");
const SELF = fileURLToPath(import.meta.url);

const posix = (p) => relative(REPO, p).split(sep).join("/");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Every file the measurement reads. The pack manifest carries the digest of every pack file. */
function inputFiles() {
  return [SELF, COUNTER, BRIEF_SRC, PROFILE_SRC, ROLE, FIXTURES, join(PACK, "manifest.json")];
}

export function inputsRecord() {
  const inputs = inputFiles().map((p) => ({ path: posix(p), sha256: sha256(readFileSync(p)) }));
  const inputs_sha256 = sha256(inputs.map((i) => `${i.path}\0${i.sha256}\n`).join(""));
  return { inputs, inputs_sha256 };
}

/** Composes and counts every fixture's Light and Nuclear BRIEF.md. */
export async function measure() {
  const brief = await import(pathToFileURL(BRIEF_SRC).href);
  const profile = await import(pathToFileURL(PROFILE_SRC).href);
  const pack = profile.loadNuclearPack(PACK);
  if (!pack) throw new Error(`no nuclear-grade pack at ${posix(PACK)}`);
  const roleText = readFileSync(ROLE, "utf8");
  const { packages } = JSON.parse(readFileSync(FIXTURES, "utf8"));
  const rows = [];
  for (const f of packages) {
    const pkg = f.package;
    const header = brief.briefHeader({ role: "author", package_id: pkg.id, package_revision: 0, round: 1 });
    const parts = { header, roleText, objective: pkg.objective, extra: [] };
    const light = brief.composeBrief(parts);
    // Nuclear: the card set to Nuclear (Safety and Material lock it regardless).
    const resolved = profile.resolveContextProfile({ ...pkg, context_profile: "nuclear" }, null);
    const clusters = profile.selectClusters({
      tools: f.tools,
      hosts: [],
      deliverables: pkg.deliverables,
      rigorMode: pkg.rigor_mode,
      grade: pkg.grade,
      requested: pkg.nuclear_clusters,
    });
    const { sections } = profile.nuclearBriefSections(pack, clusters, "author", pkg.rigor_mode, resolved.reason);
    const nuclear = brief.composeBrief({ ...parts, nuclear: sections });
    rows.push({
      fixture: f.fixture,
      grade: pkg.grade,
      rigor_mode: pkg.rigor_mode,
      tools: f.tools,
      locked: profile.resolveContextProfile(pkg, null).locked,
      clusters,
      light_tokens: countTokens(light),
      nuclear_tokens: countTokens(nuclear),
    });
  }
  return { pack_commit: pack.commit, rows };
}

export function exceeded(rows, budgets) {
  const problems = [];
  for (const r of rows) {
    const b = budgets.briefs.find((x) => x.fixture === r.fixture);
    if (!b) {
      problems.push(`${r.fixture}: no budget recorded`);
      continue;
    }
    if (r.light_tokens > b.light.budget) problems.push(`${r.fixture}: Light brief ${r.light_tokens} tokens > budget ${b.light.budget}`);
    if (r.nuclear_tokens > b.nuclear.budget) problems.push(`${r.fixture}: Nuclear brief ${r.nuclear_tokens} tokens > budget ${b.nuclear.budget}`);
  }
  return problems;
}

async function main(argv) {
  const { pack_commit, rows } = await measure();
  const record = inputsRecord();
  if (argv.includes("--check")) {
    const budgets = JSON.parse(readFileSync(BUDGETS_PATH, "utf8"));
    const problems = exceeded(rows, budgets);
    if (budgets.inputs_sha256 !== record.inputs_sha256)
      problems.push(`inputs changed since the last measurement (${budgets.inputs_sha256} != ${record.inputs_sha256}); re-run node scripts/measure-briefs.mjs`);
    if (problems.length) {
      console.error(`brief budget check failed (${problems.length}):`);
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log(`brief budget check passed: ${rows.length} fixtures`);
    return;
  }
  const out = {
    generated_by: "scripts/measure-briefs.mjs",
    counter: "scripts/lib/token-count.mjs",
    measured: "BRIEF.md of an author run, round 1, composed by services/api/src/brief.ts and context-profile.ts",
    budget_rule: "budget = measured tokens (a ceiling, no margin)",
    pack_commit,
    ...record,
    briefs: rows.map((r) => ({
      fixture: r.fixture,
      grade: r.grade,
      rigor_mode: r.rigor_mode,
      tools: r.tools,
      locked_nuclear: r.locked,
      clusters: r.clusters,
      light: { tokens: r.light_tokens, budget: r.light_tokens },
      nuclear: { tokens: r.nuclear_tokens, budget: r.nuclear_tokens },
    })),
  };
  writeFileSync(BUDGETS_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${posix(BUDGETS_PATH)}`);
  for (const r of rows) console.log(`  ${r.fixture}: Light ${r.light_tokens}, Nuclear ${r.nuclear_tokens} (${r.clusters.join(", ") || "no clusters"})`);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main(process.argv.slice(2));
