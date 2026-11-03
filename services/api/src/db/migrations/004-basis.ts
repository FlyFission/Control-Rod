export const BASIS_SQL = `
create table preparation_basis_artifacts (
 manifest_digest text not null references preparation_release_manifests(digest),
 reference text not null,
 kind text not null,
 source_digest text not null,
 bytes_sha256 text not null,
 bytes bytea not null,
 primary key(manifest_digest,reference)
);
create trigger preparation_basis_no_change before update or delete on preparation_basis_artifacts
 for each row execute function preparation_append_only();
create table preparation_quarantine_batches (
 run_id text not null references runs(id),
 idempotency_key text not null,
 reason text not null,
 received_at timestamptz not null default now(),
 primary key(run_id,idempotency_key)
);
create table preparation_quarantined_outputs (
 run_id text not null,
 idempotency_key text not null,
 ordinal int not null,
 name text not null,
 sha256 text not null,
 bytes bytea not null,
 primary key(run_id,idempotency_key,ordinal),
 foreign key(run_id,idempotency_key) references preparation_quarantine_batches(run_id,idempotency_key)
);
create trigger preparation_quarantine_batch_no_change before update or delete on preparation_quarantine_batches
 for each row execute function preparation_append_only();
create trigger preparation_quarantine_no_change before update or delete on preparation_quarantined_outputs
 for each row execute function preparation_append_only();
`;
