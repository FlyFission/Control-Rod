import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { appendEvent } from "../src/events.js";
import { type Harness, ORIGIN, VirtualAuthenticator, registerWithInvitation, signIn, startHarness } from "./harness.js";
import { preparedHarness } from "./preparation-flow.js";

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

const get = async (url: string, as = cookie) => (await h.app.inject({ method: "GET", url, headers: { cookie: as } })).json();
async function signedAdmin(name: string, payload: Json) {
  const o = await h.app.inject({ method: "POST", url: `/admin/commands/${name}/options`, headers: { cookie, origin: ORIGIN }, payload: { payload } });
  return h.app.inject({ method: "POST", url: `/admin/commands/${name}`, headers: { cookie, origin: ORIGIN }, payload: { payload, assertion: key.assert(o.json().options) } });
}
/** A second member with no qualification: may capture and view, never sign or administer. */
let alice: string | undefined;
async function aliceCookie() {
  if (alice) return alice;
  const r = await signedAdmin("member.enroll", { user_name: "alice" });
  expect(r.statusCode, r.body).toBe(200);
  alice = await registerWithInvitation(h.app, r.json().invitation.token, new VirtualAuthenticator());
  return alice;
}
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

  it("routes a lost run with an unknown outcome to someone who may reconcile it", async () => {
    const theirs = await get("/inbox", await aliceCookie());
    expect(theirs.items.some((i: Json) => i.package_id === "WP-IN-LOST")).toBe(false);
    const lost = theirs.waiting_on_others.find((i: Json) => i.package_id === "WP-IN-LOST");
    expect(lost.waiting_on).toMatch(/^someone who is an? /);
    expect(lost.reason).toMatch(/^Reconciling it needs /);
    expect((await get("/inbox")).items.some((i: Json) => i.package_id === "WP-IN-LOST")).toBe(true);
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
    // A draft SCRAM holds is never offered for release: it waits on the restart.
    expect(box.items.some((i: Json) => i.package_id === "WP-IN-STANDARD")).toBe(false);
    expect(box.waiting_on_others.find((i: Json) => i.package_id === "WP-IN-STANDARD")).toMatchObject({ waiting_on: "a restart after SCRAM" });
    expect(box.waiting_on_others.find((i: Json) => i.package_id === "WP-IN-STANDARD").reason).toMatch(/^SCRAM scr_/);
    // The lost run from the ordering test has an unknown outcome in scope: a restart would be refused, and the item says so.
    expect(box.items[0].detail).toBe("Before a restart: 1 run in scope with an unknown outcome to reconcile. Nothing in scope runs until then.");
    const reason = "Machine checked; nothing running";
    const ro1 = await h.app.inject({ method: "POST", url: "/packages/WP-IN-LOST/runs/R-n-lost/reconcile/options", headers: { cookie, origin: ORIGIN }, payload: { reason } });
    expect(ro1.statusCode, ro1.body).toBe(200);
    const settled = await h.app.inject({ method: "POST", url: "/packages/WP-IN-LOST/runs/R-n-lost/reconcile", headers: { cookie, origin: ORIGIN }, payload: { reason, assertion: key.assert(ro1.json().options) } });
    expect(settled.statusCode, settled.body).toBe(200);
    expect((await get("/inbox")).items[0].detail).toBe("Nothing blocks a restart. You may restart it when it is safe.");
    // Someone who may not restart sees it waiting on an administrator, never as theirs.
    const theirs = await get("/inbox", await aliceCookie());
    expect(theirs.items.some((i: Json) => i.kind === "scram")).toBe(false);
    expect(theirs.waiting_on_others.find((i: Json) => i.kind === "scram")).toMatchObject({ waiting_on: "an administrator", detail: "Nothing blocks a restart. An administrator restarts it." });
    const r = { payload: { scram_id: pull.json().id, scope: "all", reason: "Done" } };
    const ro = await h.app.inject({ method: "POST", url: "/admin/commands/scram.restart/options", headers: { cookie, origin: ORIGIN }, payload: r });
    expect((await h.app.inject({ method: "POST", url: "/admin/commands/scram.restart", headers: { cookie, origin: ORIGIN }, payload: { ...r, assertion: key.assert(ro.json().options) } })).statusCode).toBe(200);
    expect((await get("/inbox")).items.some((i: Json) => i.kind === "scram")).toBe(false);
  });
});

