# Risk: per-card Context Light / Nuclear toggle

- **Mode:** Standard
- Execution owner: Claude Code workers under the coordinating session, on the owner's instruction in the project thread.
- Decision owner: Ben Huffer, project owner and sole maintainer.
- Trust surface touched: **`spec/`**. `spec/records.tsp` and `spec/tenancy.tsp` add two optional fields (`WorkPackage.context_profile`, `Project.default_context_profile`) and `spec/generated/` is regenerated from them. This is an additive minor change, not a major version, but `spec/` is listed as a trust surface in AGENTS.md rule 2, so this record treats it as one: it needs Ben Huffer's recorded yes under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off) before merge. That yes is **pending**; the Signature row in [ship](ship.md) is unfilled. No `kernel/`, `policies/`, `tests/redteam/` or `.github/` file is touched (`evidence/trust-surface-diff.txt`).
- Scope covers three pieces and their integration, listed below.
  - Toggle (269636b): `spec/records.tsp`, `spec/tenancy.tsp`, `spec/generated/`, `daemon/internal/wire/schemas/WorkPackage.json`, migration `services/api/src/db/migrations/024-context-profile.ts`, `services/api/src/{admin,tenancy}.ts`, `apps/web/src/lib/context-profile.ts`, `apps/web/src/features/board/` (ContextSwitch, Nuclear badge), `apps/web/src/features/admin/AdminSections.tsx`, tests.
  - Composer (6c44c27): `services/api/src/context-profile.ts`, `nuclearContext` and `buildJob` in `services/api/src/work.ts`, the fixture pack `services/api/test/fixtures/nuclear-grade/`, tests.
  - Pack (26f92ab): `packs/nuclear-grade/` (generated), `scripts/generate-nuclear-pack.mjs`, `scripts/lib/token-count.mjs`, the `scripts/` workspace package, license evidence and register rows ([provenance](provenance.md)).
  - Integration (this record's last commits): `services/api/src/brief.ts` (BRIEF.md assembly moved out of `work.ts`, unchanged text), `scripts/measure-briefs.mjs`, `packs/nuclear-grade/budgets.json`, the generator keeping `budgets.json`, a real-pack api test, and the web mirror aligned with the server rule.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A Light brief changes and every existing agent sees different instructions. | Light adds no sections or inputs; a test compares the Light brief with the pre-profile text byte for byte; Light budgets record today's Light briefs. | Any Light brief difference. |
| R-02 | Safety or Material grade work runs without Nuclear context. | Both grades lock Nuclear over card and project settings on the server; the web mirror shows the same lock and reason. A missing or broken pack puts a stop-and-report notice in the brief and on the run event. | A Safety grade brief with neither Core card nor notice. |
| R-03 | The toggle shows a profile the server does not use. | The web helper mirrors `resolveContextProfile` rule for rule and reason for reason, and matches the project by id as the server does (tests on both sides). | A card showing a profile its run did not get. |
| R-04 | The real pack's manifest differs from what the composer reads. | A test loads `packs/nuclear-grade` and composes a Nuclear brief through the claim path. | Pack load failure or a missing card. |
| R-05 | Nuclear briefs grow without anyone noticing. | `budgets.json` records each fixture brief's measured tokens as its ceiling; a test recomposes and fails over budget; `--check` also flags changed inputs. | A brief over budget. |
| R-06 | Agent prose steers which cards are given. | Clusters read only package fields, the role's tools file and the hint (`CLUSTER_RULES`). | A rule reading free text. |
| R-07 | A manifest path reads outside the pack. | Paths are resolved inside the pack and refused otherwise (test). | A path outside the pack read. |
| R-08 | A contract change (`spec/`) merges without the owner's signature. | Signature row left unfilled; merge waits on Ben Huffer's recorded yes. | A merge without that yes. |

## Selected mode

- **Mode:** Standard
- Basis: a contract field (trust surface), a migration, server brief content for Safety grade work, and UI; reversible by revert, with migration 024 adding nullable columns only.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md), [provenance](provenance.md).

## Exit criteria

CT-01 to CT-08 are implemented and tested; Light briefs are byte for byte unchanged; the composer loads the real pack; every measured brief is within its budget; the owner's recorded yes for the `spec/` change is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
