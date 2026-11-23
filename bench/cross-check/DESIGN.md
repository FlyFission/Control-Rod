# Benchmark design v2 (reconciled, for agreement)

Status: **proposed**. Reconciles two independent, blind reviews of v1 (PR #160 at `d1ef5e7a`). Both reviewers answered "agree with changes":

- Antigravity on Gemini 4 Neon (`gemini-4-neon-high`): 9 blockers, 7 majors, 4 minors.
- Codex on Astra (`gpt-6.2-astra`, medium effort): 6 blockers, 8 majors.

Nothing changes in code until both reviewers agree with this document and the owner says go. The planning figures quoted below come from the reviewers. They are inputs to a script that does not exist yet, not results.

## 1. What a run claims

The run compares two named systems: Claude Code on one pinned Claude model and Codex on one pinned OpenAI model. It does **not** claim that vendor diversity helps in general (Astra 7). The headline is the paired difference, on the same patches, between the same-model checker and the other-vendor checker. That difference is reported for defects caught and for good patches wrongly rejected.

## 2. Two phases, so the publication run happens once

Both reviewers say v1's 20 easy tasks cannot answer the question. They disagree on how many tasks would: Neon says about 60 harder tasks, Astra says about 280 to 620. Both say the number depends on how often a patch passes the public tests but fails the hidden ones. Call that rate q, measured per author attempt. Nobody knows q for these agents yet.

- **Phase 0, calibration.** About 6 to 10 tasks drawn from a pool that is **disjoint** from the publication tasks. Phase 0 checks the harness, isolation, grading and cost. It also measures q, how often the two checkers disagree, and how outcomes correlate within a task. Its results are never published as findings.
- **Sizing.** A script, `power.py`, simulates the clustered paired design using the phase 0 estimates. It gives the task count needed for a chosen effect size at 80% power on both endpoints, catches and false rejections. The count is frozen and committed before phase 1 starts.
- **Phase 1, the publication run.** It uses the frozen count. If the owner's budget ceiling cannot reach that count, the run is titled "feasibility pilot" everywhere, including `share.md`, and makes no claim about effectiveness. Both reviewers agree on this rule.

The owner decides the effect size worth detecting and the budget ceiling. Everything else is fixed by this document.

## 3. Tasks

- The source must be newer than both models. The first choice is a SWE-bench-Live slice whose issues were created after both models' cutoffs. SWE-bench Pro is the second choice. Verified is the fallback only, harder tiers only, with a pre-run audit (Neon 6, Astra 9). Whether Live and Pro run cleanly in their harness on the owner's Mac is checked in phase 0, not assumed.
- **One immutable local snapshot** is used for both selection and grading, with validated IDs, row count, fields and digest (Astra 10, Neon 15).
- **Audit before any output.** `audit.md` shows each task's issue, its hidden tests (`FAIL_TO_PASS`, `test_patch`), and the base and gold-patch behavior, including flakiness. Exclusions and their reasons are committed before agents run. The person who audits the hidden tests is not the A4 reviewer (Neon 6, 12; Astra 9).
- Repository and difficulty quotas, and the order of reserve tasks, are frozen in the manifest. `select` fails if it cannot fill `n` (Neon 17).

## 4. Isolation and blinding (both reviewers: blocker)

- Each call gets a fresh, neutrally named directory **outside** the Control Rod repo, the run directory and `$HOME`. The directory holds a single-commit tree with no history, no remotes and no caches, so `git rev-list --all --count` is 1 (Neon 1, 2; Astra 5).
- Agents cannot see the run directory, task rows, transcripts, other verdicts or credentials. Web search is off for every agent. During its own review, Codex ran about five web searches under a read-only sandbox, which shows this is needed. Network is off except the model transport. Memories, MCP servers, user config, rules and slash commands are disabled, using the same flags as Control Rod's daemon (`daemon/internal/runner`).
- Phase 0 runs a boundary probe **from inside** each role. It tries to read the run directory, read git history and reach the network, and it must fail at each.

## 5. Matched capabilities (both reviewers: blocker or major)

- **Matched, not stock products.** Both authors get file tools plus a sandboxed shell with the network off. Both checkers get read and search tools plus a sandboxed shell. A checker's tree is verified unchanged afterwards. The Claude checker does not use `plan` mode.
- The models, CLI builds, reasoning effort and timeouts are pinned and recorded. Separate timeouts apply to authors and checkers. The resolved model identity is taken from each call's own output.
- Prompts go on stdin. The verdict follows a strict JSON schema, and the example in the prompt is valid JSON. A non-zero exit, a timeout, stale output or a timed-out author's partial work never counts as a normal result (Astra 8, Neon 9).

## 6. Grading

- The evaluator version is locked, and the split is passed explicitly. Phase 0 checks the report path against the running harness: Astra says the current upstream writes `logs/evaluation`, which is unverified. The exit code is checked. Each patch gets one status: `graded`, `empty`, `patch_invalid` or `infra_error`. **No score is produced while any patch is `infra_error` or missing** (Astra 1, Neon 7).
- **Control patches** run before any paid call: the unmodified base, the gold fix, a known-bad patch, and a deliberately missing report. The missing report must block scoring.
- **A1 is renamed** "selected hidden regression tests (SWE-bench `PASS_TO_PASS`)". It passes only with positive evidence that those tests ran and passed. Running the repo's real public test command is preferred where the harness allows it, and phase 0 decides which applies (Astra 2, Neon 11).
- The diff is taken against the recorded base commit with `-z` and `--binary`, and the raw diff is kept. Edits to hidden-test files are not stripped silently: they are rejected under a published rule and recorded (Astra 10, Neon 9).

## 7. Metrics

- **All four author × checker cells**, both directional paired differences, and an equal-author-weight cross-vendor contrast. The pooled number is shown only next to them (Neon 4, Astra 7).
- **Checker-only metrics on A1-eligible patches.** On bad patches: catches. On good patches: false rejections. Both get paired tables, McNemar tests and differences in percentage points. Intervals are task-clustered bootstrap intervals with a fixed seed. Wilson intervals are kept only for single-author cells (Neon 10, 14; Astra 11).
- **Explicit fail is separate from inconclusive.** Timeouts and errors are reported by vendor and role. The fail-closed gate result and a missing-verdict sensitivity analysis are both shown (Neon 8, Astra 3).
- **Workflow metrics are kept separate from checker metrics.** These are correct patches delivered per task attempted, escapes per attempt, defects among accepted patches, and the checker's marginal cost. `share.md` never credits A1 rejections to a checker.
- **Verdict stability.** Both checks are repeated on a preregistered random 10% of patches. This measures instability, not sample size (Astra).

## 8. Human arm (A4)

- A4 is labelled **exploratory and conditional on A3**. It uses a preregistered random sample of A3-passing patches, at most one patch per task, balanced across authors, with opaque review IDs (Neon 12, Astra 12).
- The reviewer gets the full issue and a read-only checkout. They do not get checker evidence (blinded variant). The order is persisted and survives resume. Sessions are capped. Skips, breaks, active time and pending counts are recorded.
- No A4 headline is published while reviews are pending.

## 9. Run integrity and budget (both reviewers: blocker or major)

- A frozen, hashed manifest records the config, tasks, prompts, model IDs and environment. Every attempt is keyed by those inputs. Records are written atomically. Interrupted calls are reconciled explicitly. A change of CLI or model mid-run stops the run (Astra 6, Neon 15).
- A **persistent reservation ledger** charges both vendors at an API-equivalent price from a versioned price table kept in the run. Each call's maximum is reserved before launch, and the call is refused if the reservation would pass the cap. A budget stop is never labelled finished. Token fields are normalized so cached input is not double-counted (Neon 13, Astra 6, 13).
- An infra error (exit code, rate limit, sign-in) is logged as an attempt and not cached as done. The run stops after a sign-in error or 3 consecutive infra errors (Neon 8).
- The run has a global deadline, separate bounds on evaluation, at most 2 workers per vendor, a Docker disk and architecture preflight, and image cleanup (Neon 16, Astra 14).
- `agents.local.json` flags are never copied into `run.json`. The record keeps only their names (Neon 15).

## 10. Release

- The protocol and the analysis script are published, timestamped, **before** phase 1.
- Compact records are committed. The full transcripts go in a checksummed release asset (Neon 20, Astra 13).
- Spend is split into actual, API-equivalent and unknown.
- `share.md` is generated from the released manifest. It says the benchmark called the CLIs directly, not through Control Rod's daemon. After a major product update, the old tasks are labelled a regression set, and claims about new work use a fresh holdout (Astra 13, Neon 18).

## Open, for the owner

1. **Effect size and budget ceiling.** Neon's design proposes $300 API-equivalent; Astra's proposes up to $4,000 and 14 days. The phase 1 size follows from `power.py` and the budget. Below that size, the run is a feasibility pilot.
2. **Blind defect adjudication.** Astra asks for a blinded adjudicator to confirm each "substantiated defect", with a second adjudicator for disputes. Neon does not. The proposal is to report "workflow blocked" as primary, and "substantiated defect" as secondary only if adjudicators are available. Whether those are people or a third model is the owner's call.
