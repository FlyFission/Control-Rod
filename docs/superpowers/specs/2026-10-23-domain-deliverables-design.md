# Controlled domain deliverables specification

Status: proposed next program after the owner pilot. Parent requirements PB-08, GP-17 and ADR 0018. Existing drawing/example-package examples are conformance fixtures, not approved inputs for a real project. No new engineering quantity or tolerance is supplied by this specification.

## Baseline and outcome

The drawing renderer currently writes DXF/DWG/PDF/PNG and a digest manifest through drawing tool. The example-package pack provides staged packages and geometry/data checks. It still needs a controlled tool acquisition path, generation-level atomic publication, authoritative feed selection, a report renderer, a substantive calculation SDK and revision-bound PDF review. `sdk/python` currently implements canonical digests only.

| Requirement | Consumer outcome | Acceptance evidence |
|---|---|---|
| DN-01 | A tool is the approved binary/source for the platform and protocol | Tool manifest, verified SHA-256, executable version/protocol probe; corrupt/missing/offline refusal |
| DN-02 | A drawing/report consumer sees one complete generation | Immutable generation directory, atomic current-generation manifest; injected failures never mix revisions |
| DN-03 | Source data has a retrievable authority, revision, digest, coordinate/unit basis and license | Real paginated source fixture; changed/unavailable/truncated/wrong-CRS source holds |
| DN-04 | A report is reproduced from controlled inputs and a pinned renderer/template/font set | Fresh build, source/output digests, visual inspection and linked findings |
| DN-05 | A calculation records executable method, inputs/units/provenance and actual results | Rerun and independently selected method where required; missing inputs/tolerance hold |
| DN-06 | PDF review refers to the exact delivered revision | Source PDF digest, page/coordinate frame, annotation history, supersession/stale-revision refusal |

## Contract decisions

- `ToolManifest`: tool ID, version, upstream source/release ref, platform/architecture, archive/binary SHA-256, license, acquisition URL, protocol version/probe and approved status. Tool discovery never silently substitutes PATH for a missing approved tool. Offline mode uses a previously verified cache; it cannot fetch or guess a version.
- `ArtifactGeneration`: generation ID, package/release-manifest digest, ordered input digests, tool/template/font manifests, output-relative paths and SHA-256, generation status. Render into a sibling staging directory on the target filesystem, verify all outputs, rename to an immutable generation, then atomically replace the current-generation manifest. Define consumer migration before removing legacy flat paths; several sequential file renames are not a multi-file transaction.
- `SourceQuery`/`SourceResult`: source family, explicit jurisdiction/feature IDs, request parameters, observed time, authority/license, source revision/raw digest, CRS/units, paging/truncation state and either validated features or a structured hold. No nearest-road/substation/soil claim after failed or partial acquisition. Select actual authoritative endpoints before implementing adapters.
- `ReportBuild`: controlled package/manifest, source/quantity references, template/renderer/font digests and output manifest. No untraceable copied value or hidden live data fetch at render time.
- `CalculationRun`: pinned executable/method/version, canonical input record with quantity decimal strings/units/source refs, actual stdout/results/evidence digests, execution trace and criterion mappings. An approved input supplies any numerical tolerance; the model does not invent it. Declare unsupported units/methods or incomplete basis as holds.
- `PdfReview`: source PDF digest and generation, page/coordinate convention, human/role identity, annotation ID/history, finding linkage and supersession. Coordinate values come from the viewer/tool; they are not invented engineering measurements.

## Required owner/domain inputs

Before activating a real project, identify the actual jurisdiction/parcel, county/substation/soil authorities and licenses, approved tool releases/platform hashes, report templates/fonts, engineering methods/standards/tolerances and qualified acceptance owner. The repository contains examples, not these project approvals. Do not fill these gaps with invented numbers, a convenient public endpoint or an assumed standard.

## Delivery order

Use [the bounded implementation plan](../plans/2026-10-23-domain-deliverables.md). Start with tool manifests/cache and generation publication; then authoritative source adapters and reports; then calculation and PDF review. Preserve existing geometry/custody refusals and inspect the actual exported artifact. Main integration, protected policy/CI/major-contract edits and operational issue retain their separate authority gates.
