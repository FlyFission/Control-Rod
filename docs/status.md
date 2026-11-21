# Status

As of 2026-11-17. Control Rod is pre-alpha and runs owner-local: one machine, one person. Nothing here is a compliance claim or an engineering-acceptance claim.

This page is a map, not a ledger. The evidence for each item is in its change record under `.nuclear/changes/`, and the plan that orders the work is the owner-held Control Rod Platform Plan (see [docs/README.md](README.md)).

## What works on `main`

| Area | What exists | Where to read more |
| --- | --- | --- |
| Kernel | Rust decision functions for every state change; WASM binding used by the API | `kernel/`, [ADR 0003](adr/0003-languages-by-layer.md) |
| Contracts | TypeSpec in `spec/`; OpenAPI, JSON Schema and types generate from it | [ADR 0005](adr/0005-contracts-typespec.md) |
| API and database | Fastify API, Postgres with checksum-locked migrations (`services/api/src/db/migrations/`), passkey sign-in, tenancy, an append-only event chain with seals and inclusion proofs; an audit export for a time window (`GET /records/export`); `pnpm cr verify` checks a downloaded proof or export offline ([auditing.md](auditing.md)) | `services/api/`, [ADR 0004](adr/0004-backend-fastify.md), [ADR 0006](adr/0006-postgres-everywhere.md) |
| Run daemon | Claims jobs under a lease, launches Claude Code or Codex, uploads evidence, ends finished runs | `daemon/`, [daemon.md](daemon.md) |
| Sandboxes | One recorded sandbox policy per run; native CLI sandbox launch with a preflight and no unsandboxed fallback | [ADR 0021](adr/0021-native-cli-sandboxes.md) |
| Web app | The board as home (slice M1) with quick add and capture cards (slice M4), card actions with a Move to menu (slice M3), and a read-only agent panel in the review drawer and office card (click-to-talk slice S1), Software and Capital Projects mode toggle, `New work` modal with local workspace repo materialization (`GET /repos`, `POST /repos/materialize`; Cycle 1: `claude` and `codex` runnable), inbox, packages, criteria editing, the office view with fifteen themes, roster, records, spend, policies and administration | `apps/web/`, [office-view/](office-view/), [overlay-themes/](overlay-themes/) |
| Guided preparation | Rough request to confirmed requirements to pinned release to criterion-based acceptance | [guided-preparation.md](guided-preparation.md) |
| Quality gates | In CI: typecheck and tests for TypeScript, Rust, Go and Python, contract-drift check, licence gate, SBOM, change-record validation. In `tools/`, run by hand: originality, public-claims and offline-asset checks | `.github/workflows/ci.yml`, `tools/` |

## What is stubbed or planned

- `policies/` (Cedar floors and QA overlays), `connectors/`, `runtimes/` and `deploy/` are placeholders.
- `packs/software/` is a placeholder.
- Board redesign slices M2 and M5 to M8 (lenses, the card view, code and document review, the visual pass) are designed in `docs/superpowers/plans/2026-11-06-board-redesign.md` and not yet built. The program gap analysis (`docs/superpowers/specs/2026-11-08-program-gap-analysis.md`) ranks what comes after them.
- In `New work`, the 8 CLI ecosystems beyond `claude` and `codex` remain disabled ("Not yet runnable"), and binding runtime or materialized-workspace selections directly into daemon runs is deferred to Cycle 2 (Cycle 1 prepares the local checkout and records `[workspace:...]` / `[branch:...]` metadata in the capture text).
- Hosted deployment, organization-wide controls, and independent witnessed evidence.
- Sandbox confinement is qualified on WSL2, native Linux and macOS for author launches of Claude Code and Codex. Native Linux and macOS passed the launch qualification in CI (the `platforms` workflow) without a real login; the live-login check has run only on WSL2. Starting the whole app on macOS is unverified.
- The web app still requests public fonts and map tiles, so it is not air-gap ready.
- Phase 6 remaining work: the protected red-team suite (6.4), attestation probes (6.5) and the protected kernel changes (6.6 to 6.8). The red-team items and kernel changes need an owner signature.

## Known failures and rough edges

These are failures recorded in merged or open pull requests, not guesses.

- `command-boundary` SEC-01 and SEC-03 in the API suite fail against a test database that uses trust authentication. They fail the same way on `main`, so they are an environment issue; see [test-database.md](test-database.md).
- The browser test `phase3-exit.spec.ts:117` fails: the first Tab stop is "Office" instead of the skip link. It predates recent changes.
- Firefox and WebKit have not been run for the browser suite; Chromium has.
- Real Claude Code and Codex runs with a real login are verified only on the owner's WSL2 machine. On native Linux and macOS the same launch is qualified against a scripted provider in CI.

## Dependency holds

Some Dependabot bumps are deliberately not merged. They are tracked in the [collaboration guide](collaboration.md#dependabot).
