# 03. Agent workbenches: products where AI agents do the work

Competitive due diligence for Control Rod. Slice: products where AI coding agents do the work, with emphasis on products built around a board.

Prepared 2026-11-05. Every factual claim carries a bracketed reference number; the reference list at the end gives the URL and access date for each. All sources were accessed on 2026-11-05. Where a claim rests on a secondary source (aggregator, competitor comparison page, mirrored Reddit snapshot), the text says so. Quotes are short and attributed. Kandev and Claude Squad are AGPL; they are cited as idea sources only, and nothing here copies their code or text beyond short attributed quotes.

---

## 0. Headline: the market is consolidating fast, and the standalone boards are dying

Before the product profiles, the single most important finding for Control Rod's strategy:

| Date | Event | Source |
|---|---|---|
| 2026-01-16 | Terragon shut down; code released as an as-is open source snapshot, no reason given | [17] |
| 2026-02 | Crystal (Stravu) deprecated, replaced by Nimbalyst | [18] |
| 2026-04-10 | bloop, maker of Vibe Kanban, shut down; "the vast majority are free users and we couldn't find a business model that we could get excited about" | [1] |
| 2026-07-09 | OpenAI folded the standalone Codex app into the ChatGPT desktop app as one of three modes (Chat, Work, Codex) | [37] |
| 2026-10-29 | Google announced Jules will wind down on 2026-12-31, read-only after 2026-11-11, with Antigravity as successor | [23] |
| 2026-11-04 | "Conductor is joining Meta"; no new sign-ups, Cloud read-only 2026-11-13 and shut down 2026-11-20, local app winds down early 2027 | [10] |

Interpretation (judgment, not sourced fact): the "nice UI over Claude Code and Codex in worktrees" category has no moat. Free developer users did not pay (Vibe Kanban [1]); model vendors and platforms absorbed the feature (Codex into ChatGPT [37], Jules into Antigravity [23], Claude Code shipped its own Agent View [51]); the best team was acquihired (Conductor [10]). The products surviving with money behind them sell governance and scale to enterprises (Devin [25], Factory [29], GitHub Agent HQ [30], Warp Oz [47]). This is the strongest evidence that Control Rod should not compete as yet another worktree board for hobbyists, and should compete on the thing the dead products never had: provable control.

---

## 1. Product profiles

Each profile covers: core loop; board or task list; review; multi-agent; trust and governance; what users love and hate; design.

### 1.1 Vibe Kanban (BloopAI)

**Status.** Company shut down 2026-04-10. The post says "Thousands of software engineers use Vibe Kanban every day," most on free plans, and the team "couldn't find a business model that we could get excited about" [1]. Remote services (kanban issues, comments, projects, organisations) ran 30 more days and were then removed; the product became fully local; a data export shipped; refunds issued for invoices paid in the prior 30 days; local workspaces keep working; the project continues as community maintained open source [1]. The README banner reads "Vibe Kanban is sunsetting." The repo shows 28.6k stars, Apache-2.0 [2].

**Why it died (synthesis).** The stated reason is monetization of a free user base [1]. The launch thread hints at a second reason: advanced users "struggle to find a compelling reason" to use it (helsinki) and doubted that "Kanban is the right UI" (jjangkke) [3]. A trust misstep at launch also cost goodwill: users objected that it was "harvesting email addresses and github usernames" (gpm) and that "The permissions this asks for feel kinda insane" (doritosfan84); the team then changed course, which commenters credited [3].

**Core loop.** Plan work as kanban issues, start a workspace when ready (a branch, a terminal, and a dev server per workspace), review diffs, leave inline comments and send feedback to the agent, then open a PR with an AI-written description or merge locally [2][4]. You choose agent, model, effort level, and plan mode per workspace [4]. Larger features split into sub-issues with progress tracked across them [4].

**Board.** Issues appear as cards; columns are not specified in current docs [4]. Supports 10+ agents including Claude Code, Codex, Gemini CLI, Copilot, Amp, Cursor, OpenCode, Droid, Qwen Code [2].

**Review.** Diff review with inline comments sent back to the agent; built-in browser preview with devtools, inspect mode and device emulation [2].

**Trust.** A third-party skill listing (secondary) says it runs agents with skip-permissions or yolo flags by default and that worktree isolation does not stop system-level actions [58]. No approvals feature in the README [2].

**Users.** Love: "it's slick" (akifq), "same increase in productivity increase from when I first used Cursor" (lharries), "game changer" (broast) [3]. Hate: review load, "if we can review 10 PRs a day and AI writes one of them, we now have to review 11" (sexeriy237); "still sitting around waiting for Claude to merge conflicts" and "spent tens of thousands on Opus tokens" (helsinki); laptop slows after "4 concurrent runs" (louiskw, a maintainer); tasks "often need to be dependent on each other" with no flow for that (lharries); keyboard shortcuts requested (peadarohaodha) [3].

**Design.** Praised as slick [3]; the launch reaction questioned the kanban metaphor more than the visuals [3].

### 1.2 Kandev (kdlbs) (AGPL, idea source only)

**Core loop.** Define tasks, assign agents from any provider, run several in parallel, review before deciding what ships; "Humans stay in control" [5]. The launch post says agents use your existing CLI subscriptions, so no double billing [6].

**Board.** Kanban with drag-and-drop columns, workflow automation, and a pipeline view [5]. The author describes "a workflow engine with typed states and approval gates between transitions" [6].

**Review.** Integrated workspace with editor, file tree, terminal, browser preview, git changes panel; review dialog grouped per repository for multi-repo tasks [5]; GitHub PR review with inline comments [6].

**Multi-agent.** Agentic workflows assign different agents per step, for example one plans, one implements, one reviews, with review gates between steps; sub-tasks resume from a parent session [5]. Mix agents per card [6].

