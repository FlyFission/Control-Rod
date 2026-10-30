import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { qualificationIdFor } from "../src/admin.js";
import { memberIdFor } from "../src/tenancy.js";
import { type Harness, ORIGIN, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

/** Administrative commands (workbench plan task 1.5; specification 10.2). */
let h: Harness;
let ben: string;
let alice: string;
const benKey = new VirtualAuthenticator();
const aliceKey = new VirtualAuthenticator();
const BEN = memberIdFor("ben");
const ALICE = memberIdFor("alice");

type Json = Record<string, any>;
const post = (cookie: string, url: string, payload: unknown) =>
  h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });

/** Signs and runs a Direct command: options over the exact payload, a passkey assertion, then the command. */
async function signed(cookie: string, key: VirtualAuthenticator, name: string, payload: Json) {
  const o = await post(cookie, `/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(cookie, `/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
}
const unsigned = (cookie: string, name: string, payload: Json) => post(cookie, `/admin/commands/${name}`, { payload });

/** Registers a passkey for another user name from a signed-in session, returning that user's session. */
async function addPerson(owner: string, name: string, key: VirtualAuthenticator): Promise<string> {
  const o = await post(owner, "/auth/register/options", { name });
  const r = await post(owner, "/auth/register/verify", key.register(o.json().options));
  expect(r.statusCode, r.body).toBe(200);
  return `cr_session=${r.cookies.find((c) => c.name === "cr_session")!.value}`;
}

const fullQualification = (member: string) => ({
  member_id: member, licenses: [], disciplines: ["mechanical"], grades: ["general-service", "safety"],
  roles: ["checker", "approver"], authorities: ["administrator", "lane", "policy"], reason: "owner records their own qualification",
});

beforeAll(async () => {
  h = await startHarness();
  ben = await signIn(h.app, benKey);
}, 120_000);
afterAll(async () => h?.stop());

describe("bootstrap", () => {
  it("lets the first Member qualify themselves while no one is an administrator, once", async () => {
    const state = (await h.app.inject({ method: "GET", url: "/admin", headers: { cookie: ben } })).json();
    expect(state.bootstrap).toBe(true);
    expect(state.themes).toContain("corner-cafe");
    const r = await signed(ben, benKey, "qualification.issue", fullQualification(BEN));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ id: qualificationIdFor(BEN), version: 1, authorities: ["administrator", "lane", "policy"] });
    const ev = await h.db.query("select body->'data' as d from events where body->>'type' = 'admin.command' and body->>'subject' = 'qualification.issue'");
    expect(ev.rows[0].d).toMatchObject({ signature: "direct", bootstrap: true });
    expect((await h.app.inject({ method: "GET", url: "/admin", headers: { cookie: ben } })).json().bootstrap).toBe(false);
  });

  it("does not let a second person bootstrap once an administrator exists", async () => {
    alice = await addPerson(ben, "alice", aliceKey);
    const r = await signed(alice, aliceKey, "qualification.issue", fullQualification(ALICE));
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("authority-missing");
  });
});

describe("signatures", () => {
  const payload = { name: "Signed project", mode: "software", default_rigor: "standard", lanes: ["internal"], qa_overlays: [] };
  it("refuses a Direct command with no passkey", async () => {
    const r = await unsigned(ben, "project.create", payload);
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("signature-required");
  });

  it("refuses a signature over a different payload", async () => {
    const o = await post(ben, "/admin/commands/project.create/options", { payload });
    const r = await post(ben, "/admin/commands/project.create", { payload: { ...payload, name: "Swapped" }, assertion: benKey.assert(o.json().options) });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("signature-mismatch");
  });

  it("refuses a signature issued for another command", async () => {
    const o = await post(ben, "/admin/commands/repo.bind/options", { payload });
    const r = await post(ben, "/admin/commands/project.create", { payload, assertion: benKey.assert(o.json().options) });
    expect(r.json().code).toBe("signature-required");
  });

  it("refuses a replayed signature", async () => {
    const o = await post(ben, "/admin/commands/project.create/options", { payload });
    const assertion = benKey.assert(o.json().options);
    expect((await post(ben, "/admin/commands/project.create", { payload, assertion })).statusCode).toBe(200);
    const again = await post(ben, "/admin/commands/project.create", { payload, assertion });
    expect(again.json().code).toBe("signature-required");
  });

  it("refuses an unknown command", async () => {
    expect((await post(ben, "/admin/commands/not.real/options", { payload: {} })).statusCode).toBe(404);
  });
});

