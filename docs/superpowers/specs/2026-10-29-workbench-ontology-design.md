# Control Rod workbench and ontology specification

Date: 2026-10-30. Revision 2. Status: design specification for owner review. Nothing here is implemented by this document.

Governing document: the **Control Rod Platform Plan** (Claude Docs, owner artifact "Control Rod Build Plan", tabs Overview, Build or borrow, Architecture, Security and compliance, Domain model, Flows, Typicals, Large-project typicals, Experience, Business). `AGENTS.md` names it as "the plan and architecture"; earlier specifications recorded it as not found. Where this specification and the Platform Plan disagree, the Platform Plan governs unless an accepted ADR amends it. Section 2 maps every part of this specification to the plan.

Parent: [platform buildout](2026-10-23-platform-buildout-design.md) (PB-01 to PB-09). Siblings it must stay consistent with: [runtime confinement](2026-10-23-runtime-confinement-design.md), [platform expansion](2026-10-23-platform-expansion-design.md), [guided preparation](2026-10-22-guided-preparation-design.md). Change record: `.nuclear/changes/workbench-ontology/`. Plan: [workbench buildout plan](../plans/2026-10-29-workbench-buildout.md). Review adjudication: `.nuclear/changes/workbench-ontology/evidence/reviews/adjudication.md`.

## Revision 1 summary

Revision 0 was reviewed by Codex, OpenCode and Antigravity (Grok could not run) and reconciled against the Platform Plan, which had not been located when Revision 0 was written. Principal changes:

