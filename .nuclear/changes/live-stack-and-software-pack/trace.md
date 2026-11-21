# Trace: live stack cleanup and software domain pack

| ID | Requirement | Tests / Verification | Disposition |
|---|---|---|---|
| T-01 | `AGENT_BINARIES` in `apps/web/e2e/live/stack.ts` includes `ollama`, `grok`, `opencode`, and `agy` alongside existing agent binaries. | Code inspection of `apps/web/e2e/live/stack.ts` and `tsc --noEmit` on `stack.ts` (E-04). | implemented; typechecked |
| T-02 | `startStack()` cleans up started API, embedded Postgres, and `/tmp/cr-live-*` temp dir via `stack.stop()` if startup fails. | Code inspection of `apps/web/e2e/live/stack.ts` and `tsc --noEmit` on `stack.ts` (E-04). | implemented; typechecked |
| T-03 | `packs/software/` contains only regular files and directories within `packFiles` size limits (`<= 256 KiB` per file, `<= 2 MiB` total, no symlinks). | `software-pack.test.ts` "contains only real files and directories within pack size limits (no symlinks)" (E-02). | implemented and tested |
| T-04 | Shared roles `software-author` and `software-pre-check` resolve via `findRoleIn` and `preCheckRole`, without masking `general` `intake`. | `software-pack.test.ts` "resolves shared software roles via findRoleIn and preCheckRole" (E-02). | implemented and tested |
| T-05 | `software-author.tools.md` resolves via `roleToolText` for author and pre-check runs with valid qualified tools and no network hosts. | `software-pack.test.ts` "resolves software-author tools cleanly for author and pre-check runs" (E-02). | implemented and tested |
| T-06 | `bugfix`, `feature`, and `migration` playbooks provide `templates/` and `typicals/` loaded by `packFiles`, and depth-2 `roles/intake.md` loaded by `jobIntakeGuides`. | `software-pack.test.ts` "loads templates and typicals..." and "exposes depth-2 intake guides..." (E-02). | implemented and tested |
| T-07 | API and web packages typecheck cleanly and repository public-claims/originality/brief-budget checks pass. | API typecheck (E-01), Web typecheck (E-03), repo checks (E-05). | verified |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every requirement traced to code/tests and verified under `evidence/`, with open live-runtime e2e execution noted honestly in `ship.md` and `verification.md`.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
