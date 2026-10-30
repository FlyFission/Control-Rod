// Workbench objects (workbench plan task 1.2; specification 5.7 to 5.10). Additive.
// Each type has its own table, and every indexed column is generated from the stored body, so a
// constraint can never disagree with the record it belongs to. The database enforces:
// - organization consistency: every reference carries org_id, including references to legacy
//   records, which go through their ownership envelope (object_owners);
// - frozen (F) and observed (A) rows are append only; lifecycled (L) rows use the shared
//   lifecycle_guard from migration 009 (listed transitions, listed mutable fields, no deletes);
// - relationships the review asked for: a candidate belongs to its attempt set's exact release, a
//   person verification uses the verifier's own qualification, a runtime pin agrees with its
//   artifact version, and either or rules (workspace owner, promotion source, SCRAM scope).

const g = (c: string, path = c) => `${c} text generated always as (body->>'${path}') stored`;
const gi = (c: string, path = c) => `${c} int generated always as ((body->>'${path}')::int) stored`;
const gd = (c: string, path = c) => `${c} text generated always as (body->'${path}'->>'value') stored`;
/** A constant kind column so a legacy link can reference its ownership envelope with org_id. */
const kindCol = (c: string, kind: string) => `${c} text generated always as ('${kind}') stored`;
const owned = (kc: string, idc: string) => `foreign key (${kc}, ${idc}, org_id) references object_owners(object_kind, object_id, org_id)`;

interface Table { name: string; cls: "F" | "A" | "L" | "H"; columns: string[]; constraints: string[]; mutable?: string[] }
const T = (name: string, cls: Table["cls"], columns: string[] = [], constraints: string[] = [], mutable: string[] = []): Table => ({ name, cls, columns, constraints, mutable });

