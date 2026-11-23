# Basis: scoped send-back after a failed check

**Change slug:** `scoped-send-back`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Status:** Proposed. Nothing is built yet. This record asks the owner whether to build it.

## Mission / need

When the blind check fails, the author agent should get back exactly what failed, the evidence, and the files it may touch to fix it. Then it should fix that and nothing else. That is what lets a card go from plan to PR without the owner watching each round.

## What already exists

The send-back loop is already built. The proposal only tightens what travels with it.

- A pre-check that does not pass re-queues the author for the next round, up to `MAX_ROUNDS = 3` (`services/api/src/work.ts:79`, `work.ts:2928`).
- The next author round gets the previous findings as JSON under "Findings to fix from the pre-check", plus its own previous outputs under `previous/` (`work.ts:1233`).
- After the third failed round the package shows as a `dispute` item in the inbox (`work.ts:3169`). The person can accept with findings, return or reject (`services/api/src/inbox.ts:28`).
- Fails stick to the deliverable digest, so the same bytes cannot be re-checked until a pass (change record `checker-attempts`).

## Gaps

1. **A finding has no evidence or location.** `Finding` is `id`, `severity`, `text` and an optional `resolution` (`spec/records.tsp:370`). The author gets prose, not "expected 302, got 200 at `handlers/auth.py:88`".
2. **A send-back has no scope.** Nothing tells the author which files the fix may touch, and nothing compares round N+1 with round N. A one-file fix can turn into a rewrite. Correct files get changed and then have to be checked again.
3. **The dispute does not say what three failures usually mean.** After three failed rounds the fault is usually in the plan, not the work. The dispute item says how many rounds failed but does not point the person to return the card to planning.

## Proposal

1. Add three optional fields to `Finding`: `evidence` (what was expected and what was seen), `location` (a path, with an optional line), and `scope_paths` (the files a fix may change). These are additive inside API 0.1. No `schema_version` bump and no spec major version.
2. Ask the checker to fill them in. The pre-check brief says a finding without evidence is advisory.
3. Add a "Scope of this fix" section to the author's rework brief. It lists the union of `scope_paths` from the findings, and says files outside it must stay unchanged.
4. After each rework round, compare the author's outputs with the previous round's outputs. Record any file that changed outside the scope as a `package.scope-drift` event. Show that event on the card and give it to the checker as an input. In this first version drift is reported, not refused.
5. Change the dispute text to say that three failed rounds usually mean the plan needs another look, with Return as the suggested action. This is a copy change on an action that already exists.

## Out of scope

- The round cap stays 3. Making it configurable is a separate decision.
- `kernel/` decision functions, `policies/`, `tests/redteam/`, `.github/workflows/` and `daemon/internal/runner` are not touched.
- Refusing drift outright instead of reporting it. That can follow once there is data on how often it happens.

## Source

This idea came from a public post on agent loops that the owner shared on 2026-11-23. It covered returning one unit rather than a whole batch, and returns that carry unit, verdict, reason, evidence and scope. Only the idea is used. No text or code is copied.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md).

## Exit criteria

A failed check's findings carry evidence, a location and a scope. The author's next round sees that scope. A change outside the scope shows on the card and goes to the checker. Existing API tests, web tests and typecheck pass. The owner keeps the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
