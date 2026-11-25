# Plan: Make the sidebar resizable and collapsible

1. Read the shell, its CSS and tests; pick an established library (react-resizable-panels: MIT, React 19 peer, pixel units, keyboard support).
2. Wrap the rail and the workspace in a Group on wide screens; keep the phone branch as it was.
3. Toggle button, `[` shortcut and shortcut list entry; per-person saved layout; tooltips and two-line names.
4. Unit tests (jsdom stand-in for the library, since jsdom has no layout), rendered check in Chromium, screenshots, draft PR, Codex blind check.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: on a wide screen the navigation rail can be dragged wider (up to 480 px) or narrower (down to 200 px), hidden and shown again from the top bar or with `[`, and keeps each person's width and hidden state across reloads; long project names wrap to two lines and show in full on hover; the phone layout is unchanged; web tests, typecheck, build, license gate and the rendered check pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
