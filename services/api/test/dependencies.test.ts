import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { migrate } from "../src/db/migrate.js";
import { DEPENDENCIES_DOWN_SQL } from "../src/db/migrations/013-dependencies.js";
import { RUN_EVENTS_DOWN_SQL } from "../src/db/migrations/014-run-events.js";
import { SCRAM_DOWN_SQL } from "../src/db/migrations/015-scram.js";
import { CHAIN_SEALS_DOWN_SQL } from "../src/db/migrations/016-chain-seals.js";
import { type Harness, ORIGIN, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";

/** Explicit package dependencies (workbench plan task 1.8; specification 7 "depends on"). */
let h: Harness;
let cookie: string;
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, new VirtualAuthenticator());
}, 120_000);
afterAll(async () => h?.stop());

const body = (id: string, extra: object = {}) => ({ ...example, id, revision: 0, status: "draft", data_lane: "internal", design_inputs: [], ...extra });
const insert = (id: string, status: string, extra: object = {}, revision = 0) =>
  h.admin.query("insert into packages (id, revision, status, body) values ($1, $2, $3, $4)", [id, revision, status, { ...body(id, extra), revision }]);
const rows = async (id: string) =>
  (await h.db.query<{ depends_on: string; source: string; package_revision: number }>(
    "select depends_on, source, package_revision from package_dependencies where package_id = $1 order by package_revision, depends_on", [id])).rows;
const claim = () => h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: ["fake"] } });

