# Trace: worktree daemon binding

| Requirement | Author evidence | Status |
| --- | --- | --- |
| Structured selection survives capture, queue and claim | [New Work tests](web-targeted.log), [checkout resolver tests](api-checkout-tests.log), [run dispatch test](api-dispatch.log) | Web and resolver pass; dispatch setup blocked. |
| Author launches in selected checkout and branch | [Checkout fixtures](checkout-tests.log), [daemon run test](daemon-integration.log) | Fixture edits the selected checkout and leaves base alone; full launch blocked by the host process probe. |
| Unsafe, changed and busy checkouts fail without fallback | [Checkout fixtures](checkout-tests.log), [API resolver tests](api-checkout-tests.log) | Passed. |
| Old daemons cannot claim bound author runs | [Run dispatch test](api-dispatch.log) | Setup blocked; rerun on a host that permits loopback. |
| Blind checker remains isolated | Run dispatch test checks that the checker and intake run do not receive a binding; daemon run test checks that checkout evidence stays out of author outputs | End-to-end proof pending the [API](api-dispatch.log) and [daemon](daemon-integration.log) reruns. |
| Contracts regenerate cleanly | [Generation and hash check](spec-generation.log) | Passed. |

Independent checker verdict and Ben's acceptance are pending.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each requirement has retained author evidence and a separate checker verdict.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
