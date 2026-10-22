# PR review follow-up, 2026-10-22

Standard-plus: regression evidence, dependency trust and inherited drawing output behavior.

## Goal and scope

Preserve the reviewed drawing fixes from PR #2 and independently cover owner-request
provenance, package namespace collisions and incomplete road layers. Concurrent
upstream fixes through `26e3da1` supply the runtime behavior; retain those implementations.
No protected kernel, policy, red-team, CI or major contract surface is changed.

The push exposed actual Dependabot alerts. A current installed-tree `pnpm audit`
reported 25 advisories (7 high, 13 moderate, 5 low) across `undici` and `@fastify/static`.
The vulnerable undici 7.24.4 is pinned by the dev-only TypeSpec dependency
`@scalar/json-magic@0.13.5`; 7.30.1 is already present through another TypeSpec path.
The production static plugin is 8.3.0. This follow-up updates static to the security
release 10.1.2 and narrowly overrides the pinned vulnerable undici to 7.30.1.

## Basis and proof plan

- Upstream compatibility table supports Fastify 5 for static 8 and later.
  https://github.com/fastify/fastify-static#compatibility
- Static 10.1.2 is the upstream security release.
  https://github.com/fastify/fastify-static/releases/tag/v10.1.2
- Actual advisory records and before/after audits are preserved in the external review
  evidence directory. Audit absence is a point-in-time database result, not a security guarantee.
- Run fresh workspace tests against real PostgreSQL, typechecks, builds, contract drift
  checks, six drawing-record tests, full site tests, license gate and packet validation.
- Check the independent regressions against the latest upstream behavior. Preserve
  existing author/checker separation and dependency identities.

## Authority and limits

The owner instructed "Double check to ensure youre confident then continue" after
reviewing concrete patches. Publication is authorized, superseding the local-only
agent brief for this follow-up. New agent commits carry the agent's own sign-off;
no earlier contributor's certification or protected-surface approval is fabricated.

Kernel and license-gate owner signatures and historical DCO certifications remain
pending. Daemon raw-response validation and boundary generation still diverge from
ADRs 0005 and 0003. Omitting unused receipt fields is not a demonstrated functional bug.

No fresh CADCraft render, AutoCAD round trip, macOS startup or real Claude/Codex job
is established. Remote CI must pass on the published heads before any merge decision.

## Rollback

Revert this follow-up commit and the drawing-fix merge commit. No database schema or
stored data is changed by these follow-ups.

## Required links

- `basis.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- `../drawing-engine-cadcraft/review-followup.md`

## Exit criteria

Regression suites, build, typecheck, audits, license gate and packet validation pass;
publication is verified on the intended remote refs. Owner merge gates stay explicit.

## Source-lineage note

This record follows the existing workflow: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. It makes no compliance or qualification claim.

## Completed dependency proof

Before the final stack refresh, local checks pass: 44 API tests, 28 web tests,
70 site tests with one CAD-dependent skip, 19 kernel tests and six drawing-record
tests. Workspace typechecking and builds pass, contract regeneration shows no
tracked drift, and the Node license gate passes for 211 packages. The refreshed
registry audit reports zero advisories.

Retained evidence: `E:\invention-pipeline\outputs\control-rod-pr-review-2026-10-22\continued`
(Linux `/mnt/e/invention-pipeline/outputs/control-rod-pr-review-2026-10-22/continued`).
The original before-audit is `pnpm-audit-current.json` in the parent directory;
`pnpm-audit-after.json` records the post-update report. Two independent reviewers
found no new standards or correctness finding in the dependency changes; the
independent API rerun passed 44 tests and its audit also reported zero advisories.
