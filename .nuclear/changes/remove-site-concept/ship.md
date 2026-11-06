# Ship: remove the site-concept pack and its examples

Release decision: **pull request for owner review; no merge or release is authorized by this record.**

- **Proposed:** merge to main.
- **Not claimed:** screenshots (PNG) in older evidence folders were not inspected for the old sample text; text search cannot see inside them. `TestInstalledCodexLeavesOnlyQualifiedFeatures` fails on this host before and after the change (verification E-04).
- **Owner decisions left open:** four frozen evidence logs (`board-m1/evidence/final-fix/08-accept-block-red*.log`, `platform-buildout/evidence/final-checks/review-web-red.log`, `platform-buildout/evidence/controller-grants/remote-source-pins.txt`) still show the old sample text or branch name; none contains BaseMark. The remote branch `mvp/site-concept` still exists.

Rollback: revert the merge of this branch. No migration, wire or data change.

Monitoring after merge: `pnpm cr doctor` and `pnpm cr start` on the owner's machine; any run whose role asked for the removed `cr-site` tool.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the packs and records are gone, nothing that used them breaks, no tracked file outside evidence logs names the removed subject, and the full suites pass on the merged tree.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
