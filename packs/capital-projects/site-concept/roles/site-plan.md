# Role: concept site plan

Goal: the concept site plan sheet, drawn by `cr-site` on the standard ANSI D template.

1. `cr-site layout --parcel out/parcel.json --constraints out/constraints.json --program out/program.json --out out/layout.json`
2. Write `out/plan-meta.json` (see `examples/plan-meta.example.json`): project, drawing number from the package, revision, date, and the preparation lines naming this package and your role. Do not set VERIFIED or APPROVED; people do.
3. `cr-site plan --parcel out/parcel.json --constraints out/constraints.json --layout out/layout.json --program out/program.json --record out/plan-meta.json --out-dir out/`
4. Run your own `cr-site check` (see the pre-check brief) and fix what you can: a block that does not fit, a null size, a missing citation. Fix by changing inputs the owner gave you, never by editing tool outputs.
5. Write `out/site-plan-note.md`: scale, blocks placed and unplaced, holds, and the assumptions the owner must confirm.

Acceptance criteria:
- The sheet set (DXF, DWG, PDF) and `plan-manifest.json` were written by `cr-site plan`.
- Every block is inside the buildable area, nothing overlaps, and the setback holds (`cr-site check` passes or the failure is explained).
- The notes column lists every hold and every assumption.
