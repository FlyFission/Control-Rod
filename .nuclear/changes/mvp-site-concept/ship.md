# Ship: MVP with the site concept job

**Purpose:** State the merge decision for the MVP plainly.

**Change slug:** `mvp-site-concept`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Release identity

- **Change slug:** `mvp-site-concept`
- **Version / release / baseline:** control plane 0.1.0; CADCraft `e4214f7`
- **PR / commit / artifact:** branch `mvp/site-concept` at `35e604a` plus this packet
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Intended release window:** merge after the county registry fix, the owner's signatures and the owner's review.

## Scope and exclusions

- **Included:** MVP contracts, kernel floors and binding, control plane, run daemon, web app, General roles, site concept pack, one-command start, scripted agents, license gate update.
- **Excluded:** Cedar policies, transparency log and witnesses, sandbox driver, multi-user, Kandev decision, mobile and desktop, CI jobs for the site pack and end-to-end run.
- **Known non-goals:** any compliance or qualification claim; any claim that site packages are ready to issue without the owner's engineering review.

## Evidence status summary

| Evidence area | Status | Link | Notes |
|---|---|---|---|
| Risk classification | pass | `risk.md` | Standard mode |
| Basis | pass | `basis.md` | Seven protected outcomes |
| Trace | gap | `trace.md` | C-010 fails; C-012 planned |
| Verification | gap | `verification.md` | Site pack suite fails on a fresh checkout |
| Dependency / supply chain | pass | `verification.md` | Vulnerability review is a gap |
| AI-assisted work checks | pass | `verification.md` | Scope and actions recorded |
| Evidence custody / coupling | gap | `verification.md` | Coupled on actor, context and resource |
| Owner signature | planned | pull request | Kernel decision functions and license gate |
| First real run | planned | owner's Mac | Claude Code on the owner's subscription |
| Validator | pass | `verification.md#commands-evals-and-reviews` | Packet validates |

## Residual risks and gaps

| Risk / gap | Impact | Disposition | Owner | Recheck trigger |
|---|---|---|---|---|
| County registry ignored and not committed. | A fresh checkout fails one parcel test, and resolving a parcel by ID raises an error where it should refuse. | Blocks merge. Commit `cr_site/data/county_registry.yaml` with `git add -f` or narrow the `data/` ignore rule, then rerun the site pack suite. | Ben Huffer | Fix commit. |
| Evidence is coupled to the agents that wrote the code. | A shared mistake could produce both a defect and a passing test. | Accept for a single-user, reversible build; owner signature and the first real run add separation. | Ben Huffer | Any change to the floors. |
| Control plane count not rerun by the packet writer. | E-002 rests on the builder's run. | Owner or CI reruns with `TEST_DATABASE_URL` before merge. | Ben Huffer | Before merge. |
| Real Claude Code and Codex untested. | Prompts or tool use may differ from scripted agents. | First run on the owner's Mac. | Ben Huffer | First run. |
| Embedded Postgres on Linux needs `libicu60`. | Linux users must set `CONTROLROD_DATABASE_URL` or use a system PostgreSQL. | Documented; macOS expected to work. | Ben Huffer | Owner's first start. |
| Substations and soils are holds; the county parcel registry is empty. | Site packages carry those as holds. | Accept; holds are stated in each package. | Ben Huffer | A verified source is added. |
| Program sizes are owner-set. | Packages wait on owner input; example values exist in tests only. | Accept. | Ben Huffer | First real job. |
| Layout clusters blocks together. | Plans may need manual rearrangement. | Accept for MVP. | Ben Huffer | Next site pack change. |
| UI gaps: the floor is empty with no active runs; a package with unmet dependencies shows "queued" where it should show "waiting on"; "Since you last looked" shows raw event types. | Confusing on first use. | Accept for MVP; fix in the next web change. | Ben Huffer | Next web change. |
| CI has no Postgres service; the API tests start a throwaway cluster from the runner's system PostgreSQL. Site pack and end-to-end are not in CI. | Regressions could land unseen. | Add jobs with the owner's signature on `.github/workflows`. | Ben Huffer | CI work. |
| No vulnerability review. | A flaw could be reachable locally. | Bound to `127.0.0.1`, single user, token file owner read-only. | Ben Huffer | A network listener or second user. |

## Rollback / restore plan

- **Rollback method:** do not merge, or revert the merge commit.
- **Data migration reversal or restore notes:** delete `~/.controlrod` to remove local data.
- **Feature flag / kill switch:** stop `pnpm cr start`; the fake runtime is off unless `CONTROLROD_ALLOW_FAKE=1`.
- **Owner on call:** Ben Huffer.
- **Time to restore estimate:** under 5 minutes.

## Monitoring and post-release checks

| Signal | Threshold / expected behavior | Owner | Where to inspect | Action if bad |
|---|---|---|---|---|
| Event chain | `/events/verify` reports intact | Ben Huffer | Records page | Stop and investigate |
| First real run | Floors hold; pre-check independent | Ben Huffer | Package view and records | Fix before more jobs |
| Public data sources | Answers or a named hold | Ben Huffer | Package outputs | Update the tool |

## Handoff

- **Operator/customer/support notes:** run `pnpm cr doctor`, then `pnpm cr start`, and open `http://localhost:7300`.
- **Docs/runbook updated:** usage in `scripts/cr.mjs`; pack README in `packs/capital-projects/site-concept`.
- **Communication needed:** none.
- **Follow-up date:** after the owner's first real run.

## Release decision

- **Decision:** hold until the county registry is committed and the site pack suite passes, then merge with residual risk after the owner signs the trust-surface edits.
- **Decision maker:** Ben Huffer.
- **Rationale:** the floors and record are tested and the live run passed; one committed-tree defect remains, and kernel and license gate edits need a signature.
- **Conditions attached:** owner signature on `kernel/src/transition.rs`, `kernel/src/decision.rs` and the `Unlicense` addition; no site package issued without the owner's engineering review.

## Apply clearance

| Item | Value |
|---|---|
| Verdict owner | Ben Huffer |
| Apply-clearance owner | Ben Huffer |
| Clearance action | Sign the trust-surface edits and merge the pull request |
| Preconditions | County registry committed; site pack suite passes; control plane suite rerun; owner review complete |

## Baseline trigger

Merging sets the MVP contracts, kernel floors and site concept typical as the baseline. Any change to a floor, contract or typical needs a change record.

## Required links

- `risk.md`, `basis.md`, `plan.md`, `trace.md`, `verification.md`

## Exit criteria

- The merge decision is stated plainly.
- Evidence status and gaps are visible.
- A rollback path exists.
- Every accepted residual risk has an owner and a recheck trigger.

## Source-lineage note

Ship structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
