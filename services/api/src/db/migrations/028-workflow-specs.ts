// Declarative workflow specs (WorkflowSpecV1) per project or package, plus org-scoped custom skill packs.
// Additive: projects and packages without a saved spec continue using the existing workflow resolution.
export const WORKFLOW_SPECS_SQL = `
create table workflow_specs (
  scope_kind text not null,
  scope_id text not null,
  org_id text not null,
  schema_version text not null,
  body jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, scope_kind, scope_id)
);
create table workflow_custom_packs (
  id text not null,
  org_id text not null,
  name text not null,
  body jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);
`;

/** Reverses 028 for the migration preservation tests. */
export const WORKFLOW_SPECS_DOWN_SQL = `
drop table if exists workflow_custom_packs;
drop table if exists workflow_specs;
delete from schema_migrations where version = '028-workflow-specs';
`;
