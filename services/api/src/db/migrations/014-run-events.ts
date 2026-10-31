// Run stories (workbench plan task 2.6; specification 20). The daemon normalizes each runtime's
// output into events (message, tool call start and end, file change, permission request, usage,
// error, exit); they are kept here in order beside the raw log, append only. Additive.
export const RUN_EVENTS_SQL = `
create table run_events (
  run_id text not null references runs(id),
  seq int not null check (seq >= 1),
  body jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (run_id, seq)
);
create trigger run_events_frozen before update or delete on run_events
  for each row execute function tenancy_append_only();
`;

export const RUN_EVENTS_DOWN_SQL = `
drop table run_events;
delete from schema_migrations where version = '014-run-events';
`;
