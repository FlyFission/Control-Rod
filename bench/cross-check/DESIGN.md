# Benchmark design v3.1 (for final agreement)

Status: **proposed**. This version folds in two rounds of independent review by Antigravity on Gemini 4 Neon (`gemini-4-neon-high`) and Codex on Astra (`gpt-6.2-astra`, medium effort).

- Round 1, of v1 at `d1ef5e7a`: both answered agree with changes.
- Round 2, of v2 at `3ef17753`: both answered agree with changes in every section. Their section-by-section rewrites are adopted here. Where the two rewrites differ, the stricter one is used, unless the point is listed under **Open, for the owner**.

Code changes and runs wait until both reviewers agree with this text, with the owner's choices (end of file) filled in, and the owner says go. All margins and planning numbers here are policy choices or reviewer estimates. None of them is a measurement.

## 1. What a run claims

The run compares two named systems under a matched capability scaffold: Claude Code on one Claude model snapshot and Codex on one OpenAI model snapshot. **Each vendor's author and same-model checker use exactly the same snapshot.** If a snapshot is not immutable, the run records the resolved model IDs and dates, and it claims an auditable run, not an exact replay. It does **not** claim that vendor diversity helps in general.

The checker comparison is restricted to identical, nonempty, valid patches that pass A1. Each such patch is either hidden-test-failing ("bad") or hidden-test-passing ("good"). On those patches, the run compares the other-vendor checker with the same-model checker on two rates:

- (a) **explicit rejection** of bad patches;
- (b) **explicit rejection** of good patches, which is the false-rejection rate.

The run reports both author directions and their **equal-author-weight mean**. The equal-weight mean is the headline. A pooled number appears only next to the directional results.

"Rejection" means the checker returned an explicit fail verdict. It does not mean the checker found a real defect. The words "defects caught" appear only for the adjudicated outcome in §7. Hidden tests measure whether tests pass, not whether a maintainer would merge the patch.

## 2. Phases, sizing, and the one publication run

- **One fresh patch per task per author.** Authors never repeat, so repeats cannot inflate the sample. Let q_a be the rate at which an attempt by author a is nonempty, valid, passes A1, and fails the hidden tests.
- **Freeze before calibration.** The owner's decision margins (catch gain δ_catch and false-rejection cap δ_FR), the sizing procedure, the uncertainty rule, the nuisance ranges and the spending ceiling are committed before phase 0 starts.
- **Phase 0, calibration.** 10 to 12 tasks, disjoint from phase 1, with a separate budget. Their results are logged as excluded from phase 1. Phase 0 checks:
  - the harness;
  - the isolation probes (§4);
  - the grading controls (§6);
  - cold and warm timings;
  - per-call cost at the median and the 95th percentile;
  - enforceable reservation bounds (§9);
  - a sanity band for q_Claude and q_Codex.

  Its results are never published as findings.
- **Sizing (`power.py`).** The script simulates the clustered paired design for the equal-author-weight contrast. Its inputs are:
  - the **conservative lower bound of phase 0's q for each author separately**, not a point estimate;
  - preregistered conservative ranges for paired discordance (at least p_d = 0.30, with sensitivity at 0.35);
  - preregistered conservative ranges for within-task correlation (at least ρ = 0.20, with sensitivity at 0.30);
  - missingness.

  **Rule:** choose the smallest task count with at least 80% simulated probability of meeting both success criteria together. The simulation assumes a true catch gain of δ_catch and no true change in false rejection. Success needs two things at once:
  - the lower end of the 95% interval for the bad-patch contrast is above zero;
  - the upper end for the good-patch contrast is below +δ_FR.

  Add a 10% attrition buffer, and budget the stability repeats (§7). The design is built to detect a worthwhile effect. It does not certify that the true gain exceeds δ_catch.
- **Decision gate, frozen before phase 1.**
  - If phase 0 gives q below 0.15, switch to a harder tier or source (§3) and calibrate again before freezing.
  - If calibration cannot support a defensible range, or the required count exceeds the money, the time or the task supply, **designate a feasibility pilot or stop.** A feasibility pilot makes no claim about effectiveness, and it carries that label everywhere, including `share.md`.
  - The script, its inputs, assumptions and output, the task count, and the publication-or-pilot designation are committed before phase 1.
- **Never top up, relax a margin, or switch cohorts after seeing phase 1 outcomes.**

## 3. Tasks

