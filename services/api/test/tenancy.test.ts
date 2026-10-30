import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tx } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { TENANCY_DOWN_SQL } from "../src/db/migrations/009-tenancy.js";
import { WORKBENCH_DOWN_SQL } from "../src/db/migrations/010-workbench.js";
import { verifyChain } from "../src/events.js";
import { digest } from "../src/kernel.js";
import {
  LOCAL_ORG, addMember, backfillCredentials, bindRepo, createOrganization, createProject, currentCredential,
  currentPolicySet, currentQualification, enrollMachine, hardwareFloor, memberIdFor, ownerOf,
  recordCreationMarking, recordCredential, recordDelegation, recordOwner, recordPolicySet, recordQualification,
  setStatus,
} from "../src/tenancy.js";
import { type Harness, ORIGIN, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

/** Tenancy, people and authority storage (workbench plan task 1.1). */
let h: Harness;
let cookie: string;
const passkey = new VirtualAuthenticator();
const admin = { kind: "human" as const, id: "owner" };

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, passkey);
}, 120_000);
afterAll(async () => h?.stop());

const capture = (text: string) =>
  h.app.inject({ method: "POST", url: "/captures", headers: { cookie, origin: ORIGIN }, payload: { text } });

/** Every signed body, digest and event as stored, for before and after comparison. */
async function snapshot() {
  const q = async (sql: string) => (await h.db.query(sql)).rows;
  return {
    events: await q("select seq, body, digest from events order by seq"),
    captures: await q("select id, body from captures order by id"),
    packages: await q("select id, revision, status, body from packages order by id, revision"),
    runs: await q("select id, body from runs order by id"),
    decisions: await q("select id, body from decisions order by id"),
    credentials: await q("select id, user_name, public_key, counter from credentials order by id"),
  };
}

describe("migration 009", () => {
  it("backfills ownership and members without rewriting any signed body, event or digest, down and up", async () => {
    expect((await capture("Seed one")).statusCode).toBe(201);
    expect((await capture("Seed two")).statusCode).toBe(201);
    const before = await snapshot();
    expect(before.captures.length).toBe(2);
    expect((await verifyChain(h.db)).ok).toBe(true);

    // Migrations reverse newest first: the workbench tables depend on tenancy.
    await h.db.query(WORKBENCH_DOWN_SQL);
    await h.db.query(TENANCY_DOWN_SQL);
    const down = await snapshot();
    expect(down).toEqual(before);
    expect((await verifyChain(h.db)).ok).toBe(true);
    const gone = await h.db.query("select to_regclass('organizations') as o, to_regclass('explorations') as e");
    expect(gone.rows[0]).toEqual({ o: null, e: null });

    await migrate(h.db);
    const up = await snapshot();
    expect(up).toEqual(before);
    expect((await verifyChain(h.db)).ok).toBe(true);

    for (const c of before.captures) expect(await ownerOf(h.db, "capture", c.id)).toEqual({ object_kind: "capture", object_id: c.id, org_id: LOCAL_ORG });
    for (const p of before.packages) expect((await ownerOf(h.db, "package", p.id))?.org_id).toBe(LOCAL_ORG);
    for (const r of before.runs) expect((await ownerOf(h.db, "run", r.id))?.org_id).toBe(LOCAL_ORG);
    const user = before.credentials[0]!.user_name as string;
    const member = await h.db.query("select body from members where id = $1", [memberIdFor(user)]);
    expect(member.rows[0].body).toMatchObject({ org_id: LOCAL_ORG, user_name: user, status: "active" });

    // The credential record is completed in code, appended after the unchanged chain.
    expect(await tx(h.db, backfillCredentials)).toBe(1);
    expect(await tx(h.db, backfillCredentials)).toBe(0);
    const after = await snapshot();
    expect(after.events.slice(0, before.events.length)).toEqual(before.events);
    expect((await verifyChain(h.db)).ok).toBe(true);
    const cred = await currentCredential(h.db, before.credentials[0]!.id as string);
    expect(cred).toMatchObject({ version: 1, attestation_format: "none", user_verified: true, hardware_floor: { eligible: false } });
    expect(cred).not.toHaveProperty("backup_eligible");
    expect(cred?.hardware_floor.reason).toMatch(/without attestation/);
  });

  it("owns records created afterwards and refuses to guess when ownership is ambiguous", async () => {
    const r = await capture("After migration");
    expect(r.statusCode).toBe(201);
    const id = (r.json() as { id: string }).id;
    expect((await ownerOf(h.db, "capture", id))?.org_id).toBe(LOCAL_ORG);

    await tx(h.db, (c) => createOrganization(c, { id: "org_second", name: "Second", status: "active" }, admin));
    await expect(h.db.query("insert into captures (id, body, created_at) values ('cap_x', '{}', now())")).rejects.toThrow(/ownership is ambiguous: 2/);
    await tx(h.db, (c) => setStatus(c, "organization", "org_second", "suspended", admin, "test"));
    await h.db.query("insert into captures (id, body, created_at) values ('cap_x', '{}', now())");
    expect((await ownerOf(h.db, "capture", "cap_x"))?.org_id).toBe(LOCAL_ORG);
  });
});

