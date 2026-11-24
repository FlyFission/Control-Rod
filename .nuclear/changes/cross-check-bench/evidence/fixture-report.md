# Cross-vendor checking benchmark: fixture, calibration

Designation: **calibration (never published as findings)**. Scored 2026-11-24T15:53:45Z. Study digest `24d5016bced1`, harness `ae2bfa83688b`, manifest `5c74ec9c9351`.

The benchmark calls the Claude Code and Codex CLIs directly, not through Control Rod's daemon.
"Rejection" means an explicit fail verdict, not a confirmed defect. Hidden tests measure whether
tests pass, not whether a maintainer would merge.

This run makes **no effectiveness claim**.

Pairs (task x author): 8; eligible: 8; failed A1: 0; ineligible by status: {}.

## Equal-author-weight contrast (cross-vendor minus same-model explicit rejection)

| Patches | Point | 95% CI (task bootstrap) | Inconclusive bounds | Complete-case | Fail-closed | Pooled (95% CI) |
|---|---|---|---|---|---|---|
| Hidden-test-failing | +0.0 pp | +0.0 pp to +0.0 pp | +0.0 pp to +0.0 pp | +0.0 pp | +0.0 pp | +0.0 pp (+0.0 pp to +0.0 pp) |
| Hidden-test-passing (false rejection) | +0.0 pp | +0.0 pp to +0.0 pp | +0.0 pp to +0.0 pp | +0.0 pp | +0.0 pp | +0.0 pp (+0.0 pp to +0.0 pp) |

Preregistered rule (bad-patch CI above 0 and good-patch CI below +5 pp): not met (shown only; it applies to a publication run).
"Not significant" is not equivalence.

## By author

### Author stub-a, bad patches (n = 2)

- Same-model rejected 2 of 2 (100%, 95% CI 34 to 100%); cross-vendor rejected 2 of 2 (100%, 95% CI 34 to 100%).
- Blocked (fail or inconclusive): same 2 of 2 (100%, 95% CI 34 to 100%); cross 2 of 2 (100%, 95% CI 34 to 100%).
- Difference +0.0 pp (95% CI +0.0 pp to +0.0 pp), bounds +0.0 pp to +0.0 pp; complete-case +0.0 pp (n = 2); fail-closed +0.0 pp.
- Discordant: cross only 0, same only 0; exact McNemar p = not estimable.

| same \ cross | pass | fail | inconclusive |
|---|---|---|---|
| pass | 0 | 0 | 0 |
| fail | 0 | 2 | 0 |
| inconclusive | 0 | 0 | 0 |

### Author stub-a, good patches (n = 2)

- Same-model rejected 1 of 2 (50%, 95% CI 9 to 91%); cross-vendor rejected 1 of 2 (50%, 95% CI 9 to 91%).
- Blocked (fail or inconclusive): same 1 of 2 (50%, 95% CI 9 to 91%); cross 1 of 2 (50%, 95% CI 9 to 91%).
- Difference +0.0 pp (95% CI +0.0 pp to +0.0 pp), bounds +0.0 pp to +0.0 pp; complete-case +0.0 pp (n = 2); fail-closed +0.0 pp.
- Discordant: cross only 0, same only 0; exact McNemar p = not estimable.

| same \ cross | pass | fail | inconclusive |
|---|---|---|---|
| pass | 1 | 0 | 0 |
| fail | 0 | 1 | 0 |
| inconclusive | 0 | 0 | 0 |

### Author stub-b, bad patches (n = 2)

- Same-model rejected 2 of 2 (100%, 95% CI 34 to 100%); cross-vendor rejected 2 of 2 (100%, 95% CI 34 to 100%).
- Blocked (fail or inconclusive): same 2 of 2 (100%, 95% CI 34 to 100%); cross 2 of 2 (100%, 95% CI 34 to 100%).
- Difference +0.0 pp (95% CI +0.0 pp to +0.0 pp), bounds +0.0 pp to +0.0 pp; complete-case +0.0 pp (n = 2); fail-closed +0.0 pp.
- Discordant: cross only 0, same only 0; exact McNemar p = not estimable.

| same \ cross | pass | fail | inconclusive |
|---|---|---|---|
| pass | 0 | 0 | 0 |
| fail | 0 | 2 | 0 |
| inconclusive | 0 | 0 | 0 |

### Author stub-b, good patches (n = 2)

- Same-model rejected 1 of 2 (50%, 95% CI 9 to 91%); cross-vendor rejected 1 of 2 (50%, 95% CI 9 to 91%).
- Blocked (fail or inconclusive): same 1 of 2 (50%, 95% CI 9 to 91%); cross 1 of 2 (50%, 95% CI 9 to 91%).
- Difference +0.0 pp (95% CI +0.0 pp to +0.0 pp), bounds +0.0 pp to +0.0 pp; complete-case +0.0 pp (n = 2); fail-closed +0.0 pp.
- Discordant: cross only 0, same only 0; exact McNemar p = not estimable.

