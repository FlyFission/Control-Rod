# Plan: One vendor-family table for checker independence, and the claim holder checked by the kernel

1. Kernel (`kernel/src/transition.rs`, `decision.rs`): `vendor_families` and `claimed_by` in the request; the family rule in `may_be_same`; claim and checker checks; module notes for Accepted and Closed; unit tests for each refusal.
2. Binding (`kernel/bindings/wasm/src/lib.rs`): exhaustive `reason_name` and a test that every code has its own name.
3. Model: claim holder, family table, two new invariants and two scripted runs; regenerate traces; confirm a second run is byte-identical.
4. Table: `families` in `models.json`; daemon reads it; API reads it, passes it to the kernel, and uses the same rule for the record.
5. API callers (`work.ts`): `claimed_by` on submit-output and revise, `vendor_families` on submit-pre-check.
6. Rebuild the committed WebAssembly twice and compare hashes; rebuild main's source to confirm the toolchain reproduces main's committed file.
7. Tests: cargo fmt, clippy, cargo test; gofmt, go vet, go test; API typecheck and the full API suite; repo gates; change-record validation.
8. Owner signature before merge (see [ship](ship.md)).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The kernel judges checker independence from the one vendor-family table in `daemon/internal/runner/models.json`, which the daemon also reads and the API passes in with every pre-check. The kernel refuses output or a revision from an agent that does not hold the claim, and a pre-check from an agent other than the checker it names. Every reason code has its own wire name, checked by the compiler. Accepted to Closed is documented as refused on purpose. Every rule is kept or tightened, never loosened. The model, its traces, the committed WebAssembly and both trace replays agree; Rust, Go and API tests pass; the owner has signed before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
