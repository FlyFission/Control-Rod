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
Tasks 2–9: completed in the evidence entries below. Task 12: local fixture rehearsal complete. Tasks 10/11 remain held; tasks 13/14 are specified future programs with missing owner/source/platform inputs.

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

## Task 8 evidence

Task 8: complete — current-basis checks at release, claim, completion and acceptance; immutable retained source bytes; digest-bound job inputs; checker projection excludes private preparation context. Package/capture/attachment, allowlisted repository and configured document/policy providers verify actual bytes/revisions. Missing, changed or unsupported sources hold. Capture hashing excludes mutable intake routing, while every original attachment is separately pinned. Self-package pins advance atomically with controlled contract edits.

Stopped/stale/late prepared output goes to append-only private quarantine, never deliverables. Retry returns the same refusal or retains one late batch. Signed return appends an unconfirmed companion for the new package revision. Package-before-run locks now cover claims, posts and loss sweeps; source/package rows are locked for release retention and execution barriers.

RED: three absent lifecycle/provider behavior failures; expired completion was accepted before a sweep; a 12,000-item flat task chain exhausted the recursive checker stack. GREEN: API 116 tests and type check, plus final repository/document/late/race/config set. Dependency checking now uses an iterative graph pass. Expired heartbeats cannot revive custody, and completion checks expiry directly. Exact Go boundary race suite after the regenerated Run schema also passed.

Ruling: retain exact immutable source bytes at release and recheck live external sources at each lifecycle barrier — filesystem changes are not PostgreSQL-transactional — cost if wrong is conservative refusal; no claim of a filesystem-wide transaction or continuous watcher.
Ruling: support only public/internal prepared execution until confined lanes are proved — owner-managed provenance reads are not an agent power grant — cost if wrong is an explicit hold for other lanes.
Ruling: keep late/stale bytes in private quarantine outside outputs — preserves custody without contaminating verification — cost if wrong is additional local storage within request/source budgets.

Task 9: next — typed criterion result admission and acceptance.

## Task 9 evidence

Task 9: complete — typed checker submission, controller-bound immutable result set, complete criterion/check relationship admission, actual retained evidence references, artifact integrity in review/acceptance subjects, and result-aware kernel acceptance. The workbench displays checker reports and admitted evidence separately from mapped intent. Normal acceptance needs passing results; a signed exception can accept completed failed checks but cannot waive mandatory checks without completed outcomes/evidence. Private preparer canaries do not enter checker inputs.

RED: nine API result-admission failures, missing coverage UI, evidence tampering still allowed acceptance, and prototype-poisoning HTTP input accepted by the custom parser. GREEN: full API 135 and web 35 tests, production builds/type checks; final result/custody suite 12 passed after adding the private-context canary and controlled return after tampering. Native Rust: 19 lifecycle/digest + 3 preparation + 1 WASM-boundary tests. Framework prototype protection restored by delegating object conversion to Fastify's secure parser after raw canonical-profile validation.

Ruling: distinguish checker-owned CriterionResultSubmission from server-owned CriterionResultSet — the checker cannot predict normalized verification metadata — cost if wrong is an additive contract translation; actual stored bindings remain authoritative.
Ruling: derive prepared evidence custody from assigned runtime/run and retained files, excluding client-supplied custody labels — preserves actual provenance — cost if wrong is later richer tool attestation, not a false claim of external witnessing.
Ruling: evidence refs must name actual checker artifacts outside claim JSON — schema coverage cannot serve as its own proof — cost if wrong is requiring explicit evidence files from checker adapters.
Ruling: treat integrity failures as blocked acceptance while allowing a controlled return/reject — owners need a repair path — cost if wrong is additional forensic review, not acceptance of altered bytes.

Tasks 10/11: runtime confinement and assisted preparation next; task 12 manual pilot/recovery is independently unblocked after 9.

## Task 10 investigation

