# Ship: evidence payloads out of git

- **Not shipped as an ADR.** `docs/adr/0026-evidence-out-of-git.md` is not written. The text is `evidence/proposed-adr.md`.
- **Shipped as code.** `pnpm cr verify <record-directory>` checks an evidence manifest. `tools/check_evidence_manifest.py` fails a cited evidence file that is neither in git nor in a manifest. Existing records still pass.

## Still the owner's

Closed 2026-11-25. The owner said "Payloads stay in git. Stop the ADR here." No store. No retention period. `docs/adr/` stays unwritten. The release-workflow yes for `.github/workflows/release.yml` is a separate open item, not part of this decision.

Wiring `tools/check_evidence_manifest.py` into `.github/workflows/ci.yml` still needs its own yes. It is not required while payloads stay in git.

## Release decision

Non-trust. Open a pull request. Merge on green CI by the standing mechanics. Do not write `docs/adr/` in that pull request.

## Rollback

Revert the squash. `pnpm cr verify` on a proof file is unchanged. The record-directory check goes away with the revert. No payload was moved, so there is nothing to restore.

## Monitoring

The typescript CI job runs `services/api` tests, including the four outcome tests. The convention check is by-hand until a separate yes wires it into CI.

## Signature

| Decision | Question | Answer | When | Where | Recorded by |
|---|---|---|---|---|---|
| Do not write ADR 0026. Payloads stay in git. | Which is true: you already keep a copy outside this GitHub org, you do not and payloads stay in git, or you want a concrete setup spelled out first? | 2. Payloads stay in git. Stop the ADR here. | 2026-11-25T21:32:25Z | this chat | the agent, not signed for the owner |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. The verify path and the convention check are in the tree.
2. The ADR is a proposal in this record, not a file under `docs/adr/`.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
