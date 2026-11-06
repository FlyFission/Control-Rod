import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { tx } from "../src/db/index.js";
import { appendEvent } from "../src/events.js";
import { originators } from "../src/person-verification.js";
import { memberIdFor } from "../src/tenancy.js";
import { type Harness, ORIGIN, VirtualAuthenticator, registerWithInvitation, signIn, startHarness } from "./harness.js";

/** Person verification (workbench plan task 1.13; specification 11.5, WB-05). */
let h: Harness;
let ben: string;
let carol: string;
let erin: string;
const benKey = new VirtualAuthenticator();
const carolKey = new VirtualAuthenticator();
const erinKey = new VirtualAuthenticator();
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
const ALL = ["AC-1", "AC-2", "AC-3", "AC-4"];
let pkgId = "";

const post = (cookie: string, url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
async function signedAdmin(name: string, payload: Record<string, unknown>) {
  const o = await post(ben, `/admin/commands/${name}/options`, { payload });
  return post(ben, `/admin/commands/${name}`, { payload, assertion: benKey.assert(o.json().options) });
}
async function enroll(name: string, key: VirtualAuthenticator, roles: string[] | null): Promise<string> {
  const r = await signedAdmin("member.enroll", { user_name: name });
  const cookie = await registerWithInvitation(h.app, r.json().invitation.token, key);
  if (roles) expect((await signedAdmin("qualification.issue", { member_id: memberIdFor(name), licenses: [], disciplines: [], grades: ["general-service"], roles, authorities: [], reason: "test" })).statusCode).toBe(200);
  return cookie;
}
/** Asks for the prompt and signs it; `submitted` lets a test send something other than what was signed. */
async function verify(cookie: string, key: VirtualAuthenticator, body: Record<string, unknown>, submitted = body) {
  const o = await post(cookie, `/packages/${pkgId}/person-verifications/options`, body);
  if (o.statusCode !== 200) return o;
  return post(cookie, `/packages/${pkgId}/person-verifications`, { ...submitted, assertion: key.assert(o.json().options) });
}

beforeAll(async () => {
  h = await startHarness();
  ben = await signIn(h.app, benKey);
  carol = await enroll("carol", carolKey, ["checker"]);
  erin = await enroll("erin", erinKey, null);
  // Ben captured the request, so he originated the work.
  const capture = (await post(ben, "/captures", { text: "HVAC loads", lane: "internal" })).json();
  pkgId = "WP-PV";
  await h.admin.query("update runs set status = 'stopped' where status = 'queued'");
  await h.admin.query("insert into packages (id, revision, status, capture_id, body) values ($1, 0, 'in-verification', $2, $3)",
    [pkgId, capture.id, { ...example, id: pkgId, revision: 0, status: "draft" }]);
  const release = { schema_version: "0.1.0", id: "D-pv000001", package_id: pkgId, package_revision: 0, kind: "release", actor: { kind: "human", id: "ben" },
    subject_digest: { algorithm: "sha256", value: "a".repeat(64) }, assertion: { credential_id: "x", authenticator_data: "x", client_data_json: "x", signature: "x" },
    decided_at: new Date().toISOString() };
  await h.admin.query("insert into decisions (id, package_id, package_revision, kind, body) values ($1, $2, 0, 'release', $3)", [release.id, pkgId, release]);
  const run = { schema_version: "0.1.0", id: "R-pv000001", package_id: pkgId, package_revision: 0, role: "author", agent_baseline: "author",
    runtime: { kind: "local", provider: "fake", model: "fake" }, round: 1, status: "succeeded", queued_at: new Date().toISOString() };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'succeeded', $3)", [run.id, pkgId, run]);
}, 120_000);
afterAll(async () => h?.stop());

describe("separation and coverage", () => {
  it("refuses the originator, someone without a qualification, and an incomplete or unknown criteria list", async () => {
    const own = await verify(ben, benKey, { package_revision: 0, criteria: ALL, outcome: "pass" });
    expect(own.statusCode).toBe(403);
    expect(own.json().code).toBe("verifier-is-originator");
    expect((await verify(erin, erinKey, { package_revision: 0, criteria: ALL, outcome: "pass" })).json()).toMatchObject({
      code: "qualification-missing", message: "Verifying this needs a signer qualification, which your qualification does not include",
    });
    const partial = await verify(carol, carolKey, { package_revision: 0, criteria: ["AC-1", "AC-2"], outcome: "pass" });
    expect(partial.statusCode).toBe(409);
    expect(partial.json()).toMatchObject({ code: "verification-incomplete", message: "A verification must cover every mandatory criterion; it leaves out AC-3, AC-4" });
    expect((await verify(carol, carolKey, { package_revision: 0, criteria: [...ALL, "AC-9"], outcome: "pass" })).json().message).toBe("This package has no criterion AC-9");
  });

  it("refuses an unsigned verification and one that differs from what was signed", async () => {
    const unsigned = await post(carol, `/packages/${pkgId}/person-verifications`, { package_revision: 0, criteria: ALL, outcome: "pass" });
    expect(unsigned.json().code).toBe("unsigned");
    const swapped = await verify(carol, carolKey, { package_revision: 0, criteria: ALL, outcome: "fail" }, { package_revision: 0, criteria: ALL, outcome: "pass" });
    expect(swapped.statusCode).toBe(403);
    expect(swapped.json().code).toBe("signature-mismatch");
  });
});