Task 10: in progress / activation held. Actual host probe passed eight OS canaries using bubblewrap 0.9.0 and namespaces. Installed native versions observed without model calls: Claude 2.1.308, Codex 0.163.0. Current adapters still inherit HOME/general environment; the OS spike does not prove credential/egress boundaries through those clients. Runtime/credential broker interfaces and ordered implementation are now specified in `2026-10-23-runtime-confinement-design.md`; inactive policy proposal and raw probe result are retained in this packet.

Ruling: do not enable preparation roles from a synthetic sandbox probe — native client tool delegation and credential/model egress remain unproved — cost if wrong is delayed assisted preparation, not an unsupported confinement claim.
Task 11: held by task 10. No proposal role/agent powers added.
Ruling: proceed with task 12 manual rehearsal — the master dependency map explicitly separates it from assisted preparation — cost if wrong is re-running a local rehearsal, not deploying agents.

## Task 12 evidence

Task 12: complete for local rehearsal; operational owner pilot remains a release gate. The software bugfix fixture replays the known raw-JSON defect against actual HTTP parsing and verifies no capture mutation, then exercises separate confirmation/release/checker-result/acceptance actions. The HVAC fixture has explicit requester-owned missing-input holds, no author run and no fabricated calculation. Test passkeys and daemon submissions are simulated and are not retroactive project approval or independent engineering evidence.

RED: pre-protocol SQL writer modified an enrolled package. GREEN: writer capability floor refuses enrolled package/run/output/verification/decision writes without protocol support, while legacy unenrolled draft writes remain possible. New transactions declare the protocol but still require kernel/signature/admission permission. A 17.10 pg_dump archive restored into an empty database with identical canonical controlled rows, actual evidence bytes and a valid 15-event chain; the accepted fixture remained readable. The old pre-registry boot SCHEMA still could not write enrolled state after restore.

Full API suite with the external restore tool configured: 140 passed, 15 files; type check passed. Reports are retained in this packet. PostgreSQL source archive matched its official SHA-256; matching client tools built only in local cache. Parser tool dependencies came from signed Ubuntu package metadata. No system package installation or real credential/model call occurred. Default CI does not enforce the optional external-client restore rehearsal; that protected workflow gate remains explicit.

Ruling: add a database writer-capability refusal floor — older pre-registry binaries do not know the migration registry and would otherwise update enrolled state — cost if wrong is refusal of unsupported writes; this marker grants no release authority and does not replace the kernel.
Ruling: keep owner pilot distinct from fixture rehearsal — hardware passkeys, real native runtimes and operational judgment cannot be supplied by a test harness — cost if wrong is an additional owner run, not a false deployment claim.

## Remaining sequence and authority

- Task 10: native credential/tool/egress confinement remains unproved; OS probe and inactive policy proposal ready. Scoped authorization for policies/red-team edits requested asynchronously; no answer is inferred.
- Task 11: held until 10 is proved and active profiles are approved.
- Task 13: domain-deliverable contracts and primary input/tool authorities must close after the owner pilot; no invented engineering fixtures or county/feed choice.
- Task 14: reconcile the external full Platform Plan and deployment/tenant decisions before larger platform implementation.
- Main integration: original PR DCO and non-author protected review remain unresolved; new feature kernel edits have their explicit scoped user authorization in the basis record.

## Tasks 13–14 specification closure

Dedicated domain-deliverable spec/plan now defines tool manifests, offline cache, atomic generation publication, authoritative source adapters, reports, calculation provenance and PDF review with exact proposed seams and failure cases. The larger-platform continuation specification records current ADR exceptions and the tenant/orchestration/witnessing/gateway/distribution boundaries. These are proposed programs, not completed implementation. Required owner pilot, domain/source/tool authorities and the external Platform Plan/deployment decisions remain explicit inputs.

Remote baseline refreshed after implementation: origin/main still 40763d4; origin/mvp/example-package still 8a54ff4. No source drift was silently incorporated and no original worktree was changed.

## Final whole-branch review and one fix pass

A fresh read-only reviewer examined frozen `1d2c466` and reproduced two Important/P1 findings against real PostgreSQL; no Critical finding or deferred Minor was reported. This is a separate agent context using the same model/tool environment, not independent engineering verification.