describe("waiting agents", () => {
  async function heldRun(id: string, cause: string, reason: string) {
    await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'in-verification', $2)",
      [id, { ...example, id, revision: 0, status: "in-verification", data_lane: "internal", design_inputs: [] }]);
    const r = { schema_version: "0.1.0", id: `R-${id.slice(-6).toLowerCase()}`, package_id: id, package_revision: 0, role: "pre-check", agent_baseline: "unassigned",
      runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: ago(1), generation: 1, waiting_reason: reason, waiting_cause: cause };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 1, 'queued', $3)", [r.id, id, r]);
  }

  it("goes to whoever may resolve what holds it", async () => {
    await heldRun("WP-IN-INDEP", "independent-runtime", "Waiting for a runtime other than the author's");
    await heldRun("WP-IN-PIN", "runtime-pin", "claude here is not the pinned version");
    await heldRun("WP-IN-PREP", "preparation", "The preparation basis changed; refresh it");
    const aliceBox = await get("/inbox", await aliceCookie());
    const theirs = (id: string) => aliceBox.waiting_on_others.find((i: Json) => i.package_id === id);
    expect(aliceBox.items.some((i: Json) => ["WP-IN-INDEP", "WP-IN-PIN"].includes(i.package_id))).toBe(false);
    expect(theirs("WP-IN-INDEP")).toMatchObject({ kind: "permission", risk: { label: "Holds an agent" } });
    expect(theirs("WP-IN-INDEP").reason).toMatch(/^Overriding independence needs /);
    expect(theirs("WP-IN-PIN")).toMatchObject({ waiting_on: "an administrator" });
    // A preparation hold is recovered by returning the package, which needs a reviewer.
    expect(aliceBox.items.some((i: Json) => i.package_id === "WP-IN-PREP")).toBe(false);
    expect(theirs("WP-IN-PREP").reason).toMatch(/^Returning the package for revision needs /);
    // The founding approver and administrator may resolve all three.
    const mine = (await get("/inbox")).items.map((i: Json) => i.package_id);
    expect(mine).toEqual(expect.arrayContaining(["WP-IN-INDEP", "WP-IN-PIN", "WP-IN-PREP"]));
  });

  it("routes an independence hold on high consequence work only to a signer with an attested hardware key", async () => {
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-IN-SAFEIND', 0, 'in-verification', $1)",
      [{ ...example, id: "WP-IN-SAFEIND", revision: 0, status: "in-verification", data_lane: "internal", design_inputs: [], grade: "material", discipline: "mechanical" }]);
    const r = { schema_version: "0.1.0", id: "R-in-safeind", package_id: "WP-IN-SAFEIND", package_revision: 0, role: "pre-check", agent_baseline: "unassigned",
      runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: ago(1), generation: 1,
      waiting_reason: "Waiting for a runtime other than the author's", waiting_cause: "independent-runtime" };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, 'WP-IN-SAFEIND', 0, 'pre-check', 1, 'queued', $2)", [r.id, r]);
    // The founder takes the Material grade and mechanical discipline, but signs with a software passkey.
    const member = (await get("/admin")).me.memberId;
    const q = await signedAdmin("qualification.issue", { member_id: member, licenses: [], disciplines: ["mechanical"], grades: ["general-service", "material"],
      roles: ["originator", "checker", "approver"], authorities: ["administrator", "lane", "policy"], reason: "material work" });
    expect(q.statusCode, q.body).toBe(200);
    const box = await get("/inbox");
    expect(box.items.some((i: Json) => i.package_id === "WP-IN-SAFEIND")).toBe(false);
    const held = box.waiting_on_others.find((i: Json) => i.package_id === "WP-IN-SAFEIND");
    expect(held.waiting_on).toMatch(/with an attested hardware key$/);
    expect(held.reason).toMatch(/needs an attested hardware key/);
    // Back to the founding qualification for the tests that follow.
    const back = await signedAdmin("qualification.issue", { member_id: member, licenses: [], disciplines: [], grades: ["general-service"],
      roles: ["originator", "checker", "approver"], authorities: ["administrator", "lane", "policy"], reason: "general service work" });
    expect(back.statusCode, back.body).toBe(200);
  });

  it("replaces a stale hold with the one that now applies", async () => {
    // A pre-check held earlier by SCRAM; SCRAM is gone, and only the author's runtime is offered.
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-IN-STALEHOLD', 0, 'in-verification', $1)",
      [{ ...example, id: "WP-IN-STALEHOLD", revision: 0, status: "in-verification", data_lane: "internal", design_inputs: [] }]);
    const author = { schema_version: "0.1.0", id: "R-in-sh-author", package_id: "WP-IN-STALEHOLD", package_revision: 0, role: "author", agent_baseline: "author-fake",
      runtime: { kind: "local", provider: "fake", model: "any" }, round: 1, status: "succeeded", queued_at: ago(3), finished_at: ago(2), generation: 1 };
    const check = { schema_version: "0.1.0", id: "R-in-sh-check", package_id: "WP-IN-STALEHOLD", package_revision: 0, role: "pre-check", agent_baseline: "unassigned",
      runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: ago(1), generation: 1,
      waiting_reason: "SCRAM scr_old has stopped this work: old", waiting_cause: "scram" };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body, created_at) values ($1, 'WP-IN-STALEHOLD', 0, 'author', 1, 'succeeded', $2, now() - interval '3 hours')", [author.id, author]);
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, 'WP-IN-STALEHOLD', 0, 'pre-check', 1, 'queued', $2)", [check.id, check]);
    await h.admin.query("update runs set status = 'stopped' where status = 'queued' and id <> $1", [check.id]);
    await h.app.inject({ method: "POST", url: "/runner/claim", headers: { authorization: "Bearer test-daemon-token-0123456789" }, payload: { runtimes: ["fake"] } });
    const now = (await h.db.query<{ body: Json }>("select body from runs where id = $1", [check.id])).rows[0]!.body;
    expect(now.waiting_cause).toBe("independent-runtime");
    expect(now.waiting_reason).not.toMatch(/SCRAM/);
  });
});

