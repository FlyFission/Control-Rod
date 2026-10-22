# Site concept pack

Tools, typicals, role briefs and templates for the BaseMark site concept package: a parcel goes in, and five deliverables come out (parcel resolution, constraints screen, charter and basis of design, concept site plan, next-stage plan). The first facility typical is a data center of about 50 MW.

Agents never type a number. Every area, distance, elevation, slope and size comes from `cr-site`, and every public-data fact carries its source URL, query, retrieval time and the SHA-256 of the response.

## Commands

```sh
uv sync
uv run cr-site parcel resolve --input parcel.kmz --out out/parcel.json
uv run cr-site plat closure --calls calls.json --pob 34.75,-82.30 --out out/parcel.json
uv run cr-site constraints --parcel out/parcel.json --out out/constraints.json
uv run cr-site layout --parcel out/parcel.json --constraints out/constraints.json --program out/program.json --out out/layout.json
CADCRAFT_CLI=/path/to/cadcraft-cli uv run cr-site plan --parcel out/parcel.json --constraints out/constraints.json --layout out/layout.json --program out/program.json --record out/plan-meta.json --out-dir out/
uv run cr-site check --parcel out/parcel.json --layout out/layout.json --constraints out/constraints.json --program out/program.json --package-id WP-1 --out out/pre-check.json
```

| Input | How it resolves | Needs confirmation |
|---|---|---|
| GeoJSON, KML, KMZ, zipped shapefile (WGS 84), WKT | read directly | no |
| County parcel ID | county ArcGIS layer from `data/county_registry.yaml` | yes |
| Plat or survey PDF | an agent reads the calls; `plat closure` computes the boundary, closure and precision (worse than 1:10,000 is a finding) | yes |
| Address | US Census geocoder to a point, then a square of the stated acreage | yes |
| Coordinates | a square of the stated acreage | yes |

## Data sources

`src/cr_site/sources.py` lists each service and how it was verified on 2026-10-22: against its REST directory or documentation, then by live queries from the build shell for a parcel near Greenville, SC. FEMA flood zones, USFWS wetlands, USGS elevation, HIFLD transmission lines (NETL mirror), EIA gas pipelines and Census TIGERweb roads all answered live. The Census geocoder is checked against its documentation only. Every call retries once, and a response that hit the service's record limit is a hold.

Two topics are holds by design. Substations: the only public HIFLD substation service found held 128 features in one region, so an empty answer would have read as "no substation nearby"; the nearest transmission line names its end substations instead. Soils: the NRCS Soil Data Access request format is not verified. The county registry ships empty: no county parcel service could be verified (Greenville County's server was down).

A failed query is always a hold. Nothing is estimated in its place.

## Program values

`typicals/data-center-50mw.json` holds the program with every size null and marked "owner sets", except the 50 MW capacity the owner stated. The layout refuses to place a block with a null size and lists it as a hold. `examples/program.example.json` carries numbers that exist only so the tests can run; it is labeled EXAMPLE VALUES FOR TESTING ONLY and the label prints on the sheet.

## The sheet

`cr-site plan` draws on the standard ANSI D template from `../drawings/` through CADCraft: parcel, setback, buildable area, hatched exclusions (flood, wetlands, steep ground), program blocks with areas, access road, north arrow (grid north of the UTM frame), graphic scale and legend, at the smallest of 1" = 50', 100', 200', 300', 400', 500' or 1000' that fits. The notes column carries general notes, references, design inputs with retrieval dates, holds, assumptions and the preparation record. The site is drawn in sheet units at the chosen scale; drawing it in model space at full size with a layout viewport is a follow-up.

## Tests

```sh
uv run pytest            # 39 tests without network; the end-to-end test skips without CADCraft
CADCRAFT_CLI=/path/to/cadcraft-cli uv run pytest tests/test_e2e.py   # parcel to rendered PDF plus a passing check
```

Service responses in `tests/conftest.py` are built in each service's documented response shape. They are not recordings of live responses.
