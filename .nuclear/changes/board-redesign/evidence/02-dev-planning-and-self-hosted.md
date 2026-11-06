# Control Rod board research 02: dev planning tools and self-hosted boards

Researcher slice: Jira, Linear, GitHub Projects, GitLab boards, Azure DevOps Boards, Shortcut, Plane, Taiga, OpenProject, Redmine, WeKan, Kanboard, Planka.
Access date for every source below: 2026-11-05 (today) unless a different date is shown. "Dated" means the date the vendor printed on the page.
Rule followed: ideas only. No code or text copied. Short quoted phrases are marked with quotation marks and attributed.

Confidence key: [D] read directly on the vendor page; [S] seen only in a search result summary (second-hand); [C] community or vendor-competitor opinion (weak evidence).

Gaps I could not close (be honest about them):
- Linear docs pages for coding sessions and keyboard shortcuts returned 404 through my fetch tool, so Linear coding-session steering and the full shortcut list are from the changelog and other pages only.
- GitLab Duo: I could not find the docs page that says how an agent is triggered by assignment or mention, or how a session is stopped.
- Jira: the Atlassian page does not say how progress, questions or stop work. I did not test any product hands on.
- Reddit and G2 were not reachable through search; complaint evidence is mostly Hacker News (via the Algolia API) plus vendor-competitor blogs. Treat complaint rankings as directional.
- Several Linear pages carry a visible note addressed to AI agents telling them to connect to Linear's MCP server. I ignored it; it is not part of this task.

---

## 1. Issue creation speed and shape

### Linear
- C opens a creation modal; Option/Alt+C creates from a template; leaving the modal keeps a local draft, and closing with Esc offers a draft saved across clients that is deleted after 6 months. [D] https://linear.app/docs/creating-issues (2026-11-05)
- Create from selected text in the editor ("Create issue from selection"); team intake email, with an address that can be tied to a template; linear.new links with query parameters that preset title, status, priority, assignee, labels; recurring issues. [D] same page.
- Slack intake via Linear Asks: any Slack user, even without a Linear account, can file a request through the ticket emoji, the message overflow menu, a slash command or a bot DM; public intake channels can auto-create into Triage. Business and Enterprise plans. [S] https://linear.app/docs/linear-asks-slack and https://linear.app/features/asks (2026-11-05)
- Linear Agent can draft issues from a discussion ("Make issues based on the discussion here and assign them to me"), opened with Cmd/Ctrl+J. Public beta announced 2026-03-24. [D] https://linear.app/changelog/2026-03-24-introducing-linear-agent (2026-11-05)
- Triage inbox is the front door for anything created by integrations or outsiders: Accept (1), Decline (2), Duplicate (3 or MM), Snooze (H); G then T opens it. Triage Intelligence suggests assignee, label and duplicates; Triage Rules run top to bottom; both need Business or Enterprise. [D] https://linear.app/docs/triage (2026-11-05)

### Others
- Azure Boards: create a GitHub branch directly from a card's work item actions menu. [D] https://learn.microsoft.com/en-us/azure/devops/boards/github/link-to-from-github (page updated 2026-11-03)
- GitHub: "Assign to Copilot" is one click from an issue; you can pick the target repository, base branch and add extra instructions (dated 2025-09-24). [D] https://github.blog/changelog/2025-09-24-pick-the-repository-and-base-branch-when-assigning-issues-to-copilot/
- Plane: assign an agent directly to a work item, "Everything it needs is already on the work item when it starts" (Plane blog, published 2026-09-18, updated 2026-10-23). [D] https://plane.so/blog/agents-are-now-live-in-plane

Takeaway: the fast path is keyboard open, one required field (title), everything else optional, plus a separate inbox that holds machine and outsider-created work until a human accepts it.

---

## 2. Work item to code link and status automation

