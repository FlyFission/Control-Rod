import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tx } from "../src/db/index.js";
import { checkerModelAdmitted, defaultCheckerModel, judgeAttestation, loadModelRegistry, rememberNonce, setModelRegistryForTest, signedPayload, type AttestationFacts } from "../src/run-attestation.js";
import { digest } from "../src/kernel.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness } from "./harness.js";

const vector = JSON.parse(readFileSync(fileURLToPath(new URL("../../../daemon/internal/runner/testdata/attestation-vector.json", import.meta.url)), "utf8"));
const HEX = "ab".repeat(32);

it("binds a reported eligible model without weakening the grade gate", () => {
  const reported = ["default", "gpt-5-codex", "claude-haiku-4-5", "claude-opus-4-6"];
  expect(defaultCheckerModel("claude", "general-service", reported)).toBe("claude-haiku-4-5");
  expect(defaultCheckerModel("claude", "safety", reported)).toBe("claude-opus-4-6");
  expect(defaultCheckerModel("opencode", "general-service", reported)).toBeUndefined();
});

it("admits a chosen checker model only through the same registry and grade filter as the default", () => {
  expect(checkerModelAdmitted("claude", "general-service", "claude-haiku-4-5")).toBe(true);
  expect(checkerModelAdmitted("claude", "safety", "claude-haiku-4-5")).toBe(defaultCheckerModel("claude", "safety", ["claude-haiku-4-5"]) === "claude-haiku-4-5");
  expect(checkerModelAdmitted("claude", "general-service", "unregistered-model")).toBe(false);
  expect(checkerModelAdmitted("codex", "general-service", "claude-haiku-4-5")).toBe(false);
});

function rawPublic(key: ReturnType<typeof generateKeyPairSync>["publicKey"]): Buffer {
  const der = key.export({ format: "der", type: "spki" }) as Buffer;
  return der.subarray(der.length - 32);
}

function signAttestation(body: Record<string, unknown>, privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], publicKey: Buffer) {
  const hash = Buffer.from(digest(signedPayload(body)), "hex");
  const signature = sign(null, hash, privateKey).toString("base64");
  return {
    ...body,
    key_id: createHash("sha256").update(publicKey).digest("hex"),
    signature,
  };
}

function baseBody(over: Record<string, unknown> = {}) {
  return {
    schema_version: "0.1.0",
    run_id: "run-1",
    nonce: "cd".repeat(32),
    artifact_digest: { algorithm: "sha256", value: HEX },
    policy_digest: { algorithm: "sha256", value: HEX },
    effective_config_digest: { algorithm: "sha256", value: HEX },
    effective_endpoint: "api.openai.com",
    endpoint_enforcement: "endpoint not enforced",
    observed_models: ["gpt-5-codex"],
    platform: "linux",
    probe_result: "not-run",
    workspace_before: { algorithm: "sha256", value: HEX },
    workspace_after: { algorithm: "sha256", value: HEX },
    requested_model: "gpt-5-codex",
    check_id: "run-1:0",
    deliverable_digest: { algorithm: "sha256", value: HEX },
    verification_digest: { algorithm: "sha256", value: HEX },
    ...over,
  };
}

function facts(attestation: unknown, over: Partial<AttestationFacts> = {}): AttestationFacts {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = rawPublic(publicKey);
  const signed = attestation === undefined ? undefined : signAttestation(attestation as Record<string, unknown>, privateKey, raw);
  return {
    runId: "run-1",
    provider: "openai",
    model: "gpt-5-codex",
    checkId: "run-1:0",
    policyDigest: HEX,
    deliverableDigest: HEX,
    verificationDigest: HEX,
    attestation: signed,
    publicKey: raw,
    harness: "codex",
    ...over,
  };
}

