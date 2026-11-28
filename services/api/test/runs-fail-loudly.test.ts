import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, ORIGIN, VirtualAuthenticator, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";
import { CLAIM_PROTOCOL, LOG_TRIMMED, MAX_RUN_LOG_LINES, checkoutsHeld } from "../src/work.js";

/** Runs that stall or fail silently (review batch 5): each now fails with its reason, or says why it waits. */
let h: Harness;
let cookie: string;
beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, new VirtualAuthenticator());
}, 120_000);
afterAll(async () => h?.stop());

const asOwner = (method: "GET" | "POST", url: string, payload?: unknown) =>
  h.app.inject({ method, url, headers: { cookie, ...(method === "GET" ? {} : { origin: ORIGIN }) }, ...(payload !== undefined ? { payload: payload as object } : {}) });
const asDaemon = async (url: string, payload: unknown): Promise<DaemonReply> => {
  const body = await sealDaemonPayload(h.admin, url, withClaim(url, payload as Record<string, unknown>));
  return await h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: body }) as DaemonReply;
};
const claim = async (extra: Record<string, unknown> = {}) => {
  const r = await asDaemon("/runner/claim", { runtimes: ["fake"], ...extra });
  if (r.statusCode === 200) {
    const job = r.json() as { run: { id: string }; claim: { token: string } };
    claims.set(job.run.id, job.claim.token);
  }
  return r;
};
const runOf = async (captureId: string) =>
  (await h.admin.query<{ id: string; status: string; body: Record<string, unknown> }>("select id, status, body from runs where package_id = $1 order by created_at desc limit 1", [captureId])).rows[0]!;
const capture = async (text: string) => {
  const c = await asOwner("POST", "/captures", { lane: "internal", text });
  expect(c.statusCode, c.body).toBe(201);
  return (c.json() as { id: string }).id;
};
/** Ends every queued or running run, so each test starts with an empty queue. */
const clearQueue = () => h.admin.query("update runs set status = 'stopped' where status in ('queued', 'running')");

describe("a queued run that cannot be handed out (API-3)", () => {
  it("fails with its reason, and the claim hands out the next run", async () => {
    await clearQueue();
    const bad = await capture("A request whose run is broken");
    const good = await capture("A request behind it");
    // Break the first run: the database refuses to start it, which aborts the claim's transaction.
    const badRun = (await runOf(bad)).id;
    await h.admin.query(`create function test_broken_run() returns trigger language plpgsql as $$
      begin raise exception 'this run row is broken'; end $$`);
    await h.admin.query(`create trigger test_broken_run before update on runs for each row
      when (new.id = '${badRun}' and new.status = 'running') execute function test_broken_run()`);
    let r: DaemonReply;
    try {
      r = await claim();
    } finally {
      await h.admin.query("drop trigger test_broken_run on runs");
      await h.admin.query("drop function test_broken_run()");
    }
    expect(r.statusCode, r.body).toBe(200);
    expect((r.json() as { run: { package_id: string } }).run.package_id).toBe(good);
    const failed = await runOf(bad);
    expect(failed.status).toBe("failed");
    expect(String(failed.body.error)).toMatch(/^Not started: Control Rod could not hand this run to the daemon\. .*this run row is broken.*Fix what that names, then run the card again\.$/);
  });
});

describe("the claim protocol (DMN-4)", () => {
  it("refuses a daemon older than the jobs it would be handed, before any run is handed out, and says what to do", async () => {
    await clearQueue();
    const id = await capture("A request for an old daemon");
    const r = await claim({ claim_protocol: CLAIM_PROTOCOL - 1 });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("daemon-outdated");
    expect(r.json().message).toMatch(/Restart Control Rod so its daemon is the same version/);
    expect((await runOf(id)).status).toBe("queued");
    // A daemon that names this version, or none (before the version was sent), claims as before.
    const ok = await claim({ claim_protocol: CLAIM_PROTOCOL });
    expect(ok.statusCode, ok.body).toBe(200);
  });
});

