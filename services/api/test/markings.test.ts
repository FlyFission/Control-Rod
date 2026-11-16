import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Tx, tx } from "../src/db/index.js";
import { takeMarkingWrite } from "../src/marking-lock.js";
import { currentMarking, declassify, endOverride, exportLane, markObject, mostSensitive } from "../src/markings.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** Markings, provenance and declassification (workbench plan task 1.9; specification 11.3 M-1 to M-3). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
type Json = Record<string, any>;

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
const get = (url: string) => h.app.inject({ method: "GET", url, headers: { cookie } });
async function signed(name: string, payload: Json) {
  const o = await post(`/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(`/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
}
const marking = (kind: string, id: string) => currentMarking(h.db, kind, id);
/** A marking change as a writing command makes it: graph lock first. */
const write = <T>(fn: (c: Tx) => Promise<T>) => tx(h.admin, async (c) => { await takeMarkingWrite(c); return fn(c); });
const versions = async (kind: string, id: string) =>
  (await h.db.query<{ body: Json }>("select body from object_markings where object_kind = $1 and object_id = $2 order by version", [kind, id])).rows.map((r) => r.body);

/** Runs a capture's intake on the local runtime and returns the package it drafted. */
async function intake(captureId: string, dataLane: string): Promise<string> {
  await h.admin.query("update runs set status = 'stopped' where status = 'queued' and package_id <> $1", [captureId]);
  const r = await h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: ["fake"] } });
  expect(r.statusCode, r.body).toBe(200);
  const job = r.json();
  expect(job.run.package_id).toBe(captureId);
  claims.set(job.run.id, job.claim.token);
  const draft = {
    schema_version: "0.1.0", id: "LOADS", revision: 0, title: "Loads", project: "PRJ-TEST", mode: "capital-projects", status: "draft",
    rigor_mode: "standard", data_lane: dataLane, objective: "Compute loads", deliverables: [{ id: "LOADS-D1", type: "report", format: ["md"] }],
    design_inputs: [], agent_assignment: [{ role: "general-author", agent_baseline: "author", baseline_revision: 0 }],
    acceptance_criteria: ["The report exists"],
    verification: { method: "agent-pre-check", verifier: "checker", verifier_receives: ["deliverables"],
      required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false } },
  };
  const url = `/runner/runs/${job.run.id}/complete`;
  const done = await h.app.inject({ method: "POST", url, headers: daemonHeaders,
    payload: withClaim(url, { status: "succeeded", outputs: [{ name: "packages/LOADS.json", content_base64: b64(JSON.stringify(draft)) }] }) });
  expect(done.statusCode, done.body).toBe(200);
  return (await h.db.query<{ id: string }>("select id from packages where capture_id = $1", [captureId])).rows[0]!.id;
}

describe("rules", () => {
  it("takes the most sensitive lane, and refuses an export whose lane does not cover every part", () => {
    expect(mostSensitive(["internal", "restricted", "public"])).toBe("restricted");
    expect(mostSensitive([])).toBe("public");
    const parts = [{ name: "calc.md", lane: "internal" as const }, { name: "drawing.pdf", lane: "proprietary" as const }];
    expect(exportLane(parts)).toBe("proprietary");
    expect(exportLane(parts, "restricted")).toBe("restricted");
    expect(() => exportLane(parts, "internal")).toThrow(/internal export cannot carry drawing.pdf \(proprietary\)/);
  });
});

