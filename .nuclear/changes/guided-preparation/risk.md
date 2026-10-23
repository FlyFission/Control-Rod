# Risk: guided work-package preparation

- Owner: Ben Huffer (proposed decision owner; no approval recorded)
- Date: 2026-10-22
- Mode: Standard-plus. The proposed feature changes requirements, release subjects, prompts, and agent powers.
- Lifecycle: planning. This packet authorizes no implementation or release.
- Mission anchor: turn rough requests into reviewable work packages whose requirements, technical plan and verification basis survive handoffs and revisions.
- Non-goals: replace the MVP, introduce another approval authority, implement a general workflow designer, certify engineering work, or merge the open PR stack.

## Risk and response

| Risk | Required response | Stop condition |
|---|---|---|
| Plan built against an unmerged MVP | Pin both main and PR #3; rebase the plan before execution | Required MVP seams differ from the inspected snapshot |
| Agent invents or weakens requirements | Keep proposals distinct from human confirmations; escalate infeasibility | Unconfirmed decisive requirement is treated as settled |
| Preparation becomes an approval bypass | Kernel decides; signed release binds complete preparation subject | Agent can confirm, release, or alter protected criteria |
| Concurrent editing or completion admits stale work | Immutable snapshots, compare-and-swap, transactionally checked subjects | Edit, release and completion race has no refusal test |
| Preparation roles share context with verification | Record authoring lineage and filter checker inputs | Checker receives private preparation/author transcripts |
| Repository discovery expands agent power | Manual-first delivery; automated repository access requires enforced read-only confinement | Only a prompt or CLI allowlist prevents writes |
| Existing records are silently reinterpreted | Add companion records; explicit enrollment; preserve signed bytes | Migration changes a historical subject or signature |
| Criteria look covered but are semantically wrong | Structural coverage is a readiness check, never proof | UI represents mapped tests as passing verification |

## Authority

Documentation may be prepared locally under the user's request. No protected surface is changed by this packet. Future edits to kernel decisions, policies, CI, or a major contract version require the human signature mandated by AGENTS.md rule 2. The product spec remains proposed until reviewed. No contributor certification or signature is supplied for the owner.

## Selected mode

- **Mode:** Standard
- Standard-plus routing: the future implementation affects agent powers, acceptance and release. The current deliverable is reversible planning documentation.

## Required links

- [Basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship posture](ship.md).

## Exit criteria

Risks, authority boundaries and the proposed execution baseline are explicit. Product behavior remains planned.

## Source-lineage note

Original planning record using the repository's nuclear-grade workflow. No compliance claim.

Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
