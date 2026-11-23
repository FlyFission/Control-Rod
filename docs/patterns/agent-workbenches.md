# Pattern notes: agent workbenches (Orchestrator.inc, Vibe Kanban, Paradev, Claude Code desktop)

> **Provenance.** Read on 2026-11-22 by the authoring agent, from public material only: each project's README at the pinned commit, Orchestrator.inc's `docs/architecture.md` at its pin, and the public Claude Code desktop documentation page (about the first fifth read verbatim, the rest from a summary). Orchestrator.inc was also observed as the tool this change was written in. No source code was opened. This file carries ideas only, in our own words; short quoted names are UI labels or feature names.

| Source | License | Pin | What was read |
|---|---|---|---|
| OrchestratorInc/agent-orchestrator ("Orchestrator.inc") | Apache-2.0 | `7c65ce3cfc0fc0cd9c71d00ad94391d7bf2bc771` | README; `docs/architecture.md` (status derivation, feedback routing, load-bearing rules) |
| BloopAI/vibe-kanban | Apache-2.0 (the project is sunsetting) | `3f095f0186f6e68d67143d38b02da2238f6524d8` | README; third-party descriptions of task attempts, marked secondary |
| ParadevAI/Paradev (formerly Superset) | MIT | `d47fe607268b294b6570411c78cd639398bddc69` | README |
| Claude Code desktop | Proprietary (Anthropic) | docs page as served on 2026-11-22 | https://code.claude.com/docs/en/desktop |

The backend mechanisms of Orchestrator.inc and Vibe Kanban (worktree manager, reaper, resumable event stream, process-group stop) were already read at source level in [workbench-donors.md](workbench-donors.md). Orchestrator.inc's daemon, review-gateway and board patterns are also recorded as AO-1 to AO-16 in `agent-orchestrator.md` (the same change record set as this note). This note covers what that one does not: attention outside the tab, the shortcut list, and the other three tools. Where the two meet, the row names the AO item.

## What the four have in common

All four answer one question first: *which of my agents needs me right now?* They differ in what "needs me" means, but each one:

1. derives a session's display status from stored facts and never lets a person drag it;
2. puts what needs the person first, and signals it outside the window (dock badge, chime, OS notification, phone push);
3. keeps review in the app: a diff, line comments sent back as one batch, then a pull request with its checks;
4. gives every task its own worktree and branch, and lets the person pick the agent per task;
5. is keyboard-first, with one place that lists the shortcuts.