describe("provenance", () => {
  let captureId = "";
  let packageId = "";

  it("marks a classified capture, and an agent cannot draft a package below the request's lane", async () => {
    const c = await post("/captures", { text: "Client loads", lane: "proprietary" });
    captureId = c.json().id;
    expect(await marking("capture", captureId)).toMatchObject({ version: 1, lane: "proprietary", effective_lane: "proprietary" });
    packageId = await intake(captureId, "internal");
    const view = (await get(`/packages/${packageId}`)).json();
    expect(view.package.data_lane).toBe("proprietary");
    expect(view.effective_lane).toBe("proprietary");
    expect(await marking("package", packageId)).toMatchObject({
      version: 1, lane: "proprietary", effective_lane: "proprietary",
      inputs: [{ object_kind: "capture", object_id: captureId, version: 1 }],
    });
    const list = (await get("/captures")).json();
    expect(list.find((x: Json) => x.id === captureId).effective_lane).toBe("proprietary");
  });

  it("raises derived objects into new marking versions when an input is raised, never editing one", async () => {
    expect((await post(`/captures/${captureId}/classify`, { lane: "client-confidential" })).statusCode).toBe(200);
    const pkg = await versions("package", packageId);
    expect(pkg.map((v) => v.version)).toEqual([1, 2]);
    expect(pkg[0]!.effective_lane).toBe("proprietary");
    expect(pkg[1]).toMatchObject({ lane: "proprietary", effective_lane: "client-confidential", inputs: [{ object_id: captureId, version: 2 }] });
    expect((await get(`/packages/${packageId}`)).json().effective_lane).toBe("client-confidential");
  });

  it("refuses to lower a draft's lane by editing it", async () => {
    const v = (await get(`/packages/${packageId}`)).json();
    const r = await h.app.inject({ method: "PUT", url: `/packages/${packageId}`, headers: { cookie, origin: ORIGIN, "if-match": v.draft_etag },
      payload: { ...v.package, data_lane: "internal" } });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("lowering-needs-change-request");
    const raised = await h.app.inject({ method: "PUT", url: `/packages/${packageId}`, headers: { cookie, origin: ORIGIN, "if-match": v.draft_etag },
      payload: { ...v.package, data_lane: "restricted" } });
    expect(raised.statusCode, raised.body).toBe(200);
    expect(await marking("package", packageId)).toMatchObject({ assigned: "restricted", effective_lane: "restricted" });
  });

  it("declassifies only by a signed change request over the exact version, listing the impact, and recomputes what was derived", async () => {
    // Lower the package back to its capture's lane first: the package's own raise is what holds it at restricted.
    const lowerPkg = await post("/admin/commands/marking.propose-declassification",
      { payload: { object_kind: "package", object_id: packageId, lane: "client-confidential", reason: "raised in error" } });
    expect(lowerPkg.statusCode, lowerPkg.body).toBe(200);
    expect((await signed("marking.approve-declassification", { change_request_id: lowerPkg.json().id })).statusCode).toBe(200);

    const p = await post("/admin/commands/marking.propose-declassification",
      { payload: { object_kind: "capture", object_id: captureId, lane: "internal", reason: "client released the loads publicly" } });
    expect(p.statusCode, p.body).toBe(200);
    const cr = p.json();
    expect(cr).toMatchObject({ kind: "declassification", status: "proposed", impact: [`package/${packageId}`] });
    expect(cr.proposal).toMatchObject({ object_kind: "capture", object_id: captureId, version: 2, from: "client-confidential", lane: "internal" });

    const unsignedTry = await post("/admin/commands/marking.approve-declassification", { payload: { change_request_id: cr.id } });
    expect(unsignedTry.json().code).toBe("signature-required");

    const ok = await signed("marking.approve-declassification", { change_request_id: cr.id });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({ version: 3, override: { lane: "internal", change_request_id: cr.id }, effective_lane: "internal" });
    // The package's override (from the first request) still holds it at client-confidential.
    const pkg = await marking("package", packageId);
    expect(pkg).toMatchObject({ change_request_id: cr.id, inputs: [{ object_id: captureId, version: 3 }] });
    const capture = (await get("/captures")).json().find((x: Json) => x.id === captureId);
    expect(capture).toMatchObject({ lane: "internal", effective_lane: "internal" });
    // Every earlier version is still there, unchanged.
    expect((await versions("capture", captureId)).map((v) => v.effective_lane)).toEqual(["proprietary", "client-confidential", "internal"]);

    const again = await signed("marking.approve-declassification", { change_request_id: cr.id });
    expect(again.json().code).toBe("not-proposed");
  });

  it("takes an unrelated draft edit after an input raised the package above its own lane", async () => {
    const c = (await post("/captures", { text: "Edit me after a raise", lane: "internal" })).json();
    const id = await intake(c.id, "internal");
    expect((await post(`/captures/${c.id}/classify`, { lane: "proprietary" })).statusCode).toBe(200);
    const v = (await get(`/packages/${id}`)).json();
    expect(v.package.data_lane).toBe("internal");
    expect(v.effective_lane).toBe("proprietary");
    const put = (payload: Json) => h.app.inject({ method: "PUT", url: `/packages/${id}`, headers: { cookie, origin: ORIGIN, "if-match": v.draft_etag }, payload });
    // Leaving the lane alone is no lowering, and the inherited lane stays effective.
    const r = await put({ ...v.package, title: "Loads, retitled" });
    expect(r.statusCode, r.body).toBe(200);
    expect((await get(`/packages/${id}`)).json().effective_lane).toBe("proprietary");
    // Lowering the draft's own lane is still refused.
    const now = (await get(`/packages/${id}`)).json();
    const low = await h.app.inject({ method: "PUT", url: `/packages/${id}`, headers: { cookie, origin: ORIGIN, "if-match": now.draft_etag },
      payload: { ...now.package, data_lane: "public" } });
    expect(low.json().code).toBe("lowering-needs-change-request");
  });

  it("keeps a declassification when a draft is edited without touching its lane", async () => {
    const before = (await get(`/packages/${packageId}`)).json();
    expect(before.effective_lane).toBe("client-confidential");
    const r = await h.app.inject({ method: "PUT", url: `/packages/${packageId}`, headers: { cookie, origin: ORIGIN, "if-match": before.draft_etag },
      payload: { ...before.package, title: "Loads, retitled" } });
    expect(r.statusCode, r.body).toBe(200);
    expect((await get(`/packages/${packageId}`)).json().effective_lane).toBe("client-confidential");
  });

  it("lets an input added after a declassification raise the package again", async () => {
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-SECRET', 0, 'accepted', $1)",
      [{ ...(await get(`/packages/${packageId}`)).json().package, id: "WP-SECRET", data_lane: "restricted", depends_on: [], status: "draft" }]);
    await write((c) => markObject(c, "package", "WP-SECRET", "restricted", "test"));
    const v = (await get(`/packages/${packageId}`)).json();
    const r = await h.app.inject({ method: "PUT", url: `/packages/${packageId}`, headers: { cookie, origin: ORIGIN, "if-match": v.draft_etag },
      payload: { ...v.package, depends_on: [{ package_id: "WP-SECRET", reason: "needs its loads" }] } });
    expect(r.statusCode, r.body).toBe(200);
    expect((await get(`/packages/${packageId}`)).json().effective_lane).toBe("restricted");
  });

  it("recomputes a diamond in dependency order", async () => {
    // A feeds B and C, and B feeds C; C sorts before B, so a naive order would read B's old marking.
    await write(async (c) => {
      await markObject(c, "package", "D-A", "restricted", "test");
      await markObject(c, "package", "D-Z", "public", "test", [{ kind: "package", id: "D-A" }]);
      await markObject(c, "package", "D-M", "public", "test", [{ kind: "package", id: "D-A" }, { kind: "package", id: "D-Z" }]);
    });
    expect((await marking("package", "D-M"))?.effective_lane).toBe("restricted");
    const a = await marking("package", "D-A");
    await write((c) => declassify(c, "package", "D-A", a!.version, "public", "cr_diamond"));
    expect((await marking("package", "D-Z"))?.effective_lane).toBe("public");
    expect((await marking("package", "D-M"))?.effective_lane).toBe("public");
  });

  it("covers only the exact input versions a declassification approved", async () => {
    await write(async (c) => {
      await markObject(c, "package", "E-SRC", "restricted", "test");
      await markObject(c, "package", "E-OUT", "internal", "test", [{ kind: "package", id: "E-SRC" }]);
    });
    const out = await marking("package", "E-OUT");
    await write((c) => declassify(c, "package", "E-OUT", out!.version, "public", "cr_exact"));
    expect((await marking("package", "E-OUT"))?.effective_lane).toBe("public");
    // The source takes on another restricted input: same lane, new content the approval never saw.
    await write(async (c) => {
      await markObject(c, "package", "E-MORE", "restricted", "test");
      await markObject(c, "package", "E-SRC", "restricted", "test", [{ kind: "package", id: "E-MORE" }]);
    });
    expect((await marking("package", "E-OUT"))?.effective_lane).toBe("restricted");
  });

  it("ends a declassification when the package gains new author output", async () => {
    await write(async (c) => {
      await markObject(c, "package", "G-SRC", "restricted", "test");
      await markObject(c, "package", "G-OUT", "internal", "test", [{ kind: "package", id: "G-SRC" }]);
    });
    const m = await marking("package", "G-OUT");
    await write((c) => declassify(c, "package", "G-OUT", m!.version, "internal", "cr_g"));
    expect((await marking("package", "G-OUT"))?.effective_lane).toBe("internal");
    await write((c) => endOverride(c, "package", "G-OUT", "new author output"));
    const after = await marking("package", "G-OUT");
    expect(after?.override).toBeUndefined();
    expect(after?.effective_lane).toBe("restricted");
  });

  it("refuses an unclassified source and a marking change outside a marking command", async () => {
    const c = (await post("/captures", { text: "Not classified" })).json();
    await expect(write((t) => markObject(t, "package", "F-1", "internal", "test", [{ kind: "capture", id: c.id }]))).rejects.toMatchObject({ code: "unclassified-source" });
    await expect(tx(h.admin, (t) => markObject(t, "package", "F-2", "internal", "test"))).rejects.toThrow(/markings: "write"/);
  });

  it("refuses an approval once the marking moved past the version the request named", async () => {
    const c = (await post("/captures", { text: "Moves later", lane: "proprietary" })).json();
    const p = (await post("/admin/commands/marking.propose-declassification",
      { payload: { object_kind: "capture", object_id: c.id, lane: "public", reason: "test" } })).json();
    expect((await post(`/captures/${c.id}/classify`, { lane: "restricted" })).statusCode).toBe(200);
    const r = await signed("marking.approve-declassification", { change_request_id: p.id });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("marking-changed");
  });

  it("refuses a declassification that would not lower anything", async () => {
    const r = await post("/admin/commands/marking.propose-declassification",
      { payload: { object_kind: "capture", object_id: captureId, lane: "restricted", reason: "no" } });
    expect(r.json().code).toBe("not-lower");
  });
});

