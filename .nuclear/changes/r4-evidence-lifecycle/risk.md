# Risk: evidence payloads out of git

- **Mode:** Standard
- Execution owner: authoring agent under the 2026-11-24 ten-x amendment program, Phase 4.
- Decision owner: Ben Huffer. `docs/adr/` is not edited. The proposed ADR is `proposed-adr.md` in this record.
- Scope: `services/api/src/verify-evidence.ts`, the verify CLI dispatch, `tools/check_evidence_manifest.py`, their tests, `docs/auditing.md`, `docs/collaboration.md`, and this record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | `pnpm cr verify` says verified when the payload is missing or the digest does not match. | The three outcomes are tested. Incomplete and tampered lines are the only lines printed in those cases. | A test or a run that prints VERIFIED for a missing or mismatched payload. |
| R-02 | The convention check fails records whose payloads are already in git, or accepts a cited file that is neither in git nor in a manifest. | `tools/check_evidence_manifest.py` passes on the current `.nuclear/changes` tree. A fixture with a cited missing file fails, and a manifest with a digest and no payload passes. | The current tree fails, or the missing-file fixture passes. |
| R-03 | An ADR file is written in `docs/adr/` without the owner's recorded yes. | This change does not add or edit a file under `docs/adr/`. | Any path under `docs/adr/` in the diff. |

## Selected mode

- **Mode:** Standard
- Basis: a verify path and a convention check. The ADR itself stays a proposal.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. `pnpm cr verify` on a record directory reports incomplete, verified, or tampered, and does not say verified for a missing or mismatched payload.
2. Existing records pass the convention check. A new-style manifest passes. A cited missing file without a manifest fails.
3. No file under `docs/adr/` changes. The proposed text is in this record.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
