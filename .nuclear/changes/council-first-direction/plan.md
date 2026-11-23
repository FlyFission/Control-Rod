# Plan: Council-first direction

**Change slug:** `council-first-direction`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Branch:** `claude/project-thread-c8npg3`

---

1. Run the persona model and the issue pulls; classify; hand-code the top 60; count by script.
2. Write ADR 0024 from those outputs, marking what still needs signed kernel or policy changes.
3. Write the herdr pattern note from its README and issue labels.
4. Commit the scripts, inputs and outputs with digests; check that both outputs reproduce.
5. Run the public-claims and originality checks and validate this record; open a draft pull request.

## Affected files

`docs/adr/0024-council-first.md`, `docs/research/user-demand-2026-11/`, `docs/patterns/herdr.md`, `docs/patterns/README.md`, `docs/README.md`, this record.

## Not touched

`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/`, `kernel/`, `docs/status.md`, `README.md`, `docs/plan/`.

## Rollback

Revert the commit.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- A reviewer can repeat every result from `verification.md`.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
