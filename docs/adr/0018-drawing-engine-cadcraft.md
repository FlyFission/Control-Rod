# ADR 0018: CADCraft as the drawing engine

- Status: Proposed
- Date: 2026-10-22

## Decision
CADCraft (`storytold/cadcraft`, MIT OR Apache-2.0, commit `e4214f7`, `cadcraft-cli 0.10.0`) is the drawing engine for every sheet, markup and sketch Control Rod produces. Control Rod drives it headless through its MCP server inside the sandbox. Agents never draw borders or type title blocks: `packs/capital-projects/drawings/render_sheet.py` renders each sheet from the project template plus a record, and fills every title block, revision and notes field from that record.

## Evidence
Nine checks in `tests/conformance/cad/run.py` passed on 2026-10-22 with ezdxf 1.4.5, pypdf 5.9.0 and Pillow 12.3.0:

| Check | Result |
|---|---|
| CAD-01 | A sheet renders from template and record alone, to DXF, DWG, PDF and PNG. |
| CAD-02 | The PDF is ANSI D at true size (2448 x 1584 pt); every title block value and notes heading is searchable text. |
| CAD-03, CAD-04 | The sheet reopens from DXF and from DWG with identical entity counts and texts. |
| CAD-05 | A second DWG save and reopen changes nothing. |
| CAD-06 | A DXF written by another program, with 16 entity types, xdata, block attributes, a multileader and named layers, keeps all of them through a CADCraft save. |
| CAD-07 | A record missing a title block field is refused. |
| CAD-08 | A value too long for its title block cell is refused. |
| CAD-09 | Notes that would overflow the notes column are refused. Nothing is written for a refused sheet. |

Upstream's own roadmap (reviewed 2026-10-10) rates CADCraft pre-alpha and about 38% ready for real work. It also states that a DWG saved by CADCraft has never been checked in AutoCAD, SHX fonts are not parsed, binary `.ctb` plot styles are not read, and xrefs and dynamic blocks are incomplete.

Found here: CADCraft's drawing extents ignore MTEXT word wrap, so a wrapped note measures shorter than it draws. The renderer therefore wraps text itself, using font metrics from Pillow calibrated against CADCraft's single-line text extents, and passes each line as an explicit paragraph.

## Conditions
1. CADCraft is pinned by commit as part of the agent baseline. Any upgrade is a new baseline revision and reruns the conformance checks before use.
2. Headless only, in the sandbox, with no network. The control port and the bridge to the desktop app stay off for agents.
3. Customer DWG and DXF files are read-only: title block checks against the register, and extraction of values as preliminary candidates. Editing a customer file waits until a real-file corpus round-trips through CADCraft and opens cleanly in AutoCAD.
4. The DWG library, acadrust, is MPL-2.0. It is used unmodified; any patch we make to it is published.
5. Control Rod uses upstream builds. The ArtCraft name and logos are trademarks and stay off anything we distribute.
6. Every sheet carries the right-hand notes column: general notes, reference drawings, design inputs, holds, assumptions and the preparation record, each filled from records. A sheet that cannot hold its notes is refused, and its notes move to a notes sheet.

## Follow-ups
1. Report the MTEXT extents issue upstream with a minimal reproduction.
2. Build the real-file DWG and DXF corpus with upstream (their roadmap item 3), including a check in AutoCAD.
3. Add a CI job once a pinned CADCraft build is cached. This edits `.github/workflows/` and needs the owner's signature.
4. Add a metric template following ISO 5457 and ISO 7200.
5. Indent the continuation lines of wrapped notes.
