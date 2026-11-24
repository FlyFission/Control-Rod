# Quick Proof: control room redesign

## Proof summary

- Change slug: control-room-redesign
- Proof owner: Ben Huffer (review pending); checks run by Claude Code
- Risk record: [`risk.md`](risk.md)

## Claim proven

At opening, the change is the plan only. Results per step are added here as each step lands.

## Method and results

| Check | Result |
|---|---|
| Plan graded blind, round 1 (Codex, Fable, Antigravity) | 54.1, 49, 42.7 |
| Plan graded blind, round 2 | 58.7, 68.6, 58.5 |
| Plan graded blind, round 3 (v3) | 65.4, 70.6, 69.1 |
| `python3 tools/check_originality.py` | pass |
| `ng.py validate --strict-custody` on this packet | pass |
| Step 2e, hybrid layers: `python3 tools/cut_plant_layers.py` (masks ingested once with `--ingest`) | 38 files plus manifest, WebP quality 84 chosen by bisection |
| Plant art budget, `apps/web/public/plant/` | 1384465 bytes of 1,500,000 (was 1,348,282) |
| Digests | every input and output sha256 in `apps/web/public/plant/manifest.json`; Blender mask digests in `design/art/source/hybrid/masks/ingest.json` |
| `cd apps/web && pnpm -s vitest run` | 69 files, 761 tests pass (baseline 68 / 756; new `plant-art.test.ts` checks manifest, digests, offsets, budget, anchors; scene tests check lit, figures, front stacking and garb) |
| `pnpm -s tsc --noEmit -p tsconfig.json` | pass |
| `node tools/check_plant_contrast.mjs` against `vite` | pass, 147 text runs, worst 11.15:1; the harness now centres the reactor plate and hides the SCRAM banner while sampling, which removed the "Reactor" artifact |
| Screenshots (Playwright, 1440x900 at 2x, 390 at 2x): healthy, crowded room with "+N more", SCRAM, phone | `/mnt/project-files/control-rod/step2e/` |
| `git diff --check`, `tools/check_originality.py`, `tools/check_offline_assets.py` | pass |


## Steps 4 and 5 (Today, Inbox, Sign in, Setup, roster)

| Check | Result |
|---|---|
| `cd apps/web && pnpm -s vitest run` | 74 files, 803 tests pass |
| `pnpm -s tsc --noEmit` | pass for these files (two unrelated errors in step 3 files `NewWorkModal.tsx`, `newwork.test.tsx` from concurrent work) |
| contrast and type-scale tests | extended to `pages/screens.css` and `components/agents.css`; pass |
| `git diff --check`, `tools/check_originality.py` | pass |
| Screenshots (Playwright, 1440x900 at 2x and 390x844 at 2x): Today busy and calm, Inbox list, Inbox signing drawer, Inbox empty, four sign-in states, Setup, roster; no horizontal scroll at 390 | `/mnt/project-files/control-rod/step4-5/` (script `shoot.cjs`, API mocked in the browser) |

## Step 3 (Shell and Board)

| Check | Result |
|---|---|
| `cd apps/web && pnpm -s vitest run` | 78 files, 823 tests pass |
| New tests | `lib/diff.test.ts` (parser: git and plain diffs, hunk counts, dashed removals, no-newline note, CRLF, non-diff), `components/diff-view.test.tsx` (sign, class, both line numbers, plain-text fallback, long-patch cap), `features/board/cockpit.test.tsx` (no tabs; status, run log, outputs, decision order; decision bar outside the scrolling body; criteria disclosure; diff chosen first; Escape; running line, elapsed text, runtimes, card icons and progress cue), `components/shell-phone.test.tsx` (bottom bar, project switcher, New, rod gauge, SCRAM, More dialog and focus return, desktop unchanged) |
| `pnpm -s tsc --noEmit` | no errors in these files; four existing errors in `NewWorkModal.tsx` and `newwork.test.tsx` (`checkout`) are not from this step |
| contrast and type-scale tests | extended to `components/shell.css`; pass |
| Screenshots (Playwright, API mocked in the browser) 1440x900 at 2x and 390x844 at 2x: Board, open drawer with a diff output, phone More sheet | `/mnt/project-files/control-rod/step3/` (`board-1440.png`, `drawer-diff-1440.png`, `board-390.png`, `drawer-diff-390.png`, `more-390.png`) |

