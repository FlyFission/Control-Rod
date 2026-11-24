# Cross-vendor checking benchmark: fixture, calibration

Designation: **calibration (never published as findings)**. Scored 2026-11-24T14:51:20Z. Study digest `e33e5a4fdddb`.

The benchmark calls the Claude Code and Codex CLIs directly, not through Control Rod's daemon.
"Rejection" means an explicit fail verdict, not a confirmed defect. Hidden tests measure whether
tests pass, not whether a maintainer would merge.

This run makes **no effectiveness claim**.

## Equal-author-weight contrast (cross-vendor minus same-model explicit rejection)

| Patches | Point | 95% CI (task bootstrap) | Inconclusive bounds | Pooled |
|---|---|---|---|---|
| Hidden-test-failing | +0.0 pp | +0.0 pp to +0.0 pp | +0.0 pp to +0.0 pp | +0.0 pp |
| Hidden-test-passing (false rejection) | +0.0 pp | +0.0 pp to +0.0 pp | +0.0 pp to +0.0 pp | +0.0 pp |

Preregistered rule (bad-patch CI above 0 and good-patch CI below +5 pp): not met (shown only; it applies to a publication run).
"Not significant" is not equivalence.

## By author

### Author stub-a, bad patches (n = 2)

- Same-model rejected 2 of 2 (100%, 95% CI 34 to 100%); cross-vendor rejected 2 of 2 (100%, 95% CI 34 to 100%).
- Difference +0.0 pp, bounds +0.0 pp to +0.0 pp; complete-case +0.0 pp (n = 2); fail-closed +0.0 pp.
- Discordant: cross only 0, same only 0; exact McNemar p = not estimable.

| same \ cross | pass | fail | inconclusive |
|---|---|---|---|
| pass | 0 | 0 | 0 |
| fail | 0 | 2 | 0 |
| inconclusive | 0 | 0 | 0 |

### Author stub-a, good patches (n = 2)

- Same-model rejected 1 of 2 (50%, 95% CI 9 to 91%); cross-vendor rejected 1 of 2 (50%, 95% CI 9 to 91%).
- Difference +0.0 pp, bounds +0.0 pp to +0.0 pp; complete-case +0.0 pp (n = 2); fail-closed +0.0 pp.
- Discordant: cross only 0, same only 0; exact McNemar p = not estimable.

| same \ cross | pass | fail | inconclusive |
|---|---|---|---|
| pass | 1 | 0 | 0 |
| fail | 0 | 1 | 0 |
| inconclusive | 0 | 0 | 0 |

### Author stub-b, bad patches (n = 2)

- Same-model rejected 2 of 2 (100%, 95% CI 34 to 100%); cross-vendor rejected 2 of 2 (100%, 95% CI 34 to 100%).
- Difference +0.0 pp, bounds +0.0 pp to +0.0 pp; complete-case +0.0 pp (n = 2); fail-closed +0.0 pp.
- Discordant: cross only 0, same only 0; exact McNemar p = not estimable.

| same \ cross | pass | fail | inconclusive |
|---|---|---|---|
| pass | 0 | 0 | 0 |
| fail | 0 | 2 | 0 |
| inconclusive | 0 | 0 | 0 |

### Author stub-b, good patches (n = 2)

- Same-model rejected 1 of 2 (50%, 95% CI 9 to 91%); cross-vendor rejected 1 of 2 (50%, 95% CI 9 to 91%).
- Difference +0.0 pp, bounds +0.0 pp to +0.0 pp; complete-case +0.0 pp (n = 2); fail-closed +0.0 pp.
- Discordant: cross only 0, same only 0; exact McNemar p = not estimable.

| same \ cross | pass | fail | inconclusive |
|---|---|---|---|
| pass | 1 | 0 | 0 |
| fail | 0 | 1 | 0 |
| inconclusive | 0 | 0 | 0 |

## Checker rates (Youden's J = TPR - FPR)

| Author / checker | TPR (bad rejected) | FPR (good rejected) | J |
|---|---|---|---|
| stub-a/same | 2 of 2 (100%, 95% CI 34 to 100%) | 1 of 2 (50%, 95% CI 9 to 91%) | 0.5 |
| stub-a/cross | 2 of 2 (100%, 95% CI 34 to 100%) | 1 of 2 (50%, 95% CI 9 to 91%) | 0.5 |
| stub-b/same | 2 of 2 (100%, 95% CI 34 to 100%) | 1 of 2 (50%, 95% CI 9 to 91%) | 0.5 |
| stub-b/cross | 2 of 2 (100%, 95% CI 34 to 100%) | 1 of 2 (50%, 95% CI 9 to 91%) | 0.5 |

## Inconclusive verdicts

- stub-a/same: 0 of 4
- stub-b/cross: 0 of 4
- stub-b/same: 0 of 4
- stub-a/cross: 0 of 4

## Verdict stability (first check against a repeat)

- stub-a: 0 flips of 8; Cohen's kappa 1.0
- stub-b: 0 flips of 8; Cohen's kappa 1.0

## Workflow outcomes (reference tests, not established correctness)

- Author stub-a: 4 tasks; statuses {'graded': 4}.
  - A1: accepted 4, good delivered 2 of 4 (50%, 95% CI 15 to 85%), escapes 2 of 4 (50%, 95% CI 15 to 85%), bad among accepted 2 of 4 (50%, 95% CI 15 to 85%)
  - A2: accepted 1, good delivered 1 of 4 (25%, 95% CI 5 to 70%), escapes 0 of 4 (0%, 95% CI 0 to 49%), bad among accepted 0 of 1 (0%, 95% CI 0 to 79%)
  - A3: accepted 1, good delivered 1 of 4 (25%, 95% CI 5 to 70%), escapes 0 of 4 (0%, 95% CI 0 to 49%), bad among accepted 0 of 1 (0%, 95% CI 0 to 79%)
- Author stub-b: 4 tasks; statuses {'graded': 4}.
  - A1: accepted 4, good delivered 2 of 4 (50%, 95% CI 15 to 85%), escapes 2 of 4 (50%, 95% CI 15 to 85%), bad among accepted 2 of 4 (50%, 95% CI 15 to 85%)
  - A2: accepted 1, good delivered 1 of 4 (25%, 95% CI 5 to 70%), escapes 0 of 4 (0%, 95% CI 0 to 49%), bad among accepted 0 of 1 (0%, 95% CI 0 to 79%)
  - A3: accepted 1, good delivered 1 of 4 (25%, 95% CI 5 to 70%), escapes 0 of 4 (0%, 95% CI 0 to 49%), bad among accepted 0 of 1 (0%, 95% CI 0 to 79%)

A4 (human sign-off) is omitted from this run; it reports no human comparison and no human time saved.

## Substantiated discordant-rejection contrast

Not available (skipped). Without adjudication this report does not use the words "defects caught".

## Spend

Actual: $0 (existing subscriptions only, billing route verified in preflight). API-equivalent for disclosure only: not computed. Calls with unknown usage: 0.