1. Prepared jobs could read newer dependency output outside their signed basis.
2. Acceptance could succeed after author bytes changed behind their stored hash.

Final: fixed unbound dependency dispatch — `preparation-review-integrity.test.ts` absent-pin refusal, revision drift and retained-byte dispatch RED→GREEN; exact declared revisions, accepted complete output sets and immutable bytes now bind the manifest. Full package-body digest and original capture identity also bind job assembly. Human refresh is explicit and uses CAS.

Final: fixed corrupt author acceptance — the already-issued challenge tamper regression RED→GREEN; acceptance now rehashes and row-locks author bytes and review subjects use observed hashes. Checker dispatch also refuses corrupt author deliverables. The workbench reports corruption and holds acceptance.

The fix pass also extended the real restore fixture with a nonempty retained dependency artifact table; canonical controlled rows/evidence and the 21-event chain survived restore. Final full suite: API 144/144 across 16 files and web 37/37 across 5 files; TypeSpec regeneration, API/web type checks and production builds passed. Rust workspace tests (19 + 3 + 1), clippy with warnings denied, rebuilt WASM boundary, Go race tests and vet passed. The browser check uses the actual rebuilt bundle and fixture API responses, not a deployed service. No Python/CAD implementation changed in this slice.

No second review agent was dispatched: the execution skill specifies one fix pass verified by RED/GREEN and the green whole suite. No unaddressed review finding remains in this pass; operational/authority gates above remain open. Raw review, final commands, restore report and artifact hashes are retained with the packet/export.

## Publication and task 10 continuation

