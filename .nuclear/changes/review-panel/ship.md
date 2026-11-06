# Ship: review panel design spec

Release decision: **design spec for owner review; no implementation authorized by this record.**

- **Proposed:** merge the spec and this packet as documentation only, so a second developer can start from it.
- **Not claimed:** any implemented behavior; any compliance, certification or safety claim; that a panel report is proof, approval or person verification; that the spec has had an independent review (E-03 is open); that Grok, Antigravity or Gemini are qualified for seats.
- **Owner decisions requested:**
  1. Approve the spec, or return it with changes.
  2. Decide the three open items in spec section 10: default seats and quorum when none are named (proposal: two seats on two vendors, quorum two); whether review subjects from outside repositories may use the public lane or default to internal; whether Gemini is worth qualifying while Antigravity covers the same vendor.
  3. Say whether to run an independent model review of the spec before approval (E-03).

Rollback: revert the commit. Documentation only; no code, schema or wire change.

Monitoring after merge: each slice pull request opens its own change record; watch for any slice that touches a protected surface, adds a reviewer profile without the owner gate, or enables an unqualified seat.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its research evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the review panel is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
