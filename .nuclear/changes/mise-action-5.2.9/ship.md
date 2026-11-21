# Ship: mise-action v5.2.9 pin bump

Release decision: **approved for merge: signed by the sole maintainer's recorded yes (see Signature), once CI is green.**

- **Proposed:** squash-merge pull request #99.
- **Not claimed:** a review of the upstream action's code; the pin in `platforms.yml` (still v5.2.7, out of scope).

## Signature

Recorded under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

| Field | Entry |
|---|---|
| Decision | Approve: pull request #99 as it stood at `a5f5a6c` |
| Trust-surface files | `.github/workflows/ci.yml`, `.github/workflows/readme-shots.yml` |
| Question | The paragraph quoted word for word below, posted in the owner's Claude project thread for the click-to-talk work on 2026-11-21 at 15:34 UTC (10:34 AM EST) |
| Answer | "Yes", Ben Huffer, project owner and sole maintainer, in the same thread, 2026-11-21 16:43 UTC (11:43 AM EST, America/New_York) |
| Head when asked | `a5f5a6c`. After the yes, `main` was merged in and this record was added. The PR's diff in `.github/` against `main` is unchanged: the same seven pin lines (E-02) |
| Recorded by | An agent working for the owner in that thread, from the chat message. Ben Huffer did not write this entry, and no signature or initials were typed for him |

The question, word for word:

> **#99 needs your recorded yes.** It touches a trust surface, `.github/workflows/`. It bumps the `jdx/mise-action` pin from v5.2.7 to v5.2.9 in `ci.yml` and `readme-shots.yml`, and it also changes `docs/assets/readme/app/office.png`. Do you approve merging PR #99?

## Rollback and monitoring

Rollback: revert the merge, which restores the v5.2.7 pin. Watch the next CI runs on `main`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sign-off rule: [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

## Exit criteria

The `jdx/mise-action` pin is v5.2.9 in `ci.yml` and `readme-shots.yml`, CI is green on the pull request's head, the owner's yes is recorded in the Signature table, and nothing else in `.github/` changes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
