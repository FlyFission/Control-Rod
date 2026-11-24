# Benchmark design v3.3 (agreed)

Status: **agreed by both reviewers** (round 4, with Codex's one-sentence phase-0 launch fix applied). Code changes wait for the owner's go. This version folds in two rounds of independent review by Antigravity on Gemini 4 Neon (`gemini-4-neon-high`) and Codex on Astra (`gpt-6.2-astra`, medium effort).

- Round 1, of v1 at `d1ef5e7a`: both answered agree with changes.
- Round 2, of v2 at `3ef17753`: both answered agree with changes in every section. Their section-by-section rewrites are adopted here. Where the two rewrites differ, the stricter one is used.
- Round 3, of v3.1 at `0cbe53e4`: both answered agree with changes, five blockers each, all fixable at $0. Those fixes and the round-3 majors and minors are adopted here. Both accepted δ_FR = +5 percentage points.
- Round 4, of v3.2 at `9e1f1718`: both confirmed every round-3 blocker fixed. Neon: AGREE. Codex: one new blocker (the first phase-0 call had no launch rule), fixed here with Codex's own wording.

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
- **Freeze before calibration.** The owner's decision margins (catch gain δ_catch and false-rejection cap δ_FR), the sizing procedure, the uncertainty rule, the nuisance ranges, the lower-bound method, the calendar horizon, the cumulative call cap `max_calls` and the launch-gate token cap `max_tokens` are committed before phase 0 starts.
- **Phase 0, calibration.** 10 to 12 tasks, disjoint from phase 1, with a dedicated, pre-frozen call and token allocation tracked in the same ledger as phase 1. Their results are logged as excluded from phase 1. Phase 0 checks:
  - the harness;
  - the isolation probes (§4);
  - the grading controls (§6);
  - cold and warm timings;
  - per-call tokens at the median and the 95th percentile, and whether each CLI reports tokens at all;
  - the verified subscription billing route and throughput per quota window (§9, Owner decision 1);
  - a sanity band for each author's eligible hidden-failing yield q_a and eligible hidden-passing yield.

  Its results are never published as findings.
- **Sizing (`power.py`).** The script simulates the clustered paired design for the equal-author-weight contrast. Its inputs are:
  - the **conservative lower bound of phase 0's q for each author separately** (the lower 80% Wilson bound, frozen before phase 0), not a point estimate. Zero observed escapes for either author triggers the uninformative-calibration gate below instead of plugging in 0;
  - eligible hidden-failing and eligible hidden-passing yields, modelled separately for each author; ineligible attempts count toward neither;
  - preregistered conservative ranges for paired discordance (at least p_d = 0.30, with sensitivity at 0.35);
  - preregistered conservative ranges for within-task correlation (at least ρ = 0.20, with sensitivity at 0.30);
  - missingness.

  **Rule:** choose the smallest task count with at least 80% simulated probability of meeting both success criteria together, throughout the whole preregistered nuisance range. The simulation assumes a true catch gain of δ_catch and no true change in false rejection. Success needs two things at once:
  - the lower end of the 95% interval for the bad-patch contrast is above zero;
  - the upper end for the good-patch contrast is below +δ_FR.

  Add a 10% attrition buffer, and budget the stability repeats (§7). The design is built to detect a worthwhile effect. It does not certify that the true gain exceeds δ_catch.
- **Decision gate, frozen before phase 1.**
  - If either author's phase 0 point estimate q_a is below 0.15, switch to a harder tier or source (§3) and calibrate again before freezing.
  - If calibration cannot support a defensible range, or the required count exceeds what the verified subscription limits allow within the calendar horizon, or the task supply, **designate a feasibility pilot or stop.** A feasibility pilot makes no claim about effectiveness, and it carries that label everywhere, including `share.md`.
  - The script, its inputs, assumptions and output, the task count, and the publication-or-pilot designation are committed before phase 1.
- **Never top up, relax a margin, or switch cohorts after seeing phase 1 outcomes.**

## 3. Tasks

- **Ranked source.**
  1. Issues whose problem and solution were first public **after the later of both verified model cutoffs**, for example a dated SWE-bench-Live slice. A dataset's release date does not establish this. A cutoff that cannot be verified is treated as historical for claim purposes.
  2. SWE-bench Pro (public subset).
  3. SWE-bench Verified restricted to `15 min - 1 hour` and `1-4 hours`, with OpenAI's published list of audited defective tasks excluded before sampling.

  A cohort that is not post-cutoff is labelled **historical**. It is sized separately, its contamination risk is disclosed in `report.md` and `share.md`, and it is never pooled into a claim about new work. The cited audit percentage applies only to the 138 tasks OpenAI audited, not to all hard tasks. Phase 0 decides which source passes the §6 control gate on the owner's Mac.
- **State the target population**: languages, repositories and difficulty.
- **One immutable local snapshot** is used for selection and grading. Its path is passed to the grader explicitly. It is validated for unique IDs, row count, no pagination truncation, split, required fields and a SHA-256 digest.
- **Audit before any output.** `audit.md` holds each task's issue, its hidden tests (`FAIL_TO_PASS`, `test_patch`), and the base and gold-patch behavior over repeated runs. The audit checks whether the hidden tests ask for more, or less, than the issue does. Flaky or defective tasks are replaced from the frozen reserve order. Exclusions and their reasons are committed before any author runs.
- **Separation of roles.** The person who audits the hidden tests is never the A4 reviewer. In this run A4 is omitted (Owner decision 3).
- Repository and difficulty quotas, with actual numeric limits, and the reserve order are frozen in the manifest. `select` fails if it cannot fill `n`.

## 4. Isolation and blinding

- Every call gets a fresh directory with an opaque random name. The name carries no author, checker, repository or task identifier. The directory sits **outside** the Control Rod repo, the run directory and `$HOME`, for example `/var/tmp/cr-bench-<uid>/<nonce>/repo`.
- The directory is built from an **exported base tree** (`git archive`) and committed once with generic author and date metadata. It has no history, no remotes, no caches and no upstream object store, and it is deleted after its diff or verdict is captured.
- **Sign-in without exposure.** Each CLI process gets only a minimal, isolated login store for its own subscription sign-in, for example an isolated `CODEX_HOME` holding only `auth.json`, or Claude's minimal subscription credential. Session and memory directories are disabled or pointed at per-call scratch that is deleted after the call. The agent's tools and shell cannot read the real `$HOME`, unrelated credentials (`.ssh`, `.aws`, `.netrc`), the other vendor's sign-in, or persistent CLI history.
- Agents get no run directory, task rows, transcripts, other verdicts or parent rules (`AGENTS.md`). The following are all disabled with pinned flags that mirror `daemon/internal/runner`:
  - web search;
  - network, except the model transport;
  - memories, MCP servers, subagents, user config, rules and slash commands.

  The exact flag lists for Claude and Codex live in the benchmark config, not only by reference to the daemon.
- **Probes, for each vendor and role, in phase 0.** Positive controls must succeed: subscription sign-in reaches the model, and the agent can read the permitted exported tree and its synthetic base commit. Each of these must fail:
  - reading the run directory, sibling workspaces, the real `$HOME`, host credentials, the other vendor's sign-in, persistent CLI session directories, upstream objects, pre-base git history (`git rev-list --all --count` must equal 1) or `AGENTS.md`;
  - network egress from the shell;
  - provider-native web search or tools;
  - MCP or subagent tools;
  - a checker writing to source.

  If any result differs from its expected outcome, nothing runs.

## 5. Matched capabilities

- **Matched, not stock products.**
  - Both authors get file tools and a workspace-write shell in a sandbox with the network off.
  - Both checkers get read and search tools and a shell on **read-only mounted source**, with a separate writable scratch directory and the same access to public tests.
  - `PYTHONDONTWRITEBYTECODE=1` is set for all roles.
  - The checker tree is verified unchanged afterwards. A change counts as a harness or policy error.
  - The Claude checker does not use `plan` mode.
  - Every call is a fresh session.
- Tier parity is verified in phase 0, then pinned and recorded: exact model IDs, CLI builds, reasoning effort, identical context and diff truncation rules across both checkers, and separate author and checker timeouts. CLI auto-updates are off for the whole run. The resolved model identity comes from each call's own output. A model whose identity cannot be verified is not described as pinned.
- Prompts go on stdin. The checker prompt asks about functional correctness, completeness and absence of regressions, and drops "would merge". It shows a valid JSON example and requires a strict schema with structured defect citations: a location and a short reason for each.
- **Failure taxonomy.**

  | What happened | Recorded as | Then |
  |---|---|---|
  | A recognized subscription usage-limit response | `quota_paused` | That vendor pauses until the limit resets; no retry count, no infra-error strike (§9) |
  | Nonzero exit, sign-in error, stale output, other errors | `infra_error` | Retried or halted under §9 |
  | Author timeout | `author_timeout` | Partial tree discarded; counts as ineligible and unresolved, not retried |
  | Checker timeout, or exit 0 with a malformed verdict | `inconclusive` | Scored separately, not retried |

  A valid verdict is never retried.

## 6. Grading

- The evaluator package and its Python and uv interpreter are locked. The split and the local dataset path are passed explicitly. Each evaluation attempt has a unique evaluator run ID.
- Phase 0 verifies the exact report path, the report schema and the complete ID set against the harness as it actually runs. The exit code is checked.
- Every patch gets one status: `graded`, `empty`, `patch_invalid`, `author_timeout` or `infra_error`. **No score is produced while any patch is `infra_error` or missing.**
- **Control patches** are checked against their expected outcomes before any agent call: the unmodified base, the gold fix, a known-bad patch, and a deliberately missing report. The missing report must block scoring.
- **A1 has one frozen definition per cohort, chosen in phase 0.** The preferred definition is a named, frozen public baseline test command, run on the base and then on the candidate. Otherwise A1 is named "selected hidden regression tests (SWE-bench `PASS_TO_PASS`)", never "public tests" or "CI".

  For either definition, a nonempty expected test-ID set and the base-relative pass criterion are frozen. A candidate passes only if the report proves that every required ID executed and met that criterion. An empty expected set, an absent required ID, an unexpected skip, a timeout or a malformed report is not a pass. Missing evidence is resolved under the failure taxonomy and is never credited as a checker catch.
- **Patch capture.**
  - Untracked build and cache files are excluded.
  - Paths are enumerated NUL-delimited, and the patch is diffed against the recorded base commit as a binary-safe patch that can be applied again.
  - The raw submission is kept intact.
  - A public rule, stated in `author.md`, marks a patch `patch_invalid` if it adds, edits or deletes a test file, or renames one in either direction, by a published path pattern, or if it fails to apply. Secret hidden-test file names are never used for this. `patch_invalid` is excluded from checker calls and from the A1-eligible metrics, and it counts as unresolved in the workflow metrics. It never crashes the run.
  - The patch is re-applied to the recorded base, and **both checkers and the grader are verified to receive the same SHA-256 digest.**

## 7. Metrics

- Every rate prints its numerator and denominator. A rate with no denominator is "not estimable", never zero.
- **Four author × checker cells.** For each author and each hidden grade (bad, good), the report publishes a paired 3×3 table of same-model against cross-vendor first verdicts: pass, explicit fail, inconclusive.
- **Denominators and missing verdicts.** The primary explicit-rejection denominator is every eligible graded pair, and only an explicit fail counts as a rejection. The complete-case analysis drops a pair if either verdict is inconclusive. The operational fail-closed analysis blocks on fail or inconclusive. To bound the cross-minus-same rejection difference, the lower bound assigns cross inconclusives to pass and same inconclusives to fail; the upper bound reverses that. Bounds are computed within each author before equal weighting.
- The report gives both directional paired differences and the equal-author-weight contrast, in percentage points.
- **Inference.**
  - Exact two-sided McNemar is used only within one author's stratum, where tasks are independent.
  - The equal-author-weight and pooled contrasts use a bootstrap that resamples whole tasks with a fixed seed, keeping both authors and both verdicts together.
  - Wilson intervals are used only for single-author cells.
  - A repository sensitivity analysis is run, leaving one repository out at a time.
  - "Not significant" is not equivalence.
- **Primary checker metrics.**
  - True-positive rate: explicit rejection of bad patches.
  - False-positive rate: explicit rejection of good patches.
  - Youden's J, the true-positive rate minus the false-positive rate, shown with both components. It never replaces the joint decision rule in §2.
  - Inconclusives are reported by vendor and role, with the complete-case, fail-closed and bounded results above.
- **Workflow metrics are kept separate from checker metrics.** They cover the share of patches the workflow blocked, hidden-test-passing patches delivered per attempted task, escapes per attempt, hidden-test-failing patches among accepted patches, and the checker's marginal tokens. These are reference-test outcomes, not independently established correctness or defect counts. A1 and `patch_invalid` rejections are never credited to a checker. With A4 omitted, the run reports no human comparison and no human time saved.
- **Substantiated rejection (secondary, scope in Owner decision 2).**
  - A supported, unsupported or indeterminate rubric is frozen before phase 1. Supported means a concrete in-scope defect with a code-location citation from the patch, or a counterexample that can be reproduced.
  - Verdicts and rationales are hashed and locked before adjudication. The adjudication queue is anonymized and shuffled, and it is built **before `evaluation.json` is opened**, so the adjudicator is blind to vendor, checker role, the other verdict and each patch's hidden-test result.
  - Counts are reported by rejection direction and hidden grade, among the patches reviewed.
  - With one adjudicator there is no independent second judgment and no independent resolution of disagreements. This is disclosed.
  - Supported defects found in good patches are reported separately. They never rewrite the reference grade.
  - **Without adjudication, the run does not use the words "defects caught".**
- **Verdict stability.** Both checks are repeated on a preregistered random sample of min(n, max(12, ⌈0.10 n⌉)) of the n checked patches, chosen before any verdict is seen, so every patch is repeated when n is 12 or fewer. The report gives the flip rate and Cohen's κ by vendor, and κ is "not estimable" when undefined. **Only the first check enters the primary metrics.** The repeats count against the same call and token caps and are included in the phase 0 capacity estimate. They never count toward sample size.

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
  - the price table, used for disclosure only.

  Each attempt gets a unique directory keyed by those inputs. Records are written atomically, and interrupted calls are reconciled explicitly. A change of CLI or model mid-run stops the run.
- **Subscription-only billing, verified.** Before any model call, including calibration, preflight verifies the signed-in account and the subscription-only billing route (`claude auth status`, `codex login status` or their equivalents), with paid overage and fallback billing off. It also refuses to start if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY` or another billing key is set, or present in CLI config. An absent environment variable alone is not proof. If the route cannot be verified, nothing runs.
- **Concurrency-locked ledger.**
  - **Call cap (hard):** completed plus in-flight calls across all resumes may not exceed `max_calls`. A skipped empty check is never counted.
  - **Token cap (launch gate, not an in-session cutoff):** phase 0, including isolation probes and any recalibration, launches under its pre-frozen call allocation, timeouts, verified subscription-only billing route and global deadline; tokens are recorded for pacing, and no phase-0 percentile is required to launch. Before each phase-1 launch, the ledger reserves twice the frozen phase-0 95th-percentile tokens for that vendor and role when available; otherwise it gates the launch on calls and time, and keeps unknown usage as unknown. It reconciles actual tokens afterwards and refuses a launch if used plus reserved plus the next reservation would pass `max_tokens`. Subscription CLIs have no whole-session hard token limit, so a single call is bounded by its pinned timeout and by a CLI turn limit where one exists. The token cap is never described as a hard cap. If a CLI does not report tokens, its usage is recorded as unknown and launches are gated on `max_calls` and timeouts.
  - Calibration (under its dedicated allocation), phase 1 calls, retries, interrupted launches and stability repeats are all recorded in the same ledger. Unknown usage stays unknown, never zero.
  - API-equivalent dollars are computed from tokens for disclosure only.
- **Quota pauses and task blocks.** `quota_paused` pauses only that vendor until its limit resets, with logged timestamps. It never counts as a retry or an infra-error strike. The run halts if a vendor is still blocked 24 hours past its expected reset. Calls run in randomized task blocks: both authors and all four checker calls for a task finish before either vendor starts the next block, so neither vendor runs ahead. On every resume the CLI versions and resolved model IDs are checked again, and a change across a pause stops the run, which is then published as incomplete.
- **Retries.** The retry limits and the allowed causes are frozen. `infra_error` goes to `attempts.jsonl` and is never cached as done. The run halts on a sign-in error or 3 consecutive infra errors.
- **Deadlines and resources.** The frozen calendar horizon as a global deadline, never extended by quota pauses, separate evaluation bounds, at most 2 workers per vendor, a Docker preflight of disk, RAM, architecture and the exact images, cold and warm timings, and image cleanup.
- **A deadline or cap stop** produces an incomplete ledger, never an effectiveness score. That run either resumes under the unchanged manifest or is published as incomplete.
- **`agents.local.json`** holds local transport and sign-in flags only. It cannot override model, effort, tools or sandbox. The run records allowlisted, non-secret values and nothing else from it.

## 10. Release

- **Before phase 1**, the following are published and timestamped: the protocol, the `power.py` output, the frozen task manifest, the exclusions and reserve order, and the analysis script.
- **Compact records are committed**: `run.json`, the task IDs and metadata, the exclusions, the attempt ledger, `evaluation.json`, `reviews.json`, `results.json`, `report.md`, `share.md`, environment and image digests, host architecture, and billing definitions.
- **Full transcripts, prompts and raw patches** go in a release asset whose SHA-256 is in the released manifest. That asset ships only after inventory, digest, privacy and redistribution checks: no host paths, account details, tokens or local environment. Redactions and restricted artifacts are listed.
- **Spend** is reported as $0 actual (subscriptions only, verified), plus API-equivalent dollars for disclosure and any unknown usage.
- **`score()`** validates completeness first.
- **`share.md`** is generated from the released manifest, only after every referenced artifact is verified to exist. It always carries:
  - the direct-CLI caveat (the benchmark calls the CLIs directly, not Control Rod's daemon);
  - both directions and the equal-weight contrast;
  - numerators, denominators and intervals;
  - inconclusive and missing counts;
  - the A4 status (omitted in this run);
  - the adjudication disclosure: one adjudicator, the owner, who saw the hidden test definitions during the audit but not each patch's hidden-test result, with no independent second judgment;
  - the historical-cohort disclosure where it applies;
  - the feasibility-pilot label where it applies.
- **After a major product update**, the old tasks become a regression set, and claims about new work use a fresh holdout.

## Owner decisions (2026-11-24, Control Rod project thread)

1. **$0 extra spend.** The run uses only the owner's existing Claude and ChatGPT subscriptions, signed in to the CLIs, verified as in §9. It pauses at usage limits (`quota_paused`) and resumes when they reset.
   - **Sizing under §2:** the calendar horizon is frozen before phase 0. Phase 0 measures throughput per quota window, bottlenecked by the slower vendor and including stability repeats. From that, the largest feasible count N_feasible inside the horizon is computed. If N_feasible is below the count `power.py` requires, phase 1 is frozen at N_feasible and labelled a **feasibility pilot** with no effectiveness claim.
   - **Margins:** δ_catch = +15 percentage points and **δ_FR = +5 percentage points**, accepted by both reviewers in round 3. If a pilot's upper bound cannot exclude a +5 point rise in false rejections, that result is inconclusive. The margin is not widened because quota is scarce.
2. **Adjudication: discordant explicit rejections only.** The patches adjudicated are those where one checker returned an explicit fail and the other did not: fail with pass, and fail with inconclusive, in either direction. This secondary outcome is named the **substantiated discordant-rejection contrast**. It checks whether the raw discordant advantage rests on real defects. It establishes neither an absolute substantiated catch rate nor the full paired difference in substantiated catches, because two explicit rejections of the same patch can differ in support and fail-fail pairs are not audited. The report gives the unaudited fail-fail count next to it. Concordant rejections are reported as explicit rejections only. Adjudicating every explicit rejection remains a $0 option if the pilot is small.
3. **A4 is omitted from this run.** The owner is the only maintainer. He audits the hidden tests before the run (§3), then adjudicates under §7 after every check is hashed and locked and before `evaluation.json` is opened. He is blind to vendor, checker role, the other verdict and each patch's hidden-test result. He is not blind to the hidden test definitions, and he may infer that the other checker passed. There is no independent second judgment. These limits are disclosed in `report.md` and `share.md`, and the full adjudication table is published: issue ID, patch digest, anonymized citation, verdict and a short justification.
