# Trace: CADCraft drawing engine

**Purpose:** Tie each claim to its basis, control, evidence and merge stance.

**Change slug:** `drawing-engine-cadcraft`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `drawing-engine-cadcraft`
- **Related records:** `basis.md`, `verification.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Requirements cross-reference:** ADR 0018 conditions 1 to 6

## Trace summary

| ID | Claim | Basis link | Control / design feature | Verification evidence | Ship posture | Status |
|---|---|---|---|---|---|---|
| C-001 | A sheet renders from template and record alone. | `basis.md#derived-requirements-or-claims` | Renderer reads only template and record | E-001 (CAD-01) | Merge | pass |
| C-002 | The PDF is ANSI D at true size with searchable title block and notes headings. | `basis.md#protected-outcomes` | Plot at scale 1; TrueType style | E-001 (CAD-02) | Merge | pass |
| C-003 | The sheet reopens identical from DXF and DWG, and a second DWG cycle changes nothing. | `basis.md#protected-outcomes` | CADCraft save paths | E-001 (CAD-03 to CAD-05) | Merge | pass |
| C-004 | A foreign DXF keeps entities, xdata, attributes and layers through a CADCraft save. | `basis.md#protected-outcomes` | CADCraft DXF round trip | E-002 (CAD-06) | Merge for read use; editing customer files waits on C-007 | pass |
| C-005 | Sheets that would break the standard are refused before anything is written. | `basis.md#protected-outcomes` | Field, fit and overflow refusals | E-001 (CAD-07 to CAD-09) | Merge | pass |
| C-006 | The drawing path uses only permissive or file-level weak copyleft licenses. | ADR 0002 | License review | E-003 | Merge | pass |
| C-007 | CADCraft-written DWG opens cleanly in AutoCAD. | `basis.md#assumptions-constraints-and-invalidation-triggers` | Real-file corpus with upstream | none yet | Do not claim | planned |

## Evidence chain

```text
Risk: drawings carry decisions; a wrong title block or lost content misleads.
  -> Basis: render from records, true-size searchable plots, no loss on save, refuse bad sheets, permissive licenses.
  -> Control: template as data; renderer with refusals; pinned CADCraft; customer files read-only.
  -> Verification: nine deterministic checks, all passing; license review.
  -> Ship: merge once the owner approves; customer-file editing waits on the AutoCAD check.
```

## Open trace gaps

| Gap | Why it matters | Disposition |
|---|---|---|
| No AutoCAD check of CADCraft-written DWG | The most common customer tool has not opened our files. | Planned with upstream's real-file corpus; customer files stay read-only. |
| Foreign file is generated | A real customer file may hold entities ezdxf does not write. | Add real files to the corpus. |
| Checks not in CI | Upgrades could skip the checks. | Add a CI job with the owner's signature once a pinned build is cached. |

## Required links

- `basis.md`, `verification.md`, `ship.md`
- `docs/adr/0018-drawing-engine-cadcraft.md`, `tests/conformance/cad/run.py`

## Exit criteria

- Every claim has a status.
- Planned claims are not used as merge evidence until they pass.

## Source-lineage note

Trace structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
