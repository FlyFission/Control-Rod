# Execution ledger: workbench buildout

Plan: [workbench buildout plan](../plans/2026-10-29-workbench-buildout.md). Specification: [workbench and ontology](../specs/2026-10-29-workbench-ontology-design.md). Change record: `.nuclear/changes/workbench-ontology/`.

## Pins

| Item | Value |
|---|---|
| Base | `claude/magical-ritchie-e7t851` at `06446bf` (PR #11 on #6) |
| Specification branch | `docs/workbench-ontology-20261029` (PR #13) |
| Phase 0 branch | `phase-0/workbench-governance` |
| Nuclear-grade validator | `8122269a5b55e5694c8f998ad17955e7ce45798a` (CI pin) |
| Theme catalogue | draft PR #12, `feat/overlay-themes` |

## Authorizations

| Authorization | Scope | Status | Source |
|---|---|---|---|
| A | Phase 0 and spikes S-0 to S-5 | granted 2026-10-30 | Owner: "continue with your plan/spec onward to next phase". Each spike run still asks before starting real agent processes |
| B | Phases 1 to 9 | not granted | Needs decisions D-1 to D-6 and the D-7 theme contract |

## Phase 0 progress

| Task | Status | Evidence |
|---|---|---|
| 0.1 Execution ledger | done | This file |
| 0.2 Public wording | done | README lines 5, 13, 23 and 31 rewritten to state designed or planned behaviour; `tools/check_public_claims.py` with tests; failed first: the original README yields four findings, the corrected README none |
| 0.3 Borrowed code and asset register | done | `docs/third-party/register.md`, `third_party/licenses/`, `tools/check_register.py` with tests (Python, following the repository's tools convention rather than the plan's `.mjs` name). First entries: four self hosted font files. Donor overlap scan of the whole repository against all twenty pinned donor checkouts: 0 overlaps once the self checkout is excluded |
| 0.4 Kandev notes wording check | done | Independent checker (ADR 0019 condition 3), 2026-10-30: PASS WITH EDITS. Ten shared six word sequences across 28 pages, all UI labels, page titles or everyday phrasing; four sentences reworded as suggested. Notes and report stay outside the repository |
| 0.5 Owner decisions D-1 to D-7 | waiting on owner | D-7 catalogue answered by PR #12 |
| 0.6 Design tokens from ascertain.it | done | `apps/web/src/design/tokens.css` from ascertain.it `:root` (fetched 2026-10-30); Inter and JetBrains Mono self hosted; Google Fonts removed; hard coded colours moved to tokens except `pages/Floor.tsx`, which PR #12 replaces. Contrast computed in `evidence/phase0/tokens-contrast.txt`: every text and state colour at least 7.18:1 on panel. `tools/check_offline_assets.py` with tests; the previous `index.html` yields two remote references, the new one none. Rendered sign in page: Inter loaded, zero external requests |
| 0.7 Platform Plan references | done | `docs/README.md` names the owner-held plan and its tabs; no private URL in the public repository |
| 0.8 OV acceptance cases | drafted, waiting on owner | `docs/office-view/acceptance.md`: given, when, then and never for OV-01 to OV-15 and OV-26, written from the Platform Plan because the scenario spreadsheet was not available |
| 0.9 Theme catalogue stream | done pending merge | PR #12: originality rules and guard, distinct bodies and brief matched props for all fifteen worlds, adopted display names, second independent review fixed, change record valid. Merge needs the author's DCO sign-off and squash |
| 0.10 Authenticator policy | waiting on owner | |
| 0.11 openclaw-office pin and license | done | `WW-AI-Lab/openclaw-office` at `def631a`, MIT, assets are screenshots only; recorded in `docs/patterns/workbench-donors.md` |

## Exit criteria

Every Phase 0 task is done or waiting on a named owner decision, and every spike has a recorded result or a recorded reason it did not run.

## Source-lineage note

Ledger format follows the platform buildout ledger in this directory.
