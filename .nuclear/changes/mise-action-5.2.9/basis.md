# Basis: mise-action v5.2.9 pin bump

**Change slug:** `mise-action-5.2.9`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether pull request #99 (Dependabot) is merged.

## Mission / need

Dependabot proposes moving the `jdx/mise-action` pin from v5.2.7 (`b44d12e7`) to v5.2.9 (`236a21c3`). The upstream notes list a Windows install fix (v5.2.8) and a release with no user-facing changes (v5.2.9). The branch also carries a screenshot refresh (`docs/assets/readme/app/office.png`) committed by the readme-shots workflow.

## Scope

In scope: the six pin lines in `.github/workflows/ci.yml`, one in `.github/workflows/readme-shots.yml`, the screenshot, and this packet. Out of scope: `.github/workflows/platforms.yml`, which reached `main` after Dependabot opened the PR and still pins v5.2.7 in two places; Dependabot will propose that separately.

## Fixed inputs

The action stays pinned by full commit SHA, with the version in a comment, as every other action in the workflows is.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| `236a21c3` is the upstream v5.2.9 release commit. | The PR's commit list shows `236a21c` "chore: release v5.2.9 (#740)". | The tag moving or the commit not being on the upstream release history. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sign-off rule: [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

## Exit criteria

The `jdx/mise-action` pin is v5.2.9 in `ci.yml` and `readme-shots.yml`, CI is green on the pull request's head, the owner's yes is recorded in the Signature table, and nothing else in `.github/` changes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
