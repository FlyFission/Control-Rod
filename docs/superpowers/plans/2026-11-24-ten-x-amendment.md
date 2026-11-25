# Ten-X Amendment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps named in the 2026-11-24 SWOT/GAP/QoL review so the repo and workflow are 10/10: drained PR queue, landed P0 clusters, a real distribution story, a sustainable evidence lifecycle, decomposed `work.ts`, split docs IA, and kernel tests that match the trust claim.

**Architecture:** Seven phases in dependency order. Phases 1–2 are queue hygiene (merge/rebase/close, then P0 hardening) because everything else conflicts with in-flight PRs. Phases 3–4 are product-level (distribution, evidence lifecycle) and need ADRs and owner sign-off. Phases 5–7 are code-level, each gated by an investigation step their issues already require. Phases 5, 6 and 7 intentionally stop at a scoped follow-up plan gate where decomposition decisions must come from evidence (call graphs, doc link maps, test baselines) rather than from this document.

**Tech Stack:** TypeScript/pnpm/turbo (services, web), Go 1.24.7 (daemon), Rust 1.97.0 (kernel), Python 3.13/uv (tools), mise-pinned toolchain, TypeSpec contracts, GitHub Actions.

**Spec:** `TEN-X-REVIEW-20261124.md` (repo root, untracked) — the SWOT/GAP/QoL review. The plan argues from it; executors read both. Issue references: #98 #115 #117–#133 #136 #160 #167.

## Global Constraints

Copied verbatim from repo sources; every phase implicitly includes these:

- Every change has a record under `.nuclear/changes/<slug>/`, validated with `python -I .ng/tools/ng.py validate --strict-custody <record>` (`.ng` = `FlyFission/nuclear-grade-context-engineering` checked out at the `NUCLEAR_GRADE_SHA` pinned in `.github/workflows/ci.yml`).
- Never edit trust surfaces without the owner's recorded yes: `policies/`, `tests/redteam/`, all of `.github/`, `docs/adr/`, `spec/` major versions, kernel decision functions (`AGENTS.md` rule 2).
- Contracts in `spec/` are the source of truth; regenerate, never hand-edit generated code (`AGENTS.md` rule 3).
- Permissive licenses only (`AGENTS.md` rule 4). No engineering number is typed by a model (`AGENTS.md` rule 5).
- Toolchain pins: node 22, pnpm 10.28.0, rust 1.97.0, go 1.24.7, python 3.13, uv 0.11.32 (`mise.toml`).
- Per-area test commands: API `cd services/api && pnpm test`; web `cd apps/web && pnpm test` (vitest) and `pnpm test:themes:browser` (playwright); daemon `cd daemon && go test ./...`; kernel `cd kernel && cargo test`; everything `pnpm test` (turbo).
- CI must stay green on main at ≤ ~5 min per run; every workflow job bounded with `timeout-minutes` (enforced by `tools/check_workflow_timeouts.py`).
- Pre-alpha honesty rule: README/status claims stay verifiable; anything unverified on a platform says so.

## Review Focus

The five failure modes this program most plausibly hits, with the phase and step that pins each:

1. **Merging #135/#136 regresses run claiming or check sending on main** (both touch `daemon/internal/runner/` recently changed by #169). Pinned by Phase 1 Step 4: targeted runner suites before each merge.
2. **Evidence offload breaks `pnpm cr verify` offline** (records losing their payloads). Pinned by Phase 4 Step 4: verify run against a migrated record.
3. **Docs IA split breaks inbound links** — `.nuclear/changes/*`, AGENTS.md, ADRs and README all cite current `docs/` paths. Pinned by Phase 6 Step 3: dead-link check across repo.
4. **ADR renumber leaves dangling "ADR 0024" references** in #98's change record, `AGENTS.md`, templates and `docs/collaboration.md`. Pinned by Phase 1 Step 8: repo-wide reference sweep before merge.
5. **A release tag overstates platform support** (macOS unverified, live-login WSL2-only). Pinned by Phase 3 Steps 2–3: status/README updated in the same release commit; owner decision recorded.

---

## Phase map (gap score → phase)

