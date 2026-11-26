# Trace: A check counts when the stream names the dated snapshot of the pinned model

| Need | Code | Test |
| --- | --- | --- |
| Daemon accepts the dated snapshot only | `daemon/internal/runner/attest.go` DatedSnapshot, AcceptObserved | `attest_test.go` TestAcceptObservedTakesTheDatedSnapshotOnly |
| Server accepts the dated snapshot only | `services/api/src/run-attestation.ts` datedSnapshot, judgeAttestation | `test/run-attestation.test.ts` "accepts the dated snapshot the vendor streams for the pinned name, and nothing looser" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A check whose stream names the pinned model and its dated snapshot (<id>-YYYYMMDD) counts, in the daemon and the server alike; a shorter alias, a different model, a malformed date, or a stream that never names the pinned id are still provenance unknown. Go and API tests pin both sides, and typecheck and vet pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
