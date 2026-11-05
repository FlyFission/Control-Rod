# Basis: Reading comfort in the web app

**Purpose:** State what the research supports, how strongly, and what this change does and does not claim.

**Change slug:** `reading-comfort`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-05

---

## Mission / need

People supervise agents in Control Rod for hours at a time: reading logs, run output and records, and watching a floor update. The owner supplied a research report, *Conditions That Reduce Eye Strain and Protect Attention During Long Terminal-Heavy Coding Sessions*, and asked for what applies to the product's fonts and anything else that improves the user's day.

## Source and its limits

- The report is a ChatGPT-generated literature review with its own evidence grades (strong, moderate, weak, contested). It cites W3C, OSHA, AAO, ISO, Cochrane and peer-reviewed studies.
- **Not independently verified.** The citations were not re-read for this change. Findings are used at the grade the report gives them, and no claim below is stronger than that.
- Most of the report is about the owner's own editor and terminal (Cursor, font point size, ANSI contrast, monitor height, lighting, breaks). Those are personal settings and are not in this repository.

## What applies to the product, and at what grade

| Finding (report grade) | Applied as |
|---|---|
| Text comfortably above a legibility threshold; larger text generally reads faster (moderate for direction, weak for exact size) | Readable chrome text moves up one step; nothing readable below 11px; scene art exempt. |
| Avoid cramped lines; no universal best line height (moderate / weak) | Multi-line monospace blocks get an explicit `--lh-mono`, in the report's 1.20 to 1.25 range, instead of inheriting the page's prose height. |
| Keep letter spacing at the font's default (moderate) | No change. A test fails if a tracking token is added. |
| Moderate line length; roughly 75 to 85 characters for prose; code may run wider (moderate for avoiding extremes, weak for the exact range) | `--measure` on agent prose and page intros. Code blocks and tables are not narrowed. |
| Adequate contrast is the robust requirement; "more contrast is always better" is unsupported; soft themes often get softness from dim secondary text (strong / weak) | The app already meets this. A test now keeps it so (AA everywhere, AAA for the three reading colours). |
| Task switching and interruptions cost attention (strong); important output is better read as a stable object than a moving stream (moderate) | A reader can pause a running log, see how many lines arrived, and resume. Live events were already batched. |
| Removing unnecessary motion is reasonable (weak) | Already covered by reduced-motion, hidden-tab and the Floor's motion setting. No change. |
| Keep JetBrains Mono (weak that any coding font beats another) | No change. The Regular weight is preloaded so mono text does not reflow when the font arrives. |

## Not claimed

- No claim that this reduces eye strain, fatigue or any clinical outcome. The report grades font, theme and exact-size claims as weak, and no trial was run here.
- The step sizes and `--lh-mono` are design choices inside the report's ranges, not measurements.

## Left for the owner (decisions, not edits)

- **Light mode that follows the room.** The report favours light polarity in lit rooms and dark in dim ones, and says time-of-day switching is only an approximation. The brand palette is dark by direction of the Platform Plan, and `floor.css` carries about ninety fixed colours.
- **A text-size setting.** Sizes are px; rem would touch every rule and every scene.
- **Scene label size.** Station and figure codes in the scenes stay small.
- **Break reminders.** Supported at moderate grade, but a nudge is itself an interruption.
- **Editor and terminal settings** from the report are personal and untouched.

## Required links

- `risk.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- `docs/reading-comfort.md`, `apps/web/src/design/`

## Exit criteria

- Builder and reviewer can say what the research supports and at what grade.
- Nothing is claimed beyond that grade.
- Evidence needs flow into `verification.md`.

## Source-lineage note

Basis structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