## Polar crane (owner, 2026-11-24 17:45 UTC)

The owner said the crane was distracting and "much too low to the reactor". Two causes. First, the bridge sat at the top of the 190-unit cut wall, 37 px above the shield drum on screen. Second, style-pass-v2 asked the model to "separate the polar-crane bridge girder clearly in depth", which turned the Blender phantom outline into a solid beam.

| Check | Result |
|---|---|
| Baseline reproduction: `render.py --mode v3-plate,v3-core` plus post3 compositing vs committed `bakeoff/v3` frames | mean 1.6/255; committed core masks = baseline render alpha, max difference 0 |
| Wall rise (`CRANE_RISE` in `tools/plant3d/scene.py`) | 53 = largest rise keeping the wall 8 px clear of the electrical and civil room boxes, from rendered core layers at rises 0/60/110/160; clearing the drum with a wall-supported bridge needs ≥124, which covers rooms |
| Bridge (`CRANE_BRIDGE` = high) | phantom bridge, trolley and hook drawn above the cut at a height computed in code: bridge line 20 px above the shield drum's far rim (screen y 548.6 vs 568.6) |
| Registration, styled vs Blender and lit vs dark (`register.py`, 4 px step) | 42 of 42 room and core rows at 0 px |
| Identity outside the containment | frame-dark and frame-lit byte-identical to the previously approved frames (max 0); lit = dark outside the rooms (max 0); tripped = dark outside containment +120 px (max 4) |
| Warm colour | dark 0.00%, lit 0.00%, tripped 4.8% of the containment box and 0.09% elsewhere (rim edge) |
| `tools/cut_plant_layers.py` | re-cut at quality 84, 1,348,787 bytes (budget 1,500,000); `CORE_CROP` [535,269,…] → [496,216,…] |
| `npx vitest run src/features/office` | 13 files, 158 tests pass |
| `git diff --check`, `tools/check_originality.py`, `tools/check_offline_assets.py` | pass |
| `pnpm -s typecheck` (apps/web; generates the API types, then `tsc`) | pass (corrected 2026-11-24: an earlier bare `tsc` run without the API codegen reported 160 errors, all from the missing generated types) |

Evidence: `design/art/bakeoff/crane-fix-sheet.jpg` (before/after), and `design/art/source/hybrid/PROMPTS.md`, under "Polar-crane fix".

## Plant art v5 (sectioned reactor, 1.25x radworkers, stronger core)

Brief from the coordinator: WORKER_SCALE 1.25, because 1.5 made seated workers swamp their desks. Give the lit fuel grid more presence without clipping to white or adding caustics. Re-render, register, style-pass, lock, cut, set FIGURE_SCALE, screenshot.

