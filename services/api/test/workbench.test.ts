import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tx } from "../src/db/index.js";
import { WORKBENCH_MUTABLE, WORKBENCH_TABLES, WORKBENCH_TRANSITIONS } from "../src/db/migrations/010-workbench.js";
import { verifyChain } from "../src/events.js";
import { digest } from "../src/kernel.js";
import { loadValidator } from "../src/schemas.js";
import { LOCAL_ORG, addMember, createOrganization, createProject, memberIdFor, recordQualification } from "../src/tenancy.js";
import { WORKBENCH, type WorkbenchKind, currentSandboxPolicy, getObject, recordObject, recordSandboxPolicy, transition } from "../src/workbench.js";
import { type Harness, startHarness } from "./harness.js";

/** Workbench types with storage (workbench plan task 1.2), and the review findings R1 to R13. */
let h: Harness;
const owner = { kind: "human" as const, id: "owner" };
const D = { algorithm: "sha256" as const, value: "a".repeat(64) };
const D2 = { algorithm: "sha256" as const, value: "b".repeat(64) };
const assertion = { credential_id: "c", authenticator_data: "a", client_data_json: "j", signature: "s" };
const assignment = { role: "author", agent_baseline: "baseline-author", baseline_revision: 1 };
const verifier = memberIdFor("verifier");
const colleague = memberIdFor("colleague");
const org = { org_id: LOCAL_ORG };
const manifest = { ...org, id: "man_1", files: [{ path: "a.py", mode: "file", digest: D }], symlink_policy: "reject", submodules: [], lfs_resolved: false, excluded: [], ignored_inputs: [] };
const manifestDigest = { algorithm: "sha256" as const, value: digest(manifest) };

beforeAll(async () => {
  h = await startHarness();
  // Intake drafts revision 0 and the owner releases it as is (review R1).
  await h.admin.query("insert into captures (id, body, created_at) values ('cap_wb', '{}', now())");
  await h.admin.query("insert into packages (id, revision, status, body) values ('pkg_wb', 0, 'released', '{}')");
  await h.admin.query("insert into packages (id, revision, status, body) values ('pkg_other', 0, 'released', '{}')");
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ('run_wb', 'pkg_wb', 0, 'author', 1, 'succeeded', '{}')");
  await h.admin.query("insert into decisions (id, package_id, package_revision, kind, body) values ('dec_1', 'pkg_wb', 0, 'accept', '{}')");
  await tx(h.admin, async (c) => {
    for (const [id, name] of [[verifier, "verifier"], [colleague, "colleague"]] as const)
      await addMember(c, { id, org_id: LOCAL_ORG, user_name: name, display_name: name, status: "active" }, owner);
    for (const [id, member] of [["qual_v", verifier], ["qual_c", colleague]] as const)
      await recordQualification(c, { id, org_id: LOCAL_ORG, member_id: member, licenses: [], disciplines: ["mechanical"],
        grades: ["safety"], roles: ["checker"], authorities: [], revoked: false, reason: "initial" }, owner);
    await createProject(c, { id: "prj_wb", org_id: LOCAL_ORG, name: "Workbench", mode: "capital-projects", default_rigor: "standard",
      lanes: ["internal"], qa_overlays: [], autonomy_level: 1, status: "active" }, owner);
    // A second organization, suspended so legacy inserts still have one owner.
    await createOrganization(c, { id: "org_b", name: "B", status: "active" }, owner);
    await createProject(c, { id: "prj_b", org_id: "org_b", name: "B project", mode: "general", default_rigor: "standard",
      lanes: ["internal"], qa_overlays: [], autonomy_level: 0, status: "active" }, owner);
  });
  await h.admin.query("update organizations set body = jsonb_set(body, '{status}', '\"suspended\"') where id = 'org_b'");
}, 120_000);
afterAll(async () => h?.stop());

const put = (k: WorkbenchKind, body: Record<string, unknown>) => tx(h.admin, (c) => recordObject(c, k, { ...org, ...body } as never, owner));

