# ADR 0008: Cedar authorization that fails closed

- Status: Accepted; Gate R spike passed with conditions
- Date: 2026-10-22

## Decision
Cedar policies decide who may do what. Organization floors are forbid policies, which override any project permit.

## Conditions
Cedar skips a policy that errors during evaluation, so the kernel denies any request whose evaluation reports an error. Every floor change must pass analysis showing the policy cannot error and the new set permits nothing the old floors forbade. Qualification documents state that Cedar's proofs cover its formal model and its engine is checked against that model by randomized testing.

## Spike evidence
Cedar alone fails open: a forbid that errors at evaluation is skipped and the request allowed. On a 10,000-request random corpus, plain Cedar allowed 1,509 requests the fail-closed wrapper denied. Strict schema validation catches missing-attribute errors, and Cedar's symbolic analysis (cedar-policy-symcc 0.8.0 with the cvc5 1.3.1 solver) either proves a policy cannot error or returns a counterexample, including an overflow that validation missed. Cedar ignores `@id(...)` and numbers policies by position.

## Further conditions
1. The kernel re-keys every policy by its `@id`, so decisions and evidence name policies stably across edits and reorders.
2. Floor changes run strict validation and symbolic analysis in CI; a counterexample blocks the change.

## Evidence
`cedar-policy-core/src/authorizer.rs` documents the skip-on-error behavior.
