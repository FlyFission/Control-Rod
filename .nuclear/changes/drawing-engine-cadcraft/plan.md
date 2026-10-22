# Plan: CADCraft drawing engine

**Purpose:** Keep the drawing-engine change bounded and its proof easy to repeat.

**Change slug:** `drawing-engine-cadcraft`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `drawing-engine-cadcraft`
- **Related records:** `risk.md`, `basis.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Branch:** `phase-0/drawing-engine`

## Charter and anchor check

| Check | Result |
|---|---|
| Objective still matches `risk.md#mission-anchor` | yes |
| Any work outside the non-goals? | no; no customer files edited, no runtime integration, no CI job |
| Scope change during the work | one addition: the right-hand notes column, requested by the owner during the work |

## Build sequence

1. Build `cadcraft-cli` at commit `e4214f7` and read upstream's roadmap and gap lists.
2. Drive a first sheet over MCP to confirm blocks with attributes, layouts and PDF plotting work.
3. Round-trip the sheet and a foreign DXF and census the result.
4. Write the ANSI D template as data and the renderer that fills it from a record.
5. Add the notes column; find that drawing extents ignore MTEXT wrap; wrap text with calibrated font metrics instead.
6. Add field, fit and overflow refusals; see the fit check refuse an overflowing example value.
7. Write the nine conformance checks and run them.
8. Write ADR 0018, the pack README and this packet; validate.

## Two-speed work plan

| Track | Work | Status |
|---|---|---|
| Fast | Template, README, ADR | pass |
| Careful | Round-trip fidelity, refusals, text measurement | pass for our sheets and a generated foreign DXF; AutoCAD check planned |

## HPI task preview

| Task | Trap | Countermeasure |
|---|---|---|
| Notes layout | Trusting CADCraft's extents for wrapped text | Wrap with font metrics; measure explicit paragraphs only |
| Title block | Collecting entities by a crossing window and sweeping in the border | Track handles of created entities only |
| PDF text check | Extractor drops word spaces | Compare without whitespace; the text is present as glyphs |

## Agent briefing

The AI agent works on branch `phase-0/drawing-engine` only, may build CADCraft and run local checks, and commits locally. It may not push, merge, edit trust surfaces or open customer files.

## Affected files and assets

| Area | Paths |
|---|---|
| Decision | `docs/adr/0018-drawing-engine-cadcraft.md` |
| Template and renderer | `packs/capital-projects/drawings/`, `packs/capital-projects/README.md` |
| Checks | `tests/conformance/cad/run.py` |
| Records | `.nuclear/changes/drawing-engine-cadcraft/` |

## Non-goals

- Do not edit customer DWG or DXF files.
- Do not wire CADCraft into the product runtime or sandbox in this change.
- Do not add a CI job; that edits a trust surface and needs the owner's signature.

## Dependency / model / tool decisions

| Decision | Choice | Record |
|---|---|---|
| Drawing engine | CADCraft, pinned by commit | ADR 0018 |
| Text metrics | Pillow with the template font | ADR 0018 |
| Licenses | Permissive allowlist, MPL-2.0 file-level | ADR 0002, ADR 0018 |

## Review checkpoints

| Checkpoint | Required before moving on | Status |
|---|---|---|
| CADCraft builds | `cargo build --release -p cadcraft-cli` succeeds | pass |
| Conformance checks | 9 of 9 pass | pass |
| Scripts parse | Python syntax check on both scripts | pass |
| Packet validates | `ng validate --strict-custody` passes | pass |
| AutoCAD check | CADCraft DWG opens cleanly in AutoCAD | planned |
| Owner review | Ben approves | planned |

## Rollback approach

Revert the commit on the branch, or the merge commit on `main`. No data, services or external state exist.

## Proof commands

```bash
git clone https://github.com/storytold/cadcraft && git -C cadcraft checkout e4214f7
cargo build --release -p cadcraft-cli --manifest-path cadcraft/Cargo.toml
CADCRAFT_CLI=$PWD/cadcraft/target/release/cadcraft-cli \
  uv run --no-project --with ezdxf --with pypdf --with pillow \
  python -I tests/conformance/cad/run.py cad-evidence
python3 -I .ng/tools/ng.py validate --strict-custody .nuclear/changes/drawing-engine-cadcraft
```

## Required links

- `risk.md`, `basis.md`, `trace.md`, `verification.md`, `ship.md`
- `docs/adr/0018-drawing-engine-cadcraft.md`

## Exit criteria

- A reviewer can repeat every result from the proof commands.
- Every claim has a status label.
- Planned checks are visible and block customer-file editing until they pass.

## Source-lineage note

Plan structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
