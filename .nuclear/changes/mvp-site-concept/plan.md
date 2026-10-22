# Plan: MVP with the site concept job

**Purpose:** Keep the MVP bounded and its proof easy to repeat.

**Change slug:** `mvp-site-concept`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `mvp-site-concept`
- **Related records:** `risk.md`, `basis.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Branch:** `mvp/site-concept`, with `mvp/daemon`, `mvp/web` and `mvp/site-pack` merged in

## Charter and anchor check

| Check | Result |
|---|---|
| Objective still matches `risk.md#mission-anchor` | yes |
| Any work outside the non-goals? | no; no policies, transparency log, sandbox driver, multi-user or mobile work |
| Scope change during the work | the first job changed from a General example to the BaseMark site concept, set by the owner; the slug changed from `mvp-general` to `mvp-site-concept` |

## Build sequence

1. Write MVP contracts in `spec/work.tsp` and `spec/api.tsp` and regenerate schemas.
2. Add kernel lifecycle transitions with the floors and their reason codes; build the WebAssembly binding.
3. Build the run daemon (claim, workspace, runtimes, trace upload).
4. Build the web app (sign in, capture, office, package, board, floor, records).
5. Build the control plane (captures, packages, runs, passkey decisions bound to a digest, hash-chained events, SSE).
6. Add one-command start and scripted agents for end-to-end runs.
7. Build the site pack (`cr-site` tools, 50 MW data center typical, role briefs, templates).
8. Wire the site job (named site roles, role lookup order, scripted site agents that call `cr-site`).
9. Run every suite, then a live browser run with a virtual passkey.
10. Write this packet and validate.

## Two-speed work plan

| Track | Work | Status |
|---|---|---|
| Fast | Web layout, templates, role wording | pass, with UI gaps listed in `ship.md` |
| Careful | Kernel floors, passkey decisions, event chain, independence of the pre-check | pass |

## HPI task preview

| Task | Trap | Countermeasure |
|---|---|---|
| Decision route | Trusting the client's claim of what it signed | Server builds the challenge from the stored subject digest and checks kind, revision and user on verify |
| Pre-check claim | Passing the author's log by habit | Claim payload for a pre-check carries output only; tested |
| Merging parallel branches | Files a builder had locally but never committed | Run suites from the merged tree; found the ignored county registry |
| Event log | An admin query rewriting history | Database trigger refuses update and delete |

## Agent briefing

AI agents work on the `mvp/*` branches only, may build and run local tests and a local browser, and commit locally. They may not push, merge to `main`, or edit trust surfaces without the owner's signature. Kernel decision functions and the license gate were edited and are held for that signature.

## Affected files and assets

| Area | Paths |
|---|---|
| Contracts | `spec/work.tsp`, `spec/api.tsp`, `spec/generated/` |
| Kernel | `kernel/src/transition.rs`, `kernel/src/decision.rs`, `kernel/bindings/wasm`, `services/api/kernel`, `scripts/build-kernel-wasm.sh` |
| Control plane | `services/api/src/`, `services/api/test/` |
| Daemon | `daemon/internal/runner`, `daemon/cmd/controlrod` |
| Web | `apps/web` |
| Packs | `packs/general/roles`, `packs/capital-projects/site-concept` |
| Start and test tools | `scripts/cr.mjs`, `tests/e2e/fake`, `tools/license-gate.mjs` |
| Records | `.nuclear/changes/mvp-site-concept/` |

## Non-goals

- No Cedar policies, transparency log or witnesses.
- No sandbox driver; roles get a tool allowlist only.
- No multi-user, mobile or desktop work.
- No Kandev decision in this change.
- No CI jobs for the site pack or the end-to-end run; adding them edits `.github/workflows` and needs a signature.

## Dependency / model / tool decisions

| Decision | Choice | Record |
|---|---|---|
| Run daemon language | Go | ADR 0012 |
| Identity | Passkeys, one owner | ADR 0013 |
| Modes and typicals | General mode; site concept typical | ADR 0015, ADR 0016 |
| Drawing engine | CADCraft pinned by commit | ADR 0018 |
| Passkey library | `@simplewebauthn/server` 14.0.3 | this packet |

## Review checkpoints

| Checkpoint | Required before moving on | Status |
|---|---|---|
| Kernel tests | all pass | pass |
| Control plane tests | all pass against a real Postgres | pass |
| Daemon tests | all pass | pass |
| Web tests | all pass | pass |
| Site pack tests | all pass on a fresh checkout | fail; county registry not committed |
| Live browser run | five packages released and accepted | pass |
| Packet validates | `ng validate --strict-custody` passes | pass |
| Owner signature | kernel decision functions and license gate | planned |
| First real run | Claude Code on the owner's Mac | planned |

## Rollback approach

Do not merge, or revert the merge commit on `main`. Local state lives in `~/.controlrod` and can be deleted.

## Proof commands

```bash
cargo test -p controlrod-kernel
TEST_DATABASE_URL=postgres://USER@127.0.0.1:5432/postgres pnpm --filter @control-rod/api test
(cd daemon && go test ./...)
pnpm --filter @control-rod/web test
(cd packs/capital-projects/site-concept && uv run pytest -q)
python3 -I /root/refs/nuclear-grade-context-engineering/tools/ng.py validate --strict-custody .nuclear/changes/mvp-site-concept
```

## Required links

- `risk.md`, `basis.md`, `trace.md`, `verification.md`, `ship.md`

## Exit criteria

- A reviewer can repeat every result from the proof commands.
- Every claim has a status label.
- Planned checks are visible and block merge where stated.

## Source-lineage note

Plan structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