describe("attestation bytes", () => {
  it("matches the Go vectors, including a non-ascii model and an empty model list", () => {
    expect(vector.cases.map((c: { name: string }) => c.name)).toEqual(["ascii", "non-ascii", "empty-models"]);
    for (const c of vector.cases as { name: string; payload: unknown; hash: string }[]) {
      expect(digest(c.payload), c.name).toBe(c.hash);
    }
    const order = vector.order as { names: string[]; names_hash: string; keys_hash: string };
    const sorted = [...order.names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(sorted).toEqual(order.names);
    expect(digest(sorted)).toBe(order.names_hash);
    expect(digest({ "\uffff": 1, "😀": 2 })).toBe(order.keys_hash);
  });
});

describe("spoofed checks", () => {
  it("refuses a missing attestation", () => {
    const v = judgeAttestation({ ...facts(baseBody()), attestation: null });
    expect(v.code).toBe("missing");
    expect(v.verified).toBe(false);
  });

  it("refuses an unknown signing key", () => {
    const v = judgeAttestation({ ...facts(baseBody()), publicKey: null });
    expect(v.code).toBe("unknown-key");
  });

  it("refuses a tampered field", () => {
    const f = facts(baseBody());
    const a = f.attestation as { effective_endpoint: string };
    a.effective_endpoint = "https://ollama.com/v1";
    expect(judgeAttestation(f).code).toBe("bad-signature");
  });

  it("refuses a custom endpoint that was re-signed", () => {
    const v = judgeAttestation(facts(baseBody({ effective_endpoint: "https://ollama.com/v1" })));
    expect(v.code).toBe("custom-endpoint");
  });

  it("refuses a model alias and an extra model in the stream", () => {
    expect(judgeAttestation(facts(baseBody({ observed_models: ["codex"] }))).code).toBe("provenance-unknown");
    expect(judgeAttestation(facts(baseBody({ observed_models: ["gpt-5-codex", "gpt-5-codex-mini"] }))).code).toBe("provenance-unknown");
  });

  it("refuses an unregistered model and does not pick a vendor", () => {
    const v = judgeAttestation(facts(baseBody(), { model: "default" }));
    expect(v.code).toBe("unregistered-model");
  });

  it("refuses a renamed binary whose digest is not registered", () => {
    expect(judgeAttestation(facts(baseBody(), { harness: null })).code).toBe("harness-unknown");
    expect(judgeAttestation(facts(baseBody(), { harness: "claude" })).code).toBe("harness-mismatch");
  });

  it("refuses a retired key before it looks at the signature", () => {
    expect(judgeAttestation(facts(baseBody(), { keyRetired: true, publicKey: null })).code).toBe("retired");
  });

  it("refuses a local model on Safety or Material", () => {
    setModelRegistryForTest({
      models: [{ id: "local-ollama", harness: "codex", names: ["local-ollama"], hosts: ["127.0.0.1:11434"], deciding: false, local: true }],
    });
    try {
      const body = baseBody({ effective_endpoint: "127.0.0.1:11434", observed_models: ["local-ollama"], requested_model: "local-ollama" });
      expect(judgeAttestation(facts(body, { model: "local-ollama", grade: "safety" })).code).toBe("not-deciding");
      expect(judgeAttestation(facts(body, { model: "local-ollama", grade: "material" })).code).toBe("not-deciding");
    } finally {
      setModelRegistryForTest(undefined);
    }
  });

  it("accepts a statement that matches the registry", () => {
    const v = judgeAttestation(facts(baseBody()));
    expect(v).toMatchObject({ verified: true, code: "ok" });
    // Pinned here, so a change to the registry (a model added, removed or renamed) fails this test
    // until someone reads it, rather than being compared with itself.
    expect(loadModelRegistry().models.map((m) => m.id).sort()).toEqual([
      "claude-haiku-4-5", "claude-opus-4-5", "claude-opus-4-6", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-sonnet-5-5",
      "gpt-5-codex", "gpt-5.6-sol", "gpt-6-astra", "gpt-6-sol", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6.2-astra", "gpt-6.2-sol",
    ]);
  });
});

describe("enrollment", () => {
  let h: Harness;
  let cookie: string;
  const key = new VirtualAuthenticator();

  beforeAll(async () => {
    h = await startHarness();
    cookie = await signIn(h.app, key);
  }, 120_000);
  afterAll(async () => {
    await h?.stop();
  });

  const post = (url: string, payload: unknown) =>
    h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });

  it("requires the passkey and stores the public key", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const raw = rawPublic(publicKey);
    const payload = { public_key: raw.toString("base64") };
    expect((await post("/admin/commands/daemon.enroll-key", { payload })).json().code).toBe("signature-required");
    const options = await post("/admin/commands/daemon.enroll-key/options", { payload });
    expect(options.statusCode, options.body).toBe(200);
    const enrolled = await post("/admin/commands/daemon.enroll-key", { payload, assertion: key.assert(options.json().options) });
    expect(enrolled.statusCode, enrolled.body).toBe(200);
    expect(enrolled.json().key_id).toBe(createHash("sha256").update(raw).digest("hex"));
    const row = (await h.db.query("select status from daemon_signing_keys where key_id = $1", [enrolled.json().key_id])).rows[0];
    expect(row.status).toBe("active");
  });

  it("does not count a Codex pre-check with no attestation", async () => {
    const capture = await post("/captures", { lane: "internal", text: "Write a note" });
    expect(capture.statusCode, capture.body).toBe(201);
    const claim = async (runtimes: string[]) => {
      const r = await h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes } });
      if (r.statusCode === 204) return null;
      const job = r.json() as { run: { id: string; role: string }; claim: { token: string } };
      claims.set(job.run.id, job.claim.token);
      return job;
    };
    const complete = async (job: { run: { id: string } }, body: Record<string, unknown>) =>
      h.app.inject({
        method: "POST",
        url: `/runner/runs/${job.run.id}/complete`,
        headers: daemonHeaders,
        payload: { claim_token: claims.get(job.run.id), idempotency_key: `k-${job.run.id}`, containment: "cgroup", status: "succeeded", ...body },
      });
    const intake = await claim(["fake"]);
    expect(intake?.run.role).toBe("intake");
    const draft = {
      schema_version: "0.1.0", id: "NOTE", revision: 0, title: "Note", project: "PRJ-TEST", mode: "general", status: "draft",
      rigor_mode: "standard", data_lane: "internal", objective: "Write a note", deliverables: [{ id: "NOTE-D1", type: "report", format: ["md"] }],
      design_inputs: [], agent_assignment: [{ role: "general-author", agent_baseline: "author", baseline_revision: 0 }],
      acceptance_criteria: ["The note exists"],
      verification: { method: "agent-pre-check", verifier: "checker", verifier_receives: ["deliverables"], required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false } },
    };
    expect((await complete(intake!, { outputs: [{ name: "package.json", content_base64: b64(JSON.stringify(draft)) }] })).statusCode).toBeLessThan(300);
    const pkgs = (await h.app.inject({ method: "GET", url: "/packages", headers: { cookie } })).json() as { id: string }[];
    const id = pkgs.find((p) => p.id.endsWith("-NOTE"))?.id;
    expect(id).toBeTruthy();
    const options = await post(`/packages/${id}/decisions/options`, { kind: "release", package_revision: 0 });
    expect(options.statusCode, options.body).toBe(200);
    expect((await post(`/packages/${id}/decisions`, { kind: "release", package_revision: 0, assertion: key.assert(options.json().options) })).statusCode).toBe(201);
    const author = await claim(["fake"]);
    expect(author?.run.role).toBe("author");
    expect((await complete(author!, { outputs: [{ name: "note.md", content_base64: b64("# Note") }] })).statusCode).toBeLessThan(300);
    const check = await claim(["codex"]);
    expect(check?.run.role).toBe("pre-check");
    const done = await complete(check!, { outputs: [], verification: { outcome: "pass", findings: [] } });
    expect(done.statusCode, done.body).toBeLessThan(300);
    const run = (await h.db.query("select status, body from runs where id = $1", [check!.run.id])).rows[0];
    expect(run.status).toBe("failed");
    expect(run.body.attestation_verified).toBe(false);
    expect(run.body.attestation_reason).toMatch(/no attestation/);
    const verifications = (await h.db.query("select 1 from verifications where run_id = $1", [check!.run.id])).rowCount;
    expect(verifications).toBe(0);
    const attempt = (await h.db.query<{ body: { id: string; outcome: string; counts_as: string; verification_run_id?: string } }>(
      "select body from checker_attempts where run_id = $1", [check!.run.id])).rows[0]?.body;
    expect(attempt?.id).toMatch(/^CA-[0-9a-f]{8}$/);
    expect(attempt?.outcome).toBe("error");
    expect(attempt?.counts_as).toBe("inconclusive");
    expect(attempt?.verification_run_id).toBeUndefined();
    const sticky = (await h.db.query(
      "select 1 from checker_attempts where package_id = $1 and body->>'counts_as' = 'fail'",
      [run.body.package_id])).rowCount;
    expect(sticky).toBe(0);
  });

  it("retires a key so its signatures stop counting", async () => {
    const row = (await h.db.query<{ key_id: string }>("select key_id from daemon_signing_keys where status = 'active' limit 1")).rows[0];
    expect(row?.key_id).toBeTruthy();
    const payload = { key_id: row!.key_id };
    const options = await post("/admin/commands/daemon.retire-key/options", { payload });
    expect(options.statusCode, options.body).toBe(200);
    const retired = await post("/admin/commands/daemon.retire-key", { payload, assertion: key.assert(options.json().options) });
    expect(retired.statusCode, retired.body).toBe(200);
    expect(retired.json().status).toBe("retired");
    const againOptions = await post("/admin/commands/daemon.retire-key/options", { payload });
    expect(againOptions.statusCode, againOptions.body).toBe(200);
    const again = await post("/admin/commands/daemon.retire-key", { payload, assertion: key.assert(againOptions.json().options) });
    expect(again.statusCode).toBe(404);
  });

  it("treats the same nonce and payload as a retry, and any other reuse as a replay", async () => {
    const org = (await h.db.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
    const run = (await h.db.query<{ id: string }>("select id from runs limit 1")).rows[0]!.id;
    const { publicKey } = generateKeyPairSync("ed25519");
    const raw = rawPublic(publicKey);
    const keyId = createHash("sha256").update(raw).digest("hex");
    await h.admin.query(
      "insert into daemon_signing_keys (org_id, key_id, public_key, status, enrolled_by) values ($1, $2, $3, 'active', 'test')",
      [org, keyId, raw.toString("base64")],
    );
    const nonce = "ab".repeat(32);
    const claim = (hash: string) => tx(h.admin, (c) => rememberNonce(c, { orgId: org, keyId, nonce, runId: run, payloadHash: hash }));
    const first = await Promise.all([claim(HEX), claim(HEX)]);
    expect(first.sort()).toEqual(["same", "stored"]);
    expect(await claim(HEX)).toBe("same");
    expect(await claim("cd".repeat(32))).toBe("replay");
  });
});
