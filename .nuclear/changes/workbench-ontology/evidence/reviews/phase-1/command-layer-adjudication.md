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

## Round 2

Codex confirmed SEC-01, SEC-02 and SEC-04 fixed and SEC-03, SEC-05 to SEC-09 partially fixed, and found ten new issues ([command-layer-codex-round2.md](command-layer-codex-round2.md)).

| Item | Disposition |
|---|---|
| N-01 password text reached owner SQL unchecked | **Fixed**: `provisionRoles` validates 48 hex characters itself (test) |
| N-02 to N-04 (and SEC-03) the guarded client could be bypassed through other methods, multi statement text, comments, query objects or prepared statements | **Fixed**: a command receives an object with `query` only, accepting plain SQL text and an array of values; every statement in the text is checked after comments are stripped. This guards our own command code against mistakes; the logins are the boundary (tests for each form) |
| N-05 startup backfill with two active organizations | **Fixed**: only records with no envelope are resolved (test) |
| N-06 editing merged migration 009 breaks upgrades | **Fixed at the root**: 009 restored byte for byte to the merged version (its SQL backfill stays; the backfill command completes anything missing). New `released.json` lock with a test: a released migration can no longer change. The round trip tests now upgrade through the real startup path (`openDb`) over real signed history, preparation records and grants |
| N-07 secrets file permissions assumed | **Fixed**: `privateFile` creates exclusively with mode 0600, refuses links and other owners, and narrows wider modes; used for `db-roles.json` and `pg.password` (test) |
| N-08 embedded initialisation writes the owner password to a temporary file | **Mitigated**: initialisation runs under umask 077; the file is the dependency's |
| N-09 every startup reset shared cluster passwords | **Fixed**: a login that already accepts its password is left alone (test compares the stored hash) |
| N-10 and SEC-06 existing effective privileges unchecked | **Fixed**: startup audits table write privileges, rule table writes, object and schema ownership, `CREATE` on `public`, and security definer functions (test grants a stray write and sees the refusal) |
| SEC-05 seed organization inserted by migration 009 | **Accepted**: 009 is released and must not change; the seed is reference data, and all later data changes go through commands |
| SEC-07 administrator path untested | **Fixed**: a database opened with administrator issued logins and no provisioning (test) |
| SEC-08 regex checks have limits | **Accepted**: the logins are the boundary; the static rules are a second line, now covering namespace and dynamic imports, other constructors, role changes and transaction control |
| SEC-09 inventory is static | **Accepted**: the inventory says so and labels declared seams |

Also fixed while verifying: an immediate restart could fail with a bare `undefined` while the previous embedded database was still stopping; startup now retries for a few seconds and otherwise says why.

Also verified end to end: the real server starts on a fresh embedded database, creates both logins with a private `db-roles.json`, serves requests, and restarts on the existing database.

## Required links

[Execution ledger](../../../../../../docs/superpowers/execution/2026-10-29-workbench-buildout.md), [database roles](../../../../../../docs/commands/database-roles.md), [command inventory](../../../../../../docs/commands/inventory.md).

## Exit criteria

Every finding has a fix and a test, confirmed by a second independent read before merge.

## Source-lineage note

Review output retained in `command-layer-codex-round1.md` (absolute paths trimmed); dispositions by the authoring session.
