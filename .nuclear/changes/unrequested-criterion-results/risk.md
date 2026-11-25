# Risk: A check counts even when the checker writes criterion results nobody asked for

- **Prepared checks unchanged.** With the schema staged, a malformed file still voids the check, and the server still requires criterion results for prepared verification.
- **Unprepared checks.** The verdict is validated as before. The ignored file never reaches the server, which never asked for it.
- **No trust surface is touched.**

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; no kernel, policy, spec or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A pre-check whose inputs carry no criterion results schema settles on its verdict alone. A criterion-results.json it writes anyway is noted and not sent, and never voids the check. A prepared check is unchanged. `controlrod cards` columns read in the board's words with a space before the id. Go vet, the runner tests that run without bubblewrap, and the scripts tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
