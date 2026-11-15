import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { judgeAttestation, loadModelRegistry, setModelRegistryForTest, type AttestationFacts } from "../src/run-attestation.js";
import { digest } from "../src/kernel.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness } from "./harness.js";

const vector = JSON.parse(readFileSync(fileURLToPath(new URL("../../../daemon/internal/runner/testdata/attestation-vector.json", import.meta.url)), "utf8"));
const HEX = "ab".repeat(32);

function rawPublic(key: ReturnType<typeof generateKeyPairSync>["publicKey"]): Buffer {
  const der = key.export({ format: "der", type: "spki" }) as Buffer;
  return der.subarray(der.length - 32);
}

function signAttestation(body: Record<string, unknown>, privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], publicKey: Buffer) {
  const hash = Buffer.from(digest(body), "hex");
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
    policyDigest: HEX,
    attestation: signed,
    publicKey: raw,
    harness: "codex",
    nonceOwner: null,
    ...over,
  };
}

describe("attestation bytes", () => {
  it("matches the Go vector", () => {
    expect(digest(vector.payload)).toBe(vector.hash);
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

  it("refuses a replayed nonce", () => {
    expect(judgeAttestation(facts(baseBody(), { nonceOwner: "run-1" })).code).toBe("replay");
  });

  it("refuses a local model on Safety or Material", () => {
    setModelRegistryForTest({
      models: [{ id: "local-ollama", harness: "codex", names: ["local-ollama"], hosts: ["127.0.0.1:11434"], deciding: false, local: true }],
    });
    try {
      const body = baseBody({ effective_endpoint: "127.0.0.1:11434", observed_models: ["local-ollama"] });
      expect(judgeAttestation(facts(body, { model: "local-ollama", grade: "safety" })).code).toBe("not-deciding");
      expect(judgeAttestation(facts(body, { model: "local-ollama", grade: "material" })).code).toBe("not-deciding");
    } finally {
      setModelRegistryForTest(undefined);
    }
  });

  it("accepts a statement that matches the registry", () => {
    const v = judgeAttestation(facts(baseBody()));
    expect(v).toMatchObject({ verified: true, code: "ok" });
    expect(loadModelRegistry().models.map((m) => m.id).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"]);
  });
});

describe("enrollment", () => {
  let h: Harness;
  let cookie: string;
  const key = new VirtualAuthenticator();
  const previous = process.env.CONTROLROD_TEST_UNATTESTED_CHECKS;

  beforeAll(async () => {
    process.env.CONTROLROD_TEST_UNATTESTED_CHECKS = "0";
    h = await startHarness();
    cookie = await signIn(h.app, key);
  }, 120_000);
  afterAll(async () => {
    if (previous === undefined) delete process.env.CONTROLROD_TEST_UNATTESTED_CHECKS;
    else process.env.CONTROLROD_TEST_UNATTESTED_CHECKS = previous;
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
  });
});
