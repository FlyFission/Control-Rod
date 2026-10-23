// Controller grants are inert until an approved coordinator issues one for a
// real preparer run. No legacy dispatcher or public issuance path is added.
export const GRANT_SQL = `
create table preparation_grants (
 id text primary key, run_id text not null unique references runs(id),
 package_id text not null, package_revision int not null,
 preparation_id text not null, preparation_revision int not null,
 token_hash text not null, claim_token_hash text not null,
 expires_at timestamptz not null, body jsonb not null,
 package_body jsonb not null, preparation_body jsonb not null, run_binding jsonb not null,
 capture_id text, capture_input jsonb,
 foreign key(package_id,package_revision) references packages(id,revision),
 foreign key(preparation_id,preparation_revision) references preparation_snapshots(preparation_id,revision)
);
create table preparation_grant_inputs (
 grant_id text not null references preparation_grants(id), input_id text not null,
 kind text not null, source_key text not null, fingerprint text not null,
 body jsonb not null, bytes bytea not null,
 primary key(grant_id,input_id)
);
create table preparation_grant_state (
 grant_id text primary key references preparation_grants(id),
 revoked_at timestamptz, operations int not null default 0 check(operations between 0 and 64)
);
create table preparation_grant_uses (
 id text primary key, grant_id text not null references preparation_grants(id),
 token_hash text not null, intent jsonb not null, expires_at timestamptz not null,
 unique(grant_id,id)
);
create index preparation_grant_uses_by_grant on preparation_grant_uses(grant_id);
create table preparation_grant_receipts (
 use_id text primary key references preparation_grant_uses(id),
 grant_id text not null references preparation_grants(id),
 request_digest text not null, body jsonb not null,
 foreign key(grant_id,use_id) references preparation_grant_uses(grant_id,id)
);
create table preparation_grant_proposals (
 grant_id text primary key references preparation_grants(id),
 use_id text not null unique references preparation_grant_uses(id),
 sha256 text not null, bytes bytea not null,
 foreign key(grant_id,use_id) references preparation_grant_uses(grant_id,id)
);
create table preparation_grant_guards (
 id bigserial primary key, grant_id text not null references preparation_grants(id),
 use_id text references preparation_grant_uses(id), deadline timestamptz not null,
 foreign key(grant_id,use_id) references preparation_grant_uses(grant_id,id)
);
create function preparation_grant_deadline() returns trigger language plpgsql as $$
begin
 if not exists (
  select 1 from preparation_grants g
  join preparation_grant_state gs on gs.grant_id=g.id
  join runs r on r.id=g.run_id
  join packages p on p.id=g.package_id and p.revision=g.package_revision
  join preparation_heads h on h.package_id=g.package_id
  join preparation_snapshots s on s.preparation_id=h.preparation_id and s.revision=h.revision
  where g.id=NEW.grant_id and gs.revoked_at is null
   and r.status='running' and r.role='requirements-preparer'
   and r.body->>'role'=r.role and r.body->>'stop_requested_at' is null
   and r.body->>'id'=r.id and r.body->>'package_id'=g.package_id
   and r.body->>'status'='running'
   and jsonb_build_object('agent_baseline',r.body->'agent_baseline','runtime',r.body->'runtime','round',r.body->'round')=g.run_binding
   and r.package_id=g.package_id and r.package_revision=g.package_revision
   and r.claim_token_hash=g.claim_token_hash and r.lease_expires_at>clock_timestamp()
   and g.expires_at>clock_timestamp() and NEW.deadline>clock_timestamp()
   and p.status='draft' and p.body=g.package_body
   and p.capture_id is not distinct from g.capture_id
   and not exists(select 1 from packages newer where newer.id=p.id and newer.revision>p.revision)
   and h.preparation_id=g.preparation_id and h.revision=g.preparation_revision
   and s.body=g.preparation_body and s.content_digest=g.body->'base_digest'->>'value'
   and (NEW.use_id is null or exists(select 1 from preparation_grant_uses u where u.id=NEW.use_id and u.grant_id=g.id and u.expires_at>clock_timestamp()))
 ) then raise exception 'preparation grant expired or changed at commit' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger preparation_grant_commit_guard after insert on preparation_grant_guards
 deferrable initially deferred for each row execute function preparation_grant_deadline();
create trigger preparation_grants_immutable before update or delete on preparation_grants for each row execute function preparation_append_only();
create trigger preparation_grant_inputs_immutable before update or delete on preparation_grant_inputs for each row execute function preparation_append_only();
create trigger preparation_grant_uses_immutable before update or delete on preparation_grant_uses for each row execute function preparation_append_only();
create trigger preparation_grant_receipts_immutable before update or delete on preparation_grant_receipts for each row execute function preparation_append_only();
create trigger preparation_grant_proposals_immutable before update or delete on preparation_grant_proposals for each row execute function preparation_append_only();
create trigger preparation_grant_guards_immutable before update or delete on preparation_grant_guards for each row execute function preparation_append_only();
`;
