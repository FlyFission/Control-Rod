# Command layer review adjudication (task 1.4)

Independent security review by Codex (codex-cli 0.166.0, read only) of the first command layer, 2026-10-30: [command-layer-codex-round1.md](command-layer-codex-round1.md). Nine findings: two critical, six major, one minor. Verdict: block. All accepted; the design was reworked around separate logins.

| ID | Finding | Fix | Test |
|---|---|---|---|
| SEC-01 | The reader could switch itself to the writer (`set_config('role', ...)`), because both pools logged in as the owner | `controlrod_reader` and `controlrod_writer` are now their own logins, members of no role, with no special powers; nothing exists to switch to. `db/roles.ts` provisions them locally; an administrator provisions them for an external database | `command-boundary.test.ts` SEC-01: `set_config`, `SET ROLE`, `SET SESSION AUTHORIZATION`, then `RESET ROLE` still leaves the reader unable to write |
| SEC-02 | Connection string options overrode the role setting | Roles are no longer set through options; a smuggled `-c role=` fails because the login is not a member of the target | SEC-02 |
| SEC-03 | A command could keep its client and write outside the transaction | The executor hands each command a guarded view: unusable after the command, no `release`, and transaction control, role or session changes refused | SEC-03: returning the client fails; a leaked view throws; `begin`, `commit`, `set_config('role')` and `release` refused |
| SEC-04 | The writer could rewrite the lifecycle rule tables | Writes revoked on `schema_migrations`, `lifecycle_transitions` and `lifecycle_mutable` | SEC-04: those refuse, and the writer can change every other table, checked by privilege query so a new rule table cannot slip in silently |
| SEC-05 | The startup backfill bypassed commands | Ownership envelopes, Members and credential records for existing data now come from the `migration.backfill-tenancy` command on the writer login; migration 009 keeps only schema and the seed organization | `tenancy.test.ts` migration, preservation helper, inventory row |
| SEC-06 | Existing roles and `PUBLIC` privileges were not checked | Startup verifies both logins (no superuser, role or database creation, replication, row security bypass; can log in; belong to no role) and that each pool is logged in as its role; migration 011 revokes `CREATE` on `public` from `PUBLIC` | SEC-06: making the reader a member of the writer, or giving the writer `CREATEROLE`, is refused; `PUBLIC` cannot create |
| SEC-07 | Startup needed cluster privileges | Role creation moved out of migrations. A local install creates them; an external owner without `CREATEROLE` gets one clear message and the administrator steps in `docs/commands/database-roles.md`; migration 011 refuses until the roles exist | SEC-07: a limited owner is told to set `CONTROLROD_DB_READER_URL` and `CONTROLROD_DB_WRITER_URL` |
| SEC-08 | Static checks were trivially evaded | Now catches namespace and dynamic imports, `Pool` and `Client` constructors, `set_config` role changes and raw transaction control. The logins are the boundary; the static rules are a second line | Eleven synthetic violations, each refused |
| SEC-09 | "Executed" meant textual presence | The inventory says "Reached from" is a static trace, labels commands with no production caller as declared seams, and marks the backfill as startup | `tools/test_generate_command_inventory.py` |

Also verified end to end: the real server starts on a fresh embedded database, creates both logins with a private `db-roles.json`, serves requests, and restarts on the existing database.

## Required links

[Execution ledger](../../../../../../docs/superpowers/execution/2026-10-29-workbench-buildout.md), [database roles](../../../../../../docs/commands/database-roles.md), [command inventory](../../../../../../docs/commands/inventory.md).

## Exit criteria

Every finding has a fix and a test, confirmed by a second independent read before merge.

## Source-lineage note

Review output retained in `command-layer-codex-round1.md` (absolute paths trimmed); dispositions by the authoring session.
