// Checker attempts and recheck overrides (milestone 3). Append-only.
// A fail on a deliverable digest stays in checker_attempts. A later timeout, error, quota or
// cancelled attempt is another row; it does not update the fail. An override is one signed
// permission to check that digest once, consumed by inserting a use row rather than editing it.
export const CHECKER_ATTEMPTS_SQL = `
create table checker_attempts (
  id text primary key,
  package_id text not null,
  package_revision int not null,
  run_id text not null unique references runs(id),
  seq int not null check (seq >= 1),
  body jsonb not null,
  created_at timestamptz not null default now(),
  unique (package_id, seq)
);

create table checker_recheck_overrides (
  id text primary key,
  package_id text not null,
  package_revision int not null,
  deliverable_digest text not null,
  body jsonb not null,
  created_at timestamptz not null default now()
);
create index checker_recheck_overrides_digest
  on checker_recheck_overrides (package_id, deliverable_digest, created_at);

create table checker_recheck_uses (
  override_id text primary key references checker_recheck_overrides(id),
  run_id text not null references runs(id),
  created_at timestamptz not null default now()
);

create trigger checker_attempts_frozen before update or delete on checker_attempts
  for each row execute function tenancy_append_only();
create trigger checker_recheck_overrides_frozen before update or delete on checker_recheck_overrides
  for each row execute function tenancy_append_only();
create trigger checker_recheck_uses_frozen before update or delete on checker_recheck_uses
  for each row execute function tenancy_append_only();
`;

export const CHECKER_ATTEMPTS_DOWN_SQL = `
drop table if exists checker_recheck_uses;
drop table if exists checker_attempts;
drop table if exists checker_recheck_overrides;
delete from schema_migrations where version = '020-checker-attempts';
`;