Control Rod already has 1, 4 and much of 5. It has 2 inside the tab (the Inbox badge, the board's Needs you count) but not outside it, and it has 3 only as a patch file today (gap G-04; slices M5 and M6 of the board redesign).

## Decisions

Verdicts as in [workbench-donors.md](workbench-donors.md): **adopt** (take as is), **adapt** (reshape for frozen one-shot runs and signed decisions), **concept** (idea only, later), **skip**, **have** (already in Control Rod). Gap IDs refer to the program gap analysis (`docs/superpowers/specs/2026-11-08-program-gap-analysis.md`).

### Attention

| ID | Idea | Seen in | Control Rod today | Verdict | Gate |
|---|---|---|---|---|---|
| AW1 | **A count in the tab title.** The window says how many things wait on you even when it is behind another one. | Paradev (dock badge when an agent needs attention); Orchestrator.inc (alerts) | Rail badge on Inbox only | **adopt, built in #159.** `(3) Control Rod`, from the viewer's own Inbox (OV-01), shown only after a successful read; a failed refresh drops the number rather than show a stale one. | none |
| AW2 | **Tell me when something new needs me while I am away.** | Claude Code desktop (OS notification when a session finishes and you are not viewing it); Paradev (chime on finish); Orchestrator.inc (push when an agent asks or needs approval) | Nothing outside the tab (G-05) | **adapt, built in #159.** Notify on new Inbox items, not on "a run finished": a finished run is not accepted work, and only a recorded wait on this person is worth an interruption. Off until the person turns it on from the Inbox; the browser is asked only from that button; only while the tab is hidden; the first read after opening is the baseline, so nothing already waiting is announced; the text is the kind and a count only, never the record's title, because a notification can outlive a sign-out on a shared machine. | none |
| AW3 | **What needs you comes first.** | Orchestrator.inc (sessions sort into lanes from agent, PR, CI and review state) | Board columns are work steps; the Needs you count is a filter toggle; `J`/`K` move between cards | **adapt, built in #159.** `N` on the board moves to the next card marked Needs you or Blocked, in board order, wrapping; when none is marked it says so. Columns keep their order: a column is a step toward the next rung, not a priority. Complements AO-15, which sorts cards inside each column with the most urgent first; `N` moves across columns. | none |
| AW4 | **One list of shortcuts.** | Claude Code desktop (`Cmd+/`); Paradev (shortcuts page) | `Ctrl K`, `C`, `J`/`K` existed with no list (G-12) | **adopt, built in #159.** `?` outside a field, or the Shortcuts button in the rail. The list is built from one table, so it cannot drift from what the keys do. | none |
| AW5 | **One attention view that agrees with the Inbox.** | Orchestrator.inc (one board for every session); Claude Code desktop (sessions grouped by project) | **Finding:** the Today page counts every `draft` and `in-verification` package as "Needs Your Decision", including work that waits on someone else, so it can disagree with the Inbox badge and the new tab count. | **adapt, next.** Today reads `GET /inbox` for its "needs you" section, and lists the rest under "Waiting on others", as the Inbox does. | none |

### Board and status

| ID | Idea | Seen in | Control Rod today | Verdict | Gate |
|---|---|---|---|---|---|
| AW6 | **Store facts, derive the display status, with a written precedence.** Termination, then waiting on a person, then the PR pipeline, then activity; a probe that fails is recorded and never read as the agent having died. | Orchestrator.inc (load-bearing rule: never store display status) | `boardColumn` and `nextLine` derive column and tone from the record; "Status unknown since" when the stream drops | **have.** Worth writing the tone precedence (block, needs, wait, ok) as one table next to `lib/next.ts` when M5 adds run states. | none |
| AW7 | **Archive what is done.** Auto-archive after merge; archived sessions one click away. | Claude Code desktop ("View all"; auto-archive after a PR merges or closes) | Accepted never leaves the board (G-10) | **adopt, next.** Collapse Accepted older than seven days behind a count and a Show control. Presentation only; closing stays a decision. | none |
| AW8 | **Group by project, and see a project's work at a glance.** | Claude Code desktop (sidebar groups sessions by project folder) | Board swimlanes by project (M2) | **have.** | none |

### Review and feedback

| ID | Idea | Seen in | Control Rod today | Verdict | Gate |
|---|---|---|---|---|---|
| AW9 | **Line comments on the diff, sent to the agent as one batch.** | Vibe Kanban, Paradev, Claude Code desktop (`Cmd+Enter` sends them all) | Planned: Kandev P12, Plannotator anchored notes, slice M6 | **have (planned).** Four tools converge on this; it raises M6's priority. The batch becomes the next-run note of a Return, which a person signs. | M6 spikes |
| AW10 | **Feedback goes back to the agent that owns the work.** Failed checks, review comments and merge conflicts are routed to the owning worker, again and again, until approval. | Orchestrator.inc | A person returns with direction (two signatures to re-run, G-09) | **adapt.** A failed check or a pre-check dispute may *pre-fill* the next-run note; a person still decides to Return. No agent re-runs itself on a finding. Agrees with #138, which lists the automatic routing under "Not borrowed". | kernel (combined return-and-release intent, M5) |
| AW11 | **Pull request and checks in the app.** Open the PR, watch its checks, merge. | All four; Claude Code desktop adds "Auto-fix" and "Merge when ready" | Code work ends in a patch file (G-04) | **adapt.** "Open pull request" only after Accept, as a recorded run whose PR URL is evidence. Merge stays a person's act on the host; skip "merge when ready". | spec addition; after M6 |
| AW12 | **Try two approaches, keep the better one.** Several attempts per task, each its own branch and agent. | Vibe Kanban (attempts); Paradev | Compare page for candidate revisions; one author run per revision | **concept.** Parallel author runs on one revision need the kernel to hold several candidate outputs and accept one. Revisit with owner data on how often a second approach is wanted. | kernel; spec |

### Runs and integration

| ID | Idea | Seen in | Control Rod today | Verdict | Gate |
|---|---|---|---|---|---|
| AW13 | **A worktree and branch per task; the agent per task is the person's choice.** | All four | Hardened worktrees (wave 1), lane and runtime pickers | **have.** | none |
| AW14 | **Setup scripts and ignored-file copying for new worktrees.** | Paradev (setup and teardown scripts); Claude Code desktop (a file listing ignored files to copy) | None | **concept.** A setup script is repository code run on the host; it belongs inside the run sandbox, never before it. | sandbox policy (ADR 0021) |
| AW15 | **An in-app browser to preview the app and point at what to change.** | Paradev, Vibe Kanban, Claude Code desktop, Orchestrator.inc | None | **skip for now.** Previewing a software deliverable runs its code; Control Rod runs agent output only inside the sandbox. Most Capital Projects deliverables are documents, which the output preview already shows. | sandbox |
| AW16 | **Agents can drive the app** through a CLI, an MCP server and skills. | Paradev, Orchestrator.inc | `pnpm cr` for people | **adapt.** Read-only first (list packages, read the Inbox, read run evidence). No extension, CLI or MCP tool may sign, release, accept or override (Kandev P17). | threat model; red-team case |
| AW17 | **A planning agent splits a request into tasks and starts a worker for each.** | Orchestrator.inc | The intake agent drafts one package from one capture | **concept.** An intake run may propose several packages from one capture; each still needs a person's Release. | spec |
| AW18 | **Check in from a phone.** | Paradev, Orchestrator.inc | Owner-local, loopback, passkey signing | **skip** until hosted deployment exists. | deployment |
| AW19 | **Start agents from a timer or an outside event.** | Paradev (automations) | None (Kandev P08 proposes scheduled captures) | **concept.** A trigger creates a capture, never a release. | none for captures |

## Build plan

1. **Built in #159 (record `board-attention`), not in this note's change:** AW1 to AW4, web app only.
2. **Next, no gate:** AW5 (Today agrees with the Inbox) and AW7 (collapse old Accepted). Each is a web-only change with its own record.
3. **With their gates:** AW9 and AW11 with slice M6; AW10 with M5; AW16 after a threat-model row and a red-team case.
4. **Not planned:** AW15 and AW18 until the sandbox and deployment work they depend on exists.

## Where Control Rod should not follow

- **Agents fixing their own findings in a loop.** Orchestrator.inc routes failed checks to the owning worker until approval. In Control Rod a finding goes to a person, who decides whether to Return (AW10).
- **Notifications on "done".** A finished run is not accepted work. Control Rod notifies only on records that wait on this person (AW2).
- **Status you can drag.** Whatever a kanban board elsewhere allows, a Control Rod card's column comes from its record and changes only by a decision (spec 6.2).
