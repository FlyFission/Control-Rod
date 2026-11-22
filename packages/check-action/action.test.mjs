import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const requireFromApi = createRequire(new URL("../../services/api/package.json", import.meta.url));
const YAML = requireFromApi("yaml");
const { isoCBOR } = requireFromApi("@simplewebauthn/server/helpers");

const ACTION_DIR = dirname(fileURLToPath(import.meta.url));
const ACTION_YML = resolve(ACTION_DIR, "action.yml");
const VERIFY_DIST = resolve(ACTION_DIR, "../../services/api/dist/verify-bundle.js");
const RECEIPT_DIST = resolve(ACTION_DIR, "../../services/api/dist/pr-receipt.js");
const { eventDigest } = await import("../../services/api/dist/events.js");
const { digest } = await import("../../services/api/dist/kernel.js");
const { keyDigest, sealChallenge, sealSubject } = await import("../../services/api/dist/seals.js");

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

function runBash(script, env, cwd) {
  try {
    const stdout = execFileSync("bash", ["-c", script], {
      ...(cwd ? { cwd } : {}),
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

function makeFakeControlrod(binPath, modeFile, argsLogFile) {
  const script = `#!/usr/bin/env bash
set -euo pipefail
if [ -n "${argsLogFile ?? ""}" ]; then
  printf '%s\\n' "$@" > "${argsLogFile ?? ""}"
fi
VERDICT_OUT=""
RECEIPT_OUT=""
PKG_ID="PR #1"
REV=""
HEAD_SHA=""
BASE_ARG=""
HEAD_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verdict-out) VERDICT_OUT="$2"; shift 2 ;;
    --receipt-out) RECEIPT_OUT="$2"; shift 2 ;;
    --package-id) PKG_ID="$2"; shift 2 ;;
    --revision) REV="$2"; shift 2 ;;
    --head-sha) HEAD_SHA="$2"; shift 2 ;;
    --base) BASE_ARG="$2"; shift 2 ;;
    --head) HEAD_ARG="$2"; shift 2 ;;
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
  pass-diff-a)
    DIFF_HEX="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    REV_JSON="\${REV:-1}"
    HEAD_VAL="\${HEAD_SHA:-1111111111111111111111111111111111111111}"
    printf '{"package_id":"%s","revision":%s,"head_sha":"%s","outcome":"pass","findings":[],"diff_digest":{"algorithm":"sha256","value":"%s"},"error":""}\\n' "$PKG_ID" "$REV_JSON" "$HEAD_VAL" "$DIFF_HEX" > "$VERDICT_OUT"
    printf '<!-- controlrod-pr-receipt:v1 -->\\n<!-- controlrod-check-binding: {"package_id":"%s","revision":%s,"head_sha":"%s","diff_sha256":"%s","outcome":"pass"} -->\\nPASS A\\n' "$PKG_ID" "$REV_JSON" "$HEAD_VAL" "$DIFF_HEX" > "$RECEIPT_OUT"
    exit 0
    ;;
  pass-diff-b)
    DIFF_HEX="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    REV_JSON="\${REV:-2}"
    HEAD_VAL="\${HEAD_SHA:-2222222222222222222222222222222222222222}"
    printf '{"package_id":"%s","revision":%s,"head_sha":"%s","outcome":"pass","findings":[],"diff_digest":{"algorithm":"sha256","value":"%s"},"error":""}\\n' "$PKG_ID" "$REV_JSON" "$HEAD_VAL" "$DIFF_HEX" > "$VERDICT_OUT"
    printf '<!-- controlrod-pr-receipt:v1 -->\\n<!-- controlrod-check-binding: {"package_id":"%s","revision":%s,"head_sha":"%s","diff_sha256":"%s","outcome":"pass"} -->\\nPASS B\\n' "$PKG_ID" "$REV_JSON" "$HEAD_VAL" "$DIFF_HEX" > "$RECEIPT_OUT"
    exit 0
    ;;
  git-diff-check)
    DIFF_CONTENT="$(git diff "$BASE_ARG..$HEAD_ARG")"
    printf '%s' "$DIFF_CONTENT" > "$(dirname "$VERDICT_OUT")/computed.diff"
    printf '{"outcome":"pass","findings":[],"error":""}\\n' > "$VERDICT_OUT"
    printf '<!-- controlrod-pr-receipt:v1 -->\\nPASS GIT\\n' > "$RECEIPT_OUT"
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

function buildSealedProofForDiff({ packageId, revision, headSha, diffSha256 }) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const cose = Buffer.from(
    isoCBOR.encode(
      new Map([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x, "base64url")],
        [-3, Buffer.from(jwk.y, "base64url")],
      ]),
    ),
  );
  const specs = [
    { type: "package.created", subject: packageId, actor: { kind: "system", id: "test" } },
    {
      type: "run.succeeded",
      subject: "R-1",
      actor: { kind: "agent", id: "author-claude" },
      data: { package: packageId, role: "author", round: 1, head_sha: headSha, outputs: [{ name: "diff.patch", sha256: diffSha256 }] },
    },
    {
      type: "package.pre-checked",
      subject: packageId,
      actor: { kind: "agent", id: "checker-codex" },
      data: { revision, round: 1, outcome: "pass", findings: 0, shared_runtime: false },
    },
    {
      type: "decision.accept",
      subject: packageId,
      actor: { kind: "human", id: "mem_owner" },
      data: { revision, decision: `D-rev${revision}`, subject_digest: { algorithm: "sha256", value: "3".repeat(64) } },
    },
  ];
  const out = [];
  for (const [i, s] of specs.entries()) {
    const prev = out.at(-1)?.digest;
    const rest = {
      seq: i + 1,
      at: `2026-11-22T00:00:0${i}.000Z`,
      type: s.type,
      subject: s.subject,
      actor: s.actor,
      ...(s.data ? { data: s.data } : {}),
      ...(prev ? { prev } : {}),
    };
    out.push({ ...rest, digest: { algorithm: "sha256", value: eventDigest(rest) } });
  }
  const head = out[out.length - 1];
  const sealedAt = new Date().toISOString();
  const subjectDigest = sealSubject("mem_owner", "org_test", { head_seq: head.seq, head_digest: head.digest.value, purpose: "PR bundle", sealed_at: sealedAt });
  const nonce = "0123456789abcdef0123456789abcdef";
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: sealChallenge(subjectDigest, nonce), origin: "http://localhost:7300" }));
  const rpHash = createHash("sha256").update("localhost").digest();
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(1);
  const authData = Buffer.concat([rpHash, Buffer.from([0x05]), counter]);
  const signature = sign("sha256", Buffer.concat([authData, createHash("sha256").update(clientData).digest()]), privateKey);
  const seal = {
    id: "seal_test",
    org_id: "org_test",
    payload: { head_seq: head.seq, head_digest: head.digest, org_id: "org_test", sealed_at: sealedAt, signer_id: "mem_owner", purpose: "PR bundle" },
    subject_digest: { algorithm: "sha256", value: subjectDigest },
    nonce,
    assertion: {
      credential_id: Buffer.from(randomBytes(16)).toString("base64url"),
      authenticator_data: authData.toString("base64url"),
      client_data_json: clientData.toString("base64url"),
      signature: signature.toString("base64url"),
    },
  };
  const recRest = {
    seq: head.seq + 1,
    at: "2026-11-22T00:00:09.000Z",
    type: "chain.sealed",
    subject: seal.id,
    actor: { kind: "human", id: "mem_owner" },
    data: { head_seq: head.seq, head_digest: head.digest.value, purpose: "PR bundle", seal_digest: digest(seal), key_digest: keyDigest(cose) },
    prev: head.digest,
  };
  const segment = [...out, { ...recRest, digest: { algorithm: "sha256", value: eventDigest(recRest) } }];
  return {
    package_id: packageId,
    segment,
    seal,
    seal_evidence: { public_key: cose.toString("base64url"), rp_id: "localhost", origins: ["http://localhost:7300"] },
    witnessed: false,
    statement: "Local chain, not witnessed",
  };
}

test("check-action links inclusion proof to PR revision and rejects proof A when checking revision B", () => {
  const { byId, byName } = loadActionSteps();
  const runStep = byId.get("run");
  const commentStep = byName.get("Post PR receipt comment");
  const enforceStep = byName.get("Enforce verdict");

  const dir = mkdtempSync(join(tmpdir(), "check-action-proof-"));
  try {
    const modeFile = join(dir, "mode");
    const controlrodBin = join(dir, "controlrod");
    const fakeBinDir = join(dir, "bin");
    mkdirSync(fakeBinDir);
    const ghLog = join(dir, "gh.log");
    makeFakeControlrod(controlrodBin, modeFile);
    makeFakeGh(fakeBinDir, ghLog);

    const proofAPath = join(dir, "proof-A.json");
    const proofA = buildSealedProofForDiff({
      packageId: "PR #1",
      revision: 1,
      headSha: "1111111111111111111111111111111111111111",
      diffSha256: "a".repeat(64),
    });
    writeFileSync(proofAPath, JSON.stringify(proofA), "utf8");

    // Revision B check with proof A supplied -> must detect mismatch and fail enforcement.
    writeFileSync(modeFile, "pass-diff-b", "utf8");
    const outB = join(dir, "outB");
    const sumB = join(dir, "sumB");
    writeFileSync(outB, "", "utf8");
    writeFileSync(sumB, "", "utf8");
    const rB = runBash(runStep.run, {
      ...baseRunEnv(controlrodBin, dir, outB, sumB),
      PACKAGE_REVISION: "2",
      PR_HEAD_SHA: "2222222222222222222222222222222222222222",
      INCLUSION_PROOF: proofAPath,
      CONTROLROD_VERIFY_JS: VERIFY_DIST,
      CONTROLROD_RECEIPT_JS: RECEIPT_DIST,
    });
    assert.equal(rB.code, 0, rB.stderr);
    const outsB = parseOutputs(outB);
    assert.equal(outsB["proof-verified"], "false");
    assert.equal(outsB["has-error"], "true");
    assert.equal(outsB["diff-sha256"], "b".repeat(64));
    const receiptBMd = readFileSync(outsB.receipt, "utf8");
    assert.ok(receiptBMd.includes("ACCEPTANCE PROOF MISMATCH"), receiptBMd);
    assert.ok(!receiptBMd.includes("Verified Control Rod acceptance"), receiptBMd);

    const eB = runBash(enforceStep.run, {
      RC: outsB["exit-code"],
      OUTCOME: outsB.outcome,
      HAS_ERROR: outsB["has-error"],
      PROOF_VERIFIED: outsB["proof-verified"],
      FAIL_ON_FAIL: "true",
    });
    assert.equal(eB.code, 1, "mismatched proof for revision A must fail revision B check");

    // Revision A check with proof A supplied -> passes offline linkage and appends verified acceptance.
    writeFileSync(modeFile, "pass-diff-a", "utf8");
    const outA = join(dir, "outA");
    const sumA = join(dir, "sumA");
    writeFileSync(outA, "", "utf8");
    writeFileSync(sumA, "", "utf8");
    const rA = runBash(runStep.run, {
      ...baseRunEnv(controlrodBin, dir, outA, sumA),
      PACKAGE_REVISION: "1",
      PR_HEAD_SHA: "1111111111111111111111111111111111111111",
      INCLUSION_PROOF: proofAPath,
      CONTROLROD_VERIFY_JS: VERIFY_DIST,
      CONTROLROD_RECEIPT_JS: RECEIPT_DIST,
    });
    assert.equal(rA.code, 0, rA.stderr);
    const outsA = parseOutputs(outA);
    assert.equal(outsA["proof-verified"], "true");
    assert.equal(outsA["has-error"], "false");
    const receiptAMd = readFileSync(outsA.receipt, "utf8");
    assert.ok(receiptAMd.includes("controlrod-check-binding:"), receiptAMd);
    assert.ok(receiptAMd.includes("Verified Control Rod acceptance"), receiptAMd);

    const cA = runBash(commentStep.run, {
      PATH: `${fakeBinDir}:${process.env.PATH}`,
      GH_TOKEN: "tok",
      GH_REPO: "FlyFission/Control-Rod",
      PR_NUMBER: "1",
      RECEIPT_FILE: outsA.receipt,
    });
    assert.equal(cA.code, 0, cA.stderr);
    assert.ok(readFileSync(ghLog, "utf8").includes("pr comment 1"));

    const eA = runBash(enforceStep.run, {
      RC: outsA["exit-code"],
      OUTCOME: outsA.outcome,
      HAS_ERROR: outsA["has-error"],
      PROOF_VERIFIED: outsA["proof-verified"],
      FAIL_ON_FAIL: "true",
    });
    assert.equal(eA.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("check-action diffs from merge-base when base advances after PR branch-off", () => {
  const { byId } = loadActionSteps();
  const runStep = byId.get("run");

  const dir = mkdtempSync(join(tmpdir(), "check-action-mb-"));
  const repo = join(dir, "repo");
  mkdirSync(repo);
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repo,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@example.com",
      },
      encoding: "utf8",
    }).trim();

  try {
    git("init", "-b", "main");
    writeFileSync(join(repo, "feature.txt"), "base\n", "utf8");
    git("add", "feature.txt");
    git("commit", "-m", "base");
    const forkSha = git("rev-parse", "HEAD");

    git("checkout", "-b", "pr-tip");
    writeFileSync(join(repo, "feature.txt"), "pr-change\n", "utf8");
    git("add", "feature.txt");
    git("commit", "-m", "pr work");
    const prSha = git("rev-parse", "HEAD");

    git("checkout", "main");
    writeFileSync(join(repo, "main-only.txt"), "added later on main\n", "utf8");
    git("add", "main-only.txt");
    git("commit", "-m", "main advance");

    const modeFile = join(dir, "mode");
    const argsLog = join(dir, "args.log");
    const controlrodBin = join(dir, "controlrod");
    makeFakeControlrod(controlrodBin, modeFile, argsLog);
    writeFileSync(modeFile, "git-diff-check", "utf8");

    const out = join(dir, "out");
    const sum = join(dir, "sum");
    writeFileSync(out, "", "utf8");
    writeFileSync(sum, "", "utf8");
    const res = runBash(
      runStep.run,
      {
        ...baseRunEnv(controlrodBin, dir, out, sum),
        DIFF_FILE: "",
        BASE_REF: "main",
        HEAD_REF: prSha,
      },
      repo,
    );
    assert.equal(res.code, 0, res.stderr);
    const outs = parseOutputs(out);
    const argv = readFileSync(argsLog, "utf8").split(/\r?\n/);
    const baseIdx = argv.indexOf("--base");
    assert.ok(baseIdx >= 0, "expected --base flag");
    assert.equal(argv[baseIdx + 1], forkSha, "Action must pass merge-base SHA instead of main tip");
    const diffText = readFileSync(join(dirname(outs["verdict-file"]), "computed.diff"), "utf8");
    assert.ok(diffText.includes("+pr-change"), diffText);
    assert.ok(!diffText.includes("main-only.txt"), "main-only file must not appear as deleted in PR diff");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
