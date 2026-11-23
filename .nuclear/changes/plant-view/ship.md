# Ship: the Plant view

Release decision: **proposed merge after review; the owner retains the merge decision.**

- **Proposed:** merge the Plant view from `claude/project-thread-pi83dg` as a draft pull request.
- **Not claimed:** Firefox or WebKit behavior (Chromium only here); usability with real users; that the drawing resembles any real plant; an independent review of the code (the plan was reviewed independently).
- **Owner decisions requested:** approve or return the art from the screenshots; approve or return the branch; whether to run the third (opencode) review once a provider is signed in.

Rollback: revert the merge. No API, schema or wire change; no stored data is touched. An archived theme choice stays stored under its own key.

Monitoring after merge: watch that the Waiting on you window always matches the Inbox, and that the rods never show inserted without a SCRAM in force.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design: [plant view design](../../../docs/superpowers/specs/2026-11-23-plant-view-design.md). Earlier work: [overlay-themes](../overlay-themes/basis.md).

## Exit criteria

The Plant view is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, validation with real users, or that the art resembles any real facility; it is a stylized plan, not an engineering drawing.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
