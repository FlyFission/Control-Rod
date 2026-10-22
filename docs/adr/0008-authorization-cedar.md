# ADR 0008: Cedar authorization that fails closed

- Status: Accepted, pending Gate R test
- Date: 2026-10-22

## Decision
Cedar policies decide who may do what. Organization floors are forbid policies, which override any project permit.

## Conditions
Cedar skips a policy that errors during evaluation, so the kernel denies any request whose evaluation reports an error. Every floor change must pass analysis showing the policy cannot error and the new set permits nothing the old floors forbade. Qualification documents state that Cedar's proofs cover its formal model and its engine is checked against that model by randomized testing.

## Evidence
`cedar-policy-core/src/authorizer.rs` documents the skip-on-error behavior.
