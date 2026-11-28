# Ship: One vendor-family table for checker independence, and the claim holder checked by the kernel

Release decision: **approved by the owner** under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off) (see Signature below). This change touches a trust surface (kernel decision functions). The open question below on `models.json` is not part of the yes and stays open.

## Signature

| Field | Entry |
|---|---|
| Decision | **Approved.** Merge pull request #263 in the agreed order, after it is updated with `main`, once CI is green. |
| Trust-surface files | `kernel/src/transition.rs`, `kernel/src/decision.rs`, `kernel/bindings/wasm/src/lib.rs`, `kernel/tests/preparation.rs` and the rebuilt `services/api/kernel/controlrod_kernel_bg.wasm` |
| Question | "Should I merge all 11 in that order, including 263 and 260 with the trust-surface files listed above?" The report it closed listed, for 263: "263 changes kernel/src/transition.rs, kernel/src/decision.rs, kernel/bindings/wasm/src/lib.rs, kernel/tests/preparation.rs and the rebuilt services/api/kernel/controlrod_kernel_bg.wasm", and said each pull request would be updated with main before it merges. |
| Answer | "Yes, please do." |
| When and where | 2026-11-28 08:26 America/New_York (13:26 UTC), Ben Huffer's Claude Duet chat with the agent, in the thread for the task "Fix all 10 batches from the Control Rod review". |
| Head when asked | `251b0a9d8083`. Updated with `main` as the question said, at `83d95012cdaa`: the diff of the trust-surface files against `main` is byte-for-byte the same as when asked (SHA-256 of `git diff -- kernel/ services/api/kernel/` checked before and after). Only this signature-recording commit follows. Any other change to a trust-surface file re-opens the question. |
| Recorded by | The authoring agent (Claude), from the owner's own words. No signature or initials are typed for Ben Huffer. |

## Open question for the owner

The family table in `daemon/internal/runner/models.json` is now an input to a kernel decision. It is not on the list of trust surfaces in AGENTS.md rule 2, and CODEOWNERS (under `.github/`, itself a trust surface) does not name it. The owner may want to add it. This change does not.

- Rollback: revert the merge. No data or migration. The previous WebAssembly comes back with the revert.
- Monitoring after merge: on the owner's Mac, a Claude-authored card checked by Codex is still pre-checked and reaches the Inbox with "independent" runtime. A card whose completion arrives from a stale author run shows a failed run with "A floor or policy forbids this request." instead of moving.
- Limits: the API tests use the fake runtime and fake vendor names; the families of real CLIs are as listed in `models.json`. The Quint model is checked by random simulation, not proved.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The kernel judges checker independence from the one vendor-family table in `daemon/internal/runner/models.json`, which the daemon also reads and the API passes in with every pre-check. The kernel refuses output or a revision from an agent that does not hold the claim, and a pre-check from an agent other than the checker it names. Every reason code has its own wire name, checked by the compiler. Accepted to Closed is documented as refused on purpose. Every rule is kept or tightened, never loosened. The model, its traces, the committed WebAssembly and both trace replays agree; Rust, Go and API tests pass; the owner has signed before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
