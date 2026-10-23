# Larger platform expansion specification

Status: roadmap contracts and investigation gates, not implemented modules. Parent PB-09. The external Control Rod Platform Plan referenced by repository documentation has not been supplied or found in the inspected branches; these boundaries derive from repository ADRs and observed code only.

## Current exceptions to reconcile

| Architecture family | Observed implementation | Required next decision/evidence |
|---|---|---|
| Owner-local identity/storage | Passkeys and PostgreSQL; versioned migrations and preparation writer floor now implemented | Owner pilot and deployment topology |
| Authorization/org floors | Cedar/RLS remain planned | Tenant/principal/resource model; approved effective floors; cross-tenant negative tests |
| Durable orchestration | Queue/lease/outbox transactions; DBOS remains planned | Versioned flow/retry/compensation contracts preserving existing semantics |
| Evidence custody | Canonical digests, immutable preparation records and PostgreSQL event chain | Signing/key custody, external immutable retention and independent witnessing |
| Model gateway/ACP | Native print-mode adapters (ADR 0020); no integrated gateway/ACP | Proved credential/tool/egress boundaries before new agent powers |
| Flows/typicals/domain SDK | ADR intent and domain pack examples | Versioned graph/interface/deadband contracts and qualified reference methods |
| Software/GitHub and channels | Workbench plus software/integration placeholders | Bounded grants, operator workflows and exact delivered artifacts |
| Distribution/offline | Owner-local start path; deployment placeholders | Upgrade/restore, target OS/topology and operator ownership |

## Bounded programs

1. **Identity, organization and authorization.** Specify tenant/principal/member roles, policy floors, resource ownership and lane constraints. The authorization input binds authenticated principal, tenant, action, resource, package/revision and effective policy digest. Cedar produces a decision with explainable refusal; PostgreSQL RLS independently refuses cross-tenant access. Negative tests cover every API/daemon/evidence/connector seam. Protected policies and tests require human authorization; an accepted ADR is not integration evidence.
2. **Durable orchestration.** Define FlowVersion and RunAssignment, retry/idempotency/timeout/compensation semantics and migration of queued/running/outbox state. DBOS or another engine never bypasses the kernel or manufactures human signatures. Pin flow versions in assignments and test crash/restart/replay at each external side effect before replacing existing transactions.
3. **Signed and witnessed evidence.** Define canonical evidence payloads, DSSE envelopes, issuer/key rotation/revocation and independent retention/witness roles. Preserve actual producer/selector/transformer/captor/presenter/verifier custody and coupling. A local hash chain is not an external witness. Prove replay, tampering, missing artifacts and key rollover against actual retained consumer artifacts.
4. **Runtime gateway and connectors.** Complete the confinement specification first. Define bounded grant/credential/data-lane interfaces for model transport, ACP and external connectors; pin adapters and normalize error/stop/replay behavior. GitHub/software integration can propose and verify changes but holds human merge/acceptance authority outside author agents. No broad inherited HOME credentials or hidden provider coupling.
5. **Versioned workflows and typicals.** Specify typed graph nodes/edges, package/interface revisions, dependency validation, approved deadbands and revalidation propagation. Input quantities/deadbands come from approved domain records/tools. Reject cycles, silent widening and stale consumers. Preserve existing signed 0.1 records through explicit companion/migration semantics.
6. **Distribution and channels.** Choose owner-local versus hosted/on-prem/offline scope before implementation. Define release manifests, signed updates, rollback/restore, platform support and operational owner. Desktop/mobile/voice/chat are clients of the same controlled API; they do not acquire extra decision rights. Verify exact packaged/deployed artifacts and disclosure boundaries before issue.

## Required gates and continuation rule

Recover/reconcile the full Platform Plan; name deployment/tenant targets, policy authorities, domain owners and actual service/data/tool inputs. Then write each program's field-level contracts, negative tests and dependency-ordered commits in a dedicated plan before coding it. Continue from the parent ledger and source pins, not from an assumption that any named ADR/library is already integrated. Do not expand the current owner-local pilot into a hosted regulated-engineering claim.