describe("recovery under SCRAM", () => {
  it("never counts recovery work as yours when SCRAM holds it and you cannot settle it", async () => {
    // An author run stopped: requeueing it settles the dispute, which any member may do, unless SCRAM holds the work.
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-IN-STOPPED', 0, 'in-work', $1)",
      [{ ...example, id: "WP-IN-STOPPED", revision: 0, status: "in-work", data_lane: "internal", design_inputs: [] }]);
    const r = { schema_version: "0.1.0", id: "R-in-stopped", package_id: "WP-IN-STOPPED", package_revision: 0, role: "author", agent_baseline: "author-claude",
      runtime: { kind: "local", provider: "claude", model: "any" }, round: 1, status: "stopped", queued_at: ago(3), finished_at: ago(2), generation: 1 };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, 'WP-IN-STOPPED', 0, 'author', 1, 'stopped', $2)", [r.id, r]);
    const aliceBox = async () => get("/inbox", await aliceCookie());
    expect((await aliceBox()).items.some((i: Json) => i.package_id === "WP-IN-STOPPED")).toBe(true);
    const pull = await signedAdmin("scram.pull", { scope: "organization", reason: "Recovery check" });
    expect(pull.statusCode, pull.body).toBe(200);
    const held = await aliceBox();
    expect(held.items.some((i: Json) => i.package_id === "WP-IN-STOPPED")).toBe(false);
    expect(held.waiting_on_others.find((i: Json) => i.package_id === "WP-IN-STOPPED")).toMatchObject({ waiting_on: "a restart after SCRAM" });
    // Someone who may return or reject it still has a decision to make.
    expect((await get("/inbox")).items.find((i: Json) => i.package_id === "WP-IN-STOPPED")?.decisions).toEqual(expect.arrayContaining(["return", "reject"]));
    const restart = await signedAdmin("scram.restart", { scram_id: pull.json().id, scope: "all", reason: "Recovery check done" });
    expect(restart.statusCode, restart.body).toBe(200);
  });

  it("judges who may reconcile a SCRAM's unknown outcomes against each run's own package", async () => {
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-IN-MATLOST', 0, 'in-work', $1)",
      [{ ...example, id: "WP-IN-MATLOST", revision: 0, status: "in-work", data_lane: "internal", design_inputs: [], grade: "material", discipline: "mechanical" }]);
    const r = { schema_version: "0.1.0", id: "R-in-matlost", package_id: "WP-IN-MATLOST", package_revision: 0, role: "author", agent_baseline: "author-claude",
      runtime: { kind: "local", provider: "claude", model: "any" }, round: 1, status: "lost", queued_at: ago(3), finished_at: ago(2), generation: 1,
      outcome_unknown: { since: ago(2), reason: "the daemon stopped renewing the lease" } };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, 'WP-IN-MATLOST', 0, 'author', 1, 'lost', $2)", [r.id, r]);
    const pull = await signedAdmin("scram.pull", { scope: "organization", reason: "Material check" });
    expect(pull.statusCode, pull.body).toBe(200);
    // The founding member holds only the General service grade: this reconcile is not theirs.
    const box = await get("/inbox");
    expect(box.items.some((i: Json) => i.kind === "scram")).toBe(false);
    const scram = box.waiting_on_others.find((i: Json) => i.kind === "scram");
    expect(scram.detail).toBe("Before a restart: 1 run in scope with an unknown outcome to reconcile. Nothing in scope runs until then.");
    expect(scram.waiting_on).toMatch(/^someone who is an? /);
    // Settled (as a qualified reviewer would), the SCRAM can be restarted and later tests run unheld.
    await h.admin.query("update runs set body = body || $2 where id = $1", [r.id, { reconciliation: { disposition: "abandoned", evidence: "Test cleanup", recorded_at: ago(0), by: { kind: "human", id: "ben" } } }]);
    const restart = await signedAdmin("scram.restart", { scram_id: pull.json().id, scope: "all", reason: "Material check done" });
    expect(restart.statusCode, restart.body).toBe(200);
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
      await appendEvent(c as never, "preparation.edited", "WP-IN-PREPARED", person, {});
      await appendEvent(c as never, "preparation.confirmed", "WP-IN-PREPARED", person, {});
      await appendEvent(c as never, "admin.command", "qualification.issue", person, { signature: "direct" });
      // A SCRAM command is counted once, as the SCRAM step, not again as administration.
      await appendEvent(c as never, "admin.command", "scram.pull", person, { signature: "direct" });
      // An agent's reconcile is not a person's signature.
      await appendEvent(c as never, "run.reconciled", "R-x", { kind: "agent", id: "author-claude" }, {});
      await c.query("commit");
    } finally {
      c.release();
    }
    const box = await get(`/inbox?since=${before}`);
    const lines = Object.fromEntries(box.digest.lines.map((l: Json) => [l.topic, l]));
    expect(box.digest.lines.map((l: Json) => l.topic)).toEqual(["changes", "signatures", "lateness", "disputes", "gates", "spend"]);
    expect(lines.changes.count).toBe(3);
    expect(lines.signatures).toMatchObject({ count: 4, text: "4 signatures: 1 released, 1 accepted, 1 requirements confirmation, 1 administrative act." });
    expect(lines.changes.text).toBe("3 packages changed: 2 drafted, 1 edited, 1 with requirements edited.");
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

  it("counts criteria as open until something shows them met, never from missing results", async () => {
    const gatesNow = async () => {
      const head = (await get("/inbox")).digest.head;
      return (await get(`/inbox?since=${head}`)).digest.lines.find((l: Json) => l.topic === "gates");
    };
    const before = await gatesNow();
    const packages = (t: string) => Number(/across (\d+) package/.exec(t)?.[1] ?? 0);
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-IN-VERIFY', 0, 'in-verification', $1)",
      [{ ...example, id: "WP-IN-VERIFY", revision: 0, status: "in-verification", data_lane: "internal", design_inputs: [] }]);
    const after = await gatesNow();
    // A package in verification with no pre-check yet: every criterion is open.
    expect(after.count - before.count).toBe(example.acceptance_criteria.length);
    expect(packages(after.text) - packages(before.text)).toBe(1);
    expect(after.text).toMatch(/package(s)? in verification\.$/);
  });

  it("ignores a cursor this log never reached", async () => {
    const box = await get("/inbox?since=99999999");
    expect(box.digest.lines).toEqual([]);
  });
});

