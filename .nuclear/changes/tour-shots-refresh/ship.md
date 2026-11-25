# Ship: Refresh the README and website tour screenshots

Release decision: **approved by the owner, 2026-11-25 11:10 UTC.**

## Signature

Owner (sole maintainer): Ben Huffer, yes, by decision card "Merge PR 212 (refreshed tour screenshots) into main?" in the project thread, 2026-11-25 11:10 UTC. Blind check: Codex GitHub review, no findings.

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: the README and the site tour show the plain column names and the current top bar; the readme-shots workflow may push the same pictures again on this PR.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The README and website tour pictures come from the current main (plain column names, calm drawer, resizable rail, one SCRAM button), the board alt text names the columns the picture shows, and no card reads "undefined running". The shots spec, site tests and web lib tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
