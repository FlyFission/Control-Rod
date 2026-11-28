# Risk: Scope drift and Plant bays use the files a patch changes

- R-01: a non-checkout card that delivers a `.patch` as a document is now read as a change to the files in it. That is closer to what the patch means than its file name was; drift and bays are advisory.
- R-02: the figure projection now loads patch bytes for each package's latest author run. Only `.patch`/`.diff` outputs are loaded, and run outputs are already capped by the daemon (`MaxOutputFile`, `MaxOutputTotal`).
- R-03: the figure paths now come from the latest author run with outputs instead of every output at the revision, so an earlier round's files no longer pull a card toward a bay. This is intended.
- No trust surface is touched. The machine gate (not built) will need the same file list; this module is where it lives.

## Selected mode

- **Mode:** Standard
- Basis: API-only, reversible by revert, no data, route or contract change, no trust surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a checkout card, scope drift names the repository files whose change differs between author rounds (never `changes.patch` or `RESPONSE.md`), and the Plant places the card by the files its patch touches. Cards whose deliverables are the files themselves behave as before. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
