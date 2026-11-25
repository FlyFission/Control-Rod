# Basis: A check counts even when the checker writes criterion results nobody asked for

On 2026-11-25, after #222, the sandbox card's Grok check again passed every criterion and was voided with "criterion-results.json does not match the schema". The card came from quick add, not from a prepared package, so the brief never asked for criterion results, and #222's template never reached it. The daemon validated the file whenever it existed. Found on the owner's Mac. The same run showed `controlrod cards` printing package statuses with no space ("in-verification5A574D7A...").

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A pre-check whose inputs carry no criterion results schema settles on its verdict alone. A criterion-results.json it writes anyway is noted and not sent, and never voids the check. A prepared check is unchanged. `controlrod cards` columns read in the board's words with a space before the id. Go vet, the runner tests that run without bubblewrap, and the scripts tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
