# Ship: agent map check and port provenance

Release decision: **checks and outline for owner review.**

- **Proposed:** merge `tools/check_agents_map.py`, its recorded budget, the provenance rule in `tools/check_register.py`, `docs/third-party/port-provenance.md` and the doc updates.
- **Not claimed:** that either check runs in CI (both run by hand, like the other `tools/` checks); that the register check passes on `main` (two problems from before this change remain); any independent review of the tests.
- **Owner decisions requested:**
  1. Accept the budget as the current size of `AGENTS.md` with no headroom, or choose headroom and re-record.
  2. Sign a workflow change to run `tools/check_agents_map.py` (and, once its two problems are fixed, `tools/check_register.py`) in CI.
  3. Accept the provenance outline as the form for the openharness ports.

Rollback: revert the commit. No code outside `tools/`, no schema or wire change.

Monitoring after merge: watch for budget re-records without a reason in their change record, and for code ports that arrive without a provenance file.

## Backfill after merging main (2026-11-18)

`main` added a port, `daemon/internal/runner/git_host.go` from `GoogleCloudPlatform/scion` (change `wave1-hardened-worktrees`), with no provenance file, so the rule in this change refused its register row. This change adds `.nuclear/changes/wave1-hardened-worktrees/provenance.md`, written from a comparison with the upstream file at the pinned commit, and names it in that row. The comparison found that the port leaves out upstream's repository-config checks. Among them, filter drivers defined in a repository's own config are not replaced. That finding is reported to the owner and is not changed here. The port's author has not reviewed the backfill.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`tools/check_agents_map.py` passes on this branch with a recorded budget, `tools/check_register.py` requires a provenance file for every ported code file, both have passing tests, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
