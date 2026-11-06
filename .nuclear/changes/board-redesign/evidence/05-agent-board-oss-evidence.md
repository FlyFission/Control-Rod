# Control Rod board research, slice 5: evidence from open-source agent board repos

Accessed: 2026-11-05 to 2026-11-06 (UTC), through the authenticated `gh` CLI (GitHub REST and GraphQL) and the vendor blog for the Vibe Kanban shutdown. Read only; nothing was cloned or run.
Purpose: settle board design decisions by what users of open-source agent boards actually asked for, complained about, and what maintainers built, kept, or removed. Taste is out of scope.
Companion files: slice 3 (`03-agent-workbenches.md`) covers the product landscape. This slice covers issue, PR and commit evidence only.

## How to read this file

- `rN cM` after a link means N total reactions (all emoji types, mostly thumbs up) and M comments, read on the access date. Counts move; treat them as rough weights.
- "Closed" means the issue is closed; I did not verify a shipped feature unless the text says shipped and names the PR.
- "Converging products" counts shipped products in this slice that already do the thing, verified from their README, docs or code.
- Evidence strength scale used in verdicts: **Strong** = 4 or more products converge and there is clear user demand (an issue above r10, or several issues above r5). **Moderate** = 2 or 3 products, or demand in the r5 to r10 range. **Weak** = 1 product or demand below r5.
- Bias warning. Orca (116.7k stars) and Paperclip (111.4k) have far more users than the rest, so their issues collect more reactions. Many top requests in every repo are "support my agent CLI" or "support my git host"; those are real but they are not board design decisions, so they are grouped, not ranked individually.
- GitHub search results are full text and noisy. Every issue cited below was opened and read; the search output itself was not trusted.

## 1. Repositories and licenses

