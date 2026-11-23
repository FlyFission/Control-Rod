import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, ORIGIN, VirtualAuthenticator, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** First-run setup: the person's confirmed seats and check-in answer, and benched agents left out of claims. */
let h: Harness;
let cookie: string;
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

  it("records the confirmed setup on the event chain with who made it", async () => {
    const r = await put({ seats: [{ runtime: "claude", seated: true }, { runtime: "codex", seated: false }], check_in: "every-step" });
    expect(r.statusCode, r.body).toBe(200);
    const view = r.json();
    expect(view).toMatchObject({ confirmed: true, check_in: "every-step", seats: [{ runtime: "claude", seated: true }, { runtime: "codex", seated: false }] });
    expect(typeof view.confirmed_at).toBe("string");
    expect((await get()).json()).toEqual(view);
    const ev = await h.db.query<{ type: string; actor: { kind: string }; data: Record<string, unknown> }>(
      "select body->>'type' as type, body->'actor' as actor, body->'data' as data from events where body->>'type' = 'setup.recorded'",
    );
    expect(ev.rows).toHaveLength(1);
    expect(ev.rows[0]).toMatchObject({ actor: { kind: "human" }, data: { seated: ["claude"], benched: ["codex"], check_in: "every-step", first: true } });
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
});
