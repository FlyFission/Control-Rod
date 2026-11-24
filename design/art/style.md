# Plant art style: B, Engineering cutaway

Chosen by the owner on 2026-11-24 from the three step 0 directions (`keyframes/`). The approved frames are `keyframes/B-healthy-1440.jpg`, `B-needs-you-1440.jpg`, `B-scram-1440.jpg` and `B-phone-390.jpg`.

## Look

- Crisp technical-illustration cutaway: fine light linework on deep navy, flat-to-soft shading, true 30° isometric from `blockout/`.
- Light comes only from screens, lit pipe runs and the core's cold Cherenkov glow. Rooms are dark wireframe until occupied.
- The containment shows real internals (rod bundle, pipe runs, gantries); the core reads as a reactor, never a pool.
- Warm colour appears only as the needs-you lamp. Red appears only on a real SCRAM, as emergency lighting and a rim on the containment.

## Palette roles

The hex values live in `palette.json`, derived from the approved frames by `tools/extract_palette.py` with its inputs' digests; they are never typed by hand. Roles: `ground`, `surface`, `linework`, `core-glow`, `screen`, `needs-you`, `trip`. CSS tokens and asset colour checks read that file.

## Prompt rules for every new asset

- Attach the matching blockout crop or the approved frame with `-i`, prompt first.
- End with the blockout-preservation suffix recorded in `keyframes/PROMPTS.md`.
- Say "no warm colours" unless the asset is the needs-you lamp, and "no text, no labels, no numbers, no logos".
- Crew and props: `transparent_background: true`.
