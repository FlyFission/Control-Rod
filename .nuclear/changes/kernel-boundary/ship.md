# Ship: One vendor-family table for checker independence, and the claim holder checked by the kernel

Release decision: **pending**. This change touches a trust surface (kernel decision functions), so it needs the owner's recorded yes before merge, under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off). Merge is the owner's decision. No merge-on-green permission is claimed for it.

## Signature

| Field | Entry |
|---|---|
| Decision | pending: not yet asked |
| Trust-surface files | `kernel/src/transition.rs`, `kernel/src/decision.rs`, `kernel/bindings/wasm/src/lib.rs` (and the rebuilt `services/api/kernel/controlrod_kernel_bg.wasm` that compiles them) |
| Question | pending: to be asked by the session that opens the pull request, naming the pull request and these files |
| Answer | pending |
| Head when asked | pending |
| Recorded by | pending. The agent that records the answer fills this from the owner's own words. No signature or initials are typed for Ben Huffer |

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
