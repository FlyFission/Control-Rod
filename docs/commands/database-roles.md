# Database roles

Control Rod reads and writes through two database logins of its own (workbench specification 10.1):

| Login | May | May not |
|---|---|---|
| `controlrod_reader` | Read every application table and sequence | Write anything, lock rows, create objects |
| `controlrod_writer` | Read and write application tables, as the command executor only | Change `schema_migrations` or the lifecycle rule tables, create objects |

Each is a login that belongs to no other role, so neither can switch to a stronger one. Migrations run as the database owner you connect with. Every startup checks both logins and refuses to run if either has superuser, role or database creation, replication or row security bypass powers, belongs to another role, or is not the login a pool actually connected as.

## Local install

Nothing to do. When Control Rod runs its own embedded database, it creates both logins on first start and keeps their passwords in `db-roles.json` in the Control Rod home folder (readable only by you), next to `pg.password`.

## External database

If `CONTROLROD_DATABASE_URL` points at a server where the connecting user may create roles (a superuser or a role with `CREATEROLE`), Control Rod creates the logins itself, with passwords kept in `db-roles.json`.

Otherwise a database administrator creates them once:

```sql
create role controlrod_reader login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '<reader password>';
create role controlrod_writer login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '<writer password>';
```

Then start Control Rod with the owner connection and the two login connections:

```sh
CONTROLROD_DATABASE_URL=postgres://owner:...@host/db \
CONTROLROD_DB_READER_URL=postgres://controlrod_reader:...@host/db \
CONTROLROD_DB_WRITER_URL=postgres://controlrod_writer:...@host/db \
pnpm cr start
```

The first start applies the grants (migration `011-roles`); it refuses to run until both logins exist.

## Required links

[Command inventory](inventory.md), [execution ledger](../superpowers/execution/2026-10-29-workbench-buildout.md).

## Exit criteria

A reader can set up either path from this page alone.

## Source-lineage note

Written for Control Rod from `services/api/src/db/roles.ts` and migration `011-roles`.