const TABLES: Table[] = [
  T("explorations", "L", [g("project_id"), g("started_by")], [
    "foreign key (project_id, org_id) references projects(id, org_id)",
    "foreign key (started_by, org_id) references members(id, org_id)",
  ]),
  T("workspaces", "L", [g("kind"), g("exploration_id"), g("run_id"), kindCol("run_kind", "run")], [
    "foreign key (exploration_id, org_id) references explorations(id, org_id)",
    "foreign key (run_id) references runs(id)", owned("run_kind", "run_id"),
    "check ((kind = 'exploration-worktree' and exploration_id is not null and run_id is null) or (kind = 'run-workspace' and run_id is not null and exploration_id is null))",
  ], ["lock_holder"]),
  T("checkpoints", "A", [g("exploration_id"), g("workspace_id"), g("parent_id")], [
    "foreign key (exploration_id, org_id) references explorations(id, org_id)",
    "foreign key (workspace_id, org_id) references workspaces(id, org_id)",
    "foreign key (parent_id, org_id) references checkpoints(id, org_id)",
  ]),
  T("source_manifests", "F", [], ["unique (digest, org_id)"]),
  T("promotions", "A", [g("checkpoint_id"), g("capture_id"), kindCol("capture_kind", "capture"), g("package_id"), gi("package_revision"),
    kindCol("package_kind", "package"), gd("source_manifest_digest"), g("promoted_by")], [
    "foreign key (checkpoint_id, org_id) references checkpoints(id, org_id)",
    "foreign key (capture_id) references captures(id)", owned("capture_kind", "capture_id"),
    "foreign key (package_id, package_revision) references packages(id, revision)", owned("package_kind", "package_id"),
    "foreign key (source_manifest_digest, org_id) references source_manifests(digest, org_id)",
    "foreign key (promoted_by, org_id) references members(id, org_id)",
    "check (num_nonnulls(checkpoint_id, capture_id) = 1)",
  ]),
  T("attempt_sets", "L", [g("package_id"), gi("package_revision"), kindCol("package_kind", "package"), gd("release_digest"), gi("candidates")], [
    "foreign key (package_id, package_revision) references packages(id, revision)", owned("package_kind", "package_id"),
    "unique (id, package_id, package_revision, release_digest, org_id)",
  ]),
  T("candidate_assignments", "F", [g("package_id"), gi("package_revision"), kindCol("package_kind", "package"), gd("release_digest"),
    g("attempt_set_id"), gi("ordinal")], [
    "foreign key (package_id, package_revision) references packages(id, revision)", owned("package_kind", "package_id"),
    "foreign key (attempt_set_id, package_id, package_revision, release_digest, org_id) references attempt_sets(id, package_id, package_revision, release_digest, org_id)",
    "unique (id, attempt_set_id, org_id)",
    "check (attempt_set_id is not null or ordinal = 1)",
  ]),
  T("selections", "A", [g("attempt_set_id"), g("candidate_id")], [
    "foreign key (candidate_id, attempt_set_id, org_id) references candidate_assignments(id, attempt_set_id, org_id)",
  ]),
  T("runtime_probes", "A", [g("machine_id"), g("runtime"), gd("artifact_digest"), g("outcome")], [
    "foreign key (machine_id, org_id) references machines(id, org_id)",
  ]),
  T("runtime_artifact_versions", "F", [g("runtime"), gd("artifact_digest")], ["unique (id, runtime, artifact_digest, org_id)"]),
  T("runtime_pins", "L", [g("artifact_version_id"), g("runtime"), gd("artifact_digest")], [
    "foreign key (artifact_version_id, runtime, artifact_digest, org_id) references runtime_artifact_versions(id, runtime, artifact_digest, org_id)",
  ], ["artifact_version_id", "artifact_digest"]),
  T("isolation_attestations", "A", [g("run_id"), kindCol("run_kind", "run")], [
    "foreign key (run_id) references runs(id)", owned("run_kind", "run_id"),
  ]),
  T("controlled_records", "F", [g("project_id"), g("package_id"), gi("package_revision"), kindCol("package_kind", "package"), g("candidate_id"),
    g("clearance_decision_id"), kindCol("decision_kind", "decision")], [
    "foreign key (project_id, org_id) references projects(id, org_id)",
    "foreign key (package_id, package_revision) references packages(id, revision)", owned("package_kind", "package_id"),
    "foreign key (candidate_id, org_id) references candidate_assignments(id, org_id)",
    "foreign key (clearance_decision_id) references decisions(id)", owned("decision_kind", "clearance_decision_id"),
  ]),
  T("person_verifications", "A", [g("verifier_member_id"), g("qualification_id"), gi("qualification_version"), g("candidate_id")], [
    "foreign key (qualification_id, qualification_version, verifier_member_id, org_id) references signer_qualifications(id, version, member_id, org_id)",
    "foreign key (candidate_id, org_id) references candidate_assignments(id, org_id)",
  ]),
  T("scram_events", "A", [g("scope"), g("pulled_by"), g("project_id")], [
    "foreign key (pulled_by, org_id) references members(id, org_id)",
    "foreign key (project_id, org_id) references projects(id, org_id)",
    "check ((scope = 'project') = (project_id is not null))",
  ]),
  T("comments", "L", [g("reply_to")], ["foreign key (reply_to, org_id) references comments(id, org_id)"]),
  T("resolutions", "A", [g("comment_id")], ["foreign key (comment_id, org_id) references comments(id, org_id)"]),
  T("change_requests", "L"),
  T("budgets", "L", [g("scope"), g("scope_id"),
    "project_scope text generated always as (case when body->>'scope' = 'project' then body->>'scope_id' end) stored"], [
    // An organization budget names its own organization; a project budget names a project in it.
    // Agent budgets are checked when agents become stored identities.
    "check (scope <> 'organization' or scope_id = org_id)",
    "foreign key (project_scope, org_id) references projects(id, org_id)",
  ], ["mode", "limit", "period"]),
  T("usage_records", "A", [g("run_id"), kindCol("run_kind", "run"), g("exploration_id")], [
    "foreign key (run_id) references runs(id)", owned("run_kind", "run_id"),
    "foreign key (exploration_id, org_id) references explorations(id, org_id)",
  ]),
  T("budget_reservations", "L", [g("budget_id"), g("run_id"), kindCol("run_kind", "run")], [
    "foreign key (budget_id, org_id) references budgets(id, org_id)",
    "foreign key (run_id) references runs(id)", owned("run_kind", "run_id"),
  ]),
  T("project_deliverables", "H", [g("project_id")], ["foreign key (project_id, org_id) references projects(id, org_id)"]),
  T("deliverable_revisions", "H", [g("deliverable_id"), g("package_id"), gi("package_revision"), kindCol("package_kind", "package")], [
    "foreign key (deliverable_id, org_id) references project_deliverables(id, org_id)",
    "foreign key (package_id, package_revision) references packages(id, revision)", owned("package_kind", "package_id"),
    "check ((package_id is null) = (package_revision is null))",
  ]),
  // Identity only hook (specification 5.9): the provider is checked; receivers arrive with program 5.
  T("interface_records", "H", [g("provider_package_id"), kindCol("package_kind", "package")], [owned("package_kind", "provider_package_id")]),
  T("flow_edge_refs", "H"),
  T("phase_gates", "H", [g("project_id")], ["foreign key (project_id, org_id) references projects(id, org_id)"]),
];

/** Allowed lifecycle transitions; anything else is refused by the database. */
const TRANSITIONS: [string, string, string][] = [
  ["explorations", "active", "paused"], ["explorations", "paused", "active"],
  ["explorations", "active", "ended"], ["explorations", "paused", "ended"],
  ["workspaces", "provisioning", "ready"], ["workspaces", "provisioning", "torn-down"], ["workspaces", "ready", "torn-down"],
  ["attempt_sets", "running", "ready-to-compare"], ["attempt_sets", "running", "abandoned"],
  ["attempt_sets", "ready-to-compare", "selected"], ["attempt_sets", "ready-to-compare", "abandoned"],
  ["runtime_pins", "active", "suspended"], ["runtime_pins", "suspended", "active"],
  ["runtime_pins", "active", "retired"], ["runtime_pins", "suspended", "retired"],
  ["comments", "open", "resolved"], ["comments", "open", "withdrawn"],
  ["change_requests", "proposed", "approved"], ["change_requests", "proposed", "rejected"], ["change_requests", "proposed", "withdrawn"],
  ["budgets", "active", "suspended"], ["budgets", "suspended", "active"],
  ["budgets", "active", "retired"], ["budgets", "suspended", "retired"],
  ["budget_reservations", "reserved", "settled"], ["budget_reservations", "reserved", "released"],
];