describe("registration", () => {
  it("records a second passkey for the same Member as credential version 1, ineligible for the hardware floor", async () => {
    const headers = { cookie, origin: ORIGIN };
    const o = await h.app.inject({ method: "POST", url: "/auth/register/options", headers, payload: { name: "ben" } });
    const reg = await h.app.inject({ method: "POST", url: "/auth/register/verify", headers, payload: new VirtualAuthenticator().register(o.json().options) });
    expect(reg.statusCode).toBe(200);
    const creds = await h.db.query<{ id: string; user_name: string }>("select id, user_name from credentials order by created_at");
    expect(creds.rows.length).toBe(2);
    const row = creds.rows[1]!;
    expect((await ownerOf(h.db, "credential", row.id))?.org_id).toBe(LOCAL_ORG);
    const cred = await currentCredential(h.db, row.id);
    expect(cred).toMatchObject({ version: 1, member_id: memberIdFor("ben"), attestation_format: "none", user_verified: true, backup_eligible: false });
    expect(cred?.hardware_floor).toEqual({ eligible: false, reason: "registered without attestation; re-enroll with attestation" });
    const ev = await h.db.query("select body from events where body->>'type' = 'authenticator-credential.recorded' and body->>'subject' = $1", [cred!.id]);
    expect(ev.rows[0].body.data).toMatchObject({ version: 1, eligible: false, digest: digest(cred) });
    expect((await h.db.query("select count(*)::int as n from members where user_name = 'ben'")).rows[0].n).toBe(1);
    expect((await verifyChain(h.db)).ok).toBe(true);
  });
});

describe("frozen versions", () => {
  const member = memberIdFor("qualified-person");
  it("issues contiguous qualification versions; revocation is a new version", async () => {
    await tx(h.db, (c) => addMember(c, { id: member, org_id: LOCAL_ORG, user_name: "qualified-person", display_name: "Qualified Person", status: "active" }, admin));
    const base = {
      id: "qual_qp", org_id: LOCAL_ORG, member_id: member,
      licenses: [{ jurisdiction: "US-SC", number: "PE-1", discipline: "mechanical", expires_on: "2028-06-30" }],
      disciplines: ["mechanical"], grades: ["general-service" as const], roles: ["checker" as const],
      authorities: ["administrator" as const, "lane" as const, "policy" as const], revoked: false, reason: "initial",
    };
    const v1 = await tx(h.db, (c) => recordQualification(c, base, admin));
    const v2 = await tx(h.db, (c) => recordQualification(c, { ...base, grades: ["general-service", "safety"], reason: "added safety" }, admin));
    expect([v1.record.version, v2.record.version]).toEqual([1, 2]);
    expect((await currentQualification(h.db, member))?.grades).toEqual(["general-service", "safety"]);
    await tx(h.db, (c) => recordQualification(c, { ...base, revoked: true, reason: "license lapsed" }, admin));
    expect(await currentQualification(h.db, member)).toBeNull();
  });

  it("refuses edits, deletes and version gaps at the database", async () => {
    await expect(h.db.query("update signer_qualifications set body = body where id = 'qual_qp'")).rejects.toThrow(/append only/);
    await expect(h.db.query("delete from signer_qualifications where id = 'qual_qp'")).rejects.toThrow(/append only/);
    await expect(h.db.query("delete from object_owners")).rejects.toThrow(/append only/);
    await expect(
      h.db.query("insert into signer_qualifications (id, version, org_id, member_id, body, digest) select id, 9, org_id, member_id, body, 'x' from signer_qualifications where id = 'qual_qp' and version = 1"),
    ).rejects.toThrow(/version 9 does not follow 3/);
  });

  it("keeps every frozen digest recomputable from its stored body", async () => {
    await tx(h.db, (c) => recordPolicySet(c, { id: "pol_local", org_id: LOCAL_ORG, hardware_attestation_formats: ["packed", "tpm"], settings: { autonomy_ceiling: "3" }, reason: "initial" }, admin));
    const delegate = memberIdFor(String((await h.db.query("select user_name from credentials limit 1")).rows[0].user_name));
    await tx(h.db, (c) => recordDelegation(c, {
      id: "del_one", org_id: LOCAL_ORG, from_member_id: member, to_member_id: delegate,
      role: "checker", starts_on: "2026-11-01", ends_on: "2026-11-15", reason: "leave cover",
    }, admin));
    for (const table of ["signer_qualifications", "authenticator_credentials", "policy_sets", "delegations"]) {
      const rows = (await h.db.query<{ body: unknown; digest: string }>(`select body, digest from ${table}`)).rows;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(digest(r.body)).toBe(r.digest);
    }
    expect((await currentPolicySet(h.db, LOCAL_ORG))?.record.version).toBe(1);
  });
});

