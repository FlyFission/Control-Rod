// Daemon signing keys and attestation nonces (milestone 4). Additive.
// 020 through 022 are left for the checker-attempt migrations.
// Keys are scoped to the organization. A nonce is stored once for a key and
// names the payload hash, so a retry of the same statement is idempotent and
// any other reuse is a replay.
export const RUN_ATTESTATION_SQL = `
create table daemon_signing_keys (
  org_id text not null,
  key_id text not null,
  public_key text not null,
  status text not null check (status in ('active', 'retired')),
  enrolled_by text not null,
  enrolled_at timestamptz not null default now(),
  retired_at timestamptz,
  primary key (org_id, key_id)
);
create table attestation_nonces (
  org_id text not null,
  key_id text not null,
  nonce text not null,
  run_id text not null references runs(id),
  payload_hash text not null,
  primary key (org_id, key_id, nonce),
  foreign key (org_id, key_id) references daemon_signing_keys (org_id, key_id)
);
create index attestation_nonces_by_run on attestation_nonces (run_id);
`;

/** Reverses 023 for the migration preservation tests. */
export const RUN_ATTESTATION_DOWN_SQL = `
drop table if exists attestation_nonces;
drop table if exists daemon_signing_keys;
delete from schema_migrations where version = '023-run-attestation';
`;
