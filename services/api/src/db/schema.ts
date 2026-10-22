/** Control plane schema. Applied at start; every statement is idempotent. */
export const SCHEMA = String.raw`
-- Control plane schema for the MVP. Applied at start; every statement is idempotent.
create table if not exists settings (key text primary key, value text not null);

create table if not exists credentials (
  id text primary key,
  user_name text not null,
  public_key bytea not null,
  counter bigint not null,
  transports text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_name text not null,
  expires_at timestamptz not null
);

create table if not exists challenges (
  challenge text primary key,
  purpose text not null,
  data jsonb not null default '{}',
  expires_at timestamptz not null
);

create table if not exists captures (
  id text primary key,
  body jsonb not null,
  created_at timestamptz not null
);

create table if not exists attachments (
  capture_id text not null references captures(id),
  name text not null,
  sha256 text not null,
  bytes bytea not null,
  primary key (capture_id, name)
);

create table if not exists packages (
  id text not null,
  revision int not null,
  status text not null,
  capture_id text,
  body jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, revision)
);

create table if not exists runs (
  id text primary key,
  package_id text not null,
  package_revision int not null,
  role text not null,
  round int not null,
  status text not null,
  body jsonb not null,
  log text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Run custody: the claim token (hashed), its lease, and the completion receipt.
alter table runs add column if not exists claim_token_hash text;
alter table runs add column if not exists lease_expires_at timestamptz;
alter table runs add column if not exists completion_key text;
alter table runs add column if not exists receipt jsonb;

-- At most one live (queued or running) run per package revision, role and round, so one
-- assignment can never be worked twice.
create unique index if not exists runs_one_live on runs (package_id, package_revision, role, round)
  where status in ('queued', 'running');

create table if not exists outputs (
  run_id text not null references runs(id),
  package_id text not null,
  package_revision int not null,
  name text not null,
  sha256 text not null,
  bytes bytea not null,
  primary key (run_id, name)
);

create table if not exists verifications (
  run_id text primary key references runs(id),
  package_id text not null,
  package_revision int not null,
  round int not null,
  body jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists decisions (
  id text primary key,
  package_id text not null,
  package_revision int not null,
  kind text not null,
  body jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  seq int primary key,
  at timestamptz not null,
  body jsonb not null,
  digest text not null
);

-- The event log is append-only: no update or delete, ever.
create or replace function events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'events are append-only';
end $$;

drop trigger if exists events_no_change on events;
create trigger events_no_change before update or delete on events
  for each row execute function events_append_only();
`;
