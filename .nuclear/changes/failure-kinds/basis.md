# Basis: Typed failure reasons and one safe retry for author runs

**Change slug:** `failure-kinds`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

When an author run failed, the server knew only the daemon's error text. The one automatic retry for an author run spotted a restart by the start of that text ("daemon shutdown", `retryFailedRun`). Any other author failure stopped for the owner, including passing ones such as the agent CLI quitting on a dropped connection. That works against the goal of about 90% of cards reaching a PR without the owner.

Found by the 2026-11-28 repo-siphon run over 23 repositories. Nine of them named typed failure reasons (gastown C-001 Tier 1, plus scion, paperclip, orca, agent-deck, headroom, bernstein and t3code). The design is our own; no donor code is used.

## Proposal

1. `spec/work.tsp`: enum `FailureKind` (shutdown, timeout, lost, out-of-contact, stopped, breaker, unfinished-turn, exited). Optional `failure_kind` on the run, and on the completion body in `spec/api.tsp`. Additive. Generated files regenerated.
2. Daemon: `failKind(err)` places the error from the daemon's own error values only, next to `failText`, and the completion carries it.
3. API: stores the kind on a failed or stopped run. `retryFailedRun` keeps every existing rule, and adds one more try for an author run whose kind is `exited` or `out-of-contact`. It applies only when the daemon sent containment (cgroup, process group, or no process started), under the same signed "auto" policy, revision and chain checks, at most once per run chain. The run's reconciliation says why, in words.
4. Product default, chosen by Claude under the owner's standing rule to make product-default calls. Retried: `exited` and `out-of-contact`. Not retried: `timeout`, `breaker`, `lost`, `unfinished-turn` and `stopped`, because running again would likely end the same way, or the person chose the stop. The limit is one, the same as the existing rule for a failed check.

## Out of scope

Holding runs while a usage window is full (a separate change). Switching agent on retry. Web wording for the kinds. `kernel/`, `policies/`, `.github/`, ADRs untouched.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every failed run the daemon can place carries a fixed failure kind, taken from the daemon's own error values. An author run whose agent quit with an error, or that the daemon stopped after losing contact, runs again once on its own under a signing policy that lets cards run. That holds only when the daemon accounted for its processes. Every other failure stops for the person as before. API and Go tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
