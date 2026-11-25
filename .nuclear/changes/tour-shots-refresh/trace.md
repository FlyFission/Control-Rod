# Trace: Refresh the README and website tour screenshots

| Claim ID | Need | Code | Test |
| --- | --- | --- | --- |
| TS-01 | Current tour pictures | `docs/assets/readme/app/*.png`, `apps/web/e2e/readme-shots.spec.ts` | readme-shots spec |
| TS-02 | Alt text matches the picture | `README.md`, `site/index.html`, `site/app.js` | `scripts/test/site.test.mjs` |
| TS-03 | No "undefined running" | `apps/web/src/lib/next.ts` | web `src/lib` vitest |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The README and website tour pictures come from the current main (plain column names, calm drawer, resizable rail, one SCRAM button), the board alt text names the columns the picture shows, and no card reads "undefined running". The shots spec, site tests and web lib tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
