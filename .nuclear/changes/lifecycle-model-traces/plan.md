# Plan: package lifecycle model and conformance traces

1. Write the Quint model of the package lifecycle with its invariants and scripted runs.
2. Check that the invariants catch planted bugs in the model.
3. Write the generator and converter; generate traces with a recorded seed, and check that regeneration is byte-identical.
4. Replay the traces natively (`cargo test`) and through the compiled WebAssembly (API tests); check that both fail on a wrong expectation.
5. Document the model, the trace format and regeneration, and update the pattern note.
6. Later, in its own change: model run lease and claim across the API and the daemon.

Steps 1 to 5 are in this change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The package lifecycle model passes its scripted runs and its invariant simulation, its generated traces are committed with their seed and digests, both replays pass against the kernel and fail on a wrong expectation, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
