# Basis: Runs that stall or fail silently now fail loudly, with the reason

**Change slug:** `runs-fail-loudly`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

The 2026-11-28 code review (batch 5: API-3, API-5, API-10, API-11, API-15, API-20, DMN-4, DMN-7, DMN-8, DMN-10 and issue #178, DMN-11, DMN-12, DMN-13, DMN-20) found runs that stall or fail with no reason a person can act on. One queued run the claim cannot build stops every claim. A job the daemon cannot read sits until its lease lapses, and any API change ahead of the daemon does this to every run. A failed turn says only "the runtime reported that its turn failed". A pull request can stay at "opening" for good. Leftover processes of a group are retried every 30 seconds forever. Shutdown can hang for minutes, and a second Ctrl-C does nothing. PR #256 already gives failed runs a kind and one retry; this change adds what it leaves out. The design is our own; no donor code is used.

## Proposal

1. Claim (API-3, API-20): each candidate run is tried on its own. A run whose job cannot be built fails with "Not started: Control Rod could not hand this run to the daemon. <reason>. Fix what that names, then run the card again." and the claim goes on to the next run. Database faults that are not about one run still fail the claim. Recording what the daemon reports beside a claim (agent updates, runtime status, subscriptions, usage) is logged on failure and never fails the claim.
2. Claim protocol (DMN-4): the daemon sends `claim_protocol` (1). The API refuses an older daemon with 409 `daemon-outdated` before handing out any run, in plain words. A job the daemon cannot decode is reported against that run at once, as failed with nothing started. A test pins the Job schema's digest to the protocol number, so a Job change makes a person raise it. `spec/api.tsp` gains the optional field and a second evidence observation (additive).
3. Failed turns (DMN-13): the daemon reads the agent's own end-of-turn error (Claude Code's error result, Codex's `turn.failed` or `error`), or after an error exit a stderr line that names a known reason, and adds it to the run's error in plain words with what to do: usage limit, sign-in, refused, context window, turn limit, or a service problem, then the agent's own words, clipped to 300 bytes.
4. Output and waits (DMN-7, DMN-8): an output line over 16 MB is left out with a note and reading goes on. While a run waits for the same agent's other run on the machine, it heartbeats with the label "Waiting for this agent's other run on this machine" and renews its lease.
5. Completion and shutdown (DMN-11, DMN-12, DMN-20): a completion upload gets 5 minutes, cut to 10 seconds once the daemon is stopping. The log says when the outbox could not keep a completion. SIGHUP stops the daemon like Ctrl-C, and a second signal exits at once.
6. Leftover processes (DMN-10, #178): while the group's leader is proven alive in the group, each member is signalled through its own pidfd (Linux). With no proven leader nothing is signalled by number. Stop attempts back off, and after 3 tries the daemon reports `processes-remain`, which marks the run lost with outcome unknown and says what to do.
7. Run log (API-10): a NUL character is replaced before it reaches PostgreSQL, so a heartbeat never fails on it. The log keeps its last 4,999 lines and a first line saying so.
8. Intake (API-15): a card file that is not valid JSON fails the intake with the file's name, and no card is made.
9. Pull requests (API-5): every attempt ends with an outcome. A thrown error, or an attempt still going when its 15-minute claim runs out, is recorded as not opened with the reason, and a claim left with no outcome reads as not opened once it runs out. The server start retries it, as before.
10. Worktrees (API-11): `/repos/remove` refuses with 409 `worktree-in-use` while a queued or running run's checkout is the worktree or inside it, even with force.

## Out of scope

A timer that retries a failed pull request without a restart. A claim-protocol number above 1. Containment of a group whose leader is gone (cgroups do that where they run). Windows test builds (they fail to compile on main too).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A run that cannot start, cannot be read, waits, or fails says why in plain words, and none of them stops other work: one broken queued run fails with its reason while the claim hands out the next; a daemon that cannot read a job fails that run at once and an outdated daemon is told to restart; a failed turn names the vendor's reason (usage limit, sign-in, refusal, context window) with what to do; a pull request attempt always ends with an outcome; leftover processes are stopped through the whole group or reported; a worktree a run is using is not removed; and shutdown ends in seconds, at once on a second Ctrl-C. API typecheck, the touched API tests, and the daemon's vet and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
