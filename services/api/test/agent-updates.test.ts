import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, ORIGIN, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";

/** Agent updates (change record agent-update-prompt, AU-05). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
type Json = Record<string, any>;

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
async function signed(name: string, payload: Json) {
  const o = await post(`/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(`/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
}
const grok = { agent: "grok", name: "Grok CLI", installed: "1.0.77", latest: "1.0.92", command: ["npm", "install", "--global", "@xai-official/grok@1.0.92"] };
const brew = { agent: "codex", name: "Codex CLI", installed: "0.170.0", latest: "0.171.0", note: "installed outside npm" };
const claim = (agent_updates?: unknown) =>
  h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: [], ...(agent_updates === undefined ? {} : { agent_updates }) } });
const take = () => h.app.inject({ method: "POST", url: "/runner/agent-updates/take", headers: daemonHeaders, payload: {} });
const view = async () => (await h.app.inject({ method: "GET", url: "/runtimes", headers: { cookie } })).json();

describe("agent updates", () => {
  it("shows what the daemon reported, dropping malformed entries", async () => {
    await claim([grok, brew, { agent: "grok", name: "x", latest: "1", command: "rm -rf /" }]);
    const v = await view();
    expect(v.agent_updates).toEqual([grok, brew]);
    expect(v.agent_updates_requested).toEqual([]);
    // A claim without the field (startup check still running) keeps what was reported.
    await claim();
    expect((await view()).agent_updates).toEqual([grok, brew]);
  });

  it("an administrator's signed request reaches the daemon once, as names only", async () => {
    await claim([grok, brew]);
    const r = await signed("runtime.update", { agents: ["grok"] });
    expect(r.statusCode, r.body).toBe(200);
    expect((await view()).agent_updates_requested).toEqual(["grok"]);
    expect((await take()).json()).toEqual({ agents: ["grok"] });
    expect((await take()).json()).toEqual({ agents: [] });
  });

  it("refuses an agent with no command or no reported update, and an unsigned request", async () => {
    await claim([grok, brew]);
    expect((await signed("runtime.update", { agents: ["codex"] })).json().code).toBe("no-update-command");
    expect((await signed("runtime.update", { agents: ["opencode"] })).json().code).toBe("no-update");
    expect((await signed("runtime.update", { agents: ["../../x"] })).statusCode).toBe(400);
    expect((await post("/admin/commands/runtime.update", { payload: { agents: ["grok"] } })).statusCode).toBe(403);
    expect((await take()).json()).toEqual({ agents: [] });
  });

  it("drops a pending request once the daemon reports the agent current", async () => {
    await claim([grok]);
    await signed("runtime.update", { agents: ["grok"] });
    await claim([]);
    expect(await view()).toMatchObject({ agent_updates: [], agent_updates_requested: [] });
  });

  it("only the daemon may take requests", async () => {
    expect((await h.app.inject({ method: "POST", url: "/runner/agent-updates/take", headers: { cookie, origin: ORIGIN }, payload: {} })).statusCode).toBe(401);
  });
});
