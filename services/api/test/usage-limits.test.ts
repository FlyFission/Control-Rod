import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";

/** Control room usage limits: only contract fields are kept, and never a token. */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
const secret = "sk-ant-secret-token";

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const get = () => h.app.inject({ method: "GET", url: "/usage/limits", headers: { cookie } });
const claim = (payload: unknown) => h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: payload as object });

const codex = {
  id: "codex",
  source: "cli-log",
  observed_at: "2026-11-24T15:00:00Z",
  plan: "plus",
  windows: [
    { id: "five_hour", window_minutes: 300, used_percent: 11, resets_at: "2026-11-24T17:11:00Z" },
    { id: "seven_day", window_minutes: 10080, used_percent: 88, resets_at: "2026-11-29T14:00:00Z", status: "warning" },
  ],
};

describe("usage limits", () => {
  it("reports nothing until a daemon sends a reading", async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reported: false, providers: [] });
  });

  it("needs a signed-in person", async () => {
    const res = await h.app.inject({ method: "GET", url: "/usage/limits" });
    expect(res.statusCode).toBe(401);
  });

  it("keeps contract fields and drops invented providers, bad windows and anything carrying a token", async () => {
    await claim({
      runtimes: [],
      usage_limits: {
        read_at: "2026-11-24T15:05:00Z",
        providers: [
          { ...codex, token: secret, windows: [...codex.windows, { id: "five_hour", used_percent: 50 }, { id: "weird", used_percent: 1 }, { id: "monthly", used_percent: 140 }, { id: "primary", used_percent: 5, note: secret }] },
          { id: "claude", source: "cli-stream", plan: "enterprise-gold", windows: [{ id: "seven_day_opus", used_percent: 93, status: "rejected", resets_at: "not a time" }] },
          { id: "grok", source: "none", windows: [{ id: "five_hour", used_percent: 3 }] },
          { id: "not-a-harness", source: "cli-log", windows: [] },
          { id: "codex", source: "cli-log", windows: [] },
        ],
      },
    });
    const body = (await get()).json();
    expect(body.reported).toBe(true);
    expect(body.read_at).toBe("2026-11-24T15:05:00.000Z");
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["codex", "claude", "grok"]);
    const [cx, cl, gk] = body.providers;
    expect(cx.windows).toEqual([
      { id: "five_hour", window_minutes: 300, used_percent: 11, resets_at: "2026-11-24T17:11:00.000Z" },
      { id: "seven_day", window_minutes: 10080, used_percent: 88, resets_at: "2026-11-29T14:00:00.000Z", status: "warning" },
      { id: "primary", used_percent: 5 },
    ]);
    expect(cx.plan).toBe("plus");
    expect(cl).toEqual({ id: "claude", source: "cli-stream", windows: [{ id: "seven_day_opus", used_percent: 93, status: "rejected" }] });
    expect(gk).toEqual({ id: "grok", source: "none", windows: [] });
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("keeps CodexBar readings for allowlisted harnesses, and the engine record", async () => {
    await claim({
      runtimes: [],
      usage_limits: {
        read_at: "2026-11-24T16:30:00Z",
        engine: { id: "codexbar", found: true, version: "0.81.0", path: "/secret" },
        providers: [
          { id: "cursor", source: "codexbar", windows: [{ id: "monthly", label: "Weekly (Opus)", used_percent: 40 }, { id: "primary", label: secret, used_percent: 2 }] },
          { id: "made-up", source: "codexbar", windows: [] },
        ],
      },
    });
    const body = (await get()).json();
    expect(body.engine).toEqual({ id: "codexbar", found: true, version: "0.81.0" });
    expect(body.providers).toEqual([{ id: "cursor", source: "codexbar", windows: [{ id: "monthly", used_percent: 40 }, { id: "primary", used_percent: 2 }] }]);
    expect(JSON.stringify(body)).not.toContain("label");
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("a later reading replaces the earlier one", async () => {
    await claim({ runtimes: [], usage_limits: { read_at: "2026-11-24T16:00:00Z", providers: [{ id: "claude", source: "cli-stream", windows: [{ id: "five_hour", used_percent: 22 }] }] } });
    const body = (await get()).json();
    expect(body.providers).toEqual([{ id: "claude", source: "cli-stream", windows: [{ id: "five_hour", used_percent: 22 }] }]);
  });

  it("keeps only known plan names and numeric engine versions", async () => {
    await claim({ runtimes: [], usage_limits: { read_at: "2026-11-24T16:40:00Z", engine: { id: "codexbar", found: true, version: "Unauthorized" }, providers: [
      { id: "claude", source: "cli-stream", plan: "max", windows: [] },
      { id: "codex", source: "cli-log", plan: "pro-plus-extra", windows: [] },
      { id: "grok", source: "cli-log", plan: "Max", windows: [] },
    ] } });
    const body = (await get()).json();
    expect(body.engine).toEqual({ id: "codexbar", found: true });
    expect(body.providers.map((p: { plan?: string }) => p.plan)).toEqual(["max", undefined, undefined]);
  });

  it("a malformed report leaves the previous one untouched", async () => {
    await claim({ runtimes: [], usage_limits: { read_at: "2026-11-24T17:00:00Z", providers: [{ id: "claude", source: "cli-stream", windows: [{ id: "five_hour", used_percent: 30 }] }] } });
    const before = (await get()).json();
    for (const bad of [{}, { providers: [] }, { read_at: "2026-11-24T17:05:00Z" }, { read_at: "yesterday", providers: [] }, { read_at: "2026-11-24T17:05:00Z", providers: "x" }]) {
      await claim({ runtimes: [], usage_limits: bad });
      expect((await get()).json()).toEqual(before);
    }
  });
});
