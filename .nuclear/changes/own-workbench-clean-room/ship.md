# Ship: own workbench, clean-room Kandev patterns

**Purpose:** State the merge decision plainly.

**Change slug:** `own-workbench-clean-room`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Release identity

- **Change slug:** `own-workbench-clean-room`
- **Version / release / baseline:** ADR 0019 (Proposed); `docs/patterns/kandev.md` as of 2026-10-22
- **PR / commit / artifact:** branch `docs/kandev-patterns` from `mvp/site-concept` at `87d0f79`; pushed, pull request #4
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Intended release window:** merge after the owner's review.

## Scope and exclusions

- **Included:** ADR 0019, `docs/patterns/kandev.md`, `docs/patterns/README.md`, one line in `docs/README.md`, this packet.
- **Excluded:** every Now, Next and Later build item (each gets its own change record), raw notes, screenshots, any legal opinion.
- **Known non-goals:** any use of Kandev in a build or runtime path.

## Evidence status summary

| Evidence area | Status | Link | Notes |
|---|---|---|---|
| Risk classification | pass | `risk.md` | Standard mode |
| Basis | pass | `basis.md` | Six protected outcomes |
| Trace | pass | `trace.md` | C-002 passed after fixes (E-006) and on rerun (E-007); C-007 added for note E |
| Verification | pass | `verification.md` | Scans and validator pass; 24 code claims cited |
| Dependency / supply chain | pass | `verification.md` | No dependency added |
| AI-assisted work checks | pass | `verification.md` | Scope and actions recorded |
| Evidence custody / coupling | gap | `verification.md` | Coupled on actor, context and resource for E-001 to E-005; E-006 partially separated |
| Independent wording check | pass | `verification.md` E-006, E-007 | Findings fixed and rechecked; rerun clean after note E |
| Observed behaviour (note E) | pass | `docs/patterns/kandev.md` section 10; `verification.md` E-008 | Folded in; N9 added, N2 extended |
| Legal review of license reading | planned | ADR 0019 condition 6 | Blocks any commercial release; this merge can proceed without it |
| Owner review | planned | pull request | Blocks merge |
| Validator | pass | `verification.md#commands-evals-and-reviews` | Packet validates |

## Residual risks and gaps

| Risk / gap | Impact | Disposition | Owner | Recheck trigger |
|---|---|---|---|---|
| Evidence is coupled to the agent that wrote the files. | A shared mistake could pass its own checks. | Accept for a reversible doc change; cited lines are reproducible; owner review adds separation. | Ben Huffer | Any change to the pattern file. |
| The wording check was run by an agent of the same family, and paraphrase below the 0.55 similarity threshold is not caught by the scripts. | Copied AGPL wording could slip in through the notes. | Rerun the check on any new note; owner skims section headings against the source on review. | Ben Huffer | On any new note. |
| License facts are the readers' report. | The ADR's context could be wrong in detail. | Lawyer's review before any commercial release or integration. | Ben Huffer | Commercial release planning. |
| Codex behaviour read from docs only. | N1 may need different flags on Ben's Mac. | Confirm with one real Codex run under N1's change record. | Ben Huffer | First Codex run. |
| Observations came from a stand-in agent with no model. | Streaming, timing and output details may differ with real agents. | Accept; section 10.1 states the coverage and the gaps. Closed item: note E has arrived and is folded in. | Ben Huffer | A later observation with a real provider. |
| The E-007 rerun was run by the agent that wrote section 10. | A paraphrase under the threshold could pass its own check. | Accept for a reversible doc change; the scripts are the E-006 reviewer's; owner skims section 10 on review. | Ben Huffer | Any change to section 10. |
| Cited line numbers drift. | Later readers may find different lines. | Claims name commit `87d0f79`. | Ben Huffer | Any change to cited files. |

## Rollback / restore plan

- **Rollback method:** revert the commit or the merge commit.
- **Data migration reversal or restore notes:** not applicable; no data.
- **Feature flag / kill switch:** not applicable.
- **Owner on call:** Ben Huffer.
- **Time to restore estimate:** under 5 minutes.

## Monitoring and post-release checks

| Signal | Threshold / expected behavior | Owner | Where to inspect | Action if bad |
|---|---|---|---|---|
| Wording check | No copied wording | Ben Huffer | this packet, E-006 | Rewrite matches before merge |
| Kandev license | Unchanged AGPL-3.0 with no commercial offer | Ben Huffer | Kandev's license file, read by a reader | Revisit ADR 0019 |

## Handoff

- **Operator/customer/support notes:** none; no users.
- **Docs/runbook updated:** ADR 0019, `docs/patterns/`, `docs/README.md`.
- **Communication needed:** none.
- **Follow-up date:** when N1 (Codex launch flags) starts; each Now item opens its own change record.

## Release decision

- **Decision:** merge with residual risk once the owner approves.
- **Decision maker:** Ben Huffer.
- **Rationale:** documentation only, fully reversible; the decision protects the license plan; the build plan rests on cited code.
- **Conditions attached:** keep the clean-room roles for any further Kandev notes; no Kandev in any build or runtime path.

## Apply clearance

| Item | Value |
|---|---|
| Verdict owner | Ben Huffer |
| Apply-clearance owner | Ben Huffer |
| Clearance action | Merge the pull request |
| Preconditions | Owner review complete |

## Baseline trigger

Merging makes ADR 0019 the rule for how Control Rod uses Kandev. Any change to that use, or any new Kandev pattern note, needs a change record and a wording check.

## Required links

- `risk.md`, `basis.md`, `plan.md`, `trace.md`, `verification.md`
- `docs/adr/0019-own-workbench-clean-room.md`, `docs/patterns/kandev.md`

## Exit criteria

- The merge decision is stated plainly.
- Evidence status and gaps are visible.
- A rollback path exists.
- Every accepted residual risk has an owner and a recheck trigger.

## Source-lineage note

Ship structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
