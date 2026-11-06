# Ship: board redesign design spec

Release decision: **design spec approved by the owner on 2026-11-06; no implementation authorized by this record.**

- **Proposed:** merge the spec and this packet as documentation only, so a second developer can start from it.
- **Not claimed:** any implemented behavior; any compliance, certification or safety claim; that the kernel enforces person verification (D-4 is unsigned); usability and trust with real users (E-04 is open); mockup accessibility beyond the axe scan in E-03.
- **Owner decision recorded 2026-11-06:** the owner approved the spec ("approved, write the implementation plan") and chose subagent-driven execution of the plan ("subagent-driven, go ahead"); evidence E-05 in [verification](verification.md). Implementation is authorized per slice by the owner's instruction, and each slice opens its own change record; this record itself authorizes none.
- **Owner decisions still requested:**
  1. Confirm the parked list in spec section 11 stays parked: live steering and in-run questions; per-card money cap; requester, grade-change and downgrade rules in the kernel; D-4 kernel guard; non-waivable check categories; solo path for independent checks; verifiable evidence export; in-file DOCX and PDF anchors; multi-repository cards; a paused run state; calendar view; tracker import.

Rollback: revert the commit. Documentation only; no code, schema or wire change.

Monitoring after merge: each slice pull request opens its own change record; watch for any slice that touches a protected surface or a parked item.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the board redesign is designed, not implemented, and no screen claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
