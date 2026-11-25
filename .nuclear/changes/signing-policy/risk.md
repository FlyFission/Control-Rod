# Risk: Choose what needs your passkey: cards finish on their own by default

- **A weaker floor.** Work can now be released and accepted with no person. Mitigations: only when the owner signed a policy saying so; only routine work on low-risk lanes; only a pass is ever accepted automatically; return, reject, accept-with-findings and independence overrides stay with a person; the independent blind check (different provider) is unchanged and still required for every accept.
- **A stale or stolen policy.** The policy's passkey must still be valid and its signer must still hold the authority at the moment of each step, read inside the writer transaction. Changing the policy is itself a signed command.
- **Silent failure of an automatic step.** Every refusal is recorded as `decision.auto-skipped` with its reason, and the card stays where a person sees it.
- **A press on changed work.** A decision with no passkey carries the digest the person was shown and is refused if it differs.
- **Kernel binding drift.** The WebAssembly binding was rebuilt with the pinned toolchain (rustc 1.97.0, wasm-bindgen 0.2.104).

## Selected mode

- **Mode:** Nuclear (high consequence: a kernel decision function, signed by the sole maintainer under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off)).
- Basis: changes a kernel decision function (trust surface) and the meaning of a decision record.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An owner chooses, per project and with one passkey tap, which card steps need a passkey (Light, Balanced, Everything, or each step). Under Light a routine card is released when intake drafts it and accepted when its blind check passes, with no person and no passkey; send-back and reject are a press. Every such decision records the signed policy it relied on. Nuclear-grade, Safety/Material and restricted-lane work is signed every time. Kernel, API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
