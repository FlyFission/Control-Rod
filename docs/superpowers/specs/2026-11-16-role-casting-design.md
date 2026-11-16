# Role casting: domain-specific agents and the model behind each role

- **Date:** 2026-11-16
- **Owner:** Ben Huffer
- **Status:** Draft for owner review. Design only; nothing here is implemented.
- **Change record:** `.nuclear/changes/role-casting/`
- **Decision record:** [ADR 0023](../../adr/0023-role-casting.md) (Proposed)
- **Pattern note:** [`docs/patterns/standard-agents.md`](../../patterns/standard-agents.md)
- **Builds on:** [multi-provider design plan](../../plan/multi-provider-design-plan.md), [review panel](2026-11-06-review-panel-design.md), [domain deliverables](2026-10-23-domain-deliverables-design.md), [workbench ontology](2026-10-29-workbench-ontology-design.md), ADR 0015, 0020, 0021

## Contents

1. [Intent](#1-intent)
2. [What this reopens, and what it keeps](#2-what-this-reopens-and-what-it-keeps)
3. [Three ideas](#3-three-ideas)
4. [The domain agent](#4-the-domain-agent)
5. [Duties](#5-duties)
6. [Software mode role catalog](#6-software-mode-role-catalog)
7. [Capital Projects mode role catalog](#7-capital-projects-mode-role-catalog)
8. [The casting sheet](#8-the-casting-sheet)
9. [Role trials: how a cast is earned](#9-role-trials-how-a-cast-is-earned)
10. [Composition without subagents](#10-composition-without-subagents)
11. [Fit with the kernel and the existing gates](#11-fit-with-the-kernel-and-the-existing-gates)
12. [What changes where](#12-what-changes-where)
13. [Milestones](#13-milestones)
14. [Risks](#14-risks)
15. [Open owner decisions](#15-open-owner-decisions)
16. [Not claimed](#16-not-claimed)

## 1. Intent

The owner's direction (2026-11-16): pick the best available model for each job in Control Rod, inside the limits of the handful of agent CLIs it runs and the models those CLIs can reach, with one set of jobs for software engineering and another for capital project engineering. Some models are better at originating, some at checking, some at generating, some at CAD, some at code.

The prompt for this was a public talk, "The Future Is Domain-Specific Agents" (Justin Schroeder, Standard Agents, AI Engineer World's Fair 2026). Its argument, in our words: many narrow agents, each with its own model, instructions, tools, rules and hooks, beat one general agent with many skills; and those narrow agents compose. The ideas we take from it, and the ones we leave, are in the pattern note.

Control Rod already has most of the parts. A role is a template, hiring creates a baseline (`AgentRole`, `AgentBaseline` in `spec/records.tsp`), a runtime pin is per role (`RuntimePin` in `spec/workbench.tsp`), the checker must be a different provider (`pickChecker`, kernel `SubmitPreCheck`), and the review panel runs several seats. What is missing is:

- a **catalog of roles per mode** that says what each role's job actually is (its duty), rather than three run roles shared by everything;
- a **signed casting sheet** that says which harness, model and effort fills each role, by grade and lane, instead of a hard-coded order;
- **role trials**: a scripted, recorded way to show that a cast is good at its duty, so the sheet rests on evidence rather than opinion or a vendor's marketing.

## 2. What this reopens, and what it keeps

The multi-provider plan (non-goals) cut "an editable strengths matrix, and any learning loop", and chose a static ordered list of eligible checkers. This design keeps the reason for that cut and changes only its scope:

| The plan cut | This design | Why it is not the same thing |
|---|---|---|
| An editable strengths matrix | A **casting sheet** per pack: an ordered list of candidates per role, grade and lane. | It is the static ordered list the plan already chose, extended from checkers to every role. It is versioned and passkey-signed; nobody edits it live. |
| A learning loop | **Role trials** and **production signals**, both reported to the owner, neither applied automatically. | Nothing changes a cast without a new signed sheet. There is no online learning, no automatic switching and no bandit. |
| Model fallback inside a counted run | Unchanged: still cut. | A cast names one model. A fallback or subagent seen in `observed_models` makes provenance unknown (plan, provenance step 4). |
| Subagent delegation inside a run | Unchanged: still cut. Composition happens between runs (section 10). | Each specialist is its own sandboxed, attested run. |

Owner decision **C-1** (section 15) confirms this reading of the non-goal before any build.

Kept without change: ADR 0021 (CLI keeps its own login; Control Rod never touches a token), provider separation as the plan defines it, sticky fails, quorum per grade (Safety 2-of-2 from different families; others 1), local models never deciding on Safety or Material, API-key-only CLIs excluded, AGENTS rule 5 (no engineering number typed by a model).

## 3. Three ideas

1. **An agent is a spec, not a model.** A domain agent is a model plus its instructions, tools, rules, inputs, outputs and sandbox. Two agents on the same model with different specs are different agents; the same spec on two models is two casts to compare. The spec is what the owner approves; the model is what trials choose.
2. **Cast by duty, then separate by provider.** Each role has one duty (originate, check, refute, generate through a tool, extract, plan, summarize). Duties ask for different strengths. Casting picks, per role, the candidate that did best at that duty in trials; provider separation is then applied on top as a hard constraint the kernel enforces. Casting can never pick a checker that separation would refuse.
3. **In engineering, the model drives tools; tools make numbers.** For Capital Projects, "better at CAD" means better at writing a correct script for a pinned CAD or calculation tool, reading its output, and fixing the script, not better at producing dimensions. Dimensions, quantities and results come from tool runs with recorded inputs, outputs and digests (AGENTS rule 5; domain deliverables DN-01, DN-05).

## 4. The domain agent

A domain agent is an `AgentRole` with these parts. Most map onto fields the ontology already has or plans; the new ones are marked.

| Part | What it holds | Where it lives today | New? |
|---|---|---|---|
| Purpose | One sentence: what the role produces and for whom. | Role prompt file | |
| Mode | Software, Capital Projects, or both. | ADR 0015 packs | |
| Duty | One of the duties in section 5. Drives which trial set applies and which separation rules attach. | none | **new** |
| Instructions | The role prompt, by digest. | `packs/*/roles/*.md` | |
| Inputs | Typed inputs the role may read (deliverables, design basis items, criteria, snapshot), and which are untrusted data. | Job inputs, pre-check brief | |
| Outputs | Output schema and the one place the role may write. | `verification.json`, `out/`, `scratch/` | |
| Tools | Tool allowlist per harness (ADR 0021 conditions), plus approved external tools from a `ToolManifest` (DN-01). | Daemon launch args | |
| Rules | Floors the role must not cross (for example "do not fix the work yourself"; "no number not traced to a tool run or a cited source"). | Role prompt | |
| Hooks | Control Rod-owned hooks only (openharness H4 idea). Never hooks from the workspace. | Plan, not built | |
| Sandbox profile | Author, checker (read-only, scratch output) or reviewer. | `SandboxPolicy` | |
| Lane floor | The lowest data lane the role may run on, and whether it may run on cloud providers at all. | Disclosure gate | |
| Trial set | The frozen trials that measure this duty (section 9). | none | **new** |

Changing any part except the trial set changes what an agent may do. It goes through the same owner gate as reviewer profiles and runtime pins.

## 5. Duties

| Duty | The job | What good looks like | Separation rule it carries |
|---|---|---|---|
| **Originate** | Produce the deliverable: code, a calc package, a document. | Meets acceptance criteria first time; small diff; no invented facts. | none of its own |
| **Check** | Judge another agent's deliverable against criteria, inputs and design basis. | Finds seeded defects; few findings that fail the anchoring gate; never fixes the work. | Different vendor and family from the originator (kernel, M6). |
| **Refute** | Try to disprove a specific finding or claim (review panel Stage 2). | Correctly upholds true findings and refutes false ones, with a cited line. | Different vendor from the seat that raised the finding. |
| **Generate through a tool** | Write a script or input deck for a pinned tool (test runner, CAD, solver, renderer), run it, read the result, iterate. | Tool run succeeds; outputs match criteria; every number in the output traces to a tool run. | When the product is checked, the checker follows the Check rule. |
| **Extract** | Pull structured items from controlled inputs: requirements, design basis items, code clauses, interface parameters. | Every item quotes its source with a locator that a deterministic check confirms. | none of its own; the extraction is checked like any deliverable |
| **Plan** | Turn a request into a technical plan, tasks and criteria (requirements and technical preparer). | Plans that the owner accepts with few edits; criteria that are testable. | none of its own |
| **Summarize** | Briefs, status notes, transmittal covers, card summaries. | Faithful: no claim not in the source; short. | none |

The duty, not the run role, decides which strengths matter. Two roles with the same duty share a trial set.

## 6. Software mode role catalog

Run roles in brackets exist today; the others are future run roles (`spec/work.tsp` `RunRole` already reserves `requirements-preparer` and `technical-preparer`).

| Role | Duty | Reads | Writes | Starting hypothesis to trial (not a finding) |
|---|---|---|---|---|
| Intake [`intake`] | Plan | Rough request, repository map | Capture and draft requirements | A fast mid-tier model is enough; trial a small cloud model against a top-tier one for the quality gap. |
| Requirements preparer | Plan | Capture, issue, prior specs | Requirements and criteria | Top-tier reasoning model; criteria quality matters more than speed. |
| Technical preparer (architect) | Plan | Requirements, codebase, ADRs | Technical plan, tasks | Top-tier model with long context. |
| Author (implementer) [`author`] | Originate | Package, codebase | Code change | The strongest long-horizon coding agent available; today's default is Claude Code. Trial Claude Code against Codex on the same packages. |
| Test author | Originate | Requirements and criteria only, not the implementation | Tests | A **different vendor from the implementer**, so tests are not written by the same blind spots that wrote the code. Needs owner decision C-4. |
| Pre-check [`pre-check`] | Check | Deliverables, criteria, inputs | `verification.json` | A different vendor from the author: Codex when Claude authored, and the reverse; Grok and Antigravity as further seats once qualified (M7, M8). |
| Reviewer seats [`review`] | Check | Frozen snapshot | Findings | Different vendors per seat; trial whether a security-focused instruction set on one seat finds more than three general seats. |
| Refuter | Refute | One finding and its snapshot | Upheld, refuted or inconclusive | A vendor different from the raising seat; trial whether a smaller model refutes as well as a large one. |
| Doc writer | Originate | Diff, ADRs | Docs | Mid-tier model; checked by the public-claims and reading-comfort gates already in CI. |
| Summarizer | Summarize | Run events, findings | Card text, briefs | Smallest model that stays faithful; a local model on restricted lanes. |

## 7. Capital Projects mode role catalog

These roles follow the Capital Projects column of [`crosswalk.md`](../../crosswalk.md) and the professional roles already in `SignerQualification` (originator, checker, approver, discipline lead, engineer in responsible charge). The agent roles are helpers to those people; none of them is a signer.

| Role | Duty | Reads | Writes | What the model must be good at | Prerequisite |
|---|---|---|---|---|---|
| Design basis extractor | Extract | Controlled inputs, owner requirements, codes and standards the project licenses | `DesignBasisItem` and assumption entries, each with a quoted source and locator | Long, dense documents; tables; refusing to fill gaps | Anchoring check for document locators (review panel `section` type, extended to PDF page and region) |
| Codes and standards finder | Extract | The project's licensed standards library | Clause references with quotes | Precise citation; saying "not found" | A licensed, controlled library per project (owner input) |
| Calculation originator | Generate through a tool | Design basis, method, approved tool | `CalculationRun` input record and method script; results come from the run | Writing correct input decks and scripts; unit handling; reading solver output | DN-01 tool manifests, DN-05 calculation runs |
| Calculation checker | Check | The originator's calc package, inputs, method | Findings; an **alternate calculation** by an independently selected method where the grade requires it | Independent reasoning; choosing a different method; spotting unit and boundary errors | DN-05; different vendor from the originator |
| Drawing and CAD generator | Generate through a tool | Design basis, interface parameters, templates | Parametric model or drawing script for a pinned CAD tool; drawings rendered by the tool | Writing parametric scripts; 3D and spatial reasoning; iterating on render feedback | DN-01, DN-02 generation publication; an approved CAD tool (operator-installed, called, not copied) |
| Drawing checker | Check | Rendered drawings and the model, criteria | Findings anchored to sheet and coordinate frame; deterministic checks first (title block, revision, units, clash where a tool gives it) | Vision: reading drawings, title blocks, dimensions against the source; never inventing a measurement | DN-06 PDF review coordinate frame |
| Interdiscipline checker | Check | `InterfaceRecord`s and both sides' deliverables | Interface findings against deadbands from approved inputs | Cross-document consistency | Interface records (ontology 5.9) |
| Report writer | Originate | `ReportBuild` references only | Report through a pinned template | Faithful prose that only references controlled quantities | DN-04 |
| Transmittal and cover preparer | Summarize | Release manifest | Transmittal draft | Faithful summary | Transmittal record (ontology 5.9) |
| PDF markup reviewer | Check | Delivered PDF revision | Markup anchored to page and coordinates from the viewer | Vision and layout reading | DN-06 |

Capital Projects roles start only after the domain deliverables milestones they depend on, and only with trial fixtures supplied or approved by a qualified domain owner (section 9). No engineering method, tolerance or standard is chosen by this spec.

## 8. The casting sheet

A **casting sheet** is a signed, versioned record per pack (and per organization, when organizations diverge). For each role it holds an ordered list of candidates per grade and lane:

| Field | Meaning |
|---|---|
| `role` | A role from the pack's catalog. |
| `grade` | Safety, Material, General service, or `any`. |
| `lane` | The data lane, or `any`. A restricted lane admits local candidates only (ADR 0021 decision 3). |
| `candidates[]` | Ordered. Each candidate: `harness` (claude, codex, grok, agy, opencode, local), `model` (the exact model id the CLI is launched with), `effort` (the CLI's reasoning or effort setting, where it has one), `min_tier` (the capability tier from the signed registry), and `trial_ref` (the trial result digest that earned the place, or `none` for an owner judgement, labelled as such). |
| `separation` | The separation rules this role carries (from its duty), copied for display; the kernel reads the signed policy, not this field. |
| `sheet_version`, `signed_by`, `signed_at`, `digest` | As for other signed policy. |

**How a run uses it.** At claim time the control plane walks the candidates in order and takes the first that passes, in this order: admission (lane, harness qualification for this platform and version, pin), provider separation against the author and other seats, capability tier for the grade, budget and quota. If none passes, the run is held with the reason and the fix, as today. Nothing falls back silently to a candidate not on the sheet.

**What the run records.** The trace already records the requested and reported model (ADR 0020). It gains the sheet version and the candidate index used. A run whose `observed_models` contains anything other than the cast model has unknown provenance (plan, provenance step 4) and cannot count as a check.

**Version zero.** The first sheet encodes today's behavior exactly: author by today's `pickRuntime` order (claude, codex, fake) with today's per-role pins, pre-check by today's `pickChecker` order (codex, claude, fake) with today's owner-override rule (`services/api/src/work.ts`). Shipping the mechanism changes nothing until the owner signs a sheet that differs.

**Within the CLI constraint.** The sheet can only name what a qualified harness can launch: Claude Code models through `--model`, Codex models through `-m` or `-c model=`, and so on, each through its adapter. A model reachable only by API key is out until owner decision 5 of the multi-provider plan changes. The adapter's `Capabilities` gains the list of model ids it can launch, filled from the CLI's own model listing where one exists; the sheet is validated against it.

## 9. Role trials: how a cast is earned

A **role trial** is a frozen, owner-held set of tasks for one duty, run through the daemon exactly as production runs are (same adapter, sandbox profile and role prompt), and scored by a script. AGENTS rule 5 applies in full: every score comes from a scoring script with recorded inputs, outputs and digests; no model reports its own score or another model's.

| Duty | Trial items | Scoring script measures |
|---|---|---|
| Originate (software) | Packages with hidden acceptance tests, drawn from merged work in this repository and frozen at a commit. | Hidden tests pass on first attempt; criteria met; diff size; wall time; tokens or subscription time as reported. |
| Check | Deliverables with **seeded defects** (the canaries the multi-provider plan deferred until after M9), plus clean deliverables. | Seeded defects found (anchored, through review panel Stage 1); findings on clean items; findings that fail Stage 1; injected-instruction resistance (the adversarial suite's injected deliverable case). |
| Refute | Findings with a known answer (true and false). | Correct upheld or refuted, with a citation that passes Stage 1. |
| Generate through a tool | Tool tasks with a known-good output (a test suite to make pass; for Capital Projects, a domain-owner-supplied calc or model with its approved result). | Tool run succeeds; output matches the reference within the tolerance the approved input supplies; every number in the deliverable traces to a tool output. |
| Extract | Documents with an answer key built by a person. | Items found; items whose quote and locator pass the deterministic check; invented items. |
| Plan | Requests with an owner-accepted plan. | Criteria judged testable by a scripted check (each criterion maps to a test or a check); owner edit distance, recorded by the owner. |
| Summarize | Sources with known facts. | Claims not in the source (checked against a fact list). |

**Rules for trials.**

- Trial sets are private to the owner and not committed in clear, so they do not end up in training data; the repository holds their digests, the scoring scripts and the results. Each set is rotated when a new candidate is added.
- A trial result records: trial set digest, scoring script digest, harness, CLI version, model, effort, platform, sandbox policy digest, each item's raw output digest and score, and the aggregate. It is evidence under the run attestation, like any run.
- A candidate is trialled only where it is already qualified for the role's sandbox profile on that platform. Trials never relax a sandbox.
- Capital Projects trial items and their reference results come from a qualified domain owner. This spec supplies none.
- The comparison shown to the owner reports each measure separately, with the item count, and does not combine them into one ranking number. The owner orders the candidates and signs.
- Agreement between models is never a trial score.

**Production signals.** From live work the control plane already records (or plans): first-pass acceptance (`UsageRecord`), sticky fails, finding dispositions (accepted, rejected with reason), model mismatches, quota hits. A report per sheet entry shows these to the owner. It never changes a cast by itself; it is a reason to run a trial or propose a new sheet.

**Recasting.** A new CLI version or a newly available model starts the same path: qualification (ADR 0021 suite, adversarial suite), then trials, then a sheet proposal as a diff, then the owner's signature. An agent may draft the proposal; the numbers in it come from the trial results, and the owner signs.

## 10. Composition without subagents

The talk's specialists consult other specialists (a legal agent asking a GDPR agent). Inside Control Rod, delegation inside a counted run stays cut, because a subagent is a model and a context the run's attestation cannot see. Composition happens between runs, in the control plane:

- A **flow** (ontology 5.9: `Flow`, `NodeTemplate`, `EdgeTemplate`) chains roles: technical preparer, then author, then test author and pre-check in parallel, then reviewer seats; or extractor, then calc originator, then calc checker and interdiscipline checker.
- A **consult** is a node: the control plane queues a separate run for the specialist role with its own cast, sandbox and attestation, and attaches its output to the asking run's next round as a frozen, untrusted input. The asking agent does not choose the specialist's model.
- Each node's cast comes from the sheet. Separation rules apply across the whole flow instance: a checker node must be separate from every originator node it judges.

This gives the specialist structure the talk argues for, with every specialist visible, pinned and attested.

## 11. Fit with the kernel and the existing gates

| Concern | Who enforces | Notes |
|---|---|---|
| Which candidate is tried first | Control plane, from the signed sheet | A preference, not a gate. |
| A checker is provider-separate from the author | Kernel (M6), on attested facts | Casting cannot override it. A sheet that lists a non-separate checker first just has that candidate refused at claim time. |
| New separation rules by duty (test author separate from implementer; refuter separate from raiser; across a flow) | Kernel and signed policy | **Protected** under AGENTS rule 2. Needs the owner's signature; part of C6. |
| Capability tier per grade | Kernel (M9 tier floor) | The sheet's `min_tier` must be at or above the grade floor; the kernel checks the floor. |
| Model actually used | Daemon attestation (M4) | `observed_models` versus the cast model. |
| Role prompt, tools, hooks, sandbox profile | Owner gate on agent-authority changes | As for reviewer profiles. |

## 12. What changes where

| Area | Change | Gate |
|---|---|---|
| `packs/software/roles/`, a new `packs/capital-projects/roles/` | Role files with the parts in section 4, starting with the existing three moved under their duty. | Owner gate on role instructions (agent authority) |
| `spec/` | Additive minor version: `AgentRole.duty`, `CastingSheet`, `CastingCandidate`, `RoleTrialSet` (digest only), `RoleTrialResult`; `ExecutionTrace` gains `casting_sheet_version` and `candidate_index`. New `RunRole` values as roles are built. Regenerate; never hand-edit. | Review (spec minor) |
| `daemon/` | Adapter `Capabilities` gains launchable model ids and effort settings; launch takes model and effort from the run (already partly true for model). | None beyond review |
| `services/api/` | Claim walks the sheet instead of hard-coded order; `pickChecker` and `pickRuntime` read it; version zero reproduces today's order. | Review; golden test of today's choices |
| `kernel/`, `policies/` | Duty-based separation rules and flow-wide separation. | **Owner signature** (protected) |
| `tools/role_trials/` | Trial runner (through the daemon) and scoring scripts; results written as evidence. | Review |
| `apps/web/` | Office view: each desk shows role, duty, harness and model, and the sheet version; Settings shows the sheet and trial results, read only. | Review; axe scan |
| `docs/` | ADR 0023 accepted or returned; this spec. | Owner |

## 13. Milestones

One pull request each, after or alongside the remaining multi-provider milestones (M5 to M11). Casting is most useful once more than two harnesses are qualified, so C5 waits on at least M7 or M8.

| # | Milestone | Depends on | Signature | Acceptance |
|---|---|---|---|---|
| C0 | Decisions: owner answers section 15; ADR 0023 accepted or returned. | none | Ben | ADR status recorded; decisions in the change record. |
| C1 | Role catalog as pack data: role files with duty and the section 4 parts for the three existing roles; no dispatch change. | C0 | Ben (role instructions) | Existing launch goldens unchanged; a test fails if a role file lacks a duty. |
| C2 | Casting sheet contract (spec minor) and version zero, which reproduces today's author and checker choice. | C1 | Review | Golden test: every current `pickRuntime` and `pickChecker` case gives the same answer through the sheet. |
| C3 | Model and effort per cast through the adapters; trace records sheet version and candidate index; `observed_models` checked against the cast. | C2, M4 | Review | A run cast with model X that reports model Y is refused as a check. |
| C4 | Role trial runner and scoring scripts; first trial set: **checker canaries** (seeded defects), using review panel Stage 1. | C3, review panel R3 | Review | Scores are reproduced from stored raw outputs by rerunning only the scoring script; a model-written score is rejected by the record format. |
| C5 | First software trials across qualified harnesses (author, pre-check, reviewer, refuter); comparison report; owner signs sheet version one. | C4, M7 or M8 | Ben | A signed sheet whose every non-`none` `trial_ref` resolves to a stored result. |
| C6 | Duty-based and flow-wide separation in the kernel (test author separate from implementer, refuter separate from raiser). | C5, M6 | Ben (protected) | Kernel tests and red-team catalog entries for each rule. |
| C7 | Production signals report per sheet entry. | C5 | Review | Report only; a test shows it cannot write a sheet. |
| C8 | Capital Projects roles: design basis extractor first (it needs only the anchoring check), then calc originator and checker after DN-05, then CAD generator and drawing checker after DN-01, DN-02 and DN-06. Trial items from a qualified domain owner. | C5, domain deliverables | Ben and the domain owner | Per role: trial results on owner-supplied items; no number in any deliverable that does not trace to a tool run or a cited source. |

## 14. Risks

| Risk | Control |
|---|---|
| Trials measure the trial, not the work (overfitting, or the set leaks into training). | Private sets, digests only in the repository, rotation per new candidate, production signals as a cross-check. |
| A model writes or inflates a score. | Scores come only from scoring scripts; results carry script and output digests; rule 5. |
| Casting quietly concentrates on one vendor, and separation then holds runs. | The comparison report shows vendor spread per flow; the owner signs the order knowing which checkers remain. |
| A cheaper cast is chosen for a high-consequence grade. | Tier floor per grade in the kernel (M9); Safety 2-of-2 different families unchanged. |
| Vendor claims or trial results presented as product claims ("best at CAD"). | Copy says what was measured, on which items, at which version; the public-claims check gains phrases such as "best model" and "most accurate". |
| CLI and model churn makes a sheet stale. | Recasting path in section 9; a cast whose harness version is no longer qualified is refused at claim time, which already happens for pins. |
| Capital Projects roles drift into choosing methods or tolerances. | Section 7 prerequisite: methods, tolerances and reference results come from a qualified domain owner; the agent drives tools only. |
| Terms of service for unattended trial runs on subscription plans. | The multi-provider plan's per-vendor finding (M0) covers trials too; trials run at a volume the owner sets. |
| Scope: nine milestones on top of eleven. | C0 to C3 are small and mostly no-behavior-change; Capital Projects waits on its prerequisites. |

## 15. Open owner decisions

| # | Decision | Proposal |
|---|---|---|
| C-1 | Does the casting sheet plus trials fit within the multi-provider plan's cut of "an editable strengths matrix, and any learning loop"? | Yes, as read in section 2: static, signed, no automatic change. |
| C-2 | One sheet per pack, or per pack and grade? | Per pack, with grade and lane columns. |
| C-3 | Who may sign a sheet: the owner only, or also a policy authority (`SignerQualification`)? | Owner only until organizations exist. |
| C-4 | Should test authorship be a separate role on a different vendor from the implementer, and enforced by the kernel (C6)? | Yes for Material and Safety; recommended, not enforced, for General service. |
| C-5 | Is an owner-judgement cast (`trial_ref: none`) allowed, and for how long? | Allowed in version one, labelled on the desk and record, and expected to be replaced at the next trial. |
| C-6 | Where do trial sets live (owner machine, private repository, encrypted in this repository)? | A private repository under the owner, referenced by digest. |
| C-7 | First Capital Projects role and discipline for C8. | Design basis extractor, in the discipline of the first real project. |
| C-8 | May trials run unattended overnight on subscription plans? | Only after the vendor ToS findings in multi-provider M0. |

## 16. Not claimed

- That any model is better than another at any duty. Section 6 and 7 hypotheses are starting points for trials, not findings.
- That trials prove a cast is correct on real work; they show how it did on the trial items, at that version.
- That casting makes checks independent. Provider separation remains the claim, as the multi-provider plan states.
- That any Capital Projects role is ready; each waits on the domain deliverables work and on a qualified domain owner.
- Any implemented behavior. This is a design.
