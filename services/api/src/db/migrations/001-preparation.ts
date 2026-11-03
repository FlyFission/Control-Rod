// SQL lives in a compiled module so source and built-server migrations are identical.
export const PREPARATION_SQL = `
create table preparation_snapshots (
  preparation_id text not null,
  revision int not null check (revision >= 0),
  package_id text not null,
  package_revision int not null,
  content_digest text not null unique,
  requirements_digest text not null,
  body jsonb not null,
  created_at timestamptz not null,
  primary key (preparation_id, revision),
  foreign key (package_id, package_revision) references packages(id, revision)
);
create table preparation_heads (
  package_id text primary key,
  preparation_id text not null unique,
  revision int not null,
  foreign key (preparation_id, revision) references preparation_snapshots(preparation_id, revision)
);
create table preparation_enrollments (
  package_id text primary key references preparation_heads(package_id),
  idempotency_key text not null,
  request_digest text not null
);
create index preparation_package_history on preparation_snapshots(package_id, revision desc);
create function preparation_append_only() returns trigger language plpgsql as $$
begin raise exception 'preparation records are append-only'; end $$;
create trigger preparation_no_change before update or delete on preparation_snapshots
  for each row execute function preparation_append_only();
create trigger preparation_enrollment_no_change before update or delete on preparation_enrollments
  for each row execute function preparation_append_only();
`;
