// Grants for the command boundary (workbench plan task 1.4; specification 10.1, WB-02).
// The roles themselves are logins created outside migrations (db/roles.ts locally, or by an
// administrator for an external database), because creating roles needs cluster privileges a
// database owner may not have. This migration refuses to run until they exist, then grants:
// controlrod_reader reads everything and writes nothing; controlrod_writer reads and writes the
// application's tables but never the migration record or the lifecycle rules the triggers enforce.
export const ROLES_SQL = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'controlrod_reader')
     or not exists (select 1 from pg_roles where rolname = 'controlrod_writer') then
    raise exception 'Control Rod database roles controlrod_reader and controlrod_writer are not provisioned; see docs/commands/database-roles.md';
  end if;
end $$;
-- Older clusters let every role create objects in public; nothing here should.
revoke create on schema public from public;
grant usage on schema public to controlrod_reader, controlrod_writer;
grant select on all tables in schema public to controlrod_reader;
grant select on all sequences in schema public to controlrod_reader;
grant select, insert, update, delete on all tables in schema public to controlrod_writer;
grant usage, select on all sequences in schema public to controlrod_writer;
revoke insert, update, delete, truncate on schema_migrations, lifecycle_transitions, lifecycle_mutable from controlrod_writer;
-- Tables later migrations create get the same grants; a later rule table must revoke writes itself.
alter default privileges in schema public grant select on tables to controlrod_reader;
alter default privileges in schema public grant select on sequences to controlrod_reader;
alter default privileges in schema public grant select, insert, update, delete on tables to controlrod_writer;
alter default privileges in schema public grant usage, select on sequences to controlrod_writer;
`;

/** Tables the writer must never change. A test checks the writer can change every other table. */
export const WRITER_READ_ONLY_TABLES = ["schema_migrations", "lifecycle_transitions", "lifecycle_mutable"] as const;

/**
 * Reverses ROLES_SQL's record for tests and recovery. The roles are cluster wide and other databases
 * may use them, so they stay; grants on tables that later migrations drop go with those tables.
 */
export const ROLES_DOWN_SQL = `delete from schema_migrations where version = '011-roles';`;
