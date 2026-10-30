# Administrative commands review adjudication (task 1.5)

Independent security review by Codex (codex-cli 0.166.0, read only), 2026-10-30: [admin-codex-round1.md](admin-codex-round1.md). Fifteen findings: one critical, twelve major, two minor. Verdict: block. All accepted.

| ID | Finding | Fix | Test (`test/admin.test.ts`) |
|---|---|---|---|
| SEC-01 | Any signed in Member could register a passkey under another user name, including an administrator's | Registration has exactly three paths: the very first passkey; a new person with an administrator's one time, expiring invitation (`member.enroll`, `member.invite`; only the token hash is stored, consumed in the registration transaction); or a Member adding a passkey to their own account after signing with one they hold (`/auth/step-up/options`) | SEC-01: other names refused, step up required and must come from the same account, invitations single use and expiring |
| SEC-02 | Qualification revocation could cross organizations | The target Member is resolved in the caller's organization first | SEC-02 |
| SEC-03 | Bootstrap was open to any Member and could reopen | Bootstrap belongs to the organization's first Member and is used up once any administrator qualification has ever been issued | bootstrap tests, SEC-03 |
| SEC-04 | Reissuing a qualification could drop the last administrator | The last administrator rule applies to reissues | SEC-04 |
| SEC-05, SEC-06, SEC-12 | Races on the last administrator, the last passkey and double approval | Every administrative command (and every registration) takes one organization lock before any check | SEC-05 (mutual suspension), SEC-12 (concurrent approval) |
| SEC-07 | Suspended or removed Members kept access | Sessions, sign in and every signature require an active membership; suspension and removal end sessions, administrative challenges and open invitations | SEC-07, suspension and removal tests |
| SEC-08 | Theme selection could overwrite a concurrent suspension | It updates only `office_theme`, and only for an active Member, under the organization lock | theme test |
| SEC-09 | Revocation was not atomic with execution | The signing credential travels with the command and is rechecked under the lock with the caller's authority | SEC-09 |
| SEC-10 | Revocation voided only administrative challenges | Inactive Members cannot redeem any challenge (sign in and every assertion check membership); revocation and departure delete administrative challenges. Binding every challenge to an authorization epoch is left for signing authority checks (task 1.14) | SEC-07, SEC-09 |
| SEC-11 | Delegation checked only the role name | A delegation needs a discipline the delegator holds, a project in the organization if named, and runs forward for at most a year | delegation tests |
| SEC-13 | Invalid policy settings failed open | Policy settings are typed (`autonomy_ceiling` 0 to 3; unknown keys refused) on proposal and approval; an unreadable ceiling fails closed to 0 | SEC-13 |
| SEC-14 | Expected refusals surfaced as 500s | Unique, reference and check violations and contract refusals become 409, 404 and 400 refusals; the repository project is checked first | SEC-14 |
| SEC-15 | Tests could pass for the wrong reason | Fresh sign in after suspension, redemption after revocation, replay with a passkey whose counter stays at zero, and real concurrency | SEC-07, SEC-09, SEC-15, SEC-05, SEC-12 |

## Round 2

Codex confirmed SEC-02 to SEC-06, SEC-08, SEC-09, SEC-11 to SEC-13 fixed and found the rest partial, with one new critical ([admin-codex-round2.md](admin-codex-round2.md)).

| Item | Disposition |
|---|---|
| New critical: an invitation for a Member who already had a passkey let its redeemer take over that account | **Fixed**: invitations are only issued for, and only redeemable by, a Member with no passkey yet (checked in the registration transaction) (test) |
| New major: a pending passkey addition outlived suspension or the revocation of the passkey that authorized it | **Fixed**: completion rechecks, under the organization lock, that the Member is active and the authorizing passkey is valid; departure and credential revocation void every pending challenge of that person (test) |
| SEC-07 session created in the gap while a suspension commits | **Fixed**: sessions start under the organization lock and only for an active Member; refusals are 401 or 403 answers |
| SEC-10 non administrative challenges survived | **Fixed**: every signing challenge records who it was issued to (kept beside the data, never returned with it); departure and revocation void all of them (test) |
| SEC-14 `settings: null` | **Hardened**: `null` was already treated as no settings, never a server error; it is now refused as the wrong shape (test) |
| SEC-15 test gaps | **Fixed**: replay after a successful first use with a counter that stays at zero, a removed Member signing in with a passkey that was never revoked, and two passkeys revoked at once (tests) |
| SEC-01 | Closed by the two items above |

## Required links

[Execution ledger](../../../../../../docs/superpowers/execution/2026-10-29-workbench-buildout.md), [command inventory](../../../../../../docs/commands/inventory.md).

## Exit criteria

Every finding has a fix and a test, confirmed by a second independent read before merge.

## Source-lineage note

Review output retained in `admin-codex-round1.md` (absolute paths trimmed); dispositions by the authoring session.
