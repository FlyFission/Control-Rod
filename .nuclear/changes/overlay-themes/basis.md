# Basis: interchangeable visual overlay themes

- Date: 2026-10-25 (America/New_York).
- Initial delivery: specification and plan, 2026-10-25. Execution subsequently authorized below.
- User authorization: “Build out the full specification and plan.”
- Scope anchor: fifteen interchangeable beautiful worlds; begin with the creature-workplace and small-helper worlds, then the heist world; keep strong genre character. Amended 2026-10-30 by the owner for open-source release: no third-party franchise is named anywhere in the repository or launch material, including as an "inspired by" reference.
- Observed implementation baseline: `buildout/controlled-preparation-20261023` at `465b084a04c6a99bb80c29aa890146eea5a55bd1`.
- Observed main: `40763d4153eabd542d0c7ef028b8aab5de8d6522`; the executable Floor is not on main. Refresh source pins before implementation.
- Planning branch: `docs/interchangeable-overlay-themes-20261025`, based on the executable buildout. This does not authorize merging that buildout or adopting its unrelated changes.

## Read first

Repository instructions: `AGENTS.md`, `CONTRIBUTING.md`, existing platform-buildout basis/plan/risk, and `docs/threat-model.md`. Observed seams: `apps/web/src/pages/Floor.tsx`, `lib/floor.ts`, `lib/live.ts`, `lib/office.ts`, `components/StateMark.tsx`, `api/client.ts`, `api/types.ts`, `styles.css`, `test/render.tsx`; `spec/work.tsp`, `spec/api.tsp`; `services/api/src/work.ts` activeRuns/listPackages/office. The full Platform Plan referenced in docs is unavailable; no unseen requirements are inferred.

## Authority and design decisions

This packet records a proposed buildable design, not retrospective approval of its defaults. The user's request authorizes preparing the spec and plan together. No production code, new contract, kernel function, policy, CI workflow, deployment, external message, or legal permission is created. Unrelated authorization written in older change records is not inherited.

Planner defaults: Floor-only scenery; original public identities with explicit influence lineage; six reusable character variants per pack; shared semantic stations; no recurring named cast initially; native SVG assets and CSS motion; local viewer settings; static previews; phased release. These choices can change during document review.

## Documents

- [Design](../../../docs/superpowers/specs/2026-10-25-overlay-themes-design.md)
- [Fifteen-pack art specification](../../../docs/superpowers/specs/2026-10-25-overlay-themes-catalog.md)
- [Implementation plan](../../../docs/superpowers/plans/2026-10-25-overlay-themes.md)
- [Risk](risk.md), [plan pointer](plan.md), [trace](trace.md), [verification](verification.md), [ship posture](ship.md).

## Protected outcomes

Theme changes never change the work, its evidence or authority. Every visible status is source-backed and remains understandable without animation/color. Unavailable or incomplete data never looks like successful work. Pack failures preserve access to the plain Floor/list. Attribution and assets have separate release decisions; no blanket ban on influence and no blanket permission from attribution.

## Exit criterion

A source-grounded, internally consistent, reviewed specification and task plan, with fifteen concrete art briefs, source limitations and future acceptance tests stated honestly.

## Execution authorization, 2026-10-26

The user approved the documents and instructed: **“I love it. Go ahead and execute this out to completion.”** This supersedes the initial documentation-only boundary for this frontend/asset implementation. It does not claim human approval of artwork not yet created, a third-party license, protected-surface changes, or authorization to merge/publish/deploy.

Implementation is isolated on `feat/overlay-themes`, forked from `41d2d0b` (the observed executable buildout plus the planning packet and workspace ignores). The execution ledger, final checks and remaining release decisions are recorded in [execution](execution.md), [verification](verification.md) and [ship](ship.md). The earlier proposed defaults became the implementation basis when the user approved the complete plan. New rulings and the final review fix pass are disclosed in the execution record.
