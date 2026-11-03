# PR A (#30) review adjudication

## Round 1 (Codex, `a-codex-round1.md`): REVISE, nine findings, all accepted

| # | Finding | Decision | Change |
|---|---|---|---|
| 1 | Build never validates office themes; whole directories copied | Accepted | `pnpm build` runs `check:office` (the contract tests: schema, SVG, served bytes and digests, generator freshness, nothing extra). The generator writes `assets.json` per theme; Vite copies only the files it lists, each checked against its digest, and refuses a tampered one. `build-isolation.spec.ts` plants an unregistered file (not shipped) and tampers a declared one (build refused). |
| 2 | Contrast used computed colours; transparent text and invisible marks passed | Accepted | Text and marks are now measured from drawn pixels (the fourth strongest pixel on the drawn plate must reach 4.5:1 or 3:1). Sensitivity case: transparent label text and zero-opacity marks with unchanged computed colours must fail, and do. |
| 3 | Edge credited a ring that may not be drawn | Accepted | Each edge point compares the scene just past the element against drawn pixels sampled every quarter pixel through the element's own ring and border or plate (never deeper than its own opaque band). Edge points another semantic part covers are excluded, and every element must keep some measured edge. Sensitivity case: rings removed with the property kept must fail on the dark theme, and do. |
| 4 | Legibility did not test state shapes | Accepted | Each drawn mark is classified from its pixels (fill, centre hole, top to bottom balance) and must be its state's shape at 8px or more; thresholds sit midway between the measured signatures. Sensitivity cases: every mark drawn as the same circle, and every mark shrunk, must fail, and do. This also surfaced a real defect: square and triangle corners nearly touched the chip rim. Marks are now 13px in a 22px chip. |
| 5 | Event to screen measured two frames, not the update | Accepted | The timer runs from the click until a MutationObserver sees the state committed, then one frame. The harness page takes `delay`; a 700 ms delayed update must measure at least 700 ms, and does. |
| 6 | 30 fps substituted for Q-10's 60 fps on a reference machine | Accepted | Two checks: a labelled smoke check for any machine (30 fps), and the Q-10 check (p95 frame within 5% of the 60 fps period) that runs only when `OFFICE_REFERENCE_MACHINE` names the machine, recording browser, OS and CPU. No reference machine is designated yet; a candidate run on the development machine is recorded as such (owner decision). |
| 7 | Validator accepted missing accessibility and provenance | Accepted | Strict runtime schema: description, accessibility notes (and nothing else there), credits, and for every asset creator, license notice, byte count, whole number size, rights basis and no unknown fields; malformed input returns problems instead of throwing. Tests added. |
| 8 | SVG scanner accepted invalid XML; no geometric containment | Accepted | Well formedness: one `<svg>` root, tags closed in order, nothing after the root, no repeated attribute, no text outside `<title>`/`<desc>`, namespace required, root width and height must equal the region. Containment is defined and documented as the image box: art is drawn as an image exactly the region's size and an SVG image clips to its viewport. Tests added. |
| 9 | Pulse ran in hidden tabs | Accepted | The stage marks itself paused on `visibilitychange`; CSS stops the animation. The harness hides and restores the document and checks animations stop and return, and stop under reduced motion. |

Additional defects the stricter harness exposed and fixed: figures were taller and wider than the layout's seat clearance assumed (queue figures could touch cube figures, and right column chips crossed the region wall). The figure is now compacted (code tucked under the outline, chip on its right side), seats account for left and right reach, Bench seats three rows, the queue spacing is 64 units, and the harness checks every seated figure stays in its region below its name plate and every queued figure stays in the corridor.

## Round 2 (Codex, `a-codex-round2.md`): REVISE, six findings, all accepted

