# Status

As of 2026-11-23. Control Rod is pre-alpha and runs owner-local: one machine, one person. Nothing here is a compliance claim or an engineering-acceptance claim.

This page is a map, not a ledger. The evidence for each item is in its change record under `.nuclear/changes/`, and the plan that orders the work is the owner-held Control Rod Platform Plan (see [docs/README.md](README.md)).

## What works on `main`

| Area | What exists | Where to read more |
| --- | --- | --- |
| Kernel | Rust decision functions for every state change; WASM binding used by the API | `kernel/`, [ADR 0003](adr/0003-languages-by-layer.md) |
| Contracts | TypeSpec in `spec/`; OpenAPI, JSON Schema and types generate from it | [ADR 0005](adr/0005-contracts-typespec.md) |
| API and database | Fastify API, Postgres with checksum-locked migrations (`services/api/src/db/migrations/`), passkey sign-in, tenancy, an append-only event chain with seals and inclusion proofs; an audit export for a time window (`GET /records/export`); `pnpm cr verify` checks a downloaded proof or export offline ([auditing.md](auditing.md)) | `services/api/`, [ADR 0004](adr/0004-backend-fastify.md), [ADR 0006](adr/0006-postgres-everywhere.md) |
| Run daemon | Claims jobs under a lease, launches Claude Code or Codex, uploads evidence, ends finished runs. Author outbound egress filtering (`CONTROLROD_EGRESS_FILTER`) is on by default for real runtimes (set `CONTROLROD_EGRESS_FILTER=0` to disable) | `daemon/`, [daemon.md](daemon.md) |
| Sandboxes | One recorded sandbox policy per run; native CLI sandbox launch with a preflight and no unsandboxed fallback | [ADR 0021](adr/0021-native-cli-sandboxes.md) |
| Web app | The board as home (slice M1) with lenses, swimlanes, saved views and default-view guard (slice M2), quick add and capture cards (slice M4), card actions with a Move to menu (slice M3), and a read-only agent panel in the review drawer and office card (click-to-talk slice S1), a per-card Workflow choice (Playbook, Superpowers, Pocock or Pocock Superpowers, separate from Light/Nuclear; [packs/workflows](../packs/workflows/README.md)), attention signals (a Needs-you count in the tab title, opt-in browser notifications for new Inbox items, `N` to the next card that needs you, and a `?` shortcut list), the board sorting cards that need you to the top of each column, a spinner only while a run is running, and a "Fallback: ran as X (requested Y)" line on runs, Software and Capital Projects mode toggle, `New work` modal with local workspace repo materialization (`GET /repos`, `POST /repos/materialize`; Cycle 1: `claude` and `codex` runnable), inbox, packages, criteria editing, the Plant view (one facility drawn in plan, with an annunciator, a reactor core lit by working agents and control rods that follow SCRAMs; the fifteen office themes archived under Advanced), roster, records, spend, policies and administration | `apps/web/`, [office-view/](office-view/), [overlay-themes/](overlay-themes/) |
| Guided preparation | Rough request to confirmed requirements to pinned release to criterion-based acceptance | [guided-preparation.md](guided-preparation.md) |
| Quality gates | In CI: typecheck and tests for TypeScript, Rust, Go and Python, contract-drift check, licence gate, SBOM, change-record validation. In `tools/`, run by hand: originality, public-claims and offline-asset checks | `.github/workflows/ci.yml`, `tools/` |

## What is stubbed or planned

- `policies/` (Cedar floors and QA overlays), `connectors/`, `runtimes/` and `deploy/` are placeholders.
- `packs/software/` is populated with shared software roles (`software-author`, `software-author.tools`, `software-pre-check`), `templates/`, `typicals/`, and depth-2 `bugfix`, `feature`, and `migration` intake playbooks (`roles/intake.md`). Capital-projects domain playbooks beyond the test fixture remain to be added.
- Board redesign slices M5 to M8 (the card view, code and document review, the visual pass) are designed in `docs/superpowers/plans/2026-11-06-board-redesign.md` and not yet built. The program gap analysis (`docs/superpowers/specs/2026-11-08-program-gap-analysis.md`) ranks what comes after them.
- In `New work`, the 8 CLI ecosystems beyond `claude` and `codex` remain disabled ("Not yet runnable"). Workspace and branch selections bind into daemon runs through typed checkout custody (linked worktrees only, #135); the selected author and checker runtime and model travel as typed claim fields; the reasoning selector is parsed but not yet bound into runs (#175).
- Hosted deployment, organization-wide controls, and independent witnessed evidence.
- Sandbox confinement is qualified on WSL2, native Linux and macOS for author launches of Claude Code and Codex. Native Linux and macOS passed the launch qualification in CI (the `platforms` workflow) without a real login; the live-login check has run only on WSL2. Starting the whole app on macOS is unverified.
- The web app still requests public fonts and map tiles, so it is not air-gap ready.
- Phase 6 remaining work: the protected red-team suite (6.4), attestation probes (6.5) and the protected kernel changes (6.6 to 6.8). The red-team items and kernel changes need an owner signature.

## Known failures and rough edges

These are failures recorded in merged or open pull requests, not guesses.

- `command-boundary` SEC-01 and SEC-03 in the API suite fail against a test database that uses trust authentication. They fail the same way on `main`, so they are an environment issue; see [test-database.md](test-database.md).
- Real Claude Code and Codex runs with a real login are verified only on the owner's WSL2 machine. On native Linux and macOS the same launch is qualified against a scripted provider in CI. Starting and running `pnpm cr start` end-to-end on macOS remains unverified live in CI.
- Pre-marketing hardening fixes (API session/output/repository/seals/run-claiming reliability, daemon egress default-on and shutdown drain, web app Look B/C light-theme contrast, `Compare`/`Snapshots`/`Today`/`Setup`/`SignIn` UX clarity, and offline GeoJSON vector-by-default preview) are staged in `.nuclear/changes/pre-marketing-hardening/`.

R1.1 author-session verification was limited by this workspace: API dispatch and the daemon suite could not bind loopback, the API suite could not start its test database, and the daemon integration could not inspect its child process. These checks need a host rerun; see the [R1.1 verification record](../.nuclear/changes/r1-1-worktree-daemon-runs/verification.md).

## Dependency holds

Some Dependabot bumps are deliberately not merged. They are tracked in the [collaboration guide](collaboration.md#dependabot).
