# Preparation pilot, backup and recovery

This is an owner-local pre-alpha rehearsal procedure. Evidence in `.nuclear/changes/platform-buildout/evidence/` uses an ephemeral fixture database, virtual passkeys and a simulated daemon. It does not record an operational owner pilot, independent engineering verification or production deployment.

## Rollout sequence

1. Keep new enrollment and prepared release off while upgrading. Back up the database and owner configuration; protect backup files because they include credential public keys, session hashes, captured work and evidence. Provider/daemon configuration outside PostgreSQL needs its own protected copy. Never publish credentials in a change packet.
2. Run the new binary against a disposable restored copy first. The ordered migration registry verifies checksums and refuses unknown future versions. Inspect the preparation history, decisions, evidence bytes and `/events/verify` result.
3. Enable `CONTROLROD_GUIDED_PREPARATION=1` for manual enrollment only. Confirm actual owner passkey behavior in the browser. Resolve human blockers, inspect requirements versus approach, sources and verification mappings. Mapping is not a passing result.
4. Enable `CONTROLROD_PREPARED_RELEASE=1` only for the agreed manual pilot after review. A software bugfix fixture should reach acceptance only after separate requirements confirmation, manifest release, author/checker custody, typed results and signed acceptance. An HVAC fixture with missing loads/weather/code sources must remain held; no engineering quantities are fabricated to complete it.
5. Keep assisted preparation disabled. Native runtime confinement, credential handling, model/tool egress and role/lane proof remain separate gates. The synthetic OS probe is not a native client proof.
6. Monitor stale-basis refusals, expired claims, failed result admission, quarantine growth, missing evidence, migration drift and operator time. Revisit the pilot decision with the owner before expansion.

## Database backup and restore

Use PostgreSQL client tools compatible with the server major version. Configure the connection through a protected service/password file or environment; do not put credentials into a command body, PR or report. Stop dispatch during an operational recovery. A custom archive made by `pg_dump --format=custom --no-owner --no-privileges --file <private-backup>` is a consistent database snapshot. Record its SHA-256 and the exact tool/server versions.

Restore into a new, empty database with `pg_restore --exit-on-error --no-owner --no-privileges --dbname <new-database> <private-backup>`. Do not restore over a live working database or apply an older schema. Start the same supported binary against the restored copy with dispatch/release flags off. Validate record digests, current heads, confirmations/manifests/results, actual retained evidence bytes and event-chain continuity before switching the owner-local instance. Review queued/running jobs and daemon outboxes; do not treat stale claims as current. The server rotates its daemon token at startup; expired heartbeats/completions cannot revive custody.

Do not equate a successful restore with an operational rollback decision. Keep the original database and binary available until the owner has checked the restored artifact. Do not downgrade enrolled work by deleting companions, editing old signatures or turning off the enrollment flag.

## Older writer refusal

Migration `006-compatibility` adds a writer-capability floor for enrolled packages, runs, outputs, verifications and decisions. Supported transactions declare preparation protocol `0.1.0` locally; unaware writers are refused before modifying enrolled state. The marker grants no lifecycle decision right: the kernel, signed subjects and admission checks still decide. Legacy unenrolled drafts remain compatible. Newer registry-aware binaries also refuse unknown database migrations at startup.

A pre-registry binary can still serve reads and execute its old idempotent bootstrap SQL, but its prepared writes are rejected by the retained database floor. Do not intentionally operate that unsupported combination. The rehearsal executes that old bootstrap and verifies refusal rather than assuming an older binary knows new tables.

## Reproduce the rehearsal

Run `pnpm --filter @control-rod/api exec vitest run test/preparation-pilot.test.ts test/preparation-walkthrough.test.ts` for default compatibility and hold scenarios. Set `CONTROLROD_TEST_PG_BIN` to a directory containing matching `pg_dump` and `pg_restore`, then run `pnpm --filter @control-rod/api exec vitest run test/preparation-recovery.test.ts`. `CONTROLROD_REHEARSAL_REPORT` and `CONTROLROD_WALKTHROUGH_REPORT` optionally retain JSON evidence.

The matching client tools were built locally from official PostgreSQL 17.10 source, with the published archive SHA-256 verified. That cache build disables TLS/compression for an isolated loopback fixture; it is not the recommended client configuration for remote operational backups. The backup fixture is destroyed after its restore comparison. The optional restore test requires external client tools and is not silently represented as a CI-enforced production gate. CI activation is a protected workflow change requiring its own authority.

## Controller grant custody

The new grant protocol requires PostgreSQL 17+ for its server-enforced total transaction budget. Backups also contain immutable grants/input bytes, uses, receipts, the unique proposal slot and per-response deadline guards. Grant/use credentials are retained only as hashes and cannot be recovered from the backup. Restoring rows is not permission to renew expired deadlines or revive an old claim. Keep preparation dispatch held; resume only through a fresh approved attempt and current authority. Controller-retained proposal bytes/receipts remain historical custody even if an acknowledgment was lost and a broker cleaned its local file. The rehearsal compares those bytes and the guard sequence after restore; it is not an operational owner recovery approval.
