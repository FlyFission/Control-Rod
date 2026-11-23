import { createHash } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { tx } from "../src/db/index.js";
import { createOrganization, LOCAL_ORG } from "../src/tenancy.js";
import { type Harness, signIn, startHarness, VirtualAuthenticator } from "./harness.js";

let harness: Harness;
let cookie: string;
const packageId = "WP-run-reads";
const otherLocalPackageId = "WP-another-local-run";
const otherOrgPackageId = "WP-another-org-run";
const captureId = "C-run-reads";
const longTitle = "A".repeat(121);
const runtime = { kind: "local", provider: "fake", model: "any" };

async function addPackage(id: string, revision: number, title: string) {
  await harness.admin.query("insert into packages (id, revision, status, body) values ($1, $2, 'released', $3)",
    [id, revision, { id, revision, title }]);
}

async function addRun(id: string, subject: string, revision: number, role: string, status: string) {
  const body = { schema_version: "0.1.0", id, package_id: subject, package_revision: revision, role, status, runtime,
    agent_baseline: "fake", round: 1, queued_at: new Date().toISOString() };
  await harness.admin.query(
    "insert into runs (id, package_id, package_revision, role, round, status, body, log) values ($1, $2, $3, $4, 1, $5, $6, $7)",
    [id, subject, revision, role, status, body, ["fixture log"]]);
  return body;
}

beforeAll(async () => {
  harness = await startHarness();
  cookie = await signIn(harness.app, new VirtualAuthenticator());
  await addPackage(packageId, 0, "Recorded title");
  await addPackage(packageId, 1, "Current title");
  await addPackage(otherLocalPackageId, 0, longTitle);
  await addRun("r-history", packageId, 0, "author", "succeeded");
  await addRun("r-historical-active", packageId, 0, "author", "queued");
  await addRun("r-current", packageId, 1, "author", "running");
  await addRun("r-unrelated", otherLocalPackageId, 0, "author", "queued");
  await harness.admin.query("insert into captures (id, body, created_at) values ($1, $2, now())",
    [captureId, { id: captureId, text: "Capture fixture" }]);
  await addRun("r-intake", captureId, 0, "intake", "queued");
  await addRun("r-failed", packageId, 1, "author", "failed");
  await addRun("r-check", packageId, 1, "pre-check", "succeeded");
  for (const [run, subject, revision, path, bytes, mismatched] of [
    ["r-history", packageId, 0, "src/summary.txt", Buffer.from("recorded <b>as text</b>"), false],
    ["r-history", packageId, 0, "broken.txt", Buffer.from("does not match"), true],
    ["r-history", packageId, 0, "binary.bin", Buffer.from([0, 255]), false],
    ["r-history", packageId, 0, "large.txt", Buffer.alloc(256 * 1024 + 1, "a"), false],
    ["r-history", packageId, 1, "incorrect-revision.txt", Buffer.from("cannot be read as historical"), false],
    ["r-failed", packageId, 1, "partial.txt", Buffer.from("failed partial output"), false],
    ["r-check", packageId, 1, "evidence.txt", Buffer.from("checker output needs its admissions path"), false],
  ] as const) {
    const sha256 = createHash("sha256").update(mismatched ? Buffer.from("original") : bytes).digest("hex");
    await harness.admin.query(
      "insert into outputs (run_id, package_id, package_revision, name, sha256, bytes) values ($1, $2, $3, $4, $5, $6)",
      [run, subject, revision, path, sha256, bytes],
    );
  }
  await harness.admin.query(
    `insert into run_events (run_id, seq, body)
     select 'r-history', n, jsonb_build_object('kind', 'message', 'at', now()::text, 'text', n::text)
       from generate_series(1, 5) n`,
  );

  await tx(harness.admin, (c) =>
    createOrganization(c, { id: "org_run-reads", name: "Other", status: "suspended" }, { kind: "human", id: "owner" }),
  );
  await harness.admin.query(
    `update organizations
        set body = jsonb_set(body, '{status}', to_jsonb(case when id = 'org_run-reads' then 'active' else 'suspended' end))
      where id in ($1, 'org_run-reads')`,
    [LOCAL_ORG],
  );
  await addPackage(otherOrgPackageId, 0, "Another organization");
  await addRun("r-foreign", otherOrgPackageId, 0, "author", "running");
  await addRun("r-mismatched-owner", packageId, 0, "pre-check", "queued");
  await harness.admin.query("update organizations set body = jsonb_set(body, '{status}', '\"active\"') where id = $1", [LOCAL_ORG]);
}, 120_000);

afterAll(async () => harness?.stop());

const get = (url: string, authenticated = true) =>
  harness.app.inject({ method: "GET", url, ...(authenticated ? { headers: { cookie } } : {}) });
const runUrl = (subject: string, id: string) => `/packages/${subject}/runs/${id}`;

it("reads the exact run by current or historical revision and preserves intake access", async () => {
  for (const [subject, id, revision, status] of [
    [packageId, "r-history", 0, "succeeded"],
    [packageId, "r-current", 1, "running"],
    [captureId, "r-intake", 0, "queued"],
  ] as const) {
    const result = await get(runUrl(subject, id));
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ id, package_id: subject, package_revision: revision, status });
    expect((await get(`${runUrl(subject, id)}/log`)).json()).toEqual({ lines: ["fixture log"] });
  }
  expect((await get(runUrl(packageId, "r-current"), false)).statusCode).toBe(401);
});