| # | Finding | Decision | Change |
|---|---|---|---|
| 1 | Invisible package codes pass on their plates' rings; clipped labels pass | Accepted | Text is measured inside the box of its own text (a range over the text node), never the plate's padding or ring, from owned pixels, and must carry at least 6 inked pixels per visible character as well as reaching 4.5:1. Controls: transparent codes, and labels clipped to a quarter, must fail, and do. |
| 2 | Edge profiles credit scenery; geometric exclusions trust invisible parts | Accepted | The harness now renders the semantic layer alone over two key colours. A pixel is owned when the semantic layer covers 75% or more of it (its colour barely moves between the keys); only owned pixels earn edge credit, so an edge with no drawn ring or plate scores 1:1. The scene is measured only where both keys show nothing painted. A span is excluded only where a shown part (`checkVisibility`) painted later covers it, ring and fringe included, and that part's own check measures the edge there; each element must keep a quarter of its edge against the scene. Controls: outlines removed over the bright scene must score 1:1, and do; hidden codes must not excuse the outlines' feet, which are then measured and pass. |
| 3 | Classifier calls disconnected blocks a ring | Accepted | Shapes are matched against raster templates drawn from StateMark's own geometry at the measured sub-pixel offset, each at its best fit within half a pixel; the best template must be the state's and within a 0.32 mismatch. Measured: real marks at most 0.21 (the ring) and 0.10 or less for filled shapes; a hollow square in place of the ring 0.44; corner fragments 0.70 (best match a square). Controls: corner fragments and a hollow square in place of the ring must fail, and do. |
| 4 | Event to screen passes with frozen symbols | Accepted | The timer ends only when the state has committed and the figure's symbol markup has changed, then one frame; a symbol held at its old shape never finishes. After the update, every figure's drawn shape is checked against its new state. Control: a symbol forced back to its old markup times out and is found drawn as the wrong shape. |
| 5 | `validateSvg` accepts some invalid XML | Accepted | Case-sensitive tag matching, no attributes on closing tags, whitespace required between attributes, only predefined entities and character references. A unit test parses every accepted document (theme art included) with an XML parser and requires no error, and requires the parser to reject each malformed case. |
| 6 | Figure bodies not clipped to the silhouette | Accepted | Body images are clipped to the outline's 14px inner radius. The harness compares the scene with and without bodies inside each body image's box, outside that circle (tolerance 24 per channel; re-rasterized art differs by up to about 8). Controls: a full-square body clipped passes; unclipped it fails. |

Also found and fixed while tightening: the outline (positioned) painted over its code plate (not positioned), so the outline's ring crossed the top of the code text; the code plate now stacks above the outline. The chip now sits level with the outline's top so its ring stays clear of the code plate.

## Round 3 (Codex, `a-codex-round3.md`): REVISE, one finding, accepted

Round 2 findings 2 to 6 verified fixed. Finding 1 was partial: pooled ink let visible glyphs stand in for clipped ones.

| # | Finding | Decision | Change |
|---|---|---|---|
| 1 | Half-clipped room names pass the pooled ink floor | Accepted | Every glyph is measured in its own box (a range over that character) and must carry at least 2 owned inked pixels at 3:1; measured, the thinnest real glyph carries 4 and a clipped one 0. Control: half of every canonical name clipped with `clip-path`, its box unchanged, must report the missing glyphs, and does. |

## Round 4 (Codex, `a-codex-round4.md`): MERGE

## Automated GitHub review threads on #30 (Copilot and the Codex connector)

The branch rules require every review thread resolved. Each was checked against the code; none was resolved without a fix or evidence.

