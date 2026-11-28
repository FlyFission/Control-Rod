# Risk: One vendor-family table for checker independence, and the claim holder checked by the kernel

- R-01: a stricter rule refuses work that used to pass. A pre-check on a provider the table does not name now needs the owner's override, and so does a pre-check sent without the table. The API always sends the table, and every runtime the API can seat (claude, codex, agy, grok, fake) has its own family, so no current flow changes. Tests: `kernel-boundary.test.ts` checks the API and the kernel agree on every pair.
- R-02: a completion from a run that is not the latest author run of the revision is now refused and recorded as failed. Before, it moved the card. That is the gap KRN-2 named. A revise with no author run on record is now refused too; before, it went through under the name "author".
- R-03: the family table is now a decision input. A wrong edit to `families` in `models.json` could make two vendors look independent. The file sits outside the listed trust surfaces; see the open question in [ship](ship.md). The daemon test `TestModelsJSONHoldsTheOneVendorFamilyTable` keeps OpenCode and Ollama out and requires a family for every registered model's harness.
- R-04: stale WebAssembly. Both trace replays (native and compiled) run in CI and fail on a mismatch; the rebuild was shown byte-reproducible.
- R-05: wire change. New request fields are optional with fail-closed defaults; `deny_unknown_fields` still applies. No `spec/` contract describes the kernel request, so no spec changes.
- Trust surface: `kernel/src/transition.rs`, `kernel/src/decision.rs` and `kernel/bindings/wasm/src/lib.rs` (kernel decision functions). Needs the owner's signature (AGENTS.md rule 2).

## Selected mode

- **Mode:** Standard
- Basis: rules only tighten; every step is covered by unit tests, model invariants and replayed traces; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The kernel judges checker independence from the one vendor-family table in `daemon/internal/runner/models.json`, which the daemon also reads and the API passes in with every pre-check. The kernel refuses output or a revision from an agent that does not hold the claim, and a pre-check from an agent other than the checker it names. Every reason code has its own wire name, checked by the compiler. Accepted to Closed is documented as refused on purpose. Every rule is kept or tightened, never loosened. The model, its traces, the committed WebAssembly and both trace replays agree; Rust, Go and API tests pass; the owner has signed before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
