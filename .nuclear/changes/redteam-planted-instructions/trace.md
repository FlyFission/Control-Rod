# Trace: red-team case for planted instruction files

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| RS-01 The red-team catalog has a case for an author run planting an agent-loaded file that a later author run loads, with status `pending` until a test enforces it. | `tests/redteam/catalog.yaml` RT-026 | `evidence/catalog-diff.patch`; `evidence/checks.txt` (`check_redteam.py`) | implemented |
| RS-02 No other red-team case or trust-surface file changes. | none | `evidence/checks.txt` (trust-surface diff stat) | implemented |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 and RS-02 are met: `tests/redteam/catalog.yaml` has RT-026 for the author-workspace instruction-file gap, with status `pending`, the catalog check passes, no other case or trust-surface file changes, and CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
