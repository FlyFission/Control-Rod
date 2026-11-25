# Risk: innocent until proven guilty

- **Mode:** Quick
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture, workflow or spec file is edited.
- Scope: `apps/web/src/` note boxes and project dialog, `services/api/src/workspace-projects.ts` and `refusals.ts`, `daemon/internal/runner/artifact.go`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | An empty note is signed as one text and recorded as another. | The fallback is filled in the browser before the options call, so the signed and sent reason are the same; `notes.test.ts` asserts both. | Options and decision carry different reasons. |
| R-02 | Same-CLI projects quietly weaken the independent check. | Only project creation stops refusing; the pre-check hold and owner override before acceptance are unchanged. | Any change to the hold or kernel. |
| R-03 | Fixing the staging folder widens what the daemon trusts. | Only a real folder owned by this user is chmod'ed; a link or another owner's folder is still refused (test). | A link accepted as the stage folder. |

## Selected mode

- **Mode:** Quick
- Basis: removes refusals on optional text and settings; protections that guard irreversible harm are unchanged.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
