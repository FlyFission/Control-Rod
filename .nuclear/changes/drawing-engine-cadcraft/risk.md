# Risk: CADCraft drawing engine

**Purpose:** Sort the adoption of CADCraft as the drawing engine by risk and name the least evidence needed before it merges.

**Change slug:** `drawing-engine-cadcraft`
**Owner:** Ben Huffer, FlyFission Consulting Group
**Date:** 2026-10-22
**Lifecycle phase:** Prove
**Status:** Ready for owner review on branch `phase-0/drawing-engine`.

---

## Change identity

- **Slug:** `drawing-engine-cadcraft`
- **PR / issue:** pull request from `phase-0/drawing-engine`, to be opened by the owner's decision
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Current lifecycle phase:** Prove
- **Summary:** Propose CADCraft (`storytold/cadcraft`, MIT OR Apache-2.0) as the engine for every sheet, markup and sketch Control Rod produces. Adds ADR 0018, a generic ANSI D sheet template with a right-hand notes column, a renderer that draws sheets from template plus record through CADCraft's MCP server, an example record, and nine conformance checks.

## Mission anchor

- **Objective:** every drawing Control Rod produces carries a complete, correct border, title block, revision block and notes column, filled from records, from the first sheet onward.
- **Success criterion (done when):** the nine conformance checks pass against a pinned CADCraft build, ADR 0018 states the conditions and known upstream gaps, and this packet validates.
- **Non-goals:** no editing of customer DWG or DXF files; no product runtime integration, sandbox wiring or CI job in this change; no claim that CADCraft matches AutoCAD.

## Questioning-attitude summary

| Question | Answer |
|---|---|
| What could this change quietly get wrong? | A sheet whose title block disagrees with the record, text that overflows its cell, notes that overlap the title block, or a file that loses content when CADCraft saves it. Each has a check below. |
| What did testing find that we did not expect? | CADCraft's drawing extents ignore MTEXT word wrap, so notes measured shorter than they drew and the first render crowded them. The renderer now wraps text itself with calibrated font metrics. The first fit check also refused an example title block value that spilled into the next cell. |
| What is assumed rather than shown? | That CADCraft-written DWG files open correctly in AutoCAD. Upstream states this has never been checked, and no AutoCAD was available here. Customer files stay read-only until it is shown. |

## Affected configuration items

| Item | Type | Why it matters | Link |
|---|---|---|---|
| ADR 0018 | Design record | Sets the engine and its conditions. | `docs/adr/0018-drawing-engine-cadcraft.md` |
| ANSI D sheet template | Template data | Every generated sheet inherits its geometry and field list. | `packs/capital-projects/drawings/sheet-ansi-d.json` |
| Sheet renderer | Code | Fills every field from the record and refuses sheets that break the standard. | `packs/capital-projects/drawings/render_sheet.py` |
| Example record | Test data | Exercises every field and notes section. | `packs/capital-projects/drawings/examples/fdn-200-001.record.json` |
| Conformance checks | Test code | Evidence for this decision and for every CADCraft upgrade. | `tests/conformance/cad/run.py` |
| CADCraft | External tool, pinned by commit | Draws, saves and plots every sheet. | ADR 0018 |

## Threshold screen

| Dimension | Low / medium / high | Notes |
|---|---|---|
| Consequence | Medium | Drawings are deliverables; a wrong title block or lost content would mislead readers. No runtime use yet. |
| Reversibility | High | Files on a branch; revert is one command. |
| Detectability | Medium | Title block and notes checks are automatic; DWG fidelity in AutoCAD is not yet checked. |
| Exposure | Low | Pre-alpha repository, example data only. |
| Uncertainty | Medium | Upstream rates itself pre-alpha; our use is narrow and tested. |
| Dependency trust | Medium | New external tool that is 15 days old with rapid releases; pinned by commit and gated by checks. |
| AI authority | Medium | An AI agent wrote the renderer and the checks and ran them; the owner holds merge. |

## HPI work-mode screen

| Factor | Rating | Notes |
|---|---|---|
| Familiarity | Medium | CAD formats are familiar; driving CAD over MCP is new. |
| Time pressure | Low | No deadline. |
| Complexity | Medium | One renderer, one template, one check script. |
| Distraction risk | Medium | Long session with parallel design work; this packet fixes scope. |

## Selected mode

- **Mode:** Standard
- **Why this mode:** the change is a trust decision about a new external dependency that produces deliverables.
- **Why lighter mode is not enough:** Quick mode excludes dependency trust decisions.
- **Why heavier mode is not yet required:** no runtime integration, no customer files and no irreversible step. Editing customer files would raise the stakes and needs its own change record.

## Activated artifacts

| Artifact | Activated? | Reason | Owner |
|---|---|---|---|
| `basis.md` | yes | Protected outcomes for sheets and files. | Ben Huffer |
| `plan.md` | yes | Build order and proof commands. | Ben Huffer |
| `trace.md` | yes | Claims tied to checks. | Ben Huffer |
| `verification.md` | yes | Results, custody and coupling. | Ben Huffer |
| `ship.md` | yes | Merge decision and residual risk. | Ben Huffer |
| Nuclear subset record | no | No kernel decision function changes. | Ben Huffer |

## Immediate evidence obligations

- **Least evidence before build:** the template field list, the refusal rules, and the upstream gap list.
- **Least evidence before merge:** nine checks passing against the pinned build, ADR 0018 written, this packet validated, and the owner's review.
- **Independent review needed?** Yes. The owner reviews; the checks are deterministic and repeatable by anyone with the pinned build.

## Required links

- Packet: `.nuclear/changes/drawing-engine-cadcraft/`
- `basis.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- Decision record: `docs/adr/0018-drawing-engine-cadcraft.md`

## Exit criteria

- The mode is justified.
- The activated artifacts are named.
- Risks, assumptions and evidence duties live in this packet rather than in chat.

## Source-lineage note

Packet structure follows nuclear-grade context engineering, whose public source map is at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