**Trust.** Executors: local process, Docker, Kubernetes, SSH, or Sprites cloud; private executor ownership on shared instances; experimental Office mode with agent roles and permissions; "no telemetry" [5]. No audit log described [5].

**Users.** A commenter praised typed states and approval gates because many orchestration projects "favor autonomy over human oversight" (Agreeable_Care4440); another worried the layer becomes "managing a team of interns" (FeatureFar8819); Windows is rougher by the author's own admission [6] (mirrored Reddit snapshot, secondary).

### 1.3 Cline Kanban

**Status.** Launched 2026-03-26, free, open source, no account [9]; docs call it a research preview [62].

**Why built.** "Every time you alt-tab to check on an agent, you pay a tax"; "the overhead of babysitting them is slowing us down"; "20 open terminals" [8].

**Core loop.** Add cards by hand, or ask a sidebar chat agent to break work into cards, link them, and start them. Press play on a card to create an ephemeral worktree (gitignored files like node_modules symlinked in) and an agent terminal. Review, then Commit (merge into base) or Open PR; the agent resolves conflicts if base moved. Trash removes the worktree; a resume ID lets you pick it up later [7].

**Board.** Each card shows the agent's latest message or tool call [7]; at a glance you see running, done, or blocked [8].

**Review.** Opening a card shows the agent TUI plus a diff against base; checkpoints let you view diffs for specific message ranges; click any diff line to leave an inline comment that goes back to the agent [7].

**Multi-agent.** Cmd or Ctrl click links cards; when a linked card finishes and moves to trash, the next starts automatically; combined with auto-commit this enables autonomous chains [7]. Linear ticket import [9]. Agent agnostic (Cline, Claude Code, Codex, OpenCode) [8][62].

**Trust.** No approval step documented; shipping is a human click [7].

**Design.** No independent design praise found. TestingCatalog coverage is marked sponsored [9].

### 1.4 Conductor (Melty Labs, YC)

**Status.** Joining Meta, announced with a timeline starting 2026-11-04; new users cannot sign up or download; Cloud read-only 2026-11-13, shut down and deletion begins 2026-11-20; local app gets model updates and critical fixes until early 2027 then winds down; refunds for active subscribers; "Transfer to local" for cloud workspaces [10]. Competitors are already pitching its users [13] (Traycer page, competitor framing).

**Core loop.** A workspace is "an isolated copy of your project, backed by Git, for one task or pull request," with its own branch, working tree, setup and run context; setup scripts install dependencies and copy untracked files like .env; run scripts get a CONDUCTOR_PORT so workspaces run side by side; context goes in via mentions, attachments, or a .context folder [11]. Plan Mode for ambiguous issues: approve the plan or give feedback [11].

**Board.** A sidebar list of workspaces, not a kanban; "See at a glance what they're working on" [12]. Archive after merge; restore from History [11].

**Review (best in class among local apps).** Diff Viewer (Cmd Shift D), comment on changed lines and send to the agent, revert files you do not want [11]. The Checks tab gathers git status, PR metadata, CI, deployments, GitHub review comments, and todos, and the docs say to treat unresolved comments, failing checks, and open todos as blockers; merge only after approval, passing checks, handled comments, and completed todos [11]. Create PR has the agent draft the description [11].

**Multi-agent.** Claude Code, Codex, and Cursor agents in parallel [12]; multiple agents in one workspace when they should share code state [11].

**Trust.** Worktree isolation only; no sandbox, approvals, or audit documented in what was read [11].

**Design.** Its own testimonials include "beautiful UI and handles all the git worktree stuff" (promotional) [63]; independent profiles describe it as polished and practical [63] (secondary). The mood among practitioners was that Conductor set the bar for a calm, native feeling Mac app. That is judgment, supported weakly by sources.

### 1.5 Claude Squad (smtg-ai) (AGPL, idea source only)

**Core loop.** A terminal UI: tmux session per agent, git worktree per session; `n` new session, `N` with prompt, Enter to attach and reprompt, Ctrl q to detach, Tab between preview and diff, `c` commits and pauses, `r` resumes, `s` commits and pushes [14]. Experimental `--autoyes` auto-accepts prompts [14]. 8.7k stars [14].

**Take.** The pause-and-resume verb (commit work, free the session, resume later) and the two-pane preview or diff toggle are the ideas worth noting [14].

### 1.6 Sculptor (Imbue)

**Core loop.** Each Claude Code agent runs in its own Docker container; Pairing Mode syncs the agent's container bidirectionally with your local IDE so you can test and edit with it in real time [15][16]. Merge assistance detects conflicts and hands them back to the agent; sessions save and restore; Suggestions (beta) does AI review before merge [16].

**Status.** Active as of June 2026, docs for v0.30, free beta, pricing unpublished, repo holds docs and issues only, modest traction (172 stars) [16].

**Users.** Love: "Like claude code with task parallelism and history built in, all with a clean UI" (lrobinovitch); lets Claude Code "go rogue" safely (millanjp); UI "very transparent and understandable even for someone without a coding background" (mangonomnom) [15]. Hate: containers "very heavy for a dev laptop" (_1tem); idle backend CPU and memory (bni); what happens after the free beta (rsyring); looks nearly identical to Terragon (kveykva, sawyerjhood) [15]. Containers take about a minute for the first agent [16].

**Design.** Praised as clean and transparent, including for non-coders [15].

### 1.7 Terragon

**Status.** Shut down; snapshot notice dated 2026-01-16, code "provided as-is" [17]. Reason not given [17]; a secondary source speculates model vendors' own background agents squeezed it [64].

**What it did.** Each agent in an isolated sandbox container with its own repo copy; status and progress streamed to the browser live; work checkpointed and pushed with AI-written commits and PRs; recurring and event-triggered automations [17].

### 1.8 Crystal, now Nimbalyst (Stravu)

