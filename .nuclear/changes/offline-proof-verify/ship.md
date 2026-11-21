# Ship: offline proof verification for auditors

Release decision: **proposed merge; the owner retains the decision.**

- **Proposed:** merge `pnpm cr verify`, the Records page hint, `docs/auditing.md` and the row updates.
- **Not claimed:** that the chain is witnessed, that a bundle proves whose key signed it, or that this is an audit program. Any compliance or certification claim.
- **Next steps needing the owner's yes (trust surfaces):** an audit export for a time window (new contract in `spec/`); QA overlays as Cedar floors in `policies/`.

Rollback: revert the commit. A read-only command and documentation; no schema, wire or state change.

Monitoring after merge: if `verifyInclusion` or the bundle shape changes, `verify-bundle.test.ts` and the sealed case in `seals.test.ts` must still pass.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An auditor holding a downloaded inclusion proof can run `pnpm cr verify <file>` with no database or sign-in and get a pass or a named failure from the control plane's own `verifyInclusion`, with what it cannot settle stated; `docs/auditing.md` explains sampling and limits; tests cover pass, tamper, cut tail, sealed bundle and non-bundle files; CI is green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
