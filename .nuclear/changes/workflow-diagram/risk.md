# Risk: Show each workflow as a flow diagram

- **Mode:** Standard
- Execution owner: Claude (project thread "Show each workflow as a flow diagram").
- Decision owner: Ben Huffer. No trust surface is edited.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The diagram shows a stop, a stand-in or a checker that the dispatcher would not use. | One model mirrors `pickRuntime`/`pickChecker` and the setup read-back; chosen-but-unbuilt stops are "Coming soon"; the page says it is a preview that a card's lane, pins and sandbox can change. Tests cover checker independence, benching, no-one-ready and each answer. | A diagram drawing a fewer-stops answer as in force, or a checker from the author's vendor. |
| R-02 | It implies the checker can fall back, or that the stand-in is checked by its own vendor or by the author it replaced. | Only the author has a stand-in; its work goes to its own check node, filled by pickChecker's rule without the replaced author, or shown waiting; no fallback edge enters a check. Tests. | A fallback edge into a check, or a stand-in check by its own vendor. |
| R-03 | Vendor marks: brand terms ask for permission and no alteration. | Owner's decision recorded (basis 5); marks in their owners' colours, one-line not-affiliated note on the page and in `public/agent-marks/README.md`; one map to swap or remove a mark. | An owner's request to remove a mark. |
| R-04 | Bundle weight on the first-run page. | React Flow is in a lazily loaded chunk (234 kB, 77 kB gzip); the main bundle grows 12 kB. | Main bundle growth above 50 kB. |
| R-05 | New dependencies' licenses. | `@xyflow/react` 12.12.1, MIT, older than 3 weeks; its notice and every other bundled package's ship in `third-party-licenses.md` beside the built app; `tools/license-gate.mjs` passes. | License gate failure. |

## Selected mode

- **Mode:** Standard
- Basis: web-only, read-only view over existing data; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Setup and a new Workflow place draw the person's current workflow as a block flow diagram and as a decision matrix, from the same seats, readiness and check-in answer the dispatcher and Setup read; each agent shows its own mark; nothing unbuilt is drawn as in force; web tests, typecheck, build and the license gate pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
