# Quick Proof: machine checks before the model check

## Proof summary

- Change slug: machine-gate
- Proof owner: Ben Huffer (review pending); checks run by Claude Code on 2026-11-23
- Risk record: [`risk.md`](risk.md)

## Claim proven

This record is a proposal only. It changes no code, spec, policy, kernel or workflow file. Every file:line reference in [basis](basis.md) was read on `main` at `e120fcf0`.

## Method and results

| Check | Result |
|---|---|
| `git diff origin/main --stat` lists only files under `.nuclear/changes/scoped-send-back/` and `.nuclear/changes/machine-gate/` | pass |
| `python3 tools/check_originality.py` | pass |
| `git diff --check` | pass |
| `ng.py validate --strict-custody` on this packet | pass |
| Behaviour of the proposed change | not applicable until it is built |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
