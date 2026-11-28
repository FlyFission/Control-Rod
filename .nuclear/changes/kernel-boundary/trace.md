# Trace: One vendor-family table for checker independence, and the claim holder checked by the kernel

| Need | Code | Test |
| --- | --- | --- |
| DMN-16, KRN-5: one family table | `models.json` `families`; `check.go` `RuntimeFamily`; `vendor-families.ts`; `runtimes.ts` | `families_test.go` (three tests); `kernel-boundary.test.ts` "comes from models.json..." |
| DMN-16, KRN-5: kernel judges families from the table | `transition.rs` `family`, `may_be_same`, `decide_pre_check`; `work.ts` passes `vendor_families` | `transition.rs` `two_providers_of_one_vendor_family_...`, `a_provider_without_a_known_family_...`, `without_the_family_table_...`, `a_blank_or_ambiguous_family_entry_...`; model run `sameFamilyOrUnknownFamilyNeedsOverrideTest`, invariant `PreCheckIndependent` |
| API and kernel agree | `vendor-families.ts` `mayBeSameRuntime` | `kernel-boundary.test.ts` "gives the API and the kernel the same answer for every pair" |
| KRN-2: only the claim holder submits or revises | `transition.rs` `holds_claim`; `work.ts` `finishAuthor`, revise | `transition.rs` `only_the_claim_holder_may_submit_output_or_revise`; model run `onlyTheClaimHolderSubmitsTest`, invariant `WorkByClaimHolder`; `kernel-boundary.test.ts` "is refused by the kernel and leaves the card in work" |
| KRN-2: only the named checker submits a pre-check | `transition.rs` `decide_pre_check` | `only_the_checker_the_request_names_...`; invariant `PreCheckByItsChecker`; `kernel-boundary.test.ts` "refuses a pre-check submitted by an agent other than..." |
| KRN-4: every reason code has its own name | `decision.rs`; `lib.rs` `reason_name` | compile-time exhaustive match; `every_reason_code_has_its_own_wire_name` |
| KRN-3: Accepted and Closed are final | `transition.rs` module notes; `models/README.md` | `accepted_and_closed_packages_never_move`; invariant `TerminalIsFinal` |
| Compiled kernel matches source and model | `services/api/kernel/` | `lifecycle_traces.rs`; `lifecycle-traces.test.ts` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The kernel judges checker independence from the one vendor-family table in `daemon/internal/runner/models.json`, which the daemon also reads and the API passes in with every pre-check. The kernel refuses output or a revision from an agent that does not hold the claim, and a pre-check from an agent other than the checker it names. Every reason code has its own wire name, checked by the compiler. Accepted to Closed is documented as refused on purpose. Every rule is kept or tightened, never loosened. The model, its traces, the committed WebAssembly and both trace replays agree; Rust, Go and API tests pass; the owner has signed before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
