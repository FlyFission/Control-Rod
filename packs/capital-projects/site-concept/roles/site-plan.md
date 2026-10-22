# Role: concept site plan

Goal: the concept site plan sheet, drawn by `cr-site` on the standard ANSI D template.

Your inputs come from the earlier packages, each as the one file matching its pattern: the parcel `inputs/deps/*/parcel.json`, the constraints `inputs/deps/*/constraints.json` and the program `inputs/deps/*/program.json`. Your own results go to `out/`.

1. `cr-site layout --parcel inputs/deps/*/parcel.json --constraints inputs/deps/*/constraints.json --program inputs/deps/*/program.json --out out/layout.json`
2. Write `out/plan-meta.json` (see `inputs/pack/examples/plan-meta.example.json`): project, drawing number from the package, revision, date, and the preparation lines naming this package and your role. Do not set VERIFIED or APPROVED; people do.
3. `cr-site plan --parcel inputs/deps/*/parcel.json --constraints inputs/deps/*/constraints.json --layout out/layout.json --program inputs/deps/*/program.json --record out/plan-meta.json --out-dir out/`
4. Run your own check and fix what you can: a block that does not fit, a null size, a missing citation. Fix by changing inputs the owner gave you, never by editing tool outputs.
   `cr-site check --parcel inputs/deps/*/parcel.json --layout out/layout.json --constraints inputs/deps/*/constraints.json --program inputs/deps/*/program.json --package-id <id> --revision <rev> --verifier "site-plan author" --out out/self-check.json`
5. Write `out/site-plan-note.md`: scale, blocks placed and unplaced, holds, and the assumptions the owner must confirm.

Acceptance criteria:
- The sheet set (DXF, DWG, PDF) and `plan-manifest.json` were written by `cr-site plan`.
- Every block is inside the buildable area, nothing overlaps, and the setback holds (`cr-site check` passes or the failure is explained).
- The notes column lists every hold and every assumption.
