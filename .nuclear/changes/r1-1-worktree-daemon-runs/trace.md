# Trace: worktree daemon binding

| Requirement | Author evidence | Status |
| --- | --- | --- |
| Structured selection survives capture, queue and claim | [New Work tests](web-targeted.log), [checkout resolver tests](api-checkout-tests.log), [run dispatch test](api-dispatch.log) | Web and resolver pass; dispatch setup blocked. |
| Author launches in selected checkout and branch | [Checkout fixtures](checkout-tests.log), [daemon run test](daemon-integration.log) | Fixture edits the selected checkout and leaves base alone; full launch blocked by the host process probe. |
| Unsafe, changed and busy checkouts fail without fallback | [Checkout fixtures](checkout-tests.log), [API resolver tests](api-checkout-tests.log); fix-round tests in `daemon/internal/runner/checkout_hardening_test.go` and `services/api/test/repos-materialize.test.ts` (symlinks, traversal, dot folders, workspace-root escape, base, linked and fresh matching, HEAD drift, protected host folders) | Passed in the [fix round](verification.md#fix-round); the retained logs above predate it. |
| Only linked worktrees reach an author; no writable Git administration | API `bindCheckout` and daemon `validateCheckout`; tests named in [verification](verification.md#fix-round) | Passed. Behaviour change: base and fresh clones are no longer bindable (see [ship](ship.md)). |
| Outputs cannot be redirected through the agent-writable run directory | `TestCheckoutCaptureRefusesLinkedRunDirectory` | Passed. |
| Custody survives agent writes and uncontained runs; claim advertises only real support | `TestCheckoutLockLivesOutsideTheCheckout`, `TestUncontainedRunKeepsCheckoutCustody`, `TestClaimAdvertisesCheckoutSupportOnlyWhereCustodyWorks` | Passed on macOS. The non-Unix branch compiles (`GOOS=windows go vet`); its test did not run here. |
| Unclaimable bound runs are visible; traces cannot name another checkout | `runs.test.ts` bound checkout tests | Passed. |
| Old daemons cannot claim bound author runs, and the run says why it waits | [Run dispatch test](api-dispatch.log); fix-round `runs.test.ts` | The fix-round run passed (37/37 in `test/runs.test.ts`); the retained log is the earlier blocked run. |
| Blind checker remains isolated | Run dispatch test checks that the checker and intake run do not receive a binding; daemon run test checks that checkout evidence stays out of author outputs | End-to-end proof pending the [API](api-dispatch.log) and [daemon](daemon-integration.log) reruns. |
| Contracts regenerate cleanly | [Generation and hash check](spec-generation.log) | Passed. |

Independent checker verdict and Ben's acceptance are pending.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each requirement has retained author evidence and a separate checker verdict.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
