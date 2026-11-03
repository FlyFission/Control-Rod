# Pattern notes: Kandev

> **Provenance.** Written on 2026-10-22 from clean-room notes of Kandev's public documentation (Kandev and its docs are AGPL-3.0). Four readers studied the public docs and wrote notes in their own words. A fifth source was observation of the product running unmodified: an observer installed Kandev 0.97.0 from npm, drove it with a stand-in agent and no model provider, and wrote down what it saw, also in its own words. The builder who wrote this file worked from those notes only and never opened Kandev's docs or source. This file records ideas only. No Kandev code, configuration, schema or documentation text is copied. Short phrases in quotation marks are Kandev UI labels or feature names, or labels proposed for Control Rod. See `docs/patterns/README.md` for the clean-room rule and ADR 0019 for the decision this supports.

Kandev is an open workbench for running coding agents on a board of tasks. Control Rod will build its own workbench (ADR 0019) and borrow ideas from it. This file merges the five note files, removes duplicates, and sorts every idea by the Control Rod area it would change.

**Note files** (working papers kept outside the repository):

| Code | Note file | Scope |
|---|---|---|
| A | A-work-with-agents | Tasks, workflows, sessions, review, coordination, Git |
| B | B-office-and-people | Office mode, roles, security, integrations, automation, MCP |
| C | C-runtime-and-deploy | Agent CLIs, executors, configuration, service install, backups, live channel |
| D | D-plugins-and-practice | Plugins, canvases, extension safety, architecture, testing, release |
| E | E-observed-behaviour | An agent running Kandev 0.97.0 unmodified and recording what it saw (section 10) |

**How to read a pattern.** Each entry gives what Kandev does, why it matters, our version in Control Rod terms, then one line with fit, effort and priority, and the note files it came from.