describe("explicit raises and provenance loops (review threads on PR #23)", () => {
  it("keeps a draft's own raise when it matches the lane it already inherits, so declassifying the input cannot lower it", async () => {
    const c = (await post("/captures", { text: "Pump loads", lane: "internal" })).json();
    const pkgId = await intake(c.id, "internal");
    expect((await post(`/captures/${c.id}/classify`, { lane: "restricted" })).statusCode).toBe(200);
    const v = (await get(`/packages/${pkgId}`)).json();
    expect(v.package.data_lane).toBe("internal");
    expect(v.effective_lane).toBe("restricted");
    const raised = await h.app.inject({ method: "PUT", url: `/packages/${pkgId}`, headers: { cookie, origin: ORIGIN, "if-match": v.draft_etag },
      payload: { ...v.package, data_lane: "restricted" } });
    expect(raised.statusCode, raised.body).toBe(200);
    expect(await marking("package", pkgId)).toMatchObject({ assigned: "restricted", effective_lane: "restricted" });

    const p = await post("/admin/commands/marking.propose-declassification",
      { payload: { object_kind: "capture", object_id: c.id, lane: "internal", reason: "classified in error" } });
    expect(p.statusCode, p.body).toBe(200);
    expect((await signed("marking.approve-declassification", { change_request_id: p.json().id })).statusCode).toBe(200);
    expect((await marking("capture", c.id))?.effective_lane).toBe("internal");
    expect((await marking("package", pkgId))?.effective_lane).toBe("restricted");
    expect((await get(`/packages/${pkgId}`)).json().effective_lane).toBe("restricted");
  });

  it("does not record an assignment when an edit leaves the lane untouched", async () => {
    const c = (await post("/captures", { text: "Valve loads", lane: "internal" })).json();
    const pkgId = await intake(c.id, "internal");
    expect((await post(`/captures/${c.id}/classify`, { lane: "restricted" })).statusCode).toBe(200);
    await write((t) => markObject(t, "package", pkgId, "restricted", "unrelated edit"));
    expect((await marking("package", pkgId))?.assigned).toBeUndefined();
  });

  it("refuses a citation that would make two objects draw on each other", async () => {
    await write(async (c) => {
      await markObject(c, "package", "C-A", "internal", "test");
      await markObject(c, "package", "C-B", "internal", "test", [{ kind: "package", id: "C-A" }]);
    });
    await expect(write((c) => markObject(c, "package", "C-A", "internal", "test", [{ kind: "package", id: "C-B" }])))
      .rejects.toMatchObject({ code: "provenance-cycle" });
    await expect(write((c) => markObject(c, "package", "C-A", "internal", "test", [{ kind: "package", id: "C-A" }])))
      .rejects.toMatchObject({ code: "provenance-cycle" });
    expect((await marking("package", "C-A"))?.inputs).toBeUndefined();
  });

  it("still lands a raise through a loop recorded before loops were refused", async () => {
    await write(async (c) => {
      await markObject(c, "package", "L-SRC", "internal", "test");
      await markObject(c, "package", "L-A", "internal", "test", [{ kind: "package", id: "L-SRC" }]);
      await markObject(c, "package", "L-B", "internal", "test", [{ kind: "package", id: "L-A" }]);
      await markObject(c, "package", "L-OUT", "public", "test", [{ kind: "package", id: "L-B" }]);
    });
    // An older loop: L-A also draws on L-B, written directly as earlier code allowed.
    const a = (await marking("package", "L-A"))!;
    const b = (await marking("package", "L-B"))!;
    await h.admin.query("insert into object_markings (body) values ($1)",
      [{ ...a, version: a.version + 1, inputs: [...a.inputs!, { object_kind: "package", object_id: "L-B", version: b.version }], reason: "legacy loop" }]);
    await write((c) => markObject(c, "package", "L-SRC", "restricted", "raised"));
    expect((await marking("package", "L-A"))?.effective_lane).toBe("restricted");
    expect((await marking("package", "L-B"))?.effective_lane).toBe("restricted");
    expect((await marking("package", "L-OUT"))?.effective_lane).toBe("restricted");
  });
});
