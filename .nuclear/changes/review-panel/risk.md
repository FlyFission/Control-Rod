# Risk: review panel design spec

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-06 instruction to produce a review panel spec.
- Decision owner: Ben Huffer. No protected surface is touched by this record: no kernel decision function, policy, red-team fixture, workflow or spec major version. No product code changes. The later build does add reviewer profiles (an agent-authority surface), a migration and additive `spec/` models, each gated by its own record.
- Scope: `docs/superpowers/specs/2026-11-06-review-panel-design.md` and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A reviewer gets write access or runs with a permission bypass flag, and alters the code under review or the host. | Anti-goal in spec section 4; read-only snapshot copy, private home, no secrets, OS sandbox (ADR 0021); no `--dangerously-skip-permissions`, `--yolo` or `bypassPermissions`; write canary re-checks the snapshot digest and voids a seat that changed it. | Any profile or run that uses a bypass flag, or a seat that can write the snapshot. |
| R-02 | Content reaches a provider before the data lane is classified and admits that provider. | Lane must be classified and must admit each seat's runtime and provider before any seat starts; a refused seat records the reason; tested with a seat the lane does not admit. | Any seat started before lane classification, or for a provider the lane does not admit. |
| R-03 | Agreement is read as proof or approval, or the report is read as a pass or a person verification. | Agreement raises priority, not confidence; same-vendor seats count once; empty seats never count; quorum line states when no cross-vendor check happened; the report never says "passed" and carries "Model review is not proof."; the card says the panel does not replace person verification on Safety or Material work. | Any screen, report or doc that shows a panel as passed, approved or verified. |
| R-04 | An unqualified CLI is enabled as a seat. | A runtime gets a seat only after its pinned CLI version passes the ADR 0021 suite; Grok, Antigravity and Gemini are off until qualified (R7); a test fails if a runtime lacks a profile row. | A seat enabled for a runtime with no recorded qualification of the pinned version. |
| R-05 | A reviewer profile change widens what an agent may do without the owner gate. | Profiles are an agent-authority surface; they change only through the same owner gate as other agent-authority changes (spec sections 6.2 and 7); each profile records flags and the last CLI version verified. | A profile change merged without the owner gate. |
| R-06 | A finding cites code that does not exist and is treated as real. | Mandatory Stage 1 gate: path exists, lines in range, quote appears at those lines; failures go to a collapsed "Unverifiable claims" list and never count; Stage 2 refutation is a later slice. | A finding shown or counted that failed Stage 1, or a fabricated finding that passes it. |
| R-07 | Scope creep into parked items (unattended panels, debate rounds, a severity-rewriting judge model, Gemini consumer sign-in). | Non-goals in spec section 4; one stand-alone pull request per slice; a slice that needs an open decision in spec section 10 stops and asks the owner. | A slice pull request that touches a non-goal or a protected surface. |
| R-08 | No model review of this spec has run yet, so design flaws are undiscovered. | E-03 is open and stated plainly in verification and ship; the owner decides whether to request it before approval. | The owner approves on the claim that the spec was independently reviewed. |

## Selected mode

- **Mode:** Standard
- Basis: the feature changes what agents may do (reviewer profiles are an agent-authority surface) and adds a database migration, though this record changes neither.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its research evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the review panel is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