describe("recording", () => {
  it("records a qualified checker's signed verification against the revision's single candidate", async () => {
    const r = await verify(carol, carolKey, { package_revision: 0, criteria: ["AC-4", "AC-1", "AC-3", "AC-2"], outcome: "pass" });
    expect(r.statusCode, r.body).toBe(201);
    const record = r.json();
    expect(record).toMatchObject({ verifier_member_id: memberIdFor("carol"), qualification_version: 1, criteria: ALL, outcome: "pass" });
    expect(record.assertion.credential_id).toBe(carolKey.credentialId.toString("base64url"));
    const candidate = (await h.db.query("select body from candidate_assignments where id = $1", [record.candidate_id])).rows[0].body;
    expect(candidate).toMatchObject({ package_id: pkgId, package_revision: 0, ordinal: 1, release_digest: { value: "a".repeat(64) } });
    const ev = await h.db.query("select count(*)::int as n from events where body->>'type' = 'person-verification.recorded' and body->>'subject' = $1", [record.id]);
    expect(ev.rows[0].n).toBe(1);
    // A second verification reuses the candidate.
    const again = await verify(carol, carolKey, { package_revision: 0, criteria: ALL, outcome: "inconclusive" });
    expect(again.json().candidate_id).toBe(record.candidate_id);
  });

  it("binds the signature to the author output it saw", async () => {
    const o = await post(carol, `/packages/${pkgId}/person-verifications/options`, { package_revision: 0, criteria: ALL, outcome: "pass" });
    expect(o.statusCode).toBe(200);
    const assertion = carolKey.assert(o.json().options);
    const run = { schema_version: "0.1.0", id: "R-pv000002", package_id: pkgId, package_revision: 0, role: "author", agent_baseline: "author",
      runtime: { kind: "local", provider: "fake", model: "fake" }, round: 2, status: "succeeded", queued_at: new Date().toISOString() };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 2, 'succeeded', $3)", [run.id, pkgId, run]);
    const r = await post(carol, `/packages/${pkgId}/person-verifications`, { package_revision: 0, criteria: ALL, outcome: "pass", assertion });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("signature-mismatch");
  });

  it("counts preparation authors as originators", async () => {
    const pkg = (await h.db.query("select * from packages where id = $1", [pkgId])).rows[0];
    await tx(h.admin, (c) => appendEvent(c, "preparation.edited", pkgId, { kind: "human", id: "carol" }, {}));
    expect((await originators(h.db, pkg)).has("carol")).toBe(true);
  });

  it("refuses work that is not in verification", async () => {
    await h.admin.query("update packages set status = 'accepted' where id = $1", [pkgId]);
    const r = await verify(carol, carolKey, { package_revision: 0, criteria: ALL, outcome: "pass" });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("wrong-state");
  });
});

describe("the package view names who originated the work", () => {
  it("lists the capturer in originators", async () => {
    // Ben made the capture. Carol authored preparation in an earlier test.
    const r = await h.app.inject({ method: "GET", url: `/packages/${pkgId}`, headers: { cookie: carol } });
    expect(r.statusCode).toBe(200);
    expect(r.json().originators).toContain("ben");
  });

  it("lists nobody for a package with no human origin", async () => {
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-PV-NOORIG', 0, 'draft', $1)", [{ ...example, id: "WP-PV-NOORIG", revision: 0, status: "draft" }]);
    const r = await h.app.inject({ method: "GET", url: "/packages/WP-PV-NOORIG", headers: { cookie: carol } });
    expect(r.json().originators).toEqual([]);
  });
});

describe("reading a package's person verifications", () => {
  const get = (cookie: string, id: string) => h.app.inject({ method: "GET", url: `/packages/${id}/person-verifications`, headers: { cookie } });

  it("returns every recorded verification with its package revision and outcome, oldest first", async () => {
    const r = await get(carol, pkgId);
    expect(r.statusCode).toBe(200);
    const list = r.json();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.map((v: { outcome: string }) => v.outcome).slice(0, 2)).toEqual(["pass", "inconclusive"]);
    expect(list.every((v: { package_revision: number }) => v.package_revision === 0)).toBe(true);
    expect(list[0]).toMatchObject({ verifier_member_id: memberIdFor("carol"), criteria: ALL });
    const stored = (await h.db.query("select body->>'id' as id from person_verifications order by recorded_at, body->>'id'")).rows.map((x) => x.id);
    expect(list.map((v: { id: string }) => v.id)).toEqual(stored);
  });

  it("returns an empty list for a package with none", async () => {
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-PV-NONE', 0, 'draft', $1)", [{ ...example, id: "WP-PV-NONE", revision: 0, status: "draft" }]);
    const r = await get(carol, "WP-PV-NONE");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
  });

  it("answers not-found for an unknown package and for another organization's package", async () => {
    expect((await get(carol, "WP-PV-NOPE")).json()).toMatchObject({ code: "not-found" });
    await h.admin.query(`insert into organizations (body) values ('{"id":"orgpvother_x","name":"Other","status":"suspended"}')`);
    await h.admin.query("insert into object_owners (object_kind, object_id, org_id) values ('package', 'WP-PV-OTHER', 'orgpvother_x')");
    const r = await get(carol, "WP-PV-OTHER");
    expect(r.statusCode).toBe(404);
    expect(r.json().code).toBe("not-found");
    expect((await h.app.inject({ method: "GET", url: `/packages/${pkgId}/person-verifications` })).statusCode).toBe(401);
  });
});
