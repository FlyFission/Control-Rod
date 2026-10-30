# Workbench donors: what to take, what to leave

> **Provenance.** Source level reading on 2026-10-29 of the repositories below at the pinned commits, by readers who ran nothing inside the clones. Root licenses were confirmed from GitHub's license metadata and the repositories' own license files; effective licenses of named paths were checked at folder level by the readers and must be rechecked at file level before any port (spec section 32). This file carries ideas and pointers only, no code. Products under copyleft, source available or custom restrictive licenses are listed at the end and were not read at source level.

## Pinned donors

| Repository | License (root) | Commit | Group |
|---|---|---|---|
| stablyai/orca | MIT | `ec62243dedec0ba82b8ef393438eecd8f35fa0ef` | workspace and review |
| generalaction/emdash | Apache-2.0 | `85dfa910ac92e69b09ed5df70ea60ee625a83f07` | workspace and review |
| BloopAI/vibe-kanban | Apache-2.0 (project sunsetting) | `7c3807084daad0d9d315064f60fa869de254f027` | workspace and review |
| pingdotgg/t3code | MIT | `8970a32104e0d37123f33fd122e96826e68b3b4a` | workspace and review |
| iOfficeAI/AionUi | Apache-2.0 (agent engine is an external binary, unread) | `11cd2a9a20d1e033157636efc570b41384c66d85` | workspace and review |
| paperclipai/paperclip | MIT | `a8e07500db68f187b19de83823eb7fabf1196021` | office and governance |
| HarnessMD/munder-difflin | MIT | `f797048cc88ca2ff94bfc6c8c93b16f47a201f15` | office and governance |
| humanlayer/humanlayer | Apache-2.0, NOTICE | `316e74ef9af0b7b3d64ac45b5eb93415b3ed2204` | office and governance |
| nwiizo/ccswarm | MIT | `611bf153e4378c5abf8fd2515388ecbeee6a8357` | office and governance |
| OrchestratorInc/agent-orchestrator | Apache-2.0 (some packages declare MIT) | `fe0550a4e83be5b7268910b77dcc55a63d6a72a2` | orchestration and supervision |
| gastownhall/gastown | MIT | `466aa41c83ee73b1fa0eb79eb9d172fb1eca9476` | orchestration and supervision |
| awslabs/cli-agent-orchestrator | Apache-2.0, NOTICE | `9d029f9d4db16df2725bd04751756fd0b7d27440` | orchestration and supervision |
| herdrdev/herdr | Apache-2.0 | `ee5bfb5041bb3e4a49d591c72308aae3c81ecdde` | orchestration and supervision |
| asheshgoplani/agent-deck | MIT | `967e2faf2b98b30da61206baaeff6bf998709f1b` | orchestration and supervision |
| omnigent-ai/omnigent | Apache-2.0, NOTICE | `3bc46c66f856c0fa9fb0d2cb75145552d1557e27` | execution, sandbox, audit |
| GoogleCloudPlatform/scion | Apache-2.0 | `8845a940763f91519d25e72cde3762d6e31df4cb` | execution, sandbox, audit |
| sipyourdrink-ltd/bernstein | Apache-2.0 | `cb761c69b3d11689233e5e7a9ed07fdb26b9e7e5` | execution, sandbox, audit |
| OpenHands/OpenHands | MIT (this pin holds the frontend only) | `7219c1991e9b47b6af7977bd7e9e5de1aa4f404b` | execution, sandbox, audit |

## What to take

Verdicts: **adopt** (port with obligations), **adapt** (reshape for frozen one shot runs and signed decisions), **concept** (idea only, reimplement), **skip**.

