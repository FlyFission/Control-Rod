| Item | Confirmation |
|---|---|
| SEC-10 | Fixed. [auth.ts:70](services/api/src/auth.ts:70) preserves the recipient; [auth.ts:202](services/api/src/auth.ts:202) rejects another person's credential. |
| SEC-14 | Fixed. [admin.ts:154](services/api/src/admin.ts:154) checks own keys, rejecting inherited names with 400 before calling `.test`. |
| New critical or major defects | None found. Missing `issued_to` retains prior behavior. Recipientless login remains valid and still requires an active member's verified passkey. |
| Verification | Static inspection only. Round 3 tests read; none run. No files modified. The administrative test also mismatches command names, so it does not independently prove recipient enforcement. |

MERGE