import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, DAEMON_TOKEN, ORIGIN, RP_ID, VirtualAuthenticator, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";
import { buildApp, canonicalJsonProblem } from "../src/app.js";
import { hashToken } from "../src/auth.js";
import { sealedOrigin } from "../src/seals.js";
import { gitProblem } from "../src/repos.js";
import { normalizeRunModel } from "../src/work.js";
import { fakeAllowed, withFake } from "../src/runtimes.js";
import { strictBase64 } from "../src/base64.js";
import { unreadablePrefsKey } from "../src/workspace-projects.js";

/** API errors and limits (review batch 6): passkey reasons, body limits, captures, and plain refusals. */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const asOwner = (url: string, payload: unknown) =>
  h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
const loginOptions = async () => (await h.app.inject({ method: "POST", url: "/auth/login/options", headers: { origin: ORIGIN } })).json().options;
const loginWith = (assertion: unknown) =>
  h.app.inject({ method: "POST", url: "/auth/login/verify", headers: { origin: ORIGIN }, payload: assertion as object });
const fence = (name: string, b64: string) => `\`\`\`attachment name="${name}" encoding="base64"\n${b64}\n\`\`\``;

describe("a refused passkey says why (API-2, #207)", () => {
  it("names a wrong origin, an unknown passkey and a used challenge", async () => {
    const wrongOrigin = await loginWith(key.assert(await loginOptions(), "http://localhost:9999"));
    expect(wrongOrigin.statusCode).toBe(401);
    expect(wrongOrigin.json()).toMatchObject({ code: "passkey-origin" });

    const stranger = await loginWith(new VirtualAuthenticator().assert(await loginOptions()));
    expect(stranger.json()).toMatchObject({ code: "passkey-unknown" });

    const assertion = key.assert(await loginOptions());
    expect((await loginWith(assertion)).statusCode).toBe(200);
    const replay = await loginWith(assertion);
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({ code: "passkey-expired" });
    for (const r of [wrongOrigin, stranger, replay]) {
      expect(r.json().message).not.toMatch(/needs your passkey/);
      expect(r.json().message).not.toMatch(/—/);
    }
  });

  it("refuses a counter that went backwards as a possible copy", async () => {
    expect((await loginWith(key.assert(await loginOptions()))).statusCode).toBe(200);
    // Wind the authenticator's counter back, as a cloned passkey would report.
    (key as unknown as { counter: number }).counter -= 2;
    const r = await loginWith(key.assert(await loginOptions()));
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ code: "passkey-counter" });
    expect(r.json().message).toMatch(/use count went backwards/);
    (key as unknown as { counter: number }).counter += 10;
  });

  it("lets only one of two signatures carrying the same counter through (API-26)", async () => {
    const [o1, o2] = [await loginOptions(), await loginOptions()];
    const a1 = key.assert(o1);
    (key as unknown as { counter: number }).counter -= 1;
    const a2 = key.assert(o2);
    const results = await Promise.all([loginWith(a1), loginWith(a2)]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 401]);
    expect(results.find((r) => r.statusCode === 401)!.json().code).toBe("passkey-counter");
  });

  it("gives a calm refusal when a later signature from the same passkey lands first", async () => {
    // Two honest prompts signed in two tabs carry rising counters. Whichever arrives second is
    // refused, and only the same counter twice reads as a possible copy.
    for (let i = 0; i < 6; i++) {
      const [o1, o2] = [await loginOptions(), await loginOptions()];
      const [a1, a2] = [key.assert(o1), key.assert(o2)];
      const results = await Promise.all([loginWith(a1), loginWith(a2)]);
      const ok = results.filter((r) => r.statusCode === 200);
      expect(ok.length).toBeGreaterThanOrEqual(1);
      for (const r of results.filter((r) => r.statusCode !== 200)) {
        expect(["passkey-overtaken", "passkey-counter"]).toContain(r.json().code);
        if (r.json().code === "passkey-overtaken") expect(r.json().message).not.toMatch(/copied/);
      }
    }
  });

  it("keeps 'needs your passkey' for a command sent with no signature at all", async () => {
    const r = await asOwner("/admin/commands/chain.seal", { payload: { purpose: "x" } });
    expect(r.json()).toMatchObject({ code: "signature-required" });
    expect(r.json().message).toBe("This command needs your passkey");
  });
});

describe("body limits before sign-in (API-6, #200)", () => {
  const big = "x".repeat(2 * 1024 * 1024);

  it("refuses an unauthenticated large body at a capture or daemon route before reading it", async () => {
    const capture = await h.app.inject({ method: "POST", url: "/captures", headers: { origin: ORIGIN }, payload: { text: big } });
    expect(capture.statusCode).toBe(401);
    const complete = await h.app.inject({ method: "POST", url: "/runner/runs/R-none/complete", payload: { status: "failed", pad: big } });
    expect(complete.statusCode).toBe(401);
  });

  it("refuses a large body at any other route with a plain size refusal", async () => {
    const r = await h.app.inject({ method: "POST", url: "/auth/login/verify", headers: { origin: ORIGIN }, payload: { pad: big } });
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({ code: "too-large" });
    expect(r.json().message).toMatch(/larger than this route accepts \(1 MB\)/);
  });

  it("still takes a signed-in capture with a large attachment", async () => {
    const file = Buffer.alloc(3 * 1024 * 1024, 7).toString("base64");
    const r = await asOwner("/captures", { text: `Read the attached survey\n\n${fence("survey.bin", file)}`, source: "web", lane: "internal" });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().text).toBe("Read the attached survey\n\n[attachment: survey.bin]");
  });
});

