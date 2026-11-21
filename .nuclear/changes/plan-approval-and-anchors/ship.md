# Ship: anchored notes and plan approval

Release decision: **trust-surface additions approved by the owner's recorded yes (see Signature); contract, check, spike record and design for owner review.**

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

## Signature

Recorded under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

| Field | Entry |
|---|---|
| Decision | Approve: the `spec/` additions in pull request #88 as they stood at `fe9b099` |
| Trust-surface files | `spec/anchors.tsp`, `spec/main.tsp` (one import line) and the schemas generated from them under `spec/generated/json-schema/` |
| Question | "Do you approve PR #88's changes to `spec/` and `kernel/` as they stand at `fe9b099`?" Asked in the Claude Code chat for this pull request, shortly after 2026-11-19 20:51 UTC (3:51 PM EST), with a link to #88. The message named both trust surfaces: `spec/anchors.tsp` (additive models) and `kernel/bindings/wasm/tests/lifecycle_traces.rs` (a test that changes no decision function) |
| Answer | "yes", Ben Huffer, project owner and sole maintainer, in the same chat thread. The agent read it at 2026-11-20 15:37 UTC (10:37 AM EST); the chat does not show the agent the time it was sent |
| Head when asked | `fe9b099` (CI green on all seven jobs); the same head when the answer was read, with no trust-surface file changed in between. The only files changed after the yes are this `ship.md` and its sibling record's `ship.md`, neither a trust surface |
| Recorded by | The implementing agent, from the chat message. Ben Huffer did not write this entry, and no signature or initials were typed for him |

Rollback: revert the commit. Additive contracts and a pure module; no schema migration, route or wire change.

Monitoring after merge: any slice that uses anchors or builds plan approval opens its own record and names its gate.

## Settled on 2026-11-21

The owner delegated the close-out (D4 in [basis](basis.md)). Each point below is the agent's own choice under that delegation, open to the owner, unless it says otherwise.

1. The anchor contract is signed (see Signature).
2. Plan approval design: option A versus B, which packages need a plan, and whether "work follows an approved plan" becomes a kernel floor are left open. The design ships as a design, merging it builds nothing, and the kernel floor needs its own signature.
3. D2 and D3 stand.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The anchor contract regenerates with no drift, the anchor check passes its tests and fails each planted fault, the print-mode hook spike is recorded, the plan approval design is written, and the owner has reviewed all three.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