| Thread | Decision | Evidence or change |
|---|---|---|
| contract.ts: dot segment path escape | Fixed | The path must be exactly `/office-themes/<theme>/<file>` with the file one segment; a `..` path is refused (test added). |
| contract.ts: `title`/`desc` admit text | Fixed | Both removed from the allowlist; any non-whitespace text is refused (tests added). |
| contract.ts: nested unknown fields | Already fixed (round 1) | Asset objects are checked against an explicit key set; accessibility allows only `notes`. |
| layout.ts: unknown IDs make routing throw | Fixed | Unknown IDs and wrong kinds are reported, and routes are walked only for a known graph (test added). |
| layout.ts: bottom row 1,212 wide | Not a defect | One leading margin, not two: 18 + 1,140 + 36 = 1,194 of 1,200; `validateLayout()` passes in CI. |
| layout.ts: no horizontal seat clearance | Already fixed (round 1) | `SEAT_CLEARANCE.left/right` and the side wall check; the harness checks every seated figure stays inside its region. |
| lock_other.go and nofollow_unix.go: `unix` tag | Not a defect | Go 1.19 and later define the `unix` constraint; the module is go 1.24.7 and `go list` on Linux selects `lock_unix.go` and `nofollow_unix.go`. |
| test/setup.ts: `onUnhandledFrame` | Not a defect | msw 3.0.3 (installed) names the option `onUnhandledFrame`; `onUnhandledRequest` is msw 2. |
| db/index.ts: read transactions lack an error listener (P1) | Fixed | `readTx` listens for errors and destroys a broken client, as `tx` does. A test ends the backend mid-read: it fails without the fix (an uncaught ECONNRESET) and passes with it. |
| live.ts: preparation never refreshed by live events | Fixed | Each touched subject also invalidates `["preparation", id]` (test extended). |
| RequirementsEditor: retiring leaves references | Fixed | Retiring a requirement removes it from every criterion; retiring a criterion removes it from every check and escalation (test added). |
| PreparationPanel: unsaved edits carried to another package | Fixed | The package page keys the panel by package id, so a different package mounts a fresh panel. |
| TechnicalPlanEditor: new lines vanish while typing | Fixed | A `Lines` field keeps the raw text while typing and saves only trimmed, non-empty entries; all four one-per-line fields use it (test added). |

## Round 5 (Codex, delta `0addc73..70e8c56`, `a-codex-round5.md`): MERGE

Codex noted partial test proof; closed before merging: a regression test switches the package page's preparation slot from one package with unsaved edits to another and requires the second package's content (it fails without the key and passes with it); every one-per-line field is exercised; wrong-kind rejection has an assertion.
| results.ts: optional checks gate a passing criterion (new thread after `040f576`) | Fixed | The guided preparation design (section on the coverage chain) says pass only if every required check passes and fail if any fails. `blocksPass` applies that in both the submission check and `results_pass`: a required check must pass; an optional check that ran and failed or was inconclusive still blocks; an optional check never run (open or deferred) does not; an unknown check is treated as required. `test/criterion-pass.test.ts` covers every outcome for both kinds and the derived flags. This changes an acceptance rule toward the written design, never past it. |
| store.ts: an omitted optional contract field stays on the package (new thread after `d0b4ded`) | Fixed | The save clears `exclusions`, `assumptions`, `codes_and_standards` and `methodology` from the old body before applying the contract, so an omitted field is removed and the package matches the snapshot. The store test sets then omits `exclusions` and requires no `contract-diverged` blocker; it fails without the fix. |
| TechnicalPlanEditor: verification checks cannot be retired (new thread after `d0b4ded`) | Fixed | Each check has a Retire button that removes it and every criterion's pointer to it (test added). |
| subjects.ts: requirements confirmation skips the hardware key floor (new thread after `74823ca`) | Fixed | Confirmed by reading the code: decisions and person verification call `requireHardwareKey`; confirmation did not. `confirmRequirements` now requires the attested hardware key for Safety and Material work, and the Inbox no longer offers such a confirmation to someone without one (it waits on a key holder, with that reason). A test with its own harness issues a Safety qualification, checks the Inbox routing, and requires `hardware-key-required` on confirming with a plain passkey; it fails without the fix. This tightens a floor; nothing is loosened. |
| RequirementsEditor: retiring a criterion edits resolved escalations (new thread after `52359de`; a regression from this PR's own retire fix) | Fixed | A resolved escalation is immutable in the store and every escalation must cite current criteria, so a criterion a resolved escalation rests on cannot be retired: its button is disabled and the panel says why. Retiring any other criterion strips it only from open escalations and from checks. Test added. |