describe("requirements confirmation", () => {
  it("asks the person who may confirm requirements to confirm them, binding the requirements digest", async () => {
    const p = await preparedHarness();
    try {
      const d = await p.draft(undefined, undefined, false);
      const box = (await p.owner("GET", "/inbox")).json();
      const item = box.items.find((i: Json) => i.package_id === d.id);
      expect(item).toMatchObject({ kind: "confirm", decisions: ["confirm"], href: { to: "/packages/$id", id: d.id, hash: "preparation" } });
      expect(item.subject_digest).toEqual(d.view.requirements_digest);
      expect(item.binds).toBe(`Signing confirms the requirements of revision 0 of ${d.id} (sha256:${d.view.requirements_digest.value.slice(0, 12)}).`);
      expect(box.waiting_on_others.some((i: Json) => i.package_id === d.id)).toBe(false);
      // Once confirmed, the release says it binds the confirmed requirements too.
      const confirmed = await p.draft();
      const release = (await p.owner("GET", "/inbox")).json().items.find((i: Json) => i.package_id === confirmed.id);
      expect(release).toMatchObject({ kind: "release" });
      expect(release.binds).toMatch(/as drafted: \d+ acceptance criteri(on|a), \d+ deliverables? and its confirmed requirements and preparation basis \(sha256:/);
    } finally {
      await p.h.stop();
    }
    // It starts its own database with preparation enabled.
  }, 120_000);
});
