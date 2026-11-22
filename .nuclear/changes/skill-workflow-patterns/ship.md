# Ship: skill workflow pattern note

Release decision: **pattern note for owner review; no implementation authorized by this record.**

- **Proposed:** merge the note and this packet as documentation only.
- **Not claimed:** that either workflow runs in Control Rod; any brief size (not measured); a person's read for copied wording (a script ran, E-01); that the shipped name may use the authors' names.
- **Depends on open work:** #117 rewires the composer and roles this plan builds on; build step 5 waits for it. Package dependencies (build step 6) belong with issue #126.
- **Owner decisions requested:**
  1. Accept the note or return it with changes; confirm D5 (two packs plus a hybrid that references them).
  2. Give the signed yes for the contract step when it comes (a per-card workflow field beside `context_profile`).
  3. Pick the first build: the proposal is the Superpowers pack (step 2) and the interview stage (step 4) in parallel, since they need no new contract to prototype.

Rollback: revert the commit. Documentation only.

Monitoring after merge: each build step opens its own record; watch for one that skips its gate, and recheck the stage maps against the upstreams at each pin bump.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/skill-workflows.md` maps every Superpowers skill and every Matt Pocock engineering and productivity skill at the pins to a Control Rod stage or a stated skip, defines the hybrid stage by stage, names the conflicts with ADR 0020, ADR 0023 and G-04 and how each is ported, and gives a build plan whose gated steps name their gate. No code, contract or pack changes in this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
