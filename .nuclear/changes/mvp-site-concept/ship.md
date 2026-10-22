# Ship: MVP with the site concept job

**Purpose:** State the merge decision for the MVP plainly.

**Change slug:** `mvp-site-concept`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Release identity

- **Change slug:** `mvp-site-concept`
- **Version / release / baseline:** control plane 0.1.0; CADCraft `e4214f7`
- **PR / commit / artifact:** branch `mvp/site-concept` (PR #3); first build at `35e604a`, build plan fixes N1 to N8 in `d757a0a` to `4f7274d`, the owner's two pre-check decisions, N9 and the N2 addition in `bd9cdf1` to `ed707de`, plus this packet
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Intended release window:** merge after the owner's signatures and the owner's review.

## Scope and exclusions

- **Included:** MVP contracts, kernel floors and binding, control plane, run daemon, web app, General roles, site concept pack, one-command start, scripted agents, license gate update.
- **Excluded:** Cedar policies, transparency log and witnesses, sandbox driver, multi-user, Kandev decision, mobile and desktop, CI jobs for the site pack and end-to-end run.
- **Known non-goals:** any compliance or qualification claim; any claim that site packages are ready to issue without the owner's engineering review.

## Evidence status summary

| Evidence area | Status | Link | Notes |
|---|---|---|---|
| Risk classification | pass | `risk.md` | Standard mode |
| Basis | pass | `basis.md` | Eight protected outcomes |
| Trace | pass | `trace.md` | C-012 planned; C-015 passes by test, real Codex run planned |
| Verification | pass | `verification.md` | E-008 to E-015 cover N1 to N9 and the owner's decisions; E-016 covers the Codex review fixes |
| Dependency / supply chain | pass | `verification.md` | Vulnerability review is a gap |
| AI-assisted work checks | pass | `verification.md` | Scope and actions recorded |
| Evidence custody / coupling | gap | `verification.md` | Coupled on actor, context and resource |
| Owner signature | planned | pull request | Kernel decision functions (including the runtime-identity rule for the pre-check) and license gate |
| First real run | planned | owner's Mac | Claude Code on the owner's subscription |
| Validator | pass | `verification.md#commands-evals-and-reviews` | Packet validates |

## Residual risks and gaps

| Risk / gap | Impact | Disposition | Owner | Recheck trigger |
|---|---|---|---|---|
| County registry ignored and not committed. | A fresh checkout fails one parcel test, and resolving a parcel by ID raises an error where it should refuse. | Resolved in `3f640a1`: the ignore rule exempts `packs/**/src/**/data/`, the file is committed, and the suite passes (39 passed, 1 skipped). | Ben Huffer | Fix commit. |
| Evidence is coupled to the agents that wrote the code. | A shared mistake could produce both a defect and a passing test. | Accept for a single-user, reversible build; owner signature and the first real run add separation. | Ben Huffer | Any change to the floors. |
| Control plane count not rerun by the packet writer. | E-002 rests on the builder's run. | Resolved: rerun on 2026-10-22 against a throwaway system PostgreSQL cluster, 14 passed. CI or the owner can rerun with `TEST_DATABASE_URL`. | Ben Huffer | Before merge. |
| Real Claude Code and Codex untested. | Prompts or tool use may differ from scripted agents. | First run on the owner's Mac. | Ben Huffer | First run. |
| Codex launch flags checked by reading `codex exec --help` (0.163.0), not by a real run; the owner's own Codex config is loaded. | A Codex run could still fail to write `out/` or reach public GIS. | Run one real Codex author and pre-check on the Mac before trusting Codex with real work. | Ben Huffer | First Codex run. |
| Without Codex every pre-check is held, and another Claude model does not count. | Each pre-check needs the owner's passkey-signed override with a reason; scripted fake-only runs need it too. | Accept: no silent fallback. `pnpm cr doctor` says so; the record shows a shared runtime with the signed override. | Ben Huffer | Codex installed and ready. |
| The Codex login check was built without the real Codex 0.163.0 CLI. | If the CLI has no `codex login status`, a signed-out Codex passes the probe and its first run fails. | The probe reads the help text and reports `login_checked: false`; check the office and `pnpm cr doctor` on the Mac. | Ben Huffer | First Codex run. |
| The new unique index `runs_one_live` is created at start. | An existing local database with two live runs for one assignment would fail to start. | None expected (no real runs yet); delete `~/.controlrod` to reset if it happens. | Ben Huffer | First start after merge. |
| A lease of 90 seconds can lapse if the Mac sleeps during a run. | The run is marked lost and its late completion refused; the owner requeues. | Accept for MVP; keeping the Mac awake while runs are active is a Next item. | Ben Huffer | First long run. |
| Stop reaches the daemon on its next log post or heartbeat. | A stop can take up to 30 seconds to land; the UI shows stopping meanwhile. | Accept for MVP. | Ben Huffer | Owner feedback. |
| Claude Code runs have no sandbox from the daemon; print mode has no ACP permission binding (ADR 0020). | The tool allowlist and timeout are the only fences for Claude runs. | Accept for one user on his own Mac; sandbox driver and ACP later. | Ben Huffer | Sandbox driver work. |
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

- **Decision:** merge with residual risk after the owner signs the trust-surface edits and completes review.
- **Decision maker:** Ben Huffer.
- **Rationale:** the floors and record are tested and the live run passed; build plan items N1 to N8 close the custody, independence, serving and origin gaps found before the first real run; kernel and license gate edits need a signature.
- **Conditions attached:** owner signature on `kernel/src/transition.rs` (including the same-provider rule for the pre-check and the signed `OverrideIndependence` act), `kernel/src/decision.rs` and the `Unlicense` addition; one real Codex author and pre-check on the Mac before Codex is trusted; no site package issued without the owner's engineering review.

## Apply clearance

| Item | Value |
|---|---|
| Verdict owner | Ben Huffer |
| Apply-clearance owner | Ben Huffer |
| Clearance action | Sign the trust-surface edits and merge the pull request |
| Preconditions | Owner review complete; owner signatures on the kernel decision functions and the license gate |

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
