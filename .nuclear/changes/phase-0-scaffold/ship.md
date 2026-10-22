# Ship: Phase 0 scaffold

**Purpose:** State the merge decision for the scaffold plainly.

**Change slug:** `phase-0-scaffold`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Release identity

- **Change slug:** `phase-0-scaffold`
- **Version / release / baseline:** repository baseline for Phase 1; version 0.0.0
- **PR / commit / artifact:** pull request from `phase-0/scaffold`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Intended release window:** merge after GitHub CI is green and the owner approves.

## Scope and exclusions

- **Included:** toolchain pins, TypeSpec contracts v0, control-plane skeleton, kernel crate, daemon skeleton, Python SDK, CI, license gates, red-team catalog, ADRs 0000 to 0017, threat model and SQA drafts, closed record schemas.
- **Excluded:** product features, persistence, authentication, sandboxing, agent execution, evidence signing, web, desktop and mobile apps.
- **Known non-goals:** any compliance or qualification claim; Control Rod is not yet qualified software.

## Evidence status summary

| Evidence area | Status | Link | Notes |
|---|---|---|---|
| Risk classification | pass | `risk.md` | Standard mode |
| Basis | pass | `basis.md` | Five protected outcomes |
| Trace | pass | `trace.md` | C-006 and C-007 planned; C-008 deferred |
| Verification | pass | `verification.md` | Local suites green; RT-015 shown red then green |
| Dependency / supply chain | pass | `verification.md` | Three license gates pass |
| AI-assisted work checks | pass | `verification.md` | Scope and actions recorded |
| Evidence custody / coupling | gap | `verification.md` | Local evidence coupled on actor, context and resource |
| GitHub CI | planned | pull request checks | Blocks merge |
| Owner review | planned | pull request | Blocks merge |
| Validator | pass | `verification.md#commands-evals-and-reviews` | Packet validates |

## Residual risks and gaps

| Risk / gap | Impact | Disposition | Owner | Recheck trigger |
|---|---|---|---|---|
| Local evidence is coupled to the agent that wrote the code. | A shared mistake could produce both a defect and a passing test. | Accept for a reversible scaffold; GitHub CI and owner review add separation. | Ben Huffer | Any kernel decision function (Phase 1 nuclear subset). |
| One shared digest vector. | Edge cases in escaping or large integers could differ by language. | Mitigate in Phase 1 with RFC 8785 suite vectors. | Ben Huffer | Phase 1 start. |
| No TypeScript digest. | The control plane cannot digest records yet. | Defer to Phase 1. | Ben Huffer | First endpoint that stores a digest. |
| Three spikes and the Flows reuse findings not yet folded into ADRs. | ADRs 0006, 0007, 0009, 0011 and 0016 may change. | Update ADRs before Phase 1. | Ben Huffer | Spike results arriving. |
| Edges defined on both producer and consumer in `records.tsp`. | The two lists can drift. | Fix in the Flows contract work; edges move to the Flow record and deadband becomes typed. | Ben Huffer | Flows spec v0. |
| No vulnerability scan gate. | Known-vulnerable dependencies could merge. | Add in Phase 1. | Ben Huffer | Phase 1 start. |

## Rollback / restore plan

- **Rollback method:** revert the merge commit on `main`.
- **Data migration reversal or restore notes:** not applicable; no data.
- **Feature flag / kill switch:** not applicable.
- **Owner on call:** Ben Huffer.
- **Time to restore estimate:** under 5 minutes.

## Monitoring and post-release checks

| Signal | Threshold / expected behavior | Owner | Where to inspect | Action if bad |
|---|---|---|---|---|
| CI on `main` | All jobs green | Ben Huffer | GitHub Actions | Fix forward or revert |
| Dependabot pull requests | Pass the same gates | Ben Huffer | Pull requests | Reject updates that fail a gate |
| Contract drift | Regenerate-and-diff stays clean | Ben Huffer | CI typescript job | Regenerate and commit |

## Handoff

- **Operator/customer/support notes:** none; no users.
- **Docs/runbook updated:** `README.md`, `AGENTS.md`, `docs/README.md`, ADRs.
- **Communication needed:** none beyond the pull request.
- **Follow-up date:** Phase 1 kickoff.

## Release decision

- **Decision:** merge with residual risk once GitHub CI is green and the owner approves.
- **Decision maker:** Ben Huffer.
- **Rationale:** every local check passes, the one real defect found (open schemas) is fixed and tested, and the change is fully reversible.
- **Conditions attached:** do not describe the kernel as making decisions; do not claim qualification or compliance.

## Apply clearance

| Item | Value |
|---|---|
| Verdict owner | Ben Huffer |
| Apply-clearance owner | Ben Huffer |
| Clearance action | Merge the pull request |
| Preconditions | GitHub CI green; owner review complete |

## Baseline trigger

Merging sets the Phase 1 baseline. Changes to trust surfaces after this point need a change record and the owner's review.

## Required links

- `risk.md`, `basis.md`, `plan.md`, `trace.md`, `verification.md`
- Pull request from `phase-0/scaffold`

## Exit criteria

- The merge decision is stated plainly.
- Evidence status and gaps are visible.
- A rollback path exists.
- Every accepted residual risk has an owner and a recheck trigger.

## Source-lineage note

Ship structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