| Check | Result |
|---|---|
| Blender scale | `WORKER_SCALE` 1.25 in `tools/plant3d/scene_consts.py`; chairs scale with it; sprites at 6 / 1.25 = 4.8 px per plate px (derived in `layers.py` and `post3.py`) |
| Desks | unchanged: at 4x zoom the working pose's hands sit at the desk front edge and keyboard level |
| Core glow | fuel body 1.2 → 1.3, cavity-water volume 0.045 → 0.20 (σ 52 → 64). Core-box bright area: Blender +9% vs v4 with 0 near-white px. Bloom gains 1.2 and 1.3 tried and rejected (clipped). Styled: lum>200 area 14,385 px vs 14,617 on main (v3 chevron); lum>150 area 18% smaller than main because the glowing chevron faces are gone |
| `tools/plant3d/registration.py` (Blender) | every room and the core: best shift 0 px, max bbox delta 1 px, boundary 1 px, IoU ≥ 0.992 |
| Styled vs render, full resolution, 1 px search | before fit: 1–3 px left; after `fit_affine.py` (sx 1.000, sy 1.001, tx −1/−2 px, ty −1 px): every room and the core within 1 px for dark, lit and tripped, and for lit vs dark |
| Identity | lit = dark outside the rooms (max 0); tripped = dark outside containment +120 px (max 3) |
| Warm colour | dark 0.00%, lit 0.00%, tripped 4.25% of the core box and 0.08% elsewhere; workers: amber only in the needs-you column (1,893 px), 46 px elsewhere (faces) |
| Gemini | the frame-dark it produced drifted up to 8 px per room at 1264×848; not used |
| `tools/cut_plant_layers.py --ingest` | 28 masks; quality 85; 1,387,090 bytes (budget 1,500,000); `SPRITE.pxPerPlatePx` 4.8; `FIGURE_SCALE` 1.5 → 1.0 |
| `cd apps/web && pnpm -s vitest run` | 78 files, 823 tests pass |
| `pnpm -s typecheck` | pass |
| `git diff --check`, `tools/check_originality.py`, `tools/check_offline_assets.py` | pass |
| `node tools/check_plant_contrast.mjs` (Chromium 1248) | busy 1440 worst 7.36:1, busy+tooltip 7.36:1, phone 16.26:1. **SCRAM 1440: 5 roster labels (Electrical, Civil) at 2.95:1.** The same 5 failures occur at the branch tip before this change (identical numbers). origin/main passes. Cause is outside the art: with the reactor plate centred, the top-row rosters sit under the new sticky top bar / SCRAM banner |
| Screenshots | `design/art/bakeoff/v5/` (healthy busy 1440, SCRAM 1440, phone 390, @2x); `design/art/bakeoff/v5-sheet.jpg` (current main vs v5) |

Provenance: `design/art/source/hybrid/PROMPTS.md`, section "v5 run".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
- Discipline-to-cube matching (figures.ts cubeFor) now matches at word boundaries; misfires (website, firebase, access controls, powershell, cost dashboard) default to process; services/api figures tests cover both.

## PR #167 review fixes

- Expanded "Review and restart" panel is now a keyboard-focusable region with `max-height` and its own `overflow-y:auto`, so the banner headline stays visible and lower controls stay reachable (`office.css`, `Scram.tsx`; test in `scram.test.tsx`).
- New change modal locks on the project it will actually capture into (the editable field, resolved to a project id), not the sidebar's active project (`NewWorkModal.tsx`; test in `shell-scram.test.tsx`).
- RodGauge drill accessible name is now "Drill SCRAM in force: work stopped", matching the spec that a drill really stops work (`RodGauge.tsx`; `instruments.test.tsx`).
- Drill lock (Nov 24): lockFrom now locks under drills too (server holds work under a drill per spec/workbench.tsp); words say 'SCRAM drill'. vitest shell-scram 10/10.
- CaptureBox (Nov 24): unscoped captures use the organization-only lock (useActionLock(null)), per Codex review.
- Plant annunciator honours reduced motion via useInstrumentMotion (Codex review on 7e88032); annunciator test.

## Agent logos on every screen (Nov 24)

- One source: `AgentMark` and the map in `lib/agentMarks.ts` from PR #173 (Lobe Icons, MIT; `public/agent-marks/README.md` and `LICENSE` unchanged). `AgentBadge` now renders `AgentMark` for every listed agent, so the Plant roster rows, Board cards, the review drawer's custody rows and the Setup/roster seats match the workflow diagram. A provider the app does not list, or a user-named model, keeps the generic chip glyph on the same plate; no runtime keeps the role glyph. No asset was copied.
- The dark plate stays behind every mark (contrast over the Plant art and light Board); tiles of 24 px or less fill 80% of the plate so marks stay legible; Board card badges are 18 px, Plant rows 16 px, seats 32 px. `AgentMark` takes an optional `label` for a text alternative; where the name is written beside the mark it stays decorative, as before.
- Tests: vitest 80 files, 864 pass (Plant roster row asserts the shared codex logo and the generic glyph for an unknown model; Board card asserts the claude and codex logos; Setup seat asserts the claude logo). `git diff --check`, `check_originality.py` pass.
- Screenshots (Playwright, 1440x900 at 2x, mocked data): `/mnt/project-files/control-rod/logos/` (`plant-1440.png`, `plant-roster-0.png`, `plant-roster-1.png`, `board-1440.png`).

