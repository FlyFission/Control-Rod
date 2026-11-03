No major or blocking findings remain in `c98d937`.

- **Organization and lanes:** [seals.ts:260](/home/flyfission/worktrees/control-rod-p5records/services/api/src/seals.ts:260) refuses export unless exactly one organization exists, including suspended organizations in the count. Deferring lane filtering is acceptable for this interim scope because the ledger explicitly records that both proofs and `/events` lack it.
- **Run membership:** [seals.ts:225](/home/flyfission/worktrees/control-rod-p5records/services/api/src/seals.ts:225) rejects conflicting assignments and packages supported only by run announcements. Acceptable with the stated qualification: a seal authenticates recorded bytes, not the truth of earlier announcements.
- **Credential binding:** [seals.ts:128](/home/flyfission/worktrees/control-rod-p5records/services/api/src/seals.ts:128) resolves the credential by credential, member, and organization; requires preceding enrollment; and rejects preceding revocation. The recorded key digest is checked both server-side and [offline](/home/flyfission/worktrees/control-rod-p5records/services/api/src/seals.ts:318).

The [ledger row](/home/flyfission/worktrees/control-rod-p5records/docs/superpowers/execution/2026-10-29-workbench-buildout.md:116) and [UI wording](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/pages/Records.tsx:269) stay within those guarantees and specification 11.6–11.7, including external confirmation of signer identity and the unwitnessed-chain limitation. No additional actionable defects found.

API typechecking and in-memory probes using real signatures passed. Server probes used query doubles; PostgreSQL and browser suites were inspected but not executed.

MERGE