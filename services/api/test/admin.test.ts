import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { qualificationIdFor } from "../src/admin.js";
import { memberIdFor } from "../src/tenancy.js";
import { type Harness, ORIGIN, VirtualAuthenticator, addOwnPasskey, logIn, registerWithInvitation, signIn, startHarness } from "./harness.js";

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

/** Enrolls a new person and lets them register with the invitation; returns their session. */
async function addPerson(name: string, key: VirtualAuthenticator): Promise<string> {
  const r = await signed(ben, benKey, "member.enroll", { user_name: name });
  expect(r.statusCode, r.body).toBe(200);
  return registerWithInvitation(h.app, r.json().invitation.token, key);
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
  it("starts the first Member with founding authorities, who then records their own roles", async () => {
    const state = (await h.app.inject({ method: "GET", url: "/admin", headers: { cookie: ben } })).json();
    expect(state.bootstrap).toBe(false);
    expect(state.themes).toContain("corner-cafe");
    // People see labels, never command names alone, and the floors in force.
    expect(state.actions.find((x: { command: string }) => x.command === "scram.pull")).toMatchObject({ label: "Pull SCRAM", allowed: true });
    expect(state.commands.every((c: { label: string; name: string }) => c.label.length > 0 && c.label !== c.name)).toBe(true);
    expect(state.floors.map((f: { code: string }) => f.code)).toEqual(expect.arrayContaining(["not-human", "not-independent", "autonomy-floor"]));
    // A command refused for everyone is never offered, even to an administrator.
    expect(state.actions.find((x: { command: string }) => x.command === "org.create")).toMatchObject({ allowed: false, reason_code: "multi-organization-later" });
    expect(state.qualification).toMatchObject({ version: 1, authorities: ["administrator", "lane", "policy"], roles: ["originator", "checker", "approver"], grades: ["general-service"], disciplines: [], licenses: [], reason: "founding member of the organization" });
    const r = await signed(ben, benKey, "qualification.issue", fullQualification(BEN));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ id: qualificationIdFor(BEN), version: 2, roles: ["checker", "approver"] });
    const ev = await h.db.query("select body->'data' as d from events where body->>'type' = 'admin.command' and body->>'subject' = 'qualification.issue'");
    expect(ev.rows[0].d).toMatchObject({ signature: "direct" });
    expect(ev.rows[0].d.bootstrap).toBeUndefined();
  });

  it("does not let a second person bootstrap once an administrator exists", async () => {
    alice = await addPerson("alice", aliceKey);
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
    ["member.invite", { member_id: "mem_x" }, "administrator"],
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
    const none = await signed(alice, aliceKey, "delegation.create", { to_member_id: BEN, role: "approver", discipline: "mechanical", starts_on: "2026-11-01", ends_on: "2026-11-15", reason: "x" });
    expect(none.json().code).toBe("role-missing");
    expect((await signed(ben, benKey, "delegation.create", { to_member_id: ALICE, role: "approver", discipline: "electrical", starts_on: "2026-11-01", ends_on: "2026-11-15", reason: "x" })).json().code).toBe("discipline-missing");
    expect((await signed(ben, benKey, "delegation.create", { to_member_id: ALICE, role: "approver", discipline: "mechanical", starts_on: "2026-11-15", ends_on: "2026-11-01", reason: "x" })).json().code).toBe("invalid-dates");
    const d = await signed(ben, benKey, "delegation.create", { to_member_id: ALICE, role: "approver", discipline: "mechanical", starts_on: "2026-11-01", ends_on: "2026-11-15", reason: "leave cover" });
    expect(d.statusCode, d.body).toBe(200);
    expect((await signed(ben, benKey, "delegation.revoke", { delegation_id: d.json().id, reason: "back early" })).json().revoked).toBe(true);
    expect((await signed(ben, benKey, "delegation.revoke", { delegation_id: d.json().id, reason: "again" })).json().code).toBe("already-revoked");
  });

  it("suspends and reactivates a Member, never the last administrator", async () => {
    expect((await signed(ben, benKey, "member.suspend", { member_id: BEN, reason: "x" })).json().code).toBe("last-administrator");
    expect((await signed(ben, benKey, "member.suspend", { member_id: ALICE, reason: "leave" })).json().status).toBe("suspended");
    // Suspension ends the session at once.
    const blocked = await unsigned(alice, "theme.select", { theme_id: "corner-cafe" });
    expect(blocked.statusCode).toBe(401);
    expect((await signed(ben, benKey, "member.reactivate", { member_id: ALICE, reason: "back" })).json().status).toBe("active");
    alice = await logIn(h.app, aliceKey);
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
    expect((await addOwnPasskey(h.app, alice, aliceKey, spare)).statusCode).toBe(200);
    const r = await signed(alice, aliceKey, "credential.revoke", { credential_id: own, reason: "replaced" });
    expect(r.json()).toMatchObject({ revoked: true, version: 2 });
    const o = await h.app.inject({ method: "POST", url: "/auth/login/options", headers: { origin: ORIGIN } });
    expect(o.json().options.allowCredentials.map((c: { id: string }) => c.id)).not.toContain(own);
    const login = await h.app.inject({ method: "POST", url: "/auth/login/verify", headers: { origin: ORIGIN }, payload: aliceKey.assert(o.json().options) as object });
    expect(login.statusCode).toBe(401);
  });

  it("removes a Member: delegations end, sessions end, the membership is retired", async () => {
    const d = await signed(ben, benKey, "delegation.create", { to_member_id: ALICE, role: "checker", discipline: "mechanical", starts_on: "2026-11-01", ends_on: "2026-11-15", reason: "cover" });
    const removed = await signed(ben, benKey, "member.remove", { member_id: ALICE, reason: "left the company" });
    expect(removed.json()).toMatchObject({ status: "retired", delegations_revoked: 1 });
    expect((await h.db.query("select 1 from delegation_revocations where delegation_id = $1", [d.json().id])).rowCount).toBe(1);
    expect((await h.app.inject({ method: "GET", url: "/admin", headers: { cookie: alice } })).statusCode).toBe(401);
    expect((await signed(ben, benKey, "member.reactivate", { member_id: ALICE, reason: "x" })).json().code).toBe("member-retired");
  });

  it("enrolls a Member and refuses a second organization for now", async () => {
    const enrolled = (await signed(ben, benKey, "member.enroll", { user_name: "dana", display_name: "Dana" })).json();
    expect(enrolled.member).toMatchObject({ id: memberIdFor("dana"), status: "active" });
    expect(enrolled.invitation.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await signed(ben, benKey, "org.create", { name: "Second" })).json().code).toBe("multi-organization-later");
  });

  it("records every administrative command as an event and the chain verifies", async () => {
    const { verifyChain } = await import("../src/events.js");
    const n = (await h.db.query("select count(*)::int as n from events where body->>'type' = 'admin.command'")).rows[0].n;
    expect(n).toBeGreaterThan(15);
    expect((await verifyChain(h.db)).ok).toBe(true);
  });
});

