import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** Budgets, reservations and the usage ledger (workbench plan task 5.2; specification 26, WB-21). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
type Json = Record<string, any>;
const CEILING = 45 * 60;

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
const get = async (url: string) => h.app.inject({ method: "GET", url, headers: { cookie } });
const daemon = (url: string, payload: Json) => h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: withClaim(url, payload) });
/** The daemon asks for work, reporting its run time ceiling, or (null) reporting none. */
const claim = (ceiling: number | null = CEILING) =>
  h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: ["fake"], ...(ceiling === null ? {} : { run_timeout_seconds: ceiling }) } });
async function signed(name: string, payload: Json) {
  const o = await post(`/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(`/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
}
const org = async () => (await h.db.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
const run = async (id: string) => (await h.db.query<{ status: string; body: Json }>("select status, body from runs where id = $1", [id])).rows[0]!;
const reservations = async (runId: string) => (await h.db.query<{ body: Json }>("select body from budget_reservations where run_id = $1 order by id", [runId])).rows.map((r) => r.body);

/** Queues one author run; unless `alongside`, everything else queued or running is stopped first. */
async function queued(id: string, alongside = false) {
  if (!alongside) await h.admin.query("update runs set status = 'stopped' where status in ('queued', 'running')");
  await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'released', $2)",
    [id, { ...example, id, revision: 0, status: "released", data_lane: "internal", design_inputs: [] }]);
  const r = { schema_version: "0.1.0", id: `R-${id.slice(-8).toLowerCase()}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "unassigned",
    runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(), generation: 1 };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'queued', $3)", [r.id, id, r]);
  return r.id;
}
async function claimed(id: string) {
  const runId = await queued(id);
  const res = await claim();
  expect(res.statusCode, res.body).toBe(200);
  expect(res.json().run.id).toBe(runId);
  claims.set(runId, res.json().claim.token);
  return runId;
}
const budget = async (b: Json) => {
  const r = await signed("budget.set", b);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const retire = async (id: string) => h.admin.query("update budgets set body = jsonb_set(body, '{status}', '\"retired\"') where id = $1", [id]);
const sweep = async () => { await get("/office"); };

describe("setting a budget", () => {
  it("refuses a hard cap on anything Control Rod cannot reserve before work starts, and malformed limits and periods", async () => {
    const o = await org();
    const base = { scope: "organization", scope_id: o, period: "P1M" };
    expect((await signed("budget.set", { ...base, mode: "hard-cap", limit: { value: "100", unit: "USD" } })).json().code).toBe("cap-unenforceable");
    expect((await signed("budget.set", { ...base, mode: "hard-cap", limit: { value: "100000", unit: "token" } })).json().code).toBe("cap-unenforceable");
    expect((await signed("budget.set", { ...base, mode: "track", limit: { value: "100", unit: "EUR" } })).json().code).toBe("invalid");
    expect((await signed("budget.set", { ...base, mode: "track", limit: { value: "0", unit: "minute" } })).json().code).toBe("invalid");
    expect((await signed("budget.set", { ...base, mode: "track", limit: { value: "10", unit: "minute" }, period: "1 month" })).json().code).toBe("invalid");
    // Tracking or alerting on money and tokens is fine; a cap on run time is fine.
    for (const b of [{ ...base, mode: "track", limit: { value: "100", unit: "USD" } }, { ...base, mode: "alert", limit: { value: "100000", unit: "token" } }])
      await retire((await budget(b)).id);
  });
});

describe("a hard cap on run time", () => {
  it("reserves each dispatched run's ceiling, and holds a dispatch that would pass the cap, saying why, for someone with policy authority", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: "60", unit: "minute" }, period: "P1D" });
    const first = await claimed("WP-BUD-ONE");
    expect(await reservations(first)).toEqual([expect.objectContaining({ budget_id: cap.id, amount: { value: "45.00", unit: "minute" }, status: "reserved" })]);
    // 45 reserved while the first run runs; another 45 would pass 60.
    const second = await queued("WP-BUD-TWO", true);
    expect((await run(first)).status).toBe("running");
    expect((await claim()).statusCode).toBe(204);
    const held = await run(second);
    expect(held.status).toBe("queued");
    expect(held.body).toMatchObject({ waiting_cause: "budget", waiting_key: `budget:${cap.id}` });
    expect(held.body.waiting_reason).toMatch(new RegExp(`^Held by budget ${cap.id}: reserving this run's 45 minute ceiling would take it past its hard cap of 60 minutes in P1D \\(45\\.00 used or reserved\\)`));
    expect(await reservations(second)).toEqual([]);
    await retire(cap.id);
    // With the cap gone, the held run is dispatched and its hold cleared.
    const res = await claim();
    expect(res.json().run.id).toBe(second);
    expect((await run(second)).body.waiting_cause).toBeUndefined();
    claims.set(second, res.json().claim.token);
  });

  it("holds a run under a hard cap when the daemon did not report its ceiling, rather than guess", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const id = await queued("WP-BUD-NOCEIL");
    expect((await claim(null)).statusCode).toBe(204);
    expect((await run(id)).body.waiting_reason).toMatch(/did not report its run time ceiling/);
    const res = await claim();
    expect(res.json().run.id).toBe(id);
    claims.set(id, res.json().claim.token);
    await retire(cap.id);
  });
});

