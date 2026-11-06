# Phase 1: sessions after a passkey is revoked (thread on PR #21)

Codex connector thread 4429496182 on `services/api/src/auth.ts`, still open after merge. Checked against `main` at `d25deae` on 2026-11-06.

| Thread | Decision | Change and evidence |
|---|---|---|
| Recheck the authenticating credential before starting a session (P2) | Accepted, fixed, and widened | Confirmed two gaps. The one the thread names: `startSession` checked only membership under the organization lock, so a revocation committing after `assertionVerify` still let the sign-in through. The wider one: sessions did not record their passkey, so revoking a passkey never ended a session it had already started. Migration `018-session-credentials` adds `sessions.credential_id`. `startSession` now takes the passkey and, under the same lock, inserts only while that passkey is the person's own and not revoked. `sessionUser` refuses a session whose passkey is revoked. `credential.revoke` deletes the sessions that passkey started, and the Member's sessions from before 018 (which name no passkey), so those people sign in again with a usable passkey. Tests: `services/api/test/session-revoke.test.ts` (three cases), all failing on `main` and passing with the fix. |

Migration 018 is additive and joins `released.json`; its down step is in the preservation tests.
