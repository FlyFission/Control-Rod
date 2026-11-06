# 08. Cross-model review: how existing tools do it, and a design for Control Rod

Access date for every source below: 2026-11-06. Read only: sources were read through the `gh` API and web search; nothing from any clone was run. Commit SHAs are the default-branch head on that date unless the row says it is a pinned commit.

Scope note. The request names Munder-Difflin, Multica and "two or three others". Munder-Difflin turned out not to contain a cross-model review feature (see section 1), so the best mechanism evidence comes from five small MIT "council" plugins that do exactly the owner's workflow. Orca, Emdash, Conductor and cli-agent-orchestrator were not found to have a cross-model review feature in this pass; that is stated as not confirmed, not as absent.

## A. Per-tool mechanism

### 1. HarnessMD/munder-difflin (MIT, pinned donor f797048cc88ca2ff94bfc6c8c93b16f47a201f15)

Finding: it has no review panel. It is a desktop "office" that spawns agent CLIs in a PTY and lets one agent play a reviewer role.

- Review is a hireable role, not a pipeline. `docs/hires/manifests/jim-pr-reviewer.hire.json` is a goal prompt ("review each against the actual checked-out source, verify every claim in real code, consolidate duplicates, post file:line review comments, work read-only") with `provider: claude`. Variants `docs/hires/manifests/variants/jim-pr-reviewer.{claude,codex,antigravity}.hire.json` are the same goal on another provider. So "review with a different model" is "hire the same role with a different provider", chosen by a person.
- Provider table: `src/shared/agentProvider.ts` holds per-CLI launch flags (model flag, auto mode flag, resume flag). Its auto flags are permissive: Claude `--permission-mode bypassPermissions`, antigravity `--dangerously-skip-permissions`, gemini `--yolo`, kimi `--auto`. Codex is the exception: approvals off but the OS sandbox kept (lines near 201 to 214, uses `--add-dir` for extra writable dirs). None of these are read-only reviewer postures.
- Maker-checker is described in prose only: `blog/src/posts/multi-agent-orchestration-patterns.md` ("adversarial review act as a consensus gate on risky output") and `blog/src/posts/how-ai-agents-verify-their-own-work.md` (a second agent should re-verify what ships). No schema, no merge step, no dedup beyond the prompt line "when several issues bottom out in one root cause, collapse them".
- What the reviewer sees: whatever the checked-out repo holds plus `gh` output. No frozen brief or diff artifact.
- Headless handling: it avoids headless; agents run as interactive TUIs. Issue #201 "Antigravity (agy) messages remaining in queue / failing on manual prompts" (open, 0 comments) is the agy symptom.
- Reusable idea: the per-provider launch table as a total `Record<Provider, ...>` so the compiler forces an entry for each new CLI (comment in `src/shared/providerAutomation.ts`: a `switch` with `default` silently did nothing for 7 of 11 providers). Control Rod should copy that discipline for its reviewer-profile table.

### 2. multica-ai/multica (head 282f48eed2531f467ed4e6febc2a59b590d3e711)

License: not plain Apache. `LICENSE` is "Apache 2.0 plus Part I additional conditions": you may not host it as a service or embed it in a product sold or distributed to third parties without a commercial license from Index Labs (Hong Kong) Limited. GitHub reports `NOASSERTION`. Ideas only, no code.

- It is an issue board where agents are assignees. "Review" is a status, not a panel: `docs/issue-status-lifecycle-rollout.md` defines `in_review` in category `started`, and says a status label grants no behavior ("no review completion rule"). `packages/views/workflows/templates.ts` has a delivery template with columns `in_progress`, `in_review`, `qa`.
- Cross-agent review is done by assigning a second agent in the thread, by hand or by comment handoff. Reported use: a lead/reviewer on Gemini 3.1 Pro through the Antigravity CLI and a developer on Flash (issue 9141).
- The feature that matches the owner's need is a request, not shipped: issue 4098 "Verifier agent layer, automated review of completed agent tasks before they're marked done" (open, 6 comments). Proposal: `verifier_agent_id`; a completed task enqueues a verification sub-task with the original issue, the result, and a fixed verdict schema (`approved | needs_rework | failed` plus rationale); new status `awaiting_review`; `needs_rework` loops back to the author. Its thread makes two points worth keeping: the verifier must not inherit the author's context, and the completion contract should be split into atoms each checked on its own (not one document read end to end).
- Failure modes (below) show what happens when a review verdict is just a comment.