- **Ranked source.**
  1. Issues whose problem and solution were first public **after the later of both verified model cutoffs**, for example a dated SWE-bench-Live slice. A dataset's release date does not establish this.
  2. SWE-bench Pro (public subset).
  3. SWE-bench Verified restricted to `15 min - 1 hour` and `1-4 hours`, with OpenAI's published list of audited defective tasks excluded before sampling.

  A cohort that is not post-cutoff is labelled **historical**. It is sized separately, its contamination risk is disclosed in `report.md` and `share.md`, and it is never pooled into a claim about new work. The cited audit percentage applies only to the 138 tasks OpenAI audited, not to all hard tasks. Phase 0 decides which source passes the §6 control gate on the owner's Mac.
- **State the target population**: languages, repositories and difficulty.
- **One immutable local snapshot** is used for selection and grading. Its path is passed to the grader explicitly. It is validated for unique IDs, row count, no pagination truncation, split, required fields and a SHA-256 digest.
- **Audit before any output.** `audit.md` holds each task's issue, its hidden tests (`FAIL_TO_PASS`, `test_patch`), and the base and gold-patch behavior over repeated runs. The audit checks whether the hidden tests ask for more, or less, than the issue does. Flaky or defective tasks are replaced from the frozen reserve order. Exclusions and their reasons are committed before any author runs.
- **Separation of roles.** The person who audits the hidden tests is never the A4 reviewer (see Owner decision 3).
- Repository and difficulty quotas, with actual numeric limits, and the reserve order are frozen in the manifest. `select` fails if it cannot fill `n`.

## 4. Isolation and blinding

- Every call gets a fresh directory with an opaque random name. The name carries no author, checker, repository or task identifier. The directory sits **outside** the Control Rod repo, the run directory and `$HOME`, for example `/var/tmp/cr-bench-<uid>/<nonce>/repo`.
- The directory is built from an **exported base tree** (`git archive`) and committed once with generic author and date metadata. It has no history, no remotes, no caches and no upstream object store, and it is deleted after its diff or verdict is captured.
- Agents get no run directory, task rows, transcripts, other verdicts, `$HOME`, credentials or parent rules (`AGENTS.md`). The following are all disabled with pinned flags that mirror `daemon/internal/runner`:
  - web search;
  - network, except the model transport;
  - memories, MCP servers, subagents, user config, rules and slash commands.

  The exact flag lists for Claude and Codex live in the benchmark config, not only by reference to the daemon.
- **Probes, for each vendor and role, in phase 0.** A permitted read must succeed. Each of these must fail:
  - reading the run directory, `$HOME` or credentials, upstream objects, git history or `AGENTS.md`;
  - network egress from the shell;
  - provider-native web search or tools;
  - MCP or subagent tools;
  - a checker writing to source.

  If any probe does not fail, nothing runs.

## 5. Matched capabilities

- **Matched, not stock products.**
  - Both authors get file tools and a workspace-write shell in a sandbox with the network off.
  - Both checkers get read and search tools and a shell on **read-only mounted source**, with a separate writable scratch directory, `PYTHONDONTWRITEBYTECODE=1`, and the same access to public tests.
  - The checker tree is verified unchanged afterwards. A change counts as a harness or policy error.
  - The Claude checker does not use `plan` mode.
  - Every call is a fresh session.
- Tier parity is verified in phase 0, then pinned and recorded: exact model IDs, CLI builds, reasoning effort, context and truncation rules, and separate author and checker timeouts. The resolved model identity comes from each call's own output. A model whose identity cannot be verified is not described as pinned.
- Prompts go on stdin. The checker prompt asks about functional correctness, completeness and absence of regressions, and drops "would merge". It shows a valid JSON example and requires a strict schema with structured defect citations: a location and a short reason for each.
- **Failure taxonomy.**

  | What happened | Recorded as | Then |
  |---|---|---|
  | Nonzero exit, rate limit, sign-in error, stale output | `infra_error` | Retried or halted under §9 |
  | Author timeout | `author_timeout` | Partial tree discarded; counts as ineligible and unresolved, not retried |
  | Checker timeout, or exit 0 with a malformed verdict | `inconclusive` | Scored separately, not retried |

  A valid verdict is never retried.

## 6. Grading

- The evaluator package and its Python and uv interpreter are locked. The split and the local dataset path are passed explicitly. Each evaluation attempt has a unique evaluator run ID.
- Phase 0 verifies the exact report path, the report schema and the complete ID set against the harness as it actually runs. The exit code is checked.
- Every patch gets one status: `graded`, `empty`, `patch_invalid`, `author_timeout` or `infra_error`. **No score is produced while any patch is `infra_error` or missing.**
- **Control patches** are checked against their expected outcomes before any paid call: the unmodified base, the gold fix, a known-bad patch, and a deliberately missing report. The missing report must block scoring.
- **A1 has one frozen definition per cohort, chosen in phase 0.** The preferred definition is a named, frozen public baseline test command, run on the base and then on the candidate. It records the expected and executed test IDs, skips, timeouts and exit status.

  Otherwise A1 is named "selected hidden regression tests (SWE-bench `PASS_TO_PASS`)", never "public tests" or "CI". It passes only with positive evidence: the patch applied, `tests_status` and `PASS_TO_PASS` are present, there are zero failures, and the success list is not empty whenever `PASS_TO_PASS` is expected. Missing or malformed evidence counts as neither a pass nor a model failure.