describe("captures follow one shared contract (API-7, #205)", () => {
  it("refuses a lane that is not a lane, naming the lanes", async () => {
    const r = await asOwner("/captures", { text: "Check the pump", lane: "secret" });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/"secret" is not a data lane. Choose one of: public, internal/);
    expect((await h.db.query("select 1 from captures where body->>'text' = 'Check the pump'")).rowCount).toBe(0);
  });

  it("refuses visible text over the limit instead of cutting it short", async () => {
    const r = await asOwner("/captures", { text: "y".repeat(20001), lane: "internal" });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ code: "too-large" });
    expect(r.json().message).toMatch(/20,001 characters. A capture holds up to 20,000/);
  });

  it("refuses more attachments than the limit, and base64 that is not clean", async () => {
    const many = Array.from({ length: 21 }, (_, i) => fence(`n${i}.txt`, "eA==")).join("\n\n");
    const tooMany = await asOwner("/captures", { text: `Notes\n\n${many}`, lane: "internal" });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json()).toMatchObject({ code: "too-many-attachments", message: "A capture can carry up to 20 files" });
    const damaged = await asOwner("/captures", { text: `Notes\n\n${fence("a.txt", "QQ=A")}`, lane: "internal" });
    expect(damaged.statusCode).toBe(400);
    expect(damaged.json().message).toBe("a.txt is not valid base64");
  });

  it("refuses a source that is not a capture source", async () => {
    const r = await asOwner("/captures", { text: "Check the valve", source: "email" });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/"email" is not a capture source/);
  });
});

describe("plain refusals for JSON the kernel will not read (API-4)", () => {
  it("says a fraction is not allowed and how to send it", async () => {
    const r = await h.app.inject({ method: "POST", url: "/captures", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, payload: '{"text":"x","n":1.5}' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ code: "not-json" });
    expect(r.json().message).toMatch(/^The number at \/n is not allowed/);
  });

  it("turns each kernel parse failure into a sentence", () => {
    expect(canonicalJsonProblem(new Error('DuplicateKey("/a")'))).toMatch(/same key twice at \/a/);
    expect(canonicalJsonProblem(new Error('TooDeep("/a/b")'))).toMatch(/nests too deeply/);
    expect(canonicalJsonProblem(new Error('InvalidJson("expected value at line 1")'))).toBe("The request body is not valid JSON");
  });
});

describe("the test-only fake runtime (API-19)", () => {
  it("is offered only where CONTROLROD_ALLOW_FAKE=1", () => {
    expect(fakeAllowed({})).toBe(false);
    expect(fakeAllowed({ CONTROLROD_ALLOW_FAKE: "0" })).toBe(false);
    expect(fakeAllowed({ CONTROLROD_ALLOW_FAKE: "1" })).toBe(true);
    const was = process.env.CONTROLROD_ALLOW_FAKE;
    try {
      delete process.env.CONTROLROD_ALLOW_FAKE;
      expect(withFake(["claude", "practice"])).toEqual(["claude", "practice"]);
      process.env.CONTROLROD_ALLOW_FAKE = "1";
      expect(withFake(["claude", "practice"])).toEqual(["claude", "practice", "fake"]);
    } finally {
      if (was === undefined) delete process.env.CONTROLROD_ALLOW_FAKE;
      else process.env.CONTROLROD_ALLOW_FAKE = was;
    }
  });

  it("is never claimed by a production daemon", async () => {
    expect((await asOwner("/captures", { text: "Size the relief valve", lane: "internal" })).statusCode).toBe(201);
    const claim = async () => {
      const url = "/runner/claim";
      const body = await sealDaemonPayload(h.admin, url, withClaim(url, { runtimes: ["fake"] }));
      return (await h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: body })) as DaemonReply;
    };
    const was = process.env.CONTROLROD_ALLOW_FAKE;
    try {
      delete process.env.CONTROLROD_ALLOW_FAKE;
      expect((await claim()).statusCode).toBe(204);
    } finally {
      process.env.CONTROLROD_ALLOW_FAKE = was;
    }
    const allowed = await claim();
    expect(allowed.statusCode).toBe(200);
    claims.set(allowed.json().run.id, allowed.json().claim.token);
  });
});

