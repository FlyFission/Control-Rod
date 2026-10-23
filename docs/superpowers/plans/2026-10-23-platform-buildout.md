# Control Rod platform buildout execution plan

> Execute inline using superpowers:executing-plans. User explicitly requested planning followed by execution; no generic plan-approval pause is required. Protected-surface gates remain binding.

**Spec:** [Platform buildout](../specs/2026-10-23-platform-buildout-design.md) and [guided preparation](../specs/2026-10-22-guided-preparation-design.md).
**Record:** `.nuclear/changes/platform-buildout/`.
**Ledger:** `docs/superpowers/execution/2026-10-23-platform-buildout.md` (persistent), mirrored to the skill workspace.

## Global constraints

Never mutate main or another worktree's files. Do not certify another author's commits. No protected edits before exact signature. TypeSpec is authoritative; regenerate. Explicit default-off enrollment; enrolled release stays held until complete Cut B. Preserve 0.1.0 signed bytes, independent checker custody and append-only evidence. Record any decision as `Ruling: decision — reason — cost if wrong`.

## Dependency map

1 → 2 → 3 → 4 → 5 → [signature] 6 → 7 → 8 → 9 → 12 → 13 → 14.
Confinement task 10 may proceed after 2; 9 + 10 → 11. Task 12 manual pilot does not require 11. Existing PR main integration also requires contributor DCO and protected-change approval. A gate remains pending until a real answer arrives; elapsed time is not approval.

## Verification environment

Frozen pnpm install; TypeSpec generation; API/web builds and tests; pinned Go 1.24.7 race tests; Rust/WASM if approved kernel changes; Python/CAD tests for domain changes. Embedded PostgreSQL library aliases are local environment only. Save lengthy outputs with task identifiers and commit hashes. New generated output must match a fresh regeneration. Review the whole branch once with a fresh reviewer after the executed slice; address substantive findings and retest.

## Review focus

Raw parsing before object conversion; closed runner schemas; immutable history/transaction atomicity; CAS races; default-off enrollment and release hold; stable IDs; authentication/daemon separation; canonical subject boundaries; no premature claim of sandboxing, independent trust, deployment or DCO closure.

### Task 1: Reconcile baseline and execution authority

**Requirements:** PB-01.

**Interfaces:** pins and source tree → authoritative execution baseline.

**Files:** `.nuclear/changes/platform-buildout/`, `docs/superpowers/`, root `README.md`.

1. Document main/MVP/proposal ancestry, preserve local copies, create change record, spec, task ledger and architecture exceptions. Update stale top-level status without claiming absent infrastructure.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Read-only ancestry and document link checks; strict packet validator.
4. Commit with agent DCO signoff: `docs: establish controlled platform buildout baseline`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 2: Close raw JSON and runner boundary gaps

**Requirements:** PB-02.

**Interfaces:** TypeSpec Runner contracts → generated daemon wire validation.

**Files:** `spec/api.tsp`, `spec/generated/`, `scripts/`, `daemon/internal/runner/`, `services/api/src/`, API/Go tests.

1. Write refusal tests first. Enforce strict raw JSON in API and daemon. Emit runner JSON schemas from TypeSpec, copy deterministically into an embedded daemon boundary package; validate entire raw jobs/receipts/log replies before projecting. Generate boundary types where useful, retain internal projections only behind validation. Fix complete-wire test fixtures rather than weakening production contracts.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: API malformed payload suite; schema regeneration diff; Go runner race tests; API/web type checks.
4. Commit with agent DCO signoff: `fix: validate raw control-plane and runner wire contracts`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 3: Define preparation contracts and readiness

**Requirements:** PB-03; GP task 1.

**Interfaces:** minor additive TypeSpec → generated schemas and pure readiness.

**Files:** `spec/preparation.tsp`, `spec/main.tsp`, generated schemas, `services/api/src/preparation/readiness.ts`, fixtures.

