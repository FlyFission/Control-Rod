// Tenancy, people and authority (workbench plan task 1.1; specification 5.1 and 6).
// Additive: no existing table, signed body, event or digest is altered. Every existing record is
// owned by one backfilled organization through an envelope row beside it, and every existing
// passkey user becomes a Member.
//
// Integrity rules the database enforces, not just the store:
// - indexed columns are generated from the stored body, so the two can never disagree;
// - every reference carries its organization, so nothing points across the tenant boundary;
// - frozen versions are append only, contiguous, and keep their holder across versions;
// - lifecycled identities are never deleted, keep their identity and links, change status only
//   along listed transitions, and change only the fields listed as mutable for their type.
// The lifecycle machinery (lifecycle_transitions, lifecycle_mutable, lifecycle_guard) is shared
// with the workbench tables in migration 010.

const g = (c: string, path = c) => `${c} text generated always as (body->>'${path}') stored`;
const gi = (c: string, path = c) => `${c} int generated always as ((body->>'${path}')::int) stored`;

export const TENANCY_SQL = `
create table lifecycle_transitions (
  table_name text not null, from_status text not null, to_status text not null,
  primary key (table_name, from_status, to_status)
);
create table lifecycle_mutable (
  table_name text not null, field text not null,
  primary key (table_name, field)
);

-- A lifecycled row is never deleted, keeps everything but its status and its listed mutable
-- fields, and changes status only along a listed transition. Status is read from the body:
-- generated columns are not yet computed in a before trigger.
create function lifecycle_guard() returns trigger language plpgsql as $$
declare frozen text[];
begin
  if tg_op = 'DELETE' then
    raise exception '% rows are never deleted; retire or end them', tg_table_name;
  end if;
  select coalesce(array_agg(field), '{}') || array['status'] into frozen
    from lifecycle_mutable where table_name = tg_table_name;
  if (old.body - frozen) is distinct from (new.body - frozen) then
    raise exception '% % may change only its status and its mutable fields', tg_table_name, old.body->>'id';
  end if;
  if new.body->>'status' is distinct from old.body->>'status' and not exists (
    select 1 from lifecycle_transitions
     where table_name = tg_table_name and from_status = old.body->>'status' and to_status = new.body->>'status') then
    raise exception '% % cannot go from % to %', tg_table_name, old.body->>'id', old.body->>'status', new.body->>'status';
  end if;
  return new;
end $$;

-- Frozen versions and envelopes are never edited or deleted; a change is a new version.
create function tenancy_append_only() returns trigger language plpgsql as $$
begin
  raise exception '% rows are append only', tg_table_name;
end $$;

-- A new version follows the previous one exactly, and keeps the identity's organization and holder.
create function tenancy_next_version() returns trigger language plpgsql as $$
declare latest int; first jsonb; ident text := new.body->>'id'; v int := (new.body->>'version')::int;
begin
  -- Generated columns are not yet computed in a before trigger, so identity is read from the body.
  execute format('select max(version) from %I where id = $1', tg_table_name) into latest using ident;
  if v is distinct from coalesce(latest, 0) + 1 then
    raise exception '% % version % does not follow %', tg_table_name, ident, v, coalesce(latest, 0);
  end if;
  if latest is not null then
    execute format('select body from %I where id = $1 and version = 1', tg_table_name) into first using ident;
    if first->>'org_id' is distinct from new.body->>'org_id'
       or first->>'member_id' is distinct from new.body->>'member_id'
       or first->>'credential_id' is distinct from new.body->>'credential_id' then
      raise exception '% % keeps its organization and holder across versions', tg_table_name, ident;
    end if;
  end if;
  return new;
end $$;

create table organizations (
  body jsonb not null,
  ${g("id")} primary key,
  created_at timestamptz not null default now()
);
create table members (
  body jsonb not null,
  ${g("id")} primary key,
  ${g("org_id")} not null references organizations(id),
  ${g("user_name")} not null,
  created_at timestamptz not null default now(),
  unique (org_id, user_name),
  unique (id, org_id)
);
create table projects (
  body jsonb not null,
  ${g("id")} primary key,
  ${g("org_id")} not null references organizations(id),
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create table signer_qualifications (
  body jsonb not null,
  ${g("id")} not null,
  ${gi("version")} not null check (version >= 1),
  ${g("org_id")} not null,
  ${g("member_id")} not null,
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  primary key (id, version),
  unique (id, version, member_id, org_id),
  foreign key (member_id, org_id) references members(id, org_id)
);
create table authenticator_credentials (
  body jsonb not null,
  ${g("id")} not null,
  ${gi("version")} not null check (version >= 1),
  ${g("org_id")} not null,
  ${g("member_id")} not null,
  ${g("credential_id")} not null references credentials(id),
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  primary key (id, version),
  unique (credential_id, version),
  foreign key (member_id, org_id) references members(id, org_id)
);
create table delegations (
  body jsonb not null,
  ${g("id")} primary key,
  ${g("org_id")} not null,
  ${g("from_member_id")} not null,
  ${g("to_member_id")} not null,
  ${g("project_id")},
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  check (from_member_id <> to_member_id),
  foreign key (from_member_id, org_id) references members(id, org_id),
  foreign key (to_member_id, org_id) references members(id, org_id),
  foreign key (project_id, org_id) references projects(id, org_id)
);
create table repo_bindings (
  body jsonb not null,
  ${g("id")} primary key,
  ${g("org_id")} not null,
  ${g("project_id")} not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references projects(id, org_id)
);
create table policy_sets (
  body jsonb not null,
  ${g("id")} not null,
  ${gi("version")} not null check (version >= 1),
  ${g("org_id")} not null references organizations(id),
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  primary key (id, version)
);
-- One policy identity per organization; the policy in effect is its greatest version.
create unique index policy_sets_one_per_org on policy_sets (org_id) where version = 1;
create table machines (
  body jsonb not null,
  ${g("id")} primary key,
  ${g("org_id")} not null references organizations(id),
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create table object_owners (
  object_kind text not null,
  object_id text not null,
  org_id text not null references organizations(id),
  project_id text,
  primary key (object_kind, object_id),
  unique (object_kind, object_id, org_id),
  foreign key (project_id, org_id) references projects(id, org_id)
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

-- A credential record's Member is the passkey's own user, by the same derivation as code.
create function tenancy_credential_holder() returns trigger language plpgsql as $$
declare owner_name text;
begin
  select user_name into owner_name from credentials where id = new.body->>'credential_id';
  if new.body->>'member_id' is distinct from 'mem_' || substr(md5(owner_name), 1, 24) then
    raise exception 'credential % belongs to %, not member %', new.body->>'credential_id', owner_name, new.body->>'member_id';
  end if;
  return new;
end $$;

create trigger signer_qualifications_frozen before update or delete on signer_qualifications
  for each row execute function tenancy_append_only();
create trigger signer_qualifications_next before insert on signer_qualifications
  for each row execute function tenancy_next_version();
create trigger authenticator_credentials_frozen before update or delete on authenticator_credentials
  for each row execute function tenancy_append_only();
create trigger authenticator_credentials_next before insert on authenticator_credentials
  for each row execute function tenancy_next_version();
create trigger authenticator_credentials_holder before insert on authenticator_credentials
  for each row execute function tenancy_credential_holder();
create trigger policy_sets_frozen before update or delete on policy_sets
  for each row execute function tenancy_append_only();
create trigger policy_sets_next before insert on policy_sets
  for each row execute function tenancy_next_version();
create trigger delegations_frozen before update or delete on delegations
  for each row execute function tenancy_append_only();
create trigger object_markings_frozen before update or delete on object_markings
  for each row execute function tenancy_append_only();
create trigger object_owners_frozen before update or delete on object_owners
  for each row execute function tenancy_append_only();

create trigger organizations_lifecycle before update or delete on organizations
  for each row execute function lifecycle_guard();
create trigger members_lifecycle before update or delete on members
  for each row execute function lifecycle_guard();
create trigger projects_lifecycle before update or delete on projects
  for each row execute function lifecycle_guard();
create trigger repo_bindings_lifecycle before update or delete on repo_bindings
  for each row execute function lifecycle_guard();
create trigger machines_lifecycle before update or delete on machines
  for each row execute function lifecycle_guard();

insert into lifecycle_transitions
  select t, f, s from unnest(array['organizations', 'members', 'projects', 'repo_bindings', 'machines']) t,
    (values ('active', 'suspended'), ('suspended', 'active'), ('active', 'retired'), ('suspended', 'retired')) v(f, s);
insert into lifecycle_mutable values
  ('organizations', 'name'), ('members', 'display_name'),
  ('projects', 'name'), ('projects', 'default_rigor'), ('projects', 'lanes'), ('projects', 'qa_overlays'), ('projects', 'autonomy_level'),
  ('repo_bindings', 'default_branch'), ('machines', 'name');

-- The single local organization every existing record belongs to.
insert into organizations (body) values ('{"id":"org_local","name":"Local organization","status":"active"}');

-- While exactly one organization is active, records created by code that predates the command
-- layer (task 1.4) are owned by it. With any other count the insert refuses rather than guess, and
-- an envelope recorded earlier for the same identity must name the same organization.
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
declare owner text := tenancy_sole_org(); existing text;
begin
  insert into object_owners (object_kind, object_id, org_id)
    values (tg_argv[0], to_jsonb(new)->>tg_argv[1], owner)
    on conflict do nothing;
  select org_id into existing from object_owners where object_kind = tg_argv[0] and object_id = to_jsonb(new)->>tg_argv[1];
  if existing is distinct from owner then
    raise exception '% % is already owned by %, not %', tg_argv[0], to_jsonb(new)->>tg_argv[1], existing, owner;
  end if;
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
insert into members (body)
  select jsonb_build_object('id', 'mem_' || substr(md5(user_name), 1, 24), 'org_id', 'org_local',
      'user_name', user_name, 'display_name', user_name, 'status', 'active')
  from (select distinct user_name from credentials) u;
`;

