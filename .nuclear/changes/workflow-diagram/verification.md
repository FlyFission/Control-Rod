# Verification: Show each workflow as a flow diagram

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | Web: all tests, `tsc` clean, build, license gate. | `evidence/web.log` |
| E-02 | pass | Screenshots from the dev server with a mocked API: Workflow at 1440 (flow, matrix, every-step with Codex not ready), Setup read-back at 1440, phone at 390. | `evidence/*.jpg` |
| E-03 | pending | Blind review by another vendor (Codex) before merge. | PR thread |

Not done here: macOS with real signed-in CLIs; the Playwright e2e suite.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Setup and a new Workflow place draw the person's current workflow as a block flow diagram and as a decision matrix, from the same seats, readiness and check-in answer the dispatcher and Setup read; each agent shows its own mark; nothing unbuilt is drawn as in force; web tests, typecheck, build and the license gate pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
