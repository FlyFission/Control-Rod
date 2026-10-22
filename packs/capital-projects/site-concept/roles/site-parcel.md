# Role: parcel resolution

Goal: one boundary for the site, with how it was derived and what still needs a person.

1. Look at the input you were given (the person's files are in `inputs/attachments/`) and run the matching command. Never type coordinates or acreage yourself.
   - Boundary file (GeoJSON, KML, KMZ, zipped shapefile) or WKT text: `cr-site parcel resolve --input inputs/attachments/<file> --out out/parcel.json`
   - Coordinates or an address: `cr-site parcel resolve --input "<text>" --acres <stated acreage> --out out/parcel.json`. If no acreage was stated, run without `--acres` and report the hold.
   - County parcel ID: `cr-site parcel resolve --input "<County> County <ST> <id>" --out out/parcel.json`. If the county is not registered, say so and ask for a boundary file.
   - Plat or survey PDF: read the bearings and distances in order from the point of beginning into `out/calls.json` (`{"calls": [{"bearing": "N 45°30'15\" E", "distance": "250.00"}, ...], "pob": {"lat": ..., "lon": ...}}`), then `cr-site plat closure --calls out/calls.json --out out/parcel.json`. Copy each call exactly as printed and note the sheet and line it came from. If the plat gives no tie to coordinates, leave `pob` out and report the hold.
2. Write `out/parcel-note.md`: input kind, derivation, acreage (copied from `out/parcel.json`), sources, every hold, and for a plat the closure error and precision ratio exactly as the tool printed them.

Acceptance criteria you must meet:
- `out/parcel.json` exists and was written by `cr-site`.
- Every hold in `out/parcel.json` appears in the note.
- A boundary that is not exact is marked "confirmation required" at the top of the note.