| same \ cross | pass | fail | inconclusive |
|---|---|---|---|
| pass | 1 | 0 | 0 |
| fail | 0 | 1 | 0 |
| inconclusive | 0 | 0 | 0 |

## Checker rates (Youden's J = TPR - FPR)

| Author / checker | TPR (bad rejected) | FPR (good rejected) | J |
|---|---|---|---|
| stub-a/same | 2 of 2 (100%, 95% CI 34 to 100%) | 1 of 2 (50%, 95% CI 9 to 91%) | 0.500 |
| stub-a/cross | 2 of 2 (100%, 95% CI 34 to 100%) | 1 of 2 (50%, 95% CI 9 to 91%) | 0.500 |
| stub-b/same | 2 of 2 (100%, 95% CI 34 to 100%) | 1 of 2 (50%, 95% CI 9 to 91%) | 0.500 |
| stub-b/cross | 2 of 2 (100%, 95% CI 34 to 100%) | 1 of 2 (50%, 95% CI 9 to 91%) | 0.500 |

## Inconclusive verdicts

- stub-a/same: 0 of 4
- stub-b/cross: 0 of 4
- stub-b/same: 0 of 4
- stub-a/cross: 0 of 4

## Verdict stability (first check against a repeat)

- stub-a: flips 0 of 8 (0%, 95% CI 0 to 32%); Cohen's kappa 1.000
- stub-b: flips 0 of 8 (0%, 95% CI 0 to 32%); Cohen's kappa 1.000

## Workflow outcomes (reference tests, not established correctness)

- Author stub-a: 4 tasks; statuses {'graded': 4}.
  - A1, hidden tests only (PASS_TO_PASS): accepted 4, blocked 0 of 4 (0%, 95% CI 0 to 49%), good delivered 2 of 4 (50%, 95% CI 15 to 85%), escapes 2 of 4 (50%, 95% CI 15 to 85%), bad among accepted 2 of 4 (50%, 95% CI 15 to 85%)
  - A2, A1 plus same-model checker: accepted 1, blocked 3 of 4 (75%, 95% CI 30 to 95%), good delivered 1 of 4 (25%, 95% CI 5 to 70%), escapes 0 of 4 (0%, 95% CI 0 to 49%), bad among accepted 0 of 1 (0%, 95% CI 0 to 79%)
  - A3, A1 plus cross-vendor checker: accepted 1, blocked 3 of 4 (75%, 95% CI 30 to 95%), good delivered 1 of 4 (25%, 95% CI 5 to 70%), escapes 0 of 4 (0%, 95% CI 0 to 49%), bad among accepted 0 of 1 (0%, 95% CI 0 to 79%)
  - same-checker tokens: 960 known over 8 checks
  - cross-checker tokens: 960 known over 8 checks
- Author stub-b: 4 tasks; statuses {'graded': 4}.
  - A1, hidden tests only (PASS_TO_PASS): accepted 4, blocked 0 of 4 (0%, 95% CI 0 to 49%), good delivered 2 of 4 (50%, 95% CI 15 to 85%), escapes 2 of 4 (50%, 95% CI 15 to 85%), bad among accepted 2 of 4 (50%, 95% CI 15 to 85%)
  - A2, A1 plus same-model checker: accepted 1, blocked 3 of 4 (75%, 95% CI 30 to 95%), good delivered 1 of 4 (25%, 95% CI 5 to 70%), escapes 0 of 4 (0%, 95% CI 0 to 49%), bad among accepted 0 of 1 (0%, 95% CI 0 to 79%)
  - A3, A1 plus cross-vendor checker: accepted 1, blocked 3 of 4 (75%, 95% CI 30 to 95%), good delivered 1 of 4 (25%, 95% CI 5 to 70%), escapes 0 of 4 (0%, 95% CI 0 to 49%), bad among accepted 0 of 1 (0%, 95% CI 0 to 79%)
  - same-checker tokens: 960 known over 8 checks
  - cross-checker tokens: 960 known over 8 checks

A4 (human sign-off) is omitted from this run; it reports no human comparison and no human time saved.

## Substantiated discordant-rejection contrast

Not available (skipped: fixture-dry-run). Without adjudication this report does not use the words "defects caught".

## Spend

Actual: $0 (existing subscriptions only, billing route verified in preflight). Every launch counts, including retries, probes and repeats.

| Vendor | Calls | Unknown usage | Input | Cached input | Output |
|---|---|---|---|---|---|
| stub-a | 22 | 0 | 2200 | 0 | 440 |
| stub-b | 22 | 0 | 2200 | 0 | 440 |

API-equivalent for disclosure only: not computed.

## Environment

- stub-a: requested stub-a, resolved stub-a
- stub-b: requested stub-b, resolved stub-b
- stub-a CLI: stub (`stub`)
- stub-b CLI: stub (`stub`)
- Host: Linux x86_64, Python 3.13.18, confinement bwrap
