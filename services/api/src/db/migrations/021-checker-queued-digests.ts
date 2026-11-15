// The deliverable digest a pre-check was queued against. Recorded once, when the run is queued,
// so a later author revision cannot change which bytes the attempt says it checked.
export const CHECKER_QUEUED_DIGESTS_SQL = `
create table checker_queued_digests (
  run_id text primary key references runs(id),
  deliverable_digest text not null,
  created_at timestamptz not null default now()
);
create trigger checker_queued_digests_frozen before update or delete on checker_queued_digests
  for each row execute function tenancy_append_only();
`;

export const CHECKER_QUEUED_DIGESTS_DOWN_SQL = `
drop table if exists checker_queued_digests;
delete from schema_migrations where version = '021-checker-queued-digests';
`;
