import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tx } from "../src/db/index.js";
import { WORKBENCH_TABLES, WORKBENCH_TRANSITIONS } from "../src/db/migrations/010-workbench.js";
import { verifyChain } from "../src/events.js";
import { digest } from "../src/kernel.js";
import { loadValidator } from "../src/schemas.js";
import { LOCAL_ORG, addMember, createProject, memberIdFor, recordQualification } from "../src/tenancy.js";
import { WORKBENCH, type WorkbenchKind, currentSandboxPolicy, getObject, recordObject, recordSandboxPolicy, transition } from "../src/workbench.js";
import { type Harness, startHarness } from "./harness.js";

/** Workbench types with storage (workbench plan task 1.2). */
let h: Harness;
const owner = { kind: "human" as const, id: "owner" };
const D = { algorithm: "sha256" as const, value: "a".repeat(64) };
const D2 = { algorithm: "sha256" as const, value: "b".repeat(64) };
const assertion = { credential_id: "c", authenticator_data: "a", client_data_json: "j", signature: "s" };
const assignment = { role: "author", agent_baseline: "baseline-author", baseline_revision: 1 };
const member = memberIdFor("verifier");
const org = { org_id: LOCAL_ORG };

beforeAll(async () => {
  h = await startHarness();
  await h.db.query("insert into packages (id, revision, status, body) values ('pkg_wb', 1, 'released', '{}')");
  await h.db.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ('run_wb', 'pkg_wb', 1, 'author', 1, 'succeeded', '{}')");
  await tx(h.db, async (c) => {
    await addMember(c, { id: member, org_id: LOCAL_ORG, user_name: "verifier", display_name: "Verifier", status: "active" }, owner);
    await recordQualification(c, { id: "qual_v", org_id: LOCAL_ORG, member_id: member, licenses: [], disciplines: ["mechanical"],
      grades: ["safety"], roles: ["checker"], authorities: [], revoked: false, reason: "initial" }, owner);
    await createProject(c, { id: "prj_wb", org_id: LOCAL_ORG, name: "Workbench", mode: "capital-projects", default_rigor: "standard",
      lanes: ["internal"], qa_overlays: [], autonomy_level: 1, status: "active" }, owner);
  });
}, 120_000);
afterAll(async () => h?.stop());

const put = (k: WorkbenchKind, body: Record<string, unknown>) => tx(h.db, (c) => recordObject(c, k, { ...org, ...body } as never, owner));

