# Ship: agent workbench patterns and attention signals

Release decision: **for owner review; no merge is authorized by this record.**

- **Proposed:** merge the note, AW1 to AW4 and this packet.
- **Not claimed:** a real-browser pass. Notifications, the title and the shortcut list were exercised in jsdom with a stand-in `Notification`. Before relying on AW2, turn it on from the Inbox in the browser you use, hide the tab, and have someone return a package to you.
- **Not claimed:** a person's read of the note for copied wording (D3); a script ran instead (E-03).
- **Not claimed:** any change to what counts as waiting on a person. AW1 and AW2 read the same `GET /inbox` as the rail badge.
- **Found, not fixed:** the Today page counts every `draft` and `in-verification` package as "Needs Your Decision", including work waiting on someone else, so it can disagree with the Inbox and the new tab count. Recorded as AW5 and proposed as the next change.
- **Owner decisions requested:** accept the note or return it with changes; confirm D2 and D3; pick the next items (proposed: AW5, then AW7).

Rollback: revert the commit. Nothing is stored on the server; the only browser storage is the per-person `cr.notify:<user>` key, which nothing else reads.

Monitoring after merge: with notifications on, a hidden tab should show one notification per new Inbox item and none on reload; the tab title should match the Inbox badge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/agent-workbenches.md` gives a decision for each item AW1 to AW19. AW1 to AW4 work in the web app: the tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on and then fire only for new Inbox items while the tab is hidden; `N` on the board moves to the next card marked Needs you or Blocked; `?` opens the shortcut list. The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