- **Patch capture.**
  - Untracked build and cache files are excluded.
  - Paths are enumerated NUL-delimited, and the patch is diffed against the recorded base commit as a binary-safe patch that can be applied again.
  - The raw submission is kept intact.
  - A public rule, stated in `author.md`, marks a patch `patch_invalid` if it edits or adds test files by a published path pattern, or if it fails to apply. Secret hidden-test file names are never used for this. `patch_invalid` is excluded from checker calls and from the A1-eligible metrics, and it counts as unresolved in the workflow metrics. It never crashes the run.
  - The patch is re-applied to the recorded base, and **both checkers and the grader are verified to receive the same SHA-256 digest.**

## 7. Metrics

- Every rate prints its numerator and denominator. A rate with no denominator is "not estimable", never zero.
- **Four author × checker cells.** For each author, the report gives full three-outcome tables (pass, explicit fail, inconclusive) on bad patches and on good patches.
- The report gives both directional paired differences and the equal-author-weight contrast, in percentage points.
- **Inference.**
  - Exact McNemar is used only within one author's stratum, where tasks are independent.
  - The equal-author-weight and pooled contrasts use a bootstrap that resamples whole tasks with a fixed seed, keeping both authors and both verdicts together.
  - Wilson intervals are used only for single-author cells.
  - A repository sensitivity analysis is run, leaving one repository out at a time.
  - "Not significant" is not equivalence.
- **Primary checker metrics.**
  - True-positive rate: explicit rejection of bad patches.
  - False-positive rate: explicit rejection of good patches.
  - Youden's J, the true-positive rate minus the false-positive rate, shown with both components. It never replaces the joint decision rule in §2.
  - Inconclusives are reported by vendor and role. The report shows the complete-case result, the fail-closed gate result, and a worst-case missing-verdict analysis that treats every inconclusive first as a pass and then as a fail.
- **Workflow metrics are kept separate from checker metrics.** They cover the share of patches the workflow blocked, correct patches delivered per task attempted, escapes per attempt, defects among accepted patches, and the checker's marginal cost. A1 and `patch_invalid` rejections are never credited to a checker.
- **Substantiated defect (secondary).**
  - The original verdict and its rationale are preserved before anyone sees the hidden results.
  - Adjudicators are blind to vendor, to same-model or cross-vendor status, to the other verdict, and to the hidden grade for their first judgment.
  - Each judgment is supported, unsupported or indeterminate. Supported means a concrete in-scope defect backed by the patch or by a counterexample that can be reproduced.
  - Disagreements are resolved independently, and the counts are published.
  - Supported defects found in good patches are reported separately. They never rewrite the reference grade.
  - **Without this adjudication, the run does not use the words "defects caught".** The scope is Owner decision 2.
- **Verdict stability.** Both checks are repeated on a preregistered random 10% of checked patches, at least 12, chosen before any verdict is seen. The report gives the flip rate and Cohen's κ by vendor. **Only the first check enters the primary metrics.** The repeats are paid for from the same budget and never count toward sample size.

## 8. Human arm (A4)

- A4 is **exploratory and conditional on A3**. It has no human-only baseline, so the run makes **no claim about human time saved**. It can say only how many patches A3 filtered out.
- A4 is done only by a reviewer independent of the hidden-test audit and of defect adjudication. If no such reviewer exists, A4 is **omitted**, not run unblinded (Owner decision 3).
- The sample is frozen before phase 1:
  - queue size, for example 24 to 30;
  - sampling probabilities;
  - a cap per session, for example 10 patches;
  - rules for skips;
  - at most one patch per task, balanced across authors, with opaque IDs.
- The reviewer gets the full issue and a neutrally named, single-commit, read-only checkout. They get no history, no metadata and no checker evidence. This blinded review is not the same thing as evidence-assisted review in the product.
- The order is persisted across resumes. Active time includes writing the rationale. Selected, reviewed, skipped and pending counts are reported separately. `score()` refuses to output A4 aggregates while any review is pending.

## 9. Run integrity and budget

- **Frozen, hashed manifest.** It records:
  - config, tasks, and the randomized call order (blocked by task);
  - prompts, model IDs and CLI versions;
  - the dirty-tree flag, Docker version, image digests and host architecture;
  - the price table.

  Each attempt gets a unique directory keyed by those inputs. Records are written atomically, and interrupted calls are reconciled explicitly. A change of CLI or model mid-run stops the run.