/**
 * Reverses TENANCY_SQL on a database that has applied it (migration 010 reversed first). Test and
 * recovery use only: the migration runner is forward only. Legacy tables, their rows and the event
 * chain are untouched; events appended after the migration stay, because the log is append only.
 */
export const TENANCY_DOWN_SQL = `
drop trigger if exists captures_owned on captures;
drop trigger if exists packages_owned on packages;
drop trigger if exists runs_owned on runs;
drop trigger if exists decisions_owned on decisions;
drop trigger if exists preparation_snapshots_owned on preparation_snapshots;
drop trigger if exists preparation_grants_owned on preparation_grants;
drop trigger if exists credentials_owned on credentials;
drop table object_markings, object_owners, machines, policy_sets, repo_bindings, delegations,
  authenticator_credentials, signer_qualifications, projects, members, organizations,
  lifecycle_mutable, lifecycle_transitions;
drop function tenancy_own_new_row(), tenancy_sole_org(), tenancy_credential_holder(), tenancy_next_version(),
  tenancy_append_only(), lifecycle_guard();
delete from schema_migrations where version = '009-tenancy';
`;

/** Tables TENANCY_SQL creates, for tests that compare everything that existed before it. */
export const TENANCY_TABLES = [
  "lifecycle_transitions", "lifecycle_mutable", "organizations", "members", "projects", "signer_qualifications",
  "authenticator_credentials", "delegations", "repo_bindings", "policy_sets", "machines", "object_owners", "object_markings",
] as const;