**Status.** Crystal deprecated February 2026, final release 0.3.5 on 2026-02-26; Nimbalyst is the MIT successor [18].

**Core loop and board.** Every agent session appears on a session kanban; search and resume sessions; link sessions to the files they touched [19]. Parallel agents in worktrees; Codex and Claude Code supported, others in alpha [19].

**Review.** Red and green diffs rendered in the document; step through each edit and accept or reject it [19].

**Mobile (notable).** iOS app shows which agents need you and which are working; reply by text or voice; swipe through and approve diffs; queue the next task; push notifications when an agent waits [19].

### 1.9 Emdash (YC W26)

**Core loop.** Add Task creates one or more worktrees, each running an agent; review the diff, iterate, open a PR [20]. Diff view lets you review changes across agents side by side; CI checks from GitHub Actions shown in app; tasks pulled from Linear, Jira, GitHub, Notion, Asana; remote machines over SSH with tmux sessions that survive reconnects [20]. Local SQLite state and no code sent to Emdash servers per secondary listings; MIT [21].

### 1.10 Orca (Stably AI)

**Core loop.** Desktop ADE, MIT [22]. A coordinator agent splits a large task, starts worker agents in their own workspaces, and returns their results [22]. Fan one prompt across several agents in worktrees and merge the winner (secondary summary of README) [65]. Chat UI or raw CLI per agent, switchable without losing context; run on a remote Orca server, SSH host, or per-workspace cloud VM, so agents keep running when the laptop sleeps [22].

**Review.** Leave notes on changed lines and send them to the agent; send failing checks or PR review comments back to an agent to fix [22]. Design mode: click any element in Orca's browser to copy its HTML, styles, and selector into the agent chat [22].

**Mobile.** iOS and Android companion; pinged when an agent needs input [22]. Usage tracking across accounts [22].

**Traction.** README showed about 116.7k stars on 2026-11-05 [22]; secondary sources disagree widely (15.5k to 111k) [65], so treat as unverified.

### 1.11 Devin (Cognition)

**Core loop.** Start a session; Devin plans and works in its own VM; follow live and take over; scheduled sessions and playbooks [66] (secondary). The Progress tab shows the session's task list as a live drawer; clicking a task filters the activity stream to that task's work (2026-10-28) [25].

**Multi-agent.** Managed Devins (March 2026): a coordinator scopes the work, launches child sessions each in its own VM with their own prompts, playbooks, tags, and ACU limits, monitors compute, pauses or stops them, resolves conflicts, and compiles results; it reads the children's full trajectories to improve the next breakdown [26]. Child sessions start with a summary of their parent as a removable chip (2026-09-25) [25].

**Review.** Devin Review groups logically connected changes, orders hunks, explains each, flags bugs by confidence (red probable bugs, yellow warnings, gray FYI), detects copied and moved code, scans security, syncs GitHub comments [27]. "Suggest change" on selected diff lines (2026-10-23) [25].

**Trust and governance.** Enterprise budgets in a hierarchy with granular permission to manage them (2026-10-30); PATs require admin approval by default for enterprises without a policy (2026-10-30); sessions can propose edits to shared skills that an admin approves (2026-10-19); network policy edits apply to already-running automation sessions (2026-11-02); audit log API (2026-09-18) [25]. "ACUs per merged PR" metric (2026-10-07) [25].

**Users.** Cost unpredictability is the recurring complaint: secondary pricing reviews say "There is no reliable pre-flight estimate for how many ACUs a task will take" and that the $20 entry price "is the floor, not the ceiling" [28] (secondary, possibly affiliate driven).

**Design.** Devin Desktop (rebranded from Windsurf, June 2026) as a multi-agent hub per trackers [66] (secondary).

### 1.12 Factory (Droids, Missions)

**Core loop.** Run `/enter-mission`, describe the goal, Droid asks clarifying questions and refines the plan with you; planning is "where most of the value comes from"; approve the plan, then Mission Control executes [29]. The page is dated 2026-02-26 in the HN listing but shows 2025 on the page while naming 2026 models (Opus 4.6, GPT-5.3-Codex), so 2026 is likely correct [29][67].

**Multi-agent.** Orchestrator splits into milestones and creates follow-up work when validation finds issues; workers get a fresh session per feature; validators review accumulated work, run tests, lint, and build, and can click through the app with computer use; each role can use a different model [29].

**Human role.** "Project manager in Mission Control": monitor, unblock stuck workers, redirect [29].

**Trust (strongest stated posture in the set).** Commands classified by risk level; Droid Shield scans for secrets before data reaches a model; hooks for custom security; every action logged with OpenTelemetry; cloud, hybrid, or fully airgapped deployment; org-level model and tool policies, SSO/SCIM, RBAC, audit logging; SOC 2 Type II, ISO 27001, ISO 42001 claimed [29]. $150M Series C in April 2026 at a reported $1.5B post-money (secondary) [59].

### 1.13 OpenAI Codex (cloud, and the app now inside ChatGPT)

**Status.** The Codex desktop app merged into the ChatGPT desktop app on 2026-07-09; Codex mode gained inline diff editing, PR review in a side panel, faster computer use, and multiple repositories per project [37].

**Core loop.** Every thread is a workspace with its own git worktree; worktrees are cleaned when threads close, and a guide warns they pile up if you leave threads open [38]. Agents run in a sandbox with bounded file and network access and the app "asks before escalating" [38]. Scheduled tasks and goal-directed runs went GA in May 2026; cloud tasks share the same five-hour usage window as local work [38].

**Parallel attempts.** `codex cloud exec --attempts` runs 2 to 4 independent attempts for one prompt; compare with `codex cloud diff` and apply one with `codex cloud apply` (secondary) [39].

