# Plan: A check counts when the stream names the dated snapshot of the pinned model

1. Read the refusal on the three runs.
2. Tests first on both sides, then the same rule in attest.go and run-attestation.ts.
3. Run go vet and the go tests, the API test and tsc. Open a PR and merge it on green. Update the Mac and rerun the checks.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A check whose stream names the pinned model and its dated snapshot (<id>-YYYYMMDD) counts, in the daemon and the server alike; a shorter alias, a different model, a malformed date, or a stream that never names the pinned id are still provenance unknown. Go and API tests pin both sides, and typecheck and vet pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
