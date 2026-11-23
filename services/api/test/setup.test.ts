import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, ORIGIN, VirtualAuthenticator, claims, daemonHeaders, registerWithInvitation, signIn, startHarness, withClaim } from "./harness.js";

/** First-run setup: the person's confirmed seats and check-in answer, and benched agents left out of claims. */
let h: Harness;
let cookie: string;
let alice2: string;
const passkey = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, passkey);
}, 120_000);
afterAll(async () => h?.stop());

const get = () => h.app.inject({ method: "GET", url: "/setup", headers: { cookie } });
const put = (payload: unknown) => h.app.inject({ method: "PUT", url: "/setup", headers: { cookie, origin: ORIGIN }, payload: payload as object });
const asDaemon = async (url: string, payload: unknown): Promise<DaemonReply> => {
  const body = await sealDaemonPayload(h.admin, url, withClaim(url, payload as Record<string, unknown>));
  return (await h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: body })) as DaemonReply;
};
async function claim(runtimes: string[]) {
  const r = await asDaemon("/runner/claim", { runtimes });
  if (r.statusCode === 204) return null;
  const job = r.json() as { run: { id: string; role: string; runtime: { provider: string } }; claim: { token: string } };
  claims.set(job.run.id, job.claim.token);
  return job;
}

describe("first-run setup", () => {
  it("is unconfirmed until the person confirms it, with the middle check-in answer preselected", async () => {
    const r = await get();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ confirmed: false, seats: [], check_in: "start-and-merge" });
  });

  it("refuses an unknown agent, a missing answer, a duplicate and the test runtime before writing anything", async () => {
    for (const bad of [
      { seats: [{ runtime: "skynet", seated: true }], check_in: "start" },
      { seats: [{ runtime: "codex", seated: true }] },
      { seats: [{ runtime: "codex", seated: true }, { runtime: "codex", seated: false }], check_in: "start" },
      { seats: [{ runtime: "fake", seated: false }], check_in: "start" },
      { seats: [{ runtime: "codex" }], check_in: "start" },
    ]) {
      const r = await put(bad);
      expect(r.statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect((await get()).json().confirmed).toBe(false);
  });

  it("a roster switch on a fresh install changes that seat and leaves setup unconfirmed", async () => {
    const r = await h.app.inject({ method: "PUT", url: "/setup/seats/codex", headers: { cookie, origin: ORIGIN }, payload: { seated: false } });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ confirmed: false, seats: [{ runtime: "codex", seated: false }], check_in: "start-and-merge" });
    const back = await h.app.inject({ method: "PUT", url: "/setup/seats/codex", headers: { cookie, origin: ORIGIN }, payload: { seated: true } });
    expect(back.json()).toMatchObject({ confirmed: false });
  });

  it("records the confirmed setup, puts only the seat change on the chain, and keeps the check-in answer off it", async () => {
    const r = await put({ seats: [{ runtime: "claude", seated: true }, { runtime: "codex", seated: false }], check_in: "every-step" });
    expect(r.statusCode, r.body).toBe(200);
    const view = r.json();
    expect(view).toMatchObject({ confirmed: true, check_in: "every-step", seats: [{ runtime: "claude", seated: true }, { runtime: "codex", seated: false }] });
    expect(typeof view.confirmed_at).toBe("string");
    expect((await get()).json()).toEqual(view);
    const ev = await h.db.query<{ actor: { kind: string }; data: Record<string, unknown> }>(
      "select body->'actor' as actor, body->'data' as data from events where body->>'type' = 'setup.seats-changed'",
    );
    // The fresh-install switch above benched and re-seated Codex; this confirm benches it again.
    expect(ev.rows).toHaveLength(3);
    expect(ev.rows[2]).toEqual({ actor: expect.objectContaining({ kind: "human" }), data: { seated: [], benched: ["codex"] } });
    const all = await h.db.query<{ body: unknown }>("select body from events where body->>'subject' = 'setup'");
    expect(JSON.stringify(all.rows)).not.toContain("every-step");
  });

  it("a roster switch changes one seat, keeps the rest and the answer, and does not confirm a fresh setup", async () => {
    const one = await h.app.inject({ method: "PUT", url: "/setup/seats/claude", headers: { cookie, origin: ORIGIN }, payload: { seated: false } });
    expect(one.statusCode, one.body).toBe(200);
    expect(one.json()).toMatchObject({ confirmed: true, check_in: "every-step", seats: [{ runtime: "claude", seated: false }, { runtime: "codex", seated: false }] });
    const back = await h.app.inject({ method: "PUT", url: "/setup/seats/claude", headers: { cookie, origin: ORIGIN }, payload: { seated: true } });
    expect(back.json().seats).toEqual([{ runtime: "claude", seated: true }, { runtime: "codex", seated: false }]);
    for (const [url, payload] of [["/setup/seats/fake", { seated: false }], ["/setup/seats/codex", {}]] as const) {
      const bad = await h.app.inject({ method: "PUT", url, headers: { cookie, origin: ORIGIN }, payload });
      expect(bad.statusCode).toBe(400);
    }
  });

  it("confirming keeps a seat the request does not name, so a stale page cannot undo another page's switch", async () => {
    const other = await h.app.inject({ method: "PUT", url: "/setup/seats/claude", headers: { cookie, origin: ORIGIN }, payload: { seated: false } });
    expect(other.statusCode, other.body).toBe(200);
    const r = await put({ seats: [], check_in: "every-step" });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().seats).toEqual([{ runtime: "claude", seated: false }, { runtime: "codex", seated: false }]);
    await h.app.inject({ method: "PUT", url: "/setup/seats/claude", headers: { cookie, origin: ORIGIN }, payload: { seated: true } });
  });

  it("leaves a benched agent out of every claim, and offers it again once it is seated", async () => {
    const c = await h.app.inject({ method: "POST", url: "/captures", headers: { cookie, origin: ORIGIN }, payload: { lane: "internal", text: "What is a pump?" } });
    expect(c.statusCode, c.body).toBe(201);
    expect(await claim(["codex"])).toBeNull();
    expect((await put({ seats: [{ runtime: "codex", seated: true }], check_in: "start-and-merge" })).statusCode).toBe(200);
    const job = await claim(["codex"]);
    expect(job?.run.role).toBe("intake");
    expect(job?.run.runtime.provider).toBe("codex");
  });

  it("refuses a Member without administrator authority, because seats change dispatch for the whole install", async () => {
    const payload = { user_name: "alice" };
    const o = await h.app.inject({ method: "POST", url: "/admin/commands/member.enroll/options", headers: { cookie, origin: ORIGIN }, payload: { payload } });
    expect(o.statusCode, o.body).toBe(200);
    const r = await h.app.inject({ method: "POST", url: "/admin/commands/member.enroll", headers: { cookie, origin: ORIGIN }, payload: { payload, assertion: passkey.assert(o.json().options) } });
    expect(r.statusCode, r.body).toBe(200);
    const alice = await registerWithInvitation(h.app, r.json().invitation.token, new VirtualAuthenticator());
    const before = (await get()).json();
    const seat = await h.app.inject({ method: "PUT", url: "/setup/seats/codex", headers: { cookie: alice, origin: ORIGIN }, payload: { seated: false } });
    expect(seat.statusCode, seat.body).toBe(403);
    const all = await h.app.inject({ method: "PUT", url: "/setup", headers: { cookie: alice, origin: ORIGIN }, payload: { seats: [], check_in: "start" } });
    expect(all.statusCode).toBe(403);
    expect((await get()).json()).toEqual(before);
    alice2 = alice;
  });

  it("before any qualification exists, only the first Member may change seats", async () => {
    // As a backfilled install can be: Members, and no qualification at all.
    await h.admin.query("alter table signer_qualifications disable trigger user");
    await h.admin.query("delete from signer_qualifications");
    await h.admin.query("alter table signer_qualifications enable trigger user");
    const before = (await get()).json();
    const second = await h.app.inject({ method: "PUT", url: "/setup/seats/codex", headers: { cookie: alice2, origin: ORIGIN }, payload: { seated: false } });
    expect(second.statusCode, second.body).toBe(403);
    expect((await get()).json()).toEqual(before);
    const first = await h.app.inject({ method: "PUT", url: "/setup/seats/codex", headers: { cookie, origin: ORIGIN }, payload: { seated: false } });
    expect(first.statusCode, first.body).toBe(200);
  });
});
