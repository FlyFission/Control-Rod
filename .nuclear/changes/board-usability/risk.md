# Risks of simplifying the board

## Selected mode

- **Mode:** Standard

| Risk | Control |
| --- | --- |
| A developer misses verification or a signature after filtering. | Count both protected stages across search, filters, and project or mode scope. Check the reveal action and confirm a refused action remains disabled. |
| A narrower window or a split drawer hides stages or clips actions. | Give horizontal scrollers a stage jump and render the card menu above the scroller. Test focus on entry and return. |
| Someone accidentally removes a package when trying to move it. | Use the named Remove and Dismiss controls in the drawers. |
| An empty result looks like a loading or read failure. | Show clear-filters feedback after successful reads. Keep loading and error feedback. |

This change addresses web presentation and board navigation. Protected repository surfaces are outside its scope.

## Required links

[basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Review the desktop board and record unit, build and browser evidence.

## Source-lineage note

Repository change-control evidence. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md).