- Fit: **Adopt** (take the idea as is), **Adapt** (take it with changes), **Skip** (does not suit us), **Already have**.
- Effort: **S** under a day, **M** days, **L** a week or more.
- Priority: **Now** (before Ben's first real run on his Mac), **Next**, **Later**. A pattern is marked Now only when it closes a gap confirmed in the code; see the build plan at the end.

**The shape difference that drives most fit calls.** Kandev is built around long-lived conversations that a person chats with and steers. Control Rod is built around one-shot runs against a frozen package revision, checked by an independent pre-check and decided by a passkey-signed human act. Much of Kandev's session machinery exists to manage a live chat; we need less of it and more of its review, evidence and recovery ideas. The biggest single contrast: in Kandev's Office mode, agents record review and approval verdicts and a person's approval is advice only. Control Rod inverts that: only a person may release or accept, and the kernel refuses agents.

---

## 1. Work and packages

### P01 Board position and runtime state stay separate
- **What it does:** a task's column and its runtime state (running, idle, failed) are kept apart and can disagree. Moving a card proves nothing about whether an agent ran or a review passed. A run is one wake-up of an agent for a stated reason (assigned, comment, schedule, blocker cleared), and a finished run is a different fact from a delivered task.
- **Why it matters:** people read a board as evidence and approve too early.
- **Our version:** package status and run status are already separate records, and only the kernel moves package status. Keep it visible: the office and package views show package status and latest run status side by side. Add a short wake reason to each Run (released, returned, pre-check of round N, retry, manual) and show it in the run header and on the floor.
- Fit: Already have (wake reason: Adopt) · Effort: S · Priority: Next · Notes: A, B

### P02 Dependencies resolve only on acceptance
- **What it does:** a task may wait on others. Links form a graph; Kandev checks each new link for a loop and, if it finds one, refuses it and names the chain of tasks involved. Nothing automatic starts a blocked task. A task created with a start request records an intent and starts when every predecessor succeeds. A link clears only when the upstream task succeeds; failed, cancelled or archived predecessors keep dependents blocked with a named reason; deleting a predecessor unblocks without starting. A person can still start a blocked task by hand, which the docs treat as a deliberate override. One Kandev mode treats failure as terminal and lets dependents proceed, which its docs flag as a trap.
- **Why it matters:** this matches engineering design-input practice and gives a clear answer to "why is this not moving".
- **Our version:** we already require each upstream package named in design inputs to be accepted before an author run is claimed (`services/api/src/work.ts:251-262`, checked at claim at line 409). Add: a cycle check at intake and draft edit that shows the path; a two-way chip on the package view (waits on, waited on by) with the upstream status; a refusal when a design input names a package id that does not exist (today it is skipped and counts as ready, line 255-259); and a manual override that is a signed owner decision recording an Assumption, as ADR 0016's tear-edge rule asks.
- Fit: Already have (core), Adapt (rest) · Effort: M · Priority: Next · Notes: A, B

### P03 The plan document with guarded writes
- **What it does:** each task has one editable plan with history. Writers must present the version they read; a write that names an out-of-date version is turned away with no change made. A rewrite that shrinks the plan sharply is refused unless the writer says the cut is meant, and the old copy is kept. Large plans are read in pages tagged with the version. People can anchor comments to plan text.
- **Why it matters:** the plan is the contract between person and agent, and these rules stop careless or truncated rewrites.
- **Our version:** our plan is the package draft. (a) Draft update carries the revision and last-updated time it was read at; a mismatch returns the current draft (today `updateDraft` is last writer wins, `work.ts:196-208`). (b) When intake regenerates a draft, warn if criteria or deliverables shrink. (c) Keep one event per saved edit; Kandev merges edits within a window, and our log is the record. (d) Anchored comments on draft fields that Ben can send to an intake re-run.
- Fit: Adapt · Effort: S for (a), M for the rest · Priority: Next · Notes: A, B, D

### P04 One-time owner instructions on a return
- **What it does:** a "Move with options" adds, for one entry into a step only, an extra instruction, a context reset, or a skip of the step prompt. The options survive queueing and restarts, and a failed move keeps what was typed.
- **Why it matters:** steering one hand-off without editing the process.
- **Our version:** the return reason already flows into the next author brief (`work.ts:385`). Store it on the queued Run so it survives restarts and is reproducible, add an optional "fresh start" flag that leaves prior round outputs out of inputs, and refuse instructions on decisions that start no work.
- Fit: Adapt · Effort: S · Priority: Next · Notes: A, B

### P05 Freeze the rules a run was given
- **What it does:** a named branch policy, and any per-task profile change, is copied onto the task at creation, so later edits never change old work. Saved prompts resolve when a step runs, so editing one changes every future run.
- **Why it matters:** reproducibility. Old work keeps the rules it started under.
- **Our version:** the assembled `BRIEF.md` and `TOOLS.txt` are job inputs, and the daemon already digests every input into the execution trace (`daemon/internal/runner/daemon.go:247`, `:320`), so the brief a run received is recorded. Still missing: the pack commit and a tree digest of the pack files the brief was built from (see P46). Keep in our docs the line that a role brief is an instruction and grants no authority.
- Fit: Already have (brief text), Adapt (pack digest) · Effort: S · Priority: Next · Notes: A, B, D

### P06 Questions from agents become records
- **What it does:** an agent can ask a structured question with options. A pending question blocks completion. Questions are durable; exactly one answer wins and a losing answer gets back the winner's answer. A stale question can still be answered as a new message. Questions flagged as secret are refused because answers live in the transcript. An autonomous child asks only its parent.
- **Why it matters:** agents need a way to stop and ask without losing the question or getting two answers.
- **Our version:** runs stay non-interactive. An author or intake run may write a questions file to `out/` (id, text, options, free text allowed or not) and finish. The control plane turns open questions into a new office item kind "question" and holds the package from pre-check until Ben answers. Each answer references the question id; the first answer wins and repeats return "already answered". Answers go into the next round's inputs and the event log. Secret-flagged questions are refused with a pointer to settings.
- Fit: Adapt · Effort: M · Priority: Next · Notes: A, B, C

### P07 Captures from outside, safely
- **What it does:** creates can carry a caller-chosen external id so a retry finds the original. Webhook triggers check a secret header and a delivery id, cap the body size, run filters before dedupe, reject empty keys (an empty id would never dedupe), map targets only by exact allowlisted names, and answer unauthenticated senders uniformly. Prompts wrap payload text as quoted data and tell the agent to treat it as data and fetch facts from the source of record.
- **Why it matters:** voice, chat and webhook clients double-submit, and outside text is the main injection path.
- **Our version:** an optional client-supplied id on capture create, with the response saying new or existing. When a capture comes from email, a webhook or a connector, write the outside text to inputs as its own file marked as data and say so in the intake brief; never splice it into `BRIEF.md`. A later webhook capture endpoint follows the rules above, with record-before-acknowledge.
- Fit: Adopt · Effort: S (id), M (webhook) · Priority: Next (id, data file), Later (webhook) · Notes: B, D

### P08 Scheduled captures
- **What it does:** routines wake an agent on a cron schedule with a timezone, or on a webhook. A concurrency policy decides what happens if work is already active; a catch-up policy decides what happens after downtime (one summary run, or skip). "Next fire" is shown, arming errors are reported apart from save, and every skip records a reason. A coordinator heartbeat ships on by default every five minutes, which the notes count as a quota trap.
- **Why it matters:** recurring reports without babysitting, with downtime behaviour made explicit.
- **Our version:** a scheduled capture record (template text, cron, timezone, skip-if-unreleased-draft-exists or always, catch-up one or skip) that fires through the normal capture path, so intake and release still apply. Every periodic job is created paused and shows its cost.
- Fit: Adapt · Effort: M · Priority: Later · Notes: B

### P09 Group packages under their capture
- **What it does:** tasks allow one level of children (deeper trees in Office). A parent can advance when all children are terminal, and the docs warn that terminal includes failed.
- **Why it matters:** one request often splits into parts.
- **Our version:** intake already emits sibling packages from one capture. Show them grouped under the capture, one level. A capture shows "all packages decided" only when each has an accept or reject decision; failed runs never count. Packages never share workspaces.
- Fit: Adapt · Effort: S · Priority: Later · Notes: A, B

### P10 Ideas we skip on purpose
- **Agent-to-agent messaging and negotiation** (A, B): agents agreeing an interface value by chat is the undocumented design input we exist to prevent, and the pre-check must not see author reasoning. Interfaces go through an interface record the owner approves.
- **Several sessions in one workspace, the per-session message queue, conversation forks** (A, C): runs are one-shot and each gets a fresh workspace from frozen inputs. If we add a "second opinion" author, it gets its own run and workspace.
- **Quick chat** (A): we have it as a capture answered without a package; keep that answer labelled unchecked.
- **Utility agents for small text** (A): our labels come from event types by design, never model prose.
- **Configuration chat and agents editing settings or profiles** (A, B, C): policies, packs and kernel functions are trust surfaces.
- **Custom agent registration from the UI** (C): adding a runtime is a trust decision that belongs in a signed pack change.
- **Live agent-built web apps in our origin** (B, D): deliverables are files with digests; see P51 for viewers.
- Fit: Skip · Notes: A, B, C, D

---

## 2. Review and decisions

### P11 Reviewed marks bound to the output digest
- **What it does:** a reviewer can mark each changed file reviewed. Each mark is tied to a fingerprint of the diff, so a later edit to that file drops the mark and flags the file for another look. Out of the box a mark is also set when the reviewer scrolls past a file; a toolbar setting turns that off.
- **Why it matters:** a person sees exactly what they have looked at, and a late change cannot ride on an earlier review.
- **Our version:** on the package view, each output carries a "reviewed" mark stored on the server with the output digest and the reviewer. A new round with a different digest clears it. Marking is a deliberate tick for engineering deliverables, with no mark on scroll. The accept panel shows unreviewed outputs (P13). Text outputs show a diff against the previous round; PDFs, drawings and map layers show previous and current renders side by side.
- Fit: Adopt · Effort: M · Priority: Next · Notes: A

### P12 Anchored review notes sent as one bundle
- **What it does:** a reviewer attaches comments to a line or a whole file, or to a region of a rendered preview or screenshot. One action sends every pending note to the agent at once. The send control stays locked until the backend confirms receipt, and notes edited in the meantime stay behind for the next send. When the outcome is unclear, nothing goes out again unless the person chooses to send it. Kandev keeps pending review notes only in one browser's storage, which its docs state plainly.
- **Why it matters:** precise, batched feedback is how a person steers rework.
- **Our version:** owner notes anchored to an output (line range for text, page and region for PDF, sheet and region for drawings, feature id for maps) stored on the server against the package revision and the artifact digest. A Return decision bundles all open notes, and the signed subject covers the notes. Notes made against an older digest are tagged as such. The next author round receives the notes and answers each one in `RESPONSE.md`. For visual outputs, store the rendered snapshot with the note so the record shows what Ben saw.
- Fit: Adopt (server-side from day one) · Effort: M to L · Priority: Next · Notes: A, B

### P13 Accept checklist computed from records
- **What it does:** Kandev lists what to confirm before Done: every change layer inspected, checks run, comments resolved, generated text reviewed, required approval kept outside the agent loop. A completion signal from an agent only proves the agent said so. The criteria are evaluated again at the moment of the last move, so evidence that has gone out of date cannot close the task.
- **Why it matters:** makes the human gate concrete.
- **Our version:** the accept panel shows a checklist built from records: each output reviewed at its current digest, pre-check outcome and open findings, open review notes, assumptions still needing confirmation, and design inputs all accepted. Unmet items block "accept" and allow "accept with findings" only with each gap named in the reason. The recheck at decision time is already in place: `applyDecision` recomputes the subject from stored rows inside the transaction and passes the digest comparison to the kernel (`work.ts:703-719`).
- Fit: Adopt (panel), Already have (recheck) · Effort: S to M · Priority: Next · Notes: A, B, D

### P14 Criteria map as a walkthrough
- **What it does:** an agent publishes an ordered tour of a change, each step an explanation plus a file and line range; the reviewer steps through with Previous and Next and can comment per step. Kandev checks only the shape, so anchors drift, and its docs say a walkthrough is not evidence.
- **Why it matters:** a guided tour shortens review of a large deliverable.
- **Our version:** the author writes a criteria map: for each acceptance criterion, the output and the anchor (section, page, line, sheet) where it is met. The package view renders it beside the outputs, labelled as the author's claim. Anchors are checked against output digests at completion; ones that do not resolve are flagged. The pre-check findings are the evidence.
- Fit: Adapt · Effort: M · Priority: Next · Notes: A, D

### P15 Rework loops with per-finding outcomes and fixed instructions
- **What it does:** automatic fixing of failed checks and review comments is capped (ten rounds per pull request), each feedback state is snapshotted so the same failure never triggers twice, and the agent must report an outcome per attempt: acted, not actionable, or blocked. The rule demanding an outcome report lives in host text that users cannot edit, so it holds whatever the saved prompt says. Server notices use fixed templates whose only variable is a link.
- **Why it matters:** iteration on outside feedback without loops or injected instructions.
- **Our version:** our capped loop exists (three rounds, then a dispute). Add a per-finding outcome in `RESPONSE.md` (fixed, not actionable with reason, blocked with reason) that the control plane parses; findings marked not actionable go straight to Ben and skip a further round. Our fixed rules block is already appended after the role brief by the control plane (`work.ts:387`, rules at `:305-310`); keep any system text we insert as a fixed template with ids and digests as the only variables.
- Fit: Adapt · Effort: S to M · Priority: Next · Notes: A, B

### P16 Uncertain outcomes are named and never retried blindly
- **What it does:** this theme runs through all four note files. Every create or command carries an idempotency key and the version the caller last saw. The same key with the same body returns the stored result; with a different body it is a conflict. Outcomes are typed (applied, already applied, no change, conflict, denied, not found, unavailable, uncertain). An uncertain outcome is never resent automatically; the UI says "status unknown", keeps the draft and blocks a second submit until it has re-read the state.
- **Why it matters:** a duplicate decision or a duplicate run is worse than a slow screen.
- **Our version:** idempotency keys and a stored receipt (key, body digest, outcome, resulting event sequence) on capture create, draft update, decide and runner complete. Decision challenges are already single use (`services/api/src/auth.ts:42-50`); add that a retry after a lost reply returns the stored Decision. After a timeout on decide, the web app re-reads the package's decisions and shows "Decision status unknown" until it knows. Runner complete is covered in P20.
- Fit: Adopt · Effort: M · Priority: Now (runner complete, via P20), Next (the rest) · Notes: A, B, D

### P17 Human-only acts stay outside every extension
- **What it does:** some acts are reserved for a person in the native UI: deleting a task tree needs a single-use preview tied to that person and a snapshot that expires in five minutes; answering an agent's permission or question through an extension needs a single-use receipt issued after a person chooses. Extensions cannot weaken completion criteria. Kandev relies on configuration to create human gates, so a configuration mistake can remove one.
- **Why it matters:** a confused or compromised extension cannot manufacture a human decision.
- **Our version:** our kernel and passkey already make this structural. Write the rule into the pack contract and the threat model: no pack UI, chat text or tool result counts as consent, and a pack action that leads to a decision can only open the host DecisionBar. Destructive acts use the same challenge-and-passkey path with a short expiry.
- Fit: Already have (write it down) · Effort: S · Priority: Next · Notes: B, D

### P18 Per-run outputs card with honest gaps
- **What it does:** after a turn, a card lists the files that changed in that turn with links to the historical diff. Partial capture is labelled with a reason, missing capture is never read as "nothing changed", and expired content is shown as expired with no current file put in its place.
- **Why it matters:** a person sees what each step did, honestly.
- **Our version:** on each run in the package view, list outputs with digest, size and a "changed since previous round" flag, from the stored trace. Say so when a trace is missing or partial. Never show current files as an old run's outputs.
- Fit: Already have (data), Adopt (display rules) · Effort: S · Priority: Next · Notes: A

---

## 3. Runs and the daemon

### P19 Claim lease, fencing token and an expiry sweep
- **What it does:** a run that cannot confirm the provider accepted its start stays pending and holds its slot; it is never sent again automatically and is never freed silently. Each management claim carries a generation number that every later write must present, so a former owner's late writes are refused at the point of effect. When Kandev confirms a run's owning process is gone, it marks the open work ended and never reports that as success or moves the workflow on.
- **Why it matters:** crashed work stops looking busy forever, and a slow worker can never write over a run it no longer owns.
- **Our version:** the claim returns a claim token and sets a lease expiry. Log posts renew the lease; the daemon sends an empty heartbeat batch when quiet. A sweep in the API retires runs whose lease expired as failed with cause "runner lost" (or a new terminal status), appends an event, and raises an office item; it never re-queues by itself when the agent produced output. Log and complete must present the claim token; mismatches are refused before the body is read and logged.
- Fit: Adopt · Effort: M · Priority: **Now** (build plan N2) · Notes: B, C, D

### P20 Completion outbox and idempotent completion
- **What it does:** the executor-side helper journals agent output on its own disk until the backend confirms it saved it, replays after reconnect, and never drops unacknowledged output. The docs say plainly that exactly-once execution is not guaranteed.
- **Why it matters:** finished work is not lost because the network blinked at the wrong moment, and outputs are evidence.
- **Our version:** a batch run's result is one completion body. The daemon writes it (outputs digests, trace) into the run directory before posting, and on start posts any unsent completions. The control plane accepts a repeat with the same run, token and digests as a no-op that returns the stored result; different digests return a conflict and raise a finding. A completion that arrives after the lease expired is stored as evidence on the retired run without reopening it. If processing the completion hits a refusal (bad output name, missing pre-check outcome, intake with no output), the run is recorded as failed with that reason, and that record survives the transaction.
- Fit: Adapt · Effort: S to M · Priority: **Now** (N2) · Notes: A, C, D

### P21 A run succeeds only with its completion record
- **What it does:** a step can require an explicit "step complete" signal before a turn end counts as done; without it a normal turn end counts. The docs warn the signal can hang a step if the agent never calls it, and that it proves only that the agent said so. A separate, opt-in rule lets a visible user Cancel run a step's completion actions; crashes, provider failures, parent stops and teardown never count.
- **Why it matters:** separates "the agent stopped" from "the agent claims it is done" from "a person agrees", and stops a crash from pushing work forward.
- **Our version:** a run is succeeded only when it writes its required record: `out/package.json` or an answer for intake, `out/verification.json` for pre-check, and for authors at least one deliverable plus a small completion manifest (deliverables, how each criterion is met, a handoff block: what was done, what is open, checks run, assumptions). A clean exit without it fails the run with "no completion record". The run timeout already prevents waiting forever. A stopped or failed run never advances a package.
- Fit: Adapt · Effort: S · Priority: **Now** (N3) · Notes: A, B

### P22 Stop a run, and stop the floor
- **What it does:** Kandev separates queue (information that can wait), interrupt (replace the current approach) and stop (halt with no replacement). A stop records the logical cancel first, then schedules teardown, and reports both; repeating it is a no-op that returns "not running"; a stop not confirmed after a while is called out. A workspace pause needs a reason, shows a banner with who and when on every page, blocks every launch path, sweeps queued and running work with a per-item result, and resume never replays cancelled work. An unreadable pause state is shown as unknown.
- **Why it matters:** a trustworthy off switch.
- **Our version:** (1) an owner "Stop run" on the package view and office. The control plane records the stop request as an event; the daemon learns it from the response to its next log post or heartbeat, kills the process group, and completes the run as stopped with whatever trace it has. The UI shows "stopping" until that lands. A stopped author run leaves the package in work with an office item: re-queue, return or reject. (2) Later, a "Stop the floor" control with a reason: claim refuses while stopped, the daemon stops each running run, the floor shows each result, and resuming re-queues nothing by itself.
- Fit: Adopt · Effort: M · Priority: **Now** for stop run (N5), Next for stop the floor · Notes: A, B, C

### P23 Runtime health and login probe
- **What it does:** each agent CLI counts as installed only when its executable is found and answers a version check. Probes sort each CLI into one of five outcomes (failed, unsupported, missing settings, missing binary, or needing sign-in), and a manual rescan refreshes without a restart. The status page warns that a CLI that works in the person's shell can be invisible to a service with a different PATH or user. An agent that is paused or errored is returned to service by a deliberate act, and the docs warn that this fixes nothing by itself.
- **Why it matters:** a clear "needs login" or "missing" state removes the most common first-day failure.
- **Our version:** the daemon probes each runtime at start and every few minutes (found on PATH, version answers, login looks present where the CLI can tell) and reports a runtime status with its claim or heartbeat. The office shows ready, missing, needs login, untested version or unknown per runtime, and unknown is never shown as fine. Queued runs whose runtime is unavailable show that reason. Today `Detect` only looks the binary up on PATH (`daemon/internal/runner/runtime.go:46-58`).
- Fit: Adapt · Effort: M · Priority: **Now** for the probe (N9, raised after observation), Next for the office display · Notes: B, C, D, E

### P24 Record what actually ran
- **What it does:** Kandev states two integration levels (a structured protocol with typed tool and permission events, and a raw terminal with none of them) and refuses to pretend a terminal agent has protocol features. Model lists are hints; at launch the environment's own catalog decides, any substitution writes one warning naming requested and effective model, and a per-profile switch makes a missing model fail before any inference. Requested modes and options must be confirmed by the agent before the first prompt.
- **Why it matters:** the model and mode are part of provenance, and nobody should assume a safety prompt existed when it did not.
- **Our version:** add to the execution trace the runtime mode (batch print mode in the MVP), the requested and the reported model (read from the stream's init or result event where the CLI reports it), the permission mode and the allowed tool list. A requested and reported model that differ raise a finding on the run. Amend ADR 0011 to say the MVP runs batch print mode, where ACP permission binding is not in force. Later, the daemon compares the first stream event with the baseline and kills a run whose mode, tools or model do not match.
- Fit: Adopt · Effort: S · Priority: **Now** (N8) · Notes: B, C

### P25 Launch flags that let the runtime write its outputs
- **What it does:** Kandev builds launch arguments as tokens with no shell, rejects malformed flags, and fails a launch whose wrapper prefix is invalid so an agent never runs quietly without its wrapper. One reader observed, outside Kandev's scope, that our Codex launch passes no sandbox flag.
- **Why it matters:** a runtime that starts in a read-only mode produces nothing, and the failure looks like a bad agent.
- **Our version:** launch Codex with an explicit sandbox mode that lets it write inside its run workspace, and with the flag that allows running outside a Git repository (or make each workspace a repository). Test that a configured sandbox wrapper that fails to start fails the run before the agent runs.
- Fit: Adopt · Effort: S · Priority: **Now** (N1) · Notes: C

### P26 Rate limits and capacity
- **What it does:** on a capacity or rate-limit error, Kandev may continue after backoff only when it can prove nothing unsafe happened (no output and no tool activity, or every tool confirmed), within a small attempt budget and a deadline, with an inline notice showing attempts, next try and a Cancel. Startup failures retry once, only for a short list of causes and only after confirming the old process is gone. Ordered fallback across providers classifies errors into transient and hard, never switches provider after an ambiguous started turn, and holds an account restriction until a person clears it. Late events from an old attempt cannot finish or be charged to the new one.
- **Why it matters:** Ben runs on personal subscriptions and will hit limits; blind retry can repeat side effects.
- **Our version:** the daemon classifies exit causes (retry after a time, needs login, missing model, invalid command, other) and reports the class. A rate-limited run with no tool calls and nothing in `out/` is re-run after backoff within a budget, each attempt an event; anything else fails with "rate limited after partial work" and an office item. Fallback to the other runtime comes later and only when it keeps the pre-check on a different runtime (P27).
- Fit: Adapt · Effort: M (classify, retry), L (fallback) · Priority: Next, Later for fallback · Notes: A, B, C

### P27 Pre-check independence survives routing
- **What it does:** Kandev keeps a persistent agent identity apart from the execution profile and from where it runs, so a provider switch changes neither ownership nor history. It has no rule that a reviewer must run on a different provider.
- **Why it matters:** our independent pre-check is a core promise; routing and fallback must not quietly erode it.
- **Our version:** today the pre-check prefers a runtime other than the author's but falls back to the same one (`work.ts:236-241`), and the kernel compares baseline names, which always differ because they carry a role prefix (`work.ts:420`, `kernel/src/transition.rs:146-153`). On a Mac with one runtime the pre-check runs on the author's runtime and the record notes only a shared mechanism. Hold such a pre-check with a visible reason, or let Ben proceed with a recorded owner override. Later, give agents named seats (P44) and keep the independence check at claim time.
- Fit: Adapt · Effort: S · Priority: **Now** (N4) · Notes: A, B, C

### P28 Recovery choices for an interrupted run
- **What it does:** after a restart Kandev restores a session only when it can verify the saved identity; anything uncertain stays blocked with recovery controls in order of safety: resume, inspect read-only, start fresh only if the provider never accepted the prompt, or continue from saved context as a new conversation. The warning stays until a person acts.
- **Why it matters:** avoids silent double work and gives graded choices.
- **Our version:** an interrupted run ends failed or stopped with a cause. The office shows "run interrupted" with: inspect workspace (read-only view of `out/` and the log), re-queue the same round from frozen inputs as a new Run linked to the old one, or return the package. Never re-queue automatically when the agent produced output or tool activity, or when its baseline allows outside effects.
- Fit: Adapt · Effort: M · Priority: Next · Notes: A, C

### P29 An explicit environment and a private home for each run
- **What it does:** each agent declares variables that must never reach it and ones it needs. Containers get a per-execution folder seeded with only the agent's auth files, never the whole home. Copied config files are treated as grants: allowlisted, size-capped, owner-only, never returned by the API. All sessions under one OS user can read each other's credentials, and the docs say so.
- **Why it matters:** stops control-plane secrets and other runs' files reaching an agent.
- **Our version:** the daemon already strips every `CONTROLROD_` variable (`runtime.go:60-71`). With the srt sandbox driver, move to an explicit allowlist per runtime (HOME, PATH, LANG, TMPDIR, the vendor's auth variables), give each run a private HOME with read-only auth files only, and let a run read only its own run directory. Record the allowlist digest in the trace. State in the threat model that until then agents run as Ben's macOS user with the tool allowlist as the only fence.
- Fit: Adapt · Effort: M · Priority: Next · Notes: B, C

### P30 Workspace ownership marker and retention
- **What it does:** cleanup deletes only resources whose full recorded identity and a per-create random nonce match; anything it cannot prove it made is kept, and the cleanup stops with an error instead of guessing. Archive in Kandev deletes worktree files including uncommitted ones, which its docs warn about repeatedly. Orphans go to a quarantine with a delete-after date. Two versions of a package are kept for rollback; a past release leaked old versions forever.
- **Why it matters:** laptops fill up, and cleanup must never destroy evidence or someone else's files.
- **Our version:** each run directory gets an owner marker (run id plus random nonce, also in the trace). A retention job moves directories of accepted or closed revisions to a quarantine after N days and deletes them after M more, only when the marker matches and no open finding refers to them. Packages are never deleted; closed is a state. A disk-use warning at 80 percent.
- Fit: Adapt · Effort: M · Priority: Next · Notes: A, C, D

### P31 Queue visibility and per-role concurrency
- **What it does:** steps can cap active tasks; overflow is shown as queued with its position. A separate limit caps automatic starts, while a manual start can exceed it. A dependency resolving makes a task eligible and never bypasses capacity.
- **Why it matters:** protects the machine and the subscription, and keeps waiting work visible.
- **Our version:** show queue position and "waiting for a free slot" on queued runs; a per-role concurrency setting in the daemon (for example one pre-check at a time on a laptop); an owner "run now" that exceeds it is logged. Show each queued item's origin (owner decision, kernel transition, retry); items already claimed cannot be cancelled from the queue.
- Fit: Adapt · Effort: S to M · Priority: Next · Notes: A, C

### P32 Stage timings in the trace
- **What it does:** each launch writes one record per stage with an attempt id and outcome, and says what the total does not measure.
- **Why it matters:** shows where time goes.
- **Our version:** an optional timings block in the trace: workspace prepared, process started, first event, last event, outputs collected, completion posted.
- Fit: Adapt · Effort: S · Priority: Next · Notes: C

---

## 4. Office and people

### P33 One plain "why is this waiting" line
- **What it does:** Kandev's troubleshooting order: confirm the workspace, read the task's gate (blockers, children, a question, a pending decision), check pause and agent status, read the latest run, check provider setup and login, check budgets, and only then retry once. It warns against duplicate tasks or repeated clicks.
- **Why it matters:** most stuck work waits on a decision or a barrier.
- **Our version:** a server function that returns one reason per package in that order (floor stopped; waiting on Ben to release or accept; waiting on an upstream package; pre-check round N running; runtime limited until a time; runtime needs login; no daemon seen for N minutes; last run failed). Shown on the package page and in office items.
- Fit: Adopt · Effort: S · Priority: Next · Notes: B

### P34 An office that raises attention only for real asks
- **What it does:** a deck of tiles, one per live conversation, showing status and any explicit question or permission request; ordinary waiting is not a question. Questions, permissions and recovery actions never hide. When a tile clears, focus moves to the next, else the previous. A coordinator's "Needs you" page lists what needs a person and never moves, merges or stops a task itself.
- **Why it matters:** one person can supervise several agents at a glance.
- **Our version:** the office keeps its role as Ben's queue. Add an "at work" strip, one tile per running run with label, round, role and elapsed time, and a quiet indicator after a stretch with no activity (with a calm note that long tools are silent). Only explicit asks (question, dispute, interrupted run, release, accept) raise attention styling. Document that intake and the office never change package state.
- Fit: Adapt · Effort: M · Priority: Next · Notes: A, C

### P35 Recovery card and a persistent error strip
- **What it does:** a failure shows one recovery entry with the recommended action first and each alternative as its own button; details are collapsed, bounded and redacted, with a copy button that copies exactly what is shown. Repeats do not add entries; resolved and dismissed items stay in history with honest labels. A task-level failure shows a strip that persists across tabs until fixed.
- **Why it matters:** one clear place to act.
- **Our version:** a failed or interrupted run produces one office item and one banner on the package view, recommended action first (re-queue, inspect, return), redacted daemon error and last log lines collapsed. Resolution is an event shown as resolved or dismissed.
- Fit: Adopt · Effort: S to M · Priority: Next · Notes: A, C

### P36 Status where unknown is never green
- **What it does:** coordinator autonomy shows Active, Held (reason), Paused (who and when), Off, or State unavailable with Try again, and unavailable never means healthy. The live connection shows a yellow indicator after three seconds without recovery and red after ten. Diagnostics separate "database down" from "provider limiting" from "busy".
- **Why it matters:** a glanceable screen must not lie.
- **Our version:** a system status card: Postgres, event chain verified at a time, kernel loaded, daemon last seen, runtimes ready, disk use, Mac kept awake. A connectivity indicator in the office header with the same two thresholds and "last update N seconds ago". A database failure returns one stable 503 code across the API.
- Fit: Adopt · Effort: S · Priority: Next · Notes: A, B, C

### P37 Live feed that resumes from a sequence
- **What it does:** Kandev's ordinary notifications are lossy hints; after a gap the client refetches. Its conversation stream is ordered, with sequence numbers, cursors, replay on reconnect, and a restart-safe revision so a late older snapshot cannot overwrite newer state.
- **Why it matters:** Ben never sees a stale "running" or misses a "needs your decision".
- **Our version:** our events are already sequenced in a hash chain with a list-after route (`services/api/src/app.ts:224-227`). The stream sends no event id and reads no resume point (`app.ts:232-246`). Send the sequence as the event id, accept the standard last-event-id header, replay from the chain before going live, refetch on gaps, and ignore a late read older than the last applied sequence. Reconnect with capped backoff and jitter.
- Fit: Adapt · Effort: S · Priority: Next · Notes: C

### P38 Local notifications
- **What it does:** notifications for a finished turn, a question, a failure and an update, deduplicated by an occurrence id, with a "Send test notification" button. Saving a provider config is atomic per provider.
- **Why it matters:** Ben will not watch the office all day.
- **Our version:** browser notifications from the event feed for decision needed, dispute, question, run failed and runner lost, deduplicated by event sequence, with a test button. Later, macOS notifications from the launch agent.
- Fit: Adapt · Effort: S · Priority: Next · Notes: A, C

### P39 Phone access and phone decision sheets
- **What it does:** three supported paths to one origin: Tailscale Serve inside a tailnet limited to one identity, Cloudflare Access, or a VPN. A web manifest allows home-screen install. On phones, confirmations open as bottom sheets sized to the decision with buttons above the safe area; swipe or backdrop means cancel; cancel restores the prior list and scroll; one decision open at a time; no secret values shown.
- **Why it matters:** Ben wants to release and accept from his phone.
- **Our version:** recommend Tailscale Serve; register the passkey on the tailnet hostname from the start (the relying party id is already configurable, `services/api/src/server.ts:54`). A DecisionBar sheet on narrow screens showing title, revision, digest prefix, pre-check outcome and the sign button; signing needs a deliberate tap and the passkey prompt.
- Fit: Adopt · Effort: S · Priority: Next · Notes: B

### P40 Spend ledger and caps for unattended runs
- **What it does:** costs per agent, project, model and provider; a default daily ceiling blocks new unattended launches; policies add limits with notify, pause or block actions. Spend that cannot be measured shows as unknown. Admission checks before launch, so a run can overshoot. Unattended coordinators need a cost ceiling, an explicit switch and four containment conditions.
- **Why it matters:** unattended agents can run up cost; a forgotten setting should not cause a large bill.
- **Our version:** a ledger entry per run (runtime, wall time, tokens if reported, otherwise unknown, in integers with an observed, estimated or unknown state). A daily cap on unattended runs (pre-checks and retries) checked at claim; unknown counts against the cap. ADR 0014 already places hard caps before dispatch.
- Fit: Adapt · Effort: M · Priority: Later · Notes: A, B, D

### P41 Earned autonomy and self-review without self-change
- **What it does:** only one low-risk permission (creating a card) can be raised to automatic, and only after measured conditions are met (age, volume, approval rate, no undos, a recent review by the person), shown as Met or Not met with values; the first undo lowers it again. A daily "Learning" report proposes changes to the coordinator itself and applies nothing; people rate items.
- **Why it matters:** trust granted from history and withdrawn on the first mistake.
- **Our version:** later, intake drafts could land as ready-to-release once intake has a measured record. Release itself stays a signed act. Extend metrics with "drafts released without edits" and "returns per accepted package".
- Fit: Adapt · Effort: M · Priority: Later · Notes: A

### P42 People and permissions for a second user
- **What it does:** accounts are off by default (anyone who reaches the port is an administrator); invites, personal tokens, workspace roles with shell access split from prompting, named permission scopes shared by UI and API, an organization tree where placement decides reach and nothing subtracts, private compute bound to its creator, and a separate human owner field on tasks.
- **Why it matters:** least privilege that is easy to read when a second person arrives.
- **Our version:** passkey login from day one and a loopback bind already exist. Later: an owner field on packages; tokens that can create captures and read but never sign; roles of owner, contributor and viewer with signing as a separate Cedar right per decision kind; a generated list of Cedar actions the web app uses to hide controls; a daemon that claims only work released by signers allowed to use it. Never allow removal of the last passkey that can sign.
- Fit: Adapt · Effort: M to L · Priority: Later · Notes: B

### P43 Persistent agent seats
- **What it does:** a persistent team member (name, role, instructions, skills, memory, history) is kept apart from its execution profile and from where it runs; a ticked skill also shows whether it actually reached the environment.
- **Why it matters:** people think in terms of "my checker" while the available model changes week to week.
- **Our version:** an agent seat in the pack (role file, runtime preference, limits); runs record the seat; the floor labels by seat. Show "briefs delivered" from trace input digests next to what the pack says should be delivered. If memory is ever added, scope it per seat, write it only through an accepted package, and never mount author memory into a pre-check.
- Fit: Adapt · Effort: M · Priority: Later · Notes: B

---

## 5. Packs and extensions

### P44 Pack manifest checked before anything runs
- **What it does:** each extension has one manifest that the host validates before extracting or running anything: identity pattern, closed lists for categories and surfaces, platform binaries, clean relative paths, size and list caps, host-owned fields ignored if an author sets them. A minimum host version is enforced (except in development builds, which the docs flag).
- **Why it matters:** the host has one place to check every claim a package makes.
- **Our version:** a `PackManifest` record in `spec/` with id, version, target contract version, roles (pointing at brief files), tools, templates and typicals, viewers, required settings, and requested permissions (egress hosts, data lanes, record kinds). The API validates every pack at startup and refuses unknown keys and known-but-unwired values. Host-owned fields live in a separate install record. No development exemption.
- Fit: Adapt · Effort: M · Priority: Next · Notes: D

### P45 Pack digest in the agent baseline and every trace
- **What it does:** each package carries a checksum list that must cover every file; the installed manifest digest is carried on every privileged command, so a command written against one version is refused after a change. Reinstalling the same version with different bytes is refused.
- **Why it matters:** the record shows exactly which package produced a result.
- **Our version:** when the control plane builds a job, compute a tree digest of the pack folders it draws on (role brief, templates, typicals, tool source and lock files) and record it in the Run's baseline and the trace, as ADR 0018 already does for the CADCraft commit. A pack version whose digest changed under the same version number is refused at load.
- Fit: Adopt · Effort: S · Priority: Next · Notes: D

### P46 Declared permissions build the allowlist
- **What it does:** an extension can call the host only through methods it declared, checked before the handler runs, with a named error for an undeclared call. Two calls are ungated, including reading its own secrets. Writes go through the same path as the UI and stamp the extension as author. The docs say this gating is no sandbox.
- **Why it matters:** a short list tells a person the most a package can do.
- **Our version:** the pack manifest lists egress hosts (for site-concept: the public data sources it queries), record kinds and tools. The daemon builds the sandbox network allowlist and the Claude Code allowed tools from it, intersected with what the project allows; `inputs/TOOLS.txt` stops being the source. Denials are logged with pack id and missing permission. No ungated calls.
- Fit: Adapt · Effort: M · Priority: Next · Notes: D

### P47 Packs are approved before they run, and changes wait in a pending lane
- **What it does:** at boot only previously active extensions resume; newly dropped ones register disabled until a person syncs. Releases are immutable; one that asks for new access stays pending until a person approves exactly that release, its permission digest and grant generation. Rollback never restores a grant a person revoked. Declaring a capability is a ceiling; a manager grants a subset per workspace, with a reason and audit.
- **Why it matters:** copying files onto a machine is no approval, and updates never widen access silently.
- **Our version:** packs whose digest has no approved install record load as unapproved and jobs needing them wait with a plain reason. Approval and any widening of a pack's permissions are passkey-signed acts bound to the permission-declaration digest. Unknown permission kinds cannot be approved. Per-project grants come when other people bring packs.
- Fit: Adapt · Effort: M · Priority: Later · Notes: D

### P48 Pack tools with schemas, deadlines and host-supplied identity
- **What it does:** the host names each extension tool. A tool must describe what it accepts, may describe what it returns, and can carry hints such as read-only or destructive. Each call has a 30-second limit and a 1 MiB cap on its result, and a failed call is not repeated. Which task, session and workspace a call belongs to comes from the host's own records; nothing in the arguments can change it. Every MCP call is checked against the live schema first, and missing-field errors name fields without echoing values. A surface that no provider has passed tests for is refused.
- **Why it matters:** "agents never type a number" depends on tools being called correctly.
- **Our version:** declare `cr-site` subcommands as pack tools with input and output schemas generated from `spec/`. The daemon injects package, revision and run id, enforces a per-call deadline and output size, and records each call and its digest in the trace; validation failures become findings. Refusals name the field without echoing the value (today a bad output name is echoed, `work.ts:492`).
- Fit: Adopt · Effort: M · Priority: Next · Notes: B, D

### P49 Pack settings with readiness gating and keychain secrets
- **What it does:** an extension declares a small settings schema; secret fields go to an encrypted vault and come back as a fixed mask; a missing required setting shows "Setup required" and hides the extension's tools from agents until filled. Secrets are referenced from profiles, resolved at launch, fail closed when missing, cannot be deleted while referenced, and a conflicting value for one variable fails the launch.
- **Why it matters:** an unconfigured connector cannot be half-ready, and secrets never go back to the browser.
- **Our version:** a settings block in the pack manifest; intake does not offer a pack's roles until its settings are complete. On the Mac, secrets live in the keychain, are never written into job inputs, are passed only to the tool that needs them, and are listed by name only in the trace. Revealing a secret needs a passkey assertion.
- Fit: Adapt · Effort: M · Priority: Next (settings), Later (secrets) · Notes: B, C, D

### P50 Viewers in isolated frames on their own origin
- **What it does:** agent-built static apps run in a sandboxed frame with no remote scripts, forms that cannot post outward, only person-approved exact HTTPS origins, and a short-lived capability token checked on every request. A host-owned bootstrap must acknowledge the current attempt before the app shows; failure controls render outside the frame; any change of release or grant tears the frame down. The docs accept that the frame shares the host origin and so has the viewer's session.
- **Why it matters:** domain teams can ship rich viewers without acting as the user.
- **Our version:** extend output preview into a viewer registry. Built-in viewers stay first party. A pack may declare viewers (a drawing sheet viewer with the CADCraft renditions and their digests, a PDF page viewer with markups saved as records keyed to digest, page and position, a map layer viewer showing each layer's source, retrieval time and response digest). Pack viewers live on a separate origin or a sandbox without same-origin rights. The DecisionBar and the digest of what is shown always render outside the frame, and the sign button stays disabled until the frame acknowledges rendering the exact digest being decided. A first step is a host-owned digest display beside every preview.
- Fit: Adapt · Effort: L (first step S) · Priority: Next · Notes: B, D

### P51 Verify artifact bytes before serving them
- **What it does:** release files live outside the database; on startup, and again before anything is served or run, the host confirms that the recorded fingerprint and location still match. A changed file is marked unavailable and is never served or silently removed.
- **Why it matters:** a restore or disk problem can never make the host show something other than what was recorded.
- **Our version:** in `packageOutput` and any viewer route, hash the bytes and compare with the stored sha256; on mismatch refuse with "output changed since it was recorded" and append an event. Today the bytes are returned unchecked (`work.ts:185-193`, served at `app.ts:157-159`).
- Fit: Adopt · Effort: S · Priority: **Now** (N6) · Notes: D

### P52 Same-origin check on cookie-authenticated routes
- **What it does:** for cookie-authenticated calls the host accepts a request only with an accepted origin header, or with none and a fetch-site header of same-origin or none. Token-authenticated callers skip the check because tokens are not sent automatically. Origin checks on the live socket reduce accidents but are no identity.
- **Why it matters:** a page on another site, or another local port, cannot use Ben's session.
- **Our version:** a hook on every state-changing route authenticated by the session cookie that applies the same rule against the configured origins; runner routes use the bearer token and skip it. Tests for cross-site refusal. Never accept tokens in a query string.
- Fit: Adopt · Effort: S · Priority: **Now** (N7) · Notes: C, D

### P53 Immutable identities for outside things
- **What it does:** links to outside systems are keyed by provider, connection, an immutable id and a number; names, paths and URLs are display data. Candidates from a search are re-authorized at submission. Cursors are bound to their query and a repeated cursor stops the loop.
- **Why it matters:** a renamed or recycled outside object cannot inherit authority.
- **Our version:** records refer to parcels, drawing numbers, client document numbers and map features by an immutable source id plus source system, with display numbers as separate fields. Public-data facts keep source URL, query, time and response digest, and a reference a decision depends on is rechecked at decision time.
- Fit: Adapt · Effort: S · Priority: Next · Notes: D

### P54 Constrained structured summaries
- **What it does:** agents can return a small presentation built only from a fixed catalogue (text, table, chart, status list, metrics, callout, file preview) with strict size limits, no markup or scripts, and charts that need a plain summary. Table and chart values read from a workspace CSV are stored with the result.
- **Why it matters:** clear agent summaries with no injection surface.
- **Our version:** an optional summary file in `out/` in such a shape, rendered on the package page, where every number traces to a CSV output whose digest is in the trace; anything else is refused.
- Fit: Adapt · Effort: M · Priority: Later · Notes: B

### P55 Exports and transmittals with an inventory
- **What it does:** an export first fetches a manifest of exact files and bytes; the download must name that manifest revision or it is refused, and an unchanged workspace exports byte-identical output. Sharing prepares a bundle that lists files, sizes and a privacy reminder, and expires in 15 minutes or on any change.
- **Why it matters:** exports you can diff and trust; people see what leaves before it leaves.
- **Our version:** "export package record" produces a deterministic archive whose manifest lists each file digest and the event range with its head digest. A transmittal export lists every file with digest and size, asks Ben to confirm a "no private content" check, binds to the revision and the decision, and expires if anything changes.
- Fit: Adopt · Effort: S to M · Priority: Later · Notes: B, D

### P56 Packs synced from a repository, failing closed
- **What it does:** a repository folder can be the source of truth for definitions. Each run reconciles fully; identity comes from kind and declared name; the sync touches only records it created itself; a file it cannot parse leaves the earlier record as it was; going over the file-count or size limits aborts the whole run, because a partial download read as complete would remove records wholesale; an existing but empty folder deletes unused synced items (a trap); runs are not pinned to a commit; one owner at a time (UI, files or repo). Import is not one transaction and drops unknown fields.
- **Why it matters:** config as code that cannot destroy data on a partial read.
- **Our version:** packs load from the repository at a pinned commit, all or nothing; an empty or unreadable source changes nothing; safety settings and policies never come from a pack; a sync that changes a role brief produces a pending change that needs Ben's signature. Later, a private pack index built in CI from tagged releases that keeps the last good record when a new build fails.
- Fit: Adapt · Effort: M · Priority: Later · Notes: A, B, D

---

## 6. Operations on the Mac

### P57 One launcher and a user launch agent
- **What it does:** one command starts the backend, picks ports, probes health with a per-launch secret so it knows it reached its own process, waits for readiness while printing the startup phase, and on failure prints a short classified summary (binds tried, last outcome per target, config used, log path, one next step). The CLI installs a user or system service with an absolute binary path, a small fixed environment, restart on failure and a stop timeout; uninstall keeps data. Documented service pitfalls: a port flag that has no effect, contradictory macOS job flags, services installed from a temporary cache that break later, and a first system install from a root shell that must name its service account explicitly.
- **Why it matters:** Control Rod should be running whenever Ben opens the laptop, without a terminal.
- **Our version:** `controlrod up` checks Postgres, starts the API with a per-launch health token, waits for readiness, runs the daemon loop, prints the URL, and on failure prints the same kind of summary; `controlrod down` drains. `controlrod service install|uninstall|start|stop|status|logs` writes a launch agent in Ben's user session (subscription logins live there), never a system daemon. Refuse to install from a temporary or cache path; test the generated plist; status says "reinstall needed" after an upgrade.
- Fit: Adapt · Effort: M · Priority: Next · Notes: C

### P58 PATH repair for launchd
- **What it does:** apps started by the OS get a thin PATH; Kandev keeps the inherited PATH and appends common tool locations, honours explicit command paths, and warns that shell aliases are not executables and credentials in shell startup files are invisible to services.
- **Why it matters:** "works in Terminal, fails as a service" is the most common setup failure.
- **Our version:** the daemon builds its lookup PATH from the inherited PATH plus `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin` and the npm global bin, accepts an explicit path per runtime, logs the resolved path, and gives the child the same PATH. Today it uses the inherited PATH only (`daemon/cmd/controlrod/main.go:73`).
- Fit: Adopt · Effort: S · Priority: Next (with P57) · Notes: C

### P59 Readiness with startup phases
- **What it does:** liveness answers as soon as the listener accepts; readiness returns 503 with a phase label (opening database, migrating, recovering) until ready; both report the version without credentials. Startup finishes database work before schedulers start.
- **Why it matters:** "starting or broken" has a clear answer.
- **Our version:** the API has a liveness route only (`app.ts:94`). Add readiness that checks Postgres and the kernel load and reports the startup phase and the last chain verification; the launcher waits on it.
- Fit: Adapt · Effort: S · Priority: Next · Notes: C

### P60 One home, one owner
- **What it does:** everything lives under one home folder with a fixed layout, created owner-only; only one backend may hold a home folder at once and a second gets a clear conflict naming the owner; uninstall never deletes it.
- **Why it matters:** one place to back up, and no two processes corrupting each other.
- **Our version:** document the `~/.controlrod` layout (token, config, work, logs, backups, run outboxes). The daemon takes an exclusive file lock at start and a second daemon exits with the owner's PID; create the home 0700. Today nothing locks it (`daemon/internal/runner/daemon.go:33-43`).
- Fit: Adopt · Effort: S · Priority: Next · Notes: C, D

### P61 Keep the Mac awake while runs are active
- **What it does:** an opt-in setting holds one OS idle-sleep prevention while any session runs and releases it when the last settles; lid close and explicit sleep still win; failures show in the setting.
- **Why it matters:** idle sleep kills long runs and causes stuck runs.
- **Our version:** the daemon holds a macOS idle-sleep assertion while at least one run is active and reports "keeping Mac awake: yes or no" in its status. A flag turns it off.
- Fit: Adopt · Effort: S · Priority: Next · Notes: C

### P62 Bounded logs with privacy defaults
- **What it does:** one active log with size-based rotation and a total cap so bursts keep the newest evidence, owner-only files, concise console output, and a debug mode whose protocol logs (which hold prompts and files) have their own limits. Tracing export in Kandev forces an insecure connection and can carry raw payloads, which its docs admit.
- **Why it matters:** logs never fill the disk, and sensitive output is opt-in.
- **Our version:** API and daemon write to `~/.controlrod/logs` with rotation and a total cap. Never log model prose; raw stream output stays in the run directory. Any future tracing carries ids and labels only and requires TLS.
- Fit: Adopt · Effort: S · Priority: Next · Notes: C

### P63 Backup and a verified restore
- **What it does:** snapshots are written privately and published atomically. Restore needs a typed confirmation, copies the snapshot beside the live file, integrity-checks it, and touches live data only after it passes, with quarantine and rollback if install fails. The docs list what a database backup leaves out (the key file, worktrees, CLI logins, outside objects) and recommend testing every backup by restoring it. A snapshot is taken before schema changes; one-way cutovers cannot be rolled back without the matching backup.
- **Why it matters:** Ben's signed decisions and evidence are the product.
- **Our version:** `controlrod backup` runs a database dump plus a tar of `~/.controlrod` (work folders optional) with a digest manifest that also lists what it does not contain. `controlrod restore` restores into a scratch database, recomputes the hash chain and verifies every decision's passkey assertion against its digest, and swaps only when both pass. A dump is taken and test-restored before any schema change; schema steps never rewrite event rows. A backup is labelled tested only after a restore check.
- Fit: Adopt · Effort: M · Priority: Next · Notes: C, D

### P64 One config file and one validation rule
- **What it does:** defaults, then the first config file found, then environment variables; a settings file that cannot be read or parsed halts the launch, and the error says which file. The notes list several settings that are parsed but do nothing and mixed rules for bad values (silent fallback for some, failure for others).
- **Why it matters:** operators can predict what a typo does.
- **Our version:** `~/.controlrod/config` read once by the daemon and API launcher, environment overrides, one schema, any invalid value stops startup naming the key and source, no accepted-but-ignored fields. Print the resolved config source at start.
- Fit: Adopt · Effort: S · Priority: Next · Notes: C

### P65 Aggregate counters only
- **What it does:** a debug counters endpoint exposes gauges and never uses task or session ids as labels.
- **Why it matters:** health numbers without leaking work details.
- **Our version:** keep metrics aggregate; add queue depth, runs running, runs lost to lease expiry, completions replayed from the outbox, and chain length.
- Fit: Adapt · Effort: S · Priority: Next · Notes: C

### P66 Loopback by default, and an incident runbook
- **What it does:** Kandev binds to all interfaces by default with no login, and warns about it on many pages. Its incident checklist (restrict network, rotate every reachable credential, preserve evidence, rebuild disposable executors) admits there is no complete audit log.
- **Why it matters:** a laptop on café Wi-Fi should not expose an agent controller; and our hash-chained log is a real advantage.
- **Our version:** the API already binds to 127.0.0.1 (`server.ts:70`). Add a refusal to bind wider without TLS in front. A short incident runbook in `docs/sqa`: stop the floor, revoke the daemon token, rotate runtime logins, verify the chain, export records. A "where to run it" page: Mac only, Mac plus phone over a tailnet, team server.
- Fit: Already have (bind), Adopt (runbook) · Effort: S · Priority: Next · Notes: B, C

### P67 Later operations ideas
- Feature toggles with an environment lock, a fourth "unavailable" state, kill switches and an append-only list of retired names (C, D).
- A diagnostic bundle with a manifest of sources, ranges and truncation, excluding transcripts by default (C).
- An update channel that applies exactly the version shown and never downgrades silently (C).
- An offline maintenance command that reports first and deletes only with a flag, after a fresh verified backup (C).
- Raw run logs moved out of the runs table into files referenced by digest (C).
- Fit: Adapt · Effort: S to M each · Priority: Later · Notes: C, D

---

## 7. Engineering practice

### P68 Honest feature status
- **What it does:** each capability is labelled Supported, Dependency-bound, Limited, Experimental, In progress or Internal, and a feature is called shipped only after three things line up: the server does it, a user can reach it, and tests cover it. A stored field or an unlinked route on its own leaves it unshipped. Declared contract surfaces that no provider can use yet are marked unusable.
- **Why it matters:** roadmap items are not read as product.
- **Our version:** a feature status page in `docs/sqa` using the same rule (contract, route and test before "supported").
- Fit: Adopt · Effort: S · Priority: Next · Notes: A, D

### P69 Acceptance checklists for packs and runtime adapters
- **What it does:** an extension counts as finished only after it is checked end to end: it can be found and set up, keeps its state, runs and recovers, meets the security rules, and has tests, a package and user docs. A new agent integration must prove detection (installed, missing, ambiguous), exact arguments, required and stripped variables, start, cancel, resume, shutdown, missing login and missing credential paths; real-agent tests run apart because they cost money. A toggle that only changes the UI is forbidden.
- **Why it matters:** a pack that registers but cannot recover is not done.
- **Our version:** a pack checklist and a runtime adapter checklist in `docs/sqa` (adding our own items: token never in the environment, trust files unwritable, version and model recorded). A separately tagged real-runtime suite Ben runs by hand on his Mac. Change records that add or change a pack tick the checklist with evidence.
- Fit: Adopt · Effort: S · Priority: Next · Notes: C, D

### P70 Evidence of what was run, in every change record
- **What it does:** prove each rule with the smallest test that can show it, and add a test at the real process or database edge when behaviour crosses one; browser tests each get their own backend, home and database; never sleep for fixed times; contributors write down what they ran, what came back, and which suites they left out and why.
- **Why it matters:** reviewers see what was actually proven.
- **Our version:** our change records already carry commands and results. Make "suites skipped and why" a required line in `verification.md`, and keep the no-fixed-sleeps rule in daemon and web tests.
- Fit: Already have (mostly) · Effort: S · Priority: Next · Notes: D

### P71 Docs coverage check
- **What it does:** docs ship with each change; each page has one type and audience; a validator requires every settings route and agent tool to have exactly one owning doc area, and rejects broken links and missing assets. Media for docs comes from disposable mock instances with a hash manifest.
- **Why it matters:** docs cannot fall behind unnoticed.
- **Our version:** a coverage file mapping every route in `spec/api.tsp`, every pack role and every pack tool to a doc page plus source and test files, checked in CI (a CI change needs Ben's signature). Screenshots for docs come from a fake-runtime instance.
- Fit: Adopt · Effort: M · Priority: Next · Notes: D

### P72 Red-team cases from the gaps Kandev admits
- **What it does:** Kandev admits that an agent able to reach its main API could try the same settings edits as the UI, and that a per-boot token is only an interlock an agent can replay.
- **Why it matters:** an agent widening its own powers through the product's own settings is a real path.
- **Our version:** red-team cases where a run tries to reach the control plane on loopback and to edit its own role file; both must fail. Record in the threat model that Claude Code's own login on Ben's Mac is readable by the agent process. `tests/redteam/` is a trust surface and needs Ben's signature.
- Fit: Adopt · Effort: S · Priority: Next · Notes: B

### P73 Small practice rules
- An agent that finds a change touches an ADR-level decision with no accepted ADR stops and reports (D). Adding it to `AGENTS.md` goes through Ben.
- A separate home and database for development, and a launcher check that refuses to run tests against the real database name (D).
- Schema changes as ordered, re-runnable steps, with an upgrade test from a fixture taken at a tagged release (D).
- Baseline revisions (runtime versions, pack digests, the CADCraft commit) are immutable; any change makes a new revision and reruns conformance checks; a label is never reused for different bits (D).
- Generate reference tables (such as event kinds) from `spec/` (D).
- Fit: Adopt · Effort: S each · Priority: Next (first three), Later (rest) · Notes: D

---

## 8. Pitfalls Kandev admits, and what we take from them

| # | What Kandev's docs admit | Lesson for Control Rod | Notes |
|---|---|---|---|
| 1 | Moving a card proves nothing; board position, workflow step and live activity are three things people confuse. | Package status is kernel-owned; one computed "why waiting" line (P33). | A, B |
| 2 | In Office, agents record approvals and a person's "looks good" does not satisfy a gate. | Confirms our choice: only a person decides, and the screen says so. | B |
| 3 | One blocker mode treats failed prerequisites as done, so dependents proceed after a failure; child completion fires on any terminal state. | Unblock and roll up on acceptance only. | A, B |
| 4 | Default bind is all interfaces and accounts are off, so network reach equals administrator. | Keep loopback and passkeys; refuse a wider bind without TLS. | A, B, C |
| 5 | Some "manual move" rules and hidden buttons are UI-only; a per-browser "Enabled" switch does not stop server pollers. | Every rule that matters lives in the kernel or policy; no server-effect toggle in client storage. | A, B |
| 6 | Pending review comments live in one browser's storage. | Review notes are evidence and live on the server from day one. | A |
| 7 | Walkthrough anchors are never checked and drift. | Check anchors against output digests; label author claims as claims. | A |
| 8 | Plan history merges edits within five minutes. | One event per change. | A |
| 9 | Archive deletes uncommitted and ignored files; uninstall deletes all state with no grace period; watch "Reset" deletes every created task. | Never delete unreported work; packages are never deleted; no destructive reset on records. | A, B, C, D |
| 10 | A worktree isolates files only; app permissions do not sandbox the shell; every person on the server works through the same operating-system account, so they all use its agent sign-ins. | State exactly what the MVP daemon isolates (P29). | A, B, C |
| 11 | Auto-approve picks the first option when no allow option exists; remote MCP policy inherits allow-all when blank. | Unattended answers default to deny; defaults set in one place and tested. | A, C |
| 12 | An agent that reaches the main API can try settings edits; the per-boot token is replayable. | No control-plane path from agent processes; red-team it (P72). | B |
| 13 | Requiring the completion signal can hang a step forever. | A completion record plus a timeout (P21). | A |
| 14 | Exactly-once execution is never guaranteed. | Say so; retry only runs with no side effects yet. | A, C |
| 15 | Agent-written summaries can drop constraints. | Never feed a summary as a design input; inputs are files with digests. | A |
| 16 | Import is not one transaction; unknown fields are silently dropped; several settings are parsed but do nothing; validation rules are mixed. | Transactional, strict loads; a field in a schema must do something; one rule that fails loudly. | A, C, D |
| 17 | An existing but empty sync folder deletes unused items; force sync reports errors inside a success body; config sync is not pinned to a commit. | Treat empty as suspicious; real error codes; always pin a commit. | A, B |
| 18 | Watching an outside provider only looks at its newest page of results; "All repos" on one trigger evaluates nothing; schedule and PR conditions on one automation fire independently. | Page or keep a cursor; no option that looks broader than it acts; validate combinations at save. | B |
| 19 | Automation creation is not idempotent; a routine can save while its trigger failed to arm. | Idempotency keys on retriable creates; report arming apart from saving. | B |
| 20 | Budget admission is checked before launch so a run can overshoot; unknown spend shows as unknown. | Ledger before dispatch; unknown counts against caps. | B |
| 21 | No complete security audit log. | Our hash-chained log is an advantage; keep every human and system act in it. | B |
| 22 | Webhook secrets are revealable by settings users; MCP credentials can land in process arguments; stored sign-ins for MCP servers are looked up by the server's name alone. | Keychain for secrets; no secrets in arguments; bind credential reuse to issuer and endpoint. | B, C |
| 23 | Sandbox provider network policy is applied after bootstrap. | Egress policy is in force before the first agent byte (ADR 0010 already says so). | C |
| 24 | A reset can report success while the remote resource survives. | A teardown that cannot prove deletion reports "unconfirmed". | C |
| 25 | Prepare scripts behave differently per executor, with two silent skips. | One hook contract everywhere. | C |
| 26 | Service port flag has no effect; macOS job flags contradict; cache-path installs break; a first install from a root shell must name the service account. | Test the generated plist; refuse temp-path installs; never change the service user implicitly. | C |
| 27 | Stopping a Linux service can leave agents running. | The daemon accounts for every process group it started. | C |
| 28 | If the server cannot work out who may see an event, it sends the event to everyone connected. | On an authorization lookup error, deliver nothing. | B, C |
| 29 | Database backups leave out the key file, worktrees and CLI logins; deleting an organization does not reach backups. | Backup manifests list what they exclude; state retention for backups and the permanent log. | B, C |
| 30 | Package signing is not wired, and every package shows unsigned. | No "signed" badge until verification is real. | D |
| 31 | Canvas frames share the host origin and the viewer's session. | Pack viewers on a separate origin (P50). | B, D |
| 32 | Development builds skip the minimum-version check. | No development exemption from contract checks. | D |
| 33 | Event delivery to extensions is best effort and drops under load. | Packs read the chained log with a cursor; no lossy side channel. | D |
| 34 | Dependency reads are not transactional and can show an edge one-sided. | Name unknowns explicitly. | D |
| 35 | Office and the coordinator are flag-gated and in progress; docs track the main branch ahead of releases. | Tie our docs to the running version and mark unfinished features (P68). | A, B |

## 9. UX ideas worth borrowing

- One "needs you" list where only explicit asks raise attention, and a state that cannot be read is never shown as healthy (A, B, C). Agent questions sit in that list and are answered through a stepper that works from the keyboard, one question at a time (E).
- A one-line gate explanation on each package, for example "waiting on you to accept", "pre-check round 2 running", "Claude limited until 14:10" (B).
- Reviewed ticks per output that clear when the output changes, with a running count of how many are reviewed, and a "made against an earlier version" tag on old notes (A, E).
- One "send all notes" action that is disabled while pending and keeps anything edited meanwhile; notes are stored the moment they are typed, and sending them starts the next author round (A, E).
- A two-way dependency chip with the exact upstream package and its state, and cycle refusals that show the path (A).
- A recovery card with the recommended action first, every alternative as its own button, collapsed redacted details and an exact-copy button; resolved and dismissed labels kept in history (A, C).
- A persistent error strip for package problems that survives tab changes until resolved (A).
- Drafts are never cleared by a failed submit; uncertain outcomes say "status unknown" and block a second submit until reconciled (A).
- Inline retry notices with attempt count, next attempt time, deadline and Cancel (A).
- A status strip with Active, Held (reason), Paused (by whom, since when), Off and Unavailable (A).
- Met or Not met lists with current values for anything locked until conditions hold (A).
- "Woken by N events" entries that expand to the cause list for any automatic run (A).
- A run page that opens on the newest run with a rail of earlier runs, configuration behind a details link (B).
- A health dot per runtime and connection on the floor bench, with plain states: ready, missing, needs login, untested version, unknown (B, C, D).
- A read-only "exactly what the daemon will run" panel per runtime baseline, with the tool allowlist and a token estimate per tool (B, C).
- "Still working, quiet for N minutes" with a calm note that long tools are silent; stop buttons that stay in "stopping" until confirmed, across reloads (C).
- A run log with tool calls folded into one line each, a progress chip from the author's checklist, elapsed time per stage, and a "stopped by Ben" line under any partial output (E).
- A preparation block at the top of each run: one line per setup step with its command, duration and result, warnings in amber with details behind a link (E).
- Tool permission holds shown on the run with deny, allow once and allow for this run, with an amber mark on the board card and the rail; this waits for ACP sessions (P76) (E).
- A connectivity indicator that turns yellow after three seconds and red after ten (C).
- A startup page showing the current phase and recent step timings (C).
- Typed confirmation words for destructive acts and a staged restore that cannot harm live data (C).
- A quarantine list with visible "delete after" dates and a restore button; a disk bar with 80 and 90 percent warnings (C).
- "Send test notification" that also asks for OS permission (C).
- Reference-checked delete dialogs that list what still uses a thing (C).
- Error messages that name the field and the next step without echoing the value (B, C).
- Phone bottom sheets for decisions: sized to content, buttons above the safe area, swipe means cancel, prior scroll restored, one decision at a time (B).
- A starter capture whose intake result Ben can read and release, so he sees the whole loop once on day one; starter briefs that end with "propose, then wait" (B).
- Host controls (DecisionBar, digest of what is shown, "Try again") always outside any viewer frame (D).
- A share or transmittal flow that lists files, sizes and a private-content reminder before download, and expires (D).
- A task dialog that shows role preset and isolation mode with a split button for "start" and "create without starting"; for us, the role brief shown as a chip on the capture or package form (D).
- Semantic states reported by packs and providers with colours chosen by the web app (D).

## 10. Observed behaviour

### 10.1 What the observer could and could not run

Observer E installed Kandev 0.97.0 from npm and ran it unmodified in a Linux container: loopback listener only, an empty environment, a private home folder, the Docker executor switched off. It drove the web app through a headless browser and kept the screenshots and traffic recordings as working papers outside the repository; for live traffic it wrote down only message kinds and field shapes. It did not open Kandev's source, and it read Kandev's docs only for a handful of startup settings and the page on adding a custom agent.

No model provider, account or credential was used. The test agent the docs describe can be switched on by a flag but is missing from the published package, so the observer wrote its own small stand-in agent (no model behind it) that speaks the open Agent Client Protocol and registered it through Kandev's own screen for adding an agent. The stand-in follows keywords to produce thinking text, a to-do list, file reads and edits, shell calls, permission requests, slow output, a hard failure, and calls to Kandev's own question and plan tools.

Exercised: first-run setup, workspace and repository setup, the process and step editor, agent profiles, the new task dialog, session view, permission prompts, file review and review notes, the queue and cancel, failure recovery, plan mode, question bundles, the board and its other views, the Office product, the settings pages and the live update traffic.

Not exercised: what real agents produce, GitHub or GitLab links, Docker or remote executors, the plugin marketplace (no network), automations with real triggers, real cost data, approvals raised by an Office agent, and sign-in or multi-user modes. Everything below about agent output comes from the stand-in, so streaming and timing details may differ with a real agent.

### 10.2 What running it added to P01 to P73

- **P01 Board position and runtime state:** under the default process, every turn end moved the card to the review column by itself, a cancelled turn included, and a new message sent from review moved it back. Office lists each run with the event that woke it. For us: a stopped or failed run leaves the package where it was and says who or what stopped it, and the wake reason is worth the small cost.
- **P03 Plan document:** the plan panel picked up the agent's write within about a second, kept a version list (author, step, age, size), and held comments on selected text across a reload. The button that approves the plan and the column move were two separate acts, and the approval left out a comment still pending. For us: one signed act both approves and moves, and it carries every open note in its signed subject (P12).
- **P06 Questions as records:** a bundle held up to four questions, each with a few described options and optional free text, answered through a stepper that works from the keyboard. The answer went back to the agent keyed by question id. Kandev's waiting-items page said in plain words that it leaves out permission requests. For us: questions sit in the same office list as every other ask, and answering one is an attributed event with no passkey, since it decides no package state.
- **P08 Scheduled captures:** the Office setup armed a coordinator wake-up every five minutes without being asked, and it woke the idle stand-in. This confirms the trap the docs-based notes flagged; our schedules start paused and show their cost.
- **P10 Skips:** the per-session queue works, and after a cancel its automatic sending switched itself off, so queued text waited for the person. That supports our rule that a stop starts nothing; the skip stands because our runs are one-shot. Adding an agent through the UI ran a protocol handshake at once to learn models and modes; the skip stands, and the probe idea moves to P23.
- **P11 Reviewed marks:** a tick per file with a running count survived a reload. The observer did not change a file after ticking it, so the digest binding was not seen.
- **P12 Anchored review notes:** an unsent note on a file disappeared when the page reloaded, which matches the browser-only storage the docs admit. Sending notes did not move the card out of review. For us: notes are saved on the server as they are typed.
- **P16 Uncertain outcomes and P19 claim custody:** one Office assignment produced two runs for the same task (one claimed, one queued) and the agent handled the assignment twice. Our runs table has no rule against the same kind of duplicate (K28); see the change to N2.
- **P21 Completion record:** with no completion signal required, a turn end alone counted as done, a cancelled one too. This is exactly the behaviour P21 guards against.
- **P22 Stop a run:** the stop control cancelled at once, kept the partial text, and drew a line saying the person cancelled the turn, with the elapsed time. Every Office page has a workspace pause button in its header. For N5: keep the partial log and end it with a "stopped by Ben" line and the time. The observer's comparison said our run log already offers stop and requeue; it shows a stopped status only (K25).
- **P23 Runtime health:** a test agent that could be switched on but was not shipped appeared in the list, showed "Error" and a probe failure with no detail, and its first task failed with the cause shown as unknown while the backend log held the real reason. For us: a probe result carries its reason to the screen, and a runtime that fails its probe is never offered for work. Priority raised (N9).
- **P24 Record what actually ran:** the startup probe passed no tool servers; task sessions got Kandev's tool server only after the agent said it could take one; each first prompt began with a long block naming the tools, and Office prompts ran to several thousand characters with a closing list of allowed actions. Routing logged warnings when it did not recognise the stand-in's provider. For us: the trace records which tool servers and tools actually reached the agent, beside what was requested.
- **P28 Recovery choices:** a failed start produced a card offering a fresh session or a read-only look at the workspace, with collapsible details (phase, operation, cause, attempt id) and a copy button. A plain prompt rejection was titled as a failed recovery. A setting stops tasks from starting by themselves when reopened after a restart. For us: queued runs that never started are safe to claim after a restart because their inputs are frozen; a setting that holds the queue until Ben looks is cheap; runs that were mid-flight are retired by the sweep (N2).
- **P30 Retention:** the storage page warns in red at 90 percent full and keeps a quarantine before deletion; the archive dialog spells out what happens to clean and dirty work folders, running sessions and branches. For us: the close dialog lists what happens to the package's run folders before Ben confirms.
- **P32 Stage timings:** each session opened with a preparation card: one line per step with its command, duration and result, and a warning for a failed remote fetch that came back on every task in a folder with no remote. For us: show the timings as the first block of the run log, and quiet a known harmless warning after its first appearance per folder.
- **P34 Office and P33 the "why waiting" line:** waiting items were spread over a sidebar inbox, a waiting-items page, the Office inbox and inline prompts. An agent stuck on a permission was missing from the Office pending count, the Office inbox read as clear, and the sidebar badge said one. For us: one office list, and every count on screen comes from the same query as the list it summarises. A side-by-side view of several live runs could later be a Floor mode.
- **P35 Recovery card:** the backend knew the exact failure and the screen said unknown; the failed card on the board carried no mark. Our office shows a failed run's error, cut to 200 characters, under the dispute kind (K29). For us: carry the real cause in plain words, give failed runs their own office kind and a mark on the board.
- **P36 Unknown is never green:** the updates page showed a last-checked date in year one before any check had run, and a GitHub sign-in warning stayed up for a purely local user. For us: a check that has never run says "never checked", and setup warnings appear only for features Ben has turned on.
- **P37 Live feed:** one socket with subscriptions; change notices carry revision numbers so the client fetches only what is new; boards in two tabs agreed within about a second. With the stand-in, streamed text showed only at turn end (possibly the stand-in's fault). Our daemon already posts log batches every second (K27). For us: the P37 resume plan stands, plus a small "package summary changed" event so cards refresh without refetching whole packages.
- **P38 Notifications:** desktop and sound settings per event type, including a question from an agent. Confirms P38.
- **P39 Phone:** at phone width the task page became one column with bottom tabs and a count badge on the changes tab. For us: bottom tabs Run, Outputs and Decide on the package page.
- **P43 Agent seats:** each Office agent page has a rights grid (create tasks, assign, approve, create agents and more) with a role default per row, plus a monthly budget and a cap on concurrent sessions. For us: show a seat's rights as a read-only grid drawn from Cedar policy.
- **P57 Launcher and P60 one home:** stopping the npm launcher left the backend and its agent controller running. A long data path broke a local socket with a bare system error, and a path through a symlink was refused. For us: `controlrod down` and the launch agent stop the whole process group, status lists stray processes, and every startup refusal names the fix in one sentence.
- **P67 Feature toggles:** each switch shows where its value came from, which environment variable locks it, whether a restart is needed, and a risk note. Confirms P67.

### 10.3 New patterns from observation

### P74 First-run checklist
- **What it does:** on first open, a short series of cards lists the agents found on the machine with their state, every supported agent that is missing with its install command, the places work can run with a plain line on what each needs, the starting process drawn as a chain of steps, and the command panel shortcut. Every card can be skipped.
- **Why it matters:** within a minute the person learns the product's few nouns and sees what their machine lacks.
- **Our version:** a first-run panel on Home that checks the daemon is reachable, which runtimes it found with versions and probe results (N9), whether a passkey is registered, and whether the General pack loaded. Each failed line shows the fix as text to copy. Setup warnings appear only for features in use.
- Fit: Adapt · Effort: S · Priority: Next · Notes: E

### P75 A run log grouped for reading
- **What it does:** the session view folds runs of tool calls into one expandable line, shows thinking under its own label, shows the agent's to-do list as a progress chip that turns green when complete, and gives each turn its elapsed time. Shell output shows its size and expands on demand.
- **Why it matters:** a long run stays readable, and progress shows at a glance.
- **Our version:** RunLog renders our event stream as grouped blocks: tool calls collapsed, a progress chip drawn from the author's checklist, elapsed time per stage, and the preparation block from P32 first. The capture text Ben wrote stays apart from the brief and rules we inject, which sit behind a "show instructions" toggle (Kandev echoed whole step templates into the person's bubble). Partial output stays visible after a stop, ended by a "stopped by Ben" line.
- Fit: Adopt · Effort: M · Priority: Next · Notes: E

### P76 Tool permission holds on the run
- **What it does:** when an agent asks to use a tool, the call turns amber with the target path and three answers: deny, allow once, always allow. The composer stays usable, the board card and sidebar entry turn amber, and an approval resumes the agent within a second. The answer sent back is one of the options the agent offered.
- **Why it matters:** a tool decision made in context, with nothing lost while it waits.
- **Our version:** our MVP runs batch print mode, so no agent can pause for a permission mid-run (K06), and the API never raises the "permission" office kind the contract allows (K26). Once sessions run over the Agent Client Protocol (ADR 0011), the daemon raises a hold event, the office lists it with every other ask, and the run page offers deny, allow once and allow for this run. Holds are plain clicks recorded in the chain; release and accept stay signed in DecisionBar. Unattended holds time out to deny.
- Fit: Adapt · Effort: M · Priority: Later · Notes: E

### P77 Each run is told what it may and may not do
- **What it does:** every Office run's first prompt ends with a block naming the run, the agent, the task in scope and an explicit list of allowed actions.
- **Why it matters:** an agent that knows its limits wastes fewer turns on refused acts, and a person reading the brief sees the same limits.
- **Our version:** the control plane writes a fixed-template "you may, you may not" block into each brief from the kernel's legal moves for that role and package state and from the baseline tool list, with ids and digests as the only variables (P15). The package page shows the same block for each run, and its digest goes into the trace.
- Fit: Adopt · Effort: S · Priority: Next · Notes: E

### P78 Board badges and kernel-checked moves
- **What it does:** cards show a spinner while running and an amber border and shield while waiting on a person; hovering opens a larger preview; cards can be dragged between columns, and a second tab follows within about a second. The sidebar lists tasks with a state mark, age, queued count and change counts.
- **Why it matters:** the board becomes a live picture of where attention is needed.
- **Our version:** board cards and the Shell rail gain running, question, failed and waiting-on-Ben marks through StateMark. Dragging is offered only for moves the kernel would allow; a move that needs a signature opens DecisionBar, and refused moves are greyed with the reason.
- Fit: Adapt · Effort: M (marks S) · Priority: Next · Notes: E

### P79 Command panel
- **What it does:** one keyboard shortcut opens a panel listing active tasks with their agent and age, plus create, navigation and view switching; a key flips between commands and search.
- **Why it matters:** one person moving between many packages needs a fast way to jump.
- **Our version:** a command panel listing open packages with role at work and age, plus capture, office, floor and records. Signing never starts from the panel; it only opens the package with DecisionBar.
- Fit: Adopt · Effort: S · Priority: Next · Notes: E

### P80 Pack-defined sub-steps inside the work rung
- **What it does:** a process is a row of steps, each with settings for which agent profile runs, whether it plans first, whether context resets, a limit on active work, and where the card goes when a turn ends. Moving a card into a step can start, stop or redirect an agent.
- **Why it matters:** teams can shape the work without code.
- **Our version:** our rungs stay fixed in `spec/` and guarded by the kernel. A pack may define sub-steps inside the work rung only (which role runs, plan first or not, fresh context or not, a concurrency cap, the next sub-step on completion). The kernel checks every move, and no sub-step can skip a signature.
- Fit: Adapt · Effort: M · Priority: Later · Notes: E

### P81 Controls that explain themselves
- **What it does:** in the running product, short empty states named the exact gap and the page for waiting items said what it counts and what it leaves out. Elsewhere a disabled start button gave no reason, its label changed as text was typed, and some screens needed a second save after a dialog had already confirmed.
- **Why it matters:** a person who cannot see why a control is off, or whether a change was stored, loses trust in the screen.
- **Our version:** every disabled action shows its reason; button labels stay fixed while a form is edited; one user act saves once, with an undo where it helps; each list says what it counts.
- Fit: Adopt · Effort: S · Priority: Next · Notes: E

### P82 Reference files supplied to every run
- **What it does:** a repository can name ignored files to copy into each new work folder, and run setup or cleanup scripts there.
- **Why it matters:** work folders often need files that are not in version control.
- **Our version:** a project may name reference files (licence files, standard tables, client reference data). The control plane pins each one by digest as a run input, so frozen inputs still hold and the trace shows exactly which copy each run saw.
- Fit: Adapt · Effort: S · Priority: Later · Notes: E

### 10.4 Problems the observer hit, and what we take from each

| # | What happened in the running product | Lesson for Control Rod | Pattern |
|---|---|---|---|
| E1 | A flag shows a test agent that the published package does not contain, so it fails on first use. | Ship any test runtime with the daemon or hide the switch. | P23 |
| E2 | A long data path broke a local socket with a bare system error; a symlinked path was refused. | Check path limits at startup and state the fix in one sentence. | P57, P60 |
| E3 | Stopping the launcher left the backend and agent controller running. | Stop the whole process group; show stray processes on status. | P57 |
| E4 | The screen said the failure cause was unknown while the backend log had it. | Carry the real cause to Ben in plain words. | P35 |
| E5 | An unsent review note was lost on reload. | Save notes on the server as typed. | P12 |
| E6 | Waiting items lived in four places, and a permission wait was missing from counts that claimed to be complete. | One office list; every count from the same query as its list. | P34 |
| E7 | One assignment created two runs, and the agent did the work twice; the chosen task prefix was ignored. | At most one live run per package revision, role and round; settings chosen in setup are saved as shown. | P16, N2 |
| E8 | A five-minute coordinator wake-up was armed by default and woke an idle agent. | Runs start from events; any schedule starts paused with its cost shown. | P08 |
| E9 | Repository and process screens needed a second save after a dialog had confirmed. | One save per act. | P81 |
| E10 | The start button was disabled with no reason, and its label changed while typing. | Always show why; keep labels fixed. | P81 |
| E11 | Step templates were echoed into the person's own message bubble. | Keep Ben's words apart from injected instructions. | P75 |
| E12 | Streamed text from the stand-in appeared only at turn end. | Keep flushing logs every second (already the default) and show a quiet indicator. | P34, P37 |
| E13 | Setup said default profiles approve everything while the profile's own switch read off. | A safety setting has one source, and every screen reads it. | P24 |
| E14 | A process picked during setup was not created, and the default one was saved under a different name. | Setup writes exactly what it showed, or says what it skipped. | P74 |
| E15 | The step shown in the new task dialog differed from the step the task started in, and plan approval and the step move were separate acts. | Show the state the kernel will actually set; tie approval to the move. | P03 |
| E16 | A last-checked date in year one before any check; a GitHub warning for a local-only user. | "Never checked" for checks not yet run; warnings only for features in use. | P36 |

---

## 11. Build plan

### 11.1 Claims about our code, checked

Every claim the notes make about Control Rod's current code was checked against `mvp/site-concept` at commit `87d0f79`. Line numbers refer to that commit.

| # | Claim in the notes | Notes | Status | Evidence |
|---|---|---|---|---|
| K01 | Runner completion checks only that the run is running. | B, D | Confirmed | `services/api/src/work.ts:487`; the log route has the same check at `:461`. Runner routes check only the daemon token (`services/api/src/app.ts:248-263`); there is no claim token or generation. |
| K02 | A run stays "running" if the daemon dies. | B, C, D | Confirmed | Claim sets `running` (`work.ts:449`); only `complete` moves it on. `RunStatus` has no lost or abandoned state and Run has no lease field (`spec/work.tsp:49-55`, `:58-86`); no sweep exists in `services/api/src`. The daemon gives up after one failed completion upload (`daemon/internal/runner/daemon.go:226-229`). A second path found while checking: a refusal thrown inside `complete` (bad output name `work.ts:492`, intake with no output `:542`, pre-check with no outcome `:598`) rolls back the whole transaction, including the status change, so the run also stays running. |
| K03 | A retried completion after a lost reply gets 409, so the daemon cannot tell success from refusal. | D | Confirmed | `work.ts:487`; `daemon/internal/runner/client.go:105-116`. |
| K04 | Package outputs are served without re-checking their sha256. | D | Confirmed | `work.ts:185-193` returns stored bytes; `app.ts:157-159` sends them. |
| K05 | Only WebAuthn checks Origin. | D | Confirmed, risk narrower than stated | Origins are used only in `services/api/src/auth.ts:80` and `:141`. The only request hook in `app.ts` (`:269-274`) serves HTML. Two mitigations exist: the session cookie is `SameSite=Strict` (`auth.ts:165-171`) and the API binds to loopback (`services/api/src/server.ts:70`). Same-site still covers pages on other localhost ports, so a check is still needed. |
| K06 | ADR 0011 says ACP while the daemon runs headless print mode. | C | Confirmed | ADR 0011 line 7 says Control Rod is the ACP client for every session. The daemon runs `claude -p ... --output-format stream-json` (`daemon/internal/runner/runtime.go:97-102`) and `codex exec --json` (`:104-109`), as `docs/daemon.md:27-28` describes. No ACP client exists in the daemon. |
| K07 | Codex is launched without sandbox flags and may not be able to write `out/`. | C | Confirmed (by reading; not run on a Mac) | `runtime.go:104-109` passes `exec --json --cd <workspace>` and the prompt only. OpenAI's non-interactive docs (fetched 2026-10-22) say `codex exec` runs read-only by default and refuses to run outside a Git repository unless told to skip that check. Run workspaces live under `~/.controlrod/work` (`daemon/internal/runner/workspace.go:35-37`) and are not repositories. So Codex runs either fail at start or write nothing. Ben's own Codex config is loaded (the child keeps HOME, `runtime.go:62-71`) and could change this. This matters more because the pre-check prefers Codex whenever the author ran on Claude (`work.ts:236-241`), and an empty pre-check then trips the rollback in K02. |
| K08 | Detect only checks PATH; no version, login or status report. | C | Confirmed | `runtime.go:46-58`; `daemon/cmd/controlrod/main.go:73`. A version is read only after a run, for the trace (`daemon.go:307-312`). |
| K09 | The daemon passes `--model` when the run has one, but the trace records only CLI name and version. | C | Partly true | Trace: confirmed (`daemon.go:313-324`, `spec/records.tsp:254-267`). Model: the control plane always sets model `default` (`work.ts:244-248`), so `--model` is never passed (`runtime.go:92-101`). |
| K10 | A running run cannot be stopped from the web app. | A, B, C | Confirmed | Return and reject stop only queued runs (`work.ts:756`, `:761`); `app.ts` has no stop route; the daemon stops runs only on timeout or shutdown (`daemon.go:145-153`, `runtime.go:174-180`). |
| K11 | The event stream sends no event id and cannot resume. | C | Confirmed | `app.ts:232-246` writes frames with no id and reads no resume point; the list-after route exists (`app.ts:224-227`). |
| K12 | Pre-check always runs on a different runtime, and the kernel refuses author and checker on the same baseline. | A, B | Partly true | The kernel refuses equal baseline names (`kernel/src/transition.rs:146-153`), but names carry a role prefix (`work.ts:420`), so they always differ. `pickRuntime` prefers another runtime and falls back to the author's (`work.ts:236-241`). The pre-check record then marks only the mechanism as shared (`work.ts:601`, `:623`). |
| K13 | An author run that exits cleanly with no deliverable still advances the package. | A | Confirmed | `work.ts:518-520` sends any succeeded author run to `finishAuthor`, which moves the package to verification without looking at outputs (`work.ts:579-586`). |
| K14 | The decision nonce should be made single use. | A | Wrong | Challenges are already taken exactly once (`auth.ts:42-50`). What remains: a retry after a lost reply gets a refusal, where returning the stored Decision would be kinder. |
| K15 | Draft update has no optimistic concurrency. | A | Confirmed | `work.ts:196-208` locks the row but checks no expected version. |
| K16 | An upstream package must be accepted before a dependent starts. | A, B | Confirmed (already have) | `work.ts:251-262`, checked at claim (`:409-410`). Gap found: a design input naming a package id that does not exist is skipped and counts as ready (`:255-259`). |
| K17 | The decision should recompute the subject from stored rows in the transaction. | D | Already have | `applyDecision` recomputes the subject inside the transaction and the kernel gets the digest comparison (`work.ts:703-719`). |
| K18 | Run should record the digest of the role brief at queue time. | A | Partly true | The assembled `BRIEF.md` and `TOOLS.txt` are job inputs and every input is digested into the trace (`daemon.go:247`, `:320`). The pack commit and source file digests are not recorded. |
| K19 | The daemon takes no lock on its home. | C, D | Confirmed | `daemon.go:33-43`; no lock anywhere in `daemon/`. |
| K20 | The API has a liveness route only. | C | Confirmed | `app.ts:94`. |
| K21 | The daemon strips its token from the agent environment and kills the process group on timeout. | A, B | Confirmed (already have) | `runtime.go:60-71`, `:119-121`, `:174-176`. |
| K22 | Refusals echo submitted values. | B | Confirmed | `work.ts:492` echoes the bad output name. |
| K23 | (Found while checking) A trace that fails validation is dropped silently. | none | Confirmed | `work.ts:498-504` deletes the trace and stores the run without it, with no event or finding. |
| K24 | (Found while checking) The daemon's logs go to stderr with no rotation. | C | Confirmed | `daemon.go:85-87`. No service install exists yet, so this matters once P57 lands. |
| K25 | The run log already offers stop and requeue. | E | Wrong | `apps/web/src/components/RunLog.tsx:15` renders a stopped status; the component has no controls, and the API has no stop route (K10). |
| K26 | Ben approves agent tool steps today, and the office already puts those holds first. | E | Partly true | The contract allows an office item of kind permission (`spec/api.tsp:136`) and the web app sorts that kind first (`apps/web/src/lib/office.ts:5`), but the API never raises one and would rank it last (`services/api/src/work.ts:824`). Batch print mode has no mid-run permission prompt (K06). |
| K27 | Run text should be flushed to the control plane at least once a second. | E | Already have | The daemon posts log batches every second by default (`daemon/internal/runner/daemon.go:82-83`, `:190-199`); the web app batches refreshes for 300 ms (`apps/web/src/lib/live.ts:34`). |
| K28 | (Found while folding in E) Nothing in the database stops two live runs for the same package revision, role and round. | none | Confirmed | The runs table has no such key (`services/api/src/db/schema.ts:53-63`); `queueRun` inserts a fresh id each time (`work.ts:213-233`). Today each caller sits behind a package row lock and a kernel transition (`work.ts:111`), so no duplicate path is known; the rule would make that explicit. |
| K29 | (Found while folding in E) A failed run reaches the office as a dispute. | none | Confirmed | `work.ts:803-821` raises kind dispute with the error cut to 200 characters. |

No note claim about the code was found to be invented. Two were wrong (K14, already in place; K25, from the observer), and four were partly true (K09, K12, K18, K26). K25 to K29 were checked at the same commit after the observation notes arrived.

### 11.2 Now: before Ben's first real run on his Mac

Only confirmed gaps are listed. Order is the suggested build order. "Trust surface" refers to AGENTS rule 2 (`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` major versions, kernel decision functions).

| # | Item | Closes | Files it would touch | Trust surface? |
|---|---|---|---|---|
| N1 | **Make Codex runs able to start and write `out/`.** Pass an explicit workspace-write sandbox and the skip-repository-check flag (or make each run workspace a repository), add a runner test for the exact arguments, and run one real Codex author and pre-check on the Mac before trusting it. Until that passes, the daemon should not offer Codex. | K07 (P25) | `daemon/internal/runner/runtime.go`, `daemon/internal/runner/runner_test.go`, `docs/daemon.md` | No. It widens what Codex may write to its own run workspace, so Ben reviews it. |
| N2 | **Run custody: claim token, lease, sweep, idempotent completion, outbox.** Claim returns a token and a lease expiry; log posts renew it; a sweep retires expired runs to a terminal state with an event and an office item; log and complete must present the token; a repeat completion with the same digests returns the stored result; refusals while processing a completion record the run as failed and keep that record; the daemon writes each completion to the run directory first and replays unsent ones at start; an invalid trace is kept with a finding; at most one queued or running run per package revision, role and round, enforced by a partial unique index. | K01, K02, K03, K23, K28 (P16, P19, P20) | `spec/work.tsp` (lease fields, terminal cause), `spec/api.tsp` (claim response, log and complete bodies), regenerated schemas, `services/api/src/work.ts`, `services/api/src/app.ts`, `services/api/src/db/schema.ts`, `daemon/internal/runner/{client,daemon,types}.go`, tests in `services/api` and `daemon/internal/runner/runner_test.go` | Spec change is additive (minor version), so no signature under rule 2. No kernel change: run status is not a package transition. Any new case under `tests/redteam/` needs Ben's signature. |
| N3 | **An author run succeeds only with a deliverable and a completion manifest.** A clean exit with nothing in `out/` fails the run with "no completion record"; the manifest carries how each criterion is met and a short handoff block. | K13 (P21) | `services/api/src/work.ts` (`complete`, `finishAuthor`), `packs/general/roles/general-author.md`, tests | No. Role briefs are not on the rule 2 list, but they shape agent behaviour, so Ben reviews the wording. |
| N4 | **Hold a pre-check that would share the author's runtime.** When the only available runtime is the author's, leave the pre-check queued with a visible reason, or let Ben proceed through a recorded owner override that the verification record shows. | K12 (P27) | `services/api/src/work.ts` (`pickRuntime`, `claim`, office detail), `apps/web` office item text, tests | No, if done in the control plane. Changing the kernel to compare runtimes as well as baseline names edits a kernel decision function and needs Ben's signature. |
| N5 | **Stop a running run.** An owner stop route records the request as an event; the response to the daemon's next log post or heartbeat carries the stop; the daemon kills the process group and completes the run as stopped; the UI shows "stopping" until it lands; a repeat stop is a no-op. | K10 (P22) | `spec/api.tsp`, `services/api/src/work.ts`, `services/api/src/app.ts`, `daemon/internal/runner/{client,daemon}.go`, `apps/web` package view and office, tests | No. Builds on N2's heartbeat. |
| N6 | **Verify output bytes against the stored digest before serving.** Refuse on mismatch and append an event. | K04 (P51) | `services/api/src/work.ts` (`packageOutput`), `services/api/src/app.ts`, a test | No. |
| N7 | **Origin check on cookie-authenticated state-changing routes.** Accept only configured origins, or no origin with a same-origin fetch-site header; runner routes skip it. | K05 (P52) | `services/api/src/app.ts` (request hook), `services/api/src/server.ts` (origin list), tests | No. |
| N8 | **Record what actually ran, and say so in ADR 0011.** Add runtime mode, requested and reported model, permission mode and allowed tools to the trace; raise a finding when models differ; amend ADR 0011 to state that the MVP runs batch print mode where ACP permission binding is not in force, and that the sandbox and tool allowlist are the only fence. | K06, K09 (P24) | `spec/records.tsp` (ExecutionTrace, additive), regenerated schemas, `daemon/internal/runner/{types,daemon,label}.go`, `services/api/src/work.ts`, `docs/adr/0011-agent-sessions-acp.md`, `docs/daemon.md` | No. Additive spec change; ADR text is not on the rule 2 list. |
| N9 | **Probe each runtime before offering it.** At start and on a timer the daemon checks that each runtime answers a version command and, where the CLI can tell, that a login is present; a runtime that fails is left out of what the daemon reports, and the daemon logs the reason in one plain sentence. The office display of probe results stays in Next (P23). | K08 (P23) | `daemon/internal/runner/runtime.go` (`Detect`), `daemon/internal/runner/daemon.go`, `daemon/cmd/controlrod/main.go`, `daemon/internal/runner/runner_test.go`, `docs/daemon.md` | No. |

**Changes from the observation notes.** Two, each tied to something the observer saw.

- **N9 is new.** P23 was Next. The observer watched a listed agent fail its first task with the cause shown as unknown. Our daemon counts any binary on PATH as ready (K08), and the pre-check prefers a runtime other than the author's (K12), so a Codex binary that is installed but not logged in, or that cannot write (K07), would be picked for every pre-check on Ben's Mac. A minimal probe closes that before the first real run; the office display stays in Next.
- **N2 gains one rule.** The observer saw one assignment produce two runs and the work done twice. Our schema has no rule against the same duplicate (K28). The index belongs in N2 because N2 already changes the runs table.

The observer marked several more ideas as Now (inline permission holds, question bundles, the review loop, the preparation timeline, the grouped run log, board marks, a pause-all switch, a first-run checklist). They stay in Next or Later because Now holds only fixes for confirmed gaps in the code, and these are improvements. Inline permission holds (P76) go to Later because batch print mode has no mid-run prompt to answer (K26). Stopping one run (N5) covers the first run on one laptop, so stopping the floor stays in Next.

### 11.3 Next

Grouped by area. Each item names its pattern.

- **Runs and the daemon:** office display of runtime probe results (P23; the probe itself is N9); PATH repair (P58); home lock (P60, K19); rate-limit classification and safe retry (P26); interrupted-run recovery choices and a setting that holds the queue after a restart until Ben looks (P28); explicit environment allowlist and private HOME with the srt driver, and a wrapper that must start (P29, P25); workspace owner markers and retention (P30); queue position and per-role concurrency (P31); stage timings (P32); "stop the floor" (P22); keep the Mac awake (P61).
- **Work and packages:** draft update with an expected version (P03, K15); refusal of design inputs naming unknown packages and a cycle check (P02, K16); owner instructions stored on the queued run and a fresh-start flag (P04); pack commit and digest in the trace (P05, P45); questions as records (P06); capture client ids and outside text as a data file (P07).
- **Review and decisions:** reviewed marks bound to digests (P11); server-side anchored notes bundled into Return (P12); accept checklist (P13); criteria map (P14); per-finding outcomes in `RESPONSE.md` (P15); decide retries return the stored Decision and "status unknown" handling (P16, K14); write the human-only rule into the threat model (P17); per-run outputs card (P18).
- **Office:** "why waiting" line (P33); a first-run checklist (P74); a grouped run log with the preparation block first (P75, P32); the per-run "you may, you may not" block (P77); board and rail marks and kernel-checked moves (P78); command panel (P79); controls that explain themselves (P81); failed runs as their own office kind with the real cause (P35, K29); at-work strip and quiet indicator (P34); recovery card and error strip (P35); system status card and connectivity indicator (P36); event stream resume (P37, K11); notifications (P38); phone access and decision sheets (P39).
- **Packs:** manifest (P44); declared permissions build the allowlist (P46); pack tools with schemas and deadlines, and refusals that do not echo values (P48, K22); pack settings with readiness gating (P49); host-owned digest beside every preview, then isolated viewers (P50); immutable outside identities (P53).
- **Operations:** `controlrod up` and the user launch agent (P57); readiness route (P59, K20); bounded logs (P62, K24); backup and verified restore, dump before schema change (P63); one config file (P64); aggregate counters (P65); incident runbook and "where to run it" page (P66).
- **Practice:** feature status page (P68); pack and runtime adapter checklists (P69); "suites skipped" line in change records (P70); docs coverage check (P71); red-team cases for control-plane reach and role-file edits, with Ben's signature (P72); development home and database (P73); threat-model statement of what the MVP daemon isolates (P29).

### 11.4 Later

Tool permission holds once sessions run over ACP (P76, K26); pack-defined sub-steps inside the work rung (P80); reference files pinned as run inputs (P82); a side-by-side Floor mode for several live runs (P34); scheduled captures (P08); capture grouping and roll-ups (P09); webhook captures (P07); runtime fallback that keeps independence (P26); spend ledger and caps (P40); earned autonomy (P41); people, roles and the org tree (P42); agent seats and memory rules (P43); pack approval and pending lane (P47); keychain secrets for packs (P49); constrained summaries (P54); deterministic exports and transmittals (P55); pack sync from a repository (P56); feature toggles, diagnostic bundle, update channel, maintenance command and log storage (P67); immutable baseline revisions and generated reference tables (P73).
