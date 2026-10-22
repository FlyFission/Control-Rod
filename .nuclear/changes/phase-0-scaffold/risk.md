# Risk: Phase 0 scaffold

**Purpose:** Sort the Phase 0 scaffold by risk and name the least evidence needed before it merges.

**Change slug:** `phase-0-scaffold`
**Owner:** Ben Huffer, FlyFission Consulting Group
**Date:** 2026-10-22
**Lifecycle phase:** Prove
**Status:** Ready for maintainer review on branch `phase-0/scaffold`.

---

## Change identity

- **Slug:** `phase-0-scaffold`
- **PR / issue:** pull request from `phase-0/scaffold` into `main` (opened with this record)
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Current lifecycle phase:** Prove
- **Summary:** Lay down the polyglot repository skeleton for Control Rod. It adds TypeSpec contracts v0 for the core records, a Fastify control-plane skeleton that validates against the generated schemas, a pure Rust kernel crate with a fail-closed decision type and a canonical digest, a Go daemon skeleton with the same digest, a Python SDK with the same digest, CI for all four languages, license gates, a red-team catalog, eighteen decision records, a threat model draft and an SQA requirements draft.

## Mission anchor

- **Objective:** give every later phase a repository where contracts come first, every language builds and tests in CI, licenses are gated, and the controls Control Rod sells are already applied to its own development.
- **Success criterion (done when):** all four language test suites pass, the generated contracts match the TypeSpec source, the three license gates pass, the red-team catalog check passes, and this packet validates.
- **Non-goals:** no product features, no persistence, no authentication, no agent execution, no sandbox, no evidence signing. Do not claim the kernel decides anything yet; it refuses everything by design.

## Questioning-attitude summary

| Question | Answer |
|---|---|
| What could this scaffold quietly get wrong that later phases inherit? | A digest that differs between languages, open record schemas that accept unknown fields, or a dependency with a copyleft license. Each has a check below. |
| What did testing find that we did not expect? | The record schemas were open: a smuggled `approved_by_agent` field was accepted with HTTP 201. Closed in this change and covered by RT-015 tests. |
| What is assumed rather than shown? | That CI behaves on GitHub as it does locally. CI has not run on GitHub yet; that is a planned check at PR time. |

## Affected configuration items

| Item | Type | Why it matters | Link |
|---|---|---|---|
| TypeSpec records and API | Contract source | Every language generates from it; a wrong field shape propagates everywhere. | `spec/records.tsp`, `spec/api.tsp` |
| Generated JSON Schema and OpenAPI | Generated contract | What the control plane validates against. | `spec/generated/` |
| Control-plane skeleton | Code | First enforcement point for contract validation. | `services/api/` |
| Kernel crate | Code, trust surface | Will hold every decision function; starts fail-closed. | `kernel/src/decision.rs`, `kernel/src/digest.rs` |
| Daemon skeleton and digest | Code | Must agree byte for byte with the kernel digest. | `daemon/internal/digest/` |
| Python SDK digest | Code | Calc tools will digest records in Python. | `sdk/python/src/controlrod/digest.py` |
| CI workflow | Trust surface | Runs every check on every pull request. | `.github/workflows/ci.yml` |
| License gates | Supply-chain control | Keeps copyleft and source-available code out of shipped artifacts. | `tools/license-gate.mjs`, `deny.toml`, go-licenses step in CI |
| Red-team catalog | Trust surface | Every known bypass becomes a test that must keep failing. | `tests/redteam/catalog.yaml` |
| Decision records | Design record | The settled stack and its conditions. | `docs/adr/` |
| Threat model and SQA drafts | Design record | Starting point for later qualification work. | `docs/threat-model.md`, `docs/sqa/` |

## Threshold screen

| Dimension | Low / medium / high | Notes |
|---|---|---|
| Consequence | Medium | No runtime behavior ships, but contracts and digests set patterns every later phase inherits. |
| Reversibility | High | Everything is files on a branch; revert is one command. |
| Detectability | Medium | Drift in contracts or digests is caught by CI and shared test vectors; design errors in records surface later. |
| Exposure | Low | Public repository, pre-alpha, no users, no data. |
| Uncertainty | Medium | Stack choices rest on surveys and two of five spikes so far; three spikes are still running. |
| Dependency trust | Medium | New dependencies in four ecosystems, all pinned and license-gated. |
| AI authority | Medium | An AI agent wrote most of the files under the owner's direction; the owner holds merge. |

## HPI work-mode screen

| Factor | Rating | Notes |
|---|---|---|
| Familiarity | Medium | Standard tooling in each language; the cross-language digest is the unusual part. |
| Time pressure | Low | No deadline on Phase 0. |
| Complexity | Medium | Four toolchains, one workflow file, many small files. |
| Distraction risk | Medium | Long session with parallel research; this packet keeps scope fixed. |

## Selected mode

- **Mode:** Standard
- **Why this mode:** the change sets contracts, a trust-surface workflow and the kernel's first types, and it should model the discipline Control Rod asks of its users.
- **Why lighter mode is not enough:** Quick mode would not record custody of the evidence or the coupling between the agent that wrote the code and the agent that ran its tests.
- **Why heavier mode is not yet required:** no runtime decisions, no data, no users and no irreversible step. The nuclear subset activates for kernel decision functions in Phase 1.

## Activated artifacts

| Artifact | Activated? | Reason | Owner |
|---|---|---|---|
| `basis.md` | yes | Protected outcomes for contracts, digests and licenses. | Ben Huffer |
| `plan.md` | yes | Bounded build order and proof commands. | Ben Huffer |
| `trace.md` | yes | Each claim tied to its control and evidence. | Ben Huffer |
| `verification.md` | yes | Test results, custody and coupling. | Ben Huffer |
| `ship.md` | yes | Merge decision, residual risk, rollback. | Ben Huffer |
| Nuclear subset record | no | Activates for kernel decision functions in Phase 1. | Ben Huffer |

## Immediate evidence obligations

- **Least evidence before build:** the claims in `basis.md`, a shared digest test vector, and the license allowlist.
- **Least evidence before merge:** all suites green locally and on GitHub CI, contracts regenerate without drift, license gates pass, red-team catalog check passes, this packet validates, and the owner reviews the pull request.
- **Independent review needed?** Yes. The owner reviews the pull request; GitHub CI provides an independent execution environment.

## Required links

- Packet: `.nuclear/changes/phase-0-scaffold/`
- `basis.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- Decision records: `docs/adr/`

## Exit criteria

- The mode is justified.
- The activated artifacts are named.
- Risks, assumptions and evidence duties live in this packet rather than in chat.

## Source-lineage note

Packet structure follows nuclear-grade context engineering, whose public source map is at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
