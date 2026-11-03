# Domain deliverables implementation plan

**Spec:** [Controlled domain deliverables](../specs/2026-10-23-domain-deliverables-design.md). Status: proposed, not executed. Dependency: owner pilot decision and named domain/tool/source authorities. Keep each task in its own change record/commit; use RED → GREEN → fresh artifact review.

## Task 1: approved tool manifests and offline cache

Files: proposed `spec/domain-tools.tsp`, `sdk/python/src/controlrod/tools.py`, `tests/conformance/tools/`, tool-manifest fixtures and drawing/site-concept launcher integration.

Interface: `resolve_tool(manifest, cache, offline) -> VerifiedTool(path, binary_digest, version, protocol)`; `acquire_tool` accepts only manifest URLs/platform hashes and stages downloads before cache publication. No shell interpolation or PATH fallback after a pinned tool is requested.

Write failures for corrupt archive/binary, version/protocol mismatch, unsafe archive entries, unavailable offline cache and wrong platform before implementation. Verify upstream license/source, generate contracts, build/cache an approved tool, repeat offline and commit `feat: resolve engineering tools from verified manifests`. Tool hashes/releases are an owner-reviewed input; do not invent them.

## Task 2: generation-level drawing publication

Files: `packs/capital-projects/drawings/render_sheet.py`, site-concept drawing caller, generated artifact contract, `tests/conformance/cad/` and publication failure fixtures.

Interface: `publish_generation(staging, manifest, destination) -> ArtifactGenerationRef`. Consume the manifest through one atomic current-generation pointer. Specify the compatibility adapter for existing flat-path callers before changing them.

Write failures at each format save, manifest verification and final publication step; assert the previous complete generation remains consumable and incomplete output is not current. Render with the pinned tool, inspect fresh PDF/PNG plus entity census, verify every output digest and commit `feat: publish complete drawing generations atomically`.

## Task 3: authoritative source adapters

Files: `packs/capital-projects/site-concept/src/cr_site/` source adapters and tests, fixtures with acquisition metadata and license refs, source contract.

Interface: `query_source(SourceQuery) -> SourceResult | Hold`, with explicit CRS/units, page completeness and provenance. Implement county/parcel, substation and soil adapters separately after endpoint/authority selection.

First write failures for missing authority, bad schema/CRS, partial pagination, out-of-area data, unlicensed source, unavailable network/offline data and changed revision. Record raw source digests and tool-derived values; verify representative real records with the domain owner. Commit one adapter at a time; never turn a source hold into a plausible result.

## Task 4: controlled reports

Files: proposed `reports/` renderer/templates, report contract, pack adapter and final-artifact tests.

Interface: `render_report(ReportBuild, approved_tools) -> ArtifactGenerationRef`. Sources and rendered quantities refer to controlled input IDs. Pin Typst/other renderer and fonts only after the owner selects the deliverable format.

Write missing-input, stale-source, missing-font, hidden-network and layout-overflow failures. Build fresh in offline mode, inspect final PDF pages and source-to-output trace, then commit `feat: render reports from controlled evidence`.

## Task 5: executable calculation SDK

Files: proposed `sdk/python/src/controlrod/calculation.py`, quantity/provenance/result contracts and method-specific tests.

Interface: `run_calculation(method_manifest, input_record, approved_tools) -> CalculationRun`; verification invokes an actual rerun/alternate method selected for that domain. No model-filled quantities, units, source refs or tolerances.

Write missing-source/unit/tolerance, stale method, unsupported unit conversion, failed execution and inconsistent result failures first. Use approved reference problems and independently checked expected outputs, retain actual tool traces, then commit one bounded method. Do not label a digest wrapper as an engineering calculation SDK.

## Task 6: revision-bound PDF review

Files: proposed PDF review contract, API/store routes, workbench viewer/annotation components and artifact fixtures.

Interface: `annotate(PdfReviewSubject, expected_revision, annotation)` appends immutable review history; subject pins PDF generation/digest and coordinate frame. Returned markups never silently apply to a new PDF.

Write stale-PDF, wrong page/frame, concurrent edit, unauthorized reviewer and corrupted-source tests. Inspect the exported marked PDF and verify links to original findings, then commit `feat: bind PDF review to controlled deliverable revisions`.

## Review focus

Approved source/tool authority, permissive shipped code, safe acquisition and path handling, actual multi-file publication semantics, complete paging/CRS, provenance/units, missing-input holds, independent numerical verification and exact consumer artifacts. These tasks are future work; current preparation and recovery implementation does not prove their outcomes.