/** One valid example of every kind, in dependency order. */
const EXAMPLES: [WorkbenchKind, Record<string, unknown>][] = [
  ["exploration", { id: "exp_1", project_id: "prj_wb", lane: "internal", sandbox_policy_digest: D, started_by: member, status: "active", interactive: true, unattested: true }],
  ["workspace", { id: "ws_1", kind: "exploration-worktree", exploration_id: "exp_1", path: "/work/exp_1", status: "provisioning" }],
  ["checkpoint", { id: "chk_1", exploration_id: "exp_1", workspace_id: "ws_1", git_tree: "c".repeat(40), content_digest: D, actor: owner, captured_at: "2026-10-30T12:00:00.000Z" }],
  ["checkpoint", { id: "chk_2", exploration_id: "exp_1", workspace_id: "ws_1", git_tree: "c".repeat(40), content_digest: D, parent_id: "chk_1", actor: owner, captured_at: "2026-10-30T12:05:00.000Z" }],
  ["source_manifest", { id: "man_1", files: [{ path: "a.py", mode: "file", digest: D }], symlink_policy: "reject", submodules: [], lfs_resolved: false, excluded: [], ignored_inputs: [] }],
  ["promotion", { id: "pro_1", checkpoint_id: "chk_2", package_id: "pkg_wb", package_revision: 1, source_manifest_digest: D, mode: "software", rigor: "standard", grade: "general-service", lane: "internal", promoted_by: member }],
  ["attempt_set", { id: "set_1", package_id: "pkg_wb", package_revision: 1, release_digest: D, candidates: 2, status: "running" }],
  ["candidate_assignment", { id: "cand_1", package_id: "pkg_wb", package_revision: 1, release_digest: D, attempt_set_id: "set_1", ordinal: 1, author_assignment: assignment }],
  ["candidate_assignment", { id: "cand_2", package_id: "pkg_wb", package_revision: 1, release_digest: D, attempt_set_id: "set_1", ordinal: 2, author_assignment: assignment }],
  ["selection", { id: "sel_1", attempt_set_id: "set_1", candidate_id: "cand_2", reason: "fewer findings", proposed_by: owner }],
  ["runtime_probe", { id: "probe_1", runtime: "claude-code", artifact_digest: D, version: "2.1.314", auth_state: "signed-in", outcome: "pass", detail: "ok", observed_at: "2026-10-30T12:00:00.000Z" }],
  ["runtime_artifact_version", { id: "rav_1", runtime: "claude-code", version: "2.1.314", artifact_digest: D, install_path: "/opt/claude", probe_ids: ["probe_1"] }],
  ["runtime_pin", { id: "pin_author", role: "author", runtime: "claude-code", artifact_version_id: "rav_1", artifact_digest: D, status: "active" }],
  ["isolation_attestation", { id: "att_1", run_id: "run_wb", generation: 1, policy_digest: D, artifact_digest: D, claims: [{ claim: "login-unreadable", result: "observed", evidence: "ENOENT" }], observed_at: "2026-10-30T12:00:00.000Z" }],
  ["controlled_record", { id: "rec_1", kind: "merged-change", package_id: "pkg_wb", package_revision: 1, candidate_id: "cand_2", input_digests: [D, D2], clearance_decision_id: "dec_1", applied_ref: "d".repeat(40) }],
  ["person_verification", { id: "pv_1", verifier_member_id: member, qualification_id: "qual_v", qualification_version: 1, candidate_id: "cand_2", criteria: ["C-1"], outcome: "pass", assertion }],
  ["scram_event", { id: "scram_1", scope: "project", project_id: "prj_wb", pulled_by: member, reason: "drill", assertion, quarantine: ["run_wb"] }],
  ["comment", { id: "com_1", subject_digest: D, locator: "line:12", author: owner, text: "Check the units.", status: "open" }],
  ["comment", { id: "com_2", subject_digest: D, locator: "line:12", author: owner, text: "Fixed in revision 2.", reply_to: "com_1", status: "open" }],
  ["resolution", { id: "res_1", comment_id: "com_1", resolved_by: owner, cites_kind: "reply", cites: "com_2" }],
  ["change_request", { id: "cr_1", kind: "lane-lowering", subject_digest: D, reason: "public release", impact: ["pkg_wb@1"], proposed_by: owner, status: "proposed" }],
  ["budget", { id: "bud_1", scope: "project", scope_id: "prj_wb", mode: "hard-cap", limit: { value: "200", unit: "USD" }, period: "P1M", status: "active" }],
  ["usage_record", { id: "use_1", run_id: "run_wb", source: "reported", input_tokens: { value: "1200", unit: "tokens" }, cost: { value: "0.04", unit: "USD" } }],
  ["budget_reservation", { id: "bres_1", budget_id: "bud_1", run_id: "run_wb", amount: { value: "5", unit: "USD" }, status: "reserved" }],
  ["project_deliverable", { id: "pd_1", project_id: "prj_wb", discipline: "mechanical", grade: "material" }],
  ["deliverable_revision", { id: "dr_1", deliverable_id: "pd_1", rung: "issued-for-review", package_id: "pkg_wb", package_revision: 1 }],
  ["interface_record", { id: "if_1", provider_package_id: "pkg_wb", receiver_package_ids: ["pkg_other"], maturity: "identified" }],
  ["flow_edge_ref", { id: "edge_1", flow_id: "flow_hvac", deadband: { value: "0.5", unit: "kW" } }],
  ["phase_gate", { id: "gate_30", project_id: "prj_wb", criteria_ids: ["G-1", "G-2"] }],
];

describe("digest vectors", () => {
  const doc = JSON.parse(readFileSync(new URL("../../../spec/vectors/object-digests.json", import.meta.url), "utf8")) as {
    vectors: { type: string; body: unknown; sha256: string }[];
  };
  const ajv = loadValidator();
  it.each(doc.vectors.map((v) => [v.type, v] as const))("%s: schema valid and kernel digest matches the Python vector", (type, v) => {
    const validate = ajv.getSchema(`${type}.json`)!;
    expect(validate(v.body), JSON.stringify(validate.errors)).toBe(true);
    expect(digest(v.body)).toBe(v.sha256);
  });
  it("covers every frozen type", () => {
    const frozen = [...Object.values(WORKBENCH).filter((t) => t.cls === "F").map((t) => t.schema), "SandboxPolicy",
      "SignerQualification", "AuthenticatorCredential", "Delegation", "PolicySet"].sort();
    expect(doc.vectors.map((v) => v.type).sort()).toEqual(frozen);
  });
});

