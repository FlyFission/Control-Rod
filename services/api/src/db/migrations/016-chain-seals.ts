// Chain seals (workbench plan task 5.3; specification 11.6). A Member's passkey seal over the event
// chain up to a head: the head must be an event that exists, the signer a Member of the seal's
// organization, and seals are append only. Additive.
export const CHAIN_SEALS_SQL = `
create table chain_seals (
  body jsonb not null,
  id text generated always as (body->>'id') stored primary key,
  org_id text generated always as (body->>'org_id') stored not null references organizations(id),
  head_seq int generated always as ((body->'payload'->>'head_seq')::int) stored not null references events(seq),
  signer_id text generated always as (body->'payload'->>'signer_id') stored not null,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (signer_id, org_id) references members(id, org_id),
  check (body->'payload'->>'org_id' = body->>'org_id')
);
create index chain_seals_head on chain_seals (org_id, head_seq);
create trigger chain_seals_frozen before update or delete on chain_seals
  for each row execute function tenancy_append_only();
`;

/** Reverses 016 for the migration preservation tests: seals only, no other row is touched. */
export const CHAIN_SEALS_DOWN_SQL = `
drop table chain_seals;
delete from schema_migrations where version = '016-chain-seals';
`;
