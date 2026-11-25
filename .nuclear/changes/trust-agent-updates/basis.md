# Basis: trust agent updates

**Change slug:** `trust-agent-updates`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Decision this basis supports:** whether a newer agent CLI than the one Control Rod measured is seated for work.

## Mission / need

On the owner's Mac, Codex 0.172.0, Antigravity 1.5.17 and (likely) a newer Grok CLI each auto-updated and were refused, so every non-Claude seat dropped out of work. Exact-version pins turn seats off whenever an agent updates, for every user. Owner decision (2026-11-25, project thread): "Just trust the agents. Updates are typically always better, not worse." and "Innocent until proven guilty."

## What this change does

- Codex: a feature a newer Codex turns on that Control Rod has not qualified is switched off for every run (`--disable`) instead of refusing Codex. The preflight lists the features again with it switched off and seats Codex only when Codex reports it off; a launch carries exactly the switches its preflight found for that artifact.
- Antigravity and Grok: the measured build and every newer one are seated, with a non-blocking "newer than tested" note in the start log and `controlrod runtimes`. Older or unreadable versions are still refused, with a plain fix.
- Every per-run fence stays as it was, whatever the version.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

TU-01 to TU-03 are implemented and tested, and the daemon tests pass apart from the known cloud-only egress test.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
