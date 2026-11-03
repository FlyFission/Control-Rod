import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { cubeFor } from "../src/figures.js";
import { type Harness, ORIGIN, VirtualAuthenticator, registerWithInvitation, signIn, startHarness } from "./harness.js";

/** The AgentFigure projection behind the office view (plan task 4.6; specification 13; OV-01, OV-02, OV-07). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
type Json = Record<string, any>;
const ago = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString();

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
  await seed();
}, 120_000);
afterAll(async () => h?.stop());

const get = async (url: string, as = cookie) => (await h.app.inject({ method: "GET", url, headers: { cookie: as } })).json();
let alice: string | undefined;
async function aliceCookie() {
  if (alice) return alice;
  const payload = { user_name: "alice" };
  const o = await h.app.inject({ method: "POST", url: "/admin/commands/member.enroll/options", headers: { cookie, origin: ORIGIN }, payload: { payload } });
  const r = await h.app.inject({ method: "POST", url: "/admin/commands/member.enroll", headers: { cookie, origin: ORIGIN }, payload: { payload, assertion: key.assert(o.json().options) } });
  expect(r.statusCode, r.body).toBe(200);
  alice = await registerWithInvitation(h.app, r.json().invitation.token, new VirtualAuthenticator());
  return alice;
}

async function pkg(id: string, status: string, over: Json = {}, createdHoursAgo = 2, revision = 0) {
  await h.admin.query("insert into packages (id, revision, status, body, created_at) values ($1, $2, $3, $4, $5)",
    [id, revision, status, { ...example, id, revision, status, data_lane: "internal", design_inputs: [], ...over }, ago(createdHoursAgo)]);
}
async function run(id: string, packageId: string, status: string, over: Json = {}, role = "author", round = 1) {
  const body = { schema_version: "0.1.0", id, package_id: packageId, package_revision: 0, role, agent_baseline: "author-claude",
    runtime: { kind: "local", provider: "claude", model: "any" }, round, status, queued_at: ago(1), generation: 1, ...over };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, $3, $4, $5, $6)", [id, packageId, role, round, status, body]);
}

async function seed() {
  await pkg("WP-FIG-WORK", "in-work", { discipline: "mechanical-hvac", title: "Line sizing" });
  await run("R-fig-work", "WP-FIG-WORK", "running", { started_at: ago(0.5), label: "Drafting the line sizing calculation" });
  await pkg("WP-FIG-HOLD", "in-work", { discipline: "electrical" });
  await run("R-fig-hold", "WP-FIG-HOLD", "queued", { waiting_reason: "Its sources are proprietary; a lane holder must admit the run", waiting_cause: "lane" });
  await pkg("WP-FIG-LOST", "in-work", { discipline: "civil" });
  await run("R-fig-lost", "WP-FIG-LOST", "lost", { finished_at: ago(3), outcome_unknown: { since: ago(3), reason: "the daemon stopped renewing the lease" } });
  await pkg("WP-FIG-QUEUED", "in-work", { discipline: "process piping" });
  await run("R-fig-queued", "WP-FIG-QUEUED", "queued");
  await pkg("WP-FIG-CHECK", "in-verification", { grade: "safety" });
  await run("R-fig-check", "WP-FIG-CHECK", "running", { started_at: ago(0.2), permission_waits: "not-observable" }, "pre-check", 2);
  await pkg("WP-FIG-SECRET", "in-work", { data_lane: "restricted", discipline: "civil" });
  await run("R-fig-secret", "WP-FIG-SECRET", "running", { started_at: ago(0.1) });
  // A dependency whose target is revised after the dependent revision was made.
  await pkg("WP-FIG-DEP", "draft", {}, 5);
  await pkg("WP-FIG-CHANGED", "in-work", { discipline: "structural", depends_on: [{ package_id: "WP-FIG-DEP", reason: "Uses its loads" }] }, 4);
  await run("R-fig-changed", "WP-FIG-CHANGED", "running", { started_at: ago(0.3) });
  await pkg("WP-FIG-DEP", "draft", { title: "Revised loads" }, 1, 1);
  // The dependent's preparation pinned the dependency at revision 0, the baseline for "changed".
  await h.admin.query(
    `insert into preparation_snapshots (preparation_id, revision, package_id, package_revision, content_digest, requirements_digest, body, created_at)
     values ('PREP-FIG-CHANGED', 0, 'WP-FIG-CHANGED', 0, $1, $1, $2, now())`,
    ["f".repeat(64), { basis: [{ kind: "package", reference: "package:WP-FIG-DEP", revision: "0", digest: { algorithm: "sha256", value: "0".repeat(64) } }] }],
  );
  await h.admin.query("insert into preparation_heads (package_id, preparation_id, revision) values ('WP-FIG-CHANGED', 'PREP-FIG-CHANGED', 0)");
  // A dependent with no preparation: the dependency's freshness is unknown, never claimed changed.
  await pkg("WP-FIG-UNPINNED", "in-work", { discipline: "civil", depends_on: [{ package_id: "WP-FIG-DEP", reason: "Uses its loads" }] }, 4);
  await run("R-fig-unpinned", "WP-FIG-UNPINNED", "running", { started_at: ago(0.3) });
  // A queued run held back because its dependency is not accepted: not a runtime wait.
  await pkg("WP-FIG-BLOCKED", "released", { discipline: "civil", depends_on: [{ package_id: "WP-FIG-DEP", reason: "Needs its loads" }] }, 3);
  await run("R-fig-blocked", "WP-FIG-BLOCKED", "queued");
  // Work stated internal in its body but raised to restricted by its marking.
  await pkg("WP-FIG-RAISED", "in-work", { discipline: "civil", title: "Raised later" });
  await run("R-fig-raised", "WP-FIG-RAISED", "running", { started_at: ago(0.1) });
  const v = (await h.admin.query("select coalesce(max(version), 0) + 1 as v from object_markings where object_kind = 'package' and object_id = 'WP-FIG-RAISED'")).rows[0].v;
  await h.admin.query("insert into object_markings (body) values ($1)", [{ object_kind: "package", object_id: "WP-FIG-RAISED", version: v, lane: "internal", effective_lane: "restricted" }]);
  // A failed run the viewer may rule on: a dispute in Your office (OV-05).
  await pkg("WP-FIG-FAILED", "in-work", { discipline: "electrical" });
  await run("R-fig-failed", "WP-FIG-FAILED", "failed", { finished_at: ago(0.5), error: "the pump curve file is missing" });
  // An intake agent on a capture, before any package exists.
  await h.admin.query("insert into captures (id, body, created_at) values ('CAP-FIG', $1, now())", [{ id: "CAP-FIG", text: "Size the cooling water pumps\nfor the new skid" }]);
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ('R-fig-intake', 'CAP-FIG', 0, 'intake', 1, 'queued', $1)",
    [{ schema_version: "0.1.0", id: "R-fig-intake", package_id: "CAP-FIG", package_revision: 0, role: "intake", agent_baseline: "intake-claude",
      runtime: { kind: "local", provider: "claude", model: "any" }, round: 1, status: "queued", queued_at: ago(0.4), generation: 1,
      waiting_reason: "No runtime version is pinned for intake; an administrator pins one", waiting_cause: "runtime-pin" }]);
  // Settled work and work no agent has touched are not figures.
  await pkg("WP-FIG-DONE", "accepted");
  await run("R-fig-done", "WP-FIG-DONE", "succeeded", { finished_at: ago(1) });
  await pkg("WP-FIG-DRAFT", "draft");
}

const figure = (floor: Json, packageId: string) => floor.figures.find((f: Json) => f.package_id === packageId);

describe("office figures", () => {
  it("projects each state with its cause and place from recorded data (OV-02)", async () => {
    const floor = await get("/office/figures");
    const work = figure(floor, "WP-FIG-WORK");
    expect(work).toMatchObject({ state: "working", place: "mechanical", cause: "Drafting the line sizing calculation", role: "author", title: "Line sizing" });
    expect(figure(floor, "WP-FIG-QUEUED")).toMatchObject({ state: "waiting", place: "bench", waiting_on: "a runtime", cause: "Author run queued for a runtime" });
    expect(figure(floor, "WP-FIG-LOST").cause).toMatch(/outcome is unknown/);
    const changed = figure(floor, "WP-FIG-CHANGED");
    expect(changed).toMatchObject({ state: "changed", place: "civil", cause: "Input WP-FIG-DEP moved to revision 1 after the preparation pinned it", marks: { changed_input: "WP-FIG-DEP" } });
    // Without a pinned baseline the input's freshness is said to be unknown, never guessed changed.
    const unpinned = figure(floor, "WP-FIG-UNPINNED");
    expect(unpinned).toMatchObject({ state: "working", unverified_inputs: ["WP-FIG-DEP"] });
    expect(unpinned.marks.changed_input).toBeUndefined();
    // Held back by a dependency not yet accepted, which is not a wait for a runtime.
    expect(figure(floor, "WP-FIG-BLOCKED")).toMatchObject({ state: "waiting", place: "interface", cause: "Author run waits for WP-FIG-DEP to be accepted" });
    // Every figure says why, and when the state began.
    for (const f of floor.figures) {
      expect(f.cause.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(f.since))).toBe(false);
    }
    expect(figure(floor, "WP-FIG-DONE")).toBeUndefined();
    expect(figure(floor, "WP-FIG-DRAFT")).toBeUndefined();
  });

  it("puts what waits on the viewer in Your office and counts only that (OV-01)", async () => {
    const mine = await get("/office/figures");
    expect(figure(mine, "WP-FIG-HOLD")).toMatchObject({ state: "needs", place: "your-office", cause: "Its sources are proprietary; a lane holder must admit the run" });
    expect(mine.needs_me).toBe(mine.figures.filter((f: Json) => f.place === "your-office").length);
    // A failed run the viewer may requeue or rule on is a dispute in Your office (OV-05), counted.
    expect(figure(mine, "WP-FIG-FAILED")).toMatchObject({ state: "needs", place: "your-office" });
    expect(figure(mine, "WP-FIG-FAILED").cause).toMatch(/pump curve file is missing/);
    // The lost run the viewer may reconcile is theirs too.
    expect(figure(mine, "WP-FIG-LOST")).toMatchObject({ state: "needs", place: "your-office" });
    expect(mine.needs_me).toBe(4);
    // An intake agent on a capture is on the floor too, routed like the Inbox routes its hold.
    expect(figure(mine, "CAP-FIG")).toMatchObject({ role: "intake", state: "needs", place: "your-office", title: "Intake: Size the cooling water pumps", cause: "No runtime version is pinned for intake; an administrator pins one" });
    // The Inbox holds the drafts too, which have no agent: the floor reports both.
    expect(mine.inbox_items).toBeGreaterThan(mine.needs_me);
    // Someone with no lane authority sees the same agent waiting on another, by name, never in their office.
    const theirs = await get("/office/figures", await aliceCookie());
    const hold = figure(theirs, "WP-FIG-HOLD");
    expect(hold).toMatchObject({ state: "waiting", place: "interface" });
    expect(hold.waiting_on).toMatch(/lane/);
    // Only what is theirs to act on: any member may requeue a failed run, so that dispute is in their office too.
    expect(theirs.figures.filter((f: Json) => f.place === "your-office").map((f: Json) => f.package_id)).toEqual(["WP-FIG-FAILED"]);
    expect(theirs.needs_me).toBe(1);
    // A lost run they may not reconcile is still ruled on in Review, and says who may.
    expect(figure(theirs, "WP-FIG-LOST")).toMatchObject({ state: "stuck", place: "review", waiting_on: expect.stringMatching(/^someone who is/) });
  });

  it("carries the marks, the gate stage and what a print mode run cannot report (OV-06)", async () => {
    const floor = await get("/office/figures");
    const check = figure(floor, "WP-FIG-CHECK");
    expect(check).toMatchObject({ state: "working", place: "verification", gate_stage: "pre-check", marks: { gate: false, loop: 2, safety: true },
      observability: "permission waits not observable in print mode" });
    // It stands in Verification, not a defaulted cube, so it carries no default flag.
    expect(check.place_defaulted).toBeUndefined();
    expect(figure(floor, "WP-FIG-WORK").marks).toEqual({ gate: false, safety: false });
    expect(figure(floor, "WP-FIG-WORK").gate_stage).toBe("in-work");
  });

  it("leaves restricted work out of presenting mode entirely and only counts it (OV-07)", async () => {
    const all = await get("/office/figures");
    expect(figure(all, "WP-FIG-SECRET")).toBeDefined();
    // The effective lane comes from the current marking, not the lane the signed body states.
    expect(figure(all, "WP-FIG-RAISED").data_lane).toBe("restricted");
    const presenting = await get("/office/figures?presenting=true");
    expect(figure(presenting, "WP-FIG-SECRET")).toBeUndefined();
    expect(figure(presenting, "WP-FIG-RAISED")).toBeUndefined();
    expect(presenting.hidden).toBeGreaterThanOrEqual(2);
    for (const leaked of ["WP-FIG-SECRET", "WP-FIG-RAISED", "Raised later"]) expect(JSON.stringify(presenting)).not.toContain(leaked);
  });

  it("maps a discipline to its cube set by its words, and says when it had to default", () => {
    expect(cubeFor("mechanical-hvac")).toEqual({ place: "mechanical", defaulted: false });
    expect(cubeFor("Instrumentation and controls")).toEqual({ place: "electrical", defaulted: false });
    expect(cubeFor("structural")).toEqual({ place: "civil", defaulted: false });
    expect(cubeFor("quality assurance")).toEqual({ place: "assurance", defaulted: false });
    expect(cubeFor("project controls")).toEqual({ place: "project-controls", defaulted: false });
    expect(cubeFor("process piping")).toEqual({ place: "mechanical", defaulted: false });
    expect(cubeFor(undefined)).toEqual({ place: "process", defaulted: true });
    expect(cubeFor("bespoke")).toEqual({ place: "process", defaulted: true });
  });

  it("puts work an active SCRAM holds in Quarantine above everything else, even a finished run", async () => {
    await pkg("WP-FIG-HELD", "in-verification", { discipline: "mechanical" });
    await run("R-fig-held", "WP-FIG-HELD", "succeeded", { finished_at: ago(0.2) }, "pre-check");
    const payload = { scope: "organization", reason: "Bad prompt shipped to every agent" };
    const o = await h.app.inject({ method: "POST", url: "/admin/commands/scram.pull/options", headers: { cookie, origin: ORIGIN }, payload: { payload } });
    expect(o.statusCode, o.body).toBe(200);
    const pulled = await h.app.inject({ method: "POST", url: "/admin/commands/scram.pull", headers: { cookie, origin: ORIGIN }, payload: { payload, assertion: key.assert(o.json().options) } });
    expect(pulled.statusCode, pulled.body).toBe(200);
    const floor = await get("/office/figures");
    const held = figure(floor, "WP-FIG-HELD");
    expect(held).toMatchObject({ state: "stuck", place: "quarantine" });
    expect(held.cause).toMatch(/^Held by SCRAM scr_.+: Bad prompt shipped to every agent$/);
    // Every agent the SCRAM reaches stands in Quarantine, whatever it was doing.
    expect(figure(floor, "WP-FIG-WORK")).toMatchObject({ state: "stuck", place: "quarantine" });
  });
});
