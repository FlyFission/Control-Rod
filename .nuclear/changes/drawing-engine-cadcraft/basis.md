# Basis: CADCraft drawing engine

**Purpose:** State what must stay true for Control Rod's drawings to be trusted from the first sheet.

**Change slug:** `drawing-engine-cadcraft`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `drawing-engine-cadcraft`
- **Related risk record:** `risk.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Decision this basis supports:** whether ADR 0018 and its sheet template, renderer and checks can merge as the drawing standard.

## Mission / need

Recent AI-generated drawings often have weak or missing borders and title blocks. Control Rod's drawings carry engineering decisions, so the bar is set on day one: a full border, a title block filled from records, a revision block, and a notes column that surfaces general notes, references, inputs, holds, assumptions and how the sheet was prepared.

## Protected outcomes

| Protected outcome | Why it matters | Evidence needed |
|---|---|---|
| Every sheet is drawn from a template and a record, with no field typed by an agent. | A title block that drifts from the register misleads every reader. | Render from template plus record alone (CAD-01). |
| Plots are true size with searchable title block and notes. | Reviewers search and print; a wrong scale or image-only text fails both. | ANSI D PDF at 2448 x 1584 pt with every value and heading as text (CAD-02). |
| Files keep their content through save and reopen. | Lost entities change a drawing silently. | DXF, DWG and second-cycle DWG checks (CAD-03 to CAD-05); foreign DXF census (CAD-06). |
| A sheet that would break the standard is never written. | A crowded or incomplete sheet is worse than none. | Refusals for a missing field, an overflowing value and overflowing notes (CAD-07 to CAD-09). |
| Only permissive or weak file-level licenses enter the drawing path. | Open-core license plan. | License review recorded in `verification.md`. |

## Unacceptable outcomes

| Unacceptable outcome | Consequence | Prevent / detect / mitigate |
|---|---|---|
| A customer DWG is saved by CADCraft and loses content. | A deliverable changes without anyone noticing. | Customer files are read-only (ADR 0018 condition 3) until a real-file corpus passes in AutoCAD. |
| A CADCraft upgrade changes output silently. | Sheets shift between revisions. | Pinned by commit in the agent baseline; any upgrade reruns the checks. |
| Notes overlap the title block or revision block. | Unreadable or ambiguous notes. | Notes measured with calibrated font metrics; overflow is refused. |
| An agent reaches the network or the desktop app through CADCraft. | Data leaves the sandbox or an agent edits a live session. | Headless only, no network, control port and app bridge off (condition 2). |

## Assumptions, constraints, and invalidation triggers

| Assumption / constraint | Basis or source | Invalidation trigger | Owner |
|---|---|---|---|
| Single-line text extents in CADCraft are exact. | Calibration probe and the rendered sheet match. | Any CADCraft upgrade or font change. | Ben Huffer |
| CADCraft-written DWG opens correctly in AutoCAD. | Not shown; upstream states it is unchecked. | A real-file corpus check in AutoCAD. Until then customer files stay read-only. | Ben Huffer |
| DejaVu Sans is available wherever sheets render. | Installed in the build image. | A host without it; the renderer refuses when the font is missing. | Ben Huffer |
| A generated foreign DXF stands in for customer files. | ezdxf writes standard DXF R2018. | First real customer file. | Ben Huffer |

## Grounding status

| Claim area | Grounded in | Status |
|---|---|---|
| CADCraft capability and gaps | Upstream ROADMAP (reviewed 2026-10-10), `docs/gaps.md`, `docs/file-format-parity.md`, and our own build at commit `e4214f7` | pass |
| License of CADCraft and its DWG library | Upstream LICENSE files; acadrust on docs.rs (MPL-2.0) | pass |
| Drawing format practice | ASME Y14.1 sheet format and title block practice, as applied in the template | pass |

## Interfaces and trust boundaries

- **Internal interfaces affected:** none in the product runtime yet; the renderer is a pack script.
- **External services/APIs affected:** none. CADCraft runs as a local process over stdio.
- **Data classes affected:** example records only.
- **Human approval boundaries:** the owner merges and decides when customer files may be edited.
- **AI/model/tool authority boundaries:** agents supply records; the renderer draws. Agents never call CADCraft drawing commands directly for title blocks or borders.

## Dependency / model / supplier intended use

| Dependency/model/service | Intended use | Consequence if wrong/unavailable/compromised | Evidence or compensating control | Revalidation trigger |
|---|---|---|---|---|
| CADCraft `e4214f7` (MIT OR Apache-2.0) | Draw, save and plot sheets headless | Wrong geometry, lost content or wrong plots | Nine conformance checks; pinned commit | Any upgrade |
| acadrust (MPL-2.0), inside CADCraft | DWG read and write | DWG content lost | CAD-04, CAD-05; customer files read-only | Any upgrade |
| Pillow 12.3.0 (HPND) | Font metrics for wrapping and fit checks | Notes overflow or false refusals | Calibrated against CADCraft extents each run | Version change |
| ezdxf 1.4.5 (MIT), test only | Write and census the foreign DXF | Weak fidelity check | Independent library from CADCraft | Version change |
| pypdf 5.9.0 (BSD-3-Clause), test only | Read PDF size and text | Weak plot check | Independent library from CADCraft | Version change |

## Derived requirements or claims

| ID | Requirement / claim | Basis | Design feature or control | Evidence planned |
|---|---|---|---|---|
| C-001 | A sheet renders from template and record alone. | Protected outcome 1 | `render_sheet.py` reads only the template and record | CAD-01 |
| C-002 | The PDF is ANSI D at true size with searchable title block and notes headings. | Protected outcome 2 | Plot at scale 1 on ANSI D; TrueType text style | CAD-02 |
| C-003 | The sheet reopens identical from DXF and from DWG, and a second DWG cycle changes nothing. | Protected outcome 3 | CADCraft save paths | CAD-03, CAD-04, CAD-05 |
| C-004 | A foreign DXF keeps every entity, its xdata, attributes and layers through a CADCraft save. | Protected outcome 3 | CADCraft DXF round trip | CAD-06 |
| C-005 | Sheets that would break the standard are refused before anything is written. | Protected outcome 4 | Field, fit and overflow checks in the renderer | CAD-07, CAD-08, CAD-09 |
| C-006 | The drawing path uses only permissive or file-level weak copyleft licenses. | Protected outcome 5 | License review | Recorded licenses |

## Design outline

The template is data: sheet size, margins, zones, revision block columns, title block cells with attribute tags and text heights, and notes sections. The renderer checks the record against the template, wraps notes with font metrics calibrated against CADCraft, measures each notes section, refuses any overflow, then draws the border, zones, revision block, title block (as a block with attributes) and notes column through CADCraft's MCP server, and saves DXF, DWG, PDF and PNG with a manifest of digests.

## Required links

- `risk.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- `docs/adr/0018-drawing-engine-cadcraft.md`, `packs/capital-projects/drawings/`, `tests/conformance/cad/run.py`

## Exit criteria

- Builder and reviewer can say what must stay true.
- Every assumption has an invalidation trigger.
- Evidence needs flow into `verification.md`.

## Source-lineage note

Basis structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
