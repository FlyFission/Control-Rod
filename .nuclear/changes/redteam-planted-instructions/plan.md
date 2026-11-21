# Plan: red-team case for planted instruction files

1. Read the threat-model row on #102's branch, `docs/patterns/headroom.md` row 1, RT-013 and the pre-check tests that withhold planted names ([basis](basis.md)).
2. Append RT-026 to `tests/redteam/catalog.yaml` with status `pending`.
3. Run `tools/check_redteam.py`, store the catalog diff, and check the trust-surface diff touches only the catalog.
4. Validate this record with the pinned validator under `--strict-custody`.
5. Open a draft pull request, get CI green, and ask the owner for a yes that names the pull request and says it touches a trust surface. On that yes, record it word for word in `ship.md`'s `Signature` table (`ship.md` is not a trust surface, so the yes still covers the pull request), wait for CI, then merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 and RS-02 are met: `tests/redteam/catalog.yaml` has RT-026 for the author-workspace instruction-file gap, with status `pending`, the catalog check passes, no other case or trust-surface file changes, and CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