- **Concurrency-locked reservation ledger.**
  - It tracks the cumulative call count across resumes: completed plus in-flight calls may not exceed `max_calls`, and a skipped empty check is never counted.
  - It tracks normalized API-equivalent USD across both vendors, counting cached input and reasoning tokens once.
  - Hard caps are passed to a CLI where it supports them, for example Claude `--max-budget-usd`.
  - For both vendors, the reservation covers **every model turn and tool loop in a session**, set from phase 0 (for example the larger of twice the 95th percentile and the CLI cap). The actual cost is reconciled after each call, and any overshoot is debited.
  - A new launch is refused if spent plus reserved plus the next reservation would pass the ceiling.
  - Calibration, retries, interrupted calls and stability repeats are all charged to the same ceiling.
  - An uncertain charge is never released as zero.
  - **If phase 0 cannot establish an enforceable bound, phase 1 does not start under a claimed hard cap.**
- **Retries.** The retry limits and the allowed causes are frozen. `infra_error` goes to `attempts.jsonl` and is never cached as done. The run halts on a sign-in error or 3 consecutive infra errors, and pauses and resumes cleanly around subscription quota windows.
- **Deadlines and resources.** A global deadline, separate evaluation bounds, at most 2 workers per vendor, a Docker preflight of disk, RAM, architecture and the exact images, cold and warm timings, and image cleanup.
- **A deadline or budget stop** produces an incomplete ledger, never an effectiveness score. That run either resumes under the unchanged manifest or is published as incomplete.
- **`agents.local.json`** holds local transport and sign-in flags only. It cannot override model, effort, tools or sandbox. The run records allowlisted, non-secret values and nothing else from it.

## 10. Release

- **Before phase 1**, the following are published and timestamped: the protocol, the `power.py` output, the frozen task manifest, the exclusions and reserve order, and the analysis script.
- **Compact records are committed**: `run.json`, the task IDs and metadata, the exclusions, the attempt ledger, `evaluation.json`, `reviews.json`, `results.json`, `report.md`, `share.md`, environment and image digests, host architecture, and billing definitions.
- **Full transcripts, prompts and raw patches** go in a release asset whose SHA-256 is in the released manifest. That asset ships only after inventory, digest, privacy and redistribution checks: no host paths, account details, tokens or local environment. Redactions and restricted artifacts are listed.
- **Spend** is split into actual, API-equivalent and unknown.
- **`score()`** validates completeness first.
- **`share.md`** is generated from the released manifest, only after every referenced artifact is verified to exist. It always carries:
  - the direct-CLI caveat (the benchmark calls the CLIs directly, not Control Rod's daemon);
  - both directions and the equal-weight contrast;
  - numerators, denominators and intervals;
  - inconclusive and missing counts;
  - the A4 status;
  - the historical-cohort disclosure where it applies;
  - the feasibility-pilot label where it applies.
- **After a major product update**, the old tasks become a regression set, and claims about new work use a fresh holdout.

## Owner decisions (2026-11-24, Control Rod project thread)

1. **$0 extra spend.** The run uses only the owner's existing Claude and ChatGPT subscriptions, signed in to the CLIs. It pauses at a usage limit and resumes when the limit resets. There is no API billing. Preflight refuses to start if `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or any other billing key is set for an agent process. API-equivalent cost is still computed from tokens, but **for disclosure only**. It is never a budget. The §9 reservation ledger enforces the call cap and a usage cap expressed in tokens.
   - **Sizing under §2:** `power.py` still computes the required task count. Phase 1 uses that count if the plan limits allow it within the frozen calendar window. Otherwise phase 1 uses the largest count they allow, frozen before phase 1, and is labelled a **feasibility pilot** with no effectiveness claim. The window is set from phase 0's measured throughput per quota window.
   - **Margins:** δ_catch = +15 percentage points, which both reviewers proposed. The owner did not choose δ_FR. Round 3 is asked to agree one value between +5 (Astra) and +10 (Neon).
2. **Adjudication: discordant rejections only.** Only the patches where one checker explicitly failed and the other passed are adjudicated, using the §7 protocol. That is enough for the paired difference. It does not support an absolute "substantiated catch rate". Concordant rejections are reported as explicit rejections only.
3. **A4 is omitted from this run.** The owner is the only maintainer. He audits the hidden tests before the run (§3) and adjudicates the discordant rejections after all checks finish and are hashed and locked. Because he saw the hidden tests during the audit, the adjudication cannot be blind to them. **This is disclosed** in `report.md` and `share.md`, and the full adjudication table is published. The adjudicator is still blind to vendor, to same-model or cross-vendor status, and to the other verdict.
