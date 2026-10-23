# SDD ledger — plan: docs/superpowers/plans/2026-10-23-platform-buildout.md

## Baseline and authority

Integration branch: `buildout/controlled-preparation-20261023`; integration commit `5793e05`. Main remains `40763d4`. Original worktrees and untracked planning copies are preserved.

Ruling: execute inline without another generic plan-approval round — the user explicitly requested the full plan followed by execution — cost if wrong is reversible local work; protected signature and publication gates remain intact.
Ruling: use existing GP field design as the immediate feature authority — the full referenced Platform Plan is absent — cost if wrong is later reconciliation, not an invented platform commitment.
Ruling: task 2 generates complete schema validation at the daemon boundary before lean internal projections — this closes silent field omission without maintaining a second handwritten wire contract — cost if wrong is an additional generator/type integration task.

## Interface preflight

| Producer → consumer | Contract | Finding |
|---|---|---|
| 1 → 2..14 | Pinned baseline and authority | MVP source available; main and signature gates distinct |
| 2 → 3,10 | Strict raw profile/generated boundary | Existing digest parser reusable; Runner API schemas need emission |
| 3 → 4 → 5 | Preparation schema/readiness → immutable store → UI | Follow GP field design; no early release |
| 5 → 6 → 7 | Manual enrollment → signed confirmation → prepared release | Protected edit gate must precede task 6 |
| 7 → 8 → 9 | Manifest → stale checks → criterion results | Each guards execution/acceptance, not just UI |
| 2 → 10; 9+10 → 11 | Strict wire + confinement → proposal roles | Manual path independent of agents |
| 9 → 12 → 13 → 14 | Accepted manual execution → pilot → domain → platform | Later modules require bounded interface specs and missing-plan reconciliation |

Task 1: complete — baseline reconciled, records/spec/plan created, README status qualified; strict packet validation passed. Main and all original worktrees preserved.
Tasks 2–6: completed in the evidence entries below. Tasks 7–14: pending.

## Gates

- Human signature for exact protected implementation at tasks 6 and 10 where relevant.
- Existing PR contributor DCO and non-author protected review before main integration.
- Full Platform Plan and deployment/tenant decisions before task 14 implementation.
- Release/deployment decision after pilot/recovery evidence.

## Task 2 evidence

Task 2: complete — strict API raw parser reuses kernel canonical-profile validation before JSON.parse; daemon validates complete raw TypeSpec-generated Job/LogReply/CompletionReceipt schemas before lean internal projection. Generated schema closure is embedded into the binary. Success without a receipt and mismatched receipt subjects are refused.

RED: `/tmp/controlrod-task2-api-red.log` showed duplicate keys/numeric/unicode violations admitted (17 focused cases); Go RED showed all seven malformed/incomplete responses admitted. Initial broad API invocation also exposed the known local PostgreSQL library requirement; focused profile test is database-independent.
GREEN: API 81 tests; API and web type checks; Go race suite. The initial Go integration fixtures lacked required wire lifecycle/lease fields; completed those fake-server responses instead of relaxing schemas. Schema closure now supports same-document anchors as emitted by TypeSpec. No kernel decision function or protected surface edited.

Ruling: retain lean internal Go projections only behind complete generated raw-schema validation — full contract is enforced before use and no second handwritten schema is introduced — cost if wrong is later generated Go struct adoption.
Ruling: reject undocumented 204 log/completion success — current TypeSpec promises a stop/lease response and a recorded receipt — cost if wrong is incompatibility with older nonconforming servers; main integration must deploy matching server/daemon.

Task 3: next — additive preparation contracts and pure readiness.

## Task 3 evidence

Task 3: complete — additive closed TypeSpec preparation companions and human manual-route contracts; generated API types; pure relationship/readiness checks and separate requirements/content subjects. Existing WorkPackage schema unchanged.

RED: missing preparation module in `/tmp/controlrod-task3-red.log`. GREEN: seven focused schema/readiness tests and API type check. Fixtures cover orphan/duplicate IDs, reciprocal check coverage, human blocker ownership/resolutions, bug context, source pins, criteria compatibility and technical-only subject changes. Raw-profile vectors continue to exercise historical serialization.

Ruling: include mode in the contract projection — classification is a requirements input — cost if wrong is a conservative confirmation invalidation.
Ruling: allocate unique IDs across item kinds within a snapshot — prevents ambiguous resolution/task references — cost if wrong is requiring clearer prefixed user IDs.

Task 4: next — versioned migrations and immutable storage.

## Task 4 evidence

Task 4: complete — transactional checksum-locked migration registry, append-only preparation snapshots/enrollments, current head, one-companion enrollment, immutable revisions and package/criteria projection updates in the same transaction as events. Strong ETag CAS refuses absent preconditions (428) and stale writes (409). Human resolution endpoint records actual session identity; content edits cannot forge actors/resolutions. Retired requirement/criterion IDs cannot be reused.

RED: missing store/migration modules in `/tmp/controlrod-task4-red.log`. GREEN: eight database scenarios including concurrent enrollment/edit, historical bytes, actor custody, rollback on failed event append, new-pool restart, legacy schema upgrade and checksum/future-version refusal. Full API suite: 96 tests; type check passed. First test had an incorrect events-column assumption; corrected to existing JSONB event fields rather than changing production schema.