### Linear (most complete model)
- Branch name carries the issue ID; Cmd/Ctrl+Shift+. copies a formatted branch name; an optional automation moves the issue to a started status when you copy the branch name. [D] https://linear.app/docs/github.md (2026-11-05)
- Per-team triggers: draft PR opened, PR opened, review requested, ready for merge, merged. Defaults: In Progress when a PR opens, Done on merge. "Ready for merge" does not fire if GitHub reports the PR unstable (any failing check, even non-required). [D] same page.
- Magic words: closing ("Fixes ENG-123"), non-closing ("Refs"), relation, and an ignore word that blocks auto-linking. [D] same page.
- The linked PR appears on the issue as an attachment showing reviewer avatars and review actions. [D] same page.
- Canceling an issue or marking it a duplicate closes open linked PRs that have a closing relationship; completing does not. [D] same page.
- Linear Diffs and Reviews (2026): a Reviews sidebar of PRs needing your attention, review state (approve, request changes, comment) syncs to GitHub; Guided Reviews split a large PR into explained sections; merge from Linear; stacked PRs shown as a chain (2026-10-08). [D] https://linear.app/docs/diffs and https://linear.app/changelog (2026-11-05)
- Diffs update in realtime during a coding session, including uncommitted changes from follow-up prompts (2026-10-08). [D] https://linear.app/changelog
- When an AI agent comments on a PR on behalf of a person, Linear shows the agent's name, avatar and model. [D] https://linear.app/docs/diffs

### Azure DevOps Boards
- `AB#123` in commit, PR description or issue links the item; "Fixed AB#123" transitions to the Resolved state category, falling back to Completed; transitions only apply when the PR merges into the default branch. [D] https://learn.microsoft.com/en-us/azure/devops/boards/github/link-to-from-github (updated 2026-11-03)
- Strongest card feature in this slice: linked PRs show draft status, review status (needs review, approved, changes requested) and CI checks status (passing, failing, pending) directly in the work item, with hover detail. Board cards can show GitHub annotations. [D] same page.
- State category fallback ("match a category if the exact state name is unknown") is a good design for custom workflows. [D] same page.

### GitHub Projects
- Built-in automations are thin: item added sets Todo, closed or PR merged sets Done, auto-archive, auto-add by filter. [D] https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations
- Issue dependencies (blocked by / blocking) are GA, with `is:blocked`, `is:blocking` search filters and API/CLI support (dated 2025-08-21). [S] https://github.blog/changelog/2025-08-21-dependencies-on-issues/

### GitLab
- Board lists can be label, assignee, milestone, iteration or status lists; dragging a card between label lists swaps the labels, dragging to Closed closes the issue; epic swimlanes on Premium and Ultimate. [D] https://docs.gitlab.com/user/project/issue_board/ (2026-11-05)
- Developer Flow converts an issue into a merge request (GA in 18.8). [D] https://docs.gitlab.com/user/duo_agent_platform/

---

## 3. Workflow states, triage, cycles, sub-issues, blocked

- Linear: state categories Triage (inbox), Backlog, Unstarted, Started, Completed, Canceled; categories are fixed in order, teams rename and add states inside a category; default flow Backlog, Todo, In Progress, Done, Canceled; duplicate maps to Canceled. [S] https://linear.app/docs/configuring-workflows (2026-11-05)
- Linear cycles repeat every N weeks per team; teams own their own workflow and triage. [D] https://linear.app/docs/conceptual-model
- Azure Boards has workflow state categories too (Proposed, In Progress, Resolved, Completed) and uses them for automation fallback. [D] link-to-from-github page above.
- GitHub: "blocked by" and "blocking" relations with search filters. [S] see section 2.
- Plane: Cycles with burn-down, Modules, saved Views, Pages. [D] https://github.com/makeplane/plane (README).

Insight: a small fixed set of state categories above free-form state names is what lets automation, reporting and agent rules stay stable while teams rename columns.

---

## 4. Command palette, keyboard design, speed, offline

