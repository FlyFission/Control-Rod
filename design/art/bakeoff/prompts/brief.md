# Brief: image prompts for the Control Rod Plant art (schematic direction)

## Purpose

Control Rod is an open-source web app for orchestrating AI coding agents, themed as a nuclear power plant. Its hero screen, the **Plant**, shows the agents' work as a plant: a reactor at the centre and rooms around it where agent "crews" work. The Plant is the product's lead magnet: the first thing people screenshot and share. It must look **premium, professional, cool and schematic**, like an annotated engineering cutaway or a plant **general-arrangement (GA) sheet**, not a game or a sci-fi poster.

## What is drawn (three assets)

1. **Site plate** (2400×1500, opaque). The whole site from above at 30° isometric: the containment at the centre, cut away to show the reactor core; a ring road around it; pipe runs (spurs) from the ring to each pad; and **13 empty flat concrete pads** where room tiles will later be composited. No buildings on the pads.
2. **Control-room tile** (575×550, transparent background). One room as an isometric cutaway: the main control room.
3. **Engineering work-bay tile** (592×560, transparent background). One room as an isometric cutaway: an engineering work bay.

Each asset is made **image-to-image**: its blockout is attached as the reference image. The blockouts are flat grey shapes giving the exact framing, projection, containment, ring, pads, walls and floor outlines. Site: `design/art/blockout/site-2400x1500.png` (copy in `refs/`), which shows pad labels that must NOT be copied. Tiles: `design/art/blockout/tiles/control-room-S.png` and `work-bay-M.png`, which are transparent outside the room.

## Hard constraints

- **Geometry**: exact 30° isometric matching the attached blockout. Keep the framing, the canvas, and every footprint, wall, wall height, pad, ring and pipe route in place. Do not zoom, crop or reframe. Earlier generations drifted by zooming about 2%.
- **No readable text, numbers or logos** anywhere. Callouts and dimension labels may appear only as abstract marks or unreadable glyph-blocks.
- **No people** in these assets. Crew figures are separate sprites composited later.
- **Palette** (roles from `design/art/palette.json`, derived from the approved frame):
  - ground #000e23
  - surface #091930
  - linework #255375
  - core-glow #6bd8f0
  - screen #3b95b7
  - needs-you #fbc246 (forbidden in these assets)
  - trip #db535f (forbidden in these assets)
  Cyan on navy. **Warm colours are forbidden**: no red, orange, amber, yellow or magenta.
- **The core is the only glowing object** on the site plate. Room screens may carry a faint screen-cyan, never brighter than the core.
- **It must sit under UI overlays.** Nameplates, crew sprites, counters and alarms are drawn on top, so mid-tones must stay calm and low-contrast, with no busy texture in the pad and floor areas where figures stand. The front half of each room's floor stays clear for standing workers.
- **Tiles**: transparent outside the room silhouette. The front lip/near walls must stay where the blockout puts them, because they are cut out as an occlusion layer.

## Realism (required; graders must check it)

The art must be plausibly **realistic**, so nuclear professionals and utility veterans recognise and agree with its elements, while staying creative. Draw on real plant areas and the roles they imply.

- **Containment / reactor building** (the centre): reactor vessel and head, refuelling floor, polar crane on its ring girder, steam generators (PWR) and primary loop piping.
- **Main control room** (the control-room tile, "your-office"): horseshoe or curved control boards, a large overview / plant mimic panel, a shift supervisor's desk behind the operators. Roles: shift manager, senior reactor operator, reactor operators.
- **Engineering work bays** (the work-bay tile, used for process, mechanical, electrical, civil, assurance and project-controls): system-engineering and work-planning areas with engineering workstations, drawing racks, P&ID boards. Roles: system engineers, work planners, I&C and maintenance techs.
- Other pads (later tiles, for context only): work control centre, I&C and maintenance shops, radiation protection control point (step-off pads, frisker / portal monitor, contamination boundary), radwaste and hold yard (drums, shielded casks), fuel handling building with spent fuel pool, turbine building, switchyard, cooling towers or intake structure, document control / records vault, QA/QC independent-verification area.
- **Avoid security-specific details.** No security fences, guard posts, weapons or protected-area terms; use plain area names.
- **Contamination boundaries**: real plants mark them magenta/yellow. Our palette forbids warm colours outside "needs you", so render boundaries as **cyan/white rope stanchions and hatching**, and say why in the prompt if relevant.
- Graders must flag anything a plant veteran would find wrong. Examples: a cooling tower inside containment; the control room next to the core; a pool-type research reactor where a power reactor belongs; steam generators outside containment; turbine hall inside containment.

## Target references

- **Approved key frame**: `design/art/keyframes/B-healthy-1440.jpg` (copy in `refs/`) (direction B, "Engineering cutaway"). It's a cyan-on-navy technical illustration. The containment is cut away to show internals: rod bundle, pipe runs, gantries. The rooms are small isometric cutaways around a ring, and light comes from screens and the core only.
- **Ben's own Gemini frame**, described because it isn't attached: a Cherenkov-blue cutaway core with **dimension lines and leader callouts** around it, rooms as **fine wireframe cutaways**, dark navy ground, thin dimension ticks. Ben liked its **schematic feel**, but says his prompt was weak.
- The new direction pushes B toward **schematic**:
  - crisp hairline linework in pale cyan and white;
  - flat tonal fills;
  - section hatching on cut walls and slabs;
  - subtle dimension lines, centre lines and leader callouts with no readable text;
  - grid ticks along the border;
  - restrained glow from the core only.

## Target model

**Gemini's image model ("Nano Banana", gemini-*-flash-image)**, via Antigravity's `generate_image`, image-to-image with the blockout in `ImagePaths`. It takes a single text prompt, an `AspectRatio` (1:1, 3:2 and similar) and reference image paths. It has no transparency parameter and writes opaque JPEGs, so tiles will need a flat, easily keyed background, or a statement that the background must be one uniform flat colour.

The same prompts will also be run through Codex imagegen (gpt-image), which does support `transparent_background=true`.

## Deliverable for a draft

1. Your **6 criteria for a great prompt** for this job, each one line.
2. **Three prompts**, SITE, CONTROL-ROOM and WORK-BAY, each ready to paste. Include any recommended `AspectRatio` and how to reference the attached blockout.
3. Optionally, a short shared style block reused by all three.
