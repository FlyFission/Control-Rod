# Policies and Administration (5.4), Codex round 1: adjudication

Reviewed origin/phase-5/budgets...14fff3d5. All nine findings accepted.

| Finding | Disposition |
|---|---|
| 1 Invitation token lost to the root redirect | Fixed at the root. `capture-invitation.ts` is imported first by `main.tsx` and moves the token from the fragment into memory before the router exists. SignIn reads it from memory. |
| 2 Bootstrap could lock out qualification administration | Fixed. Bootstrap always issues administrator and policy authority (both are needed to issue any qualification); lane is optional. Test asserts the payload. |
| 3 Registry over-exposes personal and attestation evidence | Fixed. Explicit projections (`RegistryQualification`, `RegistryCredential` in the contract): no license numbers, reasons or attestation evidence for anyone; passkeys are every Member's for an administrator, otherwise the viewer's own. API test with a non-administrator. |
| 4 Enrollment discards its invitation | Fixed. The description says enrollment creates the invitation; the result shows `member.user_name` and the link. Test added. |
| 5 Descriptions omit payload values or effects | Fixed: project overlays, every license in words, bootstrap disciplines and roles, removal's ended sessions and delegations. |
| 6 Token left in the address during registration | Fixed by 1: it leaves the address before anything renders and stays in memory for retries. Test asserts the address is clear before the first click. |
| 7 Budgets cannot be changed | Fixed. A "Change a budget" form sends `budget_id` with only the fields that change, in the budget's own unit. Test added. |
| 8 Checkbox hints not associated | Fixed. Group hints have ids and the fieldset is `aria-describedby` them. |
| 9 Ledger overclaims | Fixed. Row 5.4 rewritten to what the code does, with its limits; the signing test now compares the challenge request's payload with the submitted one. |

Also found in a browser pass before this review: field labels lost their stacked layout and long passkey options overflowed their card at desktop width; fixed in `styles.css` and checked by screenshot at 1280 and 390 pixels (no horizontal overflow), with the axe pass on the Policies page clean.
