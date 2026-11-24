# Basis: Make the sidebar resizable and collapsible

**Change slug:** `resizable-rail`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Status:** Built, for owner review.

## Mission / need

The owner asked on 2026-11-24 to be able to move the left bar in and out, because projects with decent names are cut short, and for windows and sidebars to present well.

## What already exists

- `apps/web/src/components/Shell.tsx`: a fixed 224 px rail (CSS grid in `styles.css`) with the project list, places, and the foot; phones (≤ 820 px) have no rail and use the bottom bar.
- Project names were cut to one line with an ellipsis and no way to read the rest; the repository chip took up to 82 px beside them.

## Proposal

1. Use react-resizable-panels 4.22.1 (MIT, Brian Vaughn) for the rail and the workspace: pixel sizes, min 200 px, max 480 px, default 248 px, collapsible to 0, width kept in pixels when the window is resized, keyboard-resizable separator with WAI-ARIA `separator` semantics, double-click to reset.
2. A top-bar button (`aria-expanded`, `aria-controls`) and the single key `[` (respects the single-key switch, ignored in fields and under dialogs) hide and show the rail. A hidden rail is `inert`, so Tab never lands in it.
3. Width and hidden state are per-viewer conveniences in this browser, one entry per signed-in person (`lib/railLayout.ts`), clamped on read.
4. Project names take up to two lines before they are cut and carry the full name and repository as a tooltip; the repository chip only shows when the rail is wide enough to spare it.

## Out of scope

- `spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `tests/redteam/`, `.github/`: untouched. The phone layout is unchanged.
- An icon-only collapsed rail (it needs a glyph per place) and resizable panes inside pages; both can reuse the same library later.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: on a wide screen the navigation rail can be dragged wider (up to 480 px) or narrower (down to 200 px), hidden and shown again from the top bar or with `[`, and keeps each person's width and hidden state across reloads; long project names wrap to two lines and show in full on hover; the phone layout is unchanged; web tests, typecheck, build, license gate and the rendered check pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
