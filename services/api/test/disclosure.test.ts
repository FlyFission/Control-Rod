import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { tx } from "../src/db/index.js";
import { LANE_RUNTIMES, admits, admitted } from "../src/disclosure.js";
import { takeMarkingWrite } from "../src/marking-lock.js";
import { declassify, markObject } from "../src/markings.js";
import { type Harness, ORIGIN, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";

/** The disclosure gate (workbench plan task 1.7; specification 11.3 M-0, WB-04). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
const claim = (runtimes: string[]) => h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes } });
const queuedFor = async (subject: string) =>
  (await h.db.query<{ id: string; body: { waiting_reason?: string } }>("select id, body from runs where package_id = $1 and status = 'queued'", [subject])).rows;

describe("lane admission table", () => {
  it("lets public and internal work use the subscription CLIs and keeps sensitive lanes local", () => {
    for (const lane of ["public", "internal"]) for (const r of ["claude", "codex", "fake"]) expect(admits(lane, r)).toBe(true);
    for (const lane of ["proprietary", "client-confidential", "restricted"]) {
      expect(admits(lane, "claude")).toBe(false);
      expect(admits(lane, "codex")).toBe(false);
      expect(admits(lane, "fake")).toBe(true);
    }
    expect(admits(undefined, "fake")).toBe(false);
    expect(admits("made-up", "fake")).toBe(false);
    expect(admitted("internal", ["codex", "claude"])).toEqual(["codex", "claude"]);
    expect(Object.keys(LANE_RUNTIMES).sort()).toEqual(["client-confidential", "internal", "proprietary", "public", "restricted"]);
  });
});

describe("captures", () => {
  it("queues no intake for an unclassified capture, and no runtime can claim it", async () => {
    const c = await post("/captures", { text: "Unclassified request" });
    expect(c.statusCode).toBe(201);
    expect(c.json().lane).toBeUndefined();
    expect(await queuedFor(c.json().id)).toEqual([]);
    expect((await claim(["claude", "codex", "fake"])).statusCode).toBe(204);
    const ev = await h.db.query("select body->'data' as d from events where body->>'type' = 'capture.created' and body->>'subject' = $1", [c.json().id]);
    expect(ev.rows[0].d.unclassified).toBe(true);
  });

  it("releases the capture to intake once a person with lane authority classifies it, and never lowers it", async () => {
    const c = (await post("/captures", { text: "Classify me later" })).json();
    const r = await post(`/captures/${c.id}/classify`, { lane: "internal" });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ lane: "internal", classified_by: "ben" });
    expect(await queuedFor(c.id)).toHaveLength(1);
    expect((await post(`/captures/${c.id}/classify`, { lane: "public" })).json().code).toBe("lowering-needs-change-request");
    expect((await post(`/captures/${c.id}/classify`, { lane: "proprietary" })).json().lane).toBe("proprietary");
    expect(await queuedFor(c.id)).toHaveLength(1);
    expect((await post(`/captures/${c.id}/classify`, { lane: "nonsense" })).statusCode).toBe(400);
  });

  it("holds a proprietary capture from the subscription CLIs, with the reason recorded, and gives it to a local runtime", async () => {
    await h.admin.query("update runs set status = 'stopped' where status = 'queued'");
    const c = (await post("/captures", { text: "Client drawings attached", lane: "proprietary" })).json();
    expect(c.lane).toBe("proprietary");
    expect((await claim(["claude", "codex"])).statusCode).toBe(204);
    const [held] = await queuedFor(c.id);
    expect(held!.body.waiting_reason).toMatch(/proprietary lane admits none of the runtimes/);
    const local = await claim(["fake"]);
    expect(local.statusCode).toBe(200);
    expect(local.json().run.package_id).toBe(c.id);
  });

  it("does not classify a capture for a member without lane authority", async () => {
    await h.admin.query(`insert into members (body) values ('{"id":"mem_nolane","org_id":"org_local","user_name":"nolane","display_name":"No Lane","status":"active"}')`);
    const token = "nolane-session";
    const { createHash } = await import("node:crypto");
    await h.admin.query("insert into sessions (token_hash, user_name, expires_at) values ($1, 'nolane', now() + interval '1 day')", [createHash("sha256").update(token).digest("hex")]);
    const asNoLane = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie: `cr_session=${token}`, origin: ORIGIN }, payload: payload as object });
    const c = await asNoLane("/captures", { text: "From someone without lane authority", lane: "internal" });
    expect(c.statusCode, c.body).toBe(201);
    expect(c.json().lane).toBeUndefined();
    expect(await queuedFor(c.json().id)).toEqual([]);
    const r = await asNoLane(`/captures/${c.json().id}/classify`, { lane: "internal" });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("authority-missing");
  });
});

describe("package runs", () => {
  it("holds a released proprietary package's author run from the subscription CLIs", async () => {
    await h.admin.query("update runs set status = 'stopped' where status = 'queued'");
    const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
    const body = { ...example, id: "WP-LANE-1", revision: 0, status: "released", data_lane: "proprietary", design_inputs: [] };
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-LANE-1', 0, 'released', $1)", [body]);
    const run = {
      schema_version: "0.1.0", id: "R-lane0001", package_id: "WP-LANE-1", package_revision: 0, role: "author", agent_baseline: "unassigned",
      runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(),
    };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ('R-lane0001', 'WP-LANE-1', 0, 'author', 1, 'queued', $1)", [run]);
    expect((await claim(["claude", "codex"])).statusCode).toBe(204);
    const held = (await h.db.query("select body from runs where id = 'R-lane0001'")).rows[0].body;
    expect(held.waiting_reason).toMatch(/proprietary lane admits none/);
    const ev = await h.db.query("select count(*)::int as n from events where body->>'type' = 'run.waiting' and body->>'subject' = 'R-lane0001'");
    expect(ev.rows[0].n).toBe(1);
    // Scanning again records nothing new.
    await claim(["claude"]);
    expect((await h.db.query("select count(*)::int as n from events where body->>'type' = 'run.waiting' and body->>'subject' = 'R-lane0001'")).rows[0].n).toBe(1);
  });
});

describe("every source a job carries", () => {
  const queueAuthor = async (id: string) => {
    await h.admin.query("update runs set status = 'stopped' where status = 'queued'");
    const run = {
      schema_version: "0.1.0", id: `R-${id.toLowerCase().slice(-8)}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "unassigned",
      runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(),
    };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'queued', $3)", [run.id, id, run]);
    return run.id;
  };
  const example = () => parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
  const waiting = async (runId: string) => (await h.db.query("select body->>'waiting_reason' as r from runs where id = $1", [runId])).rows[0].r;

  it("holds a legacy package whose capture was never classified", async () => {
    const c = (await post("/captures", { text: "Never classified" })).json();
    await h.admin.query("insert into packages (id, revision, status, capture_id, body) values ('WP-SRC-1', 0, 'released', $1, $2)",
      [c.id, { ...example(), id: "WP-SRC-1", revision: 0, status: "released", data_lane: "internal", design_inputs: [] }]);
    const runId = await queueAuthor("WP-SRC-1");
    expect((await claim(["claude", "codex", "fake"])).statusCode).toBe(204);
    expect(await waiting(runId)).toMatch(new RegExp(`carries capture ${c.id}, or content derived from it, which has no classified data lane`));
  });

  it("follows a legacy dependency back to its capture when the capture is raised", async () => {
    // A capture from before markings: classified on its record, with no marking row.
    const c = { schema_version: "0.1.0", id: "C-legacy01", text: "Legacy source", source: "web", created_at: new Date().toISOString(), disposition: "package", lane: "internal" };
    await h.admin.query("insert into captures (id, body, created_at) values ($1, $2, $3)", [c.id, c, c.created_at]);
    const base = { ...example(), revision: 0, design_inputs: [], data_lane: "internal" };
    await h.admin.query("insert into packages (id, revision, status, capture_id, body) values ('WP-LEGACY-B', 0, 'accepted', $1, $2)",
      [c.id, { ...base, id: "WP-LEGACY-B", status: "draft" }]);
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-LEGACY-A', 0, 'released', $1)",
      [{ ...base, id: "WP-LEGACY-A", status: "released", depends_on: [{ package_id: "WP-LEGACY-B" }] }]);
    expect((await post(`/captures/${c.id}/classify`, { lane: "restricted" })).statusCode).toBe(200);
    const runId = await queueAuthor("WP-LEGACY-A");
    expect((await claim(["claude", "codex"])).statusCode).toBe(204);
    expect(await waiting(runId)).toMatch(/restricted lane admits none/);
  });

  it("follows a legacy prepared dependency to the sources its release manifest pinned", async () => {
    const extra = { schema_version: "0.1.0", id: "C-legacy02", text: "Pinned extra source", source: "web", created_at: new Date().toISOString(), disposition: "package", lane: "restricted" };
    await h.admin.query("insert into captures (id, body, created_at) values ($1, $2, $3)", [extra.id, extra, extra.created_at]);
    const base = { ...example(), revision: 0, design_inputs: [], data_lane: "internal" };
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-PREP-B', 0, 'accepted', $1)", [{ ...base, id: "WP-PREP-B", status: "draft" }]);
    const release = { schema_version: "0.1.0", id: "D-prepb001", package_id: "WP-PREP-B", package_revision: 0, kind: "release", actor: { kind: "human", id: "ben" },
      subject_digest: { algorithm: "sha256", value: "b".repeat(64) }, assertion: { credential_id: "x", authenticator_data: "x", client_data_json: "x", signature: "x" }, decided_at: new Date().toISOString() };
    await h.admin.query("insert into decisions (id, package_id, package_revision, kind, body) values ($1, 'WP-PREP-B', 0, 'release', $2)", [release.id, release]);
    await h.admin.query("insert into preparation_release_manifests (package_id, package_revision, digest, body, decision_id) values ('WP-PREP-B', 0, $1, $2, $3)",
      ["c".repeat(64), { basis_refs: [{ kind: "attachment", reference: `attachment:${extra.id}/drawing.pdf`, revision: "0", digest: { algorithm: "sha256", value: "d".repeat(64) } }] }, release.id]);
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-PREP-A', 0, 'released', $1)",
      [{ ...base, id: "WP-PREP-A", status: "released", depends_on: [{ package_id: "WP-PREP-B" }] }]);
    const runId = await queueAuthor("WP-PREP-A");
    expect((await claim(["claude", "codex"])).statusCode).toBe(204);
    expect(await waiting(runId)).toMatch(/restricted lane admits none/);
  });

  it("judges a dependency's outputs by the dependency's own lane, even when the package was declassified", async () => {
    const base = { ...example(), revision: 0, design_inputs: [] };
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-SECRET-DEP', 0, 'accepted', $1)",
      [{ ...base, id: "WP-SECRET-DEP", status: "draft", data_lane: "restricted" }]);
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-OPEN', 0, 'released', $1)",
      [{ ...base, id: "WP-OPEN", status: "released", data_lane: "internal", depends_on: [{ package_id: "WP-SECRET-DEP" }] }]);
    // WP-OPEN's own marking is declassified to internal over the restricted dependency.
    await tx(h.admin, async (c) => {
      await takeMarkingWrite(c);
      const m = await markObject(c, "package", "WP-OPEN", "internal", "test", [{ kind: "package", id: "WP-SECRET-DEP" }]);
      expect(m.effective_lane).toBe("restricted");
      const d = await declassify(c, "package", "WP-OPEN", m.version, "internal", "cr_open");
      expect(d.effective_lane).toBe("internal");
    });
    const runId = await queueAuthor("WP-OPEN");
    expect((await claim(["claude", "codex"])).statusCode).toBe(204);
    expect(await waiting(runId)).toMatch(/restricted lane admits none/);
    const local = await claim(["fake"]);
    expect(local.statusCode).toBe(200);
    expect(local.json().run.package_id).toBe("WP-OPEN");
  });
});
