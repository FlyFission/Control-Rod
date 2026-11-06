# Basis: own workbench, clean-room Kandev patterns

**Purpose:** State what must stay true when Control Rod learns from an AGPL project.

**Change slug:** `own-workbench-clean-room`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `own-workbench-clean-room`
- **Related risk record:** `risk.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Decision this basis supports:** whether ADR 0019 and the Kandev pattern file can merge as the way Control Rod uses Kandev's ideas, and whether the build plan's Now list is sound.

## Mission / need

Kandev solves many workbench problems Control Rod faces, but it is AGPL-3.0 and lacks the controls that define Control Rod. Ben needs a clear decision on how to use it, a record of the ideas worth taking, and a short, checked list of what to fix before his first real run.

## Protected outcomes

| Protected outcome | Why it matters | Evidence needed |
|---|---|---|
| No Kandev code, configuration, schema or wording enters the repository. | Apache-2.0 core and private packs (ADR 0002, AGENTS rule 4). | Builder worked from notes only; no code blocks; independent wording check. |
| The decision and its options are stated, and license conclusions are marked as needing a lawyer. | An engineering record must not read as legal advice. | ADR 0019 content review. |
| Every claim about Control Rod's code is checked and cited. | The build plan steers the first real build. | File and line for each claim; status per claim. |
| Now holds confirmed gaps only, each with files and a trust-surface flag. | Ben's first run should fix real problems first. | Build plan review against the claims table. |
| No trust surface is edited. | AGENTS rule 2. | Diff of changed paths. |
| Plain style: no em dashes, no "X, not Y" constructions. | House style. | Text scan. |

## Unacceptable outcomes

| Unacceptable outcome | Consequence | Prevent / detect / mitigate |
|---|---|---|
| A sentence from Kandev's docs is merged. | AGPL text in an Apache-2.0 repository. | Notes written under a no-copy brief; builder rewrote all prose; independent wording check before merge. |
| A false claim about our code drives the first build. | Wasted work or a missed defect. | Each claim checked at file and line on commit `87d0f79`; wrong and partly true claims marked. |
| The ADR is read as a legal opinion. | Business decisions made on an engineer's reading. | ADR condition 6 requires a lawyer's review. |
| Kandev appears in a build or runtime path. | License obligations reach Control Rod. | ADR decision and condition 5. |

## Assumptions, constraints, and invalidation triggers

| Assumption / constraint | Basis or source | Invalidation trigger | Owner |
|---|---|---|---|
| Kandev and its docs are AGPL-3.0, with no commercial license and about 77 copyright holders. | Readers' report; not re-checked by the builder under the clean-room rule. | A lawyer's review, or a license change upstream. | Ben Huffer |
| The notes contain no copied wording. | Readers' brief forbids it; the builder rewrote all prose. | The independent wording check finds a match. | Ben Huffer |
| Observations in note E come from Kandev 0.97.0 driven by a stand-in agent with no model; streaming, timing and output quality may differ with real agents. | Note file E, section 0 and coverage list. | A later observation with a real provider, or a Kandev release that changes the behaviour. | Ben Huffer |
| `codex exec` is read-only by default and refuses to run outside a Git repository without a flag. | OpenAI non-interactive docs, fetched 2026-10-22. | A Codex release that changes defaults, or Ben's own Codex config. | Ben Huffer |
| Line numbers match commit `87d0f79` on the MVP branch. | Read in this session. | Any later commit to the cited files. | Ben Huffer |

## Grounding status

| Claim area | Grounded in | Status |
|---|---|---|
| Kandev behaviour (documented) | Note files A to D (2026-10-22) | pass |
| Kandev behaviour (as run) | Note file E: Kandev 0.97.0 run unmodified with a stand-in agent (2026-10-22) | pass, within the coverage E lists |
| Our code | MVP branch at `87d0f79` | pass |
| Codex defaults | OpenAI non-interactive mode docs | pass |
| License facts | Readers' report | gap (lawyer to confirm) |
| No copied wording | Independent check, rerun after E was folded in | pass after fixes (E-006); rerun clean (E-007) |

## Interfaces and trust boundaries

- **Internal interfaces affected:** none; documentation only.
- **External services/APIs affected:** none.
- **Data classes affected:** none.
- **Human approval boundaries:** Ben merges; a lawyer confirms license conclusions before any commercial release.
- **AI/model/tool authority boundaries:** the agent wrote docs on a branch in a separate worktree, committed, and pushed the branch to pull request #4 on the owner's instruction; it did not open Kandev's docs or source, did not copy screenshots into the repository, and did not edit trust surfaces.

## Dependency / model / supplier intended use

| Dependency/model/service | Intended use | Consequence if wrong/unavailable/compromised | Evidence or compensating control | Revalidation trigger |
|---|---|---|---|---|
| Kandev (AGPL-3.0) | Source of ideas only, through notes | License taint if wording or code is copied | Clean-room roles; wording check | Any new pattern note |
| Clean-room note files A to E | Only input to the pattern file | Copied wording, or wrong facts about Kandev | Brief forbids copying; builder rewrote; wording check rerun after each fold-in | Any note revision or new note |

## Derived requirements or claims

| ID | Requirement / claim | Basis | Design feature or control | Evidence planned |
|---|---|---|---|---|
| C-001 | ADR 0019 records the decision, the six options with consequences, the clean-room procedure, personal use of Kandev, and that license conclusions need a lawyer. | Protected outcome 2 | ADR sections Decision, Conditions, Alternatives | Content review |
| C-002 | The pattern file and ADR contain ideas in our own words only: no Kandev code, config, schema or copied text. | Protected outcome 1 | Clean-room roles; provenance header | Code-block scan; builder attestation; independent wording check |
| C-003 | Every claim the notes make about our code is checked, cited and marked confirmed, partly true or wrong. | Protected outcome 3 | Claims table K01 to K24 | Spot re-check of cited lines |
| C-004 | Now holds confirmed gaps only, each with files and a trust-surface flag. | Protected outcome 4 | Now table N1 to N8 | Cross-check against the claims table |
| C-005 | No trust surface is edited. | Protected outcome 5 | Docs-only change | `git diff --name-only` |
| C-006 | No em dashes and no "X, not Y" constructions. | Protected outcome 6 | Style rewrite | Text scan plus read-through |
| C-007 | Section 10 folds in note E: what the observer could and could not run, what running added to P01 to P73, new patterns from P74 on, the problems it hit; the build plan changes a priority only with a stated reason, and every new code claim is cited. | Protected outcomes 3 and 4 | Section 10; claims K25 to K29; N9 and the N2 addition | Content review; cited lines at `87d0f79`; wording check rerun |

## Design outline

The four note files were read in full, merged into 73 patterns sorted by seven Control Rod areas, each with fit, effort, priority and note sources, followed by Kandev's admitted pitfalls, UX ideas, a section for observed behaviour, and a build plan. When note E arrived it was folded into section 10 (observations against existing patterns, nine new patterns P74 to P82, sixteen product problems), five UX ideas were merged into section 9, five more code claims were checked (K25 to K29), and two Now changes were made with reasons (N9 new, one rule added to N2). The build plan lists each claim the notes make about our code with file and line, then a Now list drawn only from confirmed gaps.

## Required links

- `risk.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- `docs/adr/0019-own-workbench-clean-room.md`, `docs/patterns/kandev.md`, `docs/patterns/README.md`

## Exit criteria

- Builder and reviewer can say what must stay true.
- Every assumption has an invalidation trigger.
- Evidence needs flow into `verification.md`.

## Source-lineage note

Basis structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