- The office view is restored as a primary place, built to the plan's OV backlog, and gains a themes subsystem (section 18).
- People, signing authority, grade, organizations and projects enter the ontology (section 5.1).
- Decision kinds follow the plan: release, methodology, verdict, clearance (section 5.5).
- One vocabulary: every state set maps onto the plan's rung ladder, work steps, five agent states, readiness answers and input quality values (section 8).
- Compare gains a candidate identity carried through runs, results and the signed subject (sections 5.10, 16).
- A disclosure gate: no capture, attachment or exploration content leaves the machine before a lane is classified (section 11.3).
- Sandboxing follows ADR 0010 (sandbox-runtime driver) and the runtime confinement spec's separation of model transport from tool execution (section 23).
- The signature model distinguishes directly signed acts from choices absorbed into a later signed subject (section 10.3).
- The rigor table keeps the kernel's pre-check floor in every tier; mandatory checks stay non-waivable (sections 11.4, 14).
- Interim mechanisms are labelled interim with their return paths: print mode to ACP (ADR 0020), Postgres chain and seals to DSSE and Tessera (ADR 0009).
- False claims about existing code are corrected (draft edits have no compare-and-swap today; the kernel's Claim actor is Agent).
- The palette proposal is withdrawn; the plan's design language stands (section 17).

## Revision 2 summary

Round 2 reviews of Revision 1 (Codex, OpenCode, Antigravity) agreed the direction holds and asked for precision. Revision 2:

- Defines administrative, lane and policy authorities as qualifications and adds commands for every new controlled object (5.1, 10.2).
- Gives every release a candidate identity, and specifies the attempt set lifecycle (5.10, 16).
- Adds a qualified person verification command for Safety and Material work (10.2, 11.5).
- Requires attested authenticators for the hardware key floor; existing passkeys do not qualify (11.1).
- Defines the clearance subject and its freshness check; a Software ControlledRecord exists only after observed merge (10.3, 24).
- Makes runtime pin changes directly signed and versioned (5.10, 21).
- Supplies the evidence mappings and aggregate rules; mandatory inconclusive checks stay blocking (8, 11.4).
- Keeps ownership and marking metadata outside signed bodies (5, 11.3) and defines declassification arithmetic.
- Specifies SCRAM as a persistent organization or project state that disconnected daemons and explorations obey (22a).
- Hardens the theme contract: themes are inert scene data under an application owned semantic layer; the engine and harness precede the renderer; the catalogue runs as a parallel stream from Phase 0 (18).
- Separates Phase 0 and spike authorization from the full plan; protected edits need a signature before the edit (plan).

---

# Part I. Problem, thesis, principles

## 1. Problem

Control Rod's core is real and unusual: a Rust kernel that refuses illegal transitions (`kernel/src/transition.rs`), passkey signatures over server computed digests, a PostgreSQL hash chained event log, an independent pre-check on a different runtime that never sees the author's transcript, frozen work package revisions, immutable preparation snapshots, run leases, stop and a lost run sweep. Its experience is thin: about 3,500 lines of page and component TSX over seven pages and six routes; a package page of eleven panels with no order of work; run logs as raw stream JSON; a decision bar that disappears without saying why; many controlled records with no screen (execution traces, custody and coupling, agent baselines, kernel reason codes, cross package dependencies, preparation grants); and an office floor that does not yet meet the plan's OV backlog.

A source level review of eighteen permissively licensed agent workbenches (`docs/patterns/workbench-donors.md`) and a clean room reading of Kandev's public documentation under ADR 0019 found the inverse profile: excellent plumbing and polish, weak trust. Every one lets authority outrun evidence somewhere: approvals that are status flips on payloads that can change; a local process that can act as the owner; status guessed from terminal screens; worktrees presented as isolation; sandboxes that downgrade silently; audit off by default or keyed with a secret the agent can read. None signs a human decision with the human's own key over the content shown; none compares parallel candidates with independent checks; none reviews non code deliverables.

## 2. Platform Plan alignment

| This specification | Platform Plan source | Relationship |
|---|---|---|
| Thesis, principles | Overview: core loop, "the agents never hold the gate", ten principles | Implements |
| Ontology (Part II) | Domain model: 25 spine entities, Capital Projects records, signer qualification | Implements the subset needed by the workbench; declares the rest as typed hooks |
| Decision kinds | Domain model, Security: release, methodology, verdict, clearance | Adopts |
| Vocabularies | Domain model, Typicals: rung ladder, work steps, input quality, readiness answers | Adopts; maps workbench states onto them |
| Floors, lanes, SCRAM, autonomy | Security and compliance | Adopts; states current kernel coverage and gaps |
| Surfaces and places | Experience: five surfaces, workspaces by mode | Sequences: this program builds Web plus the phone layout for needs me and SCRAM; Mobile, Desktop, CLI and connectors follow the plan's gates |
| Office view | Experience: office view, scenario review, OV P1 backlog | Implements OV P1 and adds themes |
| Design language | Experience: Ascertain's dark look, Cherenkov blue, state colours | Adopts; tokens pulled from ascertain.it is the plan's open item |
| Sandboxing | Architecture enforcement point 1; Build or borrow: sandbox-runtime; ADR 0010 | Adopts; adds attestation |
| Agent sessions | Architecture: ACP; ADR 0011, amended by ADR 0020 | Print mode interim; ACP is the target for controlled runs and Explore |
| Evidence and witnessing | Architecture: in-toto, DSSE, Tessera; ADR 0009 | Postgres chain and seals are interim |
| Merge gate | Architecture enforcement point 4; Overview first milestone | Adopts for Software mode |
| Budgets and usage | Domain model: Budget, Usage record; Experience: usage and context | Adopts |
| Flows and typicals | Flows, Typicals, ADR 0016 | Declares hooks; built by platform expansion program 5 |
| Additions not in the plan | Exploration and promotion, Compare, attestation, run safety, teaching refusals, themes catalogue | Proposed here; each states its fit with the plan's intent |

## 3. Thesis

> **Control Rod is the workbench where agent work becomes a promise.** Explore at full speed with any agent. When the work matters, promote it, let independent evidence gather around it, and sign exactly what you saw. Every status on screen resolves to the event that proves it.

Three commitments, from the owner's nuclear-grade practice and the Platform Plan:

1. **Two speeds you can see.** "Go fast while exploring; slow down when the work becomes a promise." Exploration is live, conversational and disposable. A promise is frozen, evidenced and signed. Crossing from one to the other (**promotion**) is the product's signature interaction.
2. **Ceremony scales with rigor and grade on one spine.** The same objects, actions and case view serve an administrative note and a Safety grade, high consequence calculation. Floors never relax; presentation does.
3. **Show what actually happened, never what an agent says happened.** Traces, digests, the sandbox that really held, independence and honest gaps are the interface.

## 4. Design principles

- **P1. One ontology, many views.** Every screen is a projection of the same objects, links and events. Adding a view never adds a write path.
- **P2. The only write is a governed command.** Controlled state changes only through the shared command layer (section 10), whether the caller is a route, a timer, a completion handler, a coordinator or a migration.
- **P3. Identity, version and observation are separate.** Stable identities; immutable versions addressed by digest; lifecycle and observations as append only events.
- **P4. Humans sign digests the screen displayed.** What a person sees is what the server computed is what the passkey signs.
- **P5. Markings and trust propagate by rule**, recorded with provenance, never by hand.
- **P6. Status is derived, never dragged.**
- **P7. Refusals teach**: the floor, the reason in words, and the one fact that would change it, including authority (discipline, grade, license).
- **P8. Honest non claims are data**, including which mechanisms are interim.
- **P9. Runtime neutral.** A new CLI is an adapter, a probe and a qualified artifact, never a redesign.
- **P10. Borrow plumbing, never product shape.**
- **P11. The Platform Plan governs.** New concepts state their plan source or their proposed amendment.
- **P12. One vocabulary.** No new state set without a mapping onto the plan's sets (section 8).

---

# Part II. The ontology

## 5. Object types

Mutability classes: **F** frozen version (immutable, digest addressed), **A** append only observation or event, **L** lifecycled identity (state changes only by commands; each change is an event), **D** derived projection (never stored as truth; caches carry input digests). Every stored object is owned by an organization and, where scoped, a project, so multi organization work (plan Phase 6) is additive. Ownership and marking metadata live in separately versioned storage envelopes or indexed relations beside each record, never inside signed bodies or chained event payloads; backfill never rewrites a signed body, an event or its digest.

### 5.1 Tenancy, people and authority (plan Domain model; additive types)

| Object | Class | Purpose |
|---|---|---|
| Organization | L | Tenant boundary; floors and budgets attach here |
| Member | L | A person in an organization; passkeys bind here |
| SignerQualification | F per version | Licenses (jurisdiction, expiry), disciplines, grades (Safety, Material, General service), roles (originator, checker, approver, discipline lead, engineer in responsible charge), and the authorities this specification needs: **administrator** (members, runtimes, sandbox policy), **lane authority** (classify and raise lanes; lowering still needs a change request), **policy authority** (policy sets, budgets, autonomy level). Issued and revoked only by commands (10.2) |
| AuthenticatorCredential | F per version | A Member's passkey with its registration evidence: attestation statement and format, authenticator model identifier where attested, user verification, backup eligibility; an eligibility verdict for the hardware key floor (11.1) |
| Delegation | F | Dated, scoped transfer of a role; "nothing is approved on a timeout" |
| Project | L | Mode (General, Software, Capital Projects), default rigor, lanes, QA overlays, autonomy level |
| RepoBinding | L | A repository bound to a project (Software mode merge gate) |
| PolicySet | F per version | Floors and settings in effect; digest referenced by decisions |
| Machine | L | An enrolled daemon host |

The single owner of today's local build is a Member with every qualification the owner records for themselves. No code path treats "the owner" as a special principal outside this model.

### 5.2 Work and preparation (existing)

Capture, WorkPackage (frozen per revision; status by kernel), PreparationSnapshot and its Requirement, Criterion, OpenItem, Escalation, HumanResolution, TechnicalPlan, DesignElement, PreparationTask, PreparationCheck, BasisRef, DesignInput, CodeOrStandard, Methodology, ToolRef, Interfaces and Quantity, as defined in `spec/work.tsp`, `spec/records.tsp`, `spec/preparation.tsp`. Additions: Capture gains a **lane classification** (section 11.3) and, later, a **voice evidence record** (raw transcript, digest, model, cleanup diff, flagged numbers and units; plan Experience). WorkPackage gains **grade**.

### 5.3 Execution

| Object | Source | Class | Notes |
|---|---|---|---|
| Run | `work.tsp` `Run`, `RunRole`, `RunStatus` | L | Gains `candidate_id` (5.10) |
| Claim | plan Domain model; kernel `arbitrate_claim` target | A | Arbiter result and reason code for each claim attempt |
| ExecutionTrace | `records.tsp` | A | Gains canonical digest, sandbox policy digest, attestation reference, runtime artifact digest |
| AgentRole, AgentBaseline, AgentAssignment, SkillRef | `records.tsp`; plan Architecture | F | A role is a template; hiring creates a baseline |
| Runtime | plan Domain model; today `RuntimeRef` | L | Subscription, account or local model runtime with a qualified artifact (5.10 RuntimePin) |
| PreparationGrant, permits, receipts | `preparation-grants.tsp` | L / A | Existing |

### 5.4 Evidence and judgement

Artifact, Deliverable, EvidenceItem, Custody, Coupling, CouplingProfile, RequiredCustody, Finding, VerificationPlan, VerificationRecord, PreCheckIndependence, CheckResult, CriterionResult, CriterionResultSet (existing). **Comment and Resolution** (plan Domain model) replaces Revision 0's ReviewNote: a Comment is anchored to a subject digest and a locator (section 25); its states (open, resolved, withdrawn) are events, not mutations; a Resolution cites the revision or reply that resolved it.

### 5.5 Decisions

The plan's decision kinds replace today's single enum over time:

| Plan kind | Meaning | Today's `DecisionKind` mapping |
|---|---|---|
| release | Owner releases a frozen revision to work | release |
| methodology | Approval of the method before execution where floors require it | none today (new) |
| verdict | The judgement on the evidence: accept, accept with findings, return, reject | accept, accept-with-findings, return, reject become verdict outcomes |
| clearance | Authorization to apply the verdict (merge, issue, promote), possibly by a different qualified person | implicit today in accept (new) |

Historical signed decisions keep their bytes and are read through the mapping; the contract change is a minor additive version with explicit companion semantics. Splitting verdict and clearance changes kernel decision functions and is protected (section 31, D-4). RequirementsConfirmation, OwnerOverride and PasskeyAssertion remain.

### 5.6 Ledger

Event (hash chained, existing). **ChainSeal** (interim; 11.6). Later: in-toto attestations in DSSE envelopes, a Tessera log with outside witnesses, RFC 3161 timestamps, keys in KMS or HSM (plan Architecture, ADR 0009).

### 5.7 Change control (plan Domain model; additive)

ChangeRequest (including lane lowering and policy changes; signed by an authorized person), Deficiency, LessonRecord.

### 5.8 Budgets and usage (plan Domain model; additive)

Budget (scope organization, project or agent; mode track, alert or hard cap), UsageRecord (tokens in and out, cache hits, context pack size against budget, wall time, cost or subscription limit used, first pass acceptance), BudgetReservation (section 26).

### 5.9 Capital Projects and flows (declared hooks; built by platform expansion program 5)

Deliverable, DeliverableRevision (status = its rung), Register, DesignBasisItem, AssumptionRegister, Transmittal, PhaseGate with criteria and readiness answers, InterfaceRecord (maturity identified through accepted), Flow, NodeTemplate, EdgeTemplate, FlowInstance, LoopGroup, Definition Debt, Evidence Pack, Margin Ledger. This specification types their identities and the links the workbench needs so Capital Projects screens are additive; it does not specify their behaviour. Minimum typed hooks (identity, owner, links only): Deliverable (id, project, discipline, grade), DeliverableRevision (id, deliverable, rung, package revision link), InterfaceRecord (id, provider package, receiver packages, maturity), FlowEdge reference (id, flow, typed deadband), PhaseGate (id, project, criteria ids).

### 5.10 Workbench additions

| Object | Class | Purpose and key properties |
|---|---|---|
| **Exploration** | L | A live session in a project (or a personal General space) at the administrative tier, with a declared lane and sandbox policy. Never on the accept path. States: active, paused, ended (events). Honest flags: `interactive`, `unattested` |
| **Workspace** | L | A materialized working directory: kind (exploration worktree, run workspace), owning exploration or run, path, lock holder, state (provisioning, ready, torn down). Identity is not its path |
| **Checkpoint** | A | One capture of an exploration's working tree. Identity: occurrence id. Properties: exploration id, workspace id, git tree id, content digest, parent checkpoint occurrence, actor, time |
| **SourceManifest** | F | The exact retained input bytes for a promoted revision: files with digests, symlink policy, submodule and LFS resolution, excluded paths with reasons, ignored inputs explicitly listed or excluded. Retained immutably; materialized read only for runs |
| **Promotion** | A | The plan's promotion step: checkpoint (or capture) becomes a Draft package revision bound to a SourceManifest, with mode, rigor, grade and lane chosen |
| **AttemptSet** | L | N candidates against one released revision digest. States: running, ready to compare, selected, abandoned (events) |
| **CandidateAssignment** | F | Identity of one candidate: release, optional attempt set, ordinal, author assignment. **Every release creates at least one**: an ordinary release has a singleton candidate (ordinal 1, no attempt set), so the verdict subject is defined the same way with or without Compare. Carried by its author run, checker runs, outputs, criterion results and the verdict subject |
| **Selection** | A | Choice of one candidate; a proposal absorbed into the verdict subject (10.3) |
| **RuntimeProbe** | A | Observation of a runtime: artifact digest, version, auth state, outcome |
| **RuntimePin** | L | Which RuntimeArtifactVersion a role launches; update and rollback are directly signed commands; a change requalifies affected agent baselines |
| **RuntimeArtifactVersion** | F | Immutable record of one qualified executable: digest, version string, install path, probe evidence; traces reference this, not the mutable pin |
| **SandboxPolicy** | F | Driver, tier, readable and writable roots, model broker endpoint, tool broker grants, egress allowlist, mandatory claims |
| **IsolationAttestation** | A | Post launch evidence for each mandatory claim: observed, refuted or unverifiable, bound to run, generation, policy digest, runtime artifact digest |
| **ControlledRecord** | F | Revision 0's "Baseline", renamed to avoid collision with agent baseline: an accepted and applied revision with its input digests. In Capital Projects it is a deliverable revision at a rung, created when issuance is recorded; in Software mode a merged change, created **only after verified merge evidence** names the resulting commit (clearance alone is authorization, not completion) |
| **PersonVerification** | A | A qualified person's verification of a candidate's evidence for Safety or Material grade work: verifier Member, qualification version, candidate, criteria covered, outcome, signature. Distinct from the agent pre-check |
| **ScramEvent** | A | Who pulled SCRAM, scope, reason, signature, stop latency, quarantine list; staged restarts reference it |
| **OfficeTheme** | F per version | A visual theme for the office view (section 18). Authoritative home: a digest pinned manifest bundled in the repository under `apps/web/src/office/themes/<id>/`; the database stores only the Member's selection and the installed theme digests. User supplied themes are out of scope |

### 5.11 Projections

| Projection | Purpose |
|---|---|
| ActionDescriptor | For an object and the viewing Member: each command, allowed or refused, floor, reason in words, the one fact that would change it, signature mode, authority needed |
| AttentionItem | The "needs me" queue, ordered by gate risk then age (plan); each item states what a signature would bind |
| AgentFigure | Per agent: one of the five states, cause label, gate flag, changed input flag, loop count, Safety ring, discipline tint or lens tint |
| LensView | Status, Gate, Change, Spend recolourings of the floor; presenting mode suppressions |

## 6. Shared interfaces

| Interface | Contract | Implemented by |
|---|---|---|
| Owned | `org_id`, optional `project_id`; row level isolation later (RLS) | Every stored object |
| Digested | Canonical digest recomputable from stored bytes | Every class F type: WorkPackage revision, PreparationSnapshot, Artifact, Deliverable, SourceManifest, SandboxPolicy, PolicySet, SignerQualification, AuthenticatorCredential, Delegation, CandidateAssignment, RuntimeArtifactVersion, ControlledRecord, OfficeTheme; and ExecutionTrace |
| Marked | Versioned marking metadata (11.3) | Every stored object |
| Commentable | Accepts Comments anchored to its digest and a declared locator scheme | Deliverable, Artifact, Checkpoint diff, PreparationSnapshot, ExecutionTrace |
| Evidenced | Exposes evidence dimensions (11.4) | Criterion, Deliverable, WorkPackage revision, ControlledRecord |
| Graded | Carries grade; floors read it | WorkPackage, Deliverable |
| Lifecycled | State machine whose transitions are commands recorded as events | WorkPackage, Run, Exploration, AttemptSet, RuntimePin, Comment |
| Attested | Links to observations confirming or refuting its claims | Run, Runtime |

## 7. Link types

| Link | From, to | Notes |
|---|---|---|
| spawns | Capture to WorkPackage | Order kept for multi package captures |
| supersedes | revision to prior revision | Never rewritten |
| references | WorkPackage to document (BasisRef, CodeOrStandard) | A citation, not a dependency |
| depends on | WorkPackage to WorkPackage | An explicit `depends_on` list, distinct from `design_inputs[].doc`, which today holds both package ids and ordinary document citations (`work.ts` `dependenciesReady`). A migration classifies existing entries; an unknown package target in `depends_on` is a refusal, while citations never gate readiness |
| consumes interface | WorkPackage to Flow edge | Per ADR 0016 edges live only in the Flow record; packages reference them; deadbands typed and evaluated against the consumer's recorded consumed value |
| promoted into | Checkpoint to WorkPackage revision (via Promotion and SourceManifest) | The only bridge from exploration |
| requires, verifies; planned by | Requirement to Criterion; Criterion to PreparationCheck | Existing digest rules |
| executes | Run to WorkPackage revision | Binds the frozen digest at claim |
| candidate of | CandidateAssignment to AttemptSet; Run, output, result to CandidateAssignment | Every candidate artifact is keyed by candidate |
| observed by | Run to ExecutionTrace, IsolationAttestation, Claim | Append only |
| ran under | ExecutionTrace to SandboxPolicy, RuntimeArtifactVersion | By digest |
| supports, refutes | EvidenceItem to Criterion | With custody |
| concerns | Finding or Comment to subject digest and locator | Anchors valid for that digest only |
| decides | Decision to subject digest | The signed binding |
| clears | clearance Decision to verdict Decision | May require a different qualified person |
| records | application evidence (observed merge or issuance) to ControlledRecord; ControlledRecord cites its clearance | Clearance authorizes; only observed application creates the record |
| reopens | consumed interface change past deadband to ControlledRecord | Plan forward propagation; produces revalidation work, never silent edits |
| scoped by | ScramEvent to Organization or Project | |
| held by | Member to SignerQualification version | Authority checks read this |

## 8. One vocabulary

| Concern | Governing set (plan) | Workbench use |
|---|---|---|
| Deliverable status | The rung: Preliminary, IFE, IFB, IFD, Ready for IFC (IFC is never Control Rod) | Shown everywhere a deliverable appears; never a separate status |
| Board columns | Work steps toward the next rung: Ready, Drafting, Agent check, Person verifies, Needs signature, Reached next rung | Office board and Work list layout; derived, never dragged |
| Agent state | Working, needs you, waiting on someone (names who), stuck (says why and how long), input changed; idle hollow | AgentFigure; attention lanes are filters over these |
| Input quality | Missing, preliminary, approved for design, certified | Inputs and stale inputs on cards |
| Readiness and criterion answers | YES, YES BY APPROVED DISPOSITION, N/A WITH APPROVED BASIS, NO | The displayed answer per criterion and gate; derived from evidence dimensions (11.4) |
| Run status | queued, running, succeeded, failed, stopped, lost (existing) plus derived condition outcome unknown | Shown on runs; maps to agent state stuck with cause |
| Evidence dimensions | completeness, outcome, disposition, freshness, independence (11.4) | Internal; summarized as a readiness answer |
| Workbench lifecycles | Exploration, AttemptSet, Comment, RuntimePin | Each maps to agent states or readiness answers where shown on the floor or a card |

Existing contract enums are preserved byte for byte in historical records and read through these versioned mappings (mapping version 1) into the dimensions of 11.4:

| Contract value | Completeness | Outcome | Disposition |
|---|---|---|---|
| EvidenceItem `pass` | executed | pass | none |
| EvidenceItem `open` | missing | none | none |
| EvidenceItem `deferred` | missing | none | deferred (reason required) |
| VerificationRecord `pass` / `fail` / `inconclusive` | executed | pass / fail / inconclusive | none |
| CheckResult or CriterionResult `pass` / `fail` / `inconclusive` | executed | pass / fail / inconclusive | none |
| CheckResult or CriterionResult `open` | missing | none | none |
| CheckResult or CriterionResult `deferred` | missing | none | deferred (reason required) |

A future mapping version is a new row set with its own version number; readers record which version they used.

## 9. Lifecycles

- **WorkPackage**: Draft, Released, InWork, InVerification, Accepted, Closed (kernel). Unchanged by this specification except protected changes listed in section 31.
- **Run**: as today; **outcome unknown** is a persisted reconciliation hold (section 22) over a dispatched run whose exit or completion was not observed. It blocks redispatch for that revision, role and candidate until a Reconcile command records disposition evidence.
- **Exploration**: active, paused, ended. **AttemptSet**: running, ready to compare, selected, abandoned. **Comment**: open, resolved, withdrawn. **RuntimePin**: pinned, updating, rolled back. Each transition is a command and an event.
- **ControlledRecord**: current, or reopened with cause (derived from interface changes past deadband and basis changes; never hand set).

## 10. The kinetic layer: governed commands

### 10.1 The command boundary

Every controlled write goes through one command layer in `services/api` with, for each command: authorization rule (principal kind, Member qualification, floors), subject, preconditions, the kernel or service function that decides, transaction boundary, idempotency and replay semantics, the event written, and refusal cases. Routes, timers (lease sweep), completion handlers, coordinators and migrations all call commands; none writes controlled tables directly.

Mechanism: the API holds two database connections. Queries use a reader role with no write grants on controlled tables. Only the command executor module obtains the writer role's connection, and a build check forbids any other module from importing that executor. Migrations run under a separate migrator role and call command functions for data changes. A test asserts the reader role's write attempts fail (WB-02).

### 10.2 Command catalog

Signature column: **Direct** (passkey over the command's own subject), **Absorbed** (a proposal bound into a named later signed subject), **None**.

| Command | Principal | Decided by | Signature | Notes |
|---|---|---|---|---|
| Capture | Member | API | None | Creates a capture in **unclassified** lane state; no intake until classified |
| Classify lane | Member with lane authority | API | None for raising; lowering is a ChangeRequest | Gate for any egress (11.3) |
| Run intake | System on classification | API, kernel | None | Only after classification; lane admits the runtime |
| Draft intake output, answer capture | Agent via daemon | API | None | Existing (`package.drafted`, `capture.answered`) |
| Edit draft | Member | API | None | **Today: no compare-and-swap** on `PUT /packages/:id`; plan task adds If-Match and revision CAS |
| Enroll, edit, resolve preparation | Member | API with CAS | None | Existing |
| Confirm requirements | Qualified Member | `decide_preparation` | Direct | Existing |
| Approve methodology | Qualified Member | kernel (new) | Direct | Where floors require; protected |
| Release | Qualified Member | kernel Release | Direct | Existing manifest binding plus SourceManifest digest |
| Create attempt set | Member | API | Absorbed into release subject (N, budget) | Requires candidate identity support (16) |
| Claim | Agent principal via daemon transport | kernel Claim (ActorKind Agent) | None | The daemon is the transport principal; the kernel actor is the agent |
| Submit output, submit pre-check | Agent via daemon | kernel | None | Keyed by candidate |
| Revise | System (automatic author revision) | kernel Revise | None | Existing (`package.revising`) |
| Stop run | Member | API, daemon | None | Revokes write authority first (22) |
| Requeue | Member | API | None | Refused while outcome unknown is unreconciled |
| Reconcile run | Member; System only with receipt verified termination evidence | API | None for System with receipt evidence; Direct for a Member clearing without receipt evidence | Clears outcome unknown; the record names which evidence cleared it |
| Sweep lost | System (timer) | API | None | Existing (`run.lost`); reaper outage rule (22) |
| Select candidate | Member | API | Absorbed into verdict subject | Never acceptance |
| Abandon attempt set | Member | API | None | |
| Verify (person) | Member qualified as checker in the discipline and grade, not the author's originator and not a pre-check runtime | API, kernel guard | Direct | Creates PersonVerification; required before a verdict on Safety or Material grade work (11.5) |
| Verdict (accept, accept with findings, return, reject) | Qualified Member | kernel | Direct | Subject in 10.3 |
| Clearance (merge, issue, promote) | Qualified Member, possibly different | kernel (new), merge gate | Direct, or autonomy level policy where floors allow | Protected for the split |
| Override independence | Qualified Member | kernel | Direct with reason | Existing |
| Grant issue, begin use, finalize use, revoke | Member, Agent via broker | grant service | None | Existing |
| Start, pause, resume, end exploration | Member | Explore service | None | Lane and policy resolved at start |
| Checkpoint | Member or System | workspace service | None | |
| Promote | Member | API, kernel Draft rules | Absorbed into release subject (SourceManifest digest) | |
| Add, resolve, withdraw comment | Member; Agent may add labelled comments | API | None | Resolution cites revision or reply |
| Probe runtime | System | daemon | None | No prompt content |
| Pin, update, roll back runtime | Administrator | API | Direct | Creates or selects a RuntimeArtifactVersion; fails closed on artifact mismatch; the version is also bound into verdict subjects via the trace |
| Set sandbox policy for a lane | Administrator | API | Direct when lowering protection | |
| Raise lane | Member or Agent proposal | API | None | |
| Lower lane, declassify | Authorized Member | ChangeRequest | Direct | Plan rule |
| Record ControlledRecord | System on observed application evidence | API | None | Software: verified merge evidence naming the resulting commit; Capital Projects: recorded issuance or transmittal. Cites the clearance and the application evidence; never created on clearance alone |
| SCRAM | Member | API, daemon | Direct, with scope and reason, announced before firing | Stops, revokes credentials, quarantines partial work |
| Staged restart | Member | API | Direct per discipline or package, with reason | |
| Seal chain | Member or System key (stated) | API | Direct for Member seals | Interim (11.6) |
| Create organization; enroll, suspend, remove Member | Administrator (the first Member at bootstrap) | API | Direct | Removal follows the plan's departure rules; open delegations revoked |
| Register, revoke authenticator credential | Member (own); Administrator (revoke) | API, auth | Direct with an existing credential, except first enrollment | Records attestation evidence (11.1) |
| Issue, revoke SignerQualification | Administrator with policy authority; licenses carry evidence references | API | Direct | Versioned; revocation invalidates pending challenges that relied on it |
| Delegate, revoke delegation | Holder of the role, within policy | API | Direct | Dated and scoped |
| Create project; set mode, default rigor, lanes, overlays | Administrator | API | Direct | |
| Set autonomy level | Policy authority | API | Direct | Organization floors cap it; level 4 refused |
| Bind, unbind repository | Administrator | API | Direct | Installs the required check (24) |
| Change policy set | Policy authority via ChangeRequest | API, kernel floors | Direct | New PolicySet version |
| Set budget | Policy authority | API | Direct | Mode track, alert or hard cap |
| Select office theme | Member (own preference) | API | None | Bundled theme digests only |

### 10.3 Signature model

Directly signed: confirm requirements, methodology, release, person verification, verdict, clearance, override, lane lowering, lowering sandbox protection, runtime pin changes, SCRAM, staged restart, Member seals, and the administrative commands listed as Direct in 10.2.

The **verdict subject** absorbs and binds, by digest: package revision; requirements and technical digests; SourceManifest; candidate identity and its complete evidence (author output, checker records, criterion results); Selection; ExecutionTrace digests (runtime artifact, model requested and reported, permission mode); SandboxPolicy and IsolationAttestation digests; the PolicySet in effect; open findings and comments being accepted with findings. Any change to an absorbed choice invalidates pending challenges.

The **release subject** absorbs the attempt set parameters and the SourceManifest digest.

The **clearance subject** binds the verdict decision digest and the exact application target. Software: repository, pull request number, head commit, base commit, merge method and the expected resulting tree. Capital Projects: deliverable revision, rung, transmittal or issuance target. At application time the merge gate or issuance step rechecks every bound value atomically; any change (new head, moved base, different tree) refuses application and requires a fresh clearance. PersonVerification records are bound into the verdict subject for Safety and Material grade work.

## 11. Governance

### 11.1 Principals and signing authority

- G-1. Only a passkey backed session of a Member is a person. No request is a person because it arrives on loopback, carries a CLI token, or comes from a process a person started.
- G-2. Target: the daemon token calls only runner routes; agent environments contain no session cookie, daemon token or provider credential. **Current state**: the daemon strips only `CONTROLROD_` variables and inherits HOME (runtime confinement spec); this is a known gap closed by section 23.
- G-3. Agents propose; agents never confirm, approve methodology, release, select, render a verdict, clear, override, pin runtimes, lower lanes or sandbox protection, seal or SCRAM.
- G-4. A sign or verify control is live only when the Member's SignerQualification covers the discipline, grade and license the subject needs (plan Domain model); `ActionDescriptor` says which is missing.
- G-5. High consequence decisions need a credentialed person signing with a hardware backed key (plan floor). Eligibility comes only from an AuthenticatorCredential whose registration carried attestation evidence from an authenticator class the policy set lists as hardware backed. Today's registration requests no attestation (`services/api/src/auth.ts`), so **every existing credential is ineligible for this floor** until re-enrolled with attestation; the refusal names the missing evidence. Synced platform passkeys are ineligible unless policy explicitly lists them.

### 11.2 Floors

From the plan, evaluated fail closed: no agent issues a verdict, clearance, policy or its own baseline; verifier baseline differs from author baseline; high consequence needs a hardware backed credentialed signer; restricted lanes run local only; sealed deliverables never auto merge; autonomy level 4 never. Today floors live in the kernel and service checks; Cedar evaluation is platform expansion program 1. Every floor has a reason code and sentence (WB-03).

### 11.3 Markings, disclosure and declassification

- M-0. **Disclosure gate.** No capture content, attachment, exploration message or run input is sent to any runtime or provider until the subject has a classified lane and the lane admits that runtime and provider. "Provider" includes subscription model services used by local CLIs. Intake today queues immediately on capture; this specification requires classification first (task in Phase 1).
- M-1. Marking metadata is versioned: each object has its marking at creation (immutable) and an effective marking computed from provenance edges (the most sensitive input); caches and exports carry the marking version they used.
- M-2. Raising is a command; lowering or declassifying is a ChangeRequest signed by an authorized Member over the exact subject version, with downstream impact listed. An approved declassification creates a marking override for that subject version. Effective marking is then computed as the most sensitive of each input's effective marking, where an overridden input contributes its declassified marking; derived objects created afterwards use the new value, and existing derived versions are recomputed into new marking versions (never edited in place), each citing the change request.
- M-3. Every view and export shows the effective lane; mixed lane exports are refused unless the export's lane covers all parts.

### 11.4 Evidence dimensions and readiness

Each criterion is evaluated on five dimensions; the displayed readiness answer is derived only after every dimension is enforced.

| Dimension | Values | Source |
|---|---|---|
| Completeness | all mandatory checks executed; missing | Preparation check plan, results |
| Outcome | pass, fail, inconclusive | CheckResult, VerificationRecord |
| Disposition | none, approved disposition, approved basis for N/A, deferred with recorded reason | Human resolution, change request |
| Freshness | current, stale (input or basis changed) | Digests, input quality |
| Independence | separated axes; unseparated axes listed | CouplingProfile, custody |

Rules:
- E-1. Missing results, unfinished mandatory checks and missing retained evidence are never waivable, by any decision kind (consistent with `preparation/results.ts` and the kernel's `required_checks_complete`).
- E-2. Every positive answer requires current freshness and the independence the grade requires. YES requires complete and pass. YES BY APPROVED DISPOSITION requires a completed fail with an approved disposition, or a completed inconclusive result on an **optional** check with an approved disposition. A **mandatory inconclusive check stays blocking** (consistent with `required_checks_complete`, which admits only pass or fail with evidence); relaxing that would be a separately reviewed protected change. N/A WITH APPROVED BASIS requires an approved basis. Anything else is NO.
- E-3. Accept with findings is limited to completed adverse results the existing floors allow; it cannot cover incompleteness.
- E-4. Aggregation over a gate or package: NO if any criterion is NO; otherwise YES BY APPROVED DISPOSITION if any criterion is; otherwise N/A WITH APPROVED BASIS if every criterion is; otherwise YES. A set with no applicable criteria is NO unless an N/A basis is approved for the set.
- E-5. Self evidence is determined from coupling axes (actor, context, mechanism, authority, resource) and agent baselines, not principal identity alone; self evidence is never decisive for independence.

Truth tables for mixed, empty, conflicting and unknown custody sets are part of WB-14's acceptance tests.

### 11.5 Independence

Every case view lists the coupling axes that are not separated, in words. Overrides show reason and signature in place. For Safety and Material grade work an agent check is a pre-check, never verification (plan): an **accept** or **accept with findings** verdict on such work requires a PersonVerification by a qualified checker who is neither the originator nor a pre-check runtime, covering every mandatory criterion. Return and reject need no person verification: incomplete or failed work can always be sent back. Today's flow routes a completed agent pre-check directly to Needs signature (`board.ts`) and records only an `agent-pre-check` VerificationRecord; the kernel guard that requires PersonVerification is a protected change (D-4). General service work may be agent verified with sampling where its grade allows.

### 11.6 Tamper evidence (interim)

- The Postgres chain is tamper evident only against a writer who cannot rewrite later rows. It is interim until DSSE and Tessera (ADR 0009, plan Architecture).
- **Seal protocol.** A seal signs the payload {chain head sequence and digest before the seal, organization, time, signer id, purpose}. The `chain.sealed` event that records it is appended after and is covered by the next seal, so there is no circularity. Member seals use a passkey assertion over that payload; system seals use a key held in the plan's KMS or HSM, never a key readable by agents. Verification checks the chain, each seal's signature against a retained trust anchor and key history, and reports the unsealed suffix length. A database alone cannot prove a sealed suffix was not truncated; the UI states "local chain, not witnessed" until external witnessing exists.
- Per package verification is global chain verification plus an inclusion proof of the package's events.

### 11.7 Honest non claims

Objects carry and views show: `print_mode` (ADR 0020 interim; ACP return path), `shared_provider`, `sandbox_tier_achieved` and unverifiable claims, `chain_witnessed: false`, `interactive`, `self_evidence`, `fixture_data`. The README sentence that every package "runs in a sandbox" is corrected in WB-00.

---

# Part III. The experience

## 12. Surfaces and places

The plan's five surfaces stand: Mobile (Expo), Web, Desktop (Tauri), CLI, and connectors (text message, Slack, Teams). **This program builds Web**, including a phone layout for needs me and SCRAM; the other surfaces follow the plan's gates and are clients of the same commands with no extra decision rights.

Web places (plan Experience, with this specification's additions):

| Place | Purpose |
|---|---|
| **Inbox** | Decisions waiting on you, ordered by gate risk then age; "since you last looked" digest |
| **Office** | The floor plus the board, built to the OV backlog (section 13); primary place |
| **Packages and Case** | All packages; the case view (section 14) |
| **Registers** | Mode workspaces: Software (repos, changes, checks, merges); Capital Projects (deliverables register, design basis, assumptions, comment resolution, transmittals, interface matrix, phase gates) as declared hooks |
| **Explore** | Live exploration and promotion (section 15) |
| **Roster** | Agent roles, baselines, runtimes and pins, sandbox policies |
| **Usage** | Spend, context efficiency, first pass acceptance, review minutes, capture to green |
| **Records** | The ledger, seals, verification |
| **Policies and Administration** | Floors in effect, lanes, qualifications, members |

A command palette reaches every command available to the viewing Member through `ActionDescriptor`.

## 13. The office view

Built to the plan's office view section and P1 backlog (OV-01 needs me routed, OV-02 every state says why, OV-03 group by cause, OV-04 change ripple, OV-05 your office is a work surface, OV-06 act from the agent, OV-07 lenses, OV-08 per agent glance and card, OV-09 since you last looked, OV-10 rigor and independence visible, OV-11 roles and walls, OV-12 scoped stop and staged restart, OV-13 spend and providers visible, OV-14 disputes and loops surface, OV-15 security holds stand apart, OV-26 fits the project). Design reference: the Control Rod Office View artifact.

- Six cube sets (process; mechanical, piping and HVAC; electrical and controls; civil, structural and architectural; assurance; project management and controls) and seven rooms (review, interface, verification, document control, your office, bench, quarantine).
- Agents are simple figures that walk between rooms; people are outlined figures where they sit. At most five marks per figure (state shape, gate flag, changed input triangle, loop count, Safety ring).
- Five states with cause labels; idle hollow. Every stuck state says why and for how long.
- Lenses: Status, Gate, Change, Spend. Presenting mode hides spend and the restricted wing.
- Cause grouping, change ripple, six line "since you last looked".
- SCRAM in the office and on the phone layout (10.2).
- Past about 40 agents, an exceptions overlay; large programs get a portfolio roll up.
- Light by design: plain SVG and HTML, redraw on events, motion only walking and a pulse, both off when hidden or with reduced motion. "No new data": every figure state is an AgentFigure projection.
- Engine: SVG rendering and event batching patterned on openclaw-office (license recorded in the plan as MIT; **pending pin and license verification** before any use), state rules on Munder Difflin (MIT), status rollup order on herdr (Apache-2.0), per the plan. No art assets copied.
- The floor is drawn in two layers. The **scene layer** renders the active theme's inert art. The **semantic layer**, owned by the application and above the scene with fixed stacking and its own hit testing, renders every figure mark, label, count, badge, room name and control. Nothing in the scene layer can receive pointer events or sit above the semantic layer.
- Every OV acceptance case runs against two themes: the default theme and a structurally different test theme (section 18).

## 14. The case view

One column, ordered like PROVE, signed at the bottom:

1. **Asked**: requirements and criteria, digests, confirmation, open items; methodology approval where required.
2. **Ran**: each run as a readable story from daemon normalized events, with trace facts: runtime artifact and version, model requested and reported, permission mode, tool list, sandbox policy, attestation claims and their evidence; candidate label in attempt sets.
3. **Checked**: the independent pre-check, findings, per criterion readiness answers with their dimensions, custody, unseparated coupling axes.
4. **Open**: unresolved findings and comments, stale inputs, refused floors.
5. **Sign**: verdict, then clearance where separate. The decision bar never disappears; it shows the floor that blocks it, the authority missing, and the one fact that would change it, or the exact digest and a sentence of what the signature binds.

Rigor and grade scaling. Floors are identical in every tier; presentation scales.

| Rigor | Asked | Ran | Checked | Sign |
|---|---|---|---|---|
| Administrative | One line objective, minimal criteria | Run summary | Pre-check required by the kernel; shown compactly | Verdict with passkey; clearance by autonomy policy where floors allow |
| Quick | Objective and a few criteria | Story and trace facts | Pre-check with findings | Verdict and clearance |
| Standard | Full requirements; confirmation | Full story, trace, attestation | Per criterion dimensions and custody | Verdict with per criterion statement; clearance |
| High consequence | Plus design inputs, deadbands, methodology, tool qualification | Plus mandatory attestation claims | Plus required custody | Hardware backed credentialed signer; clearance may require a different person |

Grade adds: Safety and Material work treat agent checks as pre-checks and require person verification per floors; General service may sample where its grade allows (plan).

## 15. Explore and promotion

- An Exploration belongs to a project or a personal General space at the administrative tier, under a classified lane and a resolved sandbox policy (M-0). It is visibly "Exploring: not controlled".
- Primary path: ACP sessions (ADR 0011 target) in which Control Rod answers every permission request; this also yields "waiting on you" without screen reading. Until ACP lands, the structured interfaces confirmed by spike S-4 are used, labelled interim. A raw terminal tab exists only as a labelled unattested view; nothing is ever inferred from it.
- Checkpoints capture the working tree to private refs without touching the user's index.
- **Promotion** creates a Draft revision bound to a SourceManifest of retained bytes, with mode, rigor, grade and lane. The controlled author run then executes headless against that manifest, materialized read only, never against the live exploration workspace (N-5). Repeated promotion creates new revisions; released and accepted history is never mutated.

## 16. Compare

- An attempt set runs N candidates against one released revision. Each candidate has a CandidateAssignment carried by its author run, its own independent pre-check, its outputs and criterion results. The existing single author assumptions (`latestAuthorRun`, `latestVerification`, `subjectOf`, `buildJob`, `finishPreCheck`, the `runs_one_live` constraint and "one valid release queues at most one author") are replaced by candidate keyed equivalents; the singleton candidate makes the ordinary path a special case of the same code.
- **Lifecycle** (protected change D-4(b), specified here so review can judge it):
  1. Release with N candidates creates N CandidateAssignments. The package moves Released to InWork on the first candidate claim.
  2. Each candidate progresses independently: author, automatic revisions within its own round budget, pre-check, and for Safety or Material grade PersonVerification. A candidate ends in one of: evidence complete, failed, stopped, abandoned.
  3. The package moves to InVerification when every candidate has ended and at least one has complete evidence. If none does, the system issues an automatic **Return** (the existing kernel Return path): the released revision is closed and preserved unchanged, a new Draft revision supersedes it carrying the preparation forward and the candidates' failure reasons as open items, and any pending release challenge is invalidated. A new release is required to try again.
  4. Selection chooses among candidates with complete evidence only. An accept or accept with findings verdict acts on exactly one selected candidate; unselected candidates are retained as evidence of alternatives and never applied. A return or reject verdict may be issued on the attempt set as a whole at any point after release, without a selection and without complete evidence.
  5. Stopping or failing one candidate never alters another's records. SCRAM stops all candidates.
- The compare view shows criterion readiness, findings, diff size, duration and measured usage; it never shows a model typed score (N-9). Selection is a proposal absorbed into the verdict subject.
- Budgets use Budget and BudgetReservation (section 26).

## 17. Design language

The plan's design language stands: Ascertain's dark look with a Cherenkov blue accent; Cherenkov blue for action and selection, green for verified, amber for a decision waiting on you, violet for work waiting on someone else, orange red for stuck or refused; grade marks and lens scales in neutral greys. Dark first with a light theme for print and bright rooms. One sans serif and one monospace (currently IBM Plex), self hosted. Exact tokens are pulled from ascertain.it's source (plan open item) into one token file shared by web, desktop and mobile. State is always shown by shape as well as colour (`StateMark`). WCAG 2.2 AA.

## 18. Office themes

The owner requires a set of office view themes (about fifteen), integrated seamlessly and kept current with the office as it evolves. This section fixes the contract so themes are part of the office from its first line of code.

**Implementation status.** Draft PR #12 (`feat/overlay-themes`, change record `.nuclear/changes/overlay-themes/`) implements fifteen original worlds on the current Floor: one shared renderer, passive bundled SVG packs generated in `tools/build_theme_art.py`, viewer motion modes Full, Quiet and Still over one shared motion profile, reduced motion support, a list fallback, atomic theme switching, hashed asset manifests and a release manifest that keeps draft art out of ordinary builds. The catalogue is `docs/superpowers/specs/2026-10-25-overlay-themes-catalog.md`; naming, art and launch rules are `docs/overlay-themes/originality.md`, enforced by `tools/check_originality.py`; every world has its own character bodies and brief matched props, enforced by `tools/test_check_theme_assets.py`. D-7's catalogue question is answered by that PR. The rest of this section is the contract the office view (section 13) keeps when it replaces the six station Floor with the Platform Plan's six cube sets and seven rooms; the PR's packs carry over as scene data and gain room regions then.

**Model.** A theme is **inert scene data** drawn in the scene layer beneath the application owned semantic layer (section 13). It cannot draw a mark, a label, a count or a control, cannot receive pointer events, and cannot overlap the semantic layer. That separation, not token rules alone, is what makes N-13 enforceable.

**Canonical layout.** The application owns one layout graph: semantic room regions (the seven rooms and six cube sets), seat and errand anchors, walking paths and the room names. A theme declares only **decorative geometry inside those regions** (furniture, walls, floor texture, props) and may not move, resize or rename a region, anchor or path.

**What a theme provides**: sanitized SVG or raster art per region and per figure body style (within the figure silhouette the semantic layer outlines), scene palette tokens (backgrounds and decoration only), a themed label per room (for example "Recipe Desk"), and its accessibility evidence. The canonical functional name (for example "General work") is always rendered by the semantic layer beside the themed label, so a reader never has to decode a theme to know what a room does. This matches PR #12's station labels.

**What a theme may never contain or change**: scripts, external references, fonts, CSS, filters that affect other layers, motion of any kind beyond the shared motion profile (walking and the working pulse, owned by the renderer, with viewer modes Full, Quiet and Still, and stopped by reduced motion or a hidden tab), the five states and their shapes, gate flag, changed input triangle, loop count, Safety ring, lens colour scales, room meaning, position or canonical functional name, SCRAM, the needs me count, anything in the case view or decision bar, any digest, refusal or signature surface. Semantic colours follow section 17 in every theme.

**Validation (mechanical, on every build).** The theme manifest is parsed against a schema; SVG is sanitized and rejected if it contains scripts, event handlers, external hrefs, foreign objects or styles; art is checked to lie inside its declared region; palette tokens are checked against the scene token list; the digest is recomputed.

**Quality harness (every theme, every office change).**
- Contrast of every semantic label and mark over every rendered scene region, at every lens.
- Occlusion: no semantic element is covered or clipped by scene art; pointer interception test on every control.
- State shape legibility at minimum zoom and at 40 agents.
- Frame budget on the reference machine with 40 agents.
- Reduced motion variant; theme switch keeps selection, scroll and open cards.
- Recorded manual keyboard and screen reader pass of the floor per theme release.

**Sequencing so themes never fall behind.** The theme contract, validator and harness are built before the floor renderer. The renderer is built from its first commit against the default theme and one structurally different test theme, and every office change must pass the harness for both. The catalogue is a parallel design stream starting in Phase 0 (art direction, catalogue draft for D-7, asset licensing), so finished themes arrive as data that the existing harness admits, never as renderer changes.

**Switching**: instant, no reload; per Member preference; presenting mode may force the default theme.

**Intellectual property**: original or properly licensed art only, each asset declared in the register (WB-23). No theme imitates or names a film, television or game franchise, in art, names, documentation or launch material (`docs/overlay-themes/originality.md`). Munder Difflin's themes do, and its `LICENSE-ASSETS` (read at the pinned commit) states its tileset art is LimeZu's "Modern Interiors" under a separate license requiring credit, so none of its art is usable here. The engine idea of a theme configuration over one map renderer is borrowed from Munder Difflin (MIT) as a pattern.

## 19. Quality of life

- Q-1 Creation survives a dropped connection (local draft, same idempotency key, status check).
- Q-2 Half saved settings offer retry or reset to the server accepted value.
- Q-3 Lists remember filters and scroll; cancelling a sheet restores its draft.
- Q-4 Every long operation shows elapsed time and a still working notice.
- Q-5 Keyboard reaches every primary command; palette on one shortcut.
- Q-6 Notifications only when someone must act; everything else waits for the digest (plan).
- Q-7 Empty states teach the next action; first run follows the plan's walkthrough, adapted to local mode, and warns before any real agent process starts.
- Q-8 WCAG 2.2 AA verified by automated checks plus a recorded manual keyboard, screen reader and zoom pass on each core journey.
- Q-9 No third party request in the default build, including inside deliverable viewers and maps (self hosted tiles or none).
- Q-10 Performance budgets on a named reference machine and workload: first meaningful view under 1.5 s; event to screen under 500 ms; case view interactive with 1,000 events; office floor at 60 frames per second with 40 agents.

---

# Part IV. Subsystems

## 20. Runtime adapters

- Daemon side normalization of agent output into one event model (message, tool call start and end, file change, permission request, usage, error, exit), with bounded telemetry admission; the browser only renders. Shape ideas from T3 Code (MIT).
- ACP is the target protocol (ADR 0011); print mode is interim (ADR 0020).

## 21. Runtime qualification and pins

- A RuntimePin names a verified executable artifact (digest, version, path). Runs launch that artifact, not whatever is on PATH; a mismatch fails closed. Update and rollback are atomic; a failed update keeps the previous pin. Probes (auth probes patterned on Agent Orchestrator, Apache-2.0) run on start and on a timer.

## 22. Run supervision

- Spawn time ownership receipt (PID, start time, boot id, generation), patterned on agent-deck (MIT); stop, sweep and kill act only on a verified receipt.
- Stop: revoke write authority, then HUP, TERM, grace, KILL to the process group, each step checked against the receipt; recorded stopped only after exit is observed. Replaces the immediate group SIGKILL in `daemon/internal/runner/proc_unix.go`.
- Outcome unknown: persisted hold with generation fence; Reconcile records proof of disposition; tests cover delayed completion and requeue races across controller and daemon restarts.
- Reaper: a failed probe is a fact; more than half of active runs looking dead in one pass is an outage, terminate nothing.
- Breaker on daemon normalized telemetry (velocity, repeated identical calls, no progress), policy patterned on Munder Difflin (MIT).
- Waiting on a human: ACP permission requests (target). If spike S-3 confirms hooks fire under print mode, an interim detector records `run.waiting` with the requested tool and input digest (plan task 2.9). If it does not, figures in print mode runs show the cause "permission waits not observable in print mode" rather than a guessed state, until ACP lands.

## 22a. SCRAM

- SCRAM sets a persistent **stopped state** on its scope (organization or project), recorded by a signed ScramEvent with reason. While the state holds, the command layer refuses every dispatch, claim, exploration message and release in scope.
- The daemon checks the stopped state on every heartbeat and claim; a daemon that cannot reach the control plane stops its runs after one missed lease interval and refuses new work until it reconnects and reads the state. Explorations in scope are stopped through the same path.
- Stop sequence per run: revoke write authority and credentials, then the graceful stop of section 22; partial work is quarantined with its digests.
- Staged restart is a directly signed command per discipline or package with a reason; it is refused while any run in its scope has unreconciled outcome unknown or unreviewed quarantine.
- Time to stop is measured on every SCRAM and in a drill every release (plan).

## 23. Sandboxing and attestation

Continues the runtime confinement specification without weakening it.

- **Drivers** (ADR 0010, unchanged): sandbox-runtime on laptops (macOS and Linux, WSL2 first on Windows); one OCI driver on servers and managed cloud with microVM isolation per runtime class. `SandboxPolicy` is the single policy type across drivers. Spike S-1 covers macOS, native Linux and WSL2.
- **Capability separation** (runtime confinement spec): the trusted model client and the untrusted tool process are separate capability domains. A **model broker** holds provider credentials and admits only bounded endpoint, model, method, body and response shapes; a **tool broker** grants file and command powers. Tools cannot reach the model broker or its credentials. Native CLIs are offered for a role and lane only after spike S-0 proves this separation for that pinned artifact; otherwise the adapter stays unavailable.
- Credential injection at the broker (pattern from Omnigent's credential proxy design, Apache-2.0 with NOTICE); default deny egress through the driver's proxy with a fail closed decider in the daemon (ADR 0010).
- **Attestation**: each policy declares mandatory claims. After launch the daemon probes each and records observed, refuted or unverifiable, bound to run, generation, policy digest and runtime artifact. Any mandatory claim that is refuted, unverifiable, stale or missing refuses the verdict for lanes and grades that require the policy (protected kernel change, D-4). Downgrades are recorded, never silent.
- Tier "none" is today's labelled interim state; it is not acceptable for lanes or grades whose policy requires a tier.
- Host side git hardening (pattern from Scion, Apache-2.0) applies wherever the daemon runs git in an agent writable tree, which begins with Explore and promotion.

## 24. Merge gate and autonomy (Software mode)

RepoBinding with a GitHub App and a required, no bypass check; "a person clicking merge in GitHub hits the same gate as an agent". The check passes only for a head commit bound by a current clearance subject (10.3). Autonomy levels 1 to 3 per project under organization floors; auto merge refused under any floor; level 4 never. Promotion of a Software exploration can end in a draft pull request whose merge is the application of a clearance. The Software ControlledRecord is created when the merge is observed and its resulting commit verified. **Software clearance and merge integration cannot be enabled for any project until WB-24 passes.**

## 25. Comments and deliverable viewers

- Locator schemes: text and code (line and range), PDF (page and rectangle), drawing (sheet and region, later entity id), spreadsheet (sheet and cell range), map (feature id), report (heading path and paragraph).
- Viewers render untrusted content in an isolated origin with restrictive content security policy and no network; hostile Markdown, SVG, PDF, spreadsheet links, oversized files and external references are tested. Retrieval is digest bound; historical revisions remain viewable.

## 26. Budgets and usage

- Budgets per organization, project and agent; modes track, alert, hard cap (plan). A hard cap is enforced from our own ledger, using reservations taken before dispatch and released on measured completion; reported provider usage is reconciled later and never trusted alone for a hard limit.
- **Reservation size** per run is its conservative maximum: for metered runtimes, the role's context and output ceilings times the maximum turns times the pinned price schedule; for subscription runtimes, a time and turn ceiling recorded as subscription limit use. Attempt sets reserve per candidate, including the candidate's checker runs and its revision round allowance.
- **Exhaustion**: a dispatch whose reservation would exceed a hard cap is refused with a teaching refusal; a running run that reaches its own ceiling is stopped by the graceful stop path.
- **Settlement**: completed runs settle at measured usage; lost or outcome unknown runs stay charged at their full reservation until reconciled. Unavailable telemetry is shown as such, never as zero.

## 27. Event stream

Server sent events sourced from the chain sequence with resume from the last seen sequence; an explicit loss frame when history is unavailable; durable and transient frames separated; heartbeats. Patterns from Agent Orchestrator, herdr, OpenHands, T3 Code.

## 28. Voice capture (later phase)

Voice is the plan's front door. This program defines the voice evidence record on Capture; the capture pipeline (transcription chosen by lane, engineering vocabulary cleanup) follows the plan's Gate 4.

---

# Part V. Requirements, invariants, decisions

## 29. Requirements

Floor column: **F** non deferrable for any release of the workbench; others may be deferred with a recorded reason.

| ID | Observable outcome | Acceptance gate | Floor |
|---|---|---|---|
| WB-00 | Public wording matches evidence | README and UI copy reviewed; no sandbox, isolation, witness or compliance claim beyond evidence | F |
| WB-01 | Ontology contracts as additive TypeSpec with storage | Types, migrations, constraints and services for each persisted object; historical bytes unchanged; vectors per Digested type | F |
| WB-02 | Command boundary | All controlled writes through commands; database role prevents direct writes; inventory covers routes, timers, completion handlers, migrations | F |
| WB-03 | Refusals teach | Every reason code, floor and authority gap has a sentence and the fact that would change it | F |
| WB-04 | Disclosure gate | No egress before lane classification; negative tests on capture, intake, attachments, exploration, claim admission | F |
| WB-05 | Signing authority and person verification | Qualification checks on every signed command; attested credential required for the hardware key floor, existing credentials refused; PersonVerification required before Safety and Material verdicts, with separation rules and negative tests | F |
| WB-06 | Office view to OV P1 | Each OV P1 item has a written acceptance case (inputs, expected projection, commands) and passes it on both the default and test themes | |
| WB-07 | Office themes | Validator and harness of section 18 run on every build; default and test themes pass from the first renderer commit; each catalogue theme passes before it ships | |
| WB-08 | Case view and decision bar | PROVE order; decision bar never absent; rigor and grade scaling with unchanged floors. Closes only when comments (Phase 8) and the decision kind split (Phase 6) are integrated; until then the case view ships beside the existing package page as a preview | F |
| WB-09 | Run stories | Daemon normalized events for both runtimes; raw view | |
| WB-10 | Safe stop, reconcile, reaper, fence, breaker | Failed first tests for each, including restart races | F |
| WB-11 | Resumable stream | Resume by sequence; loss frame on gap | |
| WB-12 | Runtime pins | Launch by verified artifact; mismatch fails closed; atomic update and rollback | F |
| WB-13 | Markings | Versioned metadata; provenance; declassification by signed change request; export markings | F |
| WB-14 | Evidence dimensions and readiness | Rules E-1 to E-5 with truth tables; mappings for every existing enum | F |
| WB-15 | Sandbox via ADR 0010 driver with capability separation | Spike S-0 and S-1 pass; negative tests prove tools cannot reach model transport or credentials | F before enabling confined lanes |
| WB-16 | Attestation binds the verdict | Mandatory claims positive evidence; refusal otherwise (protected). If no lane or grade yet requires a policy, the row is recorded "not applicable" and no confined lane may be enabled until it passes | F where policy requires |
| WB-17 | Explore and promotion | ACP or interim structured sessions; SourceManifest retention; headless controlled run from manifest; no typing into controlled runs | |
| WB-18 | Comments on deliverables | Anchored comments for code, PDF and one non code format; resolution; isolated viewers | |
| WB-19 | Compare with candidate identity | Candidate keyed runs, results and verdict subject (protected lifecycle change) | |
| WB-20 | Chain seals (interim) | Seal protocol of 11.6; truncation limits stated; inclusion proofs | |
| WB-21 | Budgets and usage | Reservations; hard caps from own ledger; Spend lens | |
| WB-22 | Quality of life Q-1 to Q-10 | Each with its own test or recorded check | |
| WB-23 | Borrowed code and asset register | Every ported, translated or adapted file and asset declared with upstream, commit, path, license, notices, changes; retained license evidence | F |
| WB-24 | Merge gate and autonomy (Software mode) | Required no bypass check bound to the clearance subject; autonomy levels; floors refuse auto merge; ControlledRecord only after observed merge | F before Software clearance is enabled |
| WB-25 | SCRAM | Persistent stopped state; scope announced; signed; credentials revoked; disconnected daemons and explorations obey; quarantine; staged restart eligibility; drill time recorded | F |

## 30. Invariants (must never)

- N-1. No controlled state changes outside the command layer.
- N-2. No agent, daemon, loopback request or CLI token acts as a person.
- N-3. No signature over anything other than the digest the screen displayed.
- N-4. No status shown that is not derived from recorded events and objects.
- N-5. No exploration output reaches a verdict except through promotion to a SourceManifest and a headless controlled run.
- N-6. No silent downgrade of sandbox tier, lane, independence or runtime artifact.
- N-7. No worktree described as a security boundary.
- N-8. No Kandev, Claude Squad, OpenKanban, Maestro, Multica, Paradev or cmux code, text, screenshots or assets in the repository; ideas only through clean room notes with a recorded wording check (ADR 0019).
- N-9. No engineering number typed by a model anywhere (AGENTS rule 5: values come from scripts or tools with recorded inputs, outputs and digests), and no model typed score or rank in compare views.
- N-10. No third party network request in the default build.
- N-11. No content leaves the machine before lane classification.
- N-12. No mandatory check waived by any decision.
- N-13. No theme alters state, marks, semantic colour or any signing surface.

## 31. Owner decisions required

| ID | Decision | Recommendation |
|---|---|---|
| D-1 | Explore with promotion | Yes, inside the mode model, with N-5 |
| D-2 | Design language | Withdrawn as a choice: the plan's Ascertain look stands. Owner to confirm the token pull from ascertain.it as the first design task |
| D-3 | Surfaces sequencing | Web plus phone layout in this program; Mobile, Desktop, CLI and connectors at the plan's gates |
| D-4 | Protected changes for separate signed review (the complete list) | (a) methodology, verdict and clearance split; (b) attempt set lifecycle and candidate keyed subjects; (c) attestation binding the verdict; (d) disclosure gate in claim admission if it touches kernel functions; (e) signing authority evaluation in the kernel; (f) evidence rules E-1 to E-4 in the kernel; (g) PersonVerification guard; (h) red team fixtures for sandbox, brokers and SCRAM; (i) CI and workflow changes: register check, theme harness wiring, performance budgets, merge gate workflows; (j) `policies/` changes for floors |
| D-5 | Sandbox | ADR 0010 sandbox-runtime driver with broker separation; confined lanes enabled only after S-0 and S-1 |
| D-6 | Evidence vocabulary | Plan readiness answers as the displayed set; five dimensions internally |
| D-7 | Office themes | Catalogue decided by draft PR #12 (fifteen original worlds, display names adopted 2026-10-30). Approve this section's theme contract, which gates Phase 4 engine work |

## 32. Borrowed code policy

- Only MIT, Apache-2.0, BSD or ISC files at a pinned commit, effective license checked at file and folder level (nested licenses, manifests, SPDX headers, vendored code, NOTICE files), with the license text, NOTICE, exact path inventory and hashes retained in the repository before the port.
- Apache-2.0 ports carry the license, preserve notices including upstream NOTICE attribution, and mark modified files.
- Every ported, translated or adapted file and every asset is declared in the register regardless of headers.
- Concepts without code are cited in the pattern file.

## 33. Non goals

- Not a general agent IDE.
- No hosted multi tenant service in this program (Organization and Member types exist; RLS and Cedar are platform expansion program 1).
- No DBOS migration or external witnessing in this program (programs 2 and 3).
- No remote sandbox providers for non public lanes.
- No compliance, certification or engineering acceptance claim.

## 34. Spikes and open questions

| ID | Question | Blocks |
|---|---|---|
| S-0 | For each pinned native runtime, can model transport be separated from every executable tool, with builtin bypasses disabled? | WB-15, all confined lanes; run first |
| S-1 | Does sandbox-runtime run each pinned CLI under default deny with broker only egress on macOS, native Linux and WSL2? | WB-15 |
| S-2 | Do subscription logins work through the model broker, or is an account key path required per lane? | WB-15 |
| S-3 | Do Claude Code permission hooks fire in print mode? | Interim waiting detection only |
| S-4 | Which structured multi turn interfaces are stable in pinned versions until ACP lands? | WB-17 interim path |
| S-5 | Does Codex's own sandbox start inside the outer driver? | Nesting policy |
| Q-A | Which deliverable formats matter first after code and PDF? | WB-18 |
| Q-B | Answered: the catalogue is draft PR #12 | None |
| Q-D | Is the office scenario spreadsheet (100 scenarios) available, or should Phase 0 write self contained OV acceptance cases? | WB-06 |
| Q-E | Which authenticator classes count as hardware backed for the high consequence floor? | WB-05 |
| Q-C | Which providers may receive each non public lane? | WB-04, WB-15 |

## Required links

[Change record](../../../.nuclear/changes/workbench-ontology/basis.md), [plan](../plans/2026-10-29-workbench-buildout.md), [donor register](../../patterns/workbench-donors.md), [platform buildout spec](2026-10-23-platform-buildout-design.md), [runtime confinement spec](2026-10-23-runtime-confinement-design.md), Control Rod Platform Plan (owner artifact).
