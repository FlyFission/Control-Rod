// Workbench objects (workbench plan task 1.2; specification 5.7 to 5.10). Additive.
// Each type has its own table. Link columns are generated from the stored body, so a foreign key
// can never disagree with the record it belongs to. Frozen (F) and observed (A) rows are append
// only; lifecycled (L) rows change status only along transitions listed in workbench_transitions.

/** Every workbench type: table, class, the generated link columns and their constraints. */
const T = (name: string, cls: "F" | "A" | "L" | "H", links: string, constraints = "") => ({ name, cls, links, constraints });
const col = (c: string, path = c) => `${c} text generated always as (body->>'${path}') stored`;
const intcol = (c: string) => `${c} int generated always as ((body->>'${c}')::int) stored`;

const TABLES = [
  T("explorations", "L", [col("project_id")].join(","), "foreign key (project_id) references projects(id)"),
  T("workspaces", "L", [col("exploration_id"), col("run_id")].join(","),
    "foreign key (exploration_id) references explorations(id), foreign key (run_id) references runs(id)"),
  T("checkpoints", "A", [col("exploration_id"), col("workspace_id"), col("parent_id")].join(","),
    "foreign key (exploration_id) references explorations(id), foreign key (workspace_id) references workspaces(id), foreign key (parent_id) references checkpoints(id)"),
  T("source_manifests", "F", ""),
  T("promotions", "A", [col("checkpoint_id"), col("package_id"), intcol("package_revision")].join(","),
    "foreign key (checkpoint_id) references checkpoints(id), foreign key (package_id, package_revision) references packages(id, revision)"),
  T("attempt_sets", "L", [col("package_id"), intcol("package_revision")].join(","),
    "foreign key (package_id, package_revision) references packages(id, revision)"),
  T("candidate_assignments", "F", [col("package_id"), intcol("package_revision"), col("attempt_set_id"), intcol("ordinal")].join(","),
    "foreign key (package_id, package_revision) references packages(id, revision), foreign key (attempt_set_id) references attempt_sets(id), unique (id, attempt_set_id)"),
  T("selections", "A", [col("attempt_set_id"), col("candidate_id")].join(","),
    "foreign key (candidate_id, attempt_set_id) references candidate_assignments(id, attempt_set_id)"),
  T("runtime_probes", "A", [col("machine_id")].join(","), "foreign key (machine_id) references machines(id)"),
  T("runtime_artifact_versions", "F", ""),
  T("runtime_pins", "L", [col("artifact_version_id")].join(","),
    "foreign key (artifact_version_id) references runtime_artifact_versions(id)"),
  T("isolation_attestations", "A", [col("run_id")].join(","), "foreign key (run_id) references runs(id)"),
  T("controlled_records", "F", [col("package_id"), intcol("package_revision"), col("candidate_id")].join(","),
    "foreign key (package_id, package_revision) references packages(id, revision), foreign key (candidate_id) references candidate_assignments(id)"),
  T("person_verifications", "A", [col("verifier_member_id"), col("qualification_id"), intcol("qualification_version"), col("candidate_id")].join(","),
    "foreign key (verifier_member_id) references members(id), foreign key (qualification_id, qualification_version) references signer_qualifications(id, version), foreign key (candidate_id) references candidate_assignments(id)"),
  T("scram_events", "A", [col("pulled_by"), col("project_id")].join(","),
    "foreign key (pulled_by) references members(id), foreign key (project_id) references projects(id)"),
  T("comments", "L", [col("reply_to")].join(","), "foreign key (reply_to) references comments(id)"),
  T("resolutions", "A", [col("comment_id")].join(","), "foreign key (comment_id) references comments(id)"),
  T("change_requests", "L", ""),
  T("budgets", "L", ""),
  T("usage_records", "A", [col("run_id"), col("exploration_id")].join(","),
    "foreign key (run_id) references runs(id), foreign key (exploration_id) references explorations(id)"),
  T("budget_reservations", "L", [col("budget_id"), col("run_id")].join(","),
    "foreign key (budget_id) references budgets(id), foreign key (run_id) references runs(id)"),
  T("project_deliverables", "H", [col("project_id")].join(","), "foreign key (project_id) references projects(id)"),
  T("deliverable_revisions", "H", [col("deliverable_id")].join(","), "foreign key (deliverable_id) references project_deliverables(id)"),
  T("interface_records", "H", ""),
  T("flow_edge_refs", "H", ""),
  T("phase_gates", "H", [col("project_id")].join(","), "foreign key (project_id) references projects(id)"),
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

function table(t: (typeof TABLES)[number]): string {
  const cols = [
    "id text primary key generated always as (body->>'id') stored",
    "body jsonb not null",
    "org_id text not null generated always as (body->>'org_id') stored references organizations(id)",
    ...(t.cls === "F" ? ["digest text not null unique"] : []),
    ...(t.cls === "L" ? ["status text not null generated always as (body->>'status') stored"] : []),
    ...(t.links ? [t.links] : []),
    "recorded_at timestamptz not null default now()",
    ...(t.constraints ? [t.constraints] : []),
  ];
  const guard =
    t.cls === "L"
      ? `create trigger ${t.name}_lifecycle before update or delete on ${t.name}
  for each row execute function workbench_lifecycle();`
      : `create trigger ${t.name}_frozen before update or delete on ${t.name}
  for each row execute function tenancy_append_only();`;
  return `create table ${t.name} (\n  ${cols.join(",\n  ")}\n);\n${guard}`;
}

export const WORKBENCH_SQL = `
create table workbench_transitions (
  table_name text not null,
  from_status text not null,
  to_status text not null,
  primary key (table_name, from_status, to_status)
);
insert into workbench_transitions values
${TRANSITIONS.map(([t, f, to]) => `  ('${t}', '${f}', '${to}')`).join(",\n")};

-- A lifecycled row is never deleted, never changes identity, organization or links, and changes
-- status only along a listed transition.
create function workbench_lifecycle() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception '% rows are never deleted; retire or end them', tg_table_name;
  end if;
  if new.body->>'id' is distinct from old.body->>'id' or new.body->>'org_id' is distinct from old.body->>'org_id' then
    raise exception '% identity and organization are fixed', tg_table_name;
  end if;
  -- Generated columns are not yet computed in a before trigger, so status is read from the body.
  if new.body->>'status' is distinct from old.body->>'status' and not exists (
    select 1 from workbench_transitions
     where table_name = tg_table_name and from_status = old.body->>'status' and to_status = new.body->>'status') then
    raise exception '% % cannot go from % to %', tg_table_name, old.body->>'id', old.body->>'status', new.body->>'status';
  end if;
  return new;
end $$;

${TABLES.map(table).join("\n\n")}

-- One candidate per ordinal within a release (or attempt set).
create unique index candidate_assignments_one_ordinal
  on candidate_assignments (package_id, package_revision, coalesce(attempt_set_id, ''), ordinal);
-- Sandbox policies are versioned: the id is "<policy>@<version>", and versions are contiguous.
create function workbench_contiguous_policy() returns trigger language plpgsql as $$
declare latest int;
begin
  select max((body->>'version')::int) into latest from sandbox_policies
   where body->>'id' = new.body->>'id';
  if (new.body->>'version')::int <> coalesce(latest, 0) + 1 then
    raise exception 'sandbox policy % version % does not follow %', new.body->>'id', new.body->>'version', coalesce(latest, 0);
  end if;
  return new;
end $$;
create table sandbox_policies (
  body jsonb not null,
  policy_id text not null generated always as (body->>'id') stored,
  version int not null generated always as ((body->>'version')::int) stored,
  org_id text not null generated always as (body->>'org_id') stored references organizations(id),
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  primary key (policy_id, version)
);
create trigger sandbox_policies_frozen before update or delete on sandbox_policies
  for each row execute function tenancy_append_only();
create trigger sandbox_policies_contiguous before insert on sandbox_policies
  for each row execute function workbench_contiguous_policy();
`;

/** Reverses WORKBENCH_SQL. Test and recovery use only: the migration runner is forward only. */
export const WORKBENCH_DOWN_SQL = `
drop table sandbox_policies, ${[...TABLES].reverse().map((t) => t.name).join(", ")}, workbench_transitions;
drop function workbench_contiguous_policy(), workbench_lifecycle();
delete from schema_migrations where version = '010-workbench';
`;

/** Table names in creation order, for the store and for tests. */
export const WORKBENCH_TABLES = [...TABLES.map((t) => ({ name: t.name, cls: t.cls })), { name: "sandbox_policies", cls: "F" as const }];
export const WORKBENCH_TRANSITIONS = TRANSITIONS;
