# Ship: evidence payloads out of git

- **Not shipped as an ADR.** `docs/adr/0026-evidence-out-of-git.md` is not written. The text is `evidence/proposed-adr.md`.
- **Shipped as code.** `pnpm cr verify <record-directory>` checks an evidence manifest. `tools/check_evidence_manifest.py` fails a cited evidence file that is neither in git nor in a manifest. Existing records still pass.

## Still the owner's

1. Record a yes naming `docs/adr/` before that file is written. The question will name the pull request and the path.
2. Confirm the store recommendation, or name another store that stays retrievable if this repository or its GitHub org goes away. GitHub Actions artifacts are disqualified. Record the retention period yourself; this record does not type one.
3. A separate yes is required before `tools/check_evidence_manifest.py` is added to `.github/workflows/ci.yml`.

## Release decision

Non-trust. Open a pull request. Merge on green CI by the standing mechanics. Do not write `docs/adr/` in that pull request.

## Rollback

Revert the squash. `pnpm cr verify` on a proof file is unchanged. The record-directory check goes away with the revert. No payload was moved, so there is nothing to restore.

## Monitoring

The typescript CI job runs `services/api` tests, including the four outcome tests. The convention check is by-hand until a separate yes wires it into CI.

## Signature

No trust-surface yes is recorded. None was asked for a file this change writes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. The verify path and the convention check are in the tree.
2. The ADR is a proposal in this record, not a file under `docs/adr/`.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