/** One valid example of every kind, in dependency order, forming one consistent release. */
const EXAMPLES: [WorkbenchKind, Record<string, unknown>][] = [
  ["exploration", { id: "exp_1", project_id: "prj_wb", lane: "internal", sandbox_policy_digest: D, started_by: verifier, status: "active", interactive: true, unattested: true }],
  ["workspace", { id: "ws_1", kind: "exploration-worktree", exploration_id: "exp_1", path: "/work/exp_1", status: "provisioning" }],
  ["workspace", { id: "ws_run", kind: "run-workspace", run_id: "run_wb", path: "/work/run_wb", status: "provisioning" }],
  ["checkpoint", { id: "chk_1", exploration_id: "exp_1", workspace_id: "ws_1", git_tree: "c".repeat(40), content_digest: D, actor: owner, captured_at: "2026-10-30T12:00:00.000Z" }],
  ["checkpoint", { id: "chk_2", exploration_id: "exp_1", workspace_id: "ws_1", git_tree: "c".repeat(40), content_digest: D, parent_id: "chk_1", actor: owner, captured_at: "2026-10-30T12:05:00.000Z" }],
  ["source_manifest", manifest],
  ["promotion", { id: "pro_1", checkpoint_id: "chk_2", package_id: "pkg_wb", package_revision: 0, source_manifest_digest: manifestDigest, mode: "software", rigor: "standard", grade: "general-service", lane: "internal", promoted_by: verifier }],
  ["promotion", { id: "pro_2", capture_id: "cap_wb", package_id: "pkg_wb", package_revision: 0, source_manifest_digest: manifestDigest, mode: "general", rigor: "quick", grade: "general-service", lane: "internal", promoted_by: verifier }],
  ["attempt_set", { id: "set_1", package_id: "pkg_wb", package_revision: 0, release_digest: D, candidates: 2, status: "running" }],
  ["candidate_assignment", { id: "cand_1", package_id: "pkg_wb", package_revision: 0, release_digest: D, attempt_set_id: "set_1", ordinal: 1, author_assignment: assignment }],
  ["candidate_assignment", { id: "cand_2", package_id: "pkg_wb", package_revision: 0, release_digest: D, attempt_set_id: "set_1", ordinal: 2, author_assignment: assignment }],
  ["selection", { id: "sel_1", attempt_set_id: "set_1", candidate_id: "cand_2", reason: "fewer findings", proposed_by: owner }],
  ["runtime_probe", { id: "probe_1", runtime: "claude-code", artifact_digest: D, version: "2.1.314", auth_state: "signed-in", outcome: "pass", detail: "ok", observed_at: "2026-10-30T12:00:00.000Z" }],
  ["runtime_probe", { id: "probe_bad", runtime: "claude-code", artifact_digest: D2, version: "2.1.315", auth_state: "signed-in", outcome: "fail", detail: "sandbox probe leaked", observed_at: "2026-10-30T12:00:00.000Z" }],
  ["runtime_artifact_version", { id: "rav_1", runtime: "claude-code", version: "2.1.314", artifact_digest: D, install_path: "/opt/claude", probe_ids: ["probe_1"] }],
  ["runtime_pin", { id: "pin_author", role: "author", runtime: "claude-code", artifact_version_id: "rav_1", artifact_digest: D, status: "active" }],
  ["isolation_attestation", { id: "att_1", run_id: "run_wb", generation: 1, policy_digest: D, artifact_digest: D, claims: [{ claim: "login-unreadable", result: "observed", evidence: "ENOENT" }], observed_at: "2026-10-30T12:00:00.000Z" }],
  ["controlled_record", { id: "rec_1", project_id: "prj_wb", kind: "merged-change", package_id: "pkg_wb", package_revision: 0, candidate_id: "cand_2", input_digests: [D, D2], clearance_decision_id: "dec_1", applied_ref: "d".repeat(40) }],
  ["person_verification", { id: "pv_1", verifier_member_id: verifier, qualification_id: "qual_v", qualification_version: 1, candidate_id: "cand_2", criteria: ["C-1"], outcome: "pass", assertion }],
  ["scram_event", { id: "scram_1", scope: "project", project_id: "prj_wb", pulled_by: verifier, reason: "drill", assertion, quarantine: ["run_wb"] }],
  ["scram_event", { id: "scram_2", scope: "organization", pulled_by: verifier, reason: "drill", assertion, quarantine: [] }],
  ["comment", { id: "com_1", subject_digest: D, locator: "line:12", author: owner, text: "Check the units.", status: "open" }],
  ["comment", { id: "com_2", subject_digest: D, locator: "line:12", author: owner, text: "Fixed in revision 2.", reply_to: "com_1", status: "open" }],
  ["resolution", { id: "res_1", comment_id: "com_1", resolved_by: owner, cites_kind: "reply", cites: "com_2" }],
  ["change_request", { id: "cr_1", kind: "lane-lowering", subject_digest: D, reason: "public release", impact: ["pkg_wb@0"], proposed_by: owner, status: "proposed" }],
  ["budget", { id: "bud_1", scope: "project", scope_id: "prj_wb", mode: "hard-cap", limit: { value: "200", unit: "USD" }, period: "P1M", status: "active" }],
  ["usage_record", { id: "use_1", run_id: "run_wb", source: "reported", input_tokens: { value: "1200", unit: "tokens" }, cost: { value: "0.04", unit: "USD" } }],
  ["budget_reservation", { id: "bres_1", budget_id: "bud_1", run_id: "run_wb", amount: { value: "5", unit: "USD" }, status: "reserved" }],
  ["project_deliverable", { id: "pd_1", project_id: "prj_wb", discipline: "mechanical", grade: "material" }],
  ["deliverable_revision", { id: "dr_1", deliverable_id: "pd_1", rung: "issued-for-review", package_id: "pkg_wb", package_revision: 0 }],
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
      "SignerQualification", "AuthenticatorCredential", "Delegation", "DelegationRevocation", "PolicySet"].sort();
    expect(doc.vectors.map((v) => v.type).sort()).toEqual(frozen);
  });
});

