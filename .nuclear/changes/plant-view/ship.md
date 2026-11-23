# Ship: the Plant view

Release decision: **merge on the owner's yes.** The code passed six rounds of Codex blind review, ending MERGE-WITH-P3S at 870a060, with its one P3 fixed after.

- **Proposed:** merge the Plant view from `claude/project-thread-pi83dg` once the owner says yes to the art and the merge.
- **Independent review of the code:** Codex CLI (OpenAI), run blind in the landing thread on the owner's machine. The raw outputs are kept there under `land-out/`, not in this packet, so each round is classed as a self-check (E-07 to E-12):
  - Round 1, `land-out/pr153-r1-f2539fa.md`: HOLD, fixed in T-11.
  - Round 2, `land-out/pr153-r2-f9ef354.md`: HOLD, fixed in T-12.
  - Round 3, `land-out/pr153-r3-f97d401.md`: HOLD, fixed in T-13.
  - Round 4, `land-out/pr153-r4-df45884.md`: HOLD, fixed in T-14.
  - Round 5, `land-out/pr153-r5-8648b81.md`: HOLD, fixed in T-15.
  - Round 6, `land-out/pr153-r6-870a060.md`, scoped to the diff since 8648b81: MERGE-WITH-P3S. Its one P3 is fixed (the crowded-floor test now covers list mode).
- **Not claimed:** Firefox or WebKit behavior (Chromium only here); usability with real users; that the drawing resembles any real plant; that the code reviews are independent reproduction (they are model reviews of the code, kept on the owner's machine).
- **Owner decisions requested:** approve or return the art from the screenshots, and say yes to the merge. Whether to run the third (opencode) review once a provider is signed in stays open; it does not block the merge.

Rollback: revert the merge. No API, schema or wire change; no stored data is touched. An archived theme choice stays stored under its own key.

Monitoring after merge: watch that the Waiting on you window always matches the Inbox, and that the rods never show inserted without a SCRAM in force.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design: [plant view design](../../../docs/superpowers/specs/2026-11-23-plant-view-design.md). Earlier work: [overlay-themes](../overlay-themes/basis.md).

## Exit criteria

The Plant view is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, validation with real users, or that the art resembles any real facility; it is a stylized plan, not an engineering drawing.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
