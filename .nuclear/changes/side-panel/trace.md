# Trace: Show details in a side panel instead of windows

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| SP-01 Details open in a side panel, not a window. | `SidePanel.tsx`; drawers wrapped | `side-panel.test.tsx`; side-check | implemented and tested |
| SP-02 Easy to hide. | X and Esc (drawers), outside click when covering | inbox tests; side-check | implemented and tested |
| SP-03 Page stays usable beside it. | `Shell.tsx` work-panes Group | side-check (page narrows, click keeps panel) | implemented and tested |
| SP-04 Resizable, width kept per person. | Separator, `lib/sidePanelLayout.ts` | unit tests; side-check drag and reopen | implemented and tested |
| SP-05 Narrow screens and phones. | overlay slot below the top bar | side-check at 1024 and 390 px | implemented and tested |
| SP-07 Files open at full size with a viewer per type. | `components/viewers/`, `PanelScreen.tsx`, `DrawerOutputs.tsx` | `viewers.test.tsx`, cockpit test (Expand, Esc back); viewer-gallery | implemented and tested |
| SP-08 A run's full log opens in the panel, not a pop-up. | `RunLog.tsx` (`runLogScreen`), `LogViewer.tsx` (`LogBody`) | cockpit test (open straight to a log); viewer-gallery | implemented and tested |
| SP-09 Cards anywhere open in the panel. | `CardPanel.tsx`, Shell host; Today, Packages, Runs, registers, captures, Plant agent card | `card-panel.test.tsx`; viewer-gallery (Packages row) | implemented and tested |
| SP-06 Nothing lost across the breakpoint. | stable slot element | unit test; side-check resize both ways | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: clicking a card, capture or inbox item, or a card link anywhere in the app, opens its details in one side panel; on a wide screen it sits beside the page (resizable, width kept per person) and the page stays usable; narrower it slides over the page and a click outside closes it; X and Esc hide it; an output file (markdown, PDF, Word, code, CSV, image, diff, JSON) or a run's full log opens at the panel's full size over the card, with Back and Esc returning to the card; crossing the breakpoint keeps what was typed; web tests, typecheck, build and the rendered checks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
