// Database roles for the command boundary (workbench plan task 1.4; specification 10.1, WB-02).
// The API reads through controlrod_reader, which has no write grant on any table, and only the
// command executor connects as controlrod_writer. Migrations run as the connecting owner, the
// migrator. Roles are cluster wide, so creation tolerates a concurrent creator.
export const ROLES_SQL = `
do $$ begin
  create role controlrod_reader nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role controlrod_writer nologin;
exception when duplicate_object then null;
end $$;
grant controlrod_reader, controlrod_writer to current_user;
grant usage on schema public to controlrod_reader, controlrod_writer;
grant select on all tables in schema public to controlrod_reader;
grant select on all sequences in schema public to controlrod_reader;
grant select, insert, update, delete on all tables in schema public to controlrod_writer;
grant usage, select on all sequences in schema public to controlrod_writer;
revoke insert, update, delete on schema_migrations from controlrod_writer;
-- Tables later migrations create get the same grants.
alter default privileges in schema public grant select on tables to controlrod_reader;
alter default privileges in schema public grant select on sequences to controlrod_reader;
alter default privileges in schema public grant select, insert, update, delete on tables to controlrod_writer;
alter default privileges in schema public grant usage, select on sequences to controlrod_writer;
`;

/**
 * Reverses ROLES_SQL's record for tests and recovery. The roles are cluster wide and other databases
 * may use them, so they stay; grants on tables that later migrations drop go with those tables.
 */
export const ROLES_DOWN_SQL = `delete from schema_migrations where version = '011-roles';`;
