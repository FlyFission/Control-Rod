# Phase 1: founding Member after a multi-user upgrade (thread on PR #21)

Codex connector thread 4429459842 on `services/api/src/admin.ts`, still open after merge. Checked against `main` at `d25deae` on 2026-11-06.

| Thread | Decision | Change and evidence |
|---|---|---|
| Resolve the bootstrap owner from preserved enrollment chronology (P1) | Accepted, fixed | Confirmed: `backfillCredentials` creates every pre 009 Member in one transaction, so all share `members.created_at`, and both `grantFoundingAuthorities` and the bootstrap check fell back to the lowest hashed id. With users `owner` then `alice`, alice received administrator, lane and policy authority. A new `firstMemberOf` orders Members by the earlier of their record and their first passkey's `credentials.created_at`, which keeps real registration order; the founding grant and the bootstrap check both use it. Test: `services/api/test/founding.test.ts` "goes to whoever registered first, even when a later user's id sorts first" fails on `main` (owner gets no qualification) and passes with the fix. |

An install that already ran the backfill on an affected build keeps whatever founding grant it made; this change does not reassign an existing qualification.
