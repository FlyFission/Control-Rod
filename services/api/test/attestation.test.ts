import { createHash, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadTrustAnchors } from "../src/attestation.js";
import { currentFloor } from "../src/authority.js";
import { memberIdFor } from "../src/tenancy.js";
import { type Harness, ORIGIN, VirtualAuthenticator, addOwnPasskey, signIn, startHarness, testAttestation } from "./harness.js";

/** Attested credential enrollment and the hardware key floor (workbench plan task 1.12; docs/sqa/authenticators.md). */
const vendor = testAttestation();
const stranger = testAttestation();

describe("trust anchors", () => {
  it("reads every certificate from the PEM files in a directory, and none from a missing one", () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-anchors-"));
    writeFileSync(join(dir, "vendor.pem"), vendor.anchorPem + stranger.anchorPem);
    writeFileSync(join(dir, "notes.txt"), vendor.anchorPem);
    expect(loadTrustAnchors(dir)).toHaveLength(2);
    expect(loadTrustAnchors(join(dir, "absent"))).toEqual([]);
  });
});

describe("enrollment", () => {
  let h: Harness;
  let ben: string;
  const plain = new VirtualAuthenticator();
  const hardware = new VirtualAuthenticator({ attestation: vendor });
  const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
  const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie: ben, origin: ORIGIN }, payload: payload as object });
  const record = async (key: VirtualAuthenticator) =>
    (await h.db.query("select body from authenticator_credentials where credential_id = $1 order by version desc limit 1", [key.credentialId.toString("base64url")])).rows[0]?.body;

  beforeAll(async () => {
    h = await startHarness({ trustAnchors: [vendor.anchorPem] });
    ben = await signIn(h.app, plain);
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-SAFE', 0, 'draft', $1)",
      [{ ...example, id: "WP-SAFE", revision: 0, status: "draft", grade: "safety" }]);
  }, 120_000);
  afterAll(async () => h?.stop());

  it("keeps a passkey registered without attestation out of the hardware floor", async () => {
    expect((await record(plain)).hardware_floor).toEqual({ eligible: false, reason: "registered without attestation; re-enroll with attestation" });
  });

  it("re-enrolls with an attested hardware key that chains to a retained anchor", async () => {
    expect((await addOwnPasskey(h.app, ben, plain, hardware)).statusCode).toBe(200);
    const r = await record(hardware);
    expect(r).toMatchObject({ attestation_format: "packed", backup_eligible: false, hardware_floor: { eligible: true, reason: "packed attestation verified" } });
    expect(r.aaguid).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.attestation_verified).toBe(true);
    const anchorDer = new X509Certificate(vendor.anchorPem).raw;
    expect(r.attestation_evidence.trust_anchor_digest.value).toBe(createHash("sha256").update(anchorDer).digest("hex"));
    expect(r.attestation_evidence.attestation_object.length).toBeGreaterThan(100);
  });

  it("refuses the floor to an attestation from an authenticator no anchor vouches for, and to a synced passkey", async () => {
    const unknown = new VirtualAuthenticator({ attestation: stranger });
    expect((await addOwnPasskey(h.app, ben, plain, unknown)).statusCode).toBe(200);
    expect((await record(unknown)).hardware_floor).toEqual({ eligible: false, reason: "packed attestation not verified against a retained trust anchor" });
    const synced = new VirtualAuthenticator({ attestation: vendor, synced: true });
    expect((await addOwnPasskey(h.app, ben, plain, synced)).statusCode).toBe(200);
    expect((await record(synced)).hardware_floor).toEqual({ eligible: false, reason: "synced (multi-device) credential; not hardware bound" });
  });

  it("signs Safety work only with the attested hardware key", async () => {
    const qual = { member_id: memberIdFor("ben"), licenses: [{ jurisdiction: "US-SC", number: "PE-1", expires_on: "2030-01-01" }],
      disciplines: ["mechanical-hvac"], grades: ["general-service", "safety"], roles: ["originator", "checker", "approver"],
      authorities: ["administrator", "lane", "policy"], reason: "licensed mechanical engineer" };
    const qo = await post("/admin/commands/qualification.issue/options", { payload: qual });
    expect((await post("/admin/commands/qualification.issue", { payload: qual, assertion: plain.assert(qo.json().options) })).statusCode).toBe(200);

    const release = async (key: VirtualAuthenticator) => {
      const o = await post("/packages/WP-SAFE/decisions/options", { kind: "release", package_revision: 0 });
      expect(o.statusCode, o.body).toBe(200);
      return post("/packages/WP-SAFE/decisions", { kind: "release", package_revision: 0, assertion: key.assert(o.json().options) });
    };
    const refused = await release(plain);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: "hardware-key-required", floor: true });
    expect(refused.json().message).toMatch(/Safety work must be signed with an attested hardware key; this passkey is not one \(registered without attestation/);
    const ok = await release(hardware);
    expect(ok.statusCode, ok.body).toBe(201);
  });

  it("applies a policy that drops the key's format at once", async () => {
    const hw = hardware.credentialId.toString("base64url");
    expect((await currentFloor(h.db, hw)).eligible).toBe(true);
    const p = await post("/admin/commands/policy.propose", { payload: { policy: { hardware_attestation_formats: ["tpm"], settings: {} }, reason: "TPM only", impact: [] } });
    expect(p.statusCode, p.body).toBe(200);
    const payload = { change_request_id: p.json().id };
    const o = await post("/admin/commands/policy.approve/options", { payload });
    expect((await post("/admin/commands/policy.approve", { payload, assertion: hardware.assert(o.json().options) })).statusCode).toBe(200);
    expect(await currentFloor(h.db, hw)).toEqual({ eligible: false, reason: "attestation format packed is not listed as hardware backed" });
  });
});

describe("with no trust anchors", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); }, 120_000);
  afterAll(async () => h?.stop());

  it("asks every authenticator for its attestation", async () => {
    const o = await h.app.inject({ method: "POST", url: "/auth/register/options", headers: { origin: ORIGIN }, payload: { name: "ben" } });
    expect(o.json().options.attestation).toBe("direct");
  });

  it("records the attestation but admits nothing to the floor, and the action says so", async () => {
    const hardware = new VirtualAuthenticator({ attestation: vendor });
    const ben = await signIn(h.app, hardware);
    const r = (await h.db.query("select body from authenticator_credentials where credential_id = $1", [hardware.credentialId.toString("base64url")])).rows[0].body;
    expect(r).toMatchObject({ attestation_format: "packed", hardware_floor: { eligible: false, reason: "packed attestation not verified against a retained trust anchor" } });
    const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-MAT', 0, 'draft', $1)", [{ ...example, id: "WP-MAT", revision: 0, status: "draft", grade: "material" }]);
    const qual = { member_id: memberIdFor("ben"), licenses: [], disciplines: ["mechanical-hvac"], grades: ["general-service", "material"],
      roles: ["approver"], authorities: ["administrator", "lane", "policy"], reason: "material grade" };
    const send = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie: ben, origin: ORIGIN }, payload: payload as object });
    const qo = await send("/admin/commands/qualification.issue/options", { payload: qual });
    expect((await send("/admin/commands/qualification.issue", { payload: qual, assertion: hardware.assert(qo.json().options) })).statusCode).toBe(200);
    const actions = (await h.app.inject({ method: "GET", url: "/packages/WP-MAT/actions", headers: { cookie: ben } })).json();
    expect(actions.find((a: { command: string }) => a.command === "release")).toMatchObject({ allowed: false, reason_code: "hardware-key-required", floor: true, missing: ["an attested hardware key"] });
  });
});
