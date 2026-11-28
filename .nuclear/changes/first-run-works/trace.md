# Trace: A first run that works: Setup seats only agents that can start, and doctor says why one can't

| Need | Code | Test |
| --- | --- | --- |
| RUN-2, RUN-3, RM-6: seat only agents that can start here, say why for the rest | `apps/web/src/lib/agents.ts`, `Setup.tsx`, `AgentList.tsx`, `councilFlow.ts`, `runtimes.ts` | `pages/setup.test.tsx`, `components/agent-list.test.tsx` |
| RUN-3: pickers gate macOS-only runtimes | `NewWorkModal.tsx`, `BoardView.tsx`, `ProjectModal.tsx` | `components/newwork.test.tsx`, `components/project-modal-repos.test.tsx` |
| RUN-1: no agent ready says so and links Setup | `CaptureCard.tsx`, `CaptureDrawer.tsx`, `useAgents.ts` | `features/board/no-agent-ready.test.tsx` |
| RUN-4: where repositories are looked for, typed path | `ProjectModal.tsx`, `NewWorkModal.tsx` | `components/project-modal-repos.test.tsx` |
| RUN-5: plain GitHub listing errors | `services/api/src/repos.ts` | `services/api/test/github-list-error.test.ts` |
| DMN-3: Claude Code npm install | `daemon/internal/runner/artifact.go` | `artifact_test.go` npm tests |
| DMN-25: no-runtime error names every runtime | `adapter.go`, `daemon.go` | `no_runtime_test.go` |
| CLI-9: database port | `services/api/src/pg-port.ts`, `server.ts` | `services/api/test/pg-port.test.ts` |
| CLI-5, CLI-6, CLI-7, CLI-12, RM-6, DMN-3 in doctor | `scripts/lib/doctor.mjs`, `scripts/cr.mjs` | `scripts/test/doctor.test.mjs` |
| CLI-10: no ps or lsof | `scripts/lib/instance.mjs` | `scripts/test/instance-proc.test.mjs` |
| CLI-3, CLI-8, CLI-20, DOC-7, docs for the above | README, `docs/getting-started.md`, `quickstart-check.md`, `daemon.md`, `owner-pilot.md` | `tools/check_public_claims.py`, review |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a fresh machine, Setup seats only the agents installed here and runnable on this platform, and every other row says why with the fix (install, sign in, macOS only, native build, not available yet). A card made while no agent is ready says so and links to Setup. The project form says where local repositories are looked for and takes a typed folder. `controlrod doctor` keeps checking as root, exits 1 under `--strict` while agent runs can't start, names native Windows as missing with the WSL2 fix, and a background start always prints the agent rows. The bundled database no longer sits on the web port's neighbour, and existing installs keep their data and port. Web, API, daemon and script tests pass, and the change record validates.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
