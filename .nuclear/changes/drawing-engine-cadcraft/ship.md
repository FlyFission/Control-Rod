# Ship: CADCraft drawing engine

**Purpose:** State the merge decision for the drawing engine plainly.

**Change slug:** `drawing-engine-cadcraft`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Release identity

- **Change slug:** `drawing-engine-cadcraft`
- **Version / release / baseline:** drawing template `control-rod/sheet-ansi-d` 0.1.0; CADCraft `e4214f7`
- **PR / commit / artifact:** branch `phase-0/drawing-engine`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Intended release window:** merge after the owner's review.

## Scope and exclusions

- **Included:** ADR 0018, the ANSI D template with notes column, the renderer, the example record, nine conformance checks, the pack README.
- **Excluded:** editing customer files, product runtime and sandbox wiring, the CI job, the metric template.
- **Known non-goals:** any claim that CADCraft matches AutoCAD; any compliance or qualification claim.

## Evidence status summary

| Evidence area | Status | Link | Notes |
|---|---|---|---|
| Risk classification | pass | `risk.md` | Standard mode |
| Basis | pass | `basis.md` | Five protected outcomes |
| Trace | pass | `trace.md` | C-007 planned |
| Verification | pass | `verification.md` | 9 of 9 checks pass |
| Dependency / supply chain | pass | `verification.md` | Licenses reviewed; vulnerability review is a gap |
| AI-assisted work checks | pass | `verification.md` | Scope and actions recorded |
| Evidence custody / coupling | gap | `verification.md` | Coupled on actor, context and resource |
| AutoCAD check | planned | `trace.md` | Blocks customer-file editing |
| Owner review | planned | pull request | Blocks merge |
| Validator | pass | `verification.md#commands-evals-and-reviews` | Packet validates |

## Residual risks and gaps

| Risk / gap | Impact | Disposition | Owner | Recheck trigger |
|---|---|---|---|---|
| Evidence is coupled to the agent that wrote the renderer and checks. | A shared mistake could produce both a defect and a passing check. | Accept for a reversible change; two independent reading libraries and owner review add separation. | Ben Huffer | Any change to the renderer or checks. |
| CADCraft-written DWG never opened in AutoCAD. | Customer-facing DWG could need repair. | Customer files read-only; build the real-file corpus with upstream. | Ben Huffer | Corpus available. |
| CADCraft is pre-alpha and changes daily. | An upgrade could change output. | Pin by commit; rerun checks on any upgrade. | Ben Huffer | Any upgrade. |
| Checks not in CI. | Upgrades could skip them. | Add a CI job with the owner's signature. | Ben Huffer | Pinned build cached for CI. |
| No vulnerability review of CADCraft. | A flaw could be reachable by crafted files. | Sandbox, no network, headless only; review before reading customer files at scale. | Ben Huffer | First customer files. |

## Rollback / restore plan

- **Rollback method:** revert the commit or the merge commit.
- **Data migration reversal or restore notes:** not applicable; no data.
- **Feature flag / kill switch:** not applicable.
- **Owner on call:** Ben Huffer.
- **Time to restore estimate:** under 5 minutes.

## Monitoring and post-release checks

| Signal | Threshold / expected behavior | Owner | Where to inspect | Action if bad |
|---|---|---|---|---|
| Conformance checks on upgrade | 9 of 9 pass | Ben Huffer | `evidence.json` | Stay on the pinned commit |
| Upstream gap list | Lossless DWG save and AutoCAD check land | Ben Huffer | CADCraft ROADMAP | Revisit condition 3 |

## Handoff

- **Operator/customer/support notes:** none; no users.
- **Docs/runbook updated:** ADR 0018, `packs/capital-projects/drawings/README.md`.
- **Communication needed:** report the MTEXT extents issue upstream.
- **Follow-up date:** when the CI job or the corpus work starts.

## Release decision

- **Decision:** merge with residual risk once the owner approves.
- **Decision maker:** Ben Huffer.
- **Rationale:** every check passes, the defects found during the work are fixed or guarded, and the change is fully reversible.
- **Conditions attached:** customer files stay read-only; CADCraft stays pinned; do not claim AutoCAD parity.

## Apply clearance

| Item | Value |
|---|---|
| Verdict owner | Ben Huffer |
| Apply-clearance owner | Ben Huffer |
| Clearance action | Merge the pull request |
| Preconditions | Owner review complete |

## Baseline trigger

Merging sets the drawing template and the pinned CADCraft commit as the baseline. Any upgrade or template change needs a change record and a passing conformance run.

## Required links

- `risk.md`, `basis.md`, `plan.md`, `trace.md`, `verification.md`
- `docs/adr/0018-drawing-engine-cadcraft.md`

## Exit criteria

- The merge decision is stated plainly.
- Evidence status and gaps are visible.
- A rollback path exists.
- Every accepted residual risk has an owner and a recheck trigger.

## Source-lineage note

Ship structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
