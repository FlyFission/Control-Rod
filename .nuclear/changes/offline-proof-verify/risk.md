# Risk: offline proof verification for auditors

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-21 instruction to work toward implementation and make the system auditable.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or `spec/` file. The check itself (`verifyInclusion`) is reused unchanged.
- Scope: `services/api/src/verify-bundle.ts`, `services/api/test/verify-bundle.test.ts`, one case in `services/api/test/seals.test.ts`, `scripts/cr.mjs`, `apps/web/src/pages/Records.tsx`, `docs/auditing.md`, `docs/qa-standards.md`, `docs/status.md`, `docs/README.md`, and this record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The tool says OK for more than the bundle proves (whose key it is, truncation after the seal, an unsealed head). | Every OK names what is still to confirm, says unsealed bundles authenticate nothing, and repeats "Local chain, not witnessed"; `docs/auditing.md` lists the limits. | An OK line with no limit stated. |
| R-02 | The offline check diverges from the control plane's. | The CLI calls `verifyInclusion` itself, not a copy; the sealed-bundle test runs the same bundle through both. | A second implementation of the check. |
| R-03 | A malformed or hostile file crashes the tool or passes. | Non-JSON and non-bundle files exit 2; exceptions from the check are a FAIL; tamper cases exit 1 in tests. | Any path that exits 0 without `verifyInclusion` returning ok. |

## Selected mode

- **Mode:** Standard
- Basis: a new read-only command and documentation that auditors may rely on; no state change; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An auditor holding a downloaded inclusion proof can run `pnpm cr verify <file>` with no database or sign-in and get a pass or a named failure from the control plane's own `verifyInclusion`, with what it cannot settle stated; `docs/auditing.md` explains sampling and limits; tests cover pass, tamper, cut tail, sealed bundle and non-bundle files; CI is green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
