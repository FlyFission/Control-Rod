# Trace: offline proof verification for auditors

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| A-1 | A downloaded proof is checked with no database, server or sign-in, by the control plane's own function. | E-01, E-02 | done |
| A-2 | Tampering, missing entries and a cut tail fail with the problem named; non-bundle files are refused. | E-01 | done |
| A-3 | A sealed bundle passes and the output names what it cannot settle. | E-03 | pending CI |
| A-4 | Auditors have a guide to sampling and to the limits of the records. | `docs/auditing.md` | done |
| A-5 | The owner has reviewed the change. | E-04 | open |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An auditor holding a downloaded inclusion proof can run `pnpm cr verify <file>` with no database or sign-in and get a pass or a named failure from the control plane's own `verifyInclusion`, with what it cannot settle stated; `docs/auditing.md` explains sampling and limits; tests cover pass, tamper, cut tail, sealed bundle and non-bundle files; CI is green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