### 3. OSideMedia/model-council (MIT, 67450d99ed6059e04d6cae01416691a5a783d444; 0 stars, very new, maintained actively)

The closest match to the owner's workflow and the most careful about CLI quirks.

- `commands/council.md`: write one self-contained brief to a scratch file; run seats in parallel; the Codex and Claude seats may read the repo, the Gemini seat sees only the brief; the host session is "the judge", seats are "consultants".
- Codex seat (`scripts/codex-seat.sh`): `codex exec --sandbox read-only -c model_reasoning_effort="high" -C <repo> - < brief`. Add `--skip-git-repo-check` when `-C` is outside a git repo or it dies while the wrapper still exits 0. Model ids live in one file; on "You've hit your usage limit" it reruns on a fallback model and says so on stderr. Callers may not pass `-m`.
- Antigravity seat (`scripts/agy-seat.sh`): `agy -p "$brief" --model <slug> --disable-slash-commands --sandbox` started inside a fresh empty temp folder. Reason recorded in the file header: headless agy denies shell commands and denies reads outside its workspace, but its file viewer opens anything inside its starting folder, so an empty folder means the seat sees the brief only. The wrapper takes no caller arguments, so `--dangerously-skip-permissions` cannot be passed. Distinct exit codes: 0 answered, 2 refused before call, 3 agy error, 4 blank answer, 5 cut off by `--print-timeout`. A blank or truncated answer must never read as agreement.
- Brief contract: every finding must QUOTE the line that motivates it, and name the test that would falsify it; findings that cannot are capped at low confidence and reported as unverified. A `verified:` field says "read in the file" vs "inferred from the brief". Repo-level `AUDIT-PRECEDENTS.md` lists false-positive classes already adjudicated and is inlined into every brief.
- Merge: "Consensus" means found by two or more seats AND verified by the host in the code. "Agreement raises priority, never confidence." A file-blind seat echoing a claim does not count toward the two. Fewer than two non-host seats answering is reported as a single-consultant review, not a council. Every finding ends with a disposition: `fixed`, `rejected: reason`, `unverified`. Rejected rows feed the precedents file.
- Pre-flight cost count: seats plus one verification read per expected finding; drop a seat before dropping verification.

### 4. deployhq/review-council (MIT, c44be34bbca91171af51358f333a058bac69b16e; 6 stars)

The most complete pipeline and the one with a machine-checkable finding schema.

- `rules/orchestration.md`: one independent round, no debate rounds ("the old anchoring revise-toward-consensus mechanism is deleted"); well-formed check; refutation by fresh cross-family verifiers; judge synthesis; report. Disagreement becomes a "Dissenting Opinions" section.
- `rules/delegation-format.md` finding fields: `severity` (critical|important|suggestion), `confidence` (high|medium|low), `location` (`relpath:line[-end]`), `symbol`, `concern` (kebab slug hint), `how_to_verify` (command or trace plus expected observation). A finding missing a field or with an out-of-enum value fails the whole reviewer output. The judge, not the reviewer, computes the dedup fingerprint `<relpath>::<normalized-symbol-or-hunk>::<normalized-concern>`.
- Refutation pass: a fresh verifier from a different model family reads the cited location and returns `UPHELD | REFUTED | INCONCLUSIVE` with a cited line. Absence of proof is INCONCLUSIVE, never REFUTED. Capped (`verify_max_findings` 12).
- Agreement is a badge, not a sort key: `[verified]`, `[cross-reviewed]`, `[1 reviewer, unverified]`. A critical raised by one reviewer stays Critical. Same-family agreement raises nothing. A non-distinct seat (Claude, OpenAI, Google, unknown) never counts toward corroboration.
- Dispatch (`rules/providers.md`, `scripts/rc-invoke-provider.sh`): Codex frozen argv `codex exec --sandbox read-only --skip-git-repo-check <prompt>` (prompt is positional, `-p` means `--profile` for codex); stdin closed (`</dev/null`) because codex, agy and gemini drain stdin at startup and hang otherwise; hard TERM then KILL timeout; large prompts go by stdin or a file, not argv (Linux 128 KB per argument). Google slot: `agy -p ... --print-timeout 600s --dangerously-skip-permissions`, probe `agy` first, the standalone `gemini` CLI as fallback, and both count as one reviewer slot. agy cold start can take minutes and sometimes exits 0 with empty stdout, handled by one time-boxed retry. agy's `--print-timeout` needs a unit (`600s`), a bare integer is rejected.
- Verified Claude seat lockdown: `claude -p --tools=Read,Grep,Glob --restricted --strict-mcp-config --setting-sources "" --permission-mode dontAsk --max-turns N --no-session-persistence --output-format json`. `--tools=` is the lockdown; `--allowedTools` leaves Agent/Skill. A planted repo settings hook did not run. For opencode: both `OPENCODE_DISABLE_PROJECT_CONFIG=1` and `--pure` are needed or a repo config or plugin re-grants write and runs code (reproduced by the authors).
- Review target: staged, worktree (via `git stash create` snapshot, tracked files only, so a stray `.env` is not sent), commit, or range; PR refs come from `gh pr view --json baseRefOid,headRefOid`, never branch names.
- Also ships a GitHub Action for unattended PR review (issue 27, closed).