| Mechanism | Repository and paths | Verdict | Spec section |
|---|---|---|---|
| Host side git hardening | scion `pkg/util/git_host.go` | adopt | 15 |
| Spawn time ownership receipt | agent-deck `internal/procowner/` | adopt | 22 |
| Identity checked graceful group stop | agent-orchestrator `backend/internal/adapters/runtime/conpty/host_conpty_linux.go`; vibe-kanban `crates/utils/src/process.rs` | adapt | 22 |
| Stop revokes write authority first | paperclip `server/src/agent-run-cancellation.ts` | adapt | 22 |
| Run outcome model (outcome unknown, proved cancellation) | emdash `CONTEXT.md`, `docs/adr/0004` | concept | 22 |
| Reaper with failed probe rule and outage breaker | agent-orchestrator `backend/internal/observe/reaper/reaper.go` | adapt | 22 |
| Generation fence | cli-agent-orchestrator `src/cli_agent_orchestrator/services/workflow_service.py` | concept | 22 |
| Runaway breaker ladder | munder-difflin `src/main/breaker.ts` | adapt | 22 |
| Default deny permission hook, waiting detection | agent-orchestrator `backend/internal/cli/hooks.go`, `backend/internal/adapters/agent/claudecode/hooks.go` | adapt, pending spike S-3 | 22 |
| Resumable SSE with cursor and heartbeat | agent-orchestrator `backend/internal/httpd/events.go`, `backend/internal/cdc/` | adapt | 27 |
| Explicit loss on stale cursor | herdr `src/api/event_hub.rs` | concept | 27 |
| Durable versus transient frames; gap aware cursor | OpenHands `src/types/agent-server/session-frames.ts`, `src/utils/session-seq-cursor.ts` | adapt | 27 |
| Event store with sequence and command receipts | t3code `apps/server/src/orchestration-v2/EventStore.ts`, `apps/server/src/persistence/` | adapt | 27 |
| Normalized provider events | t3code `packages/provider-core/src/server/ProviderAdapter.ts` | adapt (small subset) | 20 |
| Runtime auth probes | agent-orchestrator `backend/internal/adapters/agent/authprobe` | adapt | 21 |
| Worktree manager with locks and cleanup | vibe-kanban `crates/worktree-manager/src/worktree_manager.rs` | adapt | 15 |
| Worktree removal guards | orca `src/main/worktree-removal-safety.ts`, `worktree-removal-home-guard.ts` | concept | 15 |
| Ignored file copy with check-ignore | emdash `packages/core/src/runtimes/workspace-registry/node/copy-artifacts.ts`, `preserve-patterns.ts` | adopt | 15 |
| Temp index checkpoints to private refs | t3code `apps/server/src/vcs/GitVcsDriver.ts`, `apps/server/src/checkpointing/CheckpointStore.ts` | adapt | 15 |
| OS sandbox backends behind one policy | omnigent `omnigent/inner/seatbelt_sandbox.py`, `bwrap_sandbox.py`, `_seccomp.py` | concept only; ADR 0010 adopts sandbox-runtime as the laptop driver | 23 |
| Default deny egress via parent proxy | omnigent `omnigent/inner/egress/` | concept (driver proxy per ADR 0010) | 23 |
| Secretless credential injection | omnigent `designs/SANDBOX_CREDENTIAL_PROXY.md`, `omnigent/inner/credential_proxy.py` | adapt for the model broker, pending spikes S-0 and S-2 | 23 |
| Post launch verification | scion `pkg/runtime/apple_container.go` | concept | 23 |
| Isolation tier vocabulary (observed, refuted, unverifiable) | bernstein `core/sandbox/attestation.py`, `core/config/host_isolation.py` | concept | 23 |
| Semantic chain verifier per event family | bernstein `core/security/audit_chain.py` | adapt | 11.6 |
| Decision service with target snapshots and staleness | paperclip `server/src/services/decisions.ts` | concept (owner passkey replaces server key) | 10 |
| Budget ceiling with enforcement | paperclip `server/src/services/budgets.ts` | adapt | 26 |
| Acceptance rules for independent review | ccswarm `docs/SANGHA_PRODUCT_CORE.md` | concept (checklist for pre-check outcomes) | 11.4 |
| Diff range notes | orca `src/shared/diff-comment-types.ts`; emdash diff view comments | concept (anchor to digest) | 25 |
| Deliverable previews | AionUi `packages/desktop/src/renderer/pages/conversation/Preview/` | concept (viewer dependency licenses unchecked) | 25 |

## What to leave, and why

- Screen scraped status, key injection into terminals, auto accepted trust dialogs (most of the orchestration group): status breaks across CLI releases and a paste can answer a permission prompt for the owner.
- Any approval that is a status flip without a content digest (paperclip board approvals, ccswarm approval files, humanlayer resolve with client supplied allow rules).
- Any rule that treats loopback, a CLI login or a local socket as the owner.
- Worktrees presented as isolation (bernstein).
- HMAC audit keyed with a secret the agent can read (bernstein, default off).
- Remote sandbox providers for non public lanes.

## Ideas only, never source

Kandev (AGPL-3.0, ADR 0019; merged notes in `kandev.md`; the 2026-10-29 reader notes stay outside the repository until the wording check passes), Claude Squad (AGPL-3.0), OpenKanban (AGPL-3.0), Maestro (AGPL-3.0), Multica (custom license restricting commercial embedding and hosting), Paradev formerly Superset (Elastic License 2.0), cmux by Manaflow (GPL-3.0-or-later terminal with separately licensed server components). Their ideas enter Control Rod only through clean room notes with a recorded wording check.

## Exit criteria

Every port named here has a register entry with its file level license before it merges.

## Source-lineage note

Scouting working papers (reader findings, synthesis) are kept outside the repository at `~/repo-scouting/agent-workbench-2026-10-29/` on the owner's machine.

Munder Difflin's `LICENSE-ASSETS` (read at the pinned commit) states its bundled tileset art is LimeZu "Modern Interiors" under a separate license requiring credit, so its art is excluded; only its MIT code patterns are referenced.

Office view engine patterns named by the Platform Plan (openclaw-office for SVG rendering and event batching, Munder Difflin for state rules, herdr for status rollup order) were not re-read in this pass beyond Munder Difflin and herdr; openclaw-office is to be pinned and license checked before use.
