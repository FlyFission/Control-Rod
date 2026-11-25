# Trace: Choose what needs your passkey: cards finish on their own by default

| Need | Code | Test |
| --- | --- | --- |
| The floor allows only what a signed policy names | `kernel/src/transition.rs` decide | `transition::tests::without_the_policy_the_system_takes_no_human_action`, `under_the_policy_the_system_releases_and_accepts_a_pass_only`, `under_the_policy_a_person_needs_no_signature_except_to_override_independence`, `the_policy_never_lets_an_agent_take_a_human_action` |
| The choice is signed and versioned | `services/api/src/admin.ts` project.set-signing-policy, `signing-policy.ts` | `test/signing-policy.test.ts` "is itself signed with a passkey", "under Balanced..." |
| Light releases and accepts a pass on its own, with a record | `work.ts` autoDecide, decideTx, finishIntake, finishPreCheck | "under Light, releases a routine card on its own...", "under Light, accepts a pass on its own" |
| Never accepts a fail; return is a press | `work.ts` decideTx, kernel | "never accepts a failed check on its own, and lets a person return it with a press" |
| A press binds what was seen | `work.ts` decideTx expected_digest, `app.ts` | "refuses a press made on a card that changed since it was shown" |
| High-consequence work is always signed | `signing-policy.ts` routinePackage | "does not cover high-consequence work" |
| Settings and nudges in the app | `apps/web/src/components/SigningSettings.tsx`, `features/board/AutonomyOffer.tsx`, `components/DecisionBar.tsx`, `lib/decide.ts`, `lib/signing.ts` | `apps/web/src/components/signing.test.tsx` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An owner chooses, per project and with one passkey tap, which card steps need a passkey (Light, Balanced, Everything, or each step). Under Light a routine card is released when intake drafts it and accepted when its blind check passes, with no person and no passkey; send-back and reject are a press. Every such decision records the signed policy it relied on. Nuclear-grade, Safety/Material and restricted-lane work is signed every time. Kernel, API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
