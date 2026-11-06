# Phase 1: opening a database restored without privileges (thread on PR #19)

Codex connector thread 4428296423 on `services/api/src/db/index.ts`, still open after merge. Checked against `main` at `d25deae` on 2026-11-06.

| Thread | Decision | Change and evidence |
|---|---|---|
| Reestablish role grants when opening a restored database (P1) | Accepted, fixed | Confirmed: `pg_restore --no-privileges`, as `docs/owner-pilot.md` runs it, keeps the `011-roles` record but none of its grants, so `migrate()` skips them and `openDb` fails on its first command (`permission denied for table object_owners`). `openDb` now runs migration 011's grant statements again after migrating, on every start; they are idempotent and the migration text and checksum are unchanged. Test: `services/api/test/restore-grants.test.ts` strips every grant as such a restore leaves it, reopens through `openDb`, reads, and checks the reader still cannot write. It fails on `main` and passes with the fix. |
| Same thread, second point: a restore opened from a separate home | Accepted, fixed in the procedure | Confirmed in `server.ts`: a new `CONTROLROD_HOME` makes new login passwords, and with `CONTROLROD_DATABASE_URL` set the logins that already exist are not reset, so the second API refuses to start. The drill now copies `db-roles.json` into the restore home first. |

The full dump and restore rehearsal (`preparation-recovery.test.ts`) still needs a PostgreSQL 17 `pg_dump`, which this environment lacks, so it was not run here.