| Repo | Stars | License | Reuse rule for Control Rod (Apache-2.0) |
|---|---|---|---|
| [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) | 28.6k | Apache-2.0 | Code reusable with NOTICE and change notes |
| [kdlbs/kandev](https://github.com/kdlbs/kandev) | 1.1k | AGPL-3.0 | Ideas only |
| [generalaction/emdash](https://github.com/generalaction/emdash) | 6.2k | Apache-2.0 (GitHub license API; slice 3 cites MIT from a secondary listing, the repo now says Apache) | Code reusable |
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | 92.7k | MIT | Code reusable; different shape (chat agent, not a board) |
| [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | 111.4k | MIT | Code reusable |
| [stablyai/orca](https://github.com/stablyai/orca) | 116.7k | MIT | Code reusable |
| [cline/kanban](https://github.com/cline/kanban) | 1.4k | Apache-2.0 | Code reusable. This is Cline's kanban feature; it lives in its own repo, not in cline/cline |
| [cline/cline](https://github.com/cline/cline) | 71.4k | Apache-2.0 | IDE agent, no board; top issues are model and IDE support, little board signal |
| [asheshgoplani/agent-deck](https://github.com/asheshgoplani/agent-deck) | 1.2k | MIT | Code reusable (Go TUI) |
| [iOfficeAI/AionUi](https://github.com/iOfficeAI/AionUi) | 34.1k | Apache-2.0 | Code reusable; chat shell, weak board signal |
| [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) | 8.7k | AGPL-3.0 | Ideas only |
| Added: [multica-ai/multica](https://github.com/multica-ai/multica) | 55.0k | "Multica License": Apache-2.0 text plus extra conditions in Part I of its LICENSE | Treat as ideas only until a lawyer reads Part I |
| Added: [ParadevAI/Paradev](https://github.com/ParadevAI/Paradev) (formerly Superset) | 16.0k | MIT | Code reusable |

Other agent board repos searched for (`gh search repos "kanban agents"`, plus known names) were all under 1,000 stars or not boards: coder/xum 2.1k (AGPL, desktop worktree app), stravu/crystal 3.1k (MIT, now Nimbalyst, last push 2026-02), siteboon/claudecodeui 14.5k (AGPL, a mobile/web chat UI, not a board), imbue-ai/sculptor 244.

## 2. Why Vibe Kanban is sunsetting (from its own words)

1. **Business model, not product failure.** The shutdown post dated 2026-04-10 says the "vast majority are free users and we couldn't find a business model that we could get excited about." It names no competitor or product defect. Remote services (kanban issues, comments, projects, organisations) ran 30 more days; the latest version shipped a data export; invoices from the prior 30 days were refunded; local workspaces keep working; the repo "will live on, open source and community maintained." Source: https://www.vibekanban.com/blog/shutdown . README banner added by [PR #3388](https://github.com/BloopAI/vibe-kanban/pull/3388) on 2026-04-24.
2. **The board itself was removed in the shutdown, even for local and self-hosted users.** [PR #3387](https://github.com/BloopAI/vibe-kanban/pull/3387) "Sunset project routes to an export-only page" (merged 2026-04-24, shipped in v0.1.44) stops the `ProjectKanban` route from mounting "the Kanban board, issue panels, workspace flows" and shows an export screen instead. Users who had self-hosted the server lost the board too: [#3396](https://github.com/BloopAI/vibe-kanban/issues/3396) r19 c9 ("forced the shutdown of Projects... regardless of which API is used"; export "lacks issue links to workspaces"), [#3354](https://github.com/BloopAI/vibe-kanban/issues/3354) r5 c10 ("they literally dropped 'kanban' from 'vibe-kanban'"; users pin `npx vibe-kanban@0.1.43` or back to 0.1.8, the "last truly local board").
3. **The decline started earlier, when the local board moved behind a cloud login.** v0.1.9 (early 2026) replaced the local "classic" board with a "workspaces" UI and put the kanban behind login: [#2687](https://github.com/BloopAI/vibe-kanban/issues/2687) "Bring back old UI" r33 c39 (the most reacted issue in the repo; "after upgrade ALL old tasks and PROJECTS are gone"), [#2288](https://github.com/BloopAI/vibe-kanban/issues/2288) r17 c26 (the workspace UI "completely does away with the concept of a 'task'"), [#2509](https://github.com/BloopAI/vibe-kanban/issues/2509) r15 c3 "please keep the Kanban board", [#2730](https://github.com/BloopAI/vibe-kanban/issues/2730) r15, [#2952](https://github.com/BloopAI/vibe-kanban/issues/2952) r10 "Why do I need to log in to use features such as Kanban?" (user cites code that "cannot be transmitted to the Internet"), [#2812](https://github.com/BloopAI/vibe-kanban/issues/2812) r10 "Confusing Cloud Migration", [#2838](https://github.com/BloopAI/vibe-kanban/issues/2838) r9 "Data inaccessible: Timeout waiting for shape data". A maintainer reply in #2687 confirms "the board is *not* available offline."
4. **After the sunset.** [#3408](https://github.com/BloopAI/vibe-kanban/issues/3408) "is this project dead?" r5 c8 lists forks and migrations (Kandev, Multica, vibe-kanban-indie). Commits continue (v0.1.45 in 2026-09, main at `08064e043c`), so community maintenance is real but thin.

Lesson for Control Rod (judgment): Vibe Kanban's users did not leave over agent features. They left when (a) local-only data started depending on a vendor server and (b) the task card was demoted below the workspace. Control Rod is local-first by design; the evidence says keep the card as the primary object and never make the board depend on a hosted account.

## 3. Decisions

### D1. How a task is created

What products do:
- Vibe Kanban: title plus description (the prompt), then pick agent profile, variant, and base branch when an attempt starts (docs `docs/core-features/new-task-attempts.mdx` at `4c0a6657ad`). Bulk actions bar exists (`packages/web-core/src/features/kanban/ui/BulkActionBarContainer.tsx`).
- Cline Kanban: create a card by hand, or ask the sidebar chat agent to break work into cards; the agent gets board management instructions injected (README).
- Multica and Paperclip: an issue assigned to an agent like a colleague (README).
- Kandev: tasks from GitHub, GitLab, Jira, Linear, Sentry, Azure DevOps (README; AGPL, idea only).
- Emdash, Orca, Paradev: tasks or workspaces from Linear, GitHub, Jira and others (READMEs).

Demand:
- Import from the issue tracker is the most requested creation path: Multica [#1634](https://github.com/multica-ai/multica/issues/1634) Jira r25 c10, Multica [#1120](https://github.com/multica-ai/multica/issues/1120) "Sync GitHub issues/PRs" r18 (closed), Orca [#8376](https://github.com/stablyai/orca/issues/8376) "Custom Task Source Integration via Generic API Contract" r26, Orca [#4703](https://github.com/stablyai/orca/issues/4703) Gitea task sources r21, Orca [#13333](https://github.com/stablyai/orca/issues/13333) Azure DevOps Boards r18, Vibe Kanban [#1677](https://github.com/BloopAI/vibe-kanban/issues/1677) r9 and [#479](https://github.com/BloopAI/vibe-kanban/issues/479) r7, Vibe Kanban [#2424](https://github.com/BloopAI/vibe-kanban/issues/2424) Jira r5.
- Control over names at creation: Paradev [#7168](https://github.com/ParadevAI/Paradev/issues/7168) "No way to type a workspace or branch name at creation" r15, [#7318](https://github.com/ParadevAI/Paradev/issues/7318) r11, [#6398](https://github.com/ParadevAI/Paradev/issues/6398) r9; claude-squad [#88](https://github.com/smtg-ai/claude-squad/issues/88) branch name templates r7.
- Agent and model per card at creation: Cline Kanban [#166](https://github.com/cline/kanban/issues/166) r3, [#431](https://github.com/cline/kanban/issues/431) r3, [#113](https://github.com/cline/kanban/issues/113) per task reasoning effort r3.
- Prompt templates: Orca [#9066](https://github.com/stablyai/orca/issues/9066) customizable task worktree prompt r6 c9, [#16066](https://github.com/stablyai/orca/issues/16066) start prompt template for ticket-linked workspaces r4; Multica [#7345](https://github.com/multica-ai/multica/issues/7345) declarative pipeline templates RFC r1 c13; Multica [#1343](https://github.com/multica-ai/multica/issues/1343) issue templates r1.
- Programmatic creation: Emdash [#1995](https://github.com/generalaction/emdash/issues/1995) local HTTP API for task creation r3.

**Verdict.** Default creation form: title, body (the instruction), target repo and base branch, agent profile (agent plus model plus effort), and an editable branch name prefilled from the title. Second path, first-class: create from an external issue with a back link. Templates and bulk creation are optional. Strength: **Strong** for minimal form plus tracker import (6 products converge; tracker import requests reach r18 to r26 in two large repos). **Weak** for templates (r6 at best).

### D2. How work starts, and concurrency

What products do:
- Manual start is the norm. Cline Kanban: "Hit the play button on a card" (README). Vibe Kanban: "Create Attempt" then start. Emdash, Orca, Paradev, claude-squad: start a task or session explicitly.
- Auto pickup on assignment: Multica ("assign it... it picks the task up") and Paperclip (agents wake on heartbeats and assignments).
- Auto start by column: Kandev workflow steps can auto-start; Cline Kanban auto-starts linked cards when a dependency card reaches Trash (README).

Demand and failures:
- Uncapped auto start causes provider throttling. Kandev [#1609](https://github.com/kdlbs/kandev/issues/1609) r2 c6: dropping several tasks into an auto-start step "starts one agent session per task in parallel, and the provider starts rejecting requests (429s / thrashing)"; maintainers shipped a per-step WIP limit in [PR #1613](https://github.com/kdlbs/kandev/pull/1613). Paperclip [#332](https://github.com/paperclipai/paperclip/issues/332) per adapter concurrent agent limit r10 (open). Multica [#4205](https://github.com/multica-ai/multica/issues/4205) concurrency limits and run queuing (closed) and [#7015](https://github.com/multica-ai/multica/issues/7015) runtime and global limits r2.
- Quota awareness is the larger demand: Paperclip [#3317](https://github.com/paperclipai/paperclip/issues/3317) model fallback on quota r12, [#2101](https://github.com/paperclipai/paperclip/issues/2101) retry after limits r11, [#5521](https://github.com/paperclipai/paperclip/issues/5521) usage-limit-aware pause and scheduled resume r6; Orca [#20512](https://github.com/stablyai/orca/issues/20512) account failover on rate limit r9 c21; Multica [#9159](https://github.com/multica-ai/multica/issues/9159) "park on quota, resume" r5; Kandev [#3811](https://github.com/kdlbs/kandev/issues/3811) r3 c6.
- Start ordering bugs: Paradev [#3585](https://github.com/ParadevAI/Paradev/issues/3585) agent starts before the setup script finishes r4; Vibe Kanban [#2847](https://github.com/BloopAI/vibe-kanban/issues/2847) initial prompt lost when setup fails r3.
- Drag to start: little demand either way. Vibe Kanban [#331](https://github.com/BloopAI/vibe-kanban/issues/331) reorder within column r3; Cline Kanban [#65](https://github.com/cline/kanban/issues/65) "Unable to drag cards back into backlog" r3.

**Verdict.** Default to an explicit Start action on the card. Offer auto start as an opt-in per column, always paired with a WIP limit per column and per agent profile, and a queue that parks runs when the provider quota is hit and resumes them later. Start the agent only after workspace setup succeeds, and keep the prompt if setup fails. Strength: **Strong** for manual start default (7 products) and **Strong** for quota and concurrency control (Kandev shipped a WIP limit in PR #1613, Multica closed its limits issue, Paperclip and Orca track it; r6 to r12 across five issues). **Weak** for drag-to-start.

### D3. What a card shows while an agent runs

What products do:
- Cline Kanban: hooks display "the latest message or tool call on each card, so you can monitor hundreds of agents at a glance" (README). Hook adapters per agent in `src/commands/hook-events/` at `abd4912c27`.
- Vibe Kanban: [PR #2605](https://github.com/BloopAI/vibe-kanban/pull/2605) "Show live active workspace context on issue and kanban cards" (merged 2026-02-07).
- Paradev: "sidebar shows which agent is working, done, or waiting on you" (README). agent-deck: running, waiting, idle, error per session plus a cost dashboard key `$` (README).
- Emdash: [PR #2375](https://github.com/generalaction/emdash/pull/2375) (merged 2026-06-09) removed terminal output classifiers and now relies only on agent hooks for running and permission state.

Demand and failures:
- "Needs you" must look different from "busy": Emdash [#531](https://github.com/generalaction/emdash/issues/531) "Show distinct icon for tool call approval requests instead of spinner" r4 c6 (closed). Orca [#12577](https://github.com/stablyai/orca/issues/12577) "jump to the next agent that needs input" r10 ("I really miss this feature from Conductor").
- Stale status is the most common status bug: Cline Kanban [#82](https://github.com/cline/kanban/issues/82) Codex cards stuck in running r5; Paradev [#3689](https://github.com/ParadevAI/Paradev/issues/3689) stop hook went to idle instead of review r4 (fixed by deriving status from host bindings, "seen-gated review state"); Orca [#22017](https://github.com/stablyai/orca/issues/22017) and [#14278](https://github.com/stablyai/orca/issues/14278) stuck at working; OpenHands [#5817](https://github.com/OpenHands/OpenHands/issues/5817) websocket drop shows "Agent is Stopped" while it runs.
- Cost: Paperclip [#339](https://github.com/paperclipai/paperclip/issues/339) estimate cost for subscription agents r16 (subscription runs record `cost_cents = 0`), [#498](https://github.com/paperclipai/paperclip/issues/498) distinguish subscription vs API cost r11, [#1756](https://github.com/paperclipai/paperclip/issues/1756) token budgets r11, [#212](https://github.com/paperclipai/paperclip/issues/212) Codex runs show $0.00 r5; OpenHands [#5257](https://github.com/OpenHands/OpenHands/issues/5257) display API costs r4 c15; Orca [#11225](https://github.com/stablyai/orca/issues/11225) context window pressure r3; Kandev [#1149](https://github.com/kdlbs/kandev/issues/1149) show 5-hour and weekly quota (closed).
- Diff stats on the card: requested as part of Emdash [#2374](https://github.com/generalaction/emdash/issues/2374) comparison board (files changed, additions, deletions, PR and check state).

**Verdict.** Card face while running: state chip with a distinct, loud "Needs you" variant; latest activity line (last tool call or message); elapsed time; token count with a cost estimate that labels subscription usage as an estimate, never $0; diff stats (files, plus, minus) once there are changes. Drive state from structured agent hooks and the runner's own process records, not terminal scraping, and add a stale detector that marks a card "status unknown" instead of leaving it "running". A keyboard jump to the next card that needs you. Strength: **Strong** for status plus needs-you plus latest activity (5 products converge; r4 to r10 demand; recurring stale-status bugs in 4 repos). **Moderate** for cost on the card (2 products, r11 to r16 demand in Paperclip alone).

### D4. Review of results

What products do:
- Batched line comments sent back to the agent are now table stakes. Vibe Kanban: "Review comments are not submitted individually. They are collected and sent as a complete review" (`docs/core-features/reviewing-code-changes.mdx` at `4c0a6657ad`). Orca: comments "pin to the exact line... follow the line if the diff shifts"; "Sending comments one at a time causes the agent to swing back and forth. Batching keeps the feedback coherent" (`docs/site/content/docs/review/annotate-ai-diff.mdx` at `6ff6b39e83`). Cline Kanban: click lines to comment (README). Paradev: closed [#935](https://github.com/ParadevAI/Paradev/issues/935) "All diff commenting" r13, [#2835](https://github.com/ParadevAI/Paradev/issues/2835) r3, [#3244](https://github.com/ParadevAI/Paradev/issues/3244) inline annotations pre-PR r6. Emdash: `diff-comments-mention.ts` in its conversations feature.
- Diff since the last turn: Cline Kanban checkpoints (`src/workspace/turn-checkpoints.ts`); Emdash [#1635](https://github.com/generalaction/emdash/issues/1635) r4 (open).
- Finish: Commit or Open PR (Cline Kanban sends a prompt to the agent to produce the commit and resolve conflicts); Vibe Kanban merge plus rebase with "Resolve Conflicts" that writes instructions for the agent (`docs/core-features/resolving-rebase-conflicts.mdx`); Orca and Paradev send failing CI checks and PR review comments back to an agent (READMEs).

Demand:
- Local merge without a PR: Emdash [#1269](https://github.com/generalaction/emdash/issues/1269) r3, Orca [#14860](https://github.com/stablyai/orca/issues/14860) r2. Branch hygiene after merge: Vibe Kanban [#2680](https://github.com/BloopAI/vibe-kanban/issues/2680) delete branch after merge r6, [#2732](https://github.com/BloopAI/vibe-kanban/issues/2732) optional squash r2.
- Formal review actions: Orca [#9512](https://github.com/stablyai/orca/issues/9512) submit GitHub PR reviews (Comment, Approve, Request changes) r18; Orca [#4540](https://github.com/stablyai/orca/issues/4540) mark files as viewed r6.
- CI loop: Multica [#3719](https://github.com/multica-ai/multica/issues/3719) let the agent react to its own PR's CI failures r7.
- Review gates that fail in practice: Paperclip [#4143](https://github.com/paperclipai/paperclip/issues/4143) "User-participant approval stages have no UI action buttons" r6 c10 (the stage exists, the human cannot act); Paperclip [#3921](https://github.com/paperclipai/paperclip/issues/3921) transition demands a comment but offers no comment box r6.
- Non-code outputs: Paperclip artifacts let reviewers "leave comments on specific passages in documents" (README); Paradev "Pages" where "Teammates pin comments, and a watching agent can revise it at the same link" (README); Orca rich previews for images, PDF, Markdown (README) and [#20800](https://github.com/stablyai/orca/issues/20800) "Annotate an agent's reply (or selected transcript text), not just diffs" r5; Vibe Kanban [#1335](https://github.com/BloopAI/vibe-kanban/issues/1335) inline comments for plans r4.

**Verdict.** Review screen: full diff with "since last turn" toggle, line comments collected into one batch and sent as one follow-up run, resolve and re-check after the agent revises, mark files viewed. Finish options: local merge, open PR, or discard, with branch cleanup offered after merge. For documents: render the output (Markdown, PDF, Word preview) and allow passage comments with the same batch-and-send loop. Any gate that requires a human must render its own action buttons to that human; a gate without a button is a bug class Paperclip has today. Strength: **Strong** for batched line comments plus follow-up run (6 products converge; r13 Paradev, r18 Orca for formal review actions). **Moderate** for non-code review (3 products, r4 to r5 direct demand). **Weak** for local merge without PR demand, but cheap.

### D5. Agent questions, approvals, and steering mid-run

What products do:
- Vibe Kanban has a full approval and question model in Rust: `ApprovalStatus` = Pending, Approved, Denied with optional reason, TimedOut; question answers; `APPROVAL_TIMEOUT_SECONDS = 36000` (10 hours) (`crates/utils/src/approvals.rs` at `4c0a6657ad`); queued follow-up messages (`crates/services/src/services/queued_message.rs`).
- Kandev shipped mid-turn steering for agents that allow it ([#1607](https://github.com/kdlbs/kandev/issues/1607), PRs #2241 and #2323) and is designing non-blocking questions ([#4836](https://github.com/kdlbs/kandev/issues/4836): "ask early, keep going, pick the answer up when it lands").
- Many boards run agents with permissions bypassed: Cline Kanban README says it uses "bypassing permissions"; claude-squad `-y/--autoyes`; Paradev [#2419](https://github.com/ParadevAI/Paradev/issues/2419) "claude agent always uses hardcoded argument `--dangerously-skip-permissions`" r13.

Demand and failures:
- Talking to a running agent is the single most demanded interaction in Paperclip: [#49](https://github.com/paperclipai/paperclip/issues/49) "Chat with agents much needed feature" r49 c19. Multica [#6327](https://github.com/multica-ai/multica/issues/6327) open an agent run as interactive chat with live steering c7. OpenHands [#7835](https://github.com/OpenHands/OpenHands/issues/7835) interrupt or pause to intervene c15.
- Queue vs steer must be explicit: Orca [#22887](https://github.com/stablyai/orca/issues/22887) "Claude Code queues it, Codex steers the current turn... the same keystroke means different things in different panes" r2.
- Permission middle ground: Orca [#13081](https://github.com/stablyai/orca/issues/13081) support Claude Code Auto mode and Codex intermediate modes r22 (closed); Orca [#25559](https://github.com/stablyai/orca/issues/25559) chat UI "can only run Claude in bypass or Manual" r13; agent-deck [#440](https://github.com/asheshgoplani/agent-deck/issues/440) auto mode toggle r3.
- Blind approvals: Kandev [#710](https://github.com/kdlbs/kandev/issues/710) "Edit/Terminal tool calls show no command or target before approval is required... I have to approve blindly" r2 c8. Unsupported question tools break the UI: Vibe Kanban [#1220](https://github.com/BloopAI/vibe-kanban/issues/1220) Claude Code `AskUserQuestion` not supported r7 (only an Approve button that "does nothing").
- Human work queue: Paperclip [#923](https://github.com/paperclipai/paperclip/issues/923) "Agents should create actionable issues assigned to humans when blocked" r12 ("Inbox is not a solution. Inbox gets noisy").
- Notifications: Paperclip [#597](https://github.com/paperclipai/paperclip/issues/597) web push r7; Orca [#8129](https://github.com/stablyai/orca/issues/8129) push r8; Multica [#1020](https://github.com/multica-ai/multica/issues/1020) webhook for action-required events r5; and the opposite failure, Orca [#4375](https://github.com/stablyai/orca/issues/4375) "Non turn-end notification spam" r8, Paradev [#5259](https://github.com/ParadevAI/Paradev/issues/5259) "Task complete" fires every model turn r3.

**Verdict.** Model questions and approvals as first-class pending items attached to the card, each showing the exact command, file path, or diff being approved, with approve, deny with reason, and answer. Put them in one "Needs you" queue (not a general inbox) and notify only on transitions into needs-you or done. Let the user send a message to a running card and choose Queue (after this turn) or Steer (into this turn) explicitly, per message. Default permission mode should be the agent's intermediate mode (auto edits with policy), not bypass and not ask-everything. Strength: **Strong** for chat or steer to a running agent (r49 Paperclip, plus 4 other repos) and for an attention queue (5 products, r10 to r12 demand). **Moderate** for showing the target before approval (bug evidence in 2 repos).

### D6. Parallel attempts on one task and comparing them

What products did:
- Vibe Kanban had "task attempts": several runs of one task with a different agent, profile, or base branch. Its own docs say "Most users will only need one attempt per task" (`docs/core-features/new-task-attempts.mdx`). Migration `crates/db/migrations/20251216142123_refactor_task_attempts_to_workspaces_sessions.sql` renamed `task_attempts` to `workspaces` and created one session per workspace; the attempt concept was folded into workspaces.
- Emdash shipped multi-agent variants ([PR #247](https://github.com/generalaction/emdash/pull/247), 2025-11-01: "review outputs side by side, and raise a PR from the winning variant"; no explicit Choose step) and Best-of-N ([PR #362](https://github.com/generalaction/emdash/pull/362), merged 2025-11-30: "Runs per provider"). The current tree at `592281113a` has no multi-agent or variant files, and [#2374](https://github.com/generalaction/emdash/issues/2374) (2026-06-04) says "users currently have to inspect each task one at a time... the final decision still happens manually." I could not find the PR that removed it, so "dropped in the desktop rewrite" is an inference.
- OpenHands critic model [#8963](https://github.com/OpenHands/OpenHands/issues/8963) r11 (closed) is the agent-judges-agent variant.

Demand: low. Emdash #2374 r1; Vibe Kanban [#1539](https://github.com/BloopAI/vibe-kanban/issues/1539) multi-agent parallel execution r3. The bigger related demand is seeing many runs at once, not comparing two runs of one task: Orca [#8377](https://github.com/stablyai/orca/issues/8377) multi-worktree side-by-side view r22.

**Verdict.** Do not make parallel attempts a default. Support "Retry with a different agent or model" on a card, which keeps the earlier attempt and its evidence, and a simple two-up diff comparison when two attempts exist, with the reason for the chosen one recorded. Strength: **Weak** for compare as a core feature (2 products built it, one folded it away and one apparently dropped it; demand r1 to r3). **Moderate** for keeping retry history (both builders kept the underlying records).

### D7. Board columns and states

What products use:
- Vibe Kanban: `Todo, InProgress, InReview, Done, Cancelled` (`crates/db/src/models/task.rs` at `4c0a6657ad`); a completed run "automatically moves to the In Review column" (review docs).
- Cline Kanban: Backlog, In Progress, Review, Trash (`src/core/task-board-mutations.ts` at `abd4912c27`). Its design note `.plan/docs/planning-column-research.md` rejects a separate To Do column: "'To Do' feels redundant for agent orchestration, there's no sprint commitment concept when you're dispatching agents."
- Multica and Paperclip: issue statuses that include in progress, blocked, in review, done (README; Multica #815 quotes `in_progress`, `in_review`, `blocked`).
- Kandev: user-defined workflow steps with gates (README).
- Paradev status: working, done, waiting on you, review (README, #3689).

Demand:
- Custom columns: Vibe Kanban [#1866](https://github.com/BloopAI/vibe-kanban/issues/1866) r8 (closed); Multica [#2559](https://github.com/multica-ai/multica/issues/2559) column and visibility customization r4.
- Archive for finished work: Multica [#3246](https://github.com/multica-ai/multica/issues/3246) "Archive / auto-hide for old Done issues" r9; Orca [#19673](https://github.com/stablyai/orca/issues/19673) archiving workspaces r7; Vibe Kanban [#1670](https://github.com/BloopAI/vibe-kanban/issues/1670) r3; agent-deck [#1345](https://github.com/asheshgoplani/agent-deck/issues/1345) (closed).
- Who moves the card: Multica [#815](https://github.com/multica-ai/multica/issues/815) r18 c9 argues the product "explicitly leaves issue-state management to the agent, not to a server-side workflow controller" (quoting `server/internal/handler/issue.go`: "agents manage issue status themselves via the CLI"; and "No status gate"). Cline Kanban [#70](https://github.com/cline/kanban/issues/70) shows the cost of the board moving cards on its own: all Review cards went to Trash after a restart.
- The board view itself is valued: see the Vibe Kanban issues in section 2 (r33, r17, r15, r15).

**Verdict.** Default columns: Backlog, Running (with sub-states Working, Needs you, Stalled), Review, Done, plus Archive (hidden) and Discarded. No separate To Do. State changes are made by the server from recorded events (run started, run ended, review decision signed), never by the agent writing its own status, and a restart must never move a card. Custom columns are a later setting, mapped onto these system states. Strength: **Strong** for the four-stage flow (5 products converge on backlog, running, review, done) and for server-owned state (Multica r18 critique, Cline restart bug, Vibe docs). **Moderate** for archive (r7 to r9 in two large repos). **Weak** for custom columns (r4 to r8).

### D8. The failures users hit most

Ranked by how often and how loudly they show up across repos:

1. **Forced login or cloud dependency for local work.** Vibe Kanban #2687 r33, #2952 r10, #3396 r19; Paradev [#2685](https://github.com/ParadevAI/Paradev/issues/2685) "Make login non-required" r23 and [#4894](https://github.com/ParadevAI/Paradev/issues/4894) "Drop the sign-in requirement; make it work offline, always, by default" r11; AionUi [#3961](https://github.com/iOfficeAI/AionUi/issues/3961) r8 and [#3880](https://github.com/iOfficeAI/AionUi/issues/3880) "Forced login!" r6; Paperclip [#13725](https://github.com/paperclipai/paperclip/issues/13725) Claude subscription connections stop after about 8 hours r13. Five repos, highest combined weight in this slice.
2. **Lost work or lost board state.** Vibe Kanban #2687 ("ALL old tasks and PROJECTS are gone"), #2838 r9, [#543](https://github.com/BloopAI/vibe-kanban/issues/543) merge wiped uncommitted tracked changes in the main checkout (fixed in PR #510); Cline Kanban #70 (Review to Trash after restart) and [#411](https://github.com/cline/kanban/issues/411) sessions fail to restore after restart; Paradev [#3496](https://github.com/ParadevAI/Paradev/issues/3496) auto-resume sessions after restart r10; Vibe Kanban #2847 prompt lost on setup failure.
3. **Worktree mess and disk use.** Vibe Kanban [#765](https://github.com/BloopAI/vibe-kanban/issues/765) automatic worktree cleanup r19 c13 (one user at "around 26 GB" in two days; maintainer: "99% of users won't find" a setting, prefers smart defaults); Paradev [#2863](https://github.com/ParadevAI/Paradev/issues/2863) deletion leaves orphaned worktrees r10 ("~26 GB"; also blocks branch deletion); Orca [#14537](https://github.com/stablyai/orca/issues/14537) merged workspaces accumulate; Cline Kanban [#91](https://github.com/cline/kanban/issues/91) reusable worktree slots r6 (creation too slow in monorepos); claude-squad [#260](https://github.com/smtg-ai/claude-squad/issues/260) worktree setup hook for deps, env files, ports r8; worktree location requests (Vibe Kanban #1830 r7, claude-squad #86 r10).
4. **Stale or wrong status.** See D3 (four repos). Emdash's fix was to drop output scraping (#2375); Paradev's was to derive status from host bindings (#3689).
5. **Cost and quota surprises.** Paperclip #339 r16, #544 "consuming enormous amount of token" r5, a "19.8M token runaway" mentioned in #339's thread; OpenHands [#17691](https://github.com/OpenHands/OpenHands/issues/17691) no per-conversation spend bound, cost "only published at termination". Rate limits halt runs (D2).
6. **Merge conflicts and base drift.** Vibe Kanban documents a "Rebase conflicts" task state with agent-assisted resolution; [#1141](https://github.com/BloopAI/vibe-kanban/issues/1141) diffs include base branch changes when base is ahead (c6). Reported less often than the items above; most products hand conflicts to the agent.
7. **Review and notification fatigue.** Orca #4375 notification spam r8, Orca [#24633](https://github.com/stablyai/orca/issues/24633) hide successful automatic approval reviews r2, Paradev #5259, Multica #3246 archive old Done r9, Paperclip #923 ("Inbox gets noisy").
8. **Maintainer bandwidth.** claude-squad [#214](https://github.com/smtg-ai/claude-squad/issues/214) "No more updates?" r16 and [#250](https://github.com/smtg-ai/claude-squad/issues/250) "Project Seems Abandoned" r11 (maintainers: "working full time jobs"); Vibe Kanban #3408.

**Verdict.** Design against these in this order: no account needed for local use; every card and run is durable across restarts and upgrades and never auto-moved by a restart; worktree lifecycle owned by the product (create after setup, cleanup offered at Done and Discarded with a retention default, orphan sweep, location setting); status from events with a stale detector; spend shown live with a per-card cap; conflicts surfaced as a card state with an agent-assisted resolve. Strength: **Strong** for items 1 to 5 (each in 3 or more repos with r10 or more somewhere).

## 4. Features added then removed or reverted, and why

| Product | What was removed | When | Stated reason or evidence |
|---|---|---|---|
| Vibe Kanban | Local "classic" kanban replaced by workspaces UI with board behind login | v0.1.9, early 2026 | Collaboration and sharing ("Collaboration is much easier with the new UI", maintainer in #2687). Backlash r33 c39 |
| Vibe Kanban | Task attempts folded into workspaces plus sessions | Migration dated 2025-12-16 | Schema refactor; docs already said most tasks need one attempt |
| Vibe Kanban | Projects and the kanban board, for everyone including self-hosters | v0.1.44, 2026-04-24, PR #3387 | Company shutdown; "remaining supported capability is exporting data" |
| Emdash | Docker containerization of agent runs | PR #608, 2026-01-13 | "simplify the codebase and focus on the core agent orchestration functionality" |
| Emdash | PTY output classifiers for running and permission state | PR #2375, 2026-06-09 | Rely fully on agent hooks (PR includes a table of which agents have hooks) |
| Emdash | Multi-agent variants and Best-of-N (PRs #247, #362) | Not found in tree at `592281113a` | No removal PR found; #2374 shows users now compare manually. Inference, not confirmed |
| OpenHands | `max_budget_per_task` setting | V1, [#11920](https://github.com/OpenHands/OpenHands/issues/11920) | "not supported in V1"; #17691 now asks to bring a spend bound back |
| AionUi | Linux AppImage builds | 2026 | No reason found; [#1646](https://github.com/iOfficeAI/AionUi/issues/1646) r11 asks to restore |
| agent-deck | v1.4.1 terminal input reader | 2026-04, #539 r11 and #544 r11 | Regression broke arrow keys; fixed and guarded with tests in v1.7.1 |
| Paradev | v1 features lost in v2 (completion indicator, others) | 2026 | v2 rewrite; parity umbrella tracked from a sweep of "~186 tickets" (#3689 thread) |

Pattern (judgment): the two biggest removals (Vibe Kanban's board, OpenHands' budget cap) were both features users had relied on for control, and both drew demand to restore them. Removals that simplified internals (Emdash containers, Emdash output scraping) drew no protest.

## 5. Top 15 most reacted open feature requests across these repos

Counted from each repo's top 40 issues sorted by reactions, open feature requests only, bugs excluded. Requests to support one more agent CLI or git host are grouped into rows 14 and 15 so they do not crowd out design signal.

| # | Request | Link | r | c |
|---|---|---|---|---|
| 1 | Multi-repo workspaces: view diffs of several repos at once | [orca#1099](https://github.com/stablyai/orca/issues/1099) | 99 | 18 |
| 2 | Local LLMs via Ollama | [paperclip#187](https://github.com/paperclipai/paperclip/issues/187) | 81 | 34 |
| 3 | Multiple windows | [orca#6074](https://github.com/stablyai/orca/issues/6074) | 53 | 23 |
| 4 | Jujutsu workspaces | [orca#1082](https://github.com/stablyai/orca/issues/1082) | 49 | 6 |
| 5 | Chat with agents | [paperclip#49](https://github.com/paperclipai/paperclip/issues/49) | 49 | 19 |
| 6 | Embedded VS Code editor | [orca#7754](https://github.com/stablyai/orca/issues/7754) | 48 | 8 |
| 7 | LSP: go to references | [orca#961](https://github.com/stablyai/orca/issues/961) | 43 | 5 |
| 8 | Multi-repo project groups with PR-aware workspaces | [orca#7568](https://github.com/stablyai/orca/issues/7568) | 41 | 4 |
| 9 | Git graph view | [orca#4521](https://github.com/stablyai/orca/issues/4521) | 36 | 10 |
| 10 | Git blame and line annotation | [orca#9948](https://github.com/stablyai/orca/issues/9948) | 32 | 14 |
| 11 | OIDC login | [multica#1014](https://github.com/multica-ai/multica/issues/1014) | 31 | 15 |
| 12 | Chat-based UI | [orca#3099](https://github.com/stablyai/orca/issues/3099) | 29 | 13 |
| 13 | Company knowledge layer (wiki, role context, shared docs) | [paperclip#1858](https://github.com/paperclipai/paperclip/issues/1858) | 27 | 8 |
| 14 | Agent CLI adapters (Copilot CLI, OpenRouter, Antigravity, DeepSeek harness, Z.AI, Kiro) | [paperclip#2092](https://github.com/paperclipai/paperclip/issues/2092) r44, [paperclip#1068](https://github.com/paperclipai/paperclip/issues/1068) r35, [paperclip#6559](https://github.com/paperclipai/paperclip/issues/6559) r34, [orca#14323](https://github.com/stablyai/orca/issues/14323) r32 | 32 to 44 each | |
| 15 | Git hosts and trackers beyond GitHub (self-hosted GitLab, Jira, Gitea, generic task source API) | [vibe-kanban#1697](https://github.com/BloopAI/vibe-kanban/issues/1697) r26, [orca#8376](https://github.com/stablyai/orca/issues/8376) r26, [multica#1634](https://github.com/multica-ai/multica/issues/1634) r25, [orca#4703](https://github.com/stablyai/orca/issues/4703) r21 | 21 to 26 each | |

Next in line: multi-worktree side-by-side view orca#8377 r22, Docker sandboxes for agents orca#13665 r25, workflow orchestration multica#1943 r21, multiple Claude subscriptions orca#11557 r28.

What this says for Control Rod (judgment): multi-repo work (rows 1 and 8, plus Orca #21118 r29, OpenHands #7752 r16, Cline Kanban #448 r5, Kandev #734 closed) is the largest single structural demand and affects the card model, so a card should be able to span more than one repository from the start. Talking to agents (rows 5 and 12) is the largest interaction demand. Editor features (rows 6, 7, 9, 10) mean Orca users treat it as an IDE; Control Rod should link out to the user's editor rather than compete there.

## 6. Reusable code from Apache-2.0 and MIT repos (paths at a commit SHA)

Control Rod is Rust plus TypeScript under Apache-2.0, so Apache-2.0 and MIT code can be vendored with attribution (keep LICENSE and any NOTICE, mark modified files). Each item still needs the normal outside-code vetting before use. Nothing from Kandev, claude-squad, or Multica.

Vibe Kanban, Apache-2.0, tag `v0.1.43-20260417125614` = commit `4c0a6657adb33f3f019af81b36c97e75171553cb` (last version before the board was disabled; Rust, closest to Control Rod's stack):
- `crates/worktree-manager/src/worktree_manager.rs` and `crates/worktree-manager/src/lib.rs`: worktree create and cleanup.
- `crates/git/src/cli.rs`, `crates/git/src/lib.rs`, `crates/git/src/validation.rs`: git operations including rebase and merge.
- `crates/utils/src/approvals.rs`: approval and question request and status types (shown in D5).
- `crates/services/src/services/approvals.rs` and `crates/services/src/services/approvals/executor_approvals.rs`: approval service wiring to executors.
- `crates/services/src/services/queued_message.rs`: queued follow-up messages.
- `crates/services/src/services/diff_stream.rs` and `crates/utils/src/diff.rs`: live diff streaming and diff model.
- `crates/executors/src/executors/claude.rs`, `codex.rs`, `acp/mod.rs`, and `crates/executors/src/logs/`: agent adapters and log normalization for Claude Code, Codex and ACP agents.
- `packages/ui/src/components/KanbanBoard.tsx`, `KanbanCardContent.tsx`, `ChatApprovalCard.tsx`, `CommentCard.tsx`, `StatusDot.tsx`: board and approval UI pieces (React).
- `crates/db/migrations/`: SQLite schema history, useful as a record of what a mature board needed (attempts, merges, PR tracking, follow-up drafts).
- Caveat: crates depend on sibling crates in the workspace, so expect to vendor several together.

Cline Kanban, Apache-2.0, commit `abd4912c27ce6b7f18b5a8106c145fd838e90cc4` (TypeScript):
- `src/commands/hook-events/codex-hook-events.ts`, `hook-utils.ts`, `src/commands/hooks.ts`, `src/terminal/codex-hook-config.ts`: hook based status for agents.
- `src/workspace/task-worktree.ts`, `src/workspace/task-worktree-path.ts`: per card worktree with symlinked ignored folders.
- `src/workspace/turn-checkpoints.ts`: diff since the last message.
- `src/core/task-board-mutations.ts`: column moves and dependency links.
- `web-ui/src/components/board-card.tsx`, `board-column.tsx`, `detail-panels/diff-viewer-panel.tsx`, `dependencies/dependency-overlay.tsx`.
- `.plan/docs/planning-column-research.md` and `.plan/docs/hooks-update/*.md`: design notes on columns, ACP modes, and each agent's hook API (read for ideas; docs text is also Apache-2.0).

Emdash, Apache-2.0, commit `592281113a9d83a2987d8a1715d0fedf854d44c4`:
- `apps/emdash-desktop/src/core/features/conversations/node/reset-stale-acp-agent-statuses.ts` and `reset-stale-tui-agent-statuses.ts`: stale status reset on startup.
- `apps/emdash-desktop/src/core/features/conversations/api/browser/chat/diff-comments-mention.ts`: diff comments into the agent prompt.
- `apps/emdash-desktop/src/core/features/agents/api/browser/use-agent-hooks-status.ts`: hook driven status.

Orca, MIT, commit `6ff6b39e837da842df6977fcfe5e4a560fb0e748`:
- `src/shared/sidebar-list/smart-attention.ts`: ranks which agents need attention (Orca #12577 reuses it for "jump to next").
- `src/renderer/src/attention/agent-attention-contract.ts`, `agent-attention-acknowledgement.ts`, `agent-attention-notification-delivery.ts`: attention states, acknowledgement and notification delivery.
- `docs/site/content/docs/review/annotate-ai-diff.mdx`: the batched review behavior spec.

Paradev, MIT, commit `08cb35c485f7ef40186d50f99bed2e7c8a7e25fb`: `apps/api/src/app/api/cloud-workspaces/[workspaceId]/agent-status/route.ts` (agent status endpoint). Paradev's status fix (#3689, PR #5449) is the more valuable artifact; read the PR before reusing.

Paperclip and OpenHands (MIT) were not mined for components; their value here is the issue evidence.

## 7. Verdict summary

| Decision | Evidence-backed default | Strength |
|---|---|---|
| D1 Create | Title, instruction, repo plus base branch, agent profile, editable branch name; import from issue tracker as second path | Strong (6 products; r18 to r26) |
| D2 Start | Explicit Start; opt-in auto start per column with WIP limits; park on quota and resume; start only after setup succeeds | Strong (7 products manual; 4 repos ship or track limits; r6 to r12) |
| D3 Card while running | State chip with loud Needs you, latest activity, elapsed, tokens plus estimated cost, diff stats; status from events, stale detector | Strong for status (5 products); Moderate for cost |
| D4 Review | Batched line comments into one follow-up run, since-last-turn diff, mark viewed, merge or PR or discard; passage comments on documents; every human gate has its buttons | Strong for code (6 products); Moderate for documents (3) |
| D5 Mid-run | Pending approvals and questions on the card showing exact target; one Needs you queue; explicit Queue or Steer; intermediate permission mode by default | Strong (r49 chat demand; 5 products) |
| D6 Parallel attempts | Retry with another agent, keep history, simple two-up compare; not a default fan-out | Weak for compare; Moderate for retry history |
| D7 Columns | Backlog, Running (Working, Needs you, Stalled), Review, Done, plus Archive and Discarded; server-owned state | Strong (5 products) |
| D8 Failures | No login for local; durable across restarts; product-owned worktree lifecycle; live spend cap; conflict as a state | Strong (each in 3 or more repos) |