describe("seals after the app moves (API-14)", () => {
  it("accepts the origin a seal was signed at only for the same relying party", () => {
    const cd = (origin: string) => Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: "c", origin })).toString("base64url");
    expect(sealedOrigin(cd("http://localhost:7300"), "localhost")).toBe("http://localhost:7300");
    expect(sealedOrigin(cd("https://rod.example.com"), "example.com")).toBe("https://rod.example.com");
    expect(sealedOrigin(cd("https://evil.test"), "example.com")).toBeNull();
    expect(sealedOrigin(cd("http://rod.example.com"), "example.com")).toBeNull();
    expect(sealedOrigin(cd("https://notexample.com"), "example.com")).toBeNull();
    expect(sealedOrigin("not base64 json", "localhost")).toBeNull();
  });

  it("still verifies a seal once the app answers at another port", async () => {
    const get = (app = h.app, url = "/records/head") => app.inject({ method: "GET", url, headers: { cookie } });
    const head = (await get()).json().head;
    const payload = { head_seq: head.head_seq, head_digest: head.head_digest.value, purpose: "Before the move", sealed_at: new Date().toISOString() };
    const o = await asOwner("/admin/commands/chain.seal/options", { payload });
    const sealed = await asOwner("/admin/commands/chain.seal", { payload, assertion: key.assert(o.json().options) });
    expect(sealed.statusCode, sealed.body).toBe(200);
    const moved = buildApp({ root: fileURLToPath(new URL("../../../", import.meta.url)), db: h.db,
      auth: { rpID: RP_ID, rpName: "Control Rod", origins: ["http://localhost:7400"], daemonTokenHash: hashToken(DAEMON_TOKEN) }, sweepSeconds: 0 });
    await moved.ready();
    try {
      const v = (await get(moved, "/records/verify")).json();
      expect(v.seals.find((s: { purpose: string }) => s.purpose === "Before the move")).toMatchObject({ result: "valid" });
    } finally {
      await moved.close();
    }
  });
});

describe("smaller fixes", () => {
  it("passes a real model name through and expands only shorthands (API-9)", () => {
    expect(normalizeRunModel("codex", "o3")).toBe("o3");
    expect(normalizeRunModel("codex", "gpt-5.4")).toBe("gpt-5.4");
    expect(normalizeRunModel("codex", "codex")).toBe("gpt-5-codex");
    expect(normalizeRunModel("claude", "sonnet")).toBe("claude-sonnet-4-6");
  });

  it("says git failures in plain words and never shows the command line (API-12)", () => {
    const failed = Object.assign(new Error("Command failed: git -c core.hooksPath=/dev/null -c protocol.allow=never fetch origin"), {
      stderr: "warning: something\nfatal: could not read from remote repository\n",
    });
    expect(gitProblem(failed)).toBe("Git refused: could not read from remote repository");
    expect(gitProblem(Object.assign(new Error("Command failed: git x"), { killed: true, signal: "SIGTERM" }))).toBe("Git took too long and was stopped");
    expect(gitProblem(Object.assign(new Error("stdout maxBuffer length exceeded"), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }))).toMatch(/more output than this step can read/);
    expect(gitProblem(Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }), "The GitHub CLI")).toMatch(/^The GitHub CLI is not installed/);
    expect(gitProblem(new Error("Command failed: git -c secret=1 status"))).toBe("Git could not finish this step");
  });

  it("decodes only canonical base64 (API-21)", () => {
    expect(strictBase64("aGk=", "x").toString()).toBe("hi");
    expect(strictBase64("", "x").length).toBe(0);
    for (const bad of ["aGk", "a Gk=", "aG!k", "aGk==", undefined, 5]) expect(() => strictBase64(bad, "The output a.md")).toThrow(/The output a.md is not valid base64/);
  });

  it("keeps unreadable project preferences aside before replacing them (API-22)", async () => {
    const org = (await h.db.query<{ org_id: string }>("select org_id from members limit 1")).rows[0]!.org_id;
    await h.admin.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [`workspace_project_prefs:${org}`, "{not json"]);
    const payload = { name: "Pump station", mode: "software", lane: "internal" };
    const o = await asOwner("/admin/commands/project.workspace-create/options", { payload });
    expect(o.statusCode, o.body).toBe(200);
    const r = await asOwner("/workspace/projects", { payload, assertion: key.assert(o.json().options) });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const kept = await h.db.query<{ key: string; value: string }>("select key, value from settings where key like $1", [`${unreadablePrefsKey(org, "")}%`]);
    expect(kept.rows.map((x) => x.value)).toEqual(["{not json"]);
    const now = (await h.db.query<{ value: string }>("select value from settings where key = $1", [`workspace_project_prefs:${org}`])).rows[0]!.value;
    expect(() => JSON.parse(now)).not.toThrow();
  });

  it("indexes events by subject and type (API-17)", async () => {
    const idx = await h.db.query<{ indexdef: string }>("select indexdef from pg_indexes where tablename = 'events' and indexname = 'events_subject_type'");
    expect(idx.rows[0]?.indexdef).toMatch(/\(\(body ->> 'subject'::text\)\), \(\(body ->> 'type'::text\)\), seq/);
  });
});
