# PR B (#32) review adjudication

## Round 1 (Codex, `b-codex-round1.md`): REVISE, nine findings

| # | Finding | Decision | Change |
|---|---|---|---|
| 1 | Presenting mode reads the body's lane, not the effective marking (blocker) | Accepted | Each package's lane is its current marking's effective lane (raises and inherited classification included), else its body's lane; a lane that cannot be read counts as restricted (fail closed). Capture lanes likewise, failing closed with no marking. Test: a package internal in its body but raised by its marking is left out of presenting mode, title included. Also raised by an automated review thread. |
| 2 | An active SCRAM hold loses priority to a finished run | Accepted | An active hold reaching the work comes first, whatever the latest run's status; the cause says "Held by SCRAM" or "stopped by SCRAM". Test: a pre-check finished before the pull stands in Quarantine, and so does running work. |
| 3 | Disputes the viewer may act on leave Your office | Accepted | Anything whose next step is the viewer's (permission, signature, dispute, lost run) stands in Your office and is counted (OV-05); disputes someone else rules on stand in Review with who. Test: a failed run the viewer may requeue, and a lost run the viewer may reconcile, are in Your office. |
| 4 | Intake agents and agentless Inbox items vanish | Accepted | Intake runs on captures are projected (routed as the Inbox routes their holds). The response carries `inbox_items`, and the view says how many Inbox items have no agent yet, so it never claims nothing waits when the Inbox holds something. Tests added. |
| 5 | "Input changed" uses the wrong baseline | Accepted | Changed means a recorded dependency's current revision is past the revision the package's preparation basis pinned. Without a pinned revision the input is listed as `unverified_inputs` and the card says its freshness is unknown; it is never claimed changed. Tests: pinned and unpinned dependents. |
| 6 | Serial reads per package | Accepted | Latest runs, effective lanes, dependencies and pinned revisions are each one read for all packages; SCRAM holds are looked up per figure only while a SCRAM is active. The Inbox stays the single source of the viewer's standing. |
| 7 | Figure marks not drawn on the figure | Deferred to PR C (plan task 4.7, OV-06 and OV-08) | Marks are in the projection, the card and the accessible name now; drawing them on the figure needs layout and harness legibility coverage and lands with the OV-06 acceptance case. |
| 8 | OV-06 card actions missing | Deferred to PR C (plan task 4.7, OV-06) | Several of those commands (call to office, give direction, park) do not exist yet; PR C adds the card actions through command descriptors, with stated reasons where a command is not available. |
| 9 | Lens value only as colour | Accepted | Every lens has a value in words, read in each figure's accessible name and shown on the card. Test: switching to Gate reads "Gate lens: In work" with the figure. |

Found while fixing: real package codes are wider than the harness fixtures, so the plate now shows at most six characters (the full id in the name and card), the harness fixtures use six character codes, and seat clearances and figure geometry were retuned until the harness passed at minimum zoom with 40 agents.

## Automated GitHub review threads on #32

| Thread | Decision | Change |
|---|---|---|
| figures.ts: presenting mode uses the body lane (P1) | Fixed | Same as finding 1. |
| figures.ts: dependency holds shown as runtime waits (P2) | Fixed | A queued run whose recorded dependencies are not all accepted, the same rule dispatch applies, waits at the Interface on the work it depends on, by name. Test added. |

## Round 2 (Codex, `b-codex-round2.md`): REVISE, three findings, all accepted

Round 1 findings 1, 2, 3 and 9 verified fixed; deferring 7 and 8 to PR C judged acceptable sequencing into task 4.7.

| # | Finding | Decision | Change |
|---|---|---|---|
| 1 | Failed, stopped and lost intake agents vanish | Accepted | An intake that failed, stopped or was lost before its capture became a package stays on the floor (stuck, Review, with its cause, an unknown outcome included). Test: a failed intake. |
| 2 | Pinned design inputs outside `depends_on` never count as changed | Accepted | Changed is measured over every package the preparation's basis pinned, design inputs and dependencies alike, against current revisions already loaded; a recorded dependency no basis pinned is the only "unverified" input. Test: a pinned design input with no dependency edge. |
| 3 | Serial cost through the Inbox and SCRAM checks | Accepted | `scramHoldIndex` answers SCRAM holds for every agent from one load of active SCRAMs, owners and restarts (a test checks it gives `scramHolding`'s answer for every package and capture). The Inbox's office listing (`office()` in work.ts) now reads latest runs, failed runs, author rounds and pre-checks once for all packages instead of per package. A test adds 30 agents to the floor and requires the same query count. The Inbox's remaining per-item work scales with what waits on people, not with the floor. |

## Automated GitHub review threads (second batch, against the first commit)

| Thread | Decision | Evidence or change |
|---|---|---|
| figures.ts: body lane in presenting mode | Already fixed | Effective lanes from markings, failing closed (round 1 finding 1). |
| figures.ts: per-package queries | Fixed | Batched reads and the constant query count test (round 2 finding 3). |
| office-harness.spec.ts: lens threshold below the reported 5.25:1 | Not a defect; wording corrected | The requirement is 3:1 for non-text contrast (WCAG 1.4.11), which the harness enforces; 5.25:1 is what the colours measure. The ledger now says so. |
| OfficePlace.tsx: "Floor" label | Not a defect | The office view is the floor (the cube sets and rooms); the station floor at `/floor` is deliberately left out of the switcher until plan task 4.9 moves its worlds to the rooms and retires it. |

## Round 3 (Codex, `b-codex-round3.md`): MERGE

| Thread (after round 3) | Decision | Change |
|---|---|---|
| figures.ts: dependency wait shown for runs dispatch does not hold (P2) | Fixed | Only an author run on a released package waits on unaccepted dependencies, exactly as `claim()` applies the rule; any other queued run (a pre-check, a later round) waits for a runtime. Test: a queued pre-check on a package with an unaccepted dependency stands on the Bench. |