### 5. DantesPeak85/the-council (MIT, 43d77651e0f443247237d37f69ac8295e38ee7c4; 3 stars)

- `skills/the-council/scripts/council_invoke.sh` runs Codex and Gemini in parallel with a per-advisor timeout and a sentinel `[COUNCIL-ADVISOR-FAILURE]` on failure.
- agy runs inside a pty (`script -q /dev/null agy ...`) because `agy -p` silently drops stdout when stdout is not a TTY; wrapped in macOS `sandbox-exec` with `council_sandbox.sb` unless the user passes an explicit unsandboxed flag. Flag order matters: an older shape `--print --add-dir DIR --prompt P` made agy read `--add-dir` as the prompt and abort.
- A "derail gate": reply must contain a `VERDICT` line, otherwise the answer is quarantined (agy 1.1.1 once answered about its own state instead of the task). One retry on empty answer. A diff safety-net test and a "ghost write" fixture exist (`tests/test_diff_safety_net.sh`, `tests/fixtures/ghost-write-agy.sh`) to prove a reviewer wrote nothing.
- Fixture-based tests with fake `codex`, `agy`, `gemini` binaries: model-free tests of the wrapper logic.

### 6. Others, briefly

| Tool | License / head | Mechanism in one line |
|---|---|---|
| yeameen/claude-code-review-council | MIT, a09bdba2c6bbd791f3d08efeb436617c28e93c90, 21 stars | Seven streams on one saved diff: `codex review` with an inlined prompt, agy, plus five Claude specialist subagents (security, performance, logic, regression, a blind robustness reviewer that sees the diff only). Falls back to Claude specialists on quota error or empty answer. Says "do not use `codex exec` for review" (contradicts deployhq, which does). Notes `codex review --base` cannot combine with a prompt, so intent is lost unless the diff is inlined. Advocates one blind reviewer because intent briefing anchored reviewers away from a real gap. |
| formin/multi-model-review | MIT, 5270ca3b2eb6e24b63d03a2480b34f5003f74e61, 8 stars | Build with one model, review with another, using portable spec-kit artifacts as the handoff; one prompt template per reviewer CLI (`templates/*-review-prompt.md`) and a shared `review-report.md`. |
| OrchestratorInc/agent-orchestrator | Apache-2.0, ed4a6814e7a065450e217d2c9e5c73983029e4c1, 14k stars | Reviewer is a session with a `review_run` record (status, decision, summary in inspector). Not cross-model by design; evidence is in its issues (section B). |
| awslabs/cli-agent-orchestrator | Apache-2.0, cba4f89c67027a2e93e394f8bcc1366ac1ddd302, 1.5k stars | Has reviewer agent profiles (`src/cli_agent_orchestrator/agent_store/reviewer.md`, `examples/orchestration/reviewer-opus.md`, `examples/codex-basic/codex_reviewer.md`). Only the profile files were seen; mechanism not studied. |
| ncksol/ai_tools issue 49 | issue only | A plan: every unit reviewed by a vendor other than the author's; higher effort for critical units; two-judge panel only before the final merge. Same rule as Control Rod's pre-check provider rule. |

