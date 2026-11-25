# Plan: Choose what needs your passkey: cards finish on their own by default

1. Kernel: `policy_signed`, system actor for release and accept-on-pass, tests; rebuild the WebAssembly binding with `scripts/build-kernel-wasm.sh`.
2. Spec: `SigningPolicy`, `SigningPolicyRef`, `SigningSteps`, `Decision.signing_policy`, `Project.signing_policy`, `ActionDescriptor.step_mode`/`signing_preset`, `WorkspaceProject.signing`, `CreateProjectPayload.signing_preset`. Regenerate.
3. Server: `signing-policy.ts`, admin command, migration 028, decision path split into `decideTx` and `autoDecide`, triggers after intake and pre-check.
4. Web: Setup section, board offer, press-without-passkey path, hint line.
5. Tests, change record, PR, Codex blind check, owner's recorded yes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An owner chooses, per project and with one passkey tap, which card steps need a passkey (Light, Balanced, Everything, or each step). Under Light a routine card is released when intake drafts it and accepted when its blind check passes, with no person and no passkey; send-back and reject are a press. Every such decision records the signed policy it relied on. Nuclear-grade, Safety/Material and restricted-lane work is signed every time. Kernel, API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
