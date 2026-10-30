// Administrative commands (workbench plan task 1.5; specification 10.2). Additive.
// Delegations are frozen, so revoking one is its own append only record in the same organization.
// A Member's office theme is a preference the Member may change. New people register by invitation.
const g = (c: string, path = c) => `${c} text generated always as (body->>'${path}') stored`;

export const ADMINISTRATION_SQL = `
alter table delegations add constraint delegations_id_org unique (id, org_id);
create table delegation_revocations (
  body jsonb not null,
  ${g("id")} primary key,
  ${g("org_id")} not null,
  ${g("delegation_id")} not null unique,
  ${g("revoked_by")} not null,
  digest text not null unique,
  recorded_at timestamptz not null default now(),
  foreign key (delegation_id, org_id) references delegations(id, org_id),
  foreign key (revoked_by, org_id) references members(id, org_id)
);
create trigger delegation_revocations_frozen before update or delete on delegation_revocations
  for each row execute function tenancy_append_only();
insert into lifecycle_mutable values ('members', 'office_theme');
-- A new person registers only with an invitation an administrator issued: one use, expiring, kept
-- as a hash. The token itself is shown once, to the administrator who issued it.
create table member_invitations (
  token_hash text primary key,
  member_id text not null,
  org_id text not null,
  issued_by text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (member_id, org_id) references members(id, org_id),
  foreign key (issued_by, org_id) references members(id, org_id)
);
`;

/** Reverses ADMINISTRATION_SQL for tests and recovery. */
export const ADMINISTRATION_DOWN_SQL = `
drop table member_invitations;
drop table delegation_revocations;
alter table delegations drop constraint delegations_id_org;
delete from lifecycle_mutable where table_name = 'members' and field = 'office_theme';
delete from schema_migrations where version = '012-administration';
`;
