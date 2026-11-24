import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedPaths, fixScope, outsideScope } from "../src/work.js";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** Scoped send-back (change record scoped-send-back): findings carry evidence, a location and a fix scope. */
describe("fix scope helpers", () => {
  it("unions and sorts the scope paths of the findings that name any", () => {
    expect(fixScope([{ scope_paths: ["b.md", "a.md"] }, { text: "no scope" }, { scope_paths: ["a.md"] }])).toEqual(["a.md", "b.md"]);
    expect(fixScope(undefined)).toEqual([]);
  });

  it("lists added, removed and changed paths", () => {
    const before = [{ name: "a.md", sha256: "1" }, { name: "b.md", sha256: "2" }, { name: "gone.md", sha256: "3" }];
    const after = [{ name: "a.md", sha256: "9" }, { name: "b.md", sha256: "2" }, { name: "new.md", sha256: "4" }];
    expect(changedPaths(before, after)).toEqual(["a.md", "gone.md", "new.md"]);
  });

  it("treats a scope path as a file or a folder, and reports nothing without a scope", () => {
    expect(outsideScope(["src/a.ts", "src2/b.ts", "docs/x.md"], ["src"])).toEqual(["src2/b.ts", "docs/x.md"]);
    expect(outsideScope(["src/a.ts"], ["src/"])).toEqual([]);
    expect(outsideScope(["anything"], [])).toEqual([]);
  });
});

let h: Harness;
let cookie: string;
const passkey = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, passkey);
}, 120_000);
afterAll(async () => h?.stop());

const asOwner = (method: "GET" | "POST", url: string, payload?: unknown) =>
  h.app.inject({
    method,
    url,
    headers: { cookie, ...(method === "GET" ? {} : { origin: ORIGIN }) },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
const asDaemon = async (url: string, payload: unknown): Promise<DaemonReply> => {
  const body = await sealDaemonPayload(h.admin, url, withClaim(url, payload as Record<string, unknown>));
  return (await h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: body })) as DaemonReply;
};
async function claim(runtimes = ["fake"]) {
  const r = await asDaemon("/runner/claim", { runtimes });
  if (r.statusCode === 204) return null;
  const job = r.json();
  claims.set(job.run.id, job.claim.token);
  return job;
}
const input = (job: { inputs: { name: string; content_base64: string }[] }, name: string) => {
  const i = job.inputs.find((x) => x.name === name);
  return i ? Buffer.from(i.content_base64, "base64").toString() : undefined;
};

function draft(id: string) {
  return {
    schema_version: "0.1.0",
    id,
    revision: 0,
    title: `Package ${id}`,
    project: "PRJ-TEST",
    mode: "capital-projects",
    status: "draft",
    rigor_mode: "standard",
    data_lane: "internal",
    objective: `Produce ${id}`,
    deliverables: [{ id: `${id}-D1`, type: "report", format: ["md"] }],
    design_inputs: [],
    agent_assignment: [{ role: "general-author", agent_baseline: "author", baseline_revision: 0 }],
    acceptance_criteria: ["The report exists"],
    verification: {
      method: "agent-pre-check",
      verifier: "checker",
      verifier_receives: ["deliverables"],
      required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
    },
  };
}

describe("a failed check sends back a scoped fix", () => {
  let id = "";

  it("keeps a finding's evidence, location and scope, and drops unsafe paths", async () => {
    expect((await asOwner("POST", "/captures", { lane: "internal", text: "Draft the pump report" })).statusCode).toBe(201);
    const intake = await claim();
    await asDaemon(`/runner/runs/${intake.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "packages/REPORT.json", content_base64: b64(JSON.stringify(draft("REPORT"))) }],
    });
    id = (await asOwner("GET", "/packages")).json().find((p: { id: string }) => p.id.endsWith("-REPORT")).id;
    const o = await asOwner("POST", `/packages/${id}/decisions/options`, { kind: "release", package_revision: 0 });
    const assertion = passkey.assert(o.json().options);
    expect((await asOwner("POST", `/packages/${id}/decisions`, { kind: "release", package_revision: 0, assertion })).statusCode).toBe(201);

    const author = await claim();
    await asDaemon(`/runner/runs/${author.run.id}/complete`, {
      status: "succeeded",
      outputs: [
        { name: "report.md", content_base64: b64("rating: 40 kW") },
        { name: "notes.md", content_base64: b64("field notes") },
      ],
    });
    const check = await claim(["codex"]);
    expect(check.run.role).toBe("pre-check");
    const done = await asDaemon(`/runner/runs/${check.run.id}/complete`, {
      status: "succeeded",
      outputs: [],
      verification: {
        outcome: "fail",
        findings: [
          {
            id: "F-001",
            severity: "major",
            text: "Rating has no source",
            evidence: "expected a nameplate citation, found none",
            location: { path: "report.md", line: 1 },
            scope_paths: ["report.md", "../etc/passwd", "/abs.md", "a\\b.md", "a//b.md", "docs/"],
          },
          { id: "F-002", severity: "minor", text: "Bad location dropped", location: { path: "../x", line: 0 } },
        ],
      },
    });
    expect(done.statusCode, done.body).toBe(200);
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.pre_check.findings[0]).toMatchObject({
      evidence: "expected a nameplate citation, found none",
      location: { path: "report.md", line: 1 },
      scope_paths: ["report.md", "docs/"],
    });
    expect(view.pre_check.findings[1].location).toBeUndefined();
    expect(view.scope_drift).toBeUndefined();
  });

  it("tells the author the scope, then reports a change outside it to the checker and the card", async () => {
    const fix = await claim();
    expect(fix.run.round).toBe(2);
    const brief = input(fix, "BRIEF.md") ?? "";
    expect(brief).toContain("## Scope of this fix");
    expect(brief).toContain("- `report.md`");
    expect(brief).toContain("- `docs/`");
    await asDaemon(`/runner/runs/${fix.run.id}/complete`, {
      status: "succeeded",
      outputs: [
        { name: "report.md", content_base64: b64("rating: 40 kW (nameplate photo)") },
        { name: "notes.md", content_base64: b64("field notes, rewritten") },
      ],
    });

    const drift = { round: 2, scope_paths: ["docs/", "report.md"], outside: ["notes.md"] };
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.scope_drift).toEqual(drift);
    const events = await h.db.query("select body->'data' as data from events where body->>'type' = 'package.scope-drift' and body->>'subject' = $1", [id]);
    expect(events.rows.map((r: { data: unknown }) => r.data)).toEqual([{ revision: 0, ...drift }]);

    const check2 = await claim(["codex"]);
    expect(check2.run.role).toBe("pre-check");
    expect(JSON.parse(input(check2, "scope-drift.json") ?? "null")).toEqual(drift);
    expect(input(check2, "BRIEF.md")).toContain("## Changes outside the fix scope");
  });
});