describe("storage", () => {
  it("stores one example of every kind, each with its event, and the chain verifies", async () => {
    for (const [k, body] of EXAMPLES) await put(k, body);
    expect(new Set(EXAMPLES.map(([k]) => k))).toEqual(new Set(Object.keys(WORKBENCH)));
    for (const [k, body] of EXAMPLES) expect(await getObject(h.db, k, body.id as string)).toEqual({ ...org, ...body });
    const frozen = await h.db.query<{ body: unknown; digest: string }>("select body, digest from candidate_assignments");
    for (const r of frozen.rows) expect(digest(r.body)).toBe(r.digest);
    const ev = await h.db.query("select body->>'type' as t from events where body->>'subject' = 'cand_1'");
    expect(ev.rows.map((r) => r.t)).toEqual(["candidate-assignment.recorded"]);
    expect((await verifyChain(h.db)).ok).toBe(true);
  });

  it("refuses bodies the contract rejects", async () => {
    await expect(put("attempt_set", { id: "set_x", package_id: "pkg_wb", package_revision: 1, release_digest: D, candidates: 1, status: "running" })).rejects.toThrow(/AttemptSet.json refused: \/candidates/);
    await expect(put("checkpoint", { id: "chk_x", exploration_id: "exp_1", workspace_id: "ws_1", git_tree: "xyz", content_digest: D, actor: owner, captured_at: "2026-10-30T12:00:00.000Z" })).rejects.toThrow(/git_tree/);
    await expect(put("runtime_pin", { id: "pin_x", role: "author", runtime: "claude-code", artifact_version_id: "rav_1", artifact_digest: D, status: "active", extra: 1 })).rejects.toThrow(/RuntimePin.json refused/);
  });

  it("refuses links to records that do not exist or do not belong together", async () => {
    await expect(put("checkpoint", { id: "chk_y", exploration_id: "exp_missing", workspace_id: "ws_1", git_tree: "c".repeat(40), content_digest: D, actor: owner, captured_at: "2026-10-30T12:00:00.000Z" })).rejects.toThrow(/foreign key/);
    await expect(put("promotion", { id: "pro_y", package_id: "pkg_wb", package_revision: 9, source_manifest_digest: D, mode: "software", rigor: "standard", grade: "general-service", lane: "internal", promoted_by: member })).rejects.toThrow(/foreign key/);
    // A singleton candidate of an ordinary release cannot be selected into an attempt set.
    await put("candidate_assignment", { id: "cand_solo", package_id: "pkg_wb", package_revision: 1, release_digest: D, ordinal: 1, author_assignment: assignment });
    await expect(put("selection", { id: "sel_y", attempt_set_id: "set_1", candidate_id: "cand_solo", reason: "x", proposed_by: owner })).rejects.toThrow(/foreign key/);
    await expect(put("person_verification", { id: "pv_y", verifier_member_id: member, qualification_id: "qual_v", qualification_version: 7, candidate_id: "cand_2", criteria: ["C-1"], outcome: "pass", assertion })).rejects.toThrow(/foreign key/);
  });

  it("allows one candidate per ordinal in a release or attempt set", async () => {
    await expect(put("candidate_assignment", { id: "cand_dup", package_id: "pkg_wb", package_revision: 1, release_digest: D, attempt_set_id: "set_1", ordinal: 2, author_assignment: assignment })).rejects.toThrow(/candidate_assignments_one_ordinal/);
    await expect(put("candidate_assignment", { id: "cand_solo2", package_id: "pkg_wb", package_revision: 1, release_digest: D, ordinal: 1, author_assignment: assignment })).rejects.toThrow(/candidate_assignments_one_ordinal/);
  });
});

