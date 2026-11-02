// SCRAM (workbench plan task 2.10; specification 22a). ScramEvent storage exists (migration 010);
// this adds which runs each SCRAM stopped, what those runs reported (quarantine batches, retained
// privately with their digests and never applied), and the signed quarantine reviews and staged
// restarts that lift it. Every table is append only and tied to the SCRAM's organization. Additive.
export const SCRAM_SQL = `
create table scram_runs (
  scram_id text not null,
  org_id text not null,
  run_id text not null references runs(id),
  run_kind text not null default 'run' check (run_kind = 'run'),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (scram_id, run_id),
  foreign key (scram_id, org_id) references scram_events(id, org_id),
  -- The run belongs to the SCRAM's organization.
  foreign key (run_kind, run_id, org_id) references object_owners(object_kind, object_id, org_id)
);
create index scram_runs_run on scram_runs (run_id);
create trigger scram_runs_frozen before update or delete on scram_runs
  for each row execute function tenancy_append_only();

create table scram_quarantine_batches (
  id bigint generated always as identity primary key,
  run_id text not null references runs(id),
  idempotency_key text not null,
  reported text not null,
  output_count int not null check (output_count >= 0),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (run_id, idempotency_key)
);
create trigger scram_quarantine_batches_frozen before update or delete on scram_quarantine_batches
  for each row execute function tenancy_append_only();

create table scram_quarantine (
  batch_id bigint not null references scram_quarantine_batches(id),
  ordinal int not null check (ordinal >= 0),
  name text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bytea not null,
  primary key (batch_id, ordinal)
);
create trigger scram_quarantine_frozen before update or delete on scram_quarantine
  for each row execute function tenancy_append_only();

create table quarantine_reviews (
  body jsonb not null,
  id text generated always as (body->>'id') stored primary key,
  org_id text generated always as (body->>'org_id') stored not null references organizations(id),
  scram_id text generated always as (body->>'scram_id') stored not null,
  run_id text generated always as (body->>'run_id') stored not null references runs(id),
  reviewed_by text generated always as (body->>'reviewed_by') stored not null,
  recorded_at timestamptz not null default now(),
  foreign key (scram_id, org_id) references scram_events(id, org_id),
  foreign key (reviewed_by, org_id) references members(id, org_id),
  foreign key (scram_id, run_id) references scram_runs(scram_id, run_id)
);
create trigger quarantine_reviews_frozen before update or delete on quarantine_reviews
  for each row execute function tenancy_append_only();

create table scram_restarts (
  body jsonb not null,
  id text generated always as (body->>'id') stored primary key,
  org_id text generated always as (body->>'org_id') stored not null references organizations(id),
  scram_id text generated always as (body->>'scram_id') stored not null,
  scope text generated always as (body->>'scope') stored not null check (scope in ('all', 'package', 'discipline')),
  released_by text generated always as (body->>'released_by') stored not null,
  recorded_at timestamptz not null default now(),
  foreign key (scram_id, org_id) references scram_events(id, org_id),
  foreign key (released_by, org_id) references members(id, org_id)
);
create trigger scram_restarts_frozen before update or delete on scram_restarts
  for each row execute function tenancy_append_only();
`;

export const SCRAM_DOWN_SQL = `
drop table scram_restarts;
drop table quarantine_reviews;
drop table scram_quarantine;
drop table scram_quarantine_batches;
drop table scram_runs;
delete from schema_migrations where version = '015-scram';
`;