describe("storage", () => {
  it("stores one consistent example of every kind against a revision 0 release, each with its event", async () => {
    for (const [k, body] of EXAMPLES) await put(k, body);
    expect(new Set(EXAMPLES.map(([k]) => k))).toEqual(new Set(Object.keys(WORKBENCH)));
    for (const [k, body] of EXAMPLES) expect(await getObject(h.db, k, body.id as string)).toEqual({ ...org, ...body });
    for (const t of WORKBENCH_TABLES.filter((x) => x.cls === "F" && x.name !== "sandbox_policies")) {
      const rows = (await h.db.query<{ body: unknown; digest: string }>(`select body, digest from ${t.name}`)).rows;
      for (const r of rows) expect(digest(r.body)).toBe(r.digest);
    }
    const ev = await h.db.query("select body->>'type' as t from events where body->>'subject' = 'cand_1'");
    expect(ev.rows.map((r) => r.t)).toEqual(["candidate-assignment.recorded"]);
    expect((await verifyChain(h.db)).ok).toBe(true);
  });

  it("refuses bodies the contract rejects", async () => {
    await expect(put("attempt_set", { id: "set_x", package_id: "pkg_wb", package_revision: 0, release_digest: D, candidates: 1, status: "running" })).rejects.toThrow(/AttemptSet.json refused: \/candidates/);
    await expect(put("checkpoint", { id: "chk_x", exploration_id: "exp_1", workspace_id: "ws_1", git_tree: "xyz", content_digest: D, actor: owner, captured_at: "2026-10-30T12:00:00.000Z" })).rejects.toThrow(/git_tree/);
    await expect(put("runtime_pin", { id: "pin_x", role: "author", runtime: "claude-code", artifact_version_id: "rav_1", artifact_digest: D, status: "active", extra: 1 })).rejects.toThrow(/RuntimePin.json refused/);
  });

  it("refuses links to records that do not exist", async () => {
    await expect(put("checkpoint", { id: "chk_y", exploration_id: "exp_missing", workspace_id: "ws_1", git_tree: "c".repeat(40), content_digest: D, actor: owner, captured_at: "2026-10-30T12:00:00.000Z" })).rejects.toThrow(/foreign key/);
    await expect(put("promotion", { id: "pro_y", checkpoint_id: "chk_2", package_id: "pkg_wb", package_revision: 9, source_manifest_digest: manifestDigest, mode: "software", rigor: "standard", grade: "general-service", lane: "internal", promoted_by: verifier })).rejects.toThrow(/foreign key/);
    // R10: the manifest, the clearance decision and a deliverable's package must exist.
    await expect(put("promotion", { id: "pro_z", checkpoint_id: "chk_2", package_id: "pkg_wb", package_revision: 0, source_manifest_digest: D2, mode: "software", rigor: "standard", grade: "general-service", lane: "internal", promoted_by: verifier })).rejects.toThrow(/source_manifest_digest/);
    await expect(put("controlled_record", { id: "rec_x", kind: "merged-change", package_id: "pkg_wb", package_revision: 0, candidate_id: "cand_2", input_digests: [D], clearance_decision_id: "dec_missing", applied_ref: "d".repeat(40) })).rejects.toThrow(/clearance_decision_id/);
    await expect(put("deliverable_revision", { id: "dr_x", deliverable_id: "pd_1", rung: "x", package_id: "pkg_wb", package_revision: 5 })).rejects.toThrow(/foreign key/);
    await expect(put("interface_record", { id: "if_x", provider_package_id: "pkg_missing", receiver_package_ids: [], maturity: "identified" })).rejects.toThrow(/provider_package_id/);
  });

  it("R2: a budget names its own organization or a project inside it", async () => {
    await expect(put("budget", { id: "bud_x", scope: "organization", scope_id: "org_b", mode: "track", limit: { value: "1", unit: "USD" }, period: "P1M", status: "active" })).rejects.toThrow(/check constraint/);
    await expect(put("budget", { id: "bud_y", scope: "project", scope_id: "prj_b", mode: "track", limit: { value: "1", unit: "USD" }, period: "P1M", status: "active" })).rejects.toThrow(/project_scope/);
    await put("budget", { id: "bud_org", scope: "organization", scope_id: LOCAL_ORG, mode: "alert", limit: { value: "1000", unit: "USD" }, period: "P1M", status: "active" });
  });

  it("R2: refuses references across the organization boundary", async () => {
    await expect(put("exploration", { id: "exp_x", project_id: "prj_b", lane: "internal", sandbox_policy_digest: D, started_by: verifier, status: "active", interactive: true, unattested: true })).rejects.toThrow(/project_id_org_id/);
    await expect(tx(h.admin, (c) => recordObject(c, "exploration", { org_id: "org_b", id: "exp_b", project_id: "prj_b", lane: "internal", sandbox_policy_digest: D, started_by: verifier, status: "active", interactive: true, unattested: true } as never, owner))).rejects.toThrow(/started_by_org_id/);
    // A legacy package owned by org_local cannot be referenced from org_b.
    await expect(tx(h.admin, (c) => recordObject(c, "attempt_set", { org_id: "org_b", id: "set_b", package_id: "pkg_wb", package_revision: 0, release_digest: D, candidates: 2, status: "running" } as never, owner))).rejects.toThrow(/package_kind_package_id_org_id/);
  });

  it("R3: binds candidates to their attempt set's exact release and declared size", async () => {
    // A second set with a free ordinal, so the release check is what refuses.
    await put("attempt_set", { id: "set_2", package_id: "pkg_wb", package_revision: 0, release_digest: D, candidates: 3, status: "running" });
    await expect(put("candidate_assignment", { id: "cand_wrongrelease", package_id: "pkg_wb", package_revision: 0, release_digest: D2, attempt_set_id: "set_2", ordinal: 1, author_assignment: assignment })).rejects.toThrow(/attempt_set_id_package_id/);
    await expect(put("candidate_assignment", { id: "cand_wrongpkg", package_id: "pkg_other", package_revision: 0, release_digest: D, attempt_set_id: "set_2", ordinal: 1, author_assignment: assignment })).rejects.toThrow(/attempt_set_id_package_id/);
    await expect(put("candidate_assignment", { id: "cand_3", package_id: "pkg_wb", package_revision: 0, release_digest: D, attempt_set_id: "set_1", ordinal: 3, author_assignment: assignment })).rejects.toThrow(/exceeds the 2 candidates/);
    await expect(put("candidate_assignment", { id: "cand_dup", package_id: "pkg_wb", package_revision: 0, release_digest: D, attempt_set_id: "set_1", ordinal: 2, author_assignment: assignment })).rejects.toThrow(/candidate_assignments_one_ordinal/);
    await expect(put("candidate_assignment", { id: "cand_solo2", package_id: "pkg_wb", package_revision: 0, release_digest: D, ordinal: 2, author_assignment: assignment })).rejects.toThrow(/check constraint/);
    await put("candidate_assignment", { id: "cand_solo", package_id: "pkg_wb", package_revision: 0, release_digest: D, ordinal: 1, author_assignment: assignment });
    await expect(put("candidate_assignment", { id: "cand_solob", package_id: "pkg_wb", package_revision: 0, release_digest: D, ordinal: 1, author_assignment: assignment })).rejects.toThrow(/candidate_assignments_one_ordinal/);
    await expect(put("selection", { id: "sel_y", attempt_set_id: "set_1", candidate_id: "cand_solo", reason: "x", proposed_by: owner })).rejects.toThrow(/foreign key/);
  });

  it("R4: a person verification uses the verifier's own qualification", async () => {
    await expect(put("person_verification", { id: "pv_borrowed", verifier_member_id: verifier, qualification_id: "qual_c", qualification_version: 1, candidate_id: "cand_2", criteria: ["C-1"], outcome: "pass", assertion })).rejects.toThrow(/foreign key/);
    await expect(put("person_verification", { id: "pv_y", verifier_member_id: verifier, qualification_id: "qual_v", qualification_version: 7, candidate_id: "cand_2", criteria: ["C-1"], outcome: "pass", assertion })).rejects.toThrow(/foreign key/);
  });

  it("R9: runtime evidence must support the artifact it qualifies and the pin must agree", async () => {
    await expect(put("runtime_artifact_version", { id: "rav_x", runtime: "claude-code", version: "2.1.315", artifact_digest: D2, install_path: "/opt/claude", probe_ids: ["probe_missing"] })).rejects.toThrow(/probe probe_missing/);
    await expect(put("runtime_artifact_version", { id: "rav_y", runtime: "claude-code", version: "2.1.315", artifact_digest: D2, install_path: "/opt/claude", probe_ids: ["probe_bad"] })).rejects.toThrow(/probe probe_bad/);
    await expect(put("runtime_artifact_version", { id: "rav_z", runtime: "codex", version: "0.166.0", artifact_digest: D, install_path: "/opt/codex", probe_ids: ["probe_1"] })).rejects.toThrow(/probe probe_1/);
    await expect(put("runtime_pin", { id: "pin_x", role: "pre-check", runtime: "claude-code", artifact_version_id: "rav_1", artifact_digest: D2, status: "active" })).rejects.toThrow(/foreign key/);
  });

  it("R13: refuses ambiguous or missing alternatives", async () => {
    await expect(put("workspace", { id: "ws_x", kind: "run-workspace", exploration_id: "exp_1", path: "/w", status: "provisioning" })).rejects.toThrow(/check constraint/);
    await expect(put("workspace", { id: "ws_y", kind: "exploration-worktree", path: "/w", status: "provisioning" })).rejects.toThrow(/check constraint/);
    await expect(put("workspace", { id: "ws_z", kind: "exploration-worktree", exploration_id: "exp_1", run_id: "run_wb", path: "/w", status: "provisioning" })).rejects.toThrow(/check constraint/);
    await expect(put("promotion", { id: "pro_both", checkpoint_id: "chk_2", capture_id: "cap_wb", package_id: "pkg_wb", package_revision: 0, source_manifest_digest: manifestDigest, mode: "software", rigor: "standard", grade: "general-service", lane: "internal", promoted_by: verifier })).rejects.toThrow(/check constraint/);
    await expect(put("promotion", { id: "pro_none", package_id: "pkg_wb", package_revision: 0, source_manifest_digest: manifestDigest, mode: "software", rigor: "standard", grade: "general-service", lane: "internal", promoted_by: verifier })).rejects.toThrow(/check constraint/);
    await expect(put("scram_event", { id: "scram_x", scope: "project", pulled_by: verifier, reason: "x", assertion, quarantine: [] })).rejects.toThrow(/check constraint/);
    await expect(put("scram_event", { id: "scram_y", scope: "organization", project_id: "prj_wb", pulled_by: verifier, reason: "x", assertion, quarantine: [] })).rejects.toThrow(/check constraint/);
    await expect(put("deliverable_revision", { id: "dr_half", deliverable_id: "pd_1", rung: "x", package_id: "pkg_wb" })).rejects.toThrow(/check constraint/);
  });
});