## Plant label contrast under sticky chrome (Nov 24)

- Finding: `tools/check_plant_contrast.mjs` failed SCRAM 1440x900 at 2.95:1 on five top-row roster labels. At scroll 0 every label is on screen (checked by screenshot). The failure came from the check scrolling the reactor plate to centre, which moved the top row under the sticky top bar and SCRAM banner, and then sampling that chrome as if it were the art.
- Fix (tool only, no layout change): the check reads the scene at the top of its scroll and again with the reactor centred. A label counts only where it is on screen and not covered by chrome outside the scene, and each label keeps its worst reading. Run counts match the earlier single pass (42, 44, 44, 17).
- Result: PASS, 147 text runs, all at least 4.5:1 (busy 1440 worst 11.06, tooltip 10.32, SCRAM 11.33, phone 7.36).
- Dead CSS: `.today-grid` removed from styles.css. The other `.signin*` and `.today-*` rules are still referenced. vitest 80 files / 864 tests, tsc clean.

## SCRAM locks, phone cockpit, focus (review fixes, Nov 24)

- SCRAM lock: DecisionBar (decisions and the pending Sign), CardActions (primary button, every menu decision, reason Sign), CaptureCard and CaptureDrawer (Classify, Retry intake) and RunLog Requeue now read `useActionLock` and are disabled with the lock's reason; Stop stays open (it only stops work). QuickAdd's `c` key is blocked while locked, and the Board empty-state button is disabled and no longer clicks a disabled `.places-cta`. `components/scram-locks.test.tsx` checks each control under an organization SCRAM and a project SCRAM.
- Shell mounts the SCRAM banner always, so its load-error alert shows when `/scrams` fails (test). The phone More sheet traps Tab, and closing by the scrim returns focus to More (tests). BoardReviewDrawer returns focus to its opener on close (test).
- Phone cockpit: `dock.ts` docks the drawer below the top bar and any banner (the lowest edge of main, `.topbar`, `.scram-banner`); the `top: 0` override at 820 px is removed, so the SCRAM button and banner stay reachable.
- board.css: the drag trash target no longer scales or transitions under reduced motion; the Board empty state is a solid card with an accent edge (no dashed box); the full digest shows in the cockpit (wrapping, monospace); strip and output buttons are 44 px tall on a phone.
- Tests: vitest 81 files, 880 pass; tsc clean. The new always-mounted banner alerts when `/scrams` is unmocked, so newwork.test.tsx mocks it.

## Today, annunciator, phone Plant and focus fixes (Nov 24)

- Today: `brief()` takes the failed reads; a failed read is unknown (dash), never its cached zero, and calm needs both reads current with 0 waiting and 0 stuck. A failed Plant read alone no longer says "Nothing needs you." or "Plant at rest"; the empty-Inbox calm panel hides while the Inbox read failed. Tests in `today.test.tsx`.
- Annunciator: only the waiting-on-you tile acts (a link). Stuck, input changed and SCRAM do nothing, so they are plain readouts with no pointer cursor (`instruments.css`); test asserts the tags. Reduced-motion and paused rules now stop the parent `li` flash too; the 2 x 2 grid at 1023 px and below now sets `display: grid`.
- Phone Plant (767 px and below): the annunciator renders after the scene, before the list; desktop order unchanged. Test in `office-view.test.tsx`. Plant contrast check: PASS, 164 text runs, all at least 4.5:1 (worst busy 1440 11.06, SCRAM 11.33, phone 15.97).
- Touch: micro count plates and the seat switch get 44 px hit areas on phone or coarse pointers (`::after` hit area, `min-height: 44px`); visuals unchanged.
- Card: a running run with no start time shows a lit dot and the running wording, not "Waiting:". Seat-on animation plays once per seat per session (not under reduced motion). Closing the Inbox review drawer returns focus to its "Inspect and sign" button.
- vitest 81 files, 871 tests pass; tsc clean.