Ruling: keep migration SQL in compiled TypeScript modules — built server must carry the identical checksummed SQL without a separate asset-copy step — cost if wrong is a later SQL-export tool, not lost runtime migration assets.
Ruling: expose public store operations as complete transactions, adding a Tx variant for intake integration next — public callers cannot accidentally forget atomic events — cost if wrong is a small integration wrapper.

Human authorization received: user explicitly answered “Authorize those specific kernel changes” for tasks 6–9 on 2026-10-23. Exact scope is retained in the basis record. Unrelated protected surfaces and main/DCO/release gates remain pending.

Task 5: next — human routes, intake linkage, workbench and enrollment/release guards.

## Task 5 evidence

Task 5: complete — human-only enrollment/read/edit/resolution/history routes, strong ETags and actionable conflicts; default-off new enrollment; intake automatically creates one system-authored companion per package inside its completion transaction. Capture views and Home retain every package link. Legacy draft edits and release refuse enrolled work, even when the enrollment flag is off. Generated TypeSpec/API types stay authoritative.

The workbench has structured context, requirement/criterion mapping, questions/answers/owners, feasibility escalations, technical tasks/checks, controlled source pins and immutable history. Local edits survive stale-save refusal; reload is explicit. Check mapping is labelled as intent, not results. Enrolled release is absent from UI and refused at both challenge and transaction seams.

RED: four API behavior failures before routes/integration and missing workbench module. GREEN: API 100 tests, web 32 tests, workspace type checks and production builds. Actual built React bundle checked with desktop/mobile Chromium using fixture API responses: no page errors, no horizontal overflow, no release button, stored context rendered. Screenshots and `browser-check.json` are in the Windows verification export. This is final-bundle rendering evidence with fixture data, not a deployed-service claim. Vite preview proxies package paths, so the browser harness served navigation HTML directly from dist; API/static integration is separately covered by real Fastify tests. Build retains the existing >500 kB bundle advisory.

Ruling: automatic intake enrollment carries the system actor — enabling the feature is owner intent, not a human confirmation of agent-generated requirements — cost if wrong is later explicit enrollment policy, never an invented human signature.
Ruling: preserve existing verifier assignment in manual contract edits — the legacy editor already treats that assignment as controlled — cost if wrong is an additional authorized reassignment workflow.
Ruling: format new preparation modules for review while preserving unrelated source formatting — keeps the integration diff focused — cost if wrong is later uniform formatting work.

Task 6: next — signed requirements confirmation; scoped human authorization is recorded.

## Task 6 evidence

Task 6: complete — separate pure kernel confirmation decision, generated WASM bridge, passkey-purpose/subject-bound options and confirmation endpoints, append-only confirmation records and workbench confirmation action. Confirmation never queues an author. Current requirements edits invalidate confirmation; technical-plan/check-mapping edits preserve it. Replay, expiry, redirected package, session-user mismatch, stale displayed/signed subjects, daemon requests and open human blockers refuse.

RED: kernel module absent, four missing-route behavior failures, missing UI action, plus malformed assertion producing a server error. GREEN: native kernel 19 existing tests + preparation floor + WASM-boundary test; API suite 105 and web 33 before the final two focused scenarios; final confirmation/readiness focused set 14 passed; workspace type checks passed. Rebuilt actual WASM using repository-pinned wasm-bindgen-cli 0.2.104 after installing the current toolchain's wasm target. Malformed assertions now yield no consumable challenge in the shared authentication parser rather than 500.

Ruling: criterion-to-check links are technical mapping, excluded from the requirements digest while criterion IDs/text/requirement links remain included — preserves requirements confirmation during technical preparation as specified — cost if wrong is conservative extra reconfirmation if later policy chooses to bind mappings earlier. The full content digest still binds all mapping changes at release.
Ruling: structured confirmation records use the authenticated actor and consumed server challenge, never a client-supplied confirmation flag — no agent proposal or public JSON becomes signature evidence — cost if wrong is a rejected request rather than a bypass.

Task 7: next — manifest-bound release and one-author transaction.

## Task 7 evidence

Task 7: complete — the existing release decision subject now includes the full preparation manifest for enrolled packages; legacy subjects retain their exact shape/digest. The manifest includes package/preparation revisions, full content and requirements digests, actual confirmation ID, ordered basis refs and feature version. Release records the immutable manifest and queues its digest-bound author in one package-locked transaction. Concurrent signed releases produce one manifest and one author. Technical edits preserve requirements confirmation and invalidate pending release challenges.

RED: missing preparation guard and three API release failures. GREEN: Rust workspace (including legacy lifecycle and new enrolled-release floor), regenerated WASM, API 110 and web 33 tests, workspace type checks. Final API release/authorization set passed. Optional Run manifest digest regenerated into TypeSpec schemas and embedded daemon boundary.

Ruling: keep prepared release separately default-off and hold enrolled run claims in this intermediate slice — completion and acceptance barriers are next in dependency order — cost if wrong is a visible queued hold, not execution without guards.
Ruling: only package basis references are supported by the first release verifier; other source kinds hold — no fabricated proof for an unavailable source provider — cost if wrong is additional manual waiting until task 8 providers are implemented.

Task 8: next — controlled basis providers, immutable input capture and run lifecycle barriers.