- Linear's go-to chords (G then T for Triage, G then R for Reviews, O then T from another team), single-key actions (1/2/3/H in triage, A to assign, C to create). [D] https://linear.app/docs/triage, https://linear.app/docs/diffs, https://linear.app/docs/assigning-issues via search summary (2026-11-05)
- Local-first: the client keeps an in-memory object graph backed by IndexedDB, applies mutations locally and syncs them; the server acts as another sync peer. This comes from secondary sources and a reimplementation project, not a Linear primary document. [C] https://hn.jakechampion.name/reader/https://www.fujimon.com/blog/linear-sync-engine and https://awesome.ecosyste.ms/projects/github.com%2Fstratasync%2Fstratasync
- Linear's own docs call offline mode a "failsafe", automatic, with a warning that offline edits are not checked against creation dates and can overwrite teammates' edits. [S] https://linear.app/docs/offline-mode (2026-11-05)
- HN commenters about Jira speed (not a controlled comparison): "JIRA is so slow" (2026-05-25, https://news.ycombinator.com/item?id=48264133), "dog slow & clunky" (2025-08-08, https://news.ycombinator.com/item?id=44838014), and a 2022 commenter who credited speed and keyboard shortcuts for higher issue participation after leaving Jira (https://news.ycombinator.com/item?id=31932329). [C]

---

## 5. AGENT INTEGRATIONS (deep section)

### 5.1 Linear

Chronology and surfaces (all dates printed by Linear):
- 2025-07-30: Agent Interaction Guidelines and Agent Interaction SDK (developer preview). Introduced delegation, agent sessions, agent activity. [D] https://linear.app/changelog/2025-07-30-agent-interaction-guidelines-and-sdk
- 2026-03-24: Linear Agent public beta, in app (Cmd/Ctrl+J), Slack and Teams; Skills (save a successful conversation as a reusable skill); Automations on triage entry. [D] https://linear.app/changelog/2026-03-24-introducing-linear-agent
- 2026-05-14: Code Intelligence beta (agent reads connected repos; admins choose repos and whether access follows GitHub permissions). Also users can queue follow-up messages while the agent works. [D] https://linear.app/changelog/2026-05-14-code-intelligence
- 2026-06-11: Coding sessions: assign an issue or ask in chat, comment or Slack; runs in the cloud on Claude Code and Codex; returns a diff for review; first-pass triage fix attempt, Linear states about 30% of incoming bug reports resolved this way (vendor claim). Needs GitHub connection and AI credits. [D] https://linear.app/changelog/2026-06-11-coding-sessions
- 2026-07-20: Loops (scheduled or event-triggered agent work, visible instructions and per-run history). [D] https://linear.app/changelog/2026-07-20-introducing-loops
- 2026-07-30 to 2026-10-22: Guided Reviews GA, GitHub Copilot assignable from Linear, sandbox environments with setup scripts and browser testing with before and after screenshots (2026-08-20), pricing split into model usage at provider rates plus sandbox runtime at $0.25 per 20-minute block, environment secrets and open-weight models (2026-09-24), Diffs on mobile (2026-11-05). [D] https://linear.app/changelog
- 2026-03-24 essay "Issue Tracking Is Dead": claims coding agents in over 75% of enterprise workspaces, agent-completed work up 5x in three months, agents authoring nearly 25% of new issues. Vendor claims, unverified. [D] https://linear.app/next

How an agent appears as an assignee:
- Humans stay assignee; the agent is the delegate. Guideline: issues can only be assigned to humans and only delegated to agents, because an agent cannot be held accountable. Assigning in the picker (or pressing A) sets the delegate; the human remains primary assignee. [D/S] https://linear.app/developers/agents and the search summary of https://linear.app/docs/assigning-issues
- Agents are app users: mentionable, delegable, can comment, collaborate on projects and documents; do not count as billable seats; cannot sign in or do admin functions; cannot be project members or leads. [D] https://linear.app/docs/agents-in-linear.md and https://linear.app/developers/agents
- Visibility: agent user pages, My issues still shows delegated issues, custom views filtered by Delegate, Insights segmented by Delegate. [D] https://linear.app/docs/agents-in-linear.md
- Workspace-level and team-level agent guidance (team wins on conflict). [D] same page.

Progress and questions:
- An AgentSession is created automatically on mention or delegation. States: pending, active, error, awaitingInput, complete, stale; state is derived from the last activity, not set by hand. [D] https://linear.app/developers/agent-interaction
- Activity types: thought, elicitation (a question), action (tool call with parameter and result, rendered as "Searching" then "Searched"), response (final result, also posted as a comment), error, and prompt (the human's message). Only thought and action can be ephemeral, replaced by the next activity. [D] same page.
- Timing contract: webhook answered within 5 seconds, first activity within 10 seconds or the session shows unresponsive; follow-ups for up to 30 minutes before stale; any new activity recovers a stale session. [D] https://linear.app/developers/agent-interaction and https://linear.app/developers/agent-best-practices
- Agent Plan (technology preview): a session-level checklist whose steps are pending, inProgress, completed, canceled; updates replace the whole plan. [D] agent-interaction page.
- externalUrls add an "Open" button to the agent's own dashboard, and a GitHub PR URL there shows that a PR was published. [D] same page.
- Elicitation signals: `auth` (account linking with a temporary link) and `select` (labelled options; a free-text reply dismisses it). [D] https://linear.app/developers/agent-signals

Stopping and steering:
- Human can choose "Send stop request" from a dropdown. Linear emits a prompt activity carrying a `stop` signal. The agent must take no further action (no code changes, API calls, updates) and then emit a final response or error confirming it stopped and its state. [D] https://linear.app/developers/agent-signals
- Follow-ups arrive as `prompted` events; comment history is not the record, because comments can be edited. Agents are told to read the frozen Agent Activities instead. [D] https://linear.app/developers/agent-best-practices
- Users can queue follow-up messages while the agent is working (2026-05-14). [D] code intelligence changelog.
- The six guidelines: disclose that it is an agent, clear delegation model, respect requests to disengage, instant feedback, transparent internal state, and "inhabit the platform natively". [D] https://linear.app/developers/aig.md (undated, "living document")
- Rules for status: if a human delegates an issue not yet started, the agent moves it to the team's started status with the lowest position when work begins; if an automation delegated it, the agent keeps it in triage and a human assigns. [D] agent-best-practices page.

Review of results:
- Coding sessions return a diff in Diffs, shareable preview links, request more iterations in the same thread; review state syncs with GitHub; admins can restrict who can merge through GitHub permissions. [D] https://linear.app/changelog/2026-06-11-coding-sessions and https://linear.app/docs/diffs
- Signed commits for coding sessions (2026-07-30). [D] https://linear.app/changelog

Reaction (HN, 2026-03-24, 24 comments): commenters were mostly skeptical, e.g. "feels awkwardly premature and dubious", a wish to keep LLM output out of the tracker, doubt a built-in agent is more than an "80% solution", and "You're the best of a shitty bunch" as a warning against ruining the tool. [C] https://news.ycombinator.com/item?id=47507253 (via https://hn.algolia.com/api/v1/items/47507253)

### 5.2 GitHub Copilot coding agent and Agent HQ

- Assign an issue to Copilot (also via the Agents panel on any github.com page, dated 2025-08-19, https://github.blog/changelog/2025-08-19-agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github-com [D]).
- Agent HQ (February 2026 coverage): sessions start from a repo Agents tab; Claude and Codex available in public preview for Pro+ and Enterprise; an issue can be assigned to several agents to compare results; one premium request per session; central policy and audit logging. [S] https://www.i-programmer.info/news/105-artificial-intelligence/18651-github-adds-claude-and-codex-to-agent-hq.html
- Progress: Agents tab shows all active sessions, shared by default for cloud sessions to anyone with repo access; click a session to follow its log and reasoning in real time. [D] https://docs.github.com/en/copilot/how-tos/use-copilot-agents/manage-agents and https://docs.github.com/en/copilot/concepts/agents/coding-agent/agent-management
- Steering: type into the prompt box under the session log; applied after the current tool call; each steering message uses AI credits; not available for third-party agents. [D] manage-agents page. In a PR, `@copilot` comments from users with write access trigger changes; eyes reaction acknowledges; review comments can be batched. [S] https://docs.github.com/en/copilot/how-tos/agents/copilot-coding-agent/reviewing-a-pull-request-created-by-copilot
- Stop: "Stop session" button in the session log viewer ends the Actions run; commits already pushed are preserved; archive to remove. [D] manage-agents page.
- Guardrails (the best written set I found): can push to only one branch (`copilot/` or an existing PR branch); branch protections still apply; only write-access users can trigger it, other comments never reach it; the requester cannot approve the PR, and a Copilot-authored PR needs one more approval; Actions workflows do not run on its changes until a write user clicks "Approve and run workflows"; restricted internet; commits authored by Copilot and signed; the requester is listed as co-author. [D] https://docs.github.com/en/copilot/concepts/agents/coding-agent/risks-and-mitigations
- Limits: Actions-based sessions have a 59-minute maximum and one repo and one branch at a time. [D] https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent
- Azure Boards can send a work item to Copilot; it creates a draft PR linked back; it reads the item's text fields and last 50 comments, and that context is stored in the PR and visible to repo readers. Private preview 2025-09-16, public preview 2025-09-18. [D/S] https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/integrate-coding-agent-with-azure-boards and https://github.blog/changelog/2025-09-18-assign-azure-boards-work-items-to-copilot-coding-agent-in-public-preview/

### 5.3 Jira and Atlassian Rovo

- Agents in Jira: open beta announced 2026-02-25 per press coverage (https://siliconangle.com/?p=731944 [S]); Atlassian release note dated 2026-04-27: assign work items to Rovo agents and third-party agents such as GitHub Copilot coding agent from the assignee dropdown, @mention in comments, and add agents to workflow transitions. [D] https://jirareleases.atlassian.com/announcements/put-ai-teammates-to-work-right-inside-jira
- Support docs: assigned agents appear in an Agents section of the work item with expandable Agent sessions; "Trigger agent action" rule on a workflow transition with optional custom prompt; board columns (team-managed spaces only) can run an agent when work enters. [D] https://support.atlassian.com/jira-software-cloud/docs/collaborate-on-work-items-with-ai-agents/
- Privacy model that matters: "Only you can view, interact with, and share the agent's output"; only the person who added or triggered it can interact; others see that it was triggered. Output goes Publish, then Draft comment, then Save to share with the team. Each invocation uses Rovo credits. [D] same page.
- Gap: the page does not say how progress, agent questions, stop or redirect work. Atlassian's note says agents operate within existing permissions, configuration and audit trails and that the conversation stays attached to the work item. [D] release note.

### 5.4 GitLab Duo Agent Platform

- GA in GitLab 18.8 (reported 2026-01-15), beta since 18.2. GA flows: Developer Flow (issue to merge request), Code Review, Convert to CI/CD, Fix CI/CD Pipeline, Software Development (multi-step plan before executing); built-in agents Planner, Security Analyst, Data Analyst; custom and external agents on higher tiers. [D] https://docs.gitlab.com/user/duo_agent_platform/ and [S] https://sdtimes.com/ai/gitlabs-duo-agent-platform-is-now-generally-available/
- Tool-level approval policies that gate sensitive agent actions with human approval at execution time (beta, no credits); AI Governance Dashboard to monitor agent sessions across a group. [D] same docs page.
- Not found: assign-to-agent mechanics, service accounts, stop.

### 5.5 Azure DevOps, Shortcut, Plane

- Azure DevOps: only via the Copilot integration above; PR insights (draft, review, checks) on the work item are the best review-state display in this slice. [D] link page above.
- Shortcut Korey (launched 2025-09-30): AI agent you can assign to a Story like a teammate; creates stories and sub-tasks, aware of the current iteration; no 2026 updates found. [S] https://www.shortcut.com/integrations/korey/ and https://siliconangle.com/?p=713520
- Plane Agents (blog 2026-09-18, beta): agents are OAuth apps with an "Agent Run" scope; an @mention creates a run, assignment also supported; triggers on item change or schedule; each agent works within objective, scope, actions, constraints and escalation, "Anything outside those boundaries returns to a person"; shared monthly Agent credit pool, roughly 20 to 40 credits per run. [D] https://plane.so/blog/agents-are-now-live-in-plane and https://developers.plane.so/dev-tools/agents/overview
- Plane run states: created, in_progress, awaiting (input needed), completed, stopping, stopped, failed, stale after 5 minutes of silence; activity types prompt, thought (ephemeral), action (ephemeral), response (creates comment), elicitation (creates comment), error. The stop request mechanism is named but not documented on the page I read. [D] developers.plane.so overview page.
- Note: the Plane and Linear models are near twins (session or run, thought/action/elicitation/response/error). That convergence is evidence the shape is the emerging standard.

### 5.6 Cross-product agent pattern summary

| Question | Linear | GitHub | Jira | Plane |
|---|---|---|---|---|
| Who is accountable | Human assignee, agent is delegate | Requester cannot approve own PR | Triggering person owns the session | Humans own outcomes |
| Progress surface | Session with typed activity feed plus plan checklist | Live session log in Agents tab | Agent sessions section | Run activity |
| Questions | `elicitation`, `awaitingInput` state, auth and select signals | Comments in the log/PR | Not documented | `awaiting` state |
| Stop | "Send stop request", agent must confirm | "Stop session" button | Not documented | `stopping`/`stopped` states |
| Steer mid run | Queue follow-ups, prompt in session | Prompt box, applied after current tool call | Not documented | Reply in thread adds to run |
| Review | Diffs, Guided Reviews, merge in app | PR, approval by someone else, workflow approval gate | Publish then Draft comment | Humans review consequential changes |

---

## 6. Strongest feature and most common complaint

| Product | Does better than anyone | Most common complaint (source quality) |
|---|---|---|
| Linear | Speed, keyboard flow and a coherent agent model (delegate, session, activity, stop signal) | Narrow for complex multi-team planning, limited customization (aggregator, [C]); trust worry about agents and AI content in the tracker (HN above) |
| Jira | Configurability and enterprise permissions; workflow-transition triggers for agents | Slowness and configuration bloat (HN 2025-2026 comments; 2015 HN thread on too many clicks https://news.ycombinator.com/item?id=9973119) [C] |
| GitHub Projects | Zero distance to code, PRs and Actions; the best agent guardrails | No native sprints or velocity or burndown reporting; weak for non-engineers (competitor blogs, https://blog.zenhub.com/why-switch-from-github-projects) [C] |
| GitLab boards | Drag a card and the label or assignee or epic changes underneath | Not assessed from user sources in this pass |
| Azure DevOps Boards | PR review and CI status on the work item and `AB#` state transitions | GitHub-only agent path; no Azure Repos support per Microsoft commenters [S] |
| Shortcut | Story-centric simplicity; Korey creates and breaks down work | Not assessed |
| Plane | Open-source with Cycles, Modules, Views and now agents | Agent credits metered; Plane AI not on Free [D] |
| Taiga | Gentle agile boards, still releasing (6.10.1, 2026-05-06 per Wikipedia [S] https://en.wikipedia.org/wiki/Taiga_(project_management)) | Roadmap churn: TaigaNext replaced by Tenzu [S] https://community.taiga.io/t/launching-tenzu-taiganext-new-identity/3940 |
| OpenProject | Agile boards plus classic PM, BIM/BCF | Enterprise add-on gating (not evidenced further) |
| Redmine | Long-lived, extensible | Agile requires plugins; some are commercial (Easy Redmine is part GPL, part commercial) [S] https://www.easyredmine.com/resources/faq/pricing-and-licenses/what-kind-of-license-does-easy-redmine-have |
| WeKan | Free Trello-like board, heavy update cadence | Not assessed |
| Kanboard | Minimal Kanban | "This application is in maintenance mode" per its README [D] https://github.com/kanboard/kanboard |
| Planka | Clean Trello-like UI | License moved to a custom source-available terms; r/selfhosted commenters called the paid tier steep (snapshot ~2026-04, [C]) |

Jira-vs-Linear sentiment: a Show HN author analysed 5,000 comments and found negative Jira sentiment centres on complexity and configuration, while the Linear debate is speed versus scaling. [C] https://news.ycombinator.com/item?id=46046121 (2025-11-25)

Notification noise: Linear shipped a Priority tab (2026-09-03) that separates what needs attention from what can wait, which is Linear's own admission of the problem. [D] https://linear.app/changelog

---

## 7. Licenses (self-hosted and open source)

| Product | License | Evidence | Note for Control Rod |
|---|---|---|---|
| Plane | AGPL-3.0 | LICENSE.txt raw, https://raw.githubusercontent.com/makeplane/plane/preview/LICENSE.txt [D] | Strong copyleft; ideas only |
| Taiga | MPL-2.0 for taiga-back; one Wikipedia infobox says AGPL-3.0-or-later, conflict unresolved | https://raw.githubusercontent.com/taigaio/taiga-back/main/LICENSE [D]; Wikipedia [S] | Weak copyleft (file level); ideas only |
| OpenProject | GPL-3.0 | https://github.com/opf/openproject README [D] | Community edition GPL; Enterprise add-ons separate |
| Redmine | GPL-2.0, header text says "or any later version" | https://raw.githubusercontent.com/redmine/redmine/master/LICENSE.txt [D]; LICENSE.txt added June 2024 [S] https://redmine.org/attachments/31943 | Copyleft; agile plugins (e.g. Easy Redmine) partly commercial |
| WeKan | MIT | https://github.com/wekan/wekan [D] | Permissive, so outside the owner's "copyleft or source-available" allowance; owner should decide whether ideas from MIT code are acceptable |
| Kanboard | MIT, maintenance mode | https://github.com/kanboard/kanboard [D] | Same note as WeKan |
| Planka | PLANKA Community License v1.1: Fair Use License v1.1 for community files plus a commercial Pro/Enterprise license; bars running it as a hosted service for third parties for commercial gain | https://raw.githubusercontent.com/plankanban/planka/master/LICENSE.md [D] | Source-available, not OSI open source; ideas only, and never copy files |
| Linear, Jira, Shortcut, Azure DevOps, GitHub, GitLab EE features | Proprietary (GitLab core is open source but Duo is a licensed add-on) | Not verified individually | Ideas from public docs only |

Ideas-only rule: nothing in this report reproduces code. Where I describe behavior, it comes from documentation and changelogs.

---

## 8. Why Linear is called the best looking (specific, with source quality)

Primary source: Linear's own redesign write-up (undated in my fetch; the text says about six weeks of work, feature flag, private beta, then general availability). [D] https://linear.app/now/how-we-redesigned-the-linear-ui
- Goal stated: reduce visual noise, improve alignment, increase hierarchy and density of navigation.
- Color: theme generation moved from HSL to LCH (perceptually uniform); themes come from three variables (base, accent, contrast) instead of 98, and the contrast variable gives high-contrast accessible themes.
- Dark and light share one generation system; text and neutral icons flip darker or lighter; accent color use was deliberately limited to keep things neutral.
- Typography: Inter Display for headings, regular Inter for body.
- Alignment: sidebar and tab labels, icons and buttons were carefully aligned; browser-redundant controls removed.
Secondary (weak): LogRocket describes "Linear style" as dark mode, bold typography, gradients, monochrome, high contrast, and warns that when a trend spreads products look alike. [C] https://blog.logrocket.com/ux-design/linear-design
What I could not source: Linear's motion rules and empty-state design. I have no primary evidence; do not claim them in a design brief without testing the product by eye.

Practical reading for Control Rod: the visual win is mostly restraint (few colors, one accent, perceptual color math, tight alignment, density) and speed, not decoration.

---

## 9. Ranked patterns to take (16)

Ranked by value to an agent workbench where AI does the work and a human reviews.

1. Delegate, not assign (Linear). Keep a human owner on every card; show the agent as a second, visibly different party. Why it matters: accountability for signed approvals stays human; reports can slice by "delegate".
2. Typed session activity feed on the card (Linear, Plane). Thought, action (with start and done states), question, response, error, as a feed with ephemeral lines replaced by the next. Why: it is the evidence trail and the live view in one object.
3. Derived session state, never hand-set (Linear: pending, active, awaitingInput, error, complete, stale; Plane adds stopping/stopped). Why: a card column and an agent state must never disagree; stale detection catches a dead sandbox.
4. First-response contract (Linear: acknowledge within 10 seconds or show unresponsive; stale after 30 minutes silent; any activity revives). Why: the board can show "launching" versus "hung" honestly.
5. A real stop control that the agent must confirm (Linear stop signal and final confirmation; GitHub Stop session keeps pushed commits). Why: operators need a hard halt plus a record of what state the repo was left in.
6. Elicitation as a first-class waiting state (Linear awaitingInput with select options and auth link; Plane awaiting). Why: an agent's question should move the card into a "needs you" lane and show choice buttons, not bury text in a log.
7. Steer without stopping (GitHub prompt box applied after current tool call; Linear queued follow-ups). Why: cheaper than stop and restart; queue semantics must be explicit.
8. Review state and CI on the card (Azure Boards PR insights: draft, review, checks; Linear reviewer avatars). Why: the human decides from the board without opening the PR.
9. Review where the diff lives (Linear Diffs and Guided Reviews, realtime diff during the session, stacked PR chain). Why: agent PRs are large; a guide that explains why each section changed cuts review time.
10. Guardrails written as rules a reader can audit (GitHub: one branch, requester cannot approve, workflow runs need approval, restricted network, co-author trail). Why: matches signed approvals; each rule maps to a card badge.
11. Status automation from code events with a category fallback (Linear per-team triggers; Azure state category fallback; "ready for merge" suppressed by failing checks). Why: removes manual card moves and keeps agent cards honest.
12. Agent-authored work goes through triage first (Linear: if an automation delegated it, keep in triage and let a human assign). Why: stops agents from self-promoting their own queue.
13. Triage inbox with one-key outcomes (Linear Accept, Decline, Duplicate, Snooze). Why: the human review lane for agent proposals can reuse the same four verbs.
14. Fixed state categories under editable column names (Linear, Azure). Why: automation and reports target the category, so renaming a column is safe.
15. Keyboard-first and a command palette with chord navigation (Linear G-then-key). Why: reviewing many agent runs is a throughput job; every action needs a key.
16. Local-first optimistic UI with a cautious offline mode (Linear sync approach; their warning about overwrites). Why: Control Rod is local-first; show pending-sync honestly and block destructive offline edits like approvals.
17. Cost and quota on the card (Linear AI credits and sandbox minutes, Plane agent credits, GitHub premium requests, Jira Rovo credits). Why: per-run cost is a first-class operational fact.
18. Reusable agent guidance at workspace and team level, with the more specific winning (Linear). Why: per-project instructions without editing every card.
19. Private-by-default agent output with an explicit "publish" step (Jira: Publish, then Draft comment, then Save). Why: separates a draft from an approved statement in the evidence record.

(19 listed; items 17 to 19 are lower priority. The brief asked for 12 to 20.)

---

## 10. Anti-patterns (9)

1. Configuration sprawl: custom fields, workflows and permissions that make a tool slow and unfathomable (the Jira complaints). Keep a small fixed model.
2. Writing agent state into comments only. Comments can be edited; Linear tells agents to use frozen activities. Keep an append-only log.
3. Silent agent: no acknowledgement and no timeout display. Users cannot tell hung from thinking.
4. Agent as assignee. It erases accountability. Use delegate.
5. Steering that is not available for every agent type (GitHub steering is unavailable for third-party agents). Do not make a two-class system.
6. Output visible only to the person who triggered it (Jira's design) when the team needs the evidence. Private drafts are fine; the approved result must be shared.
7. Automation that moves a card on a signal that does not mean done (PR opened is not review passed; Linear's guard on failing checks is the right instinct).
8. Notification firehose (Linear needed a Priority tab). Agent events must default to a quiet digest, with "needs you" as the only loud state.
9. License bait and switch or metered surprise: Planka's licence change and paid-tier reaction, Plane Free lacking AI, per-steer credits at GitHub. Show cost before the action.
10. Hype-driven removal of the human step ("issue tracking is dead"); HN reaction shows trust worry. Keep review gates visible.

---

## 11. Source index (all accessed 2026-11-05)

Linear: linear.app/developers/agents, /agent-interaction, /agent-signals, /agent-best-practices, /aig.md; linear.app/docs/agents-in-linear.md, /creating-issues, /triage, /diffs, /github.md, /conceptual-model; linear.app/changelog and dated entries 2025-07-30, 2026-03-24, 2026-05-14, 2026-06-11, 2026-07-20; linear.app/next; linear.app/now/how-we-redesigned-the-linear-ui.
GitHub: docs.github.com Copilot coding agent pages (about, risks-and-mitigations, manage-agents, agent-management, Azure Boards integration), github.blog changelog 2025-08-19, 2025-09-24, 2025-08-21; Projects built-in automations docs.
Atlassian: support.atlassian.com collaborate-on-work-items-with-ai-agents; jirareleases.atlassian.com put-ai-teammates-to-work-right-inside-jira.
GitLab: docs.gitlab.com/user/duo_agent_platform and /user/project/issue_board.
Microsoft: learn.microsoft.com Azure Boards GitHub linking page (updated 2026-11-03).
Plane: plane.so/blog/agents-are-now-live-in-plane; developers.plane.so/dev-tools/agents/overview; github.com/makeplane/plane.
Licenses: raw LICENSE files for Plane, Taiga-back, Redmine, Planka; READMEs for OpenProject, WeKan, Kanboard.
Community: Hacker News via hn.algolia.com items 47507253, 46046121, 44838014, 48264133, 31932329.
Shortcut: shortcut.com/integrations/korey; siliconangle.com/?p=713520.
