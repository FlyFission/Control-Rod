import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { gapsIn } from "../src/authority.js";
import type { SignerQualification } from "../src/tenancy.js";
import { memberIdFor } from "../src/tenancy.js";
import { type Harness, ORIGIN, VirtualAuthenticator, registerWithInvitation, signIn, startHarness } from "./harness.js";

/** Signing authority in commands (workbench plan task 1.14; specification 11.1 G-4, WB-05). */
const q = (over: Partial<SignerQualification> = {}): SignerQualification => ({
  id: "qual_x", version: 1, org_id: "org_local", member_id: "mem_x", licenses: [], disciplines: [], grades: ["general-service"],
  roles: ["approver"], authorities: [], revoked: false, reason: "test", effective_at: "2026-10-30T00:00:00Z", ...over,
});
const today = new Date("2026-10-30T12:00:00Z");

describe("gaps", () => {
  it("names each missing qualification for the action and the subject", () => {
    expect(gapsIn(null, "release", {})).toEqual(["a signer qualification"]);
    expect(gapsIn(q(), "release", {}, today)).toEqual([]);
    expect(gapsIn(q({ roles: ["checker"] }), "release", {}, today)).toEqual(["the approver or engineer in responsible charge role"]);
    expect(gapsIn(q({ roles: ["checker"] }), "return", {}, today)).toEqual([]);
    expect(gapsIn(q({ roles: ["originator"] }), "reject", {}, today)).toEqual(["the checker, approver or engineer in responsible charge role"]);
    expect(gapsIn(q(), "accept", { grade: "safety", discipline: "mechanical" }, today)).toEqual([
      "the Safety grade", "the mechanical discipline", "a current professional license for mechanical",
    ]);
    // General service work does not ask for a discipline.
    expect(gapsIn(q(), "accept", { discipline: "mechanical" }, today)).toEqual([]);
    expect(gapsIn(q({ grades: ["material"] }), "accept", { grade: "material", discipline: "civil" }, today)).toEqual(["the civil discipline"]);
  });

  it("accepts only a license that is current and matches the discipline", () => {
    const safety = { grades: ["safety" as const], disciplines: ["mechanical"] };
    const license = (expires_on: string, discipline?: string) => ({ jurisdiction: "US-SC", number: "1", expires_on, ...(discipline ? { discipline } : {}) });
    expect(gapsIn(q({ ...safety, licenses: [license("2027-01-01", "mechanical")] }), "accept", { grade: "safety", discipline: "mechanical" }, today)).toEqual([]);
    expect(gapsIn(q({ ...safety, licenses: [license("2026-10-29", "mechanical")] }), "accept", { grade: "safety", discipline: "mechanical" }, today))
      .toEqual(["a current professional license for mechanical"]);
    expect(gapsIn(q({ ...safety, licenses: [license("2027-01-01", "electrical")] }), "accept", { grade: "safety", discipline: "mechanical" }, today))
      .toEqual(["a current professional license for mechanical"]);
    expect(gapsIn(q({ ...safety, licenses: [license("2027-01-01")] }), "accept", { grade: "safety", discipline: "mechanical" }, today)).toEqual([]);
  });
});

describe("decisions", () => {
  let h: Harness;
  let ben: string;
  let carol: string;
  const benKey = new VirtualAuthenticator();
  const carolKey = new VirtualAuthenticator();
  const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
  const post = (cookie: string, url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
  async function signed(cookie: string, key: VirtualAuthenticator, name: string, payload: Record<string, unknown>) {
    const o = await post(cookie, `/admin/commands/${name}/options`, { payload });
    return post(cookie, `/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
  }
  const options = (cookie: string, id: string, kind: string) => post(cookie, `/packages/${id}/decisions/options`, { kind, package_revision: 0 });

  beforeAll(async () => {
    h = await startHarness();
    ben = await signIn(h.app, benKey);
    const r = await signed(ben, benKey, "member.enroll", { user_name: "carol" });
    carol = await registerWithInvitation(h.app, r.json().invitation.token, carolKey);
    const issued = await signed(ben, benKey, "qualification.issue", {
      member_id: memberIdFor("carol"), licenses: [], disciplines: [], grades: ["general-service"], roles: ["checker"], authorities: [], reason: "checker",
    });
    expect(issued.statusCode, issued.body).toBe(200);
    for (const [id, extra] of [["WP-GS", {}], ["WP-SAFE", { grade: "safety" }]] as const)
      await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'draft', $2)", [id, { ...example, id, revision: 0, status: "draft", ...extra }]);
  }, 120_000);
  afterAll(async () => h?.stop());

  it("refuses a release by a checker before any passkey prompt, naming the missing role", async () => {
    const r = await options(carol, "WP-GS", "release");
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ code: "qualification-missing", message: "This needs the approver or engineer in responsible charge role, which your qualification does not include" });
    expect((await options(carol, "WP-GS", "reject")).statusCode).toBe(200);
  });

  it("lets the founding member release General service work and refuses Safety work, naming each gap", async () => {
    expect((await options(ben, "WP-GS", "release")).statusCode).toBe(200);
    const r = await options(ben, "WP-SAFE", "release");
    expect(r.statusCode).toBe(403);
    expect(r.json().message).toBe("This needs the Safety grade, the mechanical-hvac discipline and a current professional license for mechanical-hvac, which your qualification does not include");
  });

  it("checks again inside the decision, so a revocation after the prompt is honored", async () => {
    const o = await options(ben, "WP-GS", "release");
    expect(o.statusCode).toBe(200);
    const assertion = benKey.assert(o.json().options);
    // Ben's qualification is replaced by one without the approver role before he signs.
    const changed = await signed(ben, benKey, "qualification.issue", {
      member_id: memberIdFor("ben"), licenses: [], disciplines: [], grades: ["general-service"], roles: ["checker"],
      authorities: ["administrator", "lane", "policy"], reason: "approver role handed over",
    });
    expect(changed.statusCode, changed.body).toBe(200);
    const r = await post(ben, "/packages/WP-GS/decisions", { kind: "release", package_revision: 0, assertion });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("qualification-missing");
    expect((await h.db.query("select count(*)::int as n from decisions where package_id = 'WP-GS'")).rows[0].n).toBe(0);
  });
});
