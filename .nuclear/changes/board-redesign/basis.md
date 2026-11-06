# Basis: board redesign design spec

**Change slug:** `board-redesign`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-06
**Decision this basis supports:** whether the design spec `docs/superpowers/specs/2026-11-06-board-redesign-design.md` is accepted as the target for a sliced rebuild of the web app around the board. This change is the spec only; no product code.

## Mission / need

The first pilot (2026-11-05) showed that Control Rod's trust machinery works but its web app does not invite use: the board was read-only and buried under Office, the screens were function first, and how the pieces fit together was unclear. The goal ([GOAL](evidence/GOAL.md)) is to make the board the home of the product, where a small team or one engineer adds work, watches agents draft code and engineering documents, and reviews, verifies and signs the results.

## Scope (GOAL)

In scope: the design spec, the research behind it, adversarial reviews of the proposal, and interactive mockups in three looks. Out of scope: any change to the web app, kernel, daemon, sandbox, attestation, records, policies, workflows or `spec/`. The MVP is eight stand-alone slices (M1 to M8) that a second developer can pick up.

## Owner decisions (fixed inputs)

| # | Decision |
|---|---|
| O1 | Users are the owner and his engineers: small teams or one engineer. Agents draft, people review. |
| O2 | Outputs are a real mix of code and documents. |
| O3 | Review strictness is per card: light by default, an independent check where the card needs it. |
| O4 | Rebuild the web app around the board; the kernel, daemon, sandbox, attestation and records stay as they are. |
| O5 | Keep the lenses: color by, filters, group by, density, look switch. |
| O6 | Independent-check work with no eligible second person is blocked, and the card says so plainly. |
| O7 | Kind color stays as a gentle third signal beside the kind icon and word. |
| O8 | Strictness is fixed once work starts. |

O3 and O8 map onto the existing package `grade` (Safety and Material mean independent check; General service is light review), fixed at release, with no schema change.

## Reviews

Three adversarial reviews of the proposed decisions and mockups were run by independent model reviewers (Codex, Grok, Antigravity) from one shared brief ([BRIEF](evidence/review/BRIEF.md)). Their findings were filtered into a synthesis ([SYNTHESIS](evidence/review/SYNTHESIS.md)); accepted findings changed the spec (for example: no dollar cap, no steering, no claim that the kernel enforces person verification, status derived and never dragged), and the rest were parked as owner decisions in spec section 11.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The existing API (`/packages/:id/actions`, captures, decisions, person verifications, run events and stop) supports every MVP slice without a contract change. | Spec section 7. | A slice finds it needs a kernel, policy, red-team, workflow or `spec/` major change; it stops and raises an owner decision. |
| Grade is an adequate carrier of "independent check". | Workbench design on person verification. | The owner wants a separate requester or strictness field. |
| Small teams want a board as the front door. | Research files 01 to 03 and the pilot; reviewers noted this is partly a hypothesis. | Owner validation after M7 shows stalls or distrust. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the board redesign is designed, not implemented, and no screen claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