describe("sandbox policies", () => {
  const policy = { id: "sbx_laptop", org_id: LOCAL_ORG, driver: "native-cli", denied_read: ["~/.claude", "~/.codex"], writable_roots: ["."], allowed_hosts: [], enabled_tools: ["Bash", "Read"], mandatory_claims: ["login-unreadable"] };
  it("versions contiguously and never edits a version", async () => {
    await tx(h.db, (c) => recordSandboxPolicy(c, { ...policy, version: 1 }, owner));
    await expect(tx(h.db, (c) => recordSandboxPolicy(c, { ...policy, version: 3 }, owner))).rejects.toThrow(/version 3 does not follow 1/);
    await expect(tx(h.db, (c) => recordSandboxPolicy(c, { ...policy, version: 2, denied_read: [] }, owner))).rejects.toThrow(/denied_read/);
    const v2 = await tx(h.db, (c) => recordSandboxPolicy(c, { ...policy, version: 2, enabled_tools: ["Bash"] }, owner));
    const cur = await currentSandboxPolicy(h.db, "sbx_laptop");
    expect(cur?.body.version).toBe(2);
    expect(cur?.digest).toBe(v2.digest);
    expect(digest(cur?.body)).toBe(v2.digest);
    await expect(h.db.query("update sandbox_policies set body = body")).rejects.toThrow(/append only/);
  });
});

describe("classes", () => {
  it.each(WORKBENCH_TABLES.filter((t) => t.cls !== "L").map((t) => [t.name, t.cls] as const))(
    "%s (%s) refuses update and delete", async (table) => {
      expect((await h.db.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBeGreaterThan(0);
      await expect(h.db.query(`update ${table} set body = body`)).rejects.toThrow(/append only/);
      await expect(h.db.query(`delete from ${table}`)).rejects.toThrow(/append only/);
    });

  it.each(WORKBENCH_TABLES.filter((t) => t.cls === "L").map((t) => [t.name] as const))(
    "%s refuses delete and identity change even through raw SQL", async (table) => {
      expect((await h.db.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBeGreaterThan(0);
      await expect(h.db.query(`delete from ${table}`)).rejects.toThrow(/never deleted/);
      await expect(h.db.query(`update ${table} set body = jsonb_set(body, '{org_id}', '"org_other"')`)).rejects.toThrow(/identity and organization are fixed/);
    });

  it("moves lifecycled objects only along listed transitions, each an event", async () => {
    await tx(h.db, (c) => transition(c, "workspace", "ws_1", "ready", owner, "provisioned"));
    await expect(tx(h.db, (c) => transition(c, "workspace", "ws_1", "provisioning", owner, "back"))).rejects.toThrow(/cannot go from ready to provisioning/);
    await tx(h.db, (c) => transition(c, "attempt_set", "set_1", "ready-to-compare", owner, "both done"));
    await tx(h.db, (c) => transition(c, "attempt_set", "set_1", "selected", owner, "sel_1"));
    await expect(tx(h.db, (c) => transition(c, "attempt_set", "set_1", "running", owner, "again"))).rejects.toThrow(/cannot go from selected to running/);
    await tx(h.db, (c) => transition(c, "comment", "com_1", "resolved", owner, "res_1"));
    await expect(h.db.query("update comments set body = jsonb_set(body, '{status}', '\"open\"') where id = 'com_1'")).rejects.toThrow(/cannot go from resolved to open/);
    await expect(tx(h.db, (c) => transition(c, "checkpoint", "chk_1", "x", owner, "no"))).rejects.toThrow(/not lifecycled/);
    await expect(tx(h.db, (c) => transition(c, "budget", "bud_1", "closed", owner, "not a status"))).rejects.toThrow(/Budget.json refused: \/status/);
    const ev = await h.db.query("select body->'data' as d from events where body->>'type' = 'attempt-set.status-changed' order by (body->>'seq')::int");
    expect(ev.rows.map((r) => r.d)).toEqual([{ from: "running", to: "ready-to-compare", reason: "both done" }, { from: "ready-to-compare", to: "selected", reason: "sel_1" }]);
  });

  it("lists every transition against a status the contract defines", () => {
    const ajv = loadValidator();
    const schemaFor: Record<string, string> = Object.fromEntries(Object.values(WORKBENCH).map((t) => [t.table, t.schema]));
    for (const [table, from, to] of WORKBENCH_TRANSITIONS) {
      const statusRef = (ajv.getSchema(`${schemaFor[table]}.json`)!.schema as { properties: { status: { $ref: string } } }).properties.status.$ref;
      const values = (ajv.getSchema(statusRef)!.schema as { enum: string[] }).enum;
      expect(values, `${table} ${from}`).toContain(from);
      expect(values, `${table} ${to}`).toContain(to);
    }
  });
});

