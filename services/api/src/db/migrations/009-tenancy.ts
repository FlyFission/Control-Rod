// Tenancy, people and authority (workbench plan task 1.1; specification 5.1 and 6).
// Additive: no existing table, signed body, event or digest is altered. Every existing record is
// owned by one backfilled organization through an envelope row beside it, and every existing
// passkey user becomes a Member. Frozen versions are append only and their versions contiguous.
export const TENANCY_SQL = `
create table organizations (
  id text primary key,
  body jsonb not null,
  created_at timestamptz not null default now()
);
create table members (
  id text primary key,
  org_id text not null references organizations(id),
  user_name text not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id, user_name)
);
create table signer_qualifications (
  id text not null,
  version int not null check (version >= 1),
  org_id text not null references organizations(id),
  member_id text not null references members(id),
  body jsonb not null,
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  primary key (id, version)
);
create table authenticator_credentials (
  id text not null,
  version int not null check (version >= 1),
  org_id text not null references organizations(id),
  member_id text not null references members(id),
  credential_id text not null references credentials(id),
  body jsonb not null,
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  primary key (id, version)
);
create unique index authenticator_credentials_one_identity on authenticator_credentials (credential_id, version);
create table delegations (
  id text primary key,
  org_id text not null references organizations(id),
  from_member_id text not null references members(id),
  to_member_id text not null references members(id),
  body jsonb not null,
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);
create table projects (
  id text primary key,
  org_id text not null references organizations(id),
  body jsonb not null,
  created_at timestamptz not null default now()
);
create table repo_bindings (
  id text primary key,
  org_id text not null references organizations(id),
  project_id text not null references projects(id),
  body jsonb not null,
  created_at timestamptz not null default now()
);
create table policy_sets (
  id text not null,
  version int not null check (version >= 1),
  org_id text not null references organizations(id),
  body jsonb not null,
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  primary key (id, version)
);
create table machines (
  id text primary key,
  org_id text not null references organizations(id),
  body jsonb not null,
  created_at timestamptz not null default now()
);
create table object_owners (
  object_kind text not null,
  object_id text not null,
  org_id text not null references organizations(id),
  project_id text references projects(id),
  primary key (object_kind, object_id)
);
create index object_owners_by_org on object_owners (org_id, object_kind);
create table object_markings (
  object_kind text not null,
  object_id text not null,
  version int not null check (version >= 1),
  body jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (object_kind, object_id, version)
);

-- Frozen versions and envelopes are never edited or deleted; a change is a new version.
create function tenancy_append_only() returns trigger language plpgsql as $$
begin
  raise exception '% rows are append only', tg_table_name;
end $$;
-- A new version follows the previous one exactly: 1, then 2, never a gap or a reuse.
create function tenancy_contiguous_version() returns trigger language plpgsql as $$
declare latest int;
begin
  execute format('select max(version) from %I where id = $1', tg_table_name) into latest using new.id;
  if new.version <> coalesce(latest, 0) + 1 then
    raise exception '% % version % does not follow %', tg_table_name, new.id, new.version, coalesce(latest, 0);
  end if;
  return new;
end $$;
create trigger signer_qualifications_frozen before update or delete on signer_qualifications
  for each row execute function tenancy_append_only();
create trigger signer_qualifications_contiguous before insert on signer_qualifications
  for each row execute function tenancy_contiguous_version();
create trigger authenticator_credentials_frozen before update or delete on authenticator_credentials
  for each row execute function tenancy_append_only();
create trigger authenticator_credentials_contiguous before insert on authenticator_credentials
  for each row execute function tenancy_contiguous_version();
create trigger policy_sets_frozen before update or delete on policy_sets
  for each row execute function tenancy_append_only();
create trigger policy_sets_contiguous before insert on policy_sets
  for each row execute function tenancy_contiguous_version();
create trigger delegations_frozen before update or delete on delegations
  for each row execute function tenancy_append_only();
create trigger object_markings_frozen before update or delete on object_markings
  for each row execute function tenancy_append_only();
create trigger object_owners_frozen before update or delete on object_owners
  for each row execute function tenancy_append_only();

-- The single local organization every existing record belongs to.
insert into organizations (id, body) values
  ('org_local', '{"id":"org_local","name":"Local organization","status":"active"}');

-- While exactly one organization is active, records created by code that predates the command
-- layer (task 1.4) are owned by it. With any other count the insert refuses rather than guess.
create function tenancy_sole_org() returns text language plpgsql as $$
declare n int; only_id text;
begin
  select count(*), min(id) into n, only_id from organizations where body->>'status' = 'active';
  if n <> 1 then
    raise exception 'ownership is ambiguous: % active organizations; name the owner explicitly', n;
  end if;
  return only_id;
end $$;
create function tenancy_own_new_row() returns trigger language plpgsql as $$
begin
  insert into object_owners (object_kind, object_id, org_id)
    values (tg_argv[0], to_jsonb(new)->>tg_argv[1], tenancy_sole_org())
    on conflict do nothing;
  return new;
end $$;
create trigger captures_owned after insert on captures
  for each row execute function tenancy_own_new_row('capture', 'id');
create trigger packages_owned after insert on packages
  for each row execute function tenancy_own_new_row('package', 'id');
create trigger runs_owned after insert on runs
  for each row execute function tenancy_own_new_row('run', 'id');
create trigger decisions_owned after insert on decisions
  for each row execute function tenancy_own_new_row('decision', 'id');
create trigger preparation_snapshots_owned after insert on preparation_snapshots
  for each row execute function tenancy_own_new_row('preparation', 'preparation_id');
create trigger preparation_grants_owned after insert on preparation_grants
  for each row execute function tenancy_own_new_row('grant', 'id');
create trigger credentials_owned after insert on credentials
  for each row execute function tenancy_own_new_row('credential', 'id');

-- Backfill: envelopes only. Signed bodies, events and digests are not read for writing.
insert into object_owners (object_kind, object_id, org_id)
  select 'capture', id, 'org_local' from captures
  union select 'package', id, 'org_local' from packages
  union select 'run', id, 'org_local' from runs
  union select 'decision', id, 'org_local' from decisions
  union select 'preparation', preparation_id, 'org_local' from preparation_snapshots
  union select 'grant', id, 'org_local' from preparation_grants
  union select 'credential', id, 'org_local' from credentials;
insert into members (id, org_id, user_name, body)
  select 'mem_' || substr(md5(user_name), 1, 24), 'org_local', user_name,
    jsonb_build_object('id', 'mem_' || substr(md5(user_name), 1, 24), 'org_id', 'org_local',
      'user_name', user_name, 'display_name', user_name, 'status', 'active')
  from (select distinct user_name from credentials) u;
`;

/**
 * Reverses TENANCY_SQL on a database that has applied it. Test and recovery use only: the
 * migration runner is forward only. Legacy tables, their rows and the event chain are untouched;
 * events appended after the migration (credential records) stay, because the log is append only.
 */
export const TENANCY_DOWN_SQL = `
drop trigger if exists captures_owned on captures;
drop trigger if exists packages_owned on packages;
drop trigger if exists runs_owned on runs;
drop trigger if exists decisions_owned on decisions;
drop trigger if exists preparation_snapshots_owned on preparation_snapshots;
drop trigger if exists preparation_grants_owned on preparation_grants;
drop trigger if exists credentials_owned on credentials;
drop table object_markings, object_owners, machines, policy_sets, repo_bindings, projects,
  delegations, authenticator_credentials, signer_qualifications, members, organizations;
drop function tenancy_own_new_row(), tenancy_sole_org(), tenancy_contiguous_version(), tenancy_append_only();
delete from schema_migrations where version = '009-tenancy';
`;
