import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

let h: Harness;
let cookie: string;
const passkey = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, passkey);
}, 120_000);
afterAll(async () => h?.stop());

const asOwner = (method: "GET" | "POST" | "PUT", url: string, payload?: unknown) =>
  h.app.inject({
    method,
    url,
    headers: { cookie, ...(method === "GET" ? {} : { origin: ORIGIN }) },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
const asDaemon = (url: string, payload: unknown) =>
  h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: withClaim(url, payload as Record<string, unknown>) });

async function claim(runtimes = ["fake"]) {
  const r = await asDaemon("/runner/claim", { runtimes });
  if (r.statusCode === 204) return null;
  const job = r.json();
  claims.set(job.run.id, job.claim.token);
  return job;
}

function draft(id: string, extra: object = {}) {
  return {
    schema_version: "0.1.0",
    id,
    revision: 0,
    title: `Package ${id}`,
    project: "BM-TEST",
    mode: "capital-projects",
    status: "draft",
    rigor_mode: "standard",
    data_lane: "internal",
    objective: `Produce ${id}`,
    deliverables: [{ id: `${id}-D1`, type: "report", format: ["md"] }],
    design_inputs: [],
    agent_assignment: [{ role: "general-author", agent_baseline: "author", baseline_revision: 0 }],
    acceptance_criteria: ["The report exists"],
    verification: {
      method: "agent-pre-check",
      verifier: "checker",
      verifier_receives: ["deliverables"],
      required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
    },
    ...extra,
  };
}

/** Signs a decision the way the browser does: options, then the passkey, then the decision. */
async function decide(id: string, kind: string, revision: number, reason?: string, tamper?: (a: Record<string, unknown>) => void) {
  const o = await asOwner("POST", `/packages/${id}/decisions/options`, { kind, package_revision: revision });
  expect(o.statusCode, o.body).toBe(200);
  const assertion = passkey.assert(o.json().options);
  tamper?.(assertion as never);
  return asOwner("POST", `/packages/${id}/decisions`, { kind, package_revision: revision, ...(reason ? { reason } : {}), assertion });
}

describe("access", () => {
  it("serves health without a session", async () => {
    const r = await h.app.inject({ method: "GET", url: "/health" });
    expect(r.json()).toEqual({ status: "ok", version: "0.1.0" });
  });

  it("refuses people's routes without a session and refuses the daemon on them", async () => {
    expect((await h.app.inject({ method: "GET", url: "/office" })).statusCode).toBe(401);
    const d = await h.app.inject({ method: "GET", url: "/office", headers: daemonHeaders });
    expect(d.statusCode).toBe(403);
  });

  it("refuses runner routes without the daemon token", async () => {
    expect((await asOwner("POST", "/runner/claim", { runtimes: ["fake"] })).statusCode).toBe(401);
  });

  it("refuses a second passkey registration from someone signed out", async () => {
    const r = await h.app.inject({ method: "POST", url: "/auth/register/options", headers: { origin: ORIGIN }, payload: { name: "intruder" } });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("forbidden");
  });
});

describe("a quick question is answered without a package", () => {
  it("answers and counts it", async () => {
    const c = await asOwner("POST", "/captures", { lane: "internal", text: "What does IFD stand for?" });
    expect(c.statusCode).toBe(201);
    const job = await claim();
    expect(job.run.role).toBe("intake");
    expect(job.inputs.map((i: { name: string }) => i.name)).toContain("BRIEF.md");
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "answer.md", content_base64: b64("Issued for design.") }],
    });
    expect(done.statusCode, done.body).toBe(200);
    const caps = (await asOwner("GET", "/captures")).json();
    const cap = caps.find((x: { id: string }) => x.id === c.json().id);
    expect(cap.disposition).toBe("answered");
    expect(cap.answer).toBe("Issued for design.");
    expect((await asOwner("GET", "/metrics")).json().quick_answers).toBe(1);
  });
});

