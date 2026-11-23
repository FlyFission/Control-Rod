#!/usr/bin/env node
// Measures what each workflow adds to a brief, per stage, and records it as
// packs/workflows/budgets.json. Each budget is the measured count: a ceiling the stage may not grow
// past without a new measurement.
//
//   node scripts/measure-workflow-briefs.mjs            write packs/workflows/budgets.json
//   node scripts/measure-workflow-briefs.mjs --check    fail if a stage exceeds its budget or the inputs changed
//
// The sections and inputs are composed by the API's own code (services/api/src/workflow.ts, loaded
// through Node's type stripping) from the real packs/workflows. `brief_tokens` counts the workflow
// sections a BRIEF.md gains (the header line and the stage card); `input_tokens` counts the upstream
// skill files shipped under inputs/workflow/, which the agent reads but which are not inline.
// Tokens are counted with scripts/lib/token-count.mjs. The playbook adds nothing and is not listed.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { countTokens } from "./lib/token-count.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = join(REPO, "packs", "workflows");
export const BUDGETS_PATH = join(PACKS, "budgets.json");
const WORKFLOW_SRC = join(REPO, "services", "api", "src", "workflow.ts");
const COUNTER = join(REPO, "scripts", "lib", "token-count.mjs");
const SELF = fileURLToPath(import.meta.url);
const WORKFLOWS = ["superpowers", "pocock", "pocock-superpowers"];
const STAGES = ["intake", "author", "pre-check"];

const posix = (p) => relative(REPO, p).split(sep).join("/");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Every file the measurement reads: the code, and each pack's map, cards and manifest. */
function inputFiles() {
  const files = [SELF, COUNTER, WORKFLOW_SRC];
  for (const w of WORKFLOWS) {
    files.push(join(PACKS, w, "workflow.json"));
    for (const card of readdirSync(join(PACKS, w, "stages")).sort()) files.push(join(PACKS, w, "stages", card));
    if (w !== "pocock-superpowers") files.push(join(PACKS, w, "manifest.json"));
  }
  return files;
}

export function inputsRecord() {
  const inputs = inputFiles().map((p) => ({ path: posix(p), sha256: sha256(readFileSync(p)) }));
  const inputs_sha256 = sha256(inputs.map((i) => `${i.path}\0${i.sha256}\n`).join(""));
  return { inputs, inputs_sha256 };
}

/** Composes and counts every workflow's sections and inputs for every stage. */
export async function measure() {
  const wf = await import(pathToFileURL(WORKFLOW_SRC).href);
  const packs = wf.loadWorkflowPacks(PACKS);
  const rows = [];
  for (const workflow of WORKFLOWS) {
    for (const stage of STAGES) {
      const { sections, inputs } = wf.workflowBriefSections(packs, workflow, stage);
      const text = inputs.map((i) => Buffer.from(i.content_base64, "base64").toString("utf8")).join("\n");
      rows.push({
        workflow,
        stage,
        brief_tokens: countTokens(sections.join("\n")),
        input_files: inputs.length,
        input_tokens: countTokens(text),
      });
    }
  }
  return rows;
}

export function check(budgets, rows, record) {
  const problems = [];
  if (budgets.inputs_sha256 !== record.inputs_sha256) problems.push("inputs changed since the budgets were measured; run node scripts/measure-workflow-briefs.mjs and review the diff");
  for (const r of rows) {
    const b = budgets.stages?.find((x) => x.workflow === r.workflow && x.stage === r.stage);
    if (!b) problems.push(`${r.workflow} ${r.stage}: no budget`);
    else {
      if (r.brief_tokens > b.brief_tokens) problems.push(`${r.workflow} ${r.stage}: brief ${r.brief_tokens} tokens > budget ${b.brief_tokens}`);
      if (r.input_tokens > b.input_tokens) problems.push(`${r.workflow} ${r.stage}: inputs ${r.input_tokens} tokens > budget ${b.input_tokens}`);
    }
  }
  return problems;
}

async function main() {
  const rows = await measure();
  const record = inputsRecord();
  if (process.argv.includes("--check")) {
    const problems = check(JSON.parse(readFileSync(BUDGETS_PATH, "utf8")), rows, record);
    if (problems.length) throw new Error(problems.join("\n"));
    console.log(`workflow budgets hold (${rows.length} stages)`);
    return;
  }
  const out = {
    note: "Measured by scripts/measure-workflow-briefs.mjs. brief_tokens: what the workflow adds inline to BRIEF.md; input_tokens: the upstream skills shipped under inputs/workflow/. Each budget is the measured count. Do not edit by hand.",
    counter: "scripts/lib/token-count.mjs",
    ...record,
    stages: rows,
  };
  writeFileSync(BUDGETS_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${posix(BUDGETS_PATH)} (${rows.length} stages)`);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  main().catch((e) => {
    console.error(`measure-workflow-briefs: ${e.message}`);
    process.exitCode = 1;
  });
}
