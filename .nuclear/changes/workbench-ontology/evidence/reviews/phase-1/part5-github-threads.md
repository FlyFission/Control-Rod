# Phase 1 part 5: GitHub review threads left open after merge (PR #23)

The Codex connector left 13 inline threads on PR #23. The last one was posted on the final head (`8125be0`) after the merge, and none was adjudicated in `part5-adjudication.md`, which covers the local Codex CLI rounds only. Each was checked against `main` at `c069146` on 2026-11-04.

## Fixed in this change

| Thread | Decision | Change and evidence |
|---|---|---|
| markings.ts: an explicit raise that matches an inherited lane is lost (P1) | Accepted, fixed | `markObject` takes `explicit` from callers where a person set the object's own lane (draft edit with a changed lane, preparation contract raise) and records `assigned` when that lane rises above the object's own lane, even when an input already makes it that sensitive. An untouched lane still records nothing. Tests: "keeps a draft's own raise when it matches the lane it already inherits, so declassifying the input cannot lower it" (fails without the fix: no `assigned`, package drops to internal); "does not record an assignment when an edit leaves the lane untouched". |
| markings.ts: provenance cycles from package citations break later raises (P2, rated high here) | Accepted, fixed | A new provenance edge to the object itself, or to anything already derived from it, is refused with `provenance-cycle` (409, with advice). A loop recorded before this change no longer throws: its members are rewritten once per member so a raise travels round it, then everything derived from it. A loop can only hold its members up, so it fails closed. `ensureMarking`'s self-loop error is now the same refusal. Tests: "refuses a citation that would make two objects draw on each other" and "still lands a raise through a loop recorded before loops were refused" (fails without the fix with the old server error). |

## Already fixed before this change

Unmarked legacy inputs, preparation authors as originators, signature binding to the deliverable, recompute order, serialized raises, legacy provenance at admission, configured lanes behind marked dependencies: closed by P5-04, P5-06, P5-13, P5-15, P5-23 to P5-30 in `part5-adjudication.md`.

## Still open, for later changes

- work.ts `updateDraft`: an unrelated edit after an inherited raise is refused as a lowering (fails safe).
- work.ts `classifyCapture`: classifying an already processed legacy capture queues intake again.
- work.ts `claim`: the intake branch records a hold before locking the queued run.
- work.ts `packageView` and `packageLane`: views and download labels use the cached marking, not live configured lanes.