describe("sandbox policies", () => {
  const policy = { id: "sbx_laptop", org_id: LOCAL_ORG, driver: "native-cli", denied_read: ["~/.claude", "~/.codex"], writable_roots: ["."], allowed_hosts: [], enabled_tools: ["Bash", "Read"], mandatory_claims: ["login-unreadable"] };
  it("versions contiguously, keeps its organization and never edits a version", async () => {
    await tx(h.admin, (c) => recordSandboxPolicy(c, { ...policy, version: 1 }, owner));
    await expect(tx(h.admin, (c) => recordSandboxPolicy(c, { ...policy, version: 3 }, owner))).rejects.toThrow(/version 3 does not follow 1/);
    await expect(tx(h.admin, (c) => recordSandboxPolicy(c, { ...policy, version: 2, denied_read: [] }, owner))).rejects.toThrow(/denied_read/);
    await expect(tx(h.admin, (c) => recordSandboxPolicy(c, { ...policy, org_id: "org_b", version: 2 }, owner))).rejects.toThrow(/keeps its organization/);
    const v2 = await tx(h.admin, (c) => recordSandboxPolicy(c, { ...policy, version: 2, enabled_tools: ["Bash"] }, owner));
    const cur = await currentSandboxPolicy(h.db, "sbx_laptop");
    expect(cur?.body.version).toBe(2);
    expect(cur?.digest).toBe(v2.digest);
    expect(digest(cur?.body)).toBe(v2.digest);
    await expect(h.admin.query("update sandbox_policies set body = body")).rejects.toThrow(/append only/);
  });
});