**Users.** Love: "OpenAI's most convincing developer product to date" with "a polished review queue" [40] (secondary). Hate: Electron, about 8GB RAM reported [40]; Work and Codex modes "sometimes look identical" after the merge; folders created in ~/Documents; worktrees accumulate; a changed macOS bundle ID broke MDM policies [38]; one developer called the merge "a generational fumble" [68] (secondary).

### 1.14 Google Jules (winding down)

**Status.** Turndown entry 2026-10-29: winds down 2026-12-31, sessions can be finished until 2026-11-11, then read-only; code, branches and PRs stay in GitHub; export via Jules Tools CLI; Antigravity is the successor [23][24].

**Ideas it shipped first** [23]: Interactive Plan (clarifying questions before planning) and Critic Agent reviewing changes before completion (2025-08-08); responds to PR comments (2025-09-23); scheduled tasks (2025-12-10); Planning Critic, a second agent that reviews plans running without human approval, claimed 9.5% fewer task failures (2026-01-26); CI Fixer for failing Actions on its own PRs and commit authorship modes (Jules only, co-authored, user only) (2026-02-19).

### 1.15 Google Antigravity Agent Manager

Inbox of agent conversations with status, produced Artifacts (task lists, implementation plans, screenshots, browser recordings), and pending review requests; comment on Artifacts while the agent keeps working; review policy per agent: Always Proceed, Agent Decides, or Request Review [52] (codelab plus secondary blogs).

### 1.16 Cursor (cloud agents, Agents Window)

**Core loop.** Cursor 3 (2026-04-02) added an Agents Window: a sidebar of agents running locally or in the cloud, including ones started from Slack, GitHub, Linear, mobile and web; agent chats as tabs in a grid; sessions move between local and cloud both ways; word-level diffs, stage commits, open PRs; cloud agents produce demos and screenshots to review before pulling changes local; Design Mode sends a selected element's HTML, CSS, and bounding box to the agent [42]. Best-of-N runs via a slash command with each run in its own worktree (secondary) [69].

**Recent.** Remote control of local agents from iOS (2026-10-06); app marketplace for code review, security, and CI apps in agent workflows (2026-10-13); cloud agent canvases (2026-10-16); Agent SDK where an agent is "a folder of code" tested with evals (2026-10-20); cloud agents build and host live apps, with admins able to approve publishes a security review blocked (2026-11-05) [41]. Dev environments with audit logs for cloud agents in May 2026 (secondary) [69].

**Users.** Reports of Composer 2 token use about 10 times normal, heavy RAM, setup failures, and Pro users spending $40 to $50 per month after overages; agents reportedly hang when the window loses focus [42].

### 1.17 GitHub Copilot cloud agent, Agent HQ, Mission Control

**Core loop.** Start a session from Copilot home, an issue, a PR, the dashboard, or the repo Agents tab; Copilot works in a cloud environment on a branch, runs tests and linters, and you can ask for refinements before it opens a PR; automations trigger tasks on schedules or events [34]. Mission Control: assign, steer, and track agents across GitHub, VS Code, mobile, and CLI [30]; steer a running task via chat or a comment in Files changed and the agent adapts after its current tool call [31]. Agents tab per repo (2026-01-26) with session history, archiving, redesigned logs that group tool calls, show bash commands and expandable diffs, and "Continue in Copilot CLI" [32]. Logs show setup steps and collapse subagent activity behind a heads-up display (2026-03-19) [33]. Renamed Copilot cloud agent in April 2026 (secondary) [36]; current docs use that name [35].

**Multi-agent.** Agent HQ hosts agents from Anthropic, OpenAI, Google, Cognition, and xAI under a paid Copilot subscription [30]. Agent Merge watches a PR and addresses the blockers you select [34].

**Governance (the strongest separation of duties in the market).** Only users with write access can trigger it; comments from others are not passed to the agent; it can push to only one branch and obeys branch protection and required checks; workflows do not run on its code until a write-access human approves; **the user who asked for the PR cannot approve it**; commits are authored by Copilot with the requester as co-author and are signed; internet access is firewalled [35]. Control plane lets admins set policies, enable audit logging, choose allowed agents and models, and view metrics [30]. Limits: one branch and one PR per task; Actions sessions max 59 minutes; GitHub-hosted repos only [34].

**Users.** Startup times over 90 seconds and agents stopping early (secondary, unverified) [36]; cloud agent "often fails to complete tasks or push PRs" unless instructions are precise (Reddit quote via a secondary review) [36].

### 1.18 Linear for Agents

**Core loop.** Assign an issue to an agent or @mention it; assignment sets the agent as delegate while the human stays accountable [43][44]. An agent session is created on mention or delegation and reports states: waiting for input, actively working, completed, errored; agents emit thoughts, tool calls, clarification prompts, responses, or errors; follow ups allowed for 30 minutes before the session is stale [44]. Filter views by Delegate; Insights measures work handled by agents [43].

**Governance.** Admins choose which teams an agent can access; agents "cannot sign in to the app, access admin functionality or manage users"; workspace and team guidance in markdown with full history, team guidance taking priority [43]. No dedicated audit log described [43].

