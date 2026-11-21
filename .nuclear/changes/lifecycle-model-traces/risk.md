# Risk: package lifecycle model and conformance traces

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-18 instruction to start PL1 and PL2.
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture, workflow or `spec/` major version changes. One test file is added under `kernel/bindings/wasm/tests/`; see the assumption in `basis.md`.
- Scope: the files listed in `basis.md`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Simulation results are read as proof that the kernel is correct. | `models/README.md`, the model header and this record say the model is sampled, not proved; `quint verify` is not run. | Any record or screen that calls the model a proof or a verification. |
| R-02 | The model echoes the kernel, so a shared mistake passes both. | The invariants restate the floors from the module docs, not the code. Two planted bugs were caught (E-03). Review of the model against the floors is still open. | A floor the model encodes differently from `transition.rs` module docs, found in review. |
| R-03 | Traces are edited by hand to make a test pass. | Each trace records its generator, seed and model digest; the API test checks every file against `index.json`; regeneration is byte-identical (E-01). | A trace whose content differs from what `models/generate.sh` produces. |
| R-04 | A real disagreement is hidden as a known violation. | `known_violations` is empty; any entry must name the rule and record the kernel's current answer, so fixing the kernel fails the test. | An entry added without a change record that explains it. |
| R-05 | The committed WebAssembly drifts from the Rust source on behaviour the traces do not reach. | The traces allow all ten actions and give every reason the lifecycle function returns (E-01); the gap is stated in ship. | A drift found on an untraced request. |
| R-06 | The guided steps hide bugs that only free-form requests reach. | One step in four is free: any action, actor, checker, signature and preparation facts. | A bug found later that free steps could reach but did not. |

## Selected mode

- **Mode:** Standard
- Basis: tests and models that read the kernel; no decision function changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The package lifecycle model passes its scripted runs and its invariant simulation, its generated traces are committed with their seed and digests, both replays pass against the kernel and fail on a wrong expectation, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