it("returns the same refusal for runs absent from the caller's package and organization scope", async () => {
  for (const suffix of ["", "/events", "/log"]) {
    const absent = await get(`${runUrl(packageId, "r-absent")}${suffix}`);
    expect(absent.statusCode).toBe(404);
    for (const [subject, id] of [
      [packageId, "r-unrelated"],
      [otherOrgPackageId, "r-foreign"],
      [packageId, "r-mismatched-owner"],
    ] as const) {
      const excluded = await get(`${runUrl(subject, id)}${suffix}`);
      expect(excluded.statusCode).toBe(404);
      expect(excluded.json()).toEqual(absent.json());
    }
  }
});

it("loads a recent transcript page, pages back or resumes forward without overlap", async () => {
  const eventsUrl = `${runUrl(packageId, "r-history")}/events`;
  for (const [suffix, expected] of [
    ["", [1, 2, 3, 4, 5]],
    ["?recent=true&limit=2", [4, 5]],
    ["?before=4&limit=2", [2, 3]],
    ["?before=2&limit=2", [1]],
    ["?after=3&limit=1", [4]],
  ] as const) {
    const result = await get(eventsUrl + suffix);
    expect(result.statusCode).toBe(200);
    expect(result.json().events.map((event: { seq: number }) => event.seq)).toEqual(expected);
  }

  for (const suffix of ["?after=3&before=4", "?recent=true&before=4", "?before=0", "?limit=0", "?limit=2001", "?after=2147483648"]) {
    const result = await get(eventsUrl + suffix);
    expect(result.statusCode).toBe(400);
    expect(result.json().code).toBe("invalid");
  }
});

it("summarizes active runs without fetching package collections or exposing full run bodies", async () => {
  const result = await get("/runs/active");
  expect(result.statusCode).toBe(200);
  const rows = result.json();
  expect(rows).toHaveLength(4);
  expect(rows).toEqual(expect.arrayContaining([
    { id: "r-current", package_id: packageId, package_revision: 1, role: "author", status: "running", runtime, title: "Current title" },
    { id: "r-unrelated", package_id: otherLocalPackageId, package_revision: 0, role: "author", status: "queued", runtime, title: longTitle.slice(0, 120) },
    { id: "r-historical-active", package_id: packageId, package_revision: 0, role: "author", status: "queued", runtime, title: "Recorded title" },
    { id: "r-intake", package_id: captureId, package_revision: 0, role: "intake", status: "queued", runtime },
  ]));
  expect((await get("/runs/active", false)).statusCode).toBe(401);
  const legacy = (await get("/runs")).json();
  expect(legacy.find((r: { id: string }) => r.id === "r-current")).toMatchObject({ agent_baseline: "fake", package_revision: 1 });
});


it("lists the exact admitted historical author outputs, with no preview payload", async () => {
  const route = `${runUrl(packageId, "r-history")}/outputs`;
  const listing = await get(route);
  expect(listing.statusCode).toBe(200);
  expect(listing.json().map((output: { path: string }) => output.path)).toEqual(["binary.bin", "broken.txt", "large.txt", "src/summary.txt"]);
  const content = "recorded <b>as text</b>";
  const digest = { algorithm: "sha256", value: createHash("sha256").update(content).digest("hex") };
  expect(listing.json()).toContainEqual({ path: "src/summary.txt", size_bytes: Buffer.byteLength(content), digest });
  const preview = await get(`${route}/preview?path=src%2Fsummary.txt`);
  expect(preview.statusCode).toBe(200);
  expect(preview.headers["content-type"]).toMatch(/application\/json/);
  expect(preview.json()).toEqual({ path: "src/summary.txt", digest, content });
});

it("refuses ineligible, mismatched, oversized and binary previews, and records integrity failures", async () => {
  const preview = (id: string, path: string) => get(`${runUrl(packageId, id)}/outputs/preview?path=${encodeURIComponent(path)}`);
  expect((await preview("r-history", "broken.txt")).json().code).toBe("output-changed");
  expect((await preview("r-history", "large.txt")).json().code).toBe("too-large");
  expect((await preview("r-history", "binary.bin")).json().code).toBe("invalid");
  expect((await preview("r-history", "incorrect-revision.txt")).statusCode).toBe(404);
  for (const [id, path] of [["r-failed", "partial.txt"], ["r-check", "evidence.txt"]] as const) {
    expect((await preview(id, path)).statusCode).toBe(404);
    expect((await get(`${runUrl(packageId, id)}/outputs`)).json()).toEqual([]);
  }
  const mismatches = await harness.admin.query(
    "select body->'data' as data from events where body->>'type' = 'output.mismatch'",
  );
  expect(mismatches.rows).toEqual([{ data: expect.objectContaining({ run: "r-history", revision: 0, name: "broken.txt" }) }]);
});

it("keeps run output indexes and previews in the same ownership scope", async () => {
  for (const suffix of ["/outputs", "/outputs/preview?path=src%2Fsummary.txt"]) {
    const absent = await get(`${runUrl(packageId, "absent")}${suffix}`);
    expect(absent.statusCode).toBe(404);
    const incorrectSubject = await get(`${runUrl(otherLocalPackageId, "r-history")}${suffix}`);
    expect(incorrectSubject.statusCode).toBe(404);
    expect(incorrectSubject.json()).toEqual(absent.json());
    const external = await get(`${runUrl(otherOrgPackageId, "r-foreign")}${suffix}`);
    expect(external.statusCode).toBe(404);
    expect(external.json()).toEqual(absent.json());
    expect((await get(`${runUrl(packageId, "r-history")}${suffix}`, false)).statusCode).toBe(401);
  }
});
