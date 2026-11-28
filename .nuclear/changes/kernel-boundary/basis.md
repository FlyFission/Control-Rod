# Basis: One vendor-family table for checker independence, and the claim holder checked by the kernel

**Change slug:** `kernel-boundary`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review and signature. Trust surface: kernel decision functions.

## Mission / need

The 2026-11-28 review of Control Rod (batch 8, "Kernel boundary") found four gaps where the kernel meets the rest of the system:

- DMN-16 and KRN-5 (P2): checker independence had two definitions. The daemon compared vendor families from its own table (`check.go`), the API kept a copy of that table (`runtimes.ts`), and the kernel compared provider names only (`transition.rs` `may_be_same`). Two providers of one vendor would pass the kernel and fail the daemon.
- KRN-2 (P2): the kernel did not check that the agent submitting output holds the claim on the work.
- KRN-4 (P3): the WebAssembly binding mapped any reason code it did not list to "forbidden", so a new code would be reported as another one without a warning.
- KRN-3 (P3): Accepted cannot move to Closed, and nothing said why.

The review also found that the rules themselves are sound: `decide()` fails closed. This change keeps that, and every change keeps or tightens a rule.

## Proposal

1. **One family table.** `daemon/internal/runner/models.json` gains a `families` object (runtime name to vendor family: claude Anthropic, codex OpenAI, grok xAI, agy Google, fake Test; OpenCode and Ollama absent because either can serve any vendor's model). The daemon reads it (`check.go` `RuntimeFamily`, replacing `fixedVendorFamilies`). The API reads it (`vendor-families.ts`; `RUNTIME_FAMILIES` and `distinctFamily` in `runtimes.ts` now come from it) and passes it to the kernel as `vendor_families` with every pre-check.
2. **The kernel judges families.** `RuntimeIdentity::may_be_same` takes the table. Two runtimes may be the same when they share a provider (as before), when they share a family, or when either provider has no known family in the table. A blank or conflicting entry counts as unknown. A request without the table has no known families. A pre-check that may share the author's runtime still needs the owner's signed override, as before.
3. **The claim holder.** The kernel request gains `claimed_by`. `SubmitOutput` and `Revise` are refused (`forbidden`) unless it is present, not blank, and exactly the actor. The API sets it to the baseline of the latest author run of the revision, and only when the run being completed is that run. A `SubmitPreCheck` is refused (`forbidden`) unless the actor is the checker baseline the request names. The API already sent the two as the same value.
4. **Reason codes.** `ReasonCode` drops `#[non_exhaustive]` and the binding's `reason_name` match has no wildcard, so a new code fails to compile until it has its own wire name.
5. **Accepted to Closed.** Documented in `transition.rs` and `models/README.md`: both are final; closing means the work was turned down; archiving a finished card is a view of the record, outside the lifecycle. No model change.
6. **Model and traces.** `models/package-lifecycle.qnt` gains the claim holder, the family table and two invariants (`WorkByClaimHolder`, `PreCheckByItsChecker`); `PreCheckIndependent` uses the family rule. Traces regenerated with `bash models/generate.sh` (Quint 0.33.1, same seed and counts).
7. **WebAssembly.** `services/api/kernel/controlrod_kernel_bg.wasm` rebuilt with `scripts/build-kernel-wasm.sh` (wasm-bindgen-cli 0.2.104, Rust 1.97).

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
| --- | --- | --- | --- | --- | --- |
| D1 | A provider without a known family counts as possibly the same runtime: the pre-check needs the owner's override, and is not refused outright. | none: authoring agent's choice, open to the owner | 2026-11-28, kernel-boundary worker session | Matches the daemon's "unknown fails closed" and keeps the override as the one way through, as for a shared provider. Refusing outright would be stricter still. | Whether OpenCode or Ollama should ever count as independent when they name the model's vendor. |
| D2 | The `fake` test runtime stays in the family table as "Test". | none: authoring agent's choice, open to the owner | 2026-11-28, kernel-boundary worker session | Parity with the daemon and API tables before this change; the daemon offers `fake` only when `CONTROLROD_ALLOW_FAKE=1`. | Removing `fake` from production tables. |
| D3 | KRN-3 is documented, with no archive state. | none: authoring agent's choice, open to the owner | 2026-11-28, kernel-boundary worker session | The brief allowed documenting unless a small model change was clearly right; none was. | Designing an archive or hide feature for finished cards. |
| D4 | A submit or revise from an agent without the claim is refused with the existing reason `forbidden`, not a new code. | none: authoring agent's choice, open to the owner | 2026-11-28, kernel-boundary worker session | Keeps the wire contract and the API's refusal messages unchanged. | A dedicated "not the claim holder" code and its plain-words message. |
| D5 | The claim holder is the latest author run of the revision, named only when the completing run is that run. | none: authoring agent's choice, open to the owner | 2026-11-28, kernel-boundary worker session | The server keeps no separate claim record; this is the run it dispatched for the current round. | A stored claim record on the package. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The kernel judges checker independence from the one vendor-family table in `daemon/internal/runner/models.json`, which the daemon also reads and the API passes in with every pre-check. The kernel refuses output or a revision from an agent that does not hold the claim, and a pre-check from an agent other than the checker it names. Every reason code has its own wire name, checked by the compiler. Accepted to Closed is documented as refused on purpose. Every rule is kept or tightened, never loosened. The model, its traces, the committed WebAssembly and both trace replays agree; Rust, Go and API tests pass; the owner has signed before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
