# Risk: board redesign design spec

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-06 instruction to produce a board redesign spec.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec major version. No product code changes.
- Scope: `docs/superpowers/specs/2026-11-06-board-redesign-design.md` and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A screen overclaims: says a run was steered, gated, capped, attested or verified when the record does not show it. | Anti-goal in spec section 3; every claim comes from a recorded API field; attestation shown per claim as observed, refuted or not established; no steering, no dollar cap; "cost not reported" when unreported; the sign panel says signing records acceptance and does not certify correctness. | Any slice text or mockup that promises a capability the kernel, daemon or API lacks. |
| R-02 | Protected change D-4 (kernel guard requiring person verification before acceptance) is not signed, so person verification is not kernel enforced. | The board shows the step and relies on what `/packages/:id/actions` allows; it never claims the kernel enforces D-4. Signing D-4 stays an owner decision (spec section 11). | A screen or doc that says the kernel enforces D-4 before it is signed. |
| R-03 | Scope creep into parked items (steering, money cap, solo independent check, evidence export, in-file anchors, multi-repo cards, calendar, tracker import). | Parked list in spec sections 3 and 11; each slice is one stand-alone pull request; a slice that needs a section 11 item stops and asks the owner. | A slice pull request that touches a parked item or a protected surface. |
| R-04 | Dependency trust for the spikes (diff viewer, pdf.js, DOCX to PDF conversion) and later adopted libraries. | Spikes are throwaway branches with a written result; permissive licenses only (AGENTS.md rule 4); vetting before adoption; no runtime asset from a third-party host. | A candidate with a non-permissive or unclear license, or an unvetted runtime fetch. |
| R-05 | The default view hides work waiting on a person verification or a signature. | Default-view guard: a filter that would hide such cards shows a count of what is hidden; tested in M2. | A default view that can hide them silently. |
| R-06 | The spec rests on an owner hypothesis that small teams value proof, and is tested only by reviewers coupled by one brief. | Reviews are labeled coupled; owner validation after M7 with real tasks before M8 polish. | Owner validation shows the board is not used or not trusted. |

## Selected mode

- **Mode:** Standard
- Basis: user-visible behavior and on-screen claims about signatures and evidence are designed here, though no code or protected surface changes in this record.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the board redesign is designed, not implemented, and no screen claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
