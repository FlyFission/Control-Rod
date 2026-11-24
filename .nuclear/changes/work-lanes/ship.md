# Ship: work lanes

Release decision: **not authorized.** The `spec/` change is a trust-surface edit and its signature is pending (see Signature). No release is authorized by this record.

- Rollback: revert the merge. The `work_lanes` field on a project body can stay; nothing older reads it. Migration 027 only allows that field to change.
- Merge order: after the Plant redesign commits already on this pull request.
- Monitoring after merge: a project with no lanes shows the same six bay names as before; a Software project shows Frontend, Backend, Platform, Data, Tests and Docs.

## Signature

| Field | Entry |
|---|---|
| Decision | **Pending.** To be asked once the diff is final. |
| Question | Not yet asked. It must name pull request #167 as it stands and say it touches a trust surface (`spec/`). |
| Answer | None yet. |
| When and where | Not yet given. |
| Head when asked | Not yet asked. |
| Not the signature | The owner's tap on 2026-11-24 16:34 UTC ("Yes, presets plus custom lanes") is recorded in [basis](basis.md#owner-decisions) as decision D1. It approved the direction, not this diff. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