| Review gap | Score | Phase |
|---|---|---|
| PR queue drift | 8→10 | 1 |
| P0 trust gaps (#118–#120) | 5→10 | 2 (with 1) |
| Distribution | 4→10 | 3 |
| Evidence lifecycle | — | 4 |
| Code health (`work.ts`) | 7→10 | 5 |
| Docs IA | 6→10 | 6 |
| Kernel test depth | 5→10 | 7 |

---

## Phase 1: PR queue triage

Merge order is conflict-risk-driven: freshest and most isolated first, trust-surface PRs with sign-off, stale kernel PR decided rather than dragged along.

**Files:** `.github/` (templates, via #98), `docs/adr/0024*` and new `docs/adr/0025*`, `AGENTS.md`, `CONTRIBUTING.md`, plus each PR's own tree.

**Interfaces:** Produces a main with all six PRs merged or explicitly closed-with-reason, and one free ADR number for Phase 4.

- [x] **Step 1: Merge #167 (visual reference board, +28/−3).** *(Done 2026-11-24, squash 4040b9fc, merged at pinned head 5569fc4b after three owner sign-off extensions — cbabfdf8 → 3f5e4942 → 179b57e1 → signature commit. The branch grew well past the plan's +28/−3: plant3d scene, SCRAM banner with scoped locks, work-lanes feature (spec/ trust surface, migration 027). Two real bugs found and fixed on its branch: main's #168 restyle left the nav toggle at ~20px (axe target-size; main's CI runs no Playwright), and the thread's migration 027 never updated the tenancy/workbench teardown lists (13 API failures). Browser pass = targeted chromium runs of board-looks 4/4 plus full vitest 781/781 and the API suite 964/964 — the firefox/webkit engines were not run locally; CI's typescript job was green at the merged head.)*
- [x] **Step 2: Rebase and merge #160 (cross-check bench, +9/−11).** Resolve against main; run `uv run --with pyyaml python tools/check_redteam.py` untouched plus the bench's own dry-run from its change record evidence; merge. Closes the manual-benchmark gap the README's research claims imply. *(Done 2026-11-24: clean merge; 48 bench unit tests + full 12-step fixture dry-run green; merged at tested head b0337a6d, squash 14059f5b.)*
- [x] **Step 3: Renumber #98's ADR.** *(Done 2026-11-24: ADR file → 0025-sole-maintainer-sign-off.md; sweep found the number only in the ADR, ADR 0001's Amended-by line and this PR's records — AGENTS/CONTRIBUTING/templates never cited it; evidence patch kept as captured with a basis note; strict-custody green; owner yes recorded in the Signature table; merged, squash 211d9d46. Cosmetic wart: the PR title still said "ADR 0024/DRAFT" in the squash title.)*
- [x] **Step 4: Rebase and merge #136 (`controlrod check` CLI + Action + PR receipt, +11/−17).** *(Done 2026-11-24, squash ce85c6b5, pinned head 928e686f. The predicted check.go collision was two different features on one filename: the check CLI kept check.go, main's RuntimeCheck/CheckRuntimes moved to runtimes_check.go. A second merge was needed after #160 landed (cr.mjs bench/verify/receipt union). The r1-8 record needed repair (broken sandbox.ts link depth; E-04 classification 'pending' not in the validator's vocabulary). The owner chose merge-on-green with E-04 open; the three product answers are recorded as the implementing agent's recommendations, explicitly reopenable. #131/#130 remain open pending the owner-signed wiring of the Action into .github/workflows/.)*
- [x] **Step 5: Rebase and merge #135 (worktree daemon runs, +8/−17).** *(Done 2026-11-24, squash 716cd948, pinned head 269e43f0. The claim path unions checkout custody with main's agent-update reporting and reportedModels; capture-text [workspace:] tags replaced by typed binding per the r1-1 basis, [workflow:] kept; one duplicate prepare bar de-duplicated. The r1-1 record needed release-decision wording, monitoring, a Selected-mode section and evidence-custody tables to pass strict custody — all pre-existing nonconformance. An over-broad .npmrc restore dropped main's update-notifier=false; restored byte-identical to main with an erratum in the ship record. Local verification: API 958, web 826, daemon suites green. The owner's yes recorded in the Signature table with the linked-worktrees-only confirmation.)*
- [x] **Step 6: Decide #115 (O6 quorum, +1/−18, DRAFT).** *(Closed with reason 2026-11-24: quorum attestation confirmed absent from main's kernel — not superseded; owner chose re-plan as a fresh small kernel change record under Phase 7.)*
- [x] **Step 7: Sweep the queue state.** *(Done 2026-11-24: #118/#119 commented as partially landed and left open for Phase 2; #130/#131 commented with the remaining wiring step; #115 closed with the recorded re-plan decision; merged branches deleted and local PR worktrees pruned. The queue is not empty by design: the owner's author threads opened #170–#173 during this phase — outside the program's six planned PRs, untouched.)*
- [x] **Step 8: Confirm Phase 1 exit.** *(Done 2026-11-24 17:45:18Z: main @ 4040b9fc shows the full merge train (#160 → #98 → #135 → #136 → #167) and the final CI run passed all seven jobs — typescript, rust, go, python, licenses, change-records, sbom. One earlier main run (the R1.1 squash) was cancelled as superseded by later pushes, not failed. Note the merge landed via admin bypass per the owner's recorded mechanics decision; branch protection's approving-review requirement remains unsatisfiable for the sole maintainer's own PRs and is a candidate for a Phase 3-era protection change.)*

## Phase 2: P0 daemon hardening (#118/#119 remainder, then #120)

**Files:** `daemon/internal/runner/daemon.go` (concentrates lease, heartbeat, retry, outbox, termination, supervision), its tests, and a recovery-matrix doc under `docs/daemon.md` or `docs/plan/`.

**Interfaces:** Produces the fault-injection test matrix and the evidence that closes or splits #118, #119, #120.

- [x] **Step 1: Audit the #135 remainder against #118.** *(Done 2026-11-24: checkout/branch selections bind as typed `CheckoutBinding` custody and the author/checker runtime+model as typed claim fields (`Run.Runtime`), both landed with #135 and verified by the r1-1 record; the gap is the reasoning selector — parsed in `parseCaptureRuntimeTags` and validated in project prefs but never persisted or carried in the claim — filed as #175, and #118 closed as split with the evidence comment. `docs/status.md`'s stale "deferred to Cycle 2" bullet rewritten to the landed state.)*
- [x] **Step 2: Audit the #135 remainder against #119** (concurrent agents, worktree isolation, merge conflicts): run two daemon claims against the same lease in a test and confirm one wins without evidence loss; check the worktree path is per-run. Record outcomes in a change record. *(Done 2026-11-24: two claims racing for one queued run pinned by `services/api/test/runs.test.ts` "gives a queued run to exactly one of two claims that race for it" — exactly one winner via the budget advisory lock + `for update skip locked`, winner's token completes, loser null; checkout exclusion pinned by `TestASecondAuthorRunOnTheSameCheckoutIsRefusedNotShared` — refused, nothing staged, per-run directories, custody re-claimable. Outcomes recorded in `.nuclear/changes/r2-daemon-recovery-hardening/` and commented on #119, which keeps its stress-suite and merge-conflict-gate scope open.)*
- [x] **Step 3: Trace #120's six behaviors in `daemon/internal/runner/daemon.go`** — lease acquisition, heartbeat, cancellation/SCRAM, process-tree termination, completion retry, outbox replay — and write the recovery matrix (rows: fault; columns: expected behavior, observed, test). One page, `docs/` location per its index conventions. *(Done 2026-11-24: "Recovery matrix" section added to `docs/daemon.md`, one page, fault/expected/observed/test, every row naming a deterministic test by file and test name.)*
- [x] **Step 4: Write the deterministic fault-injection tests** the matrix demands (API restart, network loss, SIGKILL, duplicate completion). Idempotency invariant: no duplicate approvals/completions; orphan cleanup invariant: no surviving agent process after SCRAM. Run `cd daemon && go test ./...`. *(Done 2026-11-24: only the control-plane-restart row lacked a test — added `runs.test.ts` "still holds a claimed run after the control plane restarts on the same database" with the test-only `restartedApp` harness helper; network loss, hanging heartbeat, SIGKILL/orphan sweep, timeout, lost/late completion, duplicate completion, outbox lifecycle, stop and run-gone rows already had deterministic tests, verified green. The PR review's Codex connector caught the restart test replaying a receipt through the same instance that recorded it; fixed so the replay goes through an instance built after the completion. `pnpm test` 1000/1000 (real Postgres), `go test ./...` all packages ok.)*
- [x] **Step 5: Close #120 with the matrix + tests as evidence, or split it** into per-behavior issues if any row fails. Update `docs/status.md`'s "Known failures" only with PR-cited facts. *(Done 2026-11-24: no row fails; #120 closed by PR #176 (squash 95cd1f4e, CI green on all seven jobs) with the matrix+tests evidence comment; "Known failures" needed no new entries — the change added no failure. One pre-existing finding surfaced for the owner: `tools/check_owner_decisions.py` (a by-hand gate, not CI) reports three problems in the author-thread records `visual-reference-board`, `control-room-redesign`, `board-attention`.)*

Erratum (2026-11-24, follow-up commit after #176): the matrix's "Daemon killed with runs alive" row overstated the sweep — `TestAnOrphanGroupIsNeverSignalledByNumber` proves that in process-group containment a restarted daemon can safely reach only the leader and must not signal the group by number, so a run with members it cannot prove gone is never reported process-gone. Row corrected to state the limit, the gap split to #178, and the restart test's replay instance now built after the completion is recorded (matching the record's wording). Recorded in the r2 record's erratum section.

## Phase 3: Distribution (first release)

**Files:** `.github/workflows/release.yml` (new, trust surface), `README.md` "Try it" section, `docs/getting-started.md`, `docs/status.md` platform table, git tag + GitHub release.

**Interfaces:** Produces `v0.1.0` (name TBD by owner) with pinned toolchain claims and honest platform rows.

- [x] **Step 1: Owner decision — release scope and version string.** Record it in a change record (per ADR 0024 decision 5, phone approvals follow release 1; remote daemons move earlier — this release must not promise either). *(Done 2026-11-24: owner said "Take the defaults." Version `v0.1.0`. Notes since `phase0-before-rebase`. The release notes state that phone approvals and remote daemons are not in this tag.)*
- [x] **Step 2: Owner decision — macOS posture.** Either (a) the owner runs one live `pnpm cr start` on macOS and records the evidence (fixing the README row), or (b) the row stays "not yet verified" and the release notes repeat it. No third option; the release must not inherit the ambiguity. *(Done 2026-11-24: option (b). The owner skipped the live check. README row unchanged. The v0.1.0 notes repeat it.)*
- [x] **Step 3: Write the install path down to its floor.** README "Try it" keeps: clone → `mise install` → `pnpm install` → `pnpm cr doctor` → `pnpm cr start`. Anything that can be a `doctor` check becomes one; no new one-line installer before real demand (pre-alpha honesty rule). *(Done 2026-11-24: `mise install` added to the README "Try it" and getting-started "Run it" command blocks — the doctor already covers every troubleshooting condition the docs name (root user, toolchain versions, bundled database libraries, sandbox preflight, agent runtimes), so no new check was needed; `pnpm cr doctor` green from the phase worktree. PR #182, squash 3750b1d8, record `.nuclear/changes/r3-distribution-prep/`.)*
- [x] **Step 4: Tag and release.** Annotated tag on a green main; release notes generated from the `.nuclear/changes/` titles since the last tag (script, output committed as evidence); SBOM artifact attached (ci.yml already builds one). Owner sign-off for the new `.github/workflows/release.yml` before first use. *(Tag and release done 2026-11-24 without the workflow: owner said "Take the defaults," which included cutting the release with `gh` and not writing `.github/`. Annotated tag `v0.1.0` on `2e8f38a0` after ci run 45537886977 passed all seven jobs. Release https://github.com/FlyFission/Control-Rod/releases/tag/v0.1.0. Notes are `.nuclear/changes/r3-v0-1-0/evidence/release-notes.md`. SBOM is that run's artifact. The workflow proposal remains unsigned.)*
- [x] **Step 5: Verify.** Fresh clone at the tag, `mise install`, `pnpm cr doctor` passes, `pnpm cr start` reaches the board. Recorded in the release's change record. *(Done 2026-11-24 on WSL2, not macOS: tag `v0.1.0` at `2e8f38a0`, ci run 45537886977 green, release https://github.com/FlyFission/Control-Rod/releases/tag/v0.1.0. Fresh clone, mise install, doctor pass, Chromium board after the tag's SoftPasskey setup. Screenshot in `.nuclear/changes/r3-v0-1-0/evidence/board-chromium.png`, PR #210.)*
Correction (2026-11-24, PR #184, squash 971379d4): the first version of the notes tool emitted commit subjects and the proposal regenerated notes at dispatch time — neither matches this step's text ("generated from the `.nuclear/changes/` titles … output committed as evidence"). Reviewer feedback named both gaps; `tools/release_notes.py` now lists records first added in the range by their `basis.md` title (a pre-existing record gaining a file is excluded — `--diff-filter=A` selects files, not directories; regression test added), and the proposed workflow attaches the notes file committed at the tag, refusing to run without it. The sign-off question was restated for the corrected bytes. The same PR fixed the flaky capture-dismissal test (vitest's 5000ms default under CI load; given the file's own hook budget; closes #183).

## Phase 4: Evidence lifecycle (ADR)

**Problem:** `.nuclear/changes/` = 1,177 files / 20 MB / 368 log-or-patch payloads in git, growing monotonically with every change (review, Weaknesses).

**Files:** new `docs/adr/0026-evidence-out-of-git.md` (0025 is taken by Phase 1 Step 3), `.ng/tools`-compatible record convention update, `scripts/cr.mjs` verify path, migration note.

**Interfaces:** Produces: digest+manifest in git, payload in an evidence store; `pnpm cr verify` extended to fetch/validate digests.

- [ ] **Step 1: Write the ADR.** Decision: git keeps, per evidence file, the SHA-256 digest and a manifest row; payloads move out of git into a durable, independently retained evidence store (owner-chosen, see Step 2). History is not rewritten: existing records are grandfathered; the convention applies to records created after the ADR's date. Owner sign-off (`docs/adr/`).
- [ ] **Step 2: Pick the payload store by constraint, not preference:** evidence cited by public records must remain retrievable even if this repository or its GitHub org goes away → a durable, independently retained store the owner controls (a separate evidence repository, or object storage with a recorded retention policy). GitHub Actions artifacts may move payloads as transport but are disqualified as the retention copy (default expiry ~90 days). Local-only evidence stays local with digests in git. Record the pick and its retention SLA in the ADR's consequences.
- [ ] **Step 3: Implement the record convention change** (new-record validation accepts manifest+digest entries; strict custody still fails records whose evidence is only git-absent without a manifest). Validate: all existing records still pass; a new-style record passes; a manifest-less record fails.
- [ ] **Step 4: Extend `pnpm cr verify` with three outcomes, never a silent pass.** (a) payload bytes missing → report **incomplete**, naming the manifest row and the store to restore from — never "verified"; (b) restore-and-digest check → fetch/restore the payload, recompute SHA-256, compare the manifest: match = verified; (c) digest mismatch → report **tampered/failed**, never verified. Pin Review Focus 2 with tests for all three. Run `cd services/api && pnpm test` for the verify-bundle suite.
- [ ] **Step 5: Measure the win.** Before/after: `find .nuclear/changes -type f | wc -l` and `du -sh .nuclear` recorded in the change record; projected clone-size growth zero for new records.

## Phase 5: `work.ts` decomposition (#121, P1)

Issue #121 requires investigation before refactoring; this phase stops at the follow-up plan gate rather than inventing module names.

**Files:** `services/api/src/work.ts` (3,516 lines), new domain modules under `services/api/src/` (names come from Step 2), characterization tests.

- [ ] **Step 1: Write characterization tests over `work.ts`'s HTTP endpoints and kernel-authority paths** (its imports span preparation, authority, disclosure, budgets, SCRAM, sandbox, attestation, checker attempts — #121's evidence). Run `cd services/api && pnpm test`; suite green before any split.
- [ ] **Step 2: Produce the dependency/call graph and boundary map** (intake, execution, verification, acceptance per #121) with transactional boundaries marked. One page, committed under `docs/plan/`.
- [ ] **Step 3: Write the follow-up implementation plan** (same format as this file, one task per extracted module, behavior-preserving, no circular dependencies, no duplicated authorization logic) and **stop**. Executing it is a separate program; each extraction PR lands with its characterization suite still green and contracts regenerated, never hand-edited.

## Phase 6: Docs IA split (user vs contributor)

**Files:** `docs/README.md` (the index), moved files under `docs/`, unchanged inbound link sources (`AGENTS.md`, `CONTRIBUTING.md`, README, `.nuclear/changes/*` — Review Focus 3).

- [ ] **Step 1: Partition the tree.** User-facing stays at top level or `docs/using/`: `getting-started.md`, `status.md`, `daemon.md`, `auditing.md`, `guided-preparation.md`, `qa-standards.md`, `reading-comfort.md`, `research/`. Contributor/process moves under `docs/dev/`: `sqa/`, `patterns/`, `plan/`, `superpowers/`, `boundary.md`, `test-database.md`, `collaboration.md` (linked from CONTRIBUTING, which is contributor-facing already), `adr/` stays (referenced from both, sign-off surface).
- [ ] **Step 2: Rewrite `docs/README.md` as two indexes** — "Using Control Rod" and "Building Control Rod" — each entry one line, no orphan pages.
- [ ] **Step 3: Fix every inbound link, then prove it.** `grep -rn "docs/<moved-path>" README.md AGENTS.md CONTRIBUTING.md .nuclear/changes docs/ | grep -v docs/dev/` → zero hits; plus a link check over `docs/` HTML/markdown. This is the gate; the split is wrong if this step cannot reach zero.
- [ ] **Step 4: Uninstall/reset doc.** Add the missing end-user QoL page: what `~/.controlrod` contains, how to reset (stop, remove, restart), one page linked from getting-started. QoL review friction point 7.

## Phase 7: Kernel test depth + red-team cadence

**Files:** `kernel/tests/` (currently 1 file, `preparation.rs`), `tests/redteam/catalog.yaml` (26 cases, most pending), per-case test homes.

**Interfaces:** Consumes the Phase 1 #115 decision. Kernel is a trust surface: every step here needs the owner's recorded yes.

- [ ] **Step 1: Baseline the three decision surfaces** — `decide_preparation` (`kernel/src/preparation.rs:20`), `decide` (`kernel/src/transition.rs:167`), `canonical_sha256` (`kernel/src/digest.rs:42`) — with golden tests for every reachable `Outcome`/`Decision`. Run `cd kernel && cargo test`.
- [ ] **Step 2: Property tests for the invariants the docs claim**: the kernel refuses an agent releasing its own work, accepting its own result, editing its own tests; refusal messages say why. Proptest or hand-rolled generators; determinism asserted.
- [ ] **Step 3: Red-team catalog → test cadence.** For each of the 26 `tests/redteam/catalog.yaml` cases: a test that fails while the way-around is open, or a recorded owner note of why it is out of scope this cycle; the catalog's own `tools/check_redteam.py` stays the format gate. Target: zero "pending" without a recorded reason.
- [ ] **Step 4: Update `docs/status.md`** with what is now actually pinned, replacing "most are still pending" only when the counts support it (numbers from the catalog script output, per AGENTS.md rule 5).

## Cross-cutting (owner-side, not repo commits)

- Prune stale worktrees (`~/projects/Control-Rod-pr{2,3,4}`, the 2026-10-22 review trees, detached-HEAD trees) and reset `~/projects/Control-Rod` to `main` once Phase 1 lands — the 25+-tree sprawl is the workflow's own QoL debt.
- Keep this plan's checkboxes updated per phase; each phase closes with a `.nuclear/changes/<slug>/` record, per Global Constraints.

## Out of scope (tracked, not amended here)

Issues: #124 dashboard, #125 adapter expansion, #126 orchestration, #127's simplification audit (this program is its first deliverable), #128/#132 external custody, #133 offline assets — each needs its own plan once the queue above is drained.

QoL frictions named in the review, deferred with a trigger condition each:

- **Two CLIs** (`pnpm cr` vs `controlrod`) — review friction 2. Fold into ADR 0024 decision 3's "simple by default" pass: one surface owns a task, the other links to it. Trigger: decision 3's UI work starts, since the CLI split and the UI simplification should be designed together.
- **Local-Postgres first-run fragility** — friction 3. Trigger: Phase 3 release support data; if "database won't start" is the top doctor failure, `cr doctor` gains a repair path before anything else.
- **Single-vendor override loop** — friction 4. Trigger: measured on a real single-vendor session; if accept-with-override exceeds one passkey tap plus a reason, it becomes a Phase 2-sized card.
- **Disabled-CLI enablement path** — friction 6; owned by #125, not duplicated here.
