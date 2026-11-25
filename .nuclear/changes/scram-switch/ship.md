# Ship: one SCRAM button with a beacon lamp

Release decision: **approved** by the owner.

- **Proposed:** squash merge to main.
- **Not claimed:** no compliance claim; Safari and Firefox rendering untested (see proof).

Monitoring after merge: reports that SCRAM or Restart is hard to find or opens the wrong review, or that the lamp reads clear when status is unknown.

Rollback: revert the commit; the top bar returns to the rod plate and SCRAM button.

## Review history

| Round | Head reviewed | Outcome | Fixed in |
|---|---|---|---|
| 1 | 6d75355 | Codex FAIL: 3 major, 3 minor | 85ec78b |
| 2 | 85ec78b | Codex FAIL: round 1 all fixed; 2 major, 2 minor new | c5eeb7a |
| 3 | c5eeb7a | Codex FAIL: 1 partly fixed, 1 major new | ed566b4 |

## Signature

| Who | Decision | Where | When |
|---|---|---|---|
| Ben Huffer (owner) | "Yes, squash merge #190" on the merge decision card, after the three Codex rounds above | Project thread "Simplify the SCRAM button" | 2026-11-25 01:14 UTC |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
