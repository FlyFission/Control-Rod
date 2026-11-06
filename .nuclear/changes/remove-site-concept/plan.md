# Plan: remove the site-concept pack and its examples

1. Remove the packs, the CAD conformance tests and the two change records ([basis](basis.md)).
2. Fix every caller: the start script, tool lists, the accept label, the API, web and daemon tests, the scripted agents.
3. Give the API tests a neutral fixture pack in the test folder, laid out in a temporary root.
4. Reword docs, ADRs, specs, plans and historical records; withdraw ADR 0018.
5. Search tracked files for the removed subject outside evidence logs (`evidence/grep-after.txt`).
6. Merge origin/main, then run the web, API, Go and Python suites on the merged tree and validate the touched records.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the packs and records are gone, nothing that used them breaks, no tracked file outside evidence logs names the removed subject, and the full suites pass on the merged tree.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
