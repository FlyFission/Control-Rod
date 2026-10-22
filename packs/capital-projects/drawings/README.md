# Drawing sheets

Control Rod draws every sheet from a template and a record through CADCraft (ADR 0018).

- `sheet-ansi-d.json`: the generic ANSI D template. Border, zones, revision block at the top right, title block at the bottom right, and a notes column between them. Dimensions are decimal strings in inches.
- `render_sheet.py`: renders a sheet through `cadcraft-cli mcp` and writes DXF, DWG, PDF, PNG and `manifest.json` with SHA-256 digests of the template, the record, every output and the CADCraft version.
- `examples/fdn-200-001.record.json`: an example record.

Run:

```sh
CADCRAFT_CLI=/path/to/cadcraft-cli python render_sheet.py sheet-ansi-d.json examples/fdn-200-001.record.json OUTDIR
```

Rules:

- Every title block, revision and notes value comes from the record. Agents supply records; they never draw borders or type title blocks.
- A record missing a title block field, a value too long for its cell, or notes that overflow the notes column is refused before anything is written.
- The notes column holds general notes, reference drawings, design inputs, holds, assumptions and the preparation record.

Conformance checks live in `tests/conformance/cad/run.py`.
