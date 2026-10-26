# Authoring and releasing a world

The [catalog](../superpowers/specs/2026-10-25-overlay-themes-catalog.md) defines fifteen art briefs and their explicit creative lineage. The [engine specification](../superpowers/specs/2026-10-25-overlay-themes-design.md) defines semantic behavior. Existing public artwork uses original programmatically authored geometry, with no imported reference images, audio, franchise characters, fonts or copied dialogue.

## Editable sources and exports

`tools/build_theme_art.py` is the reproducible source generator. It reads the intentionally JSON-shaped literal catalog in `apps/web/src/features/floor/themes/catalog.ts`. Do not run a formatter that converts that generated catalog to non-JSON syntax. Generated descriptor files carry full hashes and are data, not executable theme plugins.

Each world also has directly editable SVG sources in `design/overlay-themes/<id>/`, with a `source.json` identifying its generator/palette. Treat those SVGs as editable art exports: rerunning the generator overwrites them. To preserve hand edits, update the generator or use a separate export procedure that regenerates hashes, manifests, descriptors and thumbnails from the edited source. Never silently mix hand-edited exports with stale integrity records.

```sh
python3 tools/build_theme_art.py
python3 tools/check_theme_assets.py --root .
```

Each pack contains one 1000×600 scene, six distinct 128×128 character assets, six props and one 800×480 thumbnail. Assets are passive SVG images, with an anchor compatible with the shared stations and motion. Six variants can represent any number of workers: the stable run badge distinguishes repetitions. Shared actions and signatures provide motion; do not add theme-specific React components, API calls or state interpretations.

Functional labels are HTML. SVG exports must contain no scripts, event attributes, style blocks/attributes, foreignObject, remote resources, data URIs, DTD/entities or native SVG animation. Only the checker's allowlisted geometry/gradient/clip elements and attributes are accepted. Local gradient/clip references are permitted. The validator also rejects escaping/symlink paths, missing provenance, mismatched dimensions/hashes/bytes and budget violations. It is a bundled-source validator, not an arbitrary-user-upload sanitizer.

Output names are `<key>.<first12sha256>.svg`; the full SHA-256 and actual byte count are in `assets.json` and the TypeScript descriptor. The selected pack budget is 1 MiB; a thumbnail is at most 100 KiB; the full thumbnail catalog at most 1.5 MiB. Run the web pack-conformance tests as well: they compare descriptor hashes and manifests with actual bytes. Thumbnail URLs live in the small eager catalog; complete packs load lazily.

## Art review

Review every world with the same source-state fixture, at actual scene size, with labels/hit targets, in grayscale and Still mode. Check original silhouettes, readable material/lighting, clear stations, restrained signature effects, long labels, empty/loading/offline scenes and overflow. Include independent keyboard, screen-reader, zoom and contrast review. Automated checks and an author's screenshot inspection do not establish all of these judgments.

Internal design notes can identify influences explicitly. A proposed public influence note is a separate factual editorial choice, not permission for protected expression. Changing a title or adding “inspired by” does not clear copied characters. Keep any unlicensed source references out of the distributed pack. Exact characters, actor likenesses, third-party artwork/music or unresolved similarity concerns require specific permission or qualified review appropriate to intended distribution.

## Human release record

All authored packs initially remain `development`. After actual human review, a designated release owner can mark an individual descriptor `released`, set `releaseRecordId`, and add a record to `themes/release-manifest.json` containing:

- Stable review ID, pack ID/version and original title.
- Ordered full asset hashes (scene, thumbnail, six characters, then props).
- The exact approved optional influence text, or an explicit empty string.
- Actual reviewer/date, evidence reference, and authorized distribution.

The gate checks record completeness and hash/title/version binding. It cannot determine whether a reviewer's legal judgment is sound. Do not fill these fields with an agent pretending a human approved the art. A modified art/title/version bundle invalidates its prior record; recapture review for that changed bundle.

The engine is Apache-2.0. Original authored SVGs carry their own Apache-2.0 notices. If future packs contain licensed third-party material, keep it outside the Apache-distributed bundle unless that exact distribution is permitted. Preserve individual source/license evidence and notices. Credits do not relicense assets.

## Rollback

Remove only the affected release record, restore the reviewed previous assets/version if appropriate, and rebuild. Keep Plain Floor available. Draft evaluation is for local review and is always labelled; do not turn it on to bypass a missing public release decision.