describe("claim bookkeeping (API-20)", () => {
  it("never fails the claim when what the daemon reports beside it cannot be recorded", async () => {
    await clearQueue();
    const id = await capture("A request whose daemon's report cannot be stored");
    await h.admin.query(`create function test_no_status() returns trigger language plpgsql as $$
      begin if new.key = 'runtime_status' then raise exception 'settings are broken'; end if; return new; end $$`);
    await h.admin.query("create trigger test_no_status before insert or update on settings for each row execute function test_no_status()");
    let r: DaemonReply;
    try {
      r = await claim({ runtime_status: [{ runtime: "fake", ready: true, login_checked: true }] });
    } finally {
      await h.admin.query("drop trigger test_no_status on settings");
      await h.admin.query("drop function test_no_status()");
    }
    expect(r.statusCode, r.body).toBe(200);
    expect((r.json() as { run: { package_id: string } }).run.package_id).toBe(id);
  });
});

describe("the run log (API-10)", () => {
  it("keeps a line or event that carries a null character, so the heartbeat never fails on it", async () => {
    await clearQueue();
    const id = await capture("A request whose agent prints a null character");
    const job = (await claim()).json() as { run: { id: string } };
    const event = { kind: "message", at: new Date().toISOString(), text: "before\u0000after" };
    const r = await asDaemon(`/runner/runs/${job.run.id}/log`, { lines: ["a\u0000b"], label: "x\u0000y", events: [event], events_from: 0 });
    expect(r.statusCode, r.body).toBe(200);
    const row = (await h.admin.query<{ log: string[]; body: Record<string, unknown> }>("select log, body from runs where id = $1", [job.run.id])).rows[0]!;
    expect(row.log).toEqual(["a�b"]);
    expect(row.body.label).toBe("x�y");
    const ev = (await h.admin.query<{ body: { text?: string } }>("select body from run_events where run_id = $1 order by seq", [job.run.id])).rows;
    expect(ev.some((e) => e.body.text === "before�after")).toBe(true);
    expect(id).toBeTruthy();
  });

  it("keeps at most the last lines of a long log, and says so in its first line", async () => {
    await clearQueue();
    await capture("A request whose agent prints a lot");
    const job = (await claim()).json() as { run: { id: string } };
    for (let batch = 0; batch < 11; batch++) {
      const lines = Array.from({ length: 500 }, (_, i) => `line ${batch * 500 + i}`);
      const r = await asDaemon(`/runner/runs/${job.run.id}/log`, { lines });
      expect(r.statusCode, r.body).toBe(200);
    }
    const log = (await h.admin.query<{ log: string[] }>("select log from runs where id = $1", [job.run.id])).rows[0]!.log;
    expect(log.length).toBe(MAX_RUN_LOG_LINES);
    expect(log[0]).toBe(LOG_TRIMMED);
    expect(log[1]).toBe(`line ${5500 - (MAX_RUN_LOG_LINES - 1)}`);
    expect(log.at(-1)).toBe("line 5499");
    expect(log.filter((l) => l === LOG_TRIMMED)).toHaveLength(1);
  });
});

describe("an intake card file that is not valid JSON (API-15)", () => {
  it("makes no card and says which file could not be read", async () => {
    await clearQueue();
    const id = await capture("Draft a card from this request");
    const job = (await claim()).json() as { run: { id: string } };
    const url = `/runner/runs/${job.run.id}/complete`;
    const r = await asDaemon(url, {
      status: "succeeded",
      outputs: [{ name: "packages/BAD.json", content_base64: Buffer.from("{not json").toString("base64") }],
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ status: "failed", refusal: { code: "invalid" } });
    expect(String((r.json() as { refusal: { message: string } }).refusal.message))
      .toMatch(/^Intake wrote a card file that is not valid JSON, so no card was made: .*packages\/BAD\.json.*Run the request again\.$/);
    expect((await h.db.query("select 1 from packages where capture_id = $1", [id])).rowCount).toBe(0);
  });
});

describe("the checkouts runs hold (API-11)", () => {
  it("lists the checkout of each queued or running run, and of no other", async () => {
    await clearQueue();
    await capture("A request bound to a checkout");
    const run = (await h.admin.query<{ id: string }>("select id from runs where status = 'queued' order by created_at desc limit 1")).rows[0]!.id;
    await h.admin.query("update runs set body = jsonb_set(body, '{checkout}', '{\"path\": \"/work/demo/.worktrees/topic\"}') where id = $1", [run]);
    expect(await checkoutsHeld(h.db)).toEqual([{ run, path: "/work/demo/.worktrees/topic" }]);
    await clearQueue();
    expect(await checkoutsHeld(h.db)).toEqual([]);
  });
});
