# Plan: Phase 0 scaffold

**Purpose:** Keep the scaffold bounded and its proof easy to repeat.

**Change slug:** `phase-0-scaffold`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `phase-0-scaffold`
- **Related records:** `risk.md`, `basis.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Branch:** `phase-0/scaffold`

## Charter and anchor check

| Check | Result |
|---|---|
| Objective still matches `risk.md#mission-anchor` | yes |
| Any work outside the non-goals? | no; no features, persistence, auth or execution were added |
| Scope change during the work | one addition: closing record schemas after a test showed unknown fields were accepted |

## Build sequence

1. Pin toolchains in `mise.toml` and set workspace roots for pnpm, Cargo, Go and uv.
2. Write TypeSpec records and API v0; compile to JSON Schema and OpenAPI.
3. Build the Fastify skeleton with Ajv2020 validation and tests against the worked example.
4. Build the Rust kernel crate: fail-closed `Decision`, RFC 8785 digest, shared vector.
5. Port the digest to Go and Python against the same vector.
6. Write license gates for Node, Rust and Go; write the red-team catalog and its checker.
7. Write CI covering all of the above, actions pinned by commit hash.
8. Write ADRs, threat model and SQA drafts.
9. Add RT-015 tests for unknown fields, see them fail, close every record model, see them pass.
10. Fill and validate this packet; open the pull request.

## Two-speed work plan

| Track | Work | Status |
|---|---|---|
| Fast | Skeletons, CI, docs | pass |
| Careful | Digest agreement, contract strictness, license gates | pass locally; GitHub CI planned |

## HPI task preview

| Task | Trap | Countermeasure |
|---|---|---|
| Shared digest vector | Hand-typing an expected hash | Vector computed by running code; same value asserted in three languages |
| Schema strictness | Assuming Ajv strict mode rejects unknown fields | Negative test written first; it failed, proving the assumption wrong |
| License gate | Our own module reported as unlicensed | `--ignore github.com/flyfission/control-rod` scoped to our module only |

## Agent briefing

The AI agent works on branch `phase-0/scaffold` only, may run local builds and tests, and may push the branch and open a pull request. It may not merge, change branch protection or edit `main`.

## Affected files and assets

| Area | Paths |
|---|---|
| Contracts | `spec/` |
| Control plane | `services/api/` |
| Kernel | `kernel/`, `Cargo.toml`, `Cargo.lock`, `deny.toml` |
| Daemon | `daemon/` |
| SDK | `sdk/python/` |
| CI and gates | `.github/`, `tools/`, `mise.toml` |
| Records | `docs/`, `tests/redteam/`, `.nuclear/changes/phase-0-scaffold/` |

## Non-goals

- Do not add product features, persistence, authentication, sandboxing or agent execution.
- Do not add decision logic to the kernel beyond refusing.
- Do not add the web, desktop or mobile apps.

## Dependency / model / tool decisions

| Decision | Choice | Record |
|---|---|---|
| Languages by layer | Rust kernel, Go daemon, TypeScript control plane, Python calcs | ADR 0003 |
| Backend framework | Plain Fastify | ADR 0004 |
| Contracts | TypeSpec to JSON Schema and OpenAPI | ADR 0005 |
| Licenses | Permissive allowlist | ADR 0002, `CONTRIBUTING.md` |

## Review checkpoints

| Checkpoint | Required before moving on | Status |
|---|---|---|
| Contracts compile | `tsp compile .` succeeds | pass |
| API tests | 7 passed | pass |
| Kernel tests and clippy | 6 passed; clippy clean with warnings as errors | pass |
| Go and Python digests | Go tests pass; 4 Python tests pass; ruff clean | pass |
| License gates | Node, Rust and Go gates pass | pass |
| Red-team catalog | Checker passes | pass |
| Packet validates | `ng validate` passes | pass |
| GitHub CI | All jobs green on the pull request | planned |
| Owner review | Ben approves the pull request | planned |

## Rollback approach

Revert the merge commit on `main`. No data, services or external state exist.

## Proof commands

```bash
mise install
pnpm install --frozen-lockfile
pnpm --filter @control-rod/spec build && git diff --exit-code spec/generated
pnpm -r typecheck && pnpm --filter @control-rod/api test
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --locked
(cd daemon && gofmt -l . && go vet ./... && go test ./...)
(cd sdk/python && uv sync --locked && uv run ruff check . && uv run pytest -q)
node tools/license-gate.mjs
cargo deny check licenses bans sources
(cd daemon && go-licenses check ./... --ignore github.com/flyfission/control-rod --allowed_licenses=MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC,MPL-2.0)
python3 -I tools/check_redteam.py
```

## Required links

- `risk.md`, `basis.md`, `trace.md`, `verification.md`, `ship.md`
- `.github/workflows/ci.yml`

## Exit criteria

- A reviewer can repeat every result from the proof commands.
- Every claim has a status label.
- Planned checks are visible and block merge until they pass.

## Source-lineage note

Plan structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