User instruction: “Push then continue”. Reran API 144/144 and web 37/37 on clean `012e8e6`, pushed that exact commit and verified the remote SHA. Created draft [PR #6](https://github.com/FlyFission/Control-Rod/pull/6) with base `docs/kandev-patterns`. All seven jobs passed in [CI run 39998785727](https://github.com/FlyFission/Control-Rod/actions/runs/39998785727). Main integration and previous contributor/non-author review gates remain intact. Publication self-check is retained in the packet.

GitHub's push warning listed 21 default-branch undici alerts. Live dependency tracing found the buildout already resolves undici 7.30.1 through development contract tooling, above every listed patched threshold (latest 7.29.1). Current full pnpm audit reports no known advisories. No unnecessary dependency mutation or default-branch alert dismissal was performed; assessment and raw audit retained.

Task 10 remains in progress: froze actual native executable/help digests; both CLI help/version invocations passed inside the offline boundary. The Claude scripted-provider probe rejected seven exact builtin tool attempts with an empty advertised tool set, then a separate Bash-enabled positive control wrote its marker. No real provider or owner credential was used. The Codex Node launcher initially failed in minimal PATH because Node was absent; resolving the actual native executable corrected startup without relaxing the boundary. The fixture assertion initially double-counted repeated conversation history; deduplicating exact tool-use IDs corrected the evidence calculation. Reproducible source, bounded transcripts and source digests are retained. Ruff checks/format and actual probes passed.

The next task-10 experiment is the actual broker-only MCP route plus grant and credential separation. Current results do not prove tool delegation or native credential/model-egress confinement; assisted preparation and active policy stay held. No policy, red-team, CI or production daemon file changed in this continuation.

## Value review and bounded file broker

The user asked to ensure continuing work adds significant value. Mission decision: implement the missing bounded file capability module rather than extend startup probes or advance infrastructure ahead of domain/owner inputs. See `mission-check.md` and the preparation-file-broker spec/plan. Existing runtime and active profiles remain unchanged.

File broker tasks 1–2: implemented and tested in `daemon/internal/confinement/`. Live authority synchronization encloses scope/lease/capability admission, source rehash or exclusive proposal write, and transactional audit recording. Actual retained directory handles constrain paths; unknown IDs, changed bytes, symlink/traversal/special files and root overlap hold. Failed authority/audit/write removes the new output or reports cleanup failure; no receipt admits partial/failed output. Source/output directory rename tests preserve the original handles; concurrent brokers admit one output writer.

RED: absent read API initially failed compilation; proposal tests then failed behaviorally against a refusal-only stub (no receipt, no output winner). GREEN: exact input bytes and custody, proposal bytes/mode/receipt, authority/expiry/context failures and real filesystem negative cases. Constructor cancellation also failed behaviorally before context admission was added. Full daemon race suite and vet pass; Windows and macOS package compilation pass only. Exact test-case counts, commands and raw results are in `evidence/file-broker/`. Fresh final slice review is pending at this commit.

Ruling: accept caller context in broker construction as well as operations — initial live authority lookup must be cancellable — cost if wrong is one explicit context argument at future internal call sites.
Ruling: proposal file consumers must wait for the successful receipt — exclusive writes plus failure cleanup do not provide atomic directory publication — cost if wrong is requiring a staging/publish layer before any concurrent consumer is introduced. The dedicated output directory cannot be exposed to other writers/consumers during this operation.

The mandatory controller-backed authority is intentionally not replaced by a permissive implementation. Native broker transport, OS process confinement, credential/model egress and approved policy still gate activation. This closes the file-capability subcomponent, not all of task 10.

## File broker final review and one fix pass

Fresh reviewer verdict at `dae5dc6`: two Important defects, no Critical or Minor; the bounded module is useful and its future-integration limits are appropriate. Reviewer reproduced post-callback commit-delay expiry/cancellation and a root-alias race. Root reproduced both RED in checked-in commit-boundary/root-race tests before correcting either.

Final: fixed post-transaction expiry/context — Open/read/write now recheck after authority completion, return no data/receipt on refusal and clean newly created output — commit-boundary regressions RED→GREEN. Committed I/O events remain factual history, not admission.
Final: fixed stale-path root admission — privacy/overlap use descriptor identity and actual parent-descriptor ancestry — the 20,000-attempt real filesystem race RED→GREEN.

Final full daemon race suite passes: confinement 20 top-level + 63 subtests, digest 4 top-level, runner 35 top-level + 9 subtests. Vet/format pass; Windows/macOS package compilation passes only. Evidence and raw failed-first/final results are in `evidence/file-broker/`. No second reviewer or fix pass; no unresolved review finding.

Final: Ruling: native launcher/controller/credential/policy integration remains outside the bounded file module — cost if wrong is additional integration/proof work before assisted preparation.
Final: Ruling: refuse non-Linux runtime use despite cross-platform compilation — cost if wrong is a separate supported platform boundary.
Final: Ruling: retain the dedicated output and receipt admission rule rather than claim atomic/crash-safe publication — cost if wrong is a staging/publication layer before concurrent consumers.
Final: Ruling: rely on trusted supervisor ownership against privileged mounts/hardlinks, administrators, other output writers/consumers and concurrent caller-buffer mutation — cost if wrong is invalid isolation; those conditions must be excluded or separately controlled before integration.
Final: Ruling: nonblocking open plus regular-file validation is not a general device-driver safety proof — cost if wrong is blocking/side effects in an improperly constructed source snapshot; retain the snapshot and OS-boundary gate.
Final: Ruling: require a synchronous transactional live authority with immutable detached grants and honest event recording — cost if wrong is invalid authorization/custody; no permissive provider is shipped.
Final: Ruling: consumers recheck current authority after operation return — cost if wrong is accepting an expired result; post-commit checks do not extend a lease.

Deferred minors: none reported for this slice. Task 10 remains open for real authority/transport/OS process/credential/model-egress integration and protected activation; the file-capability subcomponent is implemented and verified.

## Adversarial gate before controller grants

User requested adversarial review then continuation. Root and a fresh design adversary challenged the proposed network authority before implementation. A fetch-and-trust adapter and remote I/O under held DB locks were rejected. The revised begin/finalize design binds narrow secrets/intents, unique proposal custody, current fences, bounded transactions and explicit commit guards on every acknowledgment. Initial scope is requirements-preparer with DB snapshot/capture/attachment inputs only; no external I/O inside grant transactions, public issuance or native activation. See the controller grant spec/plan and attack record.

Task 1 role boundary: RED real API dispatch/heartbeat/completion/requeue tests and Go launch tests; GREEN five API adversarial cases, full API 149 with restore enabled, type check and full runner race suite. Unknown or inconsistent roles cannot enter existing legacy author/checker behavior. Passive owner stop/expiry controls remain available. Future serialized preparer role values must not activate those paths.

Independent design findings are adopted as requirements and remain unproved until real DB/concurrency/RPC tests: one proposal per grant, finite use quotas, bounded audit-lock waits, every-response deferred deadlines, no external IO under held rows, exact-retry/current-fence behavior, admission-versus-delivery distinction and controller custody after lost acknowledgments. No active credential/model interaction occurred. Controller storage/authority work is next, not claimed complete.

## Controller protocol implementation and final review gate

Implemented immutable grants, exact DB-backed retained inputs, intent-bound permits, one proposal slot, controller-computed proposal custody and current-fence retries. Narrow token-only HTTP RPC authenticates before parsing untrusted JSON. Issuance remains private and no production code creates or dispatches preparer runs. The generated RunRole additions are explicitly held by legacy execution guards; the web only adds display labels.

Self-checks reproduced package identity confusion, base64 regex stack overflow at the actual byte ceiling, and fatal database timeout error masking. All were corrected with behavioral regressions. The source-basis pin test was validated by a temporary controlled rollback followed by restoration; its history is not described as pristine test-first. One isolated preauth command lacked the required shared-library path and supplied no behavior evidence; the complete configured suite passes that case.

Final local suite before fresh code review: API 172 in 21 files; web 37 in five; type checks and production builds pass. Go whole-daemon race/vet passed on the generated roles and legacy guard changes. Real PG17 restore retains proposal bytes, guard sequence and 25-event chain. Raw safe logs and sanitized early-failure descriptions are in `evidence/controller-grants/`. Evidence is coupled implementer-selected local fixture self-check; an independent design reviewer challenged the protocol, and a separate final code review remains required.

Ruling: DB-only requirements projection avoids external file/Git I/O while authority rows are locked; cost is no external contents/freshness authorization in this slice. Ruling: PostgreSQL17 is required for the new grant path's total transaction budget; cost is an explicit database floor rather than weaker timeout guarantees. Ruling: admission is not delivery/consumption proof; cost is unavoidable delayed-response and unknown-outcome recovery semantics. Ruling: bounded per-run storage/uses do not replace deployment-wide retention/issuance quotas. Ruling: unconfirmed lane labels are not disclosure approval; a trusted coordinator/runtime profile remains mandatory before activation. Native transport, existing Go Authority contract reconciliation and OS/credential/model egress proofs remain held, as does protected policy authorization.

## Final controller code review and corrected slice

Frozen code `9c8ea08` received one fresh read-only code review across the full role/controller range since `ded5686`; two Important, one Minor, no Critical. The reviewer independently ran 28 targeted existing tests and reproduced all three findings in a temporary harness; it did not rerun all supplied build/restore/Go evidence. Root accepts the grades and performed one fix pass, without a second reviewer.

Final: fixed incomplete original attachment projection — `refuses issuance when a pinned original attachment is missing` RED→GREEN; both directions of the original attachment reference set must match before per-row hash admission. No partial grant persists.
Final: fixed misleading lost-run custody/requeue — retained-proposal retirement and both rendered preparer-role UI regressions RED→GREEN; records remain retained, unsupported roles receive accurate recovery guidance and no requeue action. Reviewer naturally expired a lease; root's deterministic regression sets the real database lease into the past before sweeping it.
Final: minor (deferred): a newly begun permit can advertise original grant expiry after a trusted writer shortens the actual run lease. Actual finalize/commit guards still enforce the shorter lease; no public preparer shortening path or authorization bypass shown. Persist/return the minimum before native integration.

Post-fix full suite: API 174/174 in 21 files, web 39/39 in five; type checks and production builds pass. Real PG17 restore again preserves proposal bytes, grant guard sequence and a valid 25-event chain. Contract regeneration was identical across 125 files; full daemon race/vet passed earlier on unchanged Go source/generated roles. Build chunk-size advisory remains informational. Strict packet validator and whitespace check are required before commit. All source branch pins were freshly observed unchanged. Current CI will be checked at the pushed head rather than inherited from prior green commits.

Final: Ruling: approved coordinator and disclosure classification remain absent — fixtures confer neither permission nor disclosure approval; hold issuance/native activation — cost if wrong: unauthorized disclosure.
Final: Ruling: native filesystem/credential/process/model egress remains outside implemented scope — keep preparer dispatch off — cost if wrong: process or data escape.
Final: Ruling: remote Go Authority bridge remains disconnected — preserve its synchronous contract until separately reconciled — cost if wrong: stale authorization or stop starvation.
Final: Ruling: external provider/dependency freshness and technical-preparer issuance remain excluded — exact retained DB-only scope stands — cost if wrong: incomplete/stale domain input.
Final: Ruling: proposal meaning/rendering remains untrusted — no automatic application or rendering path added — cost if wrong: unsafe downstream interpretation/injection.
Final: Ruling: owner history/retrieval remains future work — fix present lost-run guidance and preserve custody now; require retrieval before activation — cost if wrong: inaccessible recovery evidence.
Final: Ruling: global issuance quotas/retention remain operational gates — per-run limits do not imply global bounds — cost if wrong: storage accumulation/resource exhaustion.
Final: Ruling: actual owner/passkey pilot, production recovery, main integration and deployment remain unproved — separately verify remote branch CI without elevating fixtures — cost if wrong: unsupported readiness/recovery claims.
Final: Ruling: retain this ongoing worktree and published source/spec/plan — it contains the shared multi-stage programme rather than a disposable completed plan workspace — cost if wrong: modest retained local disk usage; no original worktree is deleted.

All findings and declined judgments are recorded in `evidence/controller-grants/final-review.md`; these explicit local/agent checks are not external engineering witnessing or certification. Publication/export closure follows.

## Remote CI environment regression and portable PG17 tests

Push `707b26d` was verified against the remote branch. CI run40023277793 passed six jobs but TypeScript failed database setup: host server was below PG17 and embedded PG17 needed absent `libicuuc.so.60`. No API database test result is inferred from that failed setup. The full log, raw digest and ANSI-stripping transformation are retained. The protected CI workflow was not changed.

Root traced the discrepancy to the qualifying host-version selection and embedded distribution libraries. The unprotected test launcher now selects working explicit/host/embedded binaries, then builds the already-recorded official SHA-256-pinned PG17.10 source in a private user cache on non-root Linux. No system package installation or production DB change occurs. Minimal test build excludes optional ICU/TLS/compression features; its source/flags and program hashes are retained. The cold local build was exercised with LD_LIBRARY_PATH removed and passed the actual fatal-deadline database regression. Local parser tools were supplied from the previously recorded private extraction; missing Bison/M4 prerequisites were diagnosed before that successful build. Warm reuse and the whole suite/restore are the next evidence gate. Details: `docs/test-database.md`.

Ruling: use a private checksum-pinned source fallback rather than weaken the PG17 deadline or silently skip grant tests — cost if wrong: cold-build time and documented compiler/parser prerequisites; existing working tools remain preferred. Matching native client tools enable the ordinary restore rehearsal. This does not modify or expand protected CI/policy authority.


Portable bootstrap acceptance: cold source build plus real deadline regression GREEN; warm cache reuse without LD_LIBRARY_PATH or the old manual client override passes API174, web39, types, builds and real restore (proposal bytes, guard sequence, 25-event chain). The private source build/provenance is retained; no system package or protected workflow changed. CI verification must now run on the new head. The deferred permit-metadata Minor and all activation gates remain unchanged.
