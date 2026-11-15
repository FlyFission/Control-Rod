import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, ORIGIN, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";

/** Settings probe endpoint: only real provider CLIs, and never a token. */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
const secret = "sk-ant-secret-token";
const A = "a".repeat(64);

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const get = () => h.app.inject({ method: "GET", url: "/subscriptions", headers: { cookie } });
const claim = (payload: unknown) => h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: payload as object });

const claude = {
  id: "claude",
  display_name: "Claude Code",
  vendor_family: "Anthropic",
  installed: true,
  path: "/opt/claude",
  observed_version: "2.1.318 (Claude Code)",
  auth: "signed-in",
  auth_note: "The CLI's status command succeeded.",
  roles: [
    { role: "author", qualified: false, reason: "Native Linux is not qualified." },
    { role: "checker", qualified: false, reason: "Native Linux is not qualified." },
  ],
};

describe("subscription probes", () => {
  it("returns the tier record and no probes until a daemon reports", async () => {
    const body = (await get()).json();
    expect(body.reported).toBe(false);
    expect(body.probes).toEqual([]);
    expect(body.checkers).toEqual([]);
    expect(body.tiers).toEqual([
      { grade: "safety", required: 2, rule: "Safety needs 2 checkers from different vendor families." },
      { grade: "material", required: 1, rule: "Material needs 1 checker." },
      { grade: "general-service", required: 1, rule: "General service needs 1 checker." },
    ]);
    expect(body.local_rule).toBe("A local model cannot be the deciding checker on Safety or Material.");
    expect(JSON.stringify(body)).not.toContain("agy");
  });

  it("keeps probes of registered CLIs and drops invented ones and anything carrying a token", async () => {
    const sent = await claim({
      runtimes: [],
      subscription_report: {
        platform: "linux",
        token: secret,
        probes: [
          claude,
          { ...claude, id: "agy", display_name: "Antigravity" },
          { ...claude, id: "codex", display_name: "Codex", vendor_family: "OpenAI", auth: "unknown", auth_note: "This CLI has no auth-status command.", token: secret, observed_version: secret },
          { id: "fake", display_name: "fake", installed: true, auth: "signed-in", roles: [] },
        ],
        checkers: [
          { id: "claude-sonnet-4-5", harness: "claude", vendor_family: "Anthropic", deciding: true, local: false, hosts: ["api.anthropic.com"] },
          { id: "gpt-5-codex", harness: "codex", vendor_family: "OpenAI", deciding: true, local: false, hosts: ["api.openai.com"], api_key: secret },
          { id: "local-ollama", harness: "codex", vendor_family: "local", deciding: true, local: true, hosts: ["127.0.0.1"] },
        ],
      },
    });
    expect(sent.statusCode).toBe(204);
    const body = (await get()).json();
    expect(body.reported).toBe(true);
    expect(body.platform).toBe("linux");
    expect(body.probes.map((p: { id: string }) => p.id)).toEqual(["claude"]);
    expect(body.probes[0].auth).toBe("signed-in");
    expect(body.probes[0].path).toBe("/opt/claude");
    expect(body.checkers.map((c: { id: string }) => c.id)).toEqual(["claude-sonnet-4-5", "local-ollama"]);
    expect(body.checkers.find((c: { id: string }) => c.id === "local-ollama").local).toBe(true);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(secret);
    expect(raw).not.toContain("agy");
    expect(raw).not.toContain("api_key");
    expect(raw).not.toContain("token");
  });

  it("shows the pinned version recorded for author and the pre-check, and ignores a pin in the probe body", async () => {
    const status = [{ runtime: "claude", ready: true, version: "2.1.318 (Claude Code)", login_checked: true, artifact: { path: "/opt/claude", digest: { algorithm: "sha256", value: A } } }];
    expect((await claim({ runtimes: ["claude"], runtime_status: status, subscription_report: { platform: "wsl2", probes: [claude], pins: [{ runtime: "codex", role: "author" }] } })).statusCode).toBe(204);
    const options = await h.app.inject({
      method: "POST", url: "/admin/commands/runtime.pin/options", headers: { cookie, origin: ORIGIN },
      payload: { payload: { runtime: "claude", artifact_digest: A } },
    });
    expect(options.statusCode, options.body).toBe(200);
    const pinned = await h.app.inject({
      method: "POST", url: "/admin/commands/runtime.pin", headers: { cookie, origin: ORIGIN },
      payload: { payload: { runtime: "claude", artifact_digest: A }, assertion: key.assert(options.json().options) },
    });
    expect(pinned.statusCode, pinned.body).toBe(200);
    const body = (await get()).json();
    const pins = body.pins.filter((p: { runtime: string }) => p.runtime === "claude");
    expect(pins.map((p: { role: string }) => p.role).sort()).toEqual(["author", "checker"]);
    expect(pins[0].version).toBe("2.1.318 (Claude Code)");
    expect(pins[0].digest.value).toBe(A);
    expect(body.probes.map((p: { id: string }) => p.id)).toEqual(["claude"]);
  });
});