**Design.** Linear is the design benchmark of the work-tracker category; the agent session lives inside the issue rather than in a new surface [43]. (Praise for Linear's visual quality is widely held; no single source was fetched for it here, so treat as judgment.)

### 1.19 OpenHands (Agent Canvas)

The main repo now centers on Agent Canvas, "The self-hosted developer control center for coding agents and automations"; it connects to local, Docker, VM, and cloud backends and runs OpenHands or third-party agents (Claude Code, Codex, Gemini CLI, OpenCode, any ACP agent); automations for Slack, GitHub, Linear, Notion, Datadog; MIT; 92.7k stars [45]. Optional per-conversation Docker sandboxes, loopback-only binding by default, and explicit warnings that unsandboxed installs give full filesystem access [45]. Enterprise fleet dashboard with status and cost per secondary listings [70].

### 1.20 Warp (Oz)

Oz launched 2026-02-10 as a cloud platform to launch agents interactively or programmatically, run hundreds in parallel, and schedule recurring workflows, with a self-hosted enterprise option [46]. Multi-harness (2026-05-19): Claude Code, Codex, and Warp Agent from one control plane, "a single pane of glass," progress across subagents auto-tracked, per-team billing and individual credit caps, "consistent governance, access control, and audit logs" across harnesses, least-privilege per-agent permissions, self-hosting in Kubernetes or existing remote dev environments [47].

### 1.21 Amp

2026 changelog [48]: agents you watch and drive from web, CLI, and mobile (06-04); review and stage diffs in Amp (06-16); agents spawn and message other agents across threads (07-17); agents set their own schedules (07-21); multiplayer orbs (07-22); "Explain Usage: Ask Puck where your tokens went" (08-21); intelligently ordered diffs, "Put the files that explain a change first" (09-01); runners that create worktrees (09-22); artifacts co-edited by people and agent (11-02); service accounts for team-owned threads (11-03). Public threads ended 06-02 [48]. A secondary evaluation flags product churn as stated policy (extensions switched off 2026-03-05) [71].

### 1.22 AWS Kiro (autonomous agent)

Toggle Autonomous, describe a goal, Kiro plans and works without step approvals; or hand off from a GitHub issue via a `kiro` label; each task in an isolated cloud sandbox with configurable network, env vars, secrets, MCP per sandbox; runs tests, uses a browser to verify, watches CI after opening a PR; **never merges automatically**; when it needs you the task moves to "Needs attention"; Spec mode instead approves requirements, design, and plan before execution; one session spans GitHub and GitLab repos; learns from reviewer comments and steering files [49]. Governance gaps it states itself: cloud sessions only in us-east-1, MCP and other governance controls not yet supported, admins must opt in under IAM Identity Center [49].

### 1.23 Paperclip

"Open-source orchestration for teams of AI agents"; "If OpenClaw is an employee, Paperclip is the company" [50]. Ticket-style tasks with a single assignee and execution locks; agents wake on assignments or heartbeats; company, agent, and project budgets with threshold alerts and hard stops; board approval workflows, review stages, hire approvals; "Approval gates are enforced, config changes are revisioned, and bad changes can be rolled back safely"; mutating actions, heartbeats, cost events, approvals, and comments recorded as durable activity; MIT; about 111k stars shown [50] (star count unverified).

### 1.24 Claude Code Agent View (Anthropic, first party)

Shipped in Claude Code 2.1.139 on 2026-05-11 as research preview: `claude agents` replaces the terminal with a table of every background session on the machine plus a prompt box; `/bg` and `claude --bg`; sessions under a per-user supervisor survive terminal close; any background session that writes files is moved to its own worktree [51] (secondary). Relevance: the agent Control Rod runs now ships its own list view, so a plain list is no differentiator.

### 1.25 Other 2026 entrants noted

Paradev (formerly Superset), whose docs say worktrees "do not sandbox processes or prevent merge conflicts" [53] (secondary); Traycer, T3 Code, Paseo, Pane, Agentastic, Superconductor, Replicas, AOSplane are pitching Conductor's orphaned users [13] (competitor page). Not profiled further.

---

## 2. Cross-market comparison

| Capability | Who does it best | Notes |
|---|---|---|
| Card shows live status | Cline (latest message or tool call on card) [7]; Linear (typed session states) [44] | Nobody documents cost, elapsed time, or diff size on the card itself |
| Waiting on you signal | Kiro "Needs attention" [49]; Linear "waiting for input" [44]; Nimbalyst and Orca push notifications [19][22] | Rarely a board column |
| Parallel attempts, compare | Codex cloud attempts 2 to 4 [39]; Cursor best-of-n [69]; Emdash side-by-side diffs [20] | Comparison is still manual diff reading |
| Inline review comment to agent | Cline [7], Conductor [11], Orca [22], Vibe Kanban [2] | Now table stakes |
| Merge readiness gate | Conductor Checks tab treats comments, failing checks, todos as blockers [11] | Advisory only, not enforced |
| Dependency chains | Cline linked cards auto-start [7]; Paperclip hierarchy [50] | |
| Planning agent splits work | Factory Missions [29]; Devin managed Devins [26]; Orca coordinator [22]; Cline sidebar agent [7] | |
| Agent reviews agent | Jules Critic and Planning Critic [23]; Factory validators [29]; Kandev review step [5]; Devin Review [27] | |
| Separation of duties | GitHub: requester cannot approve, workflows need human approval [35] | Unique in the market |
| Budgets and hard stops | Paperclip [50]; Devin budget hierarchy [25]; Warp credit caps [47] | |
| Sandbox | Factory airgapped option [29]; Kiro, Copilot, Devin cloud VMs [49][35][26]; Sculptor containers [16] | Local apps mostly rely on worktrees, which isolate files only [53] |
| Audit | Factory OTel audit [29]; Devin audit API [25]; GitHub audit logging [30]; Paperclip durable activity [50]; Warp audit across harnesses [47] | None offer signed, tamper-evident, offline-verifiable evidence |

---

## 3. Synthesis for Control Rod

### (a) Six struggles still unsolved that Control Rod's governance strengths could solve

1. **Review fatigue and rubber-stamping.** Users describe "reviewing a tsunami of pretty good code" (mrothroc) [72], "Review fatigue is real, and you just cannot own the code you didn't write" (oytis) [73], and the failure mode where "you start clicking Approve on autopilot and stop reading the diffs" (laurencoral) [74]. Pydantic's widely discussed essay (318 points) calls this "the fatigue of supervision" [54][55]. Every product adds AI review; none proves that a human actually reviewed. Control Rod's passkey-signed decision can bind a signature to the exact diff hash, the evidence the reviewer was shown, and the time spent, turning "approved" into an auditable act rather than a click.

2. **Accountability for code nobody wrote.** "Human on the hook" rather than in the loop (roomey); "I don't like being personally accountable for code I didn't write" (bluefirebrand) [55]. Linear separates delegate from accountable human [44] and GitHub blocks self-approval [35], but nobody produces a record a regulator or QA lead can rely on. Control Rod's append-only evidence trail plus attestation is exactly this record.

3. **Isolation that is real, not just worktrees.** Worktrees "do not sandbox processes" [53]; Vibe Kanban reportedly runs agents in skip-permissions mode by default [58]. The strong sandboxes live in vendor clouds (Kiro us-east-1 only [49], Copilot GitHub-only [34]), which regulated firms often cannot use. A local OS sandbox with an attestation is rare and is the precise need of nuclear and EPC firms that cannot send code to a vendor cloud.

4. **Cost surprises and runaway spend.** "There is no reliable pre-flight estimate" for Devin ACUs [28]; Cursor users report 10x token burn [42]; "tens of thousands on Opus tokens" [3]. Budgets exist in Paperclip, Devin, Warp [50][25][47], but not a per-card budget enforced by a policy kernel before the run starts. Control Rod's kernel can price and cap a card before dispatch and stop it at the limit.

5. **Babysitting and the attention tax.** "Every time you alt-tab to check on an agent, you pay a tax" [8]; users top out at "two workstreams (at most)" (carimura) or struggle to "keep up with 3-5 conversations" (user43928) [55]. The fix is not more panes; it is a queue of decisions that need a human, ranked, with everything else hidden. Control Rod's policy kernel knows which actions require a human and can build that queue.

6. **Trust in the vendor itself.** Four tools in this slice died or were absorbed in ten months, three of them with data deletion deadlines [1][10][17][23]. Vibe Kanban's launch was hurt by telemetry and permission scope [3]. A local-first product whose evidence trail is the customer's own durable record answers "what happens to our records if you disappear" in a way none of the SaaS boards can.

### (b) Patterns worth taking, ranked

| Rank | Pattern | Best at it | Why for Control Rod |
|---|---|---|---|
| 1 | Requester cannot approve their own agent's work; workflows wait for human approval | GitHub Copilot [35] | Separation of duties is the core NQA-1 style control; make it a kernel rule and show it on the card |
| 2 | Merge readiness panel that lists every blocker (comments, checks, todos, approval) | Conductor Checks tab [11] | Make it enforced, not advisory, and sign the "all clear" |
| 3 | Inline diff comment goes straight back to the agent as a follow-up run on the same card | Cline [7], Orca [22], Conductor [11] | Table stakes; each comment becomes an evidence entry |
| 4 | Card shows the agent's latest action live | Cline [7] | Fixes "read only and confusing"; add elapsed time, spend, diff size, policy state |
| 5 | Typed session states with an explicit waiting for input state | Linear [44], Kiro "Needs attention" [49] | Make "Needs you" a first-class column, sorted by urgency |
| 6 | Delegate versus accountable owner as two fields | Linear [43][44] | Matches regulated practice: the responsible engineer of record stays human |
| 7 | Plan first, approve plan, then execute, with clarifying questions | Factory Missions [29], Jules Interactive Plan [23], Kiro Spec mode [49] | Plan approval is a natural signed hold point |
| 8 | Agent reviews agent before a human sees it (critic, validator) | Jules Critic and Planning Critic [23], Factory validators [29], Devin Review [27] | Record the critic's verdict in evidence; never let it replace the human signature |
| 9 | Review that groups and orders hunks and explains each, bugs labeled by confidence | Devin Review [27], Amp ordered diffs [48] | Directly reduces review fatigue |
| 10 | Per-card and per-project budgets with warnings and hard stops | Paperclip [50], Devin hierarchy [25], Warp caps [47] | Kernel-enforced pre-dispatch |
| 11 | Coordinator splits a goal into child cards with their own limits and reads their trajectories | Devin managed Devins [26], Orca coordinator [22] | Child cards inherit policy and evidence linkage |
| 12 | Linked cards that auto-start the next when one completes | Cline [7] | Only after the predecessor's signed acceptance |
| 13 | Parallel attempts with side-by-side comparison and pick the winner | Codex cloud attempts [39], Emdash [20], Cursor best-of-n [69] | Record why the winner was chosen |
| 14 | Mobile approval queue with push when an agent waits; approve diffs by swipe | Nimbalyst [19], Orca [22], Cursor iOS [41] | Passkeys make phone approval secure; strong demo |
| 15 | Setup and run scripts per workspace with a port variable for side-by-side previews | Conductor [11] | Removes the "my env does not work" failure |
| 16 | Checkpoints that show diffs for a message range | Cline [7] | Helps reviewers see what changed after their comment |
| 17 | Session log that groups tool calls, shows commands, collapses subagents | GitHub Agents tab [32][33] | Template for a readable evidence view |
| 18 | Commit authorship and co-author trailers that identify agent and requester, signed commits | GitHub [35], Jules authorship modes [23] | Tie commits to evidence IDs |
| 19 | Pause and resume a card by committing and freeing the session | Claude Squad [14] (idea only) | Cheap way to manage many cards |
| 20 | Live policy updates reaching already running sessions | Devin network policy [25] | A kernel change should apply mid-run and be logged |
| 21 | Explain where the tokens went | Amp "Explain Usage" [48] | Cost transparency per card |
| 22 | Design mode: click a UI element to send it to the agent | Cursor [42], Orca [22] | Lower priority for regulated users |
| 23 | Data export and "transfer to local" as a first-class feature | Vibe Kanban [1], Conductor [10] | Turn every competitor shutdown into a migration path |

### (c) Anti-patterns

1. **Free hobbyist board with no paying buyer.** Vibe Kanban had thousands of daily users and still shut down [1].
2. **Thin wrapper on a model vendor's agent.** Vendors ship the feature themselves: Claude Code Agent View [51], Codex inside ChatGPT [37], Jules folded into Antigravity [23].
3. **Telemetry or broad permissions by default.** It nearly sank Vibe Kanban's launch [3].
4. **Yolo by default, worktree as the only isolation.** [58][53]
5. **AI reviewer standing in for the human.** Critics help [23], but a human signature must remain mandatory for acceptance.
6. **Pane sprawl.** Grids of agent tabs [42] recreate the "20 open terminals" problem [8].
7. **Heavy runtimes.** Electron at 8GB [40], idle CPU in Sculptor [15], containers that take a minute [16]; Control Rod's sandbox must start fast.
8. **Unpredictable billing.** ACUs with no pre-flight estimate [28].
9. **Product churn as policy and cloud data deadlines.** Amp switched off extensions [71]; Conductor and Jules set deletion dates [10][23]. Regulated buyers punish this.
10. **Advisory gates.** Conductor tells you to treat blockers as blockers [11]; nothing enforces it.

### (d) The white space Control Rod could own

Every agent workbench in this market answers "how do I run more agents at once"; none answers "how do I prove what my agents did, who accepted it, and that the rules were followed." The standalone boards that only solved parallelism are dead, sold, or absorbed (Vibe Kanban, Terragon, Crystal, Conductor, Jules, the Codex app), while the survivors that make money sell control to enterprises, and even they stop at cloud audit logs and advisory checklists. Control Rod can own the board where every card is a governed unit of work: dispatched only if the policy kernel allows it, priced and capped before it runs, executed in a local attested sandbox, reviewed with grouped and explained diffs, and closed only by a passkey-signed human decision that cannot be self-approved, all landing in an append-only evidence trail the customer keeps forever, even if Control Rod disappears. For general developers that reads as "the calm board that tells you what needs you and never surprises you on cost"; for nuclear and EPC firms it reads as the first multi-agent workbench that can sit inside a quality program. That pairing of a beautiful decision queue with proof is unclaimed.

---

## 4. References

All accessed 2026-11-05.

1. bloop, "Goodbye bloop," https://www.vibekanban.com/blog/shutdown
2. BloopAI, vibe-kanban README, https://github.com/BloopAI/vibe-kanban
3. Hacker News, "Show HN: Vibe Kanban, Kanban board to manage your AI coding agents" (2025-07-11), https://news.ycombinator.com/item?id=44533004
4. Vibe Kanban docs, Getting started, https://vibekanban.com/docs/getting-started
5. kdlbs, Kandev README (AGPL-3.0), https://raw.githubusercontent.com/kdlbs/kandev/HEAD/README.md
6. r/SideProject Kandev launch post, mirrored snapshot (secondary), https://reddit.sentinel-team.org/posts/1thyq22/snapshots/2026-05-20T00%3A16%3A29.879841Z
7. Cline docs, Kanban core workflow, https://docs.cline.bot/kanban/core-workflow
8. Cline blog, "Announcing Kanban" (2026-03-26), https://cline.bot/blog/announcing-kanban
9. TestingCatalog, "Cline debuts Kanban for local parallel CLI coding agents" (2026-03-26, sponsored), https://www.testingcatalog.com/cline-debuts-kanban-for-local-parallel-cli-coding-agents/
10. Conductor, "Conductor is joining Meta," https://www.conductor.build/announcement
11. Conductor documentation, full text, https://www.conductor.build/llms-full.txt
12. Conductor homepage, https://www.conductor.build
13. Traycer (competitor), "Best Conductor alternatives (2026)," https://traycer.ai/compare/conductor-alternatives
14. smtg-ai, claude-squad README (AGPL-3.0), https://github.com/smtg-ai/claude-squad
15. Hacker News, "Show HN: Sculptor, a UI for Claude Code," mirror, https://hn.svelte.dev/item/45427697
16. Ry Walker Research, Sculptor (June 2026), https://rywalker.com/research/sculptor
17. Terragon OSS snapshot README, https://github.com/terragon-labs/terragon-oss
18. Stravu, crystal README (deprecation notice), https://github.com/stravu/crystal
19. Nimbalyst README, https://github.com/nimbalyst/nimbalyst
20. Emdash docs, https://emdash.com/docs
21. Y Combinator, Emdash company page, https://www.ycombinator.com/companies/emdash
22. Stably AI, Orca README, https://github.com/stablyai/orca
23. Jules changelog (Turndown entry 2026-10-29 and earlier), https://jules.google/docs/changelog/
24. TechRadar, "Google kills off Jules," https://techradar.com/pro/google-kills-off-jules-its-ai-coding-agent-which-promised-to-do-all-the-jobs-you-didnt-want-to
25. Devin release notes, https://docs.devin.ai/release-notes/overview
26. Cognition, "Devin can now Manage Devins," https://cognition.com/blog/devin-can-now-manage-devins
27. Devin docs, Devin Review, https://docs.devin.ai/work-with-devin/devin-review ; Cognition blog, https://cognition.ai/blog/devin-review
28. Carly, "Devin Pricing 2026" (secondary), https://www.usecarly.com/blog/devin-pricing
29. Factory, "Missions," https://factory.com/news/missions
30. GitHub blog, "Welcome home, agents" (2025-10-28), https://github.blog/news-insights/company-news/welcome-home-agents/
31. GitHub changelog, "A mission control to assign, steer, and track Copilot coding agent tasks," https://github.blog/changelog/2025-10-28-a-mission-control-to-assign-steer-and-track-copilot-coding-agent-tasks/
32. GitHub changelog, "Introducing the Agents tab in your repository" (2026-01-26), https://github.blog/changelog/2026-01-26-introducing-the-agents-tab-in-your-repository
33. GitHub changelog, "More visibility into Copilot coding agent sessions" (2026-03-19), https://github.blog/changelog/2026-03-19-more-visibility-into-copilot-coding-agent-sessions/
34. GitHub Docs, About Copilot cloud agent, https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent
35. GitHub Docs, Risks and mitigations for Copilot cloud agent, https://docs.github.com/en/copilot/concepts/agents/coding-agent/risks-and-mitigations
36. CodeMySpec, "GitHub Copilot in 2026" (secondary), https://codemyspec.com/blog/github-copilot-review-2026
37. releases.sh, "Chat, Work, Codex merged into single desktop app" (2026-07-09), https://releases.sh/release/rel_ju1EtELr_TlXn7mNqKSQH-chat-work-codex-merged-into-single-desktop-app
38. heyuan110, "Codex App Guide (2026)" (2026-07-12, secondary), https://www.heyuan110.com/posts/ai/2026-07-12-openai-codex-app-guide/
39. Daniel Vaughan, "Codex Cloud Exec Best-of-N" (2026-04-01, secondary), https://codex.danielvaughan.com/2026/04/01/codex-cloud-exec-best-of-n-attempts/
40. MorphLLM, "OpenAI Codex App" (secondary), https://www.morphllm.com/openai-codex-app
41. Cursor changelog, https://cursor.com/changelog
42. DataCamp, "Cursor 3" (2026-04-08), https://www.datacamp.com/blog/cursor-3
43. Linear docs, AI Agents, https://linear.app/docs/agents-in-linear
44. Linear developers, Agent interaction, https://linear.app/developers/agent-interaction
45. OpenHands README (Agent Canvas), https://github.com/OpenHands/OpenHands
46. Warp newsroom, "Warp launches Oz" (2026-02-10), https://warp.dev/newsroom/2026/2/10/warp-launches-oz-the-orchestration-platform-for-cloud-coding-agents
47. Warp blog, "A single pane of glass for managing all of your cloud agents" (2026-05-19), https://www.warp.dev/blog/multi-harness-cloud-agent-orchestration
48. Amp news, https://ampcode.com/news
49. Kiro, Autonomous agent, https://kiro.dev/autonomous-agent/
50. Paperclip README, https://github.com/paperclipai/paperclip
51. NYU Shanghai RITS, "Anthropic Ships Agent View" (secondary), https://rits.shanghai.nyu.edu/ai/anthropic-ships-agent-view-a-multi-session-dashboard-for-claude-code/
52. Google Codelabs, Getting started with Google Antigravity, https://codelabs.developers.google.com/getting-started-google-antigravity?hl=en ; Altamira, https://www.altamira.ai/blog/antigravity-is-agent-first-coding-tool/
53. EveryDev, Paradev listing (October 2026, secondary), https://www.everydev.ai/tools/paradev
54. Laura Summers, Pydantic, "The human-in-the-loop is tired" (2026-02-18), https://pydantic.dev/articles/the-human-in-the-loop-is-tired
55. Hacker News discussion of [54] (2026-07-17, 318 points), https://news.ycombinator.com/item?id=48942000
58. Skillselion, vibe-kanban skill page (secondary), https://skillselion.com/skills/akillness/oh-my-skills/vibe-kanban
59. Sacra, Factory (secondary), https://sacra.com/c/factory/
62. Cline docs, What is Cline Kanban, https://docs.cline.bot/kanban/overview
63. DevTune, Conductor profile (secondary), https://devtune.ai/verticals/coding-agent-orchestration/conductor
64. bra1ndump, Terragon research note (secondary, speculative), https://bra1ndump-website.pages.dev/blog/research/harness-engineering/terragon
65. OpenAlternative, Orca (secondary), https://openalternative.co/orca
66. Digital Applied, Devin 2 desktop and code review guide (secondary), https://www.digitalapplied.com/blog/devin-2-desktop-code-review-ai-engineer-guide ; yespress, https://yespress.io/products/devin.md
67. Hacker News search, Factory Missions submission dated 2026-02-27 (via search result summary), https://hn.algolia.com/
68. Daniel Vaughan, "The Super App Gambit" (2026-07-19, secondary), https://codex.danielvaughan.com/2026/07/19/super-app-gambit-codex-chatgpt-merger-agent-ide-war-distribution-strategy/
69. Noqta, "Cursor 3 Agents Window" (secondary), https://www.noqta.tn/blog/cursor-3-agents-window-parallel-ai-coding-2026 ; Havoptic Cursor diff, https://www.havoptic.com/r/cursor/diff?from=3.8&to=latest
70. OpenHands, Enterprise vs OSS, https://docs.openhands.dev/enterprise/enterprise-vs-oss
71. Rubin Lake technology radar, Sourcegraph Amp (secondary), https://rubinlake.com/en/technology-radar/developer-ai-and-delivery/sourcegraph-amp
72. Hacker News comment by mrothroc (2026-08-27), https://news.ycombinator.com/item?id=49468710
73. Hacker News comment by oytis (2026-05-31), https://news.ycombinator.com/item?id=48344138
74. Hacker News comment by laurencoral (2026-07-08), https://news.ycombinator.com/item?id=48830674

### Limits of this research

Reddit and X were reachable only through search snippets and mirrors, so user sentiment leans on Hacker News. Several feature claims for Codex, Cursor, Devin, and Copilot come from secondary guides and are marked. Star counts for Orca and Paperclip look anomalous and were not independently verified. The Factory Missions date is inconsistent on its own page. Visual design praise is thin in written sources; the clearest signals are for Conductor, Sculptor, Vibe Kanban, and the Codex review queue.
