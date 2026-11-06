# Risk: remove the site-concept pack and its examples

- **Mode:** Standard
- Execution owner: Claude Code under the owner's instruction of 2026-11-06.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec major version. No migration or wire change.
- Scope: removal of `packs/capital-projects/`, `tests/conformance/cad/` and two change records; the code, tests, fixtures and docs that referred to them.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Removing a pack other code used breaks start-up, a run or a test. | Every reference found by search and fixed; full web, API, Go and Python suites run on the merged tree. | Any suite failure caused by this change. |
| R-02 | The job-pack mechanisms (role tools with a network line, family and role pre-checks, pack files shipped to agents) lose their tests along with the pack. | The same API tests now run against a neutral fixture pack in the test folder and pass. | A pack mechanism with no test left. |
| R-03 | An agent loses a tool it relied on. | Only `Bash(cr-site:*)` is dropped, and its program no longer exists; no tool is added, so the change only narrows what an agent may run. | Any widening of an agent's tool list. |
| R-04 | A historical record no longer reads true once its subject is gone. | Records keep their meaning with a one-line removal note or a neutral name for the same commit; frozen evidence logs are untouched; change records validate with `--strict-custody`. | A record that fails validation. |
| R-05 | The removed subject lingers in tracked files. | Search after the change (`evidence/grep-after.txt`); the only hits outside evidence logs are the withdrawn ADR 0018, whose status line the owner wrote. | Any other hit. |

## Selected mode

- **Mode:** Standard
- Basis: removing a pack other code used; reversible by revert; no protected surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the packs and records are gone, nothing that used them breaks, no tracked file outside evidence logs names the removed subject, and the full suites pass on the merged tree.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