Not confirmed in this pass: any cross-model review feature in Orca, Emdash or Conductor.

## B. Failure modes users hit

Reaction counts are not the useful number here: the review-specific issues have zero or no reactions, and the repos are small. Comment counts and the authors' own field notes are what exist. Treat these as anecdote with links.

| Failure | Source |
|---|---|
| Agent task marked complete with nothing asking "did it do what was asked?"; agent invents a function that does not exist; silent no-op reported as success | multica [issue 4098](https://github.com/multica-ai/multica/issues/4098) (6 comments, open) |
| Provider error after a review verdict was already delivered triggers redundant failure handoffs and reruns | multica [issue 9141](https://github.com/multica-ai/multica/issues/9141) (open) |
| Reviewer provider error leaves the review run stuck "running" or with a useless body; no provider error class shown | agent-orchestrator [7739](https://github.com/OrchestratorInc/agent-orchestrator/issues/7739), [7149](https://github.com/OrchestratorInc/agent-orchestrator/issues/7149) (open) |
| Review comments delivered one per message, one review becomes many fix/re-review rounds | agent-orchestrator [6830](https://github.com/OrchestratorInc/agent-orchestrator/issues/6830) |
| Worker's own replies on review threads re-delivered as new review work (loop) | agent-orchestrator [6300](https://github.com/OrchestratorInc/agent-orchestrator/issues/6300) (3 comments) |
| Review of a third-party PR or PR-less local work is not supported (no reviewable checkout) | agent-orchestrator [5916](https://github.com/OrchestratorInc/agent-orchestrator/issues/5916), [4349](https://github.com/OrchestratorInc/agent-orchestrator/issues/4349) (3 comments) |
| A codex run under `--sandbox read-only` could still read the operator's process environment and files outside the repo (canary found) | review-council [issue 26](https://github.com/deployhq/review-council/issues/26) |
| agy: first call takes minutes; exits 0 with empty stdout; `-p` drops stdout without a TTY; stdin must be closed; `--print-timeout` needs a unit; `--add-dir` ordering breaks the prompt | review-council `rules/providers.md`; the-council `council_invoke.sh`; model-council `agy-seat.sh` |
| agy headless auto-denies shell and out-of-workspace reads but its file viewer opens anything inside the start folder | model-council `agy-seat.sh` header (measured 2026-10-18) |
| Gemini CLI consumer sign-in sunset 2026-06-18 ("migrate to the Antigravity suite"); Workspace accounts get `DASHER_USER` ineligible | review-council `rules/providers.md` |
| Codex model slug not served by an older CLI; usage window spent mid-review; `-C` outside a git repo exits 0 with an empty answer | model-council `codex-seat.sh`, `council.md` |
| A repo config can re-grant write or run plugin code to a "read-only" reviewer unless project config is disabled | review-council `rules/providers.md` (opencode, reproduced) |
| Review quality: false positives that look authoritative; anchoring on the author's intent note hides a bug | yeameen `SKILL.md`; model-council `council.md` |
| Slow, partial coverage: a reviewer hits token budget or request timeout and reviews 5 of 23 files | review-council [issue 21](https://github.com/deployhq/review-council/issues/21) (spike on `ocr`) |
| Munder-Difflin: agy messages stuck in queue on manual prompts; sandboxed agents blocked from local hook server | munder-difflin [#201](https://github.com/HarnessMD/munder-difflin/issues/201), [#674](https://github.com/HarnessMD/munder-difflin/issues/674) (both open, no discussion) |

## C. Lessons from this session's own manual runs

Source: `/home/flyfission/worktrees/control-rod-board/.nuclear/changes/board-redesign/evidence/review/` (`BRIEF.md`, `codex.md`, `grok.md`, `agy.md`, `SYNTHESIS.md`) plus the task statement. The files record the briefs and results; the CLI-flag lessons below come from the owner's description of the runs and are consistent with the independent reports above.

1. Codex worked as `codex exec --ephemeral -s read-only -o <file>`. `-o` gives the last message as a file, which removes terminal scraping. Matches model-council and review-council.
2. Grok rejected `--add-dir` and needed an explicit read-only command allowlist. Control Rod must have a per-CLI profile that says which of {extra dirs, command allowlist, tool allowlist} that CLI supports; never assume one flag exists everywhere.
3. agy headless auto-denied shell commands. It needed instructions that said to use file tools only. Matches model-council (empty folder, brief inline) and the-council (derail gate).
4. One reviewer cited file names that did not exist. SYNTHESIS.md already marks claims "verified" against code and rejected some. Same pattern as model-council ("quote the line") and review-council (refutation pass). Findings must be mechanically checked before they are shown as findings.
5. The reviewers shared the author, and `verification.md` E-02 already states "a model review is not proof". Keep that wording in the product.
6. In this run, agreement count was reported ("3 of 3", "2 of 3") and was useful for triage, but agreement did not replace verification (K1 to K5 each says "verified").

## D. Recommended design for Control Rod

### D1. What a review panel is

A **review panel** is a set of one-shot, read-only runs, each on a different runtime, over one frozen **review target**, producing structured findings that are verified and merged into a **panel report**. It is advisory input to a person. It is never an approval.

Mapping to the kernel (`kernel/src/transition.rs`, which is a trust surface needing the owner's signature to change):

- Rule 3: the pre-check must come from a different agent baseline and a different provider than the author. A panel reviewer on the author's provider can still run as advisory input, but it does not count as the pre-check and is badged "same runtime as author". The existing owner override stays the only way to let a same-provider run be the pre-check.
- Exactly one panel reviewer (or a chosen subset) may be designated "submit as pre-check". That run is submitted through the existing `SubmitPreCheck` path with its own agent baseline and runtime. Other seats are recorded as evidence attached to the same package, not as pre-checks. This needs no kernel change.
- Rule 1 and 5 stay intact: only a person releases, accepts, returns or rejects; a panel verdict cannot do any of those. A panel with unresolved verified critical findings makes the Accept button state the findings (the K3 pattern already in the board spec), it does not block the kernel rule.
- Person verification and the independence rule (`person-verification.ts` `originators()`) are untouched. Panel agreement must never be shown as independent person verification.

### D2. How a panel is requested

One request object, three entry points, all producing the same record.

```
ReviewRequest {
  target: { kind: "card_revision" | "branch" | "pr" | "folder" | "document",
            ref: string,            // card revision id, branch+base, PR number, or path
            digest: string }        // sha256 of the frozen snapshot
  seats: [{ runtime: "codex"|"grok"|"agy"|"claude"|"gemini", effort?, lens? }]
  min_seats: number                 // below this the report says "single consultant"
  as_pre_check: runtime | null
  budget: { minutes_per_seat: number, max_findings_verified: number }
}
```

- On a card: a "Request review" action on the card in Agent check or at any time after output exists. Default seats come from the card's review strictness (light: one other-runtime seat; independent check: at least two seats on two providers other than the author's). The target is the card's current revision output, already frozen and digested.
- On a branch or PR: a command (`review branch X vs main`, `review PR 123`). For a PR use `gh pr view --json baseRefOid,headRefOid` and fetch by SHA, never by branch name (review-council rule). The daemon creates a detached worktree at head and a saved `changes.diff` for the base...head range.
- On a folder or document: copy the folder (or the named files) into a read-only snapshot directory; the digest is over that snapshot. Untracked files are copied only if listed; default to tracked files so a stray `.env` is not sent (review-council `git stash create` approach).
- Same record, same evidence trail. A panel run is created through the existing run path so attestation and policy checks apply to it too.

### D3. How each reviewer runs

All seats run through the existing Go daemon launcher in the OS sandbox, as one-shot print-mode runs (consistent with ADR 0020: no steering, no ACP). Reviewer state: a fresh workspace, read-only mount of the snapshot, no network except the model endpoint, a private `HOME` per seat, secrets not in the environment (review-council issue 26: a read-only codex sandbox could still read process environment). The brief is data on stdin or a file, never argv.

Per-CLI **reviewer profile** (a total table keyed by provider, with a compiler or schema check that every provider has a row; idea from munder-difflin `providerAutomation.ts`). Each entry records: invocation, read-only mechanism, how to give it the brief, how to get the answer, timeout flag, known quirks, and a last verified CLI version.

| CLI | Headless shape (from sources and this session) | Notes |
|---|---|---|
| Codex | `codex exec --ephemeral -s read-only --skip-git-repo-check -C <snapshot> -o <answer-file> -` with the brief on stdin | Verified here. Close stdin only when the brief is a positional arg; otherwise it reads stdin. Pin effort with `-c model_reasoning_effort`. Detect "usage limit" text and mark the seat empty (or rerun on a declared fallback model). |
| Claude Code | `claude -p --tools=Read,Grep,Glob --restricted --strict-mcp-config --setting-sources "" --permission-mode dontAsk --max-turns N --no-session-persistence --output-format json` | From review-council (verified by its authors). `--tools=` is the lockdown. Use a runtime different from the author's when the author is Claude. |
| Grok | read-only command allowlist; do not pass `--add-dir` | Verified in this session. Put the snapshot at the working directory instead. |
| agy (Antigravity) | `agy -p "<brief>" --model <slug> --disable-slash-commands --sandbox --print-timeout 600s`, started in the snapshot directory or an empty directory with the files inlined; never `--dangerously-skip-permissions` | File-tools-only instruction in the brief. Run in a pty if stdout is not a TTY drops output (the-council). Close stdin. Treat exit 0 with empty stdout as failure, retry once, time-boxed. Count `agy` and `gemini` as one slot. |
| Gemini CLI | `gemini -p ... --skip-trust` only with API key or Vertex | Consumer sign-in ended 2026-06-18. Low priority, fallback to agy slot. |

Common daemon rules (all from observed failures):
- Hard timeout: TERM, then KILL after a short grace. Per-seat minutes come from the request budget.
- Stdin closed unless the CLI reads the brief from it.
- Non-zero exit, blank, truncated, or malformed output means the seat is **empty**. Empty seats never count as agreement. Distinct exit classes: refused-before-call, CLI error, blank, timeout, quota, auth, malformed.
- Preflight probe (opt-in) per CLI: version, auth, model listing (`agy models`, `codex debug models`). A model not served marks the seat unavailable with the fix, not silently skipped.
- After the run, a **write canary**: compare the snapshot digest before and after (the-council's ghost-write test). A changed digest voids the seat's findings and raises a policy event.
- Panel quorum: if fewer than `min_seats` non-author-runtime seats answer, the report header says "single consultant review, no cross-vendor check happened".
- Run seats in parallel but bounded by the daemon's concurrency limit; subscription usage windows are shared across seats on one vendor, so do not launch two seats of one vendor at once.

### D4. The shared brief

Built by the control plane from the request, identical for every seat except an optional lens line. Stored as an artifact with its digest.

Contents:
1. Target description: what was changed or produced, the base and head (or snapshot) digests, and what is out of scope.
2. Intent: the card's statement of work or acceptance criteria and any explicit deferred items. (Review-council and model-council both found that intent finds divergence-from-intent bugs; yeameen adds that one **blind** seat without the intent note finds what the framing hid. Make "blind seat" a per-seat option, default on for one seat in an independent check.)
3. Rules: the repo rule that no engineering number may be typed by a model must be quoted, so a reviewer checks that numbers cite a recorded tool run with digest.
4. File access statement per seat: what it may read. File-blind seats receive the diff and excerpts inline with line numbers generated from disk (`nl -ba`), and are told to cite brief line numbers, not repo line numbers.
5. Evidence rule, in the brief verbatim: every finding must quote the lines that motivate it and name a test or command that would falsify it; otherwise it is capped at low confidence and shown as unverified.
6. Precedents: a repo file of already-adjudicated false-positive classes (model-council `AUDIT-PRECEDENTS.md`). Control Rod can store these as records and include the relevant ones.
7. Output contract: JSON only, schema below, no prose outside it.
8. Prohibitions: do not edit, create or delete files; do not run state-changing commands; use file tools only (agy).
9. Never in the brief: secrets, `.env`, keys. Briefs leave the machine to the vendor; the daemon applies the same redaction and allow rules as other outbound content and shows the person what goes where before the first panel on a card.

### D5. Structured finding schema

Borrow the field set of review-council, add what the Control Rod evidence model needs. A seat must return JSON conforming to this; the daemon validates and rejects the seat output if any required field is missing or out of enum.

```
Finding {
  id: string                       // seat-local
  severity: "critical" | "major" | "minor" | "note"
  confidence: "high" | "medium" | "low"
  category: "correctness" | "safety" | "numbers" | "traceability" | "tests" | "scope" | "security" | "clarity" | "other"
  claim: string                    // one sentence
  location: { path: string, line_start: int, line_end?: int } | { section: string }
  quote: string                    // the exact text at the location
  falsify_by: string               // command, input or observation that would disprove it
  suggested_fix?: string
  basis: "read_in_file" | "inferred_from_brief"
}
PanelSeatResult { seat, runtime, model, status: "ok"|"empty"|"timeout"|"quota"|"auth"|"error"|"malformed"|"wrote_files", findings: Finding[], overall: string }
```

Do not let the reviewer author the dedup key. The control plane computes it.

### D6. Verification against the code

Verification is a **deterministic gate first, then an optional model gate**. This answers the "reviewer cited file names that did not exist" failure.

Stage 1, deterministic, no model, cheap, mandatory:
- `path` resolves inside the snapshot; the file exists at the target digest.
- `line_start`..`line_end` is within the file; `quote` appears at (or within a small window of) those lines after whitespace normalisation.
- For a diff target, the location is in a changed hunk or is flagged "outside the change".
- Status per finding: `anchored` (all checks pass), `unanchored` (path or quote not found), `outside_target`. Unanchored findings are never shown as findings; they are listed in a collapsed "Unverifiable claims" section with the seat name. A seat whose unanchored rate is high gets a visible reliability badge for this run.
- For numeric claims, check against recorded tool-run values, not a model's reading.

Stage 2, refutation by a fresh run on a different runtime from the finder (review-council design), bounded to the top N anchored findings by severity (default 12). The verifier is given only the finding, the location and the code, and returns `UPHELD | REFUTED | INCONCLUSIVE` with a cited line; absence of proof is INCONCLUSIVE. A finding that no stage 2 run examined stays `anchored, not refuted`.

Rule from both model-council and review-council: **agreement raises priority, not confidence.** A finding raised by two seats counts as corroboration only if both seats read the file (`basis` read_in_file) and they are different vendors.

### D7. Deduplication and agreement count

- Cluster key computed by the control plane: `path :: enclosing symbol or hunk id :: concern bucket`, where the concern bucket comes from `category` plus a normalized claim (token overlap or a small embedding match), with a fallback of same file and overlapping line ranges. Merge by keeping the most specific `claim` and `suggested_fix`, union the seats.
- Agreement count shown per merged finding: `2 of 3 seats, 2 vendors`. Also show which seats were empty, so "2 of 3" is not read as "2 of 2".
- Same-vendor seats count once. agy and gemini count as one vendor.
- Single-seat criticals stay critical (do not demote for lack of a second voice), shown as "1 seat, unverified" or "1 seat, upheld by <runtime>".
- Disagreements (one seat says X is correct, another says defect) are shown as a dispute with both quotes; no automatic winner.

### D8. Presentation on the card

Panel report panel on the card, inside the existing review surface:
1. Header: target digest, seats requested vs answered, vendor count, quorum statement, time and usage ("not reported" when a CLI gives none; never $0).
2. Sorted list: severity first, then verification state, agreement as a badge. Each row shows `[upheld]`, `[anchored]`, `[1 seat]`, `[2 vendors]`.
3. Per finding: claim, quote with link into the diff or file viewer at that line, falsify_by, suggested fix, and three person actions: Accept (becomes a card note or a follow-up task), Reject with reason, Defer. Rejected rows can be stored as precedents. Every finding ends with a disposition (fixed, rejected with reason, unverified), mirroring model-council.
4. Collapsed sections: Unverifiable claims, Dissent, Empty seats with reason and remediation (for example "agy not authenticated; run `agy` once").
5. Buttons state what is signed, and an unresolved verified critical finding changes the sign-off button text the way the existing board spec (K3) already requires. Do not display the panel as "passed".

### D9. Evidence and policy records

- Each seat run records: runtime, CLI version, model slug as reported, flags used (from the profile), brief digest, snapshot digest before and after, raw answer artifact, validation result, exit class, duration, usage if reported.
- The merged report is a record with a digest and the list of person dispositions.
- Wording: "model review is not proof" (E-02) stays on the report. Same-author coupling is partial; the panel is recorded as evidence of review, not as person verification.
- Policy hooks: a profile row is a policy-controlled surface (changing a reviewer's flags is changing what an agent may do), so it changes only through the same gate as other agent-authority changes.

### D10. Solo and small teams

Per the owner decision and the board review notes: for an independent check card with no second person, the panel gives a second-runtime pre-check (already required by the kernel) but cannot stand in for a second qualified person. Show both facts. The synthesis item about a defined solo path (a second agent from a different provider plus a recorded single-operator statement) remains a parked owner decision; the panel report is the evidence such a path would use.

### D11. What not to copy

- `--dangerously-skip-permissions`, `--yolo`, `bypassPermissions` (munder-difflin defaults, review-council agy argv). Reviewers stay read-only.
- A single judge model that silently rewrites severities (review-council's judge). Keep the merge deterministic; use a model only for refutation, and make its verdict visible.
- Debate rounds or sharing the synthesis back to reviewers (review-council deleted them as anchoring).
- Multica's code or its status-as-behavior model: license forbids embedding in a distributed product; ideas used here are only the verifier-schema and fresh-context verifier points from its issue 4098.
- Any dependency on a specific model slug in code; slugs live in the profile table and are checked by a preflight (`agy models`, `codex debug models`).

### D12. Build order (smallest useful first)

1. Reviewer profile table plus a daemon "reviewer run" mode: read-only snapshot, brief on stdin or file, timeout, exit classes, write canary. Fixture tests with fake `codex`, `grok`, `agy` binaries (idea from the-council's `tests/fixtures`).
2. Brief builder, JSON finding schema, validator, Stage 1 anchoring.
3. Panel record, report view on the card, dispositions.
4. Dedup and agreement badges; empty-seat and quorum statements.
5. Stage 2 refutation; precedents store.
6. Target kinds beyond card revision: branch, PR, folder.
7. Optional: unattended PR panels (review-council has an Action, closed issue 27).

## E. Sources (all accessed 2026-11-06)

- HarnessMD/munder-difflin at f797048cc88ca2ff94bfc6c8c93b16f47a201f15: https://github.com/HarnessMD/munder-difflin (MIT)
- multica-ai/multica at 282f48eed2531f467ed4e6febc2a59b590d3e711: https://github.com/multica-ai/multica (Apache 2.0 plus additional conditions, restricts hosted or embedded commercial use); issues 4098, 9141
- OSideMedia/model-council at 67450d99ed6059e04d6cae01416691a5a783d444: https://github.com/OSideMedia/model-council (MIT)
- deployhq/review-council at c44be34bbca91171af51358f333a058bac69b16e: https://github.com/deployhq/review-council (MIT); issues 21, 26, 27
- DantesPeak85/the-council at 43d77651e0f443247237d37f69ac8295e38ee7c4: https://github.com/DantesPeak85/the-council (MIT)
- yeameen/claude-code-review-council at a09bdba2c6bbd791f3d08efeb436617c28e93c90: https://github.com/yeameen/claude-code-review-council (MIT)
- formin/multi-model-review at 5270ca3b2eb6e24b63d03a2480b34f5003f74e61: https://github.com/formin/multi-model-review (MIT)
- OrchestratorInc/agent-orchestrator at ed4a6814e7a065450e217d2c9e5c73983029e4c1: https://github.com/OrchestratorInc/agent-orchestrator (Apache-2.0); issues 4349, 5916, 6300, 6830, 7149, 7739
- awslabs/cli-agent-orchestrator at cba4f89c67027a2e93e394f8bcc1366ac1ddd302: https://github.com/awslabs/cli-agent-orchestrator (Apache-2.0)
- ncksol/ai_tools issue 49: https://github.com/ncksol/ai_tools/issues/49
- Control Rod internal: `/home/flyfission/worktrees/control-rod-m1/kernel/src/transition.rs` (pre-check rules 1 to 5), `/home/flyfission/worktrees/control-rod-board/.nuclear/changes/board-redesign/evidence/review/` (BRIEF, SYNTHESIS, codex, grok, agy), `.../verification.md` E-02

Limits of this pass. Flags quoted for Grok come from the session's own runs and were not re-run here. No CLI was executed. Star counts are from the API on the access date. Licenses were read from each repo's license file or the GitHub API; Multica's Part I conditions were read from its `LICENSE`, and a lawyer should confirm the exact scope before any reuse beyond ideas.