describe("authority", () => {
  it.each([
    ["project.create", { name: "x", mode: "general", default_rigor: "quick", lanes: ["internal"], qa_overlays: [] }, "administrator"],
    ["member.enroll", { user_name: "carol" }, "administrator"],
    ["project.set-autonomy", { project_id: "prj_x", level: 1 }, "policy"],
    ["budget.set", { scope: "organization", scope_id: "org_local", mode: "track", limit: { value: "1", unit: "USD" }, period: "P1M" }, "policy"],
  ])("refuses %s to a Member without %s authority", async (name, payload, need) => {
    const r = await signed(alice, aliceKey, name, payload);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ code: "authority-missing" });
    expect(r.json().message).toContain(need);
  });
});

describe("commands", () => {
  let project: string;
  it("creates and updates a project and refuses unsafe autonomy", async () => {
    const created = await signed(ben, benKey, "project.create", { name: "Plant", mode: "capital-projects", default_rigor: "standard", lanes: ["internal", "proprietary"], qa_overlays: ["nqa-1"] });
    expect(created.statusCode, created.body).toBe(200);
    project = created.json().id;
    expect(created.json()).toMatchObject({ autonomy_level: 0, status: "active" });
    const updated = await signed(ben, benKey, "project.update", { project_id: project, default_rigor: "high-consequence" });
    expect(updated.json().default_rigor).toBe("high-consequence");
    expect((await signed(ben, benKey, "project.update", { project_id: project, autonomy_level: 3 })).json().autonomy_level).toBe(0);
    expect((await signed(ben, benKey, "project.set-autonomy", { project_id: project, level: 2 })).json()).toEqual({ project_id: project, autonomy_level: 2 });
    const four = await signed(ben, benKey, "project.set-autonomy", { project_id: project, level: 4 });
    expect(four.json().code).toBe("autonomy-floor");
  });

  it("changes the policy set only through an approved change request, and the policy caps autonomy", async () => {
    const policy = { hardware_attestation_formats: ["packed", "tpm"], settings: { autonomy_ceiling: "1" } };
    const proposed = await unsigned(ben, "policy.propose", { policy, reason: "cap autonomy while piloting", impact: ["all projects"] });
    expect(proposed.statusCode, proposed.body).toBe(200);
    const cr = proposed.json().id;
    const approved = await signed(ben, benKey, "policy.approve", { change_request_id: cr });
    expect(approved.json()).toMatchObject({ version: 1, settings: { autonomy_ceiling: "1" } });
    expect((await signed(ben, benKey, "policy.approve", { change_request_id: cr })).json().code).toBe("not-proposed");
    expect((await signed(ben, benKey, "project.set-autonomy", { project_id: project, level: 2 })).json().code).toBe("autonomy-ceiling");
  });

  it("binds and unbinds a repository", async () => {
    const bound = await signed(ben, benKey, "repo.bind", { project_id: project, url: "https://example.invalid/plant.git", default_branch: "main" });
    expect(bound.statusCode, bound.body).toBe(200);
    expect((await signed(ben, benKey, "repo.unbind", { binding_id: bound.json().id, reason: "moved" })).json().status).toBe("retired");
  });

  it("sets and updates a budget", async () => {
    const b = await signed(ben, benKey, "budget.set", { scope: "project", scope_id: project, mode: "alert", limit: { value: "100", unit: "USD" }, period: "P1M" });
    expect(b.statusCode, b.body).toBe(200);
    const u = await signed(ben, benKey, "budget.set", { budget_id: b.json().id, mode: "hard-cap", limit: { value: "80", unit: "USD" } });
    expect(u.json()).toMatchObject({ mode: "hard-cap", limit: { value: "80", unit: "USD" }, scope_id: project });
  });

  it("issues and revokes a qualification, and revocation voids pending challenges of that Member", async () => {
    const q = await signed(ben, benKey, "qualification.issue", { member_id: ALICE, licenses: [], disciplines: ["mechanical"], grades: ["general-service"], roles: ["checker"], authorities: [], reason: "checker" });
    expect(q.json()).toMatchObject({ member_id: ALICE, version: 1, roles: ["checker"] });
    await post(alice, "/admin/commands/theme.select/options", { payload: {} });
    const revoked = await signed(ben, benKey, "qualification.revoke", { member_id: ALICE, reason: "reassigned" });
    expect(revoked.json()).toMatchObject({ version: 2, revoked: true });
    expect((await h.db.query("select count(*)::int as n from challenges where purpose = 'admin' and data->>'member' = $1", [ALICE])).rows[0].n).toBe(0);
    await signed(ben, benKey, "qualification.issue", { member_id: ALICE, licenses: [], disciplines: ["mechanical"], grades: ["general-service"], roles: ["checker"], authorities: [], reason: "back on" });
  });

  it("delegates only a held role, and revokes the delegation", async () => {
    const none = await signed(alice, aliceKey, "delegation.create", { to_member_id: BEN, role: "approver", starts_on: "2026-11-01", ends_on: "2026-11-15", reason: "x" });
    expect(none.json().code).toBe("role-missing");
    const d = await signed(ben, benKey, "delegation.create", { to_member_id: ALICE, role: "approver", starts_on: "2026-11-01", ends_on: "2026-11-15", reason: "leave cover" });
    expect(d.statusCode, d.body).toBe(200);
    expect((await signed(ben, benKey, "delegation.revoke", { delegation_id: d.json().id, reason: "back early" })).json().revoked).toBe(true);
    expect((await signed(ben, benKey, "delegation.revoke", { delegation_id: d.json().id, reason: "again" })).json().code).toBe("already-revoked");
  });

  it("suspends and reactivates a Member, never the last administrator", async () => {
    expect((await signed(ben, benKey, "member.suspend", { member_id: BEN, reason: "x" })).json().code).toBe("last-administrator");
    expect((await signed(ben, benKey, "member.suspend", { member_id: ALICE, reason: "leave" })).json().status).toBe("suspended");
    const blocked = await unsigned(alice, "theme.select", { theme_id: "corner-cafe" });
    expect(blocked.json().code).toBe("member-inactive");
    expect((await signed(ben, benKey, "member.reactivate", { member_id: ALICE, reason: "back" })).json().status).toBe("active");
  });

  it("selects only a bundled office theme, recording its manifest digest", async () => {
    const r = await unsigned(alice, "theme.select", { theme_id: "corner-cafe" });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ theme_id: "corner-cafe", manifest_digest: { algorithm: "sha256" } });
    expect((await unsigned(alice, "theme.select", { theme_id: "not-a-theme" })).json().code).toBe("unknown-theme");
    const m = await h.db.query("select body from members where id = $1", [ALICE]);
    expect(m.rows[0].body.office_theme.theme_id).toBe("corner-cafe");
  });

  it("revokes a passkey, never the last one, and a revoked passkey cannot sign in", async () => {
    const own = (await h.db.query<{ id: string }>("select id from credentials where user_name = 'alice'")).rows[0]!.id;
    expect((await signed(alice, aliceKey, "credential.revoke", { credential_id: own, reason: "lost" })).json().code).toBe("last-credential");
    const spare = new VirtualAuthenticator();
    await addPerson(alice, "alice", spare);
    const r = await signed(alice, aliceKey, "credential.revoke", { credential_id: own, reason: "replaced" });
    expect(r.json()).toMatchObject({ revoked: true, version: 2 });
    const o = await h.app.inject({ method: "POST", url: "/auth/login/options", headers: { origin: ORIGIN } });
    expect(o.json().options.allowCredentials.map((c: { id: string }) => c.id)).not.toContain(own);
    const login = await h.app.inject({ method: "POST", url: "/auth/login/verify", headers: { origin: ORIGIN }, payload: aliceKey.assert(o.json().options) as object });
    expect(login.statusCode).toBe(401);
  });

  it("removes a Member: delegations end, sessions end, the membership is retired", async () => {
    const d = await signed(ben, benKey, "delegation.create", { to_member_id: ALICE, role: "checker", starts_on: "2026-11-01", ends_on: "2026-11-15", reason: "cover" });
    const removed = await signed(ben, benKey, "member.remove", { member_id: ALICE, reason: "left the company" });
    expect(removed.json()).toMatchObject({ status: "retired", delegations_revoked: 1 });
    expect((await h.db.query("select 1 from delegation_revocations where delegation_id = $1", [d.json().id])).rowCount).toBe(1);
    expect((await h.app.inject({ method: "GET", url: "/admin", headers: { cookie: alice } })).statusCode).toBe(401);
    expect((await signed(ben, benKey, "member.reactivate", { member_id: ALICE, reason: "x" })).json().code).toBe("member-retired");
  });

  it("enrolls a Member and refuses a second organization for now", async () => {
    expect((await signed(ben, benKey, "member.enroll", { user_name: "dana", display_name: "Dana" })).json()).toMatchObject({ id: memberIdFor("dana"), status: "active" });
    expect((await signed(ben, benKey, "org.create", { name: "Second" })).json().code).toBe("multi-organization-later");
  });

  it("records every administrative command as an event and the chain verifies", async () => {
    const { verifyChain } = await import("../src/events.js");
    const n = (await h.db.query("select count(*)::int as n from events where body->>'type' = 'admin.command'")).rows[0].n;
    expect(n).toBeGreaterThan(15);
    expect((await verifyChain(h.db)).ok).toBe(true);
  });
});