describe("settlement", () => {
  it("settles a finished run at its measured run time, records reported tokens, and frees the cap for what it did not use", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: "60", unit: "minute" }, period: "P1D" });
    const cursor = (await get("/inbox")).json().digest.head;
    const id = await claimed("WP-BUD-SETTLE");
    // The run reports usage events, then completes.
    const log = await daemon(`/runner/runs/${id}/log`, { lines: [], events: [{ kind: "usage", at: new Date().toISOString(), input_tokens: 1200, output_tokens: 300, cached_tokens: 50 }], events_from: 0 });
    expect(log.statusCode, log.body).toBe(200);
    const done = await daemon(`/runner/runs/${id}/complete`, { status: "succeeded", outputs: [{ name: "calc.md", content_base64: b64("x") }] });
    expect(done.statusCode, done.body).toBe(200);
    // Until settled it counts in full; the sweep settles it.
    await sweep();
    expect((await reservations(id)).map((r) => r.status)).toEqual(["settled"]);
    const usage = (await h.db.query<{ body: Json }>("select body from usage_records where run_id = $1 order by body->>'source'", [id])).rows.map((r) => r.body);
    expect(usage).toEqual([
      expect.objectContaining({ source: "measured", wall_time: expect.objectContaining({ unit: "minute" }) }),
      expect.objectContaining({ source: "reported", input_tokens: { value: "1200", unit: "token" }, output_tokens: { value: "300", unit: "token" }, cache_read_tokens: { value: "50", unit: "token" } }),
    ]);
    expect(Number(usage[0]!.wall_time.value)).toBeLessThan(1);
    // The Inbox digest reports it since the person last looked.
    const digest = (await get(`/inbox?since=${cursor}`)).json().digest.lines.find((l: Json) => l.topic === "spend");
    expect(digest.text).toMatch(/^1 run settled, 0\.\d\d minutes of agent run time\.$/);
    // Settling again changes nothing.
    await sweep();
    expect((await h.db.query("select 1 from usage_records where run_id = $1", [id])).rowCount).toBe(2);
    // The cap now counts the measured minutes, not the 45 reserved, so another run fits.
    const next = await claimed("WP-BUD-AFTER");
    expect((await reservations(next))[0]).toMatchObject({ status: "reserved" });
    await retire(cap.id);
  });

  it("keeps a lost run charged at its full reservation until it is reconciled", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const id = await claimed("WP-BUD-LOST");
    await h.admin.query("update runs set lease_expires_at = now() - interval '1 second' where id = $1", [id]);
    await sweep();
    expect((await run(id)).status).toBe("lost");
    expect((await reservations(id)).find((r) => r.budget_id === cap.id)).toMatchObject({ status: "reserved", amount: { value: "45.00" } });
    const u = (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === cap.id);
    expect(u.in_flight).toBeGreaterThanOrEqual(45);
    await retire(cap.id);
  });
});

describe("tracking, alerting and the Usage view", () => {
  it("counts reported tokens against a token budget, records a crossing once per window, and shows money as not reported", async () => {
    const o = await org();
    const tokens = await budget({ scope: "organization", scope_id: o, mode: "alert", limit: { value: "1000", unit: "token" }, period: "P1D" });
    const money = await budget({ scope: "organization", scope_id: o, mode: "track", limit: { value: "50", unit: "USD" }, period: "P1M" });
    await sweep();
    await sweep();
    const view = (await get("/usage")).json();
    const t = view.budgets.find((b: Json) => b.budget.id === tokens.id);
    expect(t.used).toBeGreaterThanOrEqual(1500);
    expect(t.state).toBe("over");
    const m = view.budgets.find((b: Json) => b.budget.id === money.id);
    expect(m).toMatchObject({ used: null, state: "not-reported" });
    const crossings = (await h.db.query("select 1 from events where body->>'type' = 'budget.crossed' and body->>'subject' = $1", [tokens.id])).rowCount;
    expect(crossings).toBe(1);
    expect(view.records.some((r: Json) => r.source === "reported")).toBe(true);
    expect(view.telemetry).toEqual(expect.arrayContaining([expect.objectContaining({ runtime: "fake" })]));
    expect(view.near_share).toBe(0.8);
    // Each agent on the floor carries its tightest budget, the token budget it is over; never while presenting.
    await queued("WP-BUD-FLOOR");
    const floor = (await get("/office/figures")).json();
    const f = floor.figures.find((x: Json) => x.package_id === "WP-BUD-FLOOR");
    expect(f.spend).toMatchObject({ budget_id: tokens.id, unit: "token", mode: "alert", state: "over" });
    expect(Number(f.spend.used)).toBeGreaterThanOrEqual(1500);
    const presenting = (await get("/office/figures?presenting=true")).json();
    expect(presenting.figures.every((x: Json) => x.spend === undefined)).toBe(true);
    await retire(tokens.id);
    await retire(money.id);
  });

  it("applies a project budget only to that project's runs, and an agent budget only to that baseline", async () => {
    const project = (await signed("project.create", { name: "Budget project", mode: "software", default_rigor: "standard", lanes: ["internal"], qa_overlays: [] })).json().id;
    const projectCap = await budget({ scope: "project", scope_id: project, mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const agentCap = await budget({ scope: "agent", scope_id: "author-fake", mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const outside = await claimed("WP-BUD-OUTSIDE");
    const ids = (await reservations(outside)).map((r) => r.budget_id);
    expect(ids).toContain(agentCap.id);
    expect(ids).not.toContain(projectCap.id);
    await retire(projectCap.id);
    await retire(agentCap.id);
  });
});
