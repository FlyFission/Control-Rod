# Policies and Administration (5.4), Codex round 2: adjudication

Reviewed e74a255..head. Round 1 fixes confirmed; five findings, all accepted.

| Finding | Disposition |
|---|---|
| 1 Qualification administration lockout by ordinary replacement | Fixed in the control plane, not only the form: `keepAdministration` (admin.ts) refuses any suspension, removal, revocation or replacement that leaves no active administrator, or no active Member with both administrator and policy authority, comparing before and after so an existing state is never the reason. It replaces the administrator-only check. API test: the sole issuer dropping policy authority is refused. |
| 2 Policy edit clears attestation formats | Fixed. Lines fields start from `spec.initial` lists; the policy form starts from the formats in force. Test: changing the near line keeps `["packed","tpm"]`. |
| 3 Descriptions omit effects and reasons | Fixed. Every description ends with the recorded reason (in CommandForm, for every form with a reason); suspension and removal say open invitations are used up; reactivation says a person with no passkey needs a new invitation. Tests updated. |
| 4 Withheld passkeys shown as none | Fixed: "Not available to you" for other Members when the viewer is not an administrator. Test added. |
| 5 Ledger overclaims | Fixed: row 5.4 now says what descriptions contain and points to the tests that check it. |
