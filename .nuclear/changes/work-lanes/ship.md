# Ship: work lanes

Release decision: **authorized for the diff at head `cbabfdf8`** by the owner's recorded yes in the Signature table. The independent different-vendor check was not run on this diff; that residual risk is accepted by the same yes. No earlier release was authorized by this record.

- Rollback: revert the merge. The `work_lanes` field on a project body can stay; nothing older reads it. Migration 027 only allows that field to change.
- Merge order: after the Plant redesign commits already on this pull request.
- Monitoring after merge: a project with no lanes shows the same six bay names as before; a Software project shows Frontend, Backend, Platform, Data, Tests and Docs.

## Signature

| Field | Entry |
|---|---|
| Decision | **Approved.** Merge pull request #167 at head `cbabfdf8` once CI is green on that diff; the yes was extended to head `3f5e4942` (wildcard work-lane patterns) and to head `179b57e1` (the thread's three work-lanes bug fixes: default-lane retention, reduced-motion annunciator, lane-editor reset), all on green CI. |
| Question | "Do you approve merging #167 at head cbabfdf8, which touches the trust surface spec/ (additive work-lanes fields in spec/tenancy.tsp, spec/api.tsp, regenerated contracts, migration 027) plus the visual board work and the merge fixes (board e2e mock contract, nav toggle target-size, tenancy/workbench migration teardown)?" — then, on each later push: "extend the recorded yes to head 3f5e4942 (wildcard work-lane path patterns)?" and "extend the recorded yes to 179b57e1 (three work-lanes bug fixes)?" |
| Answer | "Yes" to each, 2026-11-24 sign-off forms: the original ask, the wildcard re-ask, and the three-fixes re-ask, same Claude Code session. |
| When and where | 2026-11-24, Claude Code session sign-off forms (three asks in one session). |
| Head when asked | `cbabfdf8`, extended to `3f5e4942`, then to `179b57e1`. Any further push re-opens the question again; only this signature-recording commit may follow it. |
| Not the signature | The owner's tap on 2026-11-24 16:34 UTC ("Yes, presets plus custom lanes") is recorded in [basis](basis.md#owner-decisions) as decision D1. It approved the direction, not this diff. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
