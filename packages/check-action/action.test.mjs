import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const requireFromApi = createRequire(new URL("../../services/api/package.json", import.meta.url));
const YAML = requireFromApi("yaml");

const ACTION_DIR = dirname(fileURLToPath(import.meta.url));
const ACTION_YML = resolve(ACTION_DIR, "action.yml");

function loadActionSteps() {
  const doc = YAML.parse(readFileSync(ACTION_YML, "utf8"));
  const byId = new Map();
  const byName = new Map();
  for (const step of doc.runs.steps) {
    if (step.id) byId.set(step.id, step);
    if (step.name) byName.set(step.name, step);
  }
  return { byId, byName };
}

function parseOutputs(outputFile) {
  const map = {};
  for (const line of readFileSync(outputFile, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    const idx = line.indexOf("=");
    if (idx >= 0) map[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return map;
}

function runBash(script, env) {
  try {
    const stdout = execFileSync("bash", ["-c", script], {
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString?.("utf8") ?? "",
      stderr: err.stderr?.toString?.("utf8") ?? "",
    };
  }
}

function makeFakeControlrod(binPath, modeFile) {
  const script = `#!/usr/bin/env bash
set -euo pipefail
VERDICT_OUT=""
RECEIPT_OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verdict-out) VERDICT_OUT="$2"; shift 2 ;;
    --receipt-out) RECEIPT_OUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done
MODE="$(cat "${modeFile}")"
case "$MODE" in
  pass)
    printf '{"outcome":"pass","findings":[],"error":""}\\n' > "$VERDICT_OUT"
    printf '<!-- first-invocation-receipt -->\\nPASS\\n' > "$RECEIPT_OUT"
    exit 0
    ;;
  refuse)
    # Simulate exit 2 refusal before writing verdict/receipt files.
    exit 2
    ;;
  timeout-error)
    printf '{"outcome":"inconclusive","findings":[],"error":"checker timed out after 10m"}\\n' > "$VERDICT_OUT"
    printf 'TIMEOUT\\n' > "$RECEIPT_OUT"
    exit 1
    ;;
  genuine-inconclusive)
    printf '{"outcome":"inconclusive","findings":[],"error":""}\\n' > "$VERDICT_OUT"
    printf 'INCONCLUSIVE\\n' > "$RECEIPT_OUT"
    exit 1
    ;;
  *)
    exit 2
    ;;
esac
`;
  writeFileSync(binPath, script, "utf8");
  chmodSync(binPath, 0o755);
}

function makeFakeGh(binDir, logFile) {
  const ghPath = join(binDir, "gh");
  const script = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "${logFile}"
exit 0
`;
  writeFileSync(ghPath, script, "utf8");
  chmodSync(ghPath, 0o755);
}

function baseRunEnv(controlrodBin, tempRoot, outFile, summaryFile) {
  return {
    CONTROLROD_BIN: controlrodBin,
    AUTHOR_RUNTIME: "claude",
    CHECKER_RUNTIME: "codex",
    MODEL: "",
    DIFF_FILE: "/tmp/nonexistent.diff",
    BASE_REF: "",
    HEAD_REF: "HEAD",
    CRITERIA_FILE: "",
    CRITERIA_FROM_BASE: "true",
    CRITERIA_TEXT: "Must pass",
    GRADE: "standard",
    PACKAGE_ID: "PR-1",
    TIMEOUT: "10m",
    PR_NUMBER: "1",
    PR_BASE_SHA: "",
    RUNNER_TEMP: tempRoot,
    GITHUB_OUTPUT: outFile,
    GITHUB_STEP_SUMMARY: summaryFile,
  };
}

test("check-action isolates per-invocation files so a refused second call never leaks the first receipt", () => {
  const { byId, byName } = loadActionSteps();
  const runStep = byId.get("run");
  const commentStep = byName.get("Post PR receipt comment");
  const enforceStep = byName.get("Enforce verdict");

  const dir = mkdtempSync(join(tmpdir(), "check-action-test-"));
  try {
    const modeFile = join(dir, "mode");
    const controlrodBin = join(dir, "controlrod");
    const fakeBinDir = join(dir, "bin");
    mkdirSync(fakeBinDir);
    const ghLog = join(dir, "gh.log");
    makeFakeControlrod(controlrodBin, modeFile);
    makeFakeGh(fakeBinDir, ghLog);

    // Invocation 1: pass.
    writeFileSync(modeFile, "pass", "utf8");
    const out1 = join(dir, "out1");
    const sum1 = join(dir, "sum1");
    writeFileSync(out1, "", "utf8");
    writeFileSync(sum1, "", "utf8");
    const r1 = runBash(runStep.run, baseRunEnv(controlrodBin, dir, out1, sum1));
    assert.equal(r1.code, 0, r1.stderr);
    const outs1 = parseOutputs(out1);
    assert.equal(outs1.outcome, "pass");
    assert.equal(outs1["has-error"], "false");
    assert.equal(outs1["exit-code"], "0");
    assert.ok(outs1.receipt, "first invocation exports receipt path");
    assert.ok(readFileSync(outs1.receipt, "utf8").includes("first-invocation-receipt"));

    // Invocation 2: refused (exit 2, no files written) in the same job temp directory.
    writeFileSync(modeFile, "refuse", "utf8");
    const out2 = join(dir, "out2");
    const sum2 = join(dir, "sum2");
    writeFileSync(out2, "", "utf8");
    writeFileSync(sum2, "", "utf8");
    const r2 = runBash(runStep.run, baseRunEnv(controlrodBin, dir, out2, sum2));
    assert.equal(r2.code, 0, r2.stderr);
    const outs2 = parseOutputs(out2);
    assert.equal(outs2.outcome, "error");
    assert.equal(outs2["has-error"], "true");
    assert.equal(outs2["exit-code"], "2");
    assert.equal(outs2.receipt, "");
    assert.equal(outs2["verdict-file"], "");
    assert.equal(readFileSync(sum2, "utf8"), "");

    // Post PR receipt comment on invocation 2 must not invoke gh pr comment with invocation 1's receipt.
    const c2 = runBash(commentStep.run, {
      PATH: `${fakeBinDir}:${process.env.PATH}`,
      GH_TOKEN: "tok",
      GH_REPO: "FlyFission/Control-Rod",
      PR_NUMBER: "1",
      RECEIPT_FILE: outs2.receipt,
    });
    assert.equal(c2.code, 0, c2.stderr);
    assert.throws(() => readFileSync(ghLog, "utf8"));

    // Enforce verdict fails with 2.
    const e2 = runBash(enforceStep.run, {
      RC: outs2["exit-code"],
      OUTCOME: outs2.outcome,
      HAS_ERROR: outs2["has-error"],
      FAIL_ON_FAIL: "false",
    });
    assert.equal(e2.code, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("check-action fails on checker execution errors even when outcome is inconclusive and fail-on-fail is false", () => {
  const { byId, byName } = loadActionSteps();
  const runStep = byId.get("run");
  const enforceStep = byName.get("Enforce verdict");

  const dir = mkdtempSync(join(tmpdir(), "check-action-err-"));
  try {
    const modeFile = join(dir, "mode");
    const controlrodBin = join(dir, "controlrod");
    makeFakeControlrod(controlrodBin, modeFile);

    // Timeout execution error -> outcome=inconclusive, error non-empty, RC=1.
    writeFileSync(modeFile, "timeout-error", "utf8");
    const outErr = join(dir, "outErr");
    const sumErr = join(dir, "sumErr");
    writeFileSync(outErr, "", "utf8");
    writeFileSync(sumErr, "", "utf8");
    const rErr = runBash(runStep.run, baseRunEnv(controlrodBin, dir, outErr, sumErr));
    assert.equal(rErr.code, 0, rErr.stderr);
    const outsErr = parseOutputs(outErr);
    assert.equal(outsErr.outcome, "inconclusive");
    assert.equal(outsErr["has-error"], "true");
    assert.equal(outsErr["exit-code"], "1");

    const enforceErr = runBash(enforceStep.run, {
      RC: outsErr["exit-code"],
      OUTCOME: outsErr.outcome,
      HAS_ERROR: outsErr["has-error"],
      FAIL_ON_FAIL: "false",
    });
    assert.equal(enforceErr.code, 1, "infrastructure timeout error must still fail when fail-on-fail=false");

    // Genuine inconclusive verdict -> outcome=inconclusive, error="", RC=1 -> fail-on-fail=false allows 0.
    writeFileSync(modeFile, "genuine-inconclusive", "utf8");
    const outInc = join(dir, "outInc");
    const sumInc = join(dir, "sumInc");
    writeFileSync(outInc, "", "utf8");
    writeFileSync(sumInc, "", "utf8");
    const rInc = runBash(runStep.run, baseRunEnv(controlrodBin, dir, outInc, sumInc));
    assert.equal(rInc.code, 0, rInc.stderr);
    const outsInc = parseOutputs(outInc);
    assert.equal(outsInc.outcome, "inconclusive");
    assert.equal(outsInc["has-error"], "false");
    assert.equal(outsInc["exit-code"], "1");

    const enforceAllowed = runBash(enforceStep.run, {
      RC: outsInc["exit-code"],
      OUTCOME: outsInc.outcome,
      HAS_ERROR: outsInc["has-error"],
      FAIL_ON_FAIL: "false",
    });
    assert.equal(enforceAllowed.code, 0, "genuine inconclusive without error is allowed when fail-on-fail=false");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
