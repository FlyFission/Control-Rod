# Controller grants implementation plan

**Goal:** Establish controller-owned, fenced file-operation admission before connecting a native preparer.
**Architecture:** Immutable grants/input blobs plus bounded, intent-bound begin/finalize permits. All remote file I/O occurs between short database transactions. Controller-retained proposal bytes and a unique grant proposal slot are authoritative.
**Spec:** `docs/superpowers/specs/2026-10-23-controller-grant-protocol-design.md` (revised after adversarial review).
**Stack:** TypeSpec/generated records, current Fastify/pg stack, existing Go daemon; no new dependencies.

## Global constraints

No public issuance, preparer run creation/dispatch, general command/network operation, active policy/red-team/CI or kernel decision edit. The initial requirements-preparer grant projects only current preparation snapshot and original capture/attachment DB inputs; external repository/document providers and technical-preparer issuance remain held. The Go Authority adapter stays disconnected; do not quietly reinterpret its local lock contract. No stored token plaintext or model-supplied custody.

## Task 1 — close legacy role fallbacks

- [x] Reproduce inconsistent role-column/body dispatch and unknown-role Go launch, then add failing heartbeat/completion/requeue boundary tests.
- [x] Implement explicit legacy role/body agreement at claim/start/log/completion/requeue/override; preserve owner stop and expiry controls.
- [x] Run whole API and daemon checks, record results and commit before adding future RunRole values.

## Task 2 — immutable grant/input storage

- [x] Add closed TypeSpec grant, input, intent, permit, result and receipt records plus additive preparer RunRole values; regenerate, never edit generated artifacts.
- [x] Add migration 008: immutable grants/inputs, private mutable grant state, bounded uses, immutable receipts and unique proposal slot, per-response deferred deadline guards. No old migration changes.
- [x] Test first: real running schema-valid requirements-preparer fixture; reject unsupported roles, wrong claim, stale/missing preparation, lane, deadline, duplicate issuance; derive/retain actual bounded snapshot/capture/attachment bytes and hashes.
- [x] Implement private coordinator issuance seam with no route. Begin/finalize/revoke check real package/head/run/claim/capabilities under canonical locks.

## Task 3 — fenced authority and narrow RPC

- [x] Test begin → stop/revoke/edit/claim-turnover/expiry → finalize refusal, and bounded pending-permit/quota enforcement. No transaction remains held between begin/finalize.
- [x] Implement token-only begin/finalize RPC below runner namespace; owner-only revoke path. Browser session and general daemon token do not substitute for a grant token. Closed schema and route body budget apply.
- [x] Test exact retry, altered retry, cross-grant/use, wrong intent/input, canonical-base64/byte budgets, actual retained bytes/secret absence, two concurrent distinct write permits with exactly one admitted proposal.
- [x] Test a global audit lock blocking finalize: bounded timeout rolls back and releases package/run locks. Test deferred expiry at original finalize and exact replay, not only ordinary checks.
- [x] Implement per-ack guard writes, current fences on replay, server-computed custody and immutable request-digest receipts. Record network-timeout ambiguity and pending-permit abandonment limits.

## Task 4 — final integration evidence

- [x] Expand recovery coverage to the new tables; run whole API/web tests, type checks/build/schema reproducibility and Go race/vet/format.
- [x] Obtain one fresh final code review for the completed slice, fix Important findings failed-first in one pass, record all scope dispositions.
- [ ] Commit with DCO, push under existing authority, verify exact PR #6 head and CI, refresh Windows packet. Keep all runtime activation gates open.

## Publication environment regression

CI at `707b26d` passed six jobs but the TypeScript job could not start embedded PG17: its old ICU shared library was absent. Acceptance for the portable test bootstrap: existing explicit/host tools win; otherwise verify the already-recorded official source hash before a private non-root Linux build, reuse verified cached programs, execute the actual fatal-deadline and whole API/restore tests without the local LD_LIBRARY_PATH workaround, then verify latest remote CI. No protected workflow edit or grant-deadline weakening is included. First builds require documented C/parser tools; no system package installation occurs.
