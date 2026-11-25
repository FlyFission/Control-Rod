# Basis: Choose what needs your passkey: cards finish on their own by default

**Change slug:** `signing-policy`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review. Changes a kernel decision function: needs the owner's recorded yes.

## Mission / need

The owner, 2026-11-25 01:29 UTC: "I haven't had any card actually make it all the way through... I want this to be autonomous, and having to sign with passkeys and click a bunch of damn buttons just to have stuff not finish is unacceptable."

Then, 01:37 UTC: "people should only need to sign when they change major settings or do gross things... we can probably just have settings: give someone the flexibility to figure out the things that they want to sign off on, which could be nothing. Or everything... Let's give folks options with a default that doesn't seem overwhelming like it currently is."

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| 1 | Signing becomes a per-project setting with presets and a light default | "give someone the flexibility to figure out the things that they want to sign off on, which could be nothing. Or everything... with a default that doesn't seem overwhelming" | 2026-11-25, project thread, 01:37 UTC | Light (auto release, auto accept of a pass, press for return/reject), Balanced, Everything, plus each step under Advanced. Choosing is signed once. | Org-wide policy; the kernel's independence floor |
| 2 | Nudge, don't distract, when prompts come up too often | "when the card comes up... we can tell them to adjust it in the settings... without distracting them" | 2026-11-25, project thread, 01:37 UTC | One quiet line under a passkey prompt with a Change link; after three signed steps of a kind in a day it offers to let them go | Pop-ups, notifications |

## What stopped every card

1. `kernel/src/transition.rs` made release, accept, return and reject human-only and passkey-signed, every time.
2. Nothing released a drafted card or accepted a passed check on its own. The send-back loop on a failed check already existed (`MAX_ROUNDS = 3`).

## Proposal

1. **Kernel.** A request may carry `policy_signed`: the server verified the owner's passkey over a stored signing policy that lets this step go without a signature of its own. Then (a) a person needs no per-step assertion, and (b) a system actor may release, and may accept a pass. The system still never accepts with findings, returns, rejects or overrides independence, and the policy never waives the override's signature. Without `policy_signed` nothing changes.
2. **Policy record.** `project.set-signing-policy` (Direct signature) stores `signing_policy` on the project: id, version, steps, signer, time, signed subject, nonce and the passkey assertion. Migration 028 makes the field mutable. A workspace project created in the app signs Light with the same tap as its creation.
3. **Scope.** A policy covers a package only when it is routine: not Nuclear-grade (mode, context profile or project), not Safety/Material, and on the public or internal lane. Otherwise every step is signed.
4. **Automatic steps.** When intake drafts packages, each is released under the policy if it says auto. When a pre-check passes, the package is accepted under the policy if it says auto. Every check runs before anything is written, so a refusal (SCRAM, preparation, authority, kernel) leaves the card for a person and records `decision.auto-skipped`.
5. **Record.** A decision under the policy has actor `system` (`policy:SP-...`) or the person, carries `signing_policy` (a copy of the policy without its assertion) and the policy's own assertion. The policy signer's passkey must still be valid and the signer must still hold the authority.
6. **A press binds what was seen.** A decision with no passkey sends `expected_subject_digest`; a mismatch is refused as `changed`.
7. **Web.** Setup gains "What needs your passkey" for the active project. The board offers Light once, with one tap, for a project that never chose. A decision that will ask for a passkey shows one line saying why, with a Change link.

## Out of scope

SCRAM pull without a passkey (next change), the 12-hour signing window (handed to this thread; it becomes another step mode later), opening a pull request on accept (next change), `policies/`, `tests/redteam/`, `.github/`, `docs/adr/`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An owner chooses, per project and with one passkey tap, which card steps need a passkey (Light, Balanced, Everything, or each step). Under Light a routine card is released when intake drafts it and accepted when its blind check passes, with no person and no passkey; send-back and reject are a press. Every such decision records the signed policy it relied on. Nuclear-grade, Safety/Material and restricted-lane work is signed every time. Kernel, API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