describe("review findings", () => {
  let carol: string;
  const carolKey = new VirtualAuthenticator({ fixedCounter: true });
  const CAROL = memberIdFor("carol");

  it("SEC-01: a signed-in Member cannot register a passkey for anyone else, or without signing first", async () => {
    carol = await addPerson("carol", carolKey);
    const asCarol = (payload: unknown) => post(carol, "/auth/register/options", payload);
    expect((await asCarol({ name: "ben" })).json().code).toBe("own-account-only");
    expect((await asCarol({})).json().code).toBe("step-up-required");
    const s = await post(ben, "/auth/step-up/options", {});
    expect((await asCarol({ step_up: benKey.assert(s.json().options) })).json().code).toBe("step-up-failed");
  });

  it("SEC-01: an invitation works once and expires", async () => {
    const r = await signed(ben, benKey, "member.enroll", { user_name: "erin" });
    const token = r.json().invitation.token;
    await registerWithInvitation(h.app, token, new VirtualAuthenticator());
    const again = await h.app.inject({ method: "POST", url: "/auth/register/options", headers: { origin: ORIGIN }, payload: { invitation: token } });
    expect(again.json().code).toBe("invitation-invalid");
    const late = await signed(ben, benKey, "member.enroll", { user_name: "gina" });
    await h.admin.query("update member_invitations set expires_at = now() - interval '1 minute' where member_id = $1 and used_at is null", [memberIdFor("gina")]);
    const expired = await h.app.inject({ method: "POST", url: "/auth/register/options", headers: { origin: ORIGIN }, payload: { invitation: late.json().invitation.token } });
    expect(expired.json().code).toBe("invitation-invalid");
  });

  it("SEC-02: a qualification in another organization cannot be revoked from this one", async () => {
    await h.admin.query(`insert into organizations (body) values ('{"id":"org_other","name":"Other","status":"suspended"}')`);
    const other = memberIdFor("outsider");
    await h.admin.query("insert into members (body) values ($1)", [{ id: other, org_id: "org_other", user_name: "outsider", display_name: "Outsider", status: "active" }]);
    expect((await signed(ben, benKey, "qualification.revoke", { member_id: other, reason: "x" })).json().code).toBe("not-found");
  });

  it("SEC-03: bootstrap is used up once the first administrator exists", async () => {
    const r = await signed(carol, carolKey, "qualification.issue", fullQualification(CAROL));
    expect(r.json().code).toBe("authority-missing");
  });

  it("SEC-04: reissuing a qualification cannot drop the last administrator", async () => {
    const q = { ...fullQualification(BEN), authorities: ["policy"], reason: "drop admin" };
    expect((await signed(ben, benKey, "qualification.issue", q)).json().code).toBe("last-administrator");
  });

  it("SEC-05: two administrators suspending each other at once leaves one administrator", async () => {
    await signed(ben, benKey, "qualification.issue", { ...fullQualification(CAROL), reason: "second administrator" });
    const payloadA = { member_id: CAROL, reason: "a" }, payloadB = { member_id: BEN, reason: "b" };
    const oa = await post(ben, "/admin/commands/member.suspend/options", { payload: payloadA });
    const ob = await post(carol, "/admin/commands/member.suspend/options", { payload: payloadB });
    const [ra, rb] = await Promise.all([
      post(ben, "/admin/commands/member.suspend", { payload: payloadA, assertion: benKey.assert(oa.json().options) }),
      post(carol, "/admin/commands/member.suspend", { payload: payloadB, assertion: carolKey.assert(ob.json().options) }),
    ]);
    const codes = [ra, rb].map((r) => (r.statusCode === 200 ? "ok" : r.json().code));
    // The first to take the lock suspends the other, whose request then finds itself inactive.
    expect(codes.filter((x) => x === "ok")).toHaveLength(1);
    expect(["last-administrator", "signed-out", "member-inactive", "signature-revoked", "signature-required"]).toContain(codes.find((x) => x !== "ok"));
    const admins = (await h.db.query("select count(*)::int as n from members where id in ($1, $2) and body->>'status' = 'active'", [BEN, CAROL])).rows[0].n;
    expect(admins).toBe(1);
  });

  it("SEC-07: a suspended Member's session and fresh sign-in are refused", async () => {
    const suspended = (await h.db.query("select id from members where id in ($1, $2) and body->>'status' = 'suspended'", [BEN, CAROL])).rows[0].id;
    const [cookie, key] = suspended === CAROL ? [carol, carolKey] : [ben, benKey];
    expect((await h.app.inject({ method: "GET", url: "/admin", headers: { cookie } })).statusCode).toBe(401);
    const o = await h.app.inject({ method: "POST", url: "/auth/login/options", headers: { origin: ORIGIN } });
    const login = await h.app.inject({ method: "POST", url: "/auth/login/verify", headers: { origin: ORIGIN }, payload: key.assert(o.json().options) as object });
    expect(login.statusCode).toBe(401);
    // Restore: the remaining administrator reactivates the other and signs back in.
    const [adminCookie, adminKey] = suspended === CAROL ? [ben, benKey] : [carol, carolKey];
    expect((await signed(adminCookie, adminKey, "member.reactivate", { member_id: suspended, reason: "restore" })).json().status).toBe("active");
    const o2 = await h.app.inject({ method: "POST", url: "/auth/login/options", headers: { origin: ORIGIN } });
    const back = await h.app.inject({ method: "POST", url: "/auth/login/verify", headers: { origin: ORIGIN }, payload: key.assert(o2.json().options) as object });
    expect(back.statusCode).toBe(200);
    const cookieBack = `cr_session=${back.cookies.find((c) => c.name === "cr_session")!.value}`;
    if (suspended === CAROL) carol = cookieBack; else ben = cookieBack;
  });

  it("SEC-09: a signature obtained before a revocation cannot be redeemed after it", async () => {
    const payload = { name: "Late project", mode: "general", default_rigor: "quick", lanes: ["internal"], qa_overlays: [] };
    const o = await post(carol, "/admin/commands/project.create/options", { payload });
    const assertion = carolKey.assert(o.json().options);
    await signed(ben, benKey, "qualification.revoke", { member_id: CAROL, reason: "no longer an administrator" });
    const r = await post(carol, "/admin/commands/project.create", { payload, assertion });
    expect(r.statusCode).toBe(403);
    expect(["signature-required", "authority-missing"]).toContain(r.json().code);
  });

  it("SEC-15: a replayed signature is refused even when the passkey counter stays at zero", async () => {
    const payload = { theme_id: "corner-cafe" };
    const o = await post(carol, "/admin/commands/delegation.revoke/options", { payload });
    const assertion = carolKey.assert(o.json().options);
    await post(carol, "/admin/commands/delegation.revoke", { payload, assertion });
    const again = await post(carol, "/admin/commands/delegation.revoke", { payload, assertion });
    expect(again.json().code).toBe("signature-required");
  });

  it("SEC-12: one change request is approved once, even when approved twice at the same moment", async () => {
    const cr = (await unsigned(ben, "policy.propose", { policy: { hardware_attestation_formats: ["packed"], settings: { autonomy_ceiling: "2" } }, reason: "relax" })).json().id;
    const payload = { change_request_id: cr };
    const [o1, o2] = [await post(ben, "/admin/commands/policy.approve/options", { payload }), await post(ben, "/admin/commands/policy.approve/options", { payload })];
    const [r1, r2] = await Promise.all([
      post(ben, "/admin/commands/policy.approve", { payload, assertion: benKey.assert(o1.json().options) }),
      post(ben, "/admin/commands/policy.approve", { payload, assertion: benKey.assert(o2.json().options) }),
    ]);
    const codes = [r1, r2].map((r) => (r.statusCode === 200 ? "ok" : r.json().code)).sort();
    expect(codes).toEqual(["not-proposed", "ok"]);
  });

  it("SEC-13: policy settings are typed; unknown or invalid values are refused", async () => {
    expect((await unsigned(ben, "policy.propose", { policy: { settings: { autonomy_ceiling: "invalid" } }, reason: "x" })).json().code).toBe("invalid-setting");
    expect((await unsigned(ben, "policy.propose", { policy: { settings: { autonomy_ceilng: "1" } }, reason: "x" })).json().code).toBe("unknown-setting");
  });

  it("SEC-14: expected refusals are answers, not server errors", async () => {
    const dup = await signed(ben, benKey, "member.enroll", { user_name: "carol" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe("conflict");
    const badRepo = await signed(ben, benKey, "repo.bind", { project_id: "prj_missing", url: "https://example.invalid/x.git", default_branch: "main" });
    expect(badRepo.statusCode).toBeLessThan(500);
  });
});

describe("review round 2", () => {
  const frank = new VirtualAuthenticator();
  const FRANK = memberIdFor("frank");
  let frankCookie: string;

  it("invitations are only for a first passkey: an account with one cannot be taken over", async () => {
    frankCookie = await addPerson("frank", frank);
    const r = await signed(ben, benKey, "member.invite", { member_id: FRANK });
    expect(r.json().code).toBe("member-has-passkey");
    // An invitation issued earlier cannot be redeemed once the member has a passkey.
    await h.admin.query(
      "insert into member_invitations (token_hash, member_id, org_id, issued_by, expires_at) values (encode(sha256('stale-token'), 'hex'), $1, 'org_local', $2, now() + interval '1 day')",
      [FRANK, BEN]);
    const o = await h.app.inject({ method: "POST", url: "/auth/register/options", headers: { origin: ORIGIN }, payload: { invitation: "stale-token" } });
    const v = await h.app.inject({ method: "POST", url: "/auth/register/verify", headers: { origin: ORIGIN }, payload: new VirtualAuthenticator().register(o.json().options) as object });
    expect(v.statusCode).toBe(403);
    expect(v.json().code).toBe("registration-refused");
  });

  it("a pending passkey addition dies with the suspension of its member", async () => {
    const s = await post(frankCookie, "/auth/step-up/options", {});
    const o = await post(frankCookie, "/auth/register/options", { step_up: frank.assert(s.json().options) });
    expect(o.statusCode).toBe(200);
    await signed(ben, benKey, "member.suspend", { member_id: FRANK, reason: "investigation" });
    const v = await h.app.inject({ method: "POST", url: "/auth/register/verify", headers: { origin: ORIGIN }, payload: new VirtualAuthenticator().register(o.json().options) as object });
    expect(v.statusCode).toBeGreaterThanOrEqual(400);
    expect(v.statusCode).toBeLessThan(500);
    expect((await h.db.query("select count(*)::int as n from credentials where user_name = 'frank'")).rows[0].n).toBe(1);
    await signed(ben, benKey, "member.reactivate", { member_id: FRANK, reason: "cleared" });
    frankCookie = await logIn(h.app, frank);
  });

  it("revocation voids every challenge issued to the person, not only administrative ones", async () => {
    await post(frankCookie, "/auth/step-up/options", {});
    await signed(ben, benKey, "qualification.issue", { member_id: FRANK, licenses: [], disciplines: ["mechanical"], grades: ["general-service"], roles: ["checker"], authorities: [], reason: "checker" });
    expect((await h.db.query("select count(*)::int as n from challenges where data->>'issued_to' = 'frank'")).rows[0].n).toBeGreaterThan(0);
    await signed(ben, benKey, "qualification.revoke", { member_id: FRANK, reason: "reassigned" });
    expect((await h.db.query("select count(*)::int as n from challenges where data->>'issued_to' = 'frank'")).rows[0].n).toBe(0);
  });

  it("a null policy setting is refused, not a server error", async () => {
    const r = await unsigned(ben, "policy.propose", { policy: { settings: null }, reason: "x" });
    expect(r.statusCode).toBe(400);
  });

  it("a replay is refused after a successful first use, with a passkey whose counter stays at zero", async () => {
    const zero = new VirtualAuthenticator({ fixedCounter: true });
    expect((await addOwnPasskey(h.app, ben, benKey, zero)).statusCode).toBe(200);
    const payload = { name: "Zero counter project", mode: "general", default_rigor: "quick", lanes: ["internal"], qa_overlays: [] };
    const o = await post(ben, "/admin/commands/project.create/options", { payload });
    const assertion = zero.assert(o.json().options);
    expect((await post(ben, "/admin/commands/project.create", { payload, assertion })).statusCode).toBe(200);
    expect((await post(ben, "/admin/commands/project.create", { payload, assertion })).json().code).toBe("signature-required");
  });

  it("two passkeys revoked at once never leaves a member with none", async () => {
    const second = new VirtualAuthenticator();
    expect((await addOwnPasskey(h.app, frankCookie, frank, second)).statusCode).toBe(200);
    const ids = (await h.db.query<{ id: string }>("select id from credentials where user_name = 'frank' order by created_at")).rows.map((r) => r.id);
    expect(ids).toHaveLength(2);
    const payloads = ids.map((credential_id) => ({ credential_id, reason: "rotate" }));
    const opts: { json: () => { options: never } }[] = [];
    for (const p of payloads) opts.push(await post(frankCookie, "/admin/commands/credential.revoke/options", { payload: p }));
    const results = await Promise.all(payloads.map((p, i) => post(frankCookie, "/admin/commands/credential.revoke", { payload: p, assertion: (i === 0 ? second : frank).assert(opts[i]!.json().options) })));
    const codes = results.map((r) => (r.statusCode === 200 ? "ok" : r.json().code));
    expect(codes.filter((c) => c === "ok")).toHaveLength(1);
    const usable = (await h.db.query(
      `select count(*)::int as n from (select distinct on (credential_id) body from authenticator_credentials where member_id = $1 order by credential_id, version desc) x
        where (body->>'revoked')::boolean is not true`, [FRANK])).rows[0].n;
    expect(usable).toBe(1);
  });

  it("a removed member cannot sign in again with a passkey that was never revoked", async () => {
    await signed(ben, benKey, "member.remove", { member_id: FRANK, reason: "left" });
    const o = await h.app.inject({ method: "POST", url: "/auth/login/options", headers: { origin: ORIGIN } });
    const login = await h.app.inject({ method: "POST", url: "/auth/login/verify", headers: { origin: ORIGIN }, payload: frank.assert(o.json().options) as object });
    expect(login.statusCode).toBe(401);
  });
});

describe("review round 3", () => {
  it("a challenge issued to one person cannot be answered with another person's passkey", async () => {
    const harry = new VirtualAuthenticator();
    const harryCookie = await addPerson("harry", harry);
    const s = await post(harryCookie, "/auth/step-up/options", {});
    // Ben's passkey answers Harry's challenge, submitted from Ben's session: refused.
    const r = await post(ben, "/auth/register/options", { step_up: benKey.assert(s.json().options) });
    expect(r.statusCode).toBe(403);
    // The same holds for an administrative challenge, for the same command and payload.
    const payload = { name: "Crossed", mode: "general", default_rigor: "quick", lanes: ["internal"], qa_overlays: [] };
    const o = await post(harryCookie, "/admin/commands/project.create/options", { payload });
    const crossed = await post(ben, "/admin/commands/project.create", { payload, assertion: benKey.assert(o.json().options) });
    expect(crossed.json().code).toBe("signature-required");
  });

  it("a policy setting named after a built in property is refused, not a server error", async () => {
    const r = await unsigned(ben, "policy.propose", { policy: { settings: { toString: "1" } }, reason: "x" });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe("unknown-setting");
  });
});
