# Basis: README overhaul

**Related risk record:** `risk.md`
**Change slug:** `readme-overhaul`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Decision this basis supports:** whether the rewritten README and the added board screenshot may replace the current front page.

---

## Mission / need

The owner asked (2026-11-22) for a complete overhaul of the README and landing page because the product has changed a lot. The old README led with the inbox and the office; since then the board became home (board M1 to M4), Light and Nuclear context arrived (`nuclear-context-toggle`), Today, Explore and Compare landed (`wave3-workbench-freeze`), more agent CLIs are detected (`wave2-multi-cli-adapters`), and audit export with offline `pnpm cr verify` shipped (#110).

## Fixed inputs

- Positioning from the owner: one table for the agents people already use; a different agent checks by default; minimal; no push to buy subscriptions; written for many users, not the owner's setup; no compliance claims.
- What is on `main` at d0a4cc6, read from `docs/status.md`, the change records named above and `apps/web/src`.

## What changes

- `README.md` is rewritten: a one-line pitch, the board screenshot first, four reasons, an honest agent table, a short tour (board, sign-off, office, the rest), install, how it works, what it is not, and contributing. 145 lines become about 120.
- `apps/web/e2e/readme-shots.spec.ts` takes a fourth picture, `board.png`, from sample software cards in every column. The existing three pictures are retaken by the same run.

## Revision 2 (2026-11-23): choose where you come in

The owner asked (2026-11-23) for "the end user decides where they come into the picture" as a README selling point. It is not built; ADR 0024 (draft PR #150) records the decision. The README adds it as one bullet marked *(planned)*, and states what is true today: a person signs at release and at acceptance. When it ships, drop the marker.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Only Claude Code and Codex can author and check. | `apps/web/src/lib/runtimes.ts` `runnable`; `wave2-multi-cli-adapters` basis. | Any adapter's confinement qualifies; update the agent table. |
| The checker must come from a different vendor family to run unattended. | Old README and `subscriptions-page` basis. | A kernel change to O6 independence (#115). |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Builder and reviewer can say what the README claims and where on `main` each claim lives.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
