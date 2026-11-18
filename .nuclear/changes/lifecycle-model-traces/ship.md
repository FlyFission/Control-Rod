# Ship: package lifecycle model and conformance traces

Release decision: **model, traces and replays for owner review.**

- **Proposed:** merge the model, the generator, the generated traces, the two replay tests and the docs.
- **Not claimed:**
  - that the kernel is proved correct (the model is sampled, not verified);
  - that the model was reviewed against the floors by anyone but its author;
  - that the WebAssembly build matches the Rust source on requests the traces do not reach;
  - that the generator runs in CI (only the replays do).
- **Owner decisions requested:**
  1. Confirm that a test under `kernel/bindings/wasm/tests/` needs no signature, since it changes no decision function, or sign it.
  2. Confirm the package lifecycle as the first model (D2), with run lease and claim next.
  3. Say whether reason codes are part of the kernel's contract. The model and the traces assume they are.
  4. Say who reviews the model against the floors in `kernel/src/transition.rs`.

Rollback: revert the commit. No decision function, schema or wire change.

Monitoring after merge: a replay failure means the kernel, its WebAssembly build or the model changed. Find which before regenerating traces.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The package lifecycle model passes its scripted runs and its invariant simulation, its generated traces are committed with their seed and digests, both replays pass against the kernel and fail on a wrong expectation, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