describe("classes", () => {
  it.each(WORKBENCH_TABLES.filter((t) => t.cls !== "L").map((t) => [t.name, t.cls] as const))(
    "%s (%s) refuses update and delete", async (table) => {
      expect((await h.db.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBeGreaterThan(0);
      await expect(h.admin.query(`update ${table} set body = body`)).rejects.toThrow(/append only/);
      await expect(h.admin.query(`delete from ${table}`)).rejects.toThrow(/append only/);
    });

  it.each(WORKBENCH_TABLES.filter((t) => t.cls === "L").map((t) => [t.name] as const))(
    "%s refuses delete, identity change and protected field rewrites even through raw SQL", async (table) => {
      expect((await h.db.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBeGreaterThan(0);
      await expect(h.admin.query(`delete from ${table}`)).rejects.toThrow(/never deleted/);
      await expect(h.admin.query(`update ${table} set body = jsonb_set(body, '{org_id}', '"org_b"')`)).rejects.toThrow(/may change only/);
      // R6: a field outside the type's mutable list cannot change while the status stays.
      await expect(h.admin.query(`update ${table} set body = body || '{"injected": "x"}'`)).rejects.toThrow(/may change only/);
    });

  it("R6: protected evidence and links stay fixed; listed mutable fields may change", async () => {
    await expect(h.admin.query(`update comments set body = jsonb_set(body, '{text}', '"rewritten"') where id = 'com_1'`)).rejects.toThrow(/may change only/);
    await expect(h.admin.query(`update attempt_sets set body = jsonb_set(body, '{release_digest,value}', '"${"b".repeat(64)}"') where id = 'set_1'`)).rejects.toThrow(/may change only/);
    await expect(h.admin.query(`update budget_reservations set body = jsonb_set(body, '{amount,value}', '"500"') where id = 'bres_1'`)).rejects.toThrow(/may change only/);
    await h.admin.query(`update workspaces set body = jsonb_set(body, '{lock_holder}', '"daemon-1"') where id = 'ws_1'`);
    expect(WORKBENCH_MUTABLE.workspaces).toEqual(["lock_holder"]);
  });

  it("moves lifecycled objects only along listed transitions, each an event", async () => {
    await tx(h.admin, (c) => transition(c, "workspace", "ws_1", "ready", owner, "provisioned"));
    await expect(tx(h.admin, (c) => transition(c, "workspace", "ws_1", "provisioning", owner, "back"))).rejects.toThrow(/cannot go from ready to provisioning/);
    await tx(h.admin, (c) => transition(c, "attempt_set", "set_1", "ready-to-compare", owner, "both done"));
    await tx(h.admin, (c) => transition(c, "attempt_set", "set_1", "selected", owner, "sel_1"));
    await expect(tx(h.admin, (c) => transition(c, "attempt_set", "set_1", "running", owner, "again"))).rejects.toThrow(/cannot go from selected to running/);
    await tx(h.admin, (c) => transition(c, "comment", "com_1", "resolved", owner, "res_1"));
    await expect(h.admin.query("update comments set body = jsonb_set(body, '{status}', '\"open\"') where id = 'com_1'")).rejects.toThrow(/cannot go from resolved to open/);
    await expect(tx(h.admin, (c) => transition(c, "checkpoint", "chk_1", "x", owner, "no"))).rejects.toThrow(/not lifecycled/);
    await expect(tx(h.admin, (c) => transition(c, "budget", "bud_1", "closed", owner, "not a status"))).rejects.toThrow(/Budget.json refused: \/status/);
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