function table(t: Table): string {
  const cols = [
    "body jsonb not null",
    `${g("id")} primary key`,
    `${g("org_id")} not null references organizations(id)`,
    ...(t.cls === "F" ? ["digest text not null unique"] : []),
    ...(t.cls === "L" ? [g("status") + " not null"] : []),
    ...t.columns,
    "recorded_at timestamptz not null default now()",
    "unique (id, org_id)",
    ...t.constraints,
  ];
  const guard = t.cls === "L" ? "lifecycle_guard" : "tenancy_append_only";
  return `create table ${t.name} (\n  ${cols.join(",\n  ")}\n);\ncreate trigger ${t.name}_guard before update or delete on ${t.name}\n  for each row execute function ${guard}();`;
}

const quote = (v: string) => `'${v.replaceAll("'", "''")}'`;

export const WORKBENCH_SQL = `
${TABLES.map(table).join("\n\n")}

insert into lifecycle_transitions values
${TRANSITIONS.map(([t, f, to]) => `  (${quote(t)}, ${quote(f)}, ${quote(to)})`).join(",\n")};
insert into lifecycle_mutable values
${TABLES.flatMap((t) => (t.mutable ?? []).map((f) => `  (${quote(t.name)}, ${quote(f)})`)).join(",\n")};

-- One candidate per ordinal within a release (or attempt set), never more than the set declared.
create unique index candidate_assignments_one_ordinal
  on candidate_assignments (package_id, package_revision, coalesce(attempt_set_id, ''), ordinal);
create function workbench_candidate_ordinal() returns trigger language plpgsql as $$
declare declared int;
begin
  if new.body->>'attempt_set_id' is not null then
    select candidates into declared from attempt_sets where id = new.body->>'attempt_set_id';
    if (new.body->>'ordinal')::int > declared then
      raise exception 'candidate ordinal % exceeds the % candidates attempt set % declared',
        new.body->>'ordinal', declared, new.body->>'attempt_set_id';
    end if;
  end if;
  return new;
end $$;
create trigger candidate_assignments_ordinal before insert on candidate_assignments
  for each row execute function workbench_candidate_ordinal();

-- A qualified artifact version cites only passing probes of the same runtime and executable.
create function workbench_artifact_probes() returns trigger language plpgsql as $$
declare probe text; ok boolean;
begin
  for probe in select jsonb_array_elements_text(new.body->'probe_ids') loop
    select exists (select 1 from runtime_probes p where p.id = probe and p.org_id = new.body->>'org_id'
                     and p.runtime = new.body->>'runtime' and p.artifact_digest = new.body->'artifact_digest'->>'value'
                     and p.outcome = 'pass') into ok;
    if not ok then
      raise exception 'artifact version % cites probe %, which is missing or does not show this executable passing', new.body->>'id', probe;
    end if;
  end loop;
  return new;
end $$;
create trigger runtime_artifact_versions_probes before insert on runtime_artifact_versions
  for each row execute function workbench_artifact_probes();

-- Sandbox policies are versioned like the tenancy frozen types: contiguous, holder kept.
create table sandbox_policies (
  body jsonb not null,
  ${g("id")} not null,
  ${gi("version")} not null check (version >= 1),
  ${g("org_id")} not null references organizations(id),
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  primary key (id, version)
);
create trigger sandbox_policies_frozen before update or delete on sandbox_policies
  for each row execute function tenancy_append_only();
create trigger sandbox_policies_next before insert on sandbox_policies
  for each row execute function tenancy_next_version();
`;

/** Reverses WORKBENCH_SQL. Test and recovery use only: the migration runner is forward only. */
export const WORKBENCH_DOWN_SQL = `
drop table sandbox_policies, ${[...TABLES].reverse().map((t) => t.name).join(", ")};
drop function workbench_artifact_probes(), workbench_candidate_ordinal();
delete from lifecycle_transitions where table_name in (${TABLES.map((t) => quote(t.name)).join(", ")});
delete from lifecycle_mutable where table_name in (${TABLES.map((t) => quote(t.name)).join(", ")});
delete from schema_migrations where version = '010-workbench';
`;

/** Table names and classes, for the store and for tests. */
export const WORKBENCH_TABLES = [...TABLES.map((t) => ({ name: t.name, cls: t.cls })), { name: "sandbox_policies", cls: "F" as const }];
export const WORKBENCH_TRANSITIONS = TRANSITIONS;
export const WORKBENCH_MUTABLE = Object.fromEntries(TABLES.map((t) => [t.name, t.mutable ?? []]));
