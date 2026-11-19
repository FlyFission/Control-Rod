# Ship: instruction checks and owner words

Release decision: **harness, cases, results, rule and checker for owner review.**

- **Proposed:** merge the instruction-check harness and cases with their recorded results, the owner-decision rule and checker, and the converted tables in this pull request's records.
- **Not claimed:**
  - that any text always produces the behaviour shown (one run per case);
  - that the checks run in CI (they need a login and use quota);
  - that these are role trials or casting evidence;
  - that anyone but the author reviewed the cases or the converted tables.
- **Findings for the owner:**
  1. The daemon's isolation flags keep `CLAUDE.md` out of an agent's context on Claude Code 2.1.328. The comment in `daemon/internal/runner/runtime.go` says they do not. The case `daemon-loads-no-project-instructions` now checks the behaviour; the comment is not changed here.
  2. Without `AGENTS.md` in context, an agent asked to fix a generated schema hand-edits it. Rule 3 works only where the file is loaded. Daemon runs never load it, by design, so a brief that touches `spec/` must state the rule itself.
- **Owner decisions requested:**
  1. Accept the PL8 table for new records, and the 2026-11-19 start date.
  2. Confirm the quoted words in this pull request's five records match what you said.
  3. Say whether running instruction checks on a subscription login is fine for development, or whether it waits for the C-8 terms finding.

Rollback: revert the commit. Tooling and documentation only.

Monitoring after merge: a record dated 2026-11-19 or later that fails `tools/check_owner_decisions.py`; a case result that differs on rerun.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The instruction-check harness and its first cases run against the real CLI with results recorded, the owner-decision rule is in `docs/collaboration.md` with a passing checker, this pull request's records use it, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
