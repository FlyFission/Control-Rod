# Ship: anchored notes and plan approval

Release decision: **contract, check, spike record and design for owner review.**

- **Proposed:** merge the anchor contract and check, the spike evidence, the plan approval design and the doc updates.
- **Not claimed:**
  - that any route, table or view uses anchors yet;
  - that a planning run exists or is qualified under ADR 0021;
  - that the spike holds on other Claude Code versions, other platforms or Codex;
  - that the tests were reviewed by anyone but their author.
- **Owner decisions requested:**
  1. Approve the anchor contract (`spec/anchors.tsp`) as an additive change.
  2. In the plan approval design, choose option A first or option B now. Decide which packages require a plan, and whether "work follows an approved plan" is a kernel floor.
  3. Confirm D2 and D3: PL3 without routes for now, and PL4 as a design only.

Rollback: revert the commit. Additive contracts and a pure module; no schema migration, route or wire change.

Monitoring after merge: any slice that uses anchors or builds plan approval opens its own record and names its gate.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The anchor contract regenerates with no drift, the anchor check passes its tests and fails each planted fault, the print-mode hook spike is recorded, the plan approval design is written, and the owner has reviewed all three.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
