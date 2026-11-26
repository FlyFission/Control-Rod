# Basis: A check counts when the stream names the dated snapshot of the pinned model

After #239, the three Claude (Haiku) card checks on the owner's Mac (R-0836fe8a, R-9e29d812 and R-07ccb24a) ran to the end. All three were refused with: "the stream named claude-haiku-4-5-20251001, which is outside the pinned model, so provenance is unknown and the check cannot count". Claude Code's init line names the pinned id, claude-haiku-4-5, and each message names the dated snapshot that the id serves. The registry (daemon/internal/runner/models.json) lists only the undated name, so every Claude check on a subscription would be refused this way.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A check whose stream names the pinned model and its dated snapshot (<id>-YYYYMMDD) counts, in the daemon and the server alike; a shorter alias, a different model, a malformed date, or a stream that never names the pinned id are still provenance unknown. Go and API tests pin both sides, and typecheck and vet pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
