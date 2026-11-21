# Trace: package lifecycle model and conformance traces

| Requirement | Where | Check | Disposition |
|---|---|---|---|
| L-1 The floors hold in every state of the model. | `models/package-lifecycle.qnt` invariants | Simulation of 5000 runs of 30 steps, seed 1, no violation (E-01) | done |
| L-2 The invariants catch a broken rule. | same | Two planted model bugs each violate an invariant (E-03) | done |
| L-3 Named paths behave as the floors say. | three `run …Test` definitions | `quint test` passes (E-01) | done |
| T-1 Traces are generated from a recorded seed and regenerate byte for byte. | `models/generate.sh`, `models/itf_to_traces.py` | `index.json` digest identical before and after regeneration (E-01) | done |
| T-2 The native kernel agrees with the model at every traced step. | `kernel/bindings/wasm/tests/lifecycle_traces.rs` | 960 steps, no mismatch (E-02) | done |
| T-3 The compiled WebAssembly agrees with the model at every traced step, and the files match the index. | `services/api/test/lifecycle-traces.test.ts` | 2 tests pass (E-02) | done |
| T-4 Both replays fail on a wrong expectation. | same | Tampered expectation fails both; restored passes (E-03) | done |
| T-5 Run lease and claim are modelled. | none | none | not in this change |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The package lifecycle model passes its scripted runs and its invariant simulation, its generated traces are committed with their seed and digests, both replays pass against the kernel and fail on a wrong expectation, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
