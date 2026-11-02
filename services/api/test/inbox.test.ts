import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { appendEvent } from "../src/events.js";
import { type Harness, ORIGIN, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

/** The Inbox (plan task 3.3; specification 12 and 5.11; OV-01, OV-09). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
type Json = Record<string, any>;

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const get = async (url: string) => (await h.app.inject({ method: "GET", url, headers: { cookie } })).json();
const ago = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString();

async function draft(id: string, over: Json = {}, updatedHoursAgo = 1) {
  await h.admin.query("insert into packages (id, revision, status, body, updated_at) values ($1, 0, 'draft', $2, $3)",
    [id, { ...example, id, revision: 0, status: "draft", data_lane: "internal", design_inputs: [], ...over }, ago(updatedHoursAgo)]);
}

async function lostRun(id: string, hoursAgo: number) {
  await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'in-work', $2)",
    [id, { ...example, id, revision: 0, status: "in-work", data_lane: "internal", design_inputs: [] }]);
  const r = { schema_version: "0.1.0", id: `R-${id.slice(-6).toLowerCase()}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "author-claude",
    runtime: { kind: "local", provider: "claude", model: "any" }, round: 1, status: "lost", queued_at: ago(hoursAgo + 1), finished_at: ago(hoursAgo), generation: 1,
    outcome_unknown: { since: ago(hoursAgo), reason: "the daemon stopped renewing the lease" } };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'lost', $3)", [r.id, id, r]);
}

describe("ordering", () => {
  it("puts what waits on you in gate risk order, then oldest first, each decision saying what a signature binds", async () => {
    await draft("WP-IN-QUICK-OLD", { rigor_mode: "quick", title: "Quick, older" }, 5);
    await draft("WP-IN-QUICK-NEW", { rigor_mode: "quick", title: "Quick, newer" }, 1);
    await draft("WP-IN-STANDARD", { rigor_mode: "standard", title: "Standard" }, 1);
    await lostRun("WP-IN-LOST", 2);
    const box = await get("/inbox");
    const ids = box.items.filter((i: Json) => i.package_id?.startsWith("WP-IN-")).map((i: Json) => [i.package_id, i.risk.label]);
    expect(ids).toEqual([
      ["WP-IN-LOST", "Outcome unknown"],
      ["WP-IN-STANDARD", "Standard gate"],
      ["WP-IN-QUICK-OLD", "Quick gate"],
      ["WP-IN-QUICK-NEW", "Quick gate"],
    ]);
    const standard = box.items.find((i: Json) => i.package_id === "WP-IN-STANDARD");
    const view = await get("/packages/WP-IN-STANDARD");
    expect(standard.subject_digest).toEqual(view.subject_digest);
    expect(standard.binds).toBe(
      `Signing releases revision 0 of WP-IN-STANDARD as drafted: ${example.acceptance_criteria.length} acceptance criteria and ${example.deliverables.length} deliverable${example.deliverables.length === 1 ? "" : "s"} (sha256:${view.subject_digest.value.slice(0, 12)}).`);
    expect(standard.decisions).toEqual(["release"]);
    expect(standard.href).toEqual({ to: "/packages/$id", id: "WP-IN-STANDARD", hash: "decide" });
  });

  it("lists work only someone else may sign apart, with who and why, and never counts it as yours", async () => {
    await draft("WP-IN-MATERIAL", { grade: "material", discipline: "mechanical", title: "Material grade" });
    const box = await get("/inbox");
    expect(box.items.some((i: Json) => i.package_id === "WP-IN-MATERIAL")).toBe(false);
    const theirs = box.waiting_on_others.find((i: Json) => i.package_id === "WP-IN-MATERIAL");
    expect(theirs).toMatchObject({ risk: { label: "High consequence gate" }, decisions: [] });
    expect(theirs.waiting_on).toMatch(/^someone who is an? /);
    expect(theirs.reason).toMatch(/material grade/i);
  });

  it("puts a SCRAM that needs a person above everything else", async () => {
    const o = await h.app.inject({ method: "POST", url: "/admin/commands/scram.pull/options", headers: { cookie, origin: ORIGIN }, payload: { payload: { scope: "organization", reason: "Inbox check" } } });
    const pull = await h.app.inject({ method: "POST", url: "/admin/commands/scram.pull", headers: { cookie, origin: ORIGIN },
      payload: { payload: { scope: "organization", reason: "Inbox check" }, assertion: key.assert(o.json().options) } });
    expect(pull.statusCode, pull.body).toBe(200);
    const box = await get("/inbox");
    expect(box.items[0]).toMatchObject({ kind: "scram", title: "SCRAM: Inbox check", risk: { rank: 0, label: "Security hold" }, href: { to: "/policies", hash: "command-scram.restart" } });
    // The lost run from the ordering test has an unknown outcome in scope: a restart would be refused, and the item says so.
    expect(box.items[0].detail).toBe("Before a restart: 1 run in scope with an unknown outcome to reconcile. Nothing in scope runs until then.");
    const reason = "Machine checked; nothing running";
    const ro1 = await h.app.inject({ method: "POST", url: "/packages/WP-IN-LOST/runs/R-n-lost/reconcile/options", headers: { cookie, origin: ORIGIN }, payload: { reason } });
    expect(ro1.statusCode, ro1.body).toBe(200);
    const settled = await h.app.inject({ method: "POST", url: "/packages/WP-IN-LOST/runs/R-n-lost/reconcile", headers: { cookie, origin: ORIGIN }, payload: { reason, assertion: key.assert(ro1.json().options) } });
    expect(settled.statusCode, settled.body).toBe(200);
    expect((await get("/inbox")).items[0].detail).toBe("Nothing blocks a restart; restart when it is safe.");
    const r = { payload: { scram_id: pull.json().id, scope: "all", reason: "Done" } };
    const ro = await h.app.inject({ method: "POST", url: "/admin/commands/scram.restart/options", headers: { cookie, origin: ORIGIN }, payload: r });
    expect((await h.app.inject({ method: "POST", url: "/admin/commands/scram.restart", headers: { cookie, origin: ORIGIN }, payload: { ...r, assertion: key.assert(ro.json().options) } })).statusCode).toBe(200);
    expect((await get("/inbox")).items.some((i: Json) => i.kind === "scram")).toBe(false);
  });
});

describe("since you last looked", () => {
  it("gives only the head on a first visit, so counting starts from now", async () => {
    const box = await get("/inbox");
    expect(box.digest.lines).toEqual([]);
    expect(box.digest.head).toBeGreaterThan(0);
  });

  it("summarises in six plain lines, never event codes", async () => {
    const before = (await get("/inbox")).digest.head;
    const c = await h.admin.connect();
    try {
      await c.query("begin");
      const person = { kind: "human" as const, id: "ben" };
      await appendEvent(c as never, "package.drafted", "WP-IN-STANDARD", person, {});
      await appendEvent(c as never, "package.edited", "WP-IN-STANDARD", person, {});
      await appendEvent(c as never, "package.drafted", "WP-IN-QUICK-NEW", person, {});
      await appendEvent(c as never, "decision.release", "WP-IN-QUICK-OLD", person, {});
      await appendEvent(c as never, "decision.accept", "WP-IN-QUICK-OLD", person, {});
      await c.query("commit");
    } finally {
      c.release();
    }
    const box = await get(`/inbox?since=${before}`);
    const lines = Object.fromEntries(box.digest.lines.map((l: Json) => [l.topic, l]));
    expect(box.digest.lines.map((l: Json) => l.topic)).toEqual(["changes", "signatures", "lateness", "disputes", "gates", "spend"]);
    expect(lines.changes).toMatchObject({ count: 2, text: "2 packages changed: 2 drafted, 1 edited." });
    expect(lines.signatures).toMatchObject({ count: 2, text: "2 decisions signed: 1 released, 1 accepted." });
    // The older quick draft has waited five hours; the lost run two: none past a day.
    expect(lines.lateness.text).toBe("Nothing has waited on you more than a day.");
    expect(lines.spend.text).toBe("No spend recorded.");
    for (const l of box.digest.lines) expect(l.text).not.toMatch(/\b[a-z-]+\.[a-z-]+\b/);
  });

  it("counts work waiting on you more than a day as late", async () => {
    await draft("WP-IN-STALE", { rigor_mode: "quick" }, 30);
    const head = (await get("/inbox")).digest.head;
    const box = await get(`/inbox?since=${head}`);
    expect(box.digest.lines.find((l: Json) => l.topic === "lateness")).toMatchObject({ count: 1, text: "1 item has waited on you more than a day." });
  });

  it("ignores a cursor this log never reached", async () => {
    const box = await get("/inbox?since=99999999");
    expect(box.digest.lines).toEqual([]);
  });
});