describe("lifecycled identities and envelopes", () => {
  it("validates bodies against the generated contract", async () => {
    const project = { id: "prj_one", org_id: LOCAL_ORG, name: "One", mode: "software" as const, default_rigor: "standard" as const, lanes: ["internal" as const], qa_overlays: [], autonomy_level: 2, status: "active" as const };
    await expect(tx(h.db, (c) => createProject(c, { ...project, autonomy_level: 4 }, admin))).rejects.toThrow(/Project.json refused: \/autonomy_level/);
    await expect(tx(h.db, (c) => createProject(c, { ...project, lanes: [] }, admin))).rejects.toThrow(/Project.json refused: \/lanes/);
    await tx(h.db, (c) => createProject(c, project, admin));
    await expect(tx(h.db, (c) => bindRepo(c, { id: "rb_x", org_id: "org_second", project_id: "prj_one", url: "https://example.invalid/x.git", default_branch: "main", status: "active" }, admin))).rejects.toThrow(/not in organization/);
    await tx(h.db, (c) => bindRepo(c, { id: "rb_one", org_id: LOCAL_ORG, project_id: "prj_one", url: "https://example.invalid/one.git", default_branch: "main", status: "active" }, admin));
    await tx(h.db, (c) => enrollMachine(c, { id: "mac_host", org_id: LOCAL_ORG, name: "WSL2 host", status: "active" }, admin));
    await expect(tx(h.db, (c) => recordDelegation(c, { id: "del_bad", org_id: LOCAL_ORG, from_member_id: memberIdFor("qualified-person"), to_member_id: memberIdFor("qualified-person"), role: "checker", starts_on: "2026-11-01", ends_on: "2026-11-02", reason: "self" }, admin))).rejects.toThrow(/check constraint/);
    await expect(tx(h.db, (c) => recordDelegation(c, { id: "del_late", org_id: LOCAL_ORG, from_member_id: memberIdFor("qualified-person"), to_member_id: memberIdFor("other"), role: "checker", starts_on: "2026-11-02", ends_on: "2026-11-01", reason: "backwards" }, admin))).rejects.toThrow(/ends before it starts/);
  });

  it("changes state only through setStatus, each change an event, retirement final", async () => {
    await tx(h.db, (c) => setStatus(c, "machine", "mac_host", "retired", admin, "decommissioned"));
    await expect(tx(h.db, (c) => setStatus(c, "machine", "mac_host", "active", admin, "again"))).rejects.toThrow(/retirement is final/);
    const ev = await h.db.query("select body from events where body->>'type' = 'machine.status-changed' and body->>'subject' = 'mac_host'");
    expect(ev.rows[0].body.data).toEqual({ from: "active", to: "retired", reason: "decommissioned" });
  });

  it("keeps ownership and creation markings immutable and beside the record", async () => {
    await tx(h.db, (c) => recordOwner(c, { object_kind: "notebook", object_id: "nb_1", org_id: LOCAL_ORG, project_id: "prj_one" }));
    expect(await ownerOf(h.db, "notebook", "nb_1")).toEqual({ object_kind: "notebook", object_id: "nb_1", org_id: LOCAL_ORG, project_id: "prj_one" });
    await expect(tx(h.db, (c) => recordOwner(c, { object_kind: "notebook", object_id: "nb_1", org_id: "org_second" }))).rejects.toThrow(/duplicate key/);
    await tx(h.db, (c) => recordCreationMarking(c, "notebook", "nb_1", "proprietary", "client drawings"));
    await expect(h.db.query("update object_markings set body = body")).rejects.toThrow(/append only/);
  });
});

describe("hardware key floor", () => {
  const listed = ["packed", "fido-u2f", "tpm"] as const;
  it.each([
    ["none", true, false, false, /without attestation/],
    ["packed", false, true, false, /synced/],
    ["packed", false, undefined, false, /not recorded/],
    ["apple", true, false, false, /not listed/],
    ["tpm", false, false, false, /not verified/],
    ["tpm", true, false, true, /verified/],
    ["fido-u2f", true, false, true, /verified/],
  ] as const)("%s, verified %s, synced %s: eligible %s", (format, verified, synced, eligible, reason) => {
    const v = hardwareFloor({ format, attestationVerified: verified, backupEligible: synced, listedFormats: listed });
    expect(v.eligible).toBe(eligible);
    expect(v.reason).toMatch(reason);
  });

  it("reads the organization's policy set for listed formats", async () => {
    const id = (await h.db.query("select id from credentials limit 1")).rows[0].id as string;
    const user = (await h.db.query("select user_name from credentials where id = $1", [id])).rows[0].user_name as string;
    // pol_local lists packed and tpm only, so a verified fido-u2f statement is refused here.
    const r = await tx(h.db, (c) => recordCredential(c, { orgId: LOCAL_ORG, memberId: memberIdFor(user), credentialId: id, format: "fido-u2f", userVerified: true, backupEligible: false, attestationVerified: true }, admin));
    expect(r.record.version).toBe(2);
    expect(r.record.hardware_floor).toEqual({ eligible: false, reason: "attestation format fido-u2f is not listed as hardware backed" });
  });
});
