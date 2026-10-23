# Control Rod platform buildout specification

Date: 2026-10-23. Status: execution specification for local unprotected work; protected implementation and release remain gated.

## Mission and evidence boundary

Control Rod should turn a rough request into a controlled package, a human-approved basis, reproducible execution, independent verification and a reviewable decision. Build this as usable vertical slices. Existing main contains the scaffold; the executable owner-local MVP lives in the reviewed PR stack. Neither an accepted ADR nor a green local test establishes a deployed platform.

Source pins, authority and risks are in `.nuclear/changes/platform-buildout/`. The existing [guided-preparation design](2026-10-22-guided-preparation-design.md) supplies GP-01 through GP-18 and the field-level contracts. This specification adds sequencing, baseline closure and the later program boundaries; it does not weaken that design. Its previous planning-only status is superseded for unprotected implementation by the user's explicit plan-and-execute instruction.

## Current product and gaps

The MVP has owner-local PostgreSQL, passkeys, captures, packages, author/pre-check runs, claim leases, completion outbox, event hashing, a React workbench, example-package packages and CAD generation. It does not yet implement preparation, tenant RLS, Cedar authorization, DBOS orchestration, independent witnessed/DSSE evidence, agentgateway, ACP adapters, a calculation SDK, versioned database migrations or a general workflow engine. Runner adapters live in the daemon; several top-level component directories are planning stubs. Runtime environment inheritance is not a sufficient confinement boundary.

The full Platform Plan referenced by docs is unavailable in the inspected repository. Its reconciliation is a named design input, not an excuse to claim unseen scope implemented.

## Required outcomes

| ID | Observable outcome | Acceptance gate |
|---|---|---|
| PB-01 | One pinned execution branch preserves existing source/planning work and states what is main versus proposed | Inventory and exact commit ancestry; no unauthorized merge |
| PB-02 | Control-plane JSON is validated before information is lost; daemon admits only complete generated wire contracts | Duplicate keys, trailing data, invalid numbers/unicode/depth, wrong/missing fields refused before effects |
| PB-03 | Human preparation is durable, resumable and explicit | GP-01..05,11,14,16,18; manual API/UI, immutable history, idempotency, CAS, release held |
| PB-04 | Prepared execution binds confirmed requirements, complete plan and current inputs | GP-06..10,12..13; signed confirmation/release and stale/race tests |
| PB-05 | Agent filesystem, secrets, network and data-lane powers are enforced | Negative tests prove isolation beyond prompts and CLI flags |
| PB-06 | Preparation agents propose changes without settling human requirements | Separate proposal records and lineage; stale/stopped/replayed outputs refused |
| PB-07 | A human can operate and recover a pilot | Bugfix and HVAC walkthroughs; missing engineering inputs hold; migration/restore/downgrade tests |
| PB-08 | Domain outputs are reproducible and traceable | Pinned verified tools/data; source digest/units; final PDF/CAD/report inspection |
| PB-09 | Larger platform modules implement reviewed ADR decisions with clear contracts | Separate bounded designs and evidence, no claims based solely on dependency names |

## Shared interfaces and invariants

TypeSpec is authoritative. Minor additive preparation contracts use feature version 0.1.0 and do not change historical signed WorkPackage bytes. Generated output must reproduce from source. Runner wire schemas must be generated from the same TypeSpec contract; internal daemon projections may remain lean only after full raw validation.

Raw JSON follows the canonical profile: unique object keys, valid UTF-8 and paired surrogates, safe integer tokens only (no fraction, exponent or negative zero), maximum container nesting 64, one top-level value. This is an administrative serialization restriction, not an engineering value.

Preparation uses one stable companion per package and immutable snapshots. The current head is an index, not editable history. Writes lock package before head, check package revision and strong ETag, then append snapshot and event atomically. Missing If-Match is 428; stale subject is 409. Enrollment requires an idempotency key and explicit human authorization; retry must not create a second companion. A previous enrolled package cannot silently fall back to legacy release or unenroll.

PreparationSnapshot, PackageContract, Requirement, Criterion, PreparationContext, OpenItem, Escalation, HumanResolution, TechnicalPlan, BasisRef and PreparationView follow the existing GP spec. Content edits preserve server IDs, actor/time and previous digest. Store content_digest and requirements_digest separately. Technical-only edits preserve requirements confirmation but invalidate pending release challenges. Criterion IDs, statements and requirement links belong to the requirements digest; criterion-to-check links belong to the full technical/release content digest. Stable requirement/criterion IDs cannot be reused after retirement.

Requirements confirmation is a distinct human passkey action. Release remains the existing decision authority; bind package revision, preparation revision/digest, requirements confirmation and ordered basis manifest. One valid release queues at most one author. Every claim, completion and acceptance rechecks current controlled basis. A checker receives controlled inputs and outputs, never private preparer or author transcripts. Structural criterion coverage never means executed verification passed.

## Rollout and authority

Start with explicit manual enrollment disabled by default. During Cut A, enrolled packages cannot release, irrespective of readiness. Cut B enables prepared release only after confirmation, manifest, stale-basis and result-admission checks pass. Automated preparation has a separate disabled flag and requires confinement evidence. Manual pilot need not wait for automated preparation.

AGENTS.md rule 2 requires a human signature for kernel decisions, policies, CI, red-team fixtures and major contract changes. Existing PR contributor DCO remains each contributor's responsibility. This execution specification authorizes no substitute certification. Main integration and public deployment are separate decisions after review.

## Later program boundaries

1. Domain depth: pinned tool discovery/download and atomic drawing publication; real county/substation/soil feed adapters with provenance and missing-input holds; report rendering and final artifact checks; calculation contract with units, source inputs and tool versions; PDF markup linked to controlled revisions.
2. Organization and authorization: identity/tenant model, Cedar decision boundary, lane-aware PostgreSQL RLS and negative cross-tenant tests. Decide local-only versus hosted topology before implementation.
3. Durable orchestration: versioned flow graphs, DBOS retry/idempotency/compensation boundaries, restart-safe executions and rollback. Preserve present claim/lease/outbox semantics in migration.
4. Evidence: DSSE signing, immutable artifact storage, independent witnessing and custody separation. A PostgreSQL hash chain alone is not an external trust anchor.
5. Runtime and integrations: gateway/ACP protocols only after confinement, software package/GitHub contracts, data connectors and secret custody. No broad credentials in agent HOME.
6. Distribution: deployment/offline upgrade and restore, desktop/mobile/channels after the owner-local pilot; each needs a defined consumer artifact and operational owner.

## Definition of done

For each slice: reviewed contracts, meaningful observed RED then GREEN, regenerated files reproducible, relevant suites green, immutable execution evidence, clean reviewable commit and honest limitations. For the program: all PB rows meet their gates, protected authorizations and DCO resolved, restore rehearsed, exact delivered artifact checked and release decision recorded. A completed local slice is not program completion.