/** Queues an author run for a released package, and stops every other queued run. */
async function queueAuthor(id: string) {
  await h.admin.query("update runs set status = 'stopped' where status = 'queued'");
  const run = {
    schema_version: "0.1.0", id: `R-${id}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "unassigned",
    runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(),
  };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'queued', $3)", [run.id, id, run]);
}

describe("readiness", () => {
  it("never makes a package wait on a package it only cites", async () => {
    await insert("WP-CITED", "draft");
    await insert("WP-CITES", "released", { design_inputs: [{ doc: "WP-CITED", revision: "0", use: "reference" }] });
    expect(await rows("WP-CITES")).toEqual([]);
    await queueAuthor("WP-CITES");
    const r = await claim();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().run.package_id).toBe("WP-CITES");
  });

  it("holds a package until every package it depends on is accepted", async () => {
    await insert("WP-FIRST", "released");
    await insert("WP-SECOND", "released", { depends_on: [{ package_id: "WP-FIRST", reason: "needs its loads" }] });
    expect(await rows("WP-SECOND")).toEqual([{ depends_on: "WP-FIRST", source: "explicit", package_revision: 0 }]);
    await queueAuthor("WP-SECOND");
    expect((await claim()).statusCode).toBe(204);
    await h.admin.query("update packages set status = 'accepted' where id = 'WP-FIRST'");
    const r = await claim();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().run.package_id).toBe("WP-SECOND");
  });
});

describe("the database refuses", () => {
  it("a dependency on an unknown package, on itself, or a cycle", async () => {
    await expect(insert("WP-ORPHAN", "draft", { depends_on: [{ package_id: "WP-NOWHERE" }] })).rejects.toMatchObject({ code: "23503" });
    await expect(insert("WP-SELF", "draft", { depends_on: [{ package_id: "WP-SELF" }] })).rejects.toMatchObject({ code: "23514" });
    await insert("WP-A", "draft");
    await insert("WP-B", "draft", { depends_on: [{ package_id: "WP-A" }] });
    await insert("WP-C", "draft", { depends_on: [{ package_id: "WP-B" }] });
    await expect(h.admin.query("update packages set body = $1 where id = 'WP-A'", [body("WP-A", { depends_on: [{ package_id: "WP-C" }] })]))
      .rejects.toMatchObject({ code: "23514" });
    expect(await rows("WP-A")).toEqual([]);
  });

  it("keeps rows in step when a draft drops a dependency", async () => {
    await insert("WP-D", "draft", { depends_on: [{ package_id: "WP-A" }] });
    await h.admin.query("update packages set body = $1 where id = 'WP-D'", [body("WP-D")]);
    expect(await rows("WP-D")).toEqual([]);
  });
});

describe("editing a draft", () => {
  const view = async (id: string) => (await h.app.inject({ method: "GET", url: `/packages/${id}`, headers: { cookie } })).json();
  const put = (id: string, b: unknown, ifMatch: string) =>
    h.app.inject({ method: "PUT", url: `/packages/${id}`, headers: { cookie, origin: ORIGIN, "if-match": ifMatch }, payload: b as object });

  it("names an unknown or self dependency, and a cycle, as a clear refusal", async () => {
    await insert("WP-EDIT", "draft");
    let v = await view("WP-EDIT");
    const unknown = await put("WP-EDIT", { ...v.package, depends_on: [{ package_id: "WP-GHOST" }] }, v.draft_etag);
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().code).toBe("unknown-dependency");
    const self = await put("WP-EDIT", { ...v.package, depends_on: [{ package_id: "WP-EDIT" }] }, v.draft_etag);
    expect(self.json().code).toBe("invalid-dependency");
    const cycle = await put("WP-A", { ...(await view("WP-A")).package, depends_on: [{ package_id: "WP-C" }] }, (await view("WP-A")).draft_etag);
    expect(cycle.statusCode).toBe(400);
    expect(cycle.json().code).toBe("invalid-dependency");
    v = await view("WP-EDIT");
    const ok = await put("WP-EDIT", { ...v.package, depends_on: [{ package_id: "WP-A", reason: "needs it" }] }, v.draft_etag);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(await rows("WP-EDIT")).toEqual([{ depends_on: "WP-A", source: "explicit", package_revision: 0 }]);
  });
});

describe("migration 013", () => {
  it("classifies design inputs that named a package before it as dependencies, and later revisions inherit them", async () => {
    // Later migrations come off first, as a real rollback would take them.
    await h.admin.query(CHAIN_SEALS_DOWN_SQL);
    await h.admin.query(SCRAM_DOWN_SQL);
    await h.admin.query(RUN_EVENTS_DOWN_SQL);
    await h.admin.query(DEPENDENCIES_DOWN_SQL);
    await insert("WP-OLD-BASE", "accepted");
    await insert("WP-OLD", "released", {
      design_inputs: [
        { doc: "WP-OLD-BASE", revision: "0", use: "loads" },
        { doc: "attachment:site.geojson", revision: "0", use: "boundary" },
        { doc: "SOME-STANDARD", revision: "3", use: "criteria" },
      ],
    });
    await migrate(h.admin);
    expect(await rows("WP-OLD")).toEqual([{ depends_on: "WP-OLD-BASE", source: "classified-design-input", package_revision: 0 }]);
    // Packages that already said what they depend on keep those rows, and the trigger is back.
    expect(await rows("WP-SECOND")).toEqual([{ depends_on: "WP-FIRST", source: "explicit", package_revision: 0 }]);
    await expect(insert("WP-AFTER", "draft", { depends_on: [{ package_id: "WP-MISSING" }] })).rejects.toMatchObject({ code: "23503" });

    await insert("WP-OLD", "draft", { design_inputs: [{ doc: "WP-OLD-BASE", revision: "0", use: "loads" }] }, 1);
    expect((await rows("WP-OLD")).filter((r) => r.package_revision === 1)).toEqual([
      { depends_on: "WP-OLD-BASE", source: "classified-design-input", package_revision: 1 },
    ]);
    // An explicit dependency on the same target takes over the classified row and survives the citation.
    await insert("WP-OLD-KEEP", "draft", { design_inputs: [{ doc: "WP-OLD-BASE", revision: "0", use: "loads" }] });
    await h.admin.query("update packages set body = $1 where id = 'WP-OLD-KEEP'",
      [body("WP-OLD-KEEP", { design_inputs: [{ doc: "WP-OLD-BASE", revision: "0", use: "loads" }], depends_on: [{ package_id: "WP-OLD-BASE" }] })]);
    await h.admin.query("update packages set body = $1 where id = 'WP-OLD-KEEP'", [body("WP-OLD-KEEP", { depends_on: [{ package_id: "WP-OLD-BASE" }] })]);
    expect(await rows("WP-OLD-KEEP")).toEqual([{ depends_on: "WP-OLD-BASE", source: "explicit", package_revision: 0 }]);
    // Dropping the citation drops the classified dependency with it.
    await h.admin.query("update packages set body = $1 where id = 'WP-OLD' and revision = 1", [{ ...body("WP-OLD"), revision: 1 }]);
    expect((await rows("WP-OLD")).filter((r) => r.package_revision === 1)).toEqual([]);
  });
});
