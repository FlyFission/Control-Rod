# Phase 1 review adjudication (tasks 1.1 to 1.3)

Independent review by Codex (codex-cli 0.166.0, read only) of the Phase 1 branch at tasks 1.1 to 1.3, 2026-10-30: [codex-round1.md](codex-round1.md). Fifteen findings, fourteen major and one minor. Verdict: not fit to merge as complete. Every finding is accepted and fixed; each fix has a test that fails without it.

| ID | Finding | Fix | Test |
|---|---|---|---|
| R1 | Contracts rejected revision 0, which intake creates | `package_revision` minimum 0 in every workbench type; fixtures use a released revision 0 | `workbench.test.ts` storage |
| R2 | References could cross organizations | Every reference carries `org_id`; legacy records are referenced through their ownership envelope with a constant kind column | `workbench.test.ts` R2 |
| R3 | A candidate could belong to another release | Candidate to attempt set key includes package, revision, release digest and organization; ordinal bounded by the set's size; singletons have ordinal 1 | R3 |
| R4 | A verification could borrow another member's qualification | Reference includes the qualification's member and organization | R4 |
| R5 | A versioned authority could change holder | Version trigger keeps organization, member and credential across versions; a credential record must name the passkey's own user; latest version is chosen before filtering | `tenancy.test.ts` R5 |
| R6 | Lifecycled rows allowed evidence rewrites | Shared `lifecycle_guard`: only status (along listed transitions) and per type mutable fields may change | `workbench.test.ts` classes, R6 |
| R7 | Tenancy lifecycles were only in a helper | The same guard on organizations, members, projects, repo bindings and machines | `tenancy.test.ts` R7 |
| R8 | Policy lookup could return an older version | One policy identity per organization; the policy in effect is its greatest version | `tenancy.test.ts` frozen versions |
| R9 | Runtime evidence need not support the artifact | Artifact versions may cite only passing probes of the same runtime and digest; pins reference artifact id, runtime and digest together | R9 |
| R10 | Several evidence links were unchecked strings | Promotion capture and manifest digest, controlled record clearance decision, deliverable revision package pair all constrained | storage, refusals |
| R11 | Tenancy indexed columns could disagree with bodies | All tenancy indexed columns generated from the body, as in the workbench tables | `tenancy.test.ts` frozen versions |
| R12 | Ownership conflicts were silently accepted | Legacy envelopes must name an existing record; a legacy insert whose identity was claimed by another organization refuses | `tenancy.test.ts` envelopes |
| R13 | Either or rules were not enforced | Database checks for workspace owner, promotion source, SCRAM scope and deliverable package pair; documented in the contract | R13 |
| R14 | Migration preservation was tested on empty history | `test/migration-preservation.ts` reverses and reapplies both migrations over the history built by the end to end app test (signed decisions, outputs, verifications), the preparation walkthrough and the grants test, requiring named tables to hold rows | `app.test.ts`, `preparation-walkthrough.test.ts`, `preparation-grants.test.ts` |
| R15 | Decision tests did not check what was signed | The contract gains an optional `challenge_nonce` and new decisions store it; the test proves each signature's challenge equals the hash of this decision's subject, kind, revision and nonce, and differs for any other. Decisions recorded before this change carry no nonce and stay verifiable only as signatures | `app.test.ts` decision kinds |

Also fixed while here: test Postgres ports are now chosen by the operating system with retry, which removes an intermittent suite startup failure seen twice.

## Required links

[Plan](../../../../../../docs/superpowers/plans/2026-10-29-workbench-buildout.md), [execution ledger](../../../../../../docs/superpowers/execution/2026-10-29-workbench-buildout.md), [verification](../../../verification.md).

## Exit criteria

Every finding has a fix and a test, and a second independent read confirms the fixes.

## Source-lineage note

Review output retained in `codex-round1.md` (absolute paths trimmed); dispositions written by the authoring session.
