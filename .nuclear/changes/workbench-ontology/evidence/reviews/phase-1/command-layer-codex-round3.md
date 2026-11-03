Static confirmation only. No files modified or tests run. Paths below are relative to `services/api/`.

| Item | Confirmation | Evidence |
|---|---|---|
| N-01 | **Fixed** | `src/db/roles.ts:82` validates secrets inside `provisionRoles()` before interpolation. Injection regression at `test/command-boundary.test.ts:211`. |
| N-02 | **Fixed** | `src/commands/executor.ts:60-70` exposes only a revocable `query` closure. `valueOf()` returns the facade; raw client methods and connection are absent. |
| N-03 | **Not fixed** | `src/commands/executor.ts:44` strips comment markers inside SQL literals. `c.query("select '--'; commit")` passes inspection but executes `COMMIT`. A subsequent exception cannot roll back earlier writes. |
| N-04 | **Fixed** | `src/commands/executor.ts:62-66` rejects query objects, submittables and name-only prepared executions; only primitive SQL strings and optional value arrays reach pg. |
| N-05 | **Fixed** | `src/tenancy.ts:335-345` filters existing envelopes before resolving ownership. Regression at `test/command-boundary.test.ts:232`. |
| N-06 | **Not fixed completely** | Migration 009 matches merged commit `7bbaa06`. However, 011 still differs from `51ee66d`; databases that applied that version fail at `src/db/migrate.ts:65`. `src/db/migrations/released.json:14` locks the replacement, and `test/migration-preservation.ts:36-41` removes 011 before upgrading, so neither covers that historical case. |
| N-07 | **Not fixed completely** | Exclusive creation and permission narrowing are present at `src/db/roles.ts:32-40`. However, validation, chmod and reading use separate pathname operations. An existing home directory writable by another user allows replacement between those operations; `src/server.ts:20` does not tighten existing directory permissions. |
| N-08 | **Fixed for the reported disclosure, by mitigation** | `src/server.ts:39-43` applies umask 077 throughout embedded initialization, covering the dependency’s temporary password-file creation. |
| N-09 | **Not fixed** | `src/db/roles.ts:93-95` still resets an existing role when the supplied password fails. Two installations with different secrets against one cluster still invalidate each other’s credentials. The test at `test/command-boundary.test.ts:260` supplies identical secrets. |
| N-10 | **Not fixed completely** | `src/db/roles.ts:124-138` audits table privileges and public-schema definer functions, but misses column grants and callable definer functions elsewhere. For example, an existing `GRANT UPDATE(value) ON public.settings TO controlrod_reader` passes the table-level audit while permitting updates. |

| Accepted disposition | Reasonable? | Evidence |
|---|---|---|
| SEC-05, frozen migration exception | **Yes, with corrected scope.** Preserving released SQL is reasonable, but the exception includes ownership and Member backfills, not merely reference-data seeding. | `src/db/migrations/009-tenancy.ts:239`, `:281-292`; subsequent backfill uses the executor at `src/db/index.ts:40`. |
| SEC-08, static regex limitations | **Yes.** Reasonable as a secondary check, subject to fixing the remaining database privilege gaps above. | `test/command-boundary.test.ts:25-29`. |
| SEC-09, static inventory | **Yes.** Its limits and unwired seams are explicit. | `docs/commands/inventory.md:36`, `:51-54`. |

| NEW blocking defect | Severity | Concrete trigger |
|---|---|---|
| None identified beyond the unresolved round 2 findings above. | | |

**Verdict: BLOCK merge pending unresolved round 2 defects, particularly N-03, N-09 and N-10.**