1. Write relationship/compatibility fixtures first. Add preparation TypeSpec field contracts and closed schemas. Implement pure structural readiness and requirements/content subjects. Keep engineering quantities strings with provenance. Check stable IDs, mappings, context, blockers and technical checks; no authorization in readiness.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Generated schema fixtures and readiness tests; preserve historical digest vectors.
4. Commit with agent DCO signoff: `feat: define preparation records and readiness checks`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 4: Persist immutable preparation with migrations

**Requirements:** PB-03; GP task 2.

**Interfaces:** validated snapshot and package → immutable head/history/event.

**Files:** `services/api/src/db/`, `services/api/src/preparation/store.ts`, database tests.

1. Write database concurrency tests first. Introduce ordered versioned migration registry with checksum/advisory lock. Create append-only snapshots and head/idempotency indexes. Enrollment and edits lock package then head, enforce revision/CAS and append event in same transaction. Test retry, conflicting keys, parallel edits, rollback and restart.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Database integration tests with fresh/existing DBs, concurrency, rollback and migration drift.
4. Commit with agent DCO signoff: `feat: persist immutable preparation revisions`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 5: Deliver manual preparation routes and workbench

**Requirements:** PB-03; GP task 3.

**Interfaces:** store/readiness → human API and resumable UI.

**Files:** `services/api/src/preparation/routes.ts`, app/work integration, `apps/web/src/` and tests.

1. Write API/UI behavior tests first. Add human-only enrollment/get/update/resolution/history endpoints; explicit default-off configuration. Reject daemon mutation, malformed edits, missing/stale ETags and legacy divergent edits. Link captures to packages. Show requirements, criteria, questions, context, plan, owner/actionable blockers, history and digest. Hold every enrolled release until task 7.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: API authorization/retry/race tests, accessible UI tests and built workbench inspection.
4. Commit with agent DCO signoff: `feat: add manual guided preparation workbench`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 6: Add signed requirements confirmation

**Requirements:** PB-04; GP task 4.

**Interfaces:** requirements_digest → distinct passkey-bound confirmation.

**Files:** `kernel/src/preparation.rs`, kernel decision modules, API subjects/auth and tests (protected).

1. GATE: obtain exact human signature before kernel decision edits. Then write refusal tests, implement preparation kernel subject/confirmation transitions; reject wrong actors, replay, expiry and stale requirements. Technical-only edits preserve confirmation.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Kernel/native/WASM and API signed-challenge tests; regenerated bridge.
4. Commit with agent DCO signoff: `feat: bind human confirmation to preparation requirements`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 7: Bind release to full preparation manifest

**Requirements:** PB-04; GP task 5.

**Interfaces:** confirmed preparation + basis → existing release decision.

**Files:** Kernel release decisions, API work/preparation service and tests (protected).

1. After task 6, write transactional release tests. Use existing release authority, complete manifest and one-time challenge; no parallel release endpoint. Ensure legacy signed bytes unchanged, enrolled release cannot downgrade and duplicate release queues exactly one author.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Kernel/API race, stale subject, duplicate release and legacy fixtures.
4. Commit with agent DCO signoff: `feat: release prepared packages against controlled manifests`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 8: Invalidate stale basis throughout run lifecycle

**Requirements:** PB-04; GP task 6.

**Interfaces:** release manifest → claim/completion/acceptance guards.

**Files:** `services/api/src/preparation/basis.ts`, run/decision guards and tests.

1. After task 7, write stale-input/refusal races. Validate current basis at claim, completion and acceptance; quarantine late or stopped output. Resolve infeasible criteria through explicit owner escalation.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Barrier races for package, repository/document revisions and late completions.
4. Commit with agent DCO signoff: `fix: reject execution against stale preparation basis`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 9: Admit per-criterion verification results

**Requirements:** PB-04; GP task 7.

**Interfaces:** criterion/check mappings → complete independent result set.

**Files:** `services/api/src/preparation/results.ts`, typed results, runner/checker admission.

