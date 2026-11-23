# Ship: agent update prompt

Release decision: **merge.** The owner signed the `spec/` change (Signature below) and chose to land after round 13's fixes. CI is green at `482fd802`.

- **Proposed:** merge to main.
- **Not claimed:** no real `npm install` was run in tests; the panel was tested in jsdom, not a real browser; API tests ran on PostgreSQL 16.

Rollback: revert the commits. The contract additions are optional fields; an older daemon or app ignores them. The settings row `agent_updates` can stay.

Monitoring after merge: reports of a wrong version comparison or a command offered for a non-npm install.

## Review history

Codex ran blind reviews through the landing thread. Rounds 1 to 4 covered the earlier install-from-the-app shape, which was removed on 2026-11-23 when Ben chose to show the command only. Rounds 5 to 13 reviewed the shape that ships here:

| Round | Head reviewed | Outcome | Fixed in |
|---|---|---|---|
| 5 | before 45832ea3 | P1 command injection through the copied command | 45832ea3 |
| 6 | 45832ea3 | HOLD, P2: partial check wiped known rows; prerelease parsing | 7a22aece |
| 7 | 6cafdd3a | HOLD, P2: per-runner rows (single daemon identity accepted as R-13); P3s | cc6c33de |
| 8 | 0a9b53fa | HOLD, P2: a carried row could recommend a downgrade | d954db2c |
| 9 | d954db2c | HOLD, P2: cached report resent after an install while the daemon ran | 974d1a77 |
| 10 | 27e9fe2e | HOLD, P2: one resolution per check; recheck before install; refetch before Copy | 8f17f3eb |
| 11 | 8f17f3eb | HOLD, P2: unverified provenance on kept rows; check off; stale command text | 2bd3f64b |
| 12 | 2bd3f64b | HOLD, P2: a remount showed a cached command | 120117b2 |
| 13 | 120117b2 (scoped to the panel) | HOLD, P2: same-tick freshness; P3: remount test did not protect refetch on mount | this change (web panel, its test and this record only) |

Ben chose on 2026-11-23 to land after round 13's fixes, with no further Codex rounds. The round-13 fixes touch only `apps/web` and this change record, with no spec change. Each fix's evidence is listed in [verification](verification.md) (E-07 to E-15).

## Signature

`spec/api.tsp` changes in this PR are additive (minor): `Runner.AgentUpdate` (no command field), `Runner.AgentId`, `Runner.UncheckedAgent`, and optional `agent_updates` and `agent_updates_unchecked` on the claim and `agent_updates` on `GET /runtimes`.

| Field | Entry |
|---|---|
| Decision | Approve the additive `spec/` change in #137 so it can merge |
| Question | "Approve #137's spec change at head 120117b so it can merge?" (decision card in the owner's project thread, 2026-11-23) |
| Answer | Ben Huffer chose "Yes, approve #137's spec change" at 2026-11-23T22:07:45Z |
| Head when asked | `120117b2` |
| Later changes | `482fd802`: `apps/web` panel, its test and this record only; no `spec/` or generated file changed (`git diff --name-only 120117b2 482fd802`) |
| Also chosen | "Land after this round" at 2026-11-23T22:04:44Z (review history above) |
| Recorded by | Claude, from the owner's own choices on the cards. No signature or initials are typed for him |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

AU-01 to AU-06 are implemented with failed-first (mutation) evidence, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
