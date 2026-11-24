# Basis: Fewer steps on a new card

**Change slug:** `card-friction`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Status:** Built, for owner review.

## Mission / need

The owner, 2026-11-24: adding a card forces a second step (choosing a data lane), he did not know whether the lanes change anything, and cards read "Needs you" for things that need nothing.

## What the lanes do today (read from code)

- Public and Internal behave the same: cloud CLIs may see the work (`services/api/src/disclosure.ts` LANE_RUNTIMES), roles may get named network hosts (`sandbox.ts` NETWORK_LANES), preparation grants are allowed, and presenting mode shows the work (`figures.ts` PRESENTABLE).
- Proprietary, Client confidential and Restricted behave the same: only local runtimes are admitted, and none ships yet, so such work holds with a lane hold; no sandbox network; hidden while presenting.
- All lanes: a lane can be raised freely; lowering is a signed declassification; a package's effective lane is the most sensitive of everything it draws on.

## Proposal

1. Quick add sends the active project's lane (Internal with no project). The server's disclosure gate is unchanged: it classifies only for a sender with lane authority.
2. The project bar gets "New cards' data lane", a signed project update like the other project settings.
3. The capture drawer says what the card's lane means and offers raising it (lanes below the current one are not offered).
4. `nextLine` no longer names Return or Reject as a card's next step: both are open on all live work.

The five lanes stay in the data model: stored markings and signed records name them, and the sensitive three are meant to diverge once providers are approved per lane (specification section 34, Q-C).

## Out of scope

`spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `.github/`: untouched. Passkey prompts on routine steps: a separate change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Adding a card is one step: it takes the project's default data lane with no Classify step; the project bar sets that default; a card's drawer says what its lane means and can raise it; a card in work no longer reads "Needs you: Return for revision" when nothing is asked; web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification.