1. After task 8, require typed criterion results and decisive evidence; failed/missing checks block acceptance. Filter checker context and preserve custody. No claim that structural mapping proves correctness.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Result completeness/custody/refusal tests and signed acceptance.
4. Commit with agent DCO signoff: `feat: verify prepared work by controlled criterion`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 10: Enforce runtime confinement

**Requirements:** PB-05.

**Interfaces:** lane/role policy → enforced process capabilities.

**Files:** `daemon/internal/runner/`, runtime configuration and approved policy/test surfaces.

1. Can investigate after task 2, before assisted preparation. Specify owner-local sandbox boundary; implement isolated HOME/env, filesystem grants, secret filtering, egress policy and process lifecycle. Protected policy/red-team/CI edits require signature. Treat Codex/Claude separately.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Negative filesystem/secret/network/lane tests against actual installed runtime; no prompt-only evidence.
4. Commit with agent DCO signoff: `feat: enforce preparation runtime confinement`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 11: Add proposal-only preparation agents

**Requirements:** PB-06; GP task 8.

**Interfaces:** confined runtime + head subject → immutable proposals.

**Files:** Preparation proposals/service, daemon roles, role documents and UI.

1. Requires tasks 9 and 10. Define proposal contracts, lineage, role routing and explicit human adoption. Replay/stopped/stale completions cannot mutate current requirements or clear human blockers. No new model SDK required.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Adversarial proposal lifecycle and real confined-runtime smoke tests.
4. Commit with agent DCO signoff: `feat: propose preparation changes through confined roles`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 12: Rehearse manual pilot and recovery

**Requirements:** PB-07; GP tasks 9,10.

**Interfaces:** Cut B → operator walkthroughs and rollback evidence.

**Files:** Migration/restore scripts, controlled fixtures, walkthroughs and operator docs.

1. Manual branch depends on task 9, not task 11. Exercise a software bugfix and HVAC fixture with source-backed inputs and explicit holds. Rehearse fresh migration, upgrade, backup/restore and downgrade refusal. Separate manual and agent rollout flags.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Persist actual walkthroughs, DB restore comparison, operational instructions and exact artifact inspection.
4. Commit with agent DCO signoff: `test: rehearse controlled preparation pilot and recovery`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 13: Build reproducible domain deliverables

**Requirements:** PB-08.

**Interfaces:** pilot + domain contracts → validated reports/calculations/drawings.

**Files:** example-package/drawing packs, tool adapters, reports, SDK, artifact checks (subplans required).

1. Subprograms in order: pinned tool fetch/atomic publication, authoritative feed adapters, report renderer, calculation SDK, controlled PDF review. Before each, write a bounded interface spec and data/provenance fixtures; never invent engineering inputs. Human signs domain acceptance.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Source digest/units checks, incomplete-input holds, deterministic tool tests and consumer artifact review.
4. Commit with agent DCO signoff: `feat: deepen controlled engineering deliverables`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.

### Task 14: Reconcile and build the larger platform

**Requirements:** PB-09.

**Interfaces:** pilot evidence + missing Platform Plan + ADRs → bounded programs.

**Files:** `docs/adr/`, bounded program specs and approved implementation modules.

1. Gate on recovering/reconciling Platform Plan and choosing deployment/tenant model. Create separate detailed specs in order: authorization/RLS, durable orchestration, signed witnessed evidence, gateway/integrations, distribution/offline. Reuse proved invariants. Do not add infrastructure merely to match an ADR heading.
2. Run the focused test before implementation and record the expected failure. Implement the smallest complete behavior; regenerate contracts where applicable.
3. Verify: Each program has its own risk record, contracts, negative tests, migration/rollback and owner decision.
4. Commit with agent DCO signoff: `docs: specify the next evidenced platform program`. Record exact HEAD, tests, limitations and task status in the ledger.

**Completion contract:** The required evidence above is present, the dependent interface is usable, and unresolved gates are explicitly pending. Documentation-only tasks use link/consistency checks rather than artificial tests.