describe("a site job runs end to end under the floors", () => {
  let parcelId = "";
  let planId = "";

  it("takes an attachment and drafts dependent packages", async () => {
    const fence = '```attachment name="parcel.geojson" encoding="base64"\n' + b64('{"type":"Feature"}') + "\n```";
    const c = await asOwner("POST", "/captures", { lane: "internal", text: `Site a facility for this project.\n${fence}` });
    expect(c.statusCode, c.body).toBe(201);
    expect(c.json().text).toContain("[attachment: parcel.geojson]");
    const job = await claim();
    const names = job.inputs.map((i: { name: string }) => i.name);
    expect(names).toContain("attachments/parcel.geojson");
    const parcel = draft("PARCEL", { design_inputs: [{ doc: "attachment:parcel.geojson", revision: "0", use: "boundary" }] });
    const plan = draft("PLAN", { design_inputs: [{ doc: "PARCEL", revision: "0", use: "boundary" }] });
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [
        { name: "packages/PARCEL.json", content_base64: b64(JSON.stringify(parcel)) },
        { name: "packages/PLAN.json", content_base64: b64(JSON.stringify(plan)) },
      ],
    });
    expect(r.statusCode, r.body).toBe(200);
    const pkgs = (await asOwner("GET", "/packages")).json();
    parcelId = pkgs.find((p: { id: string }) => p.id.endsWith("-PARCEL")).id;
    planId = pkgs.find((p: { id: string }) => p.id.endsWith("-PLAN")).id;
    const planView = (await asOwner("GET", `/packages/${planId}`)).json();
    expect(planView.package.design_inputs[0].doc).toBe(parcelId);
    const officeKinds = (await asOwner("GET", "/office")).json().map((i: { kind: string }) => i.kind);
    expect(officeKinds.filter((k: string) => k === "release")).toHaveLength(2);
  });

  it("refuses a release with no passkey, with a replayed assertion and with the wrong kind", async () => {
    const bare = await asOwner("POST", `/packages/${parcelId}/decisions`, { kind: "release", package_revision: 0 });
    expect(bare.statusCode).toBe(403);
    expect(bare.json().code).toBe("unsigned");

    const o = await asOwner("POST", `/packages/${parcelId}/decisions/options`, { kind: "release", package_revision: 0 });
    const a = passkey.assert(o.json().options);
    const wrongKind = await asOwner("POST", `/packages/${parcelId}/decisions`, { kind: "reject", reason: "x", package_revision: 0, assertion: a });
    expect(wrongKind.statusCode).toBe(403);
    const replay = await asOwner("POST", `/packages/${parcelId}/decisions`, { kind: "release", package_revision: 0, assertion: a });
    expect(replay.statusCode).toBe(403);
  });

  it("refuses an assertion from another origin and one with a forged signature", async () => {
    const o = await asOwner("POST", `/packages/${parcelId}/decisions/options`, { kind: "release", package_revision: 0 });
    const evil = passkey.assert(o.json().options, "http://evil.example");
    const r = await asOwner("POST", `/packages/${parcelId}/decisions`, { kind: "release", package_revision: 0, assertion: evil });
    expect(r.statusCode).toBe(403);
    const forged = await decide(parcelId, "release", 0, undefined, (x) => {
      (x.response as Record<string, string>).signature = Buffer.alloc(70, 1).toString("base64url");
    });
    expect(forged.statusCode).toBe(403);
  });

  it("never lets the daemon decide", async () => {
    const r = await h.app.inject({
      method: "POST",
      url: `/packages/${parcelId}/decisions`,
      headers: daemonHeaders,
      payload: { kind: "release", package_revision: 0 },
    });
    expect(r.statusCode).toBe(403);
  });

  it("releases both, but holds the plan until the parcel is accepted", async () => {
    expect((await decide(parcelId, "release", 0)).statusCode).toBe(201);
    expect((await decide(planId, "release", 0)).statusCode).toBe(201);
    const job = await claim();
    expect(job.run.package_id).toBe(parcelId);
    expect(job.run.role).toBe("author");
    expect(await claim()).toBeNull();

    // Round 1 output; the pre-check fails it with a finding.
    await asDaemon(`/runner/runs/${job.run.id}/log`, { lines: ["{}"], label: "Edit: parcel.json" });
    await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "parcel.json", content_base64: b64('{"acres":"40.0"}') }],
    });
    // The daemon here has only the author's runtime: the pre-check is held, never run on it.
    expect(await claim()).toBeNull();
    const check = await claim(["codex"]);
    expect(check.run.role).toBe("pre-check");
    expect(check.run.agent_baseline).not.toBe(job.run.agent_baseline);
    expect(check.run.runtime.provider).not.toBe(job.run.runtime.provider);
    const delivered = check.inputs.map((i: { name: string }) => i.name);
    expect(delivered).toContain("deliverables/parcel.json");
    expect(delivered.some((n: string) => n.includes("log"))).toBe(false);
    await asDaemon(`/runner/runs/${check.run.id}/complete`, {
      status: "succeeded",
      outputs: [],
      verification: { outcome: "fail", findings: [{ id: "F-001", severity: "major", text: "Acreage not derived from geometry" }] },
    });

    // Round 2: the author gets the findings and its previous output, then passes.
    const fix = await claim();
    expect(fix.run.role).toBe("author");
    expect(fix.run.round).toBe(2);
    expect(fix.findings[0].id).toBe("F-001");
    expect(fix.inputs.map((i: { name: string }) => i.name)).toContain("previous/parcel.json");
    await asDaemon(`/runner/runs/${fix.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "parcel.json", content_base64: b64('{"acres":"40.02","method":"computed"}') }],
    });
    const check2 = await claim(["codex"]);
    await asDaemon(`/runner/runs/${check2.run.id}/complete`, { status: "succeeded", outputs: [], verification: { outcome: "pass", findings: [] } });

    const office = (await asOwner("GET", "/office")).json();
    expect(office.find((i: { package_id: string }) => i.package_id === parcelId).kind).toBe("accept");
  });

  it("binds acceptance to what was reviewed and then unblocks the plan", async () => {
    const view = (await asOwner("GET", `/packages/${parcelId}`)).json();
    expect(view.pre_check.outcome).toBe("pass");
    const ok = await decide(parcelId, "accept", 0);
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json().subject_digest.value).toBe(view.subject_digest.value);
    expect((await asOwner("GET", `/packages/${parcelId}`)).json().package.status).toBe("accepted");

    const job = await claim();
    expect(job.run.package_id).toBe(planId);
    expect(job.inputs.map((i: { name: string }) => i.name)).toContain(`deps/${parcelId}/parcel.json`);

    const m = (await asOwner("GET", "/metrics")).json();
    expect(m.packages_accepted).toBe(1);
    expect(m.findings_caught_before_review).toBe(1);
    expect(m.first_pass_accepted).toBe(0);
  });

  it("returns work with direction as a new revision", async () => {
    const r = await decide(planId, "return", 0, "Use a 100 ft setback on the north line");
    expect(r.statusCode, r.body).toBe(201);
    const view = (await asOwner("GET", `/packages/${planId}`)).json();
    expect(view.package.revision).toBe(1);
    expect(view.package.status).toBe("draft");
    expect((await decide(planId, "release", 1)).statusCode).toBe(201);
    const job = await claim();
    const brief = Buffer.from(job.inputs.find((i: { name: string }) => i.name === "BRIEF.md").content_base64, "base64").toString();
    expect(brief).toContain("Use a 100 ft setback on the north line");
  });
});

describe("the record", () => {
  it("keeps an intact hash chain and refuses edits to it", async () => {
    const v = (await asOwner("GET", "/events/verify")).json();
    expect(v.ok).toBe(true);
    expect(v.count).toBeGreaterThan(20);
    await expect(h.admin.query("update events set body = body where seq = 1")).rejects.toThrow(/append-only/);
    await expect(h.admin.query("delete from events where seq = 1")).rejects.toThrow(/append-only/);
  });

});

describe("decision kinds (workbench plan task 1.3)", () => {
  it("reads every signed decision through mapping version 1 without changing its bytes or its signature", async () => {
    const { createHash } = await import("node:crypto");
    const { verifySignature } = await import("@simplewebauthn/server/helpers");
    const { readDecision, loadMapping } = await import("../src/decision-kinds.js");
    const { loadValidator } = await import("../src/schemas.js");
    const validate = loadValidator().getSchema("Decision.json")!;
    const before = (await h.db.query<{ id: string; text: string }>("select id, body::text as text from decisions order by id")).rows;
    expect(new Set(before.map((r) => JSON.parse(r.text).kind))).toEqual(new Set(["release", "accept", "return"]));
    const expected: Record<string, object> = {
      release: { plan_kind: "release" },
      accept: { plan_kind: "verdict", verdict_outcome: "accept" },
      return: { plan_kind: "verdict", verdict_outcome: "return" },
    };
    for (const row of before) {
      const body = JSON.parse(row.text);
      const cred = await h.db.query<{ public_key: Buffer }>("select public_key from credentials where id = $1", [body.assertion.credential_id]);
      const data = Buffer.concat([
        Buffer.from(body.assertion.authenticator_data, "base64url"),
        createHash("sha256").update(Buffer.from(body.assertion.client_data_json, "base64url")).digest(),
      ]);
      expect(await verifySignature({
        signature: new Uint8Array(Buffer.from(body.assertion.signature, "base64url")),
        data: new Uint8Array(data),
        credentialPublicKey: new Uint8Array(cred.rows[0]!.public_key),
      })).toBe(true);
      // R15: the signature is bound to this decision's subject, legacy kind and revision.
      const { decisionChallenge } = await import("../src/work.js");
      expect(body.challenge_nonce).toMatch(/^[0-9a-f]{32}$/);
      const signedChallenge = JSON.parse(Buffer.from(body.assertion.client_data_json, "base64url").toString("utf8")).challenge;
      const bound = (subject: string, kind: string, revision: number) =>
        Buffer.from(decisionChallenge(subject, kind, revision, body.challenge_nonce)).toString("base64url");
      expect(signedChallenge).toBe(bound(body.subject_digest.value, body.kind, body.package_revision));
      expect(signedChallenge).not.toBe(bound("0".repeat(64), body.kind, body.package_revision));
      expect(signedChallenge).not.toBe(bound(body.subject_digest.value, body.kind === "accept" ? "reject" : "accept", body.package_revision));
      expect(signedChallenge).not.toBe(bound(body.subject_digest.value, body.kind, body.package_revision + 1));
      const reading = readDecision(body);
      expect(reading).toMatchObject({ decision_id: body.id, mapping_version: 1, ...expected[body.kind] });
      expect(validate(body)).toBe(true);
    }
    const after = (await h.db.query<{ id: string; text: string }>("select id, body::text as text from decisions order by id")).rows;
    expect(after).toEqual(before);
    // Every legacy kind has exactly one row; a kind the mapping lacks refuses.
    expect([...loadMapping(1).keys()].sort()).toEqual(["accept", "accept-with-findings", "reject", "release", "return"]);
    expect(() => readDecision({ id: "D-x", kind: "clearance" })).toThrow(/no row for/);
  });

  it("keeps the signature challenge over the legacy kind", async () => {
    const { createHash } = await import("node:crypto");
    const { decisionChallenge } = await import("../src/work.js");
    const expected = createHash("sha256").update("abc|accept|0|n1").digest();
    expect(Buffer.from(decisionChallenge("abc", "accept", 0, "n1"))).toEqual(expected);
  });
});

describe("migrations 009 and 010 over real signed history (review R14)", () => {
  it("reverse and reapply without changing any legacy row, signed decision or event", async () => {
    const { assertMigrationsPreserveHistory } = await import("./migration-preservation.js");
    await assertMigrationsPreserveHistory(h.admin, ["captures", "packages", "runs", "outputs", "verifications", "decisions", "credentials", "sessions"]);
  });
});
