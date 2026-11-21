# Risk: live stack cleanup and software domain pack

- **Mode:** Standard
- Execution owner: subagent on isolated worktree branch `feat/live-stack-and-software-pack`.
- Decision owner: Ben Huffer. No protected trust surface is touched (`policies/`, `tests/redteam/`, `.github/`, `kernel/`, `spec/`, `docs/adr/` are untouched).
- Scope: `apps/web/e2e/live/stack.ts`, `services/api/src/work.ts`, `services/api/test/software-pack.test.ts`, `packs/software/`, `docs/status.md`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A Wave 2 CLI binary on `PATH` causes the live test daemon to expose a real runtime instead of fake-only mode. | `AGENT_BINARIES` includes `ollama`, `grok`, `opencode`, and `agy` in addition to `claude`, `codex`, `gemini`, and `antigravity`. | Any Wave 2 adapter binary missing from `AGENT_BINARIES`. |
| R-02 | A `startDaemon()` failure in `startStack()` leaves an orphaned control plane, embedded Postgres, or `/tmp/cr-live-*` directory behind. | `startStack()` wraps `startApi()` and `startDaemon()` in `try { ... } catch (err) { await stack.stop(); throw err; }`. | Any startup throw after `startApi()` returning without calling `stack.stop()`. |
| R-03 | `packs/software/` role or playbook files fail resolution (`findRoleIn`, `preCheckRole`, `roleToolText`, `packFiles`, `jobIntakeGuides`), contain symlinks, or exceed `packFiles` size limits. | `services/api/test/software-pack.test.ts` exercises all five functions directly against `packs/software/` and asserts zero symlinks and compliance with `256 KiB` / `2 MiB` limits. | Any resolution mismatch, symlink, or size-limit violation. |
| R-04 | Software role prompts or `.tools.md` introduce hardcoded engineering numbers, weaken independent pre-check separation, or request network hosts that block restricted lanes. | `software-author.tools.md` omits `network:` (and `roleToolText` strips network for pre-check); `software-pre-check.md` forbids modifying deliverables and requires deterministic evidence; templates/typicals use placeholders only. | Any hardcoded numeric threshold or `network:` line in `software-author.tools.md`. |
| R-05 | Depth-2 `roles/intake.md` files shadow `packs/general/roles/intake.md` in `findRoleIn(cfg, "intake")`. | `findRoleIn` already excludes `entry === "intake.md"`; `software-pack.test.ts` asserts `findRoleIn(cfg, "intake")` still resolves to `packs/general`. | `findRoleIn(cfg, "intake")` resolving to a playbook's `intake.md`. |

## Selected mode

- **Mode:** Standard
- Basis: adds domain pack prompts/templates read by the control plane (`work.ts`) and modifies live e2e test stack orchestration (`stack.ts`); no trust-surface or contract change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All controls verified by unit tests, typechecks, and repository checks retained under `evidence/`, with owner retaining the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
