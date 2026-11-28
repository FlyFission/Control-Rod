// The documented receipt flow (docs/quickstart-check.md, Option 3), run the way a person runs it:
// `pnpm cr receipt <proof> --out pr-receipt.md`, then `pnpm cr verify --receipt pr-receipt.md <proof>`.
// pnpm prints its own banner on standard output, so the receipt has to reach the file with nothing
// else in it; the verify step fails on any extra line. The sealed proof is built here with the
// control plane's own functions, as packages/check-action/action.test.mjs does.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cr = join(repoRoot, "scripts", "cr.mjs");
const pnpm = (args) => spawnSync("pnpm", args, { cwd: repoRoot, encoding: "utf8", env: { ...process.env, CONTROLROD_CLI: "" } });

// The receipt command builds the control plane when its sources changed; with no file it then
// prints its usage. After this the built modules below are current.
function buildOnce() {
  const r = spawnSync(process.execPath, [cr, "receipt"], { cwd: repoRoot, encoding: "utf8", env: { ...process.env, CONTROLROD_CLI: "" } });
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stdout, "", "nothing but a receipt is ever written to standard output");
  assert.match(r.stderr, /Usage: pnpm cr receipt/);
}

async function sealedProof() {
  const dist = (f) => import(join(repoRoot, "services", "api", "dist", f));
  const { eventDigest } = await dist("events.js");
  const { digest } = await dist("kernel.js");
  const { keyDigest, sealChallenge, sealSubject } = await dist("seals.js");
  const { isoCBOR } = createRequire(join(repoRoot, "services", "api", "package.json"))("@simplewebauthn/server/helpers");

  const packageId = "WP-RECEIPT-1";
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const cose = Buffer.from(isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]])));
  const specs = [
    { type: "package.created", subject: packageId, actor: { kind: "system", id: "test" } },
    {
      type: "run.succeeded",
      subject: "R-1",
      actor: { kind: "agent", id: "claude" },
      data: { package: packageId, role: "author", round: 1, head_sha: "c".repeat(40), outputs: [{ name: "diff.patch", sha256: "d".repeat(64) }] },
    },
    { type: "package.pre-checked", subject: packageId, actor: { kind: "agent", id: "codex" }, data: { revision: 0, round: 1, outcome: "pass", findings: 0, shared_runtime: false } },
    { type: "decision.accept", subject: packageId, actor: { kind: "human", id: "mem_owner" }, data: { revision: 0, decision: "D-1", subject_digest: { algorithm: "sha256", value: "e".repeat(64) } } },
  ];
  const events = [];
  for (const [i, s] of specs.entries()) {
    const prev = events.at(-1)?.digest;
    const rest = { seq: i + 1, at: `2026-11-22T00:00:0${i}.000Z`, type: s.type, subject: s.subject, actor: s.actor, ...(s.data ? { data: s.data } : {}), ...(prev ? { prev } : {}) };
    events.push({ ...rest, digest: { algorithm: "sha256", value: eventDigest(rest) } });
  }
  const head = events.at(-1);
  const sealedAt = new Date().toISOString();
  const subjectDigest = sealSubject("mem_owner", "org_test", { head_seq: head.seq, head_digest: head.digest.value, purpose: "PR bundle", sealed_at: sealedAt });
  const nonce = "0123456789abcdef0123456789abcdef";
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: sealChallenge(subjectDigest, nonce), origin: "http://localhost:7300" }));
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(1);
  const authData = Buffer.concat([createHash("sha256").update("localhost").digest(), Buffer.from([0x05]), counter]);
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
  const sealedRest = {
    seq: head.seq + 1,
    at: "2026-11-22T00:00:09.000Z",
    type: "chain.sealed",
    subject: seal.id,
    actor: { kind: "human", id: "mem_owner" },
    data: { head_seq: head.seq, head_digest: head.digest.value, purpose: "PR bundle", seal_digest: digest(seal), key_digest: keyDigest(cose) },
    prev: head.digest,
  };
  return {
    package_id: packageId,
    segment: [...events, { ...sealedRest, digest: { algorithm: "sha256", value: eventDigest(sealedRest) } }],
    seal,
    seal_evidence: { public_key: cose.toString("base64url"), rp_id: "localhost", origins: ["http://localhost:7300"] },
    witnessed: false,
    statement: "Local chain, not witnessed",
  };
}

test("the documented receipt flow: receipt --out, then verify --receipt, passes through pnpm", { timeout: 300000 }, async () => {
  buildOnce();
  const dir = mkdtempSync(join(tmpdir(), "cr-receipt-"));
  const proof = join(dir, "inclusion-proof.json");
  writeFileSync(proof, JSON.stringify(await sealedProof()));
  const out = join(dir, "pr-receipt.md");

  const made = pnpm(["cr", "receipt", proof, "--out", out]);
  assert.equal(made.status, 0, made.stderr);
  const receipt = readFileSync(out, "utf8");
  assert.match(receipt, /^<!-- controlrod-pr-receipt:v1 -->\n/, "the file starts with the receipt, not a banner");
  assert.ok(!receipt.includes("> node scripts/cr.mjs"), "pnpm's banner stays out of the file");

  const verified = pnpm(["cr", "verify", "--receipt", out, proof]);
  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  assert.match(verified.stdout, /Acceptance link holds/);

  // Without --out, standard output holds exactly the same receipt.
  const piped = spawnSync(process.execPath, [cr, "receipt", proof], { cwd: repoRoot, encoding: "utf8", env: { ...process.env, CONTROLROD_CLI: "" } });
  assert.equal(piped.status, 0, piped.stderr);
  assert.equal(piped.stdout, receipt);

  // An edited receipt still fails, so the pass above is not a pass for anything.
  writeFileSync(out, receipt.replace("mem_owner", "mem_other"));
  assert.notEqual(pnpm(["cr", "verify", "--receipt", out, proof]).status, 0);
});
