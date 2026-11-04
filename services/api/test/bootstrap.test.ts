import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberIdFor } from "../src/tenancy.js";
import { type Harness, ORIGIN, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

/**
 * Bootstrap (plan tasks 1.5 and 5.4): an organization with no administrator, as a backfilled install
 * can be, lets its first Member issue their own first qualification once, and only with both
 * administrator and policy authority, since only those can ever issue the next one.
 */
let h: Harness;
let ben: string;
const key = new VirtualAuthenticator();
const BEN = memberIdFor("ben");
type Json = Record<string, any>;
const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie: ben, origin: ORIGIN }, payload: payload as object });
async function signed(name: string, payload: Json) {
  const o = await post(`/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(`/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
}
const issue = (authorities: string[]) => signed("qualification.issue", {
  member_id: BEN, licenses: [], disciplines: [], grades: ["general-service"], roles: ["checker"], authorities, reason: "first administrator" });

beforeAll(async () => {
  h = await startHarness();
  ben = await signIn(h.app, key);
  // As a backfilled install can be: a Member, and no qualification at all.
  await h.admin.query("alter table signer_qualifications disable trigger user");
  await h.admin.query("delete from signer_qualifications");
  await h.admin.query("alter table signer_qualifications enable trigger user");
}, 120_000);
afterAll(async () => h?.stop());

describe("bootstrap", () => {
  it("refuses a first qualification that could not issue the next one, and accepts one that can, once", async () => {
    expect((await h.app.inject({ method: "GET", url: "/admin", headers: { cookie: ben } })).json().bootstrap).toBe(true);
    const short = await issue(["administrator"]);
    expect(short.statusCode, short.body).toBe(409);
    expect(short.json()).toMatchObject({ code: "bootstrap-authorities", change: "Include both; only a member holding them can issue anyone else a qualification." });
    expect((await h.app.inject({ method: "GET", url: "/admin", headers: { cookie: ben } })).json().bootstrap).toBe(true);
    const ok = await issue(["administrator", "policy"]);
    expect(ok.statusCode, ok.body).toBe(200);
    const ev = await h.db.query("select body->'data' as d from events where body->>'type' = 'admin.command' and body->>'subject' = 'qualification.issue' order by seq desc limit 1");
    expect(ev.rows[0].d).toMatchObject({ bootstrap: true });
    expect((await h.app.inject({ method: "GET", url: "/admin", headers: { cookie: ben } })).json().bootstrap).toBe(false);
  });
});
