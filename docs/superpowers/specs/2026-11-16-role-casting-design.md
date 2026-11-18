# Role casting: domain-specific agents and the model behind each role

- **Date:** 2026-11-16 (revised 2026-11-18 after the first cross-vendor review)
- **Owner:** Ben Huffer
- **Status:** Owner decisions C-1 to C-9 and D-1, D-2, D-3 and D-6 recorded 2026-11-18 (section 15); C-7's discipline, D-4 and D-5 still open. Design only; nothing here is implemented.
- **Change record:** `.nuclear/changes/role-casting/` (review dispositions: `evidence/05-review-dispositions.md`)
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
15. [Owner decisions](#15-owner-decisions)
16. [Not claimed](#16-not-claimed)

## 1. Intent

The owner's direction (2026-11-16): pick the best available model for each job in Control Rod, inside the limits of the handful of agent CLIs it runs and the models those CLIs can reach, with one set of jobs for software engineering and another for capital project engineering. Some models are better at originating, some at checking, some at generating, some at CAD, some at code.

The prompt for this was a public talk, "The Future Is Domain-Specific Agents" (Justin Schroeder, Standard Agents, AI Engineer World's Fair 2026). Its argument, in our words: many narrow agents, each with its own model, instructions, tools, rules and hooks, beat one general agent with many skills; and those narrow agents compose. The ideas we take from it, and the ones we leave, are in the pattern note.

Control Rod already has most of the parts. A role is a template and hiring creates a baseline (the ontology design names `AgentRole`; `spec/records.tsp` has `AgentBaseline` and `AgentAssignment.role`, a string, but no `AgentRole` contract yet), a runtime pin fixes the CLI build per runtime and role (`RuntimePin` in `spec/workbench.tsp`), the checker must be a different provider (`pickChecker`, kernel `SubmitPreCheck`), and the review panel design runs several seats. What is missing is:

- a **catalog of roles per mode** that says what each role's job actually is (its duty), rather than three run roles shared by everything;
- a **signed casting sheet** that says which harness, model and effort fills each role, by grade and lane, instead of a hard-coded order;
- **role trials**: a scripted, recorded way to show how a cast did at its duty, so the sheet rests on evidence rather than opinion or a vendor's marketing.

## 2. What this reopens, and what it keeps

The multi-provider plan (non-goals) cut "an editable strengths matrix, and any learning loop", and chose a static ordered list of eligible checkers. This design **amends** that non-goal. It does not fit inside it. A sheet ordered per duty from trial results is a strengths matrix, and reordering it after trials and production reports is a learning loop, even with a person and a signature in every turn of it. What the design keeps is the reason for the cut: no live or automatic change of who checks, and no way to shop for a pass.

| The plan cut | This design | What still holds |
|---|---|---|
| An editable strengths matrix | A **casting sheet** per pack: an ordered list of candidates per role, grade and lane. | It is versioned and passkey-signed; nobody edits it live; a run uses the version fixed when it was queued. |
| A learning loop | **Role trials** and **production signals**, both reported to the owner, neither applied automatically. | Nothing changes a cast without a new signed sheet. There is no online learning, no automatic switching and no bandit. Sticky fails stay keyed on the deliverable, so no recast clears a fail. |
| Model fallback inside a counted run | Unchanged: still cut. | A cast names one model. A fallback or subagent seen in `observed_models` makes provenance unknown (plan, provenance step 4). |
| Subagent delegation inside a run | Unchanged: still cut. Composition happens between runs (section 10). | Each specialist is its own sandboxed, attested run. |

**Permitted uses of evidence.** Trial results and production signals may be used only to propose a new sheet, which the owner reviews as a diff and signs. For check and refute roles, a checker is never demoted because it fails more work, raises more findings, or has more findings rejected; those signals reward a lenient checker. Only canary results (seeded defects found and missed) and operational signals (model mismatches, timeouts, quota hits) bear on a checker's place. The checker baseline is the signed M9 static list; adding to it or reordering it needs canary results that meet the canary evidence bar (D-4) for every compared candidate on the same trial set digest. A finding on a clean item counts against a checker only after a person has dispositioned that finding as wrong; a real defect the answer key missed never costs a checker its place.

The owner made this amendment on 2026-11-18 (decision **C-1**, section 15), for every role, with the checker guardrails above.

Kept without change: ADR 0021 (CLI keeps its own login; Control Rod never touches a token), provider separation as the plan defines it, sticky fails, quorum per grade (Safety 2-of-2 from different families; others 1), local models never deciding on Safety or Material, API-key-only CLIs excluded, AGENTS rule 5 (no engineering number typed by a model), and the owner's signed independence override as it works today.

## 3. Three ideas

1. **An agent is a spec, not a model.** A domain agent is a model plus its instructions, tools, rules, inputs, outputs and sandbox. Two agents on the same model with different specs are different agents; the same spec on two models is two casts to compare. The spec is what the owner approves; the model is what trials inform and the owner chooses.
2. **Cast by duty, then separate by provider.** Each role has one duty (originate, check, refute, generate through a tool, extract, plan, summarize). Duties ask for different strengths. The owner orders the candidates per role from trial results; provider separation is then applied on top as a hard constraint the kernel enforces. Casting can never admit a checker that separation would refuse.
3. **In engineering, the model drives tools; tools make numbers.** For Capital Projects, "better at CAD" means better at writing a correct script for a pinned CAD or calculation tool, reading its output, and fixing the script, not better at producing dimensions. Dimensions, quantities and results come from tool runs with recorded inputs, outputs and digests (AGENTS rule 5; domain deliverables DN-01, DN-05). The same rule covers what goes in: every engineering parameter a script or input deck uses is taken by reference from a controlled input, never typed into the script by the model (section 7).

## 4. The domain agent

A domain agent is an `AgentRole`, the role template the ontology design names, with these parts. `AgentRole` is not yet a contract in `spec/`; C1 adds it (section 12). Most map onto fields the ontology already has or plans; the new ones are marked.

| Part | What it holds | Where it lives today | New? |
|---|---|---|---|
| Purpose | One sentence: what the role produces and for whom. | Role prompt file | |
| Mode | Software, Capital Projects, or both. | ADR 0015 packs | |
| Duty | One of the duties in section 5. Drives which scoring scripts apply and which separation rules attach. | none | **new** |
| Instructions | The role prompt, by digest. | `packs/*/roles/*.md` | |
| Inputs | Typed inputs the role may read (deliverables, design basis items, criteria, snapshot), which are untrusted data, and the input modalities needed (text, image, PDF). | Job inputs, pre-check brief | modalities **new** |
| Outputs | Output schema and the one place the role may write. | `verification.json`, `out/`, `scratch/` | |
| Tools | Tool allowlist per harness (ADR 0021 conditions), plus approved external tools from a `ToolManifest` (DN-01). | Daemon launch args | |
| Rules | Floors the role must not cross (for example "do not fix the work yourself"; "no number not traced to a tool run or a cited source"). | Role prompt | |
| Hooks | Control Rod-owned hooks only (openharness H4 idea). Never hooks from the workspace. Not built by this design. | Plan, not built | |
| Sandbox profile | Author, checker (read-only, scratch output), reviewer, or test author (requirements and criteria only). | `SandboxPolicy` | test author **new** |
| Lane floor | The lowest data lane the role may run on, and whether it may run on cloud providers at all. | Disclosure gate | |
| Trial set | The frozen trials that measure this role at its duty (section 9). | none | **new** |

Changing any part except the trial set changes what an agent may do. It goes through the same owner gate as reviewer profiles and runtime pins.

## 5. Duties

| Duty | The job | What good looks like | Separation rule it carries |
|---|---|---|---|
| **Originate** | Produce the deliverable: code, a calc package, a document. | Meets acceptance criteria first time; small diff; no invented facts. | none of its own |
| **Check** | Judge another agent's deliverable against criteria, inputs and design basis. | Finds seeded defects; misses few; few findings on clean work; few that fail the anchoring gate; never fixes the work. | Different vendor and family from every contributor to the checked deliverable, and pairwise between checkers on the same work (kernel, M6 and C6). Never a local model as the deciding check on Safety or Material. |
| **Refute** | Try to disprove a specific finding or claim (review panel Stage 2). | Correctly upholds true findings and refutes false ones, with a cited line. | Different vendor and family from the seat that raised the finding (C6). Never a local model as the deciding refuter on Safety or Material. |
| **Generate through a tool** | Write a script or input deck for a pinned tool (test runner, CAD, solver, renderer), run it, read the result, iterate. | Tool run succeeds; outputs match criteria; every parameter in comes from a controlled input; every number out traces to a tool run. | When the product is checked, the checker follows the Check rule. |
| **Extract** | Pull structured items from controlled inputs: requirements, design basis items, code clauses, interface parameters. | Every item quotes its source with a locator that a deterministic check confirms; nothing missed; nothing invented. | none of its own; the extraction is checked like any deliverable |
| **Plan** | Turn a request into a technical plan, tasks and criteria (requirements and technical preparer). | Plans that the owner accepts with few edits; criteria that are testable. | none of its own |
| **Summarize** | Briefs, status notes, transmittal covers, card summaries. | Faithful: no claim not in the source, no required fact left out; short. | none |

Vendor and family mean what the multi-provider plan means: the entry in the signed registry, looked up by artifact digest and pinned model. They never come from the harness name; one harness can reach several vendors.

The duty, not the run role, decides which strengths matter. Roles with the same duty share scoring scripts; each role has its own trial items where its inputs differ.

## 6. Software mode role catalog

Run roles today are `intake`, `author` and `pre-check`; `spec/work.tsp` `RunRole` also reserves `requirements-preparer` and `technical-preparer`, and the review panel design adds `review`. The others are future run roles.

| Role | Duty | Reads | Writes | Starting hypothesis to trial (not a finding) |
|---|---|---|---|---|
| Intake (`intake`, exists) | Plan | Rough request, repository map | Capture and draft requirements | A fast mid-tier model is enough; trial a small cloud model against a top-tier one for the quality gap. |
| Requirements preparer (reserved) | Plan | Capture, issue, prior specs | Requirements and criteria | Top-tier reasoning model; criteria quality matters more than speed. |
| Technical preparer, architect (reserved) | Plan | Requirements, codebase, ADRs | Technical plan, tasks | Top-tier model with long context. |
| Author, implementer (`author`, exists) | Originate | Package, codebase | Code change | The strongest long-horizon coding agent available; today's default is Claude Code. Trial Claude Code against Codex on the same packages. |
| Test author | Originate | A sealed snapshot of the requirements and criteria only, frozen before implementation starts, in a workspace that holds nothing else (a test author sandbox profile, new); never the implementation | Tests | A **different vendor and family from the implementer**, so tests are not written by the same blind spots that wrote the code. Enforced for Material and Safety (C-4) once the registry holds enough families; the rule is the same in C-4, C6 and section 11. |
| Pre-check (`pre-check`, exists) | Check | Deliverables (including independent tests when the grade requires them), criteria, inputs | `verification.json` | A different vendor from the author: Codex when Claude authored, and the reverse; Grok and Antigravity as further seats once qualified (M7, M8). |
| Reviewer seats (`review`, review panel design) | Check | Frozen snapshot | Findings | Different vendors per seat; trial whether a security-focused instruction set on one seat finds more than three general seats. |
| Refuter | Refute | One finding and its snapshot | Upheld, refuted or inconclusive | A vendor and family different from the raising seat; trial whether a smaller model refutes as well as a large one. |
| Doc writer | Originate | Diff, ADRs | Docs | Mid-tier model; checked by the public-claims and reading-comfort gates already in CI. |
| Summarizer | Summarize | Run events, findings | Card text, briefs | Smallest model that stays faithful; a local model on restricted lanes. |

## 7. Capital Projects mode role catalog

These roles follow the Capital Projects column of [`crosswalk.md`](../../crosswalk.md) and the professional roles already in `SignerQualification` (originator, checker, approver, discipline lead, engineer in responsible charge). The agent roles are helpers to those people; none of them is a signer.

| Role | Duty | Reads | Writes | What the model must be good at |
|---|---|---|---|---|
| Design basis extractor | Extract | Controlled inputs, owner requirements, codes and standards the project licenses | **Proposed** `DesignBasisItem` and assumption entries, each with a quoted source and locator; an assumption only where the source states it, and a gap raised to the owner where it does not; none is in force until a qualified person approves its applicability | Long, dense documents; tables; refusing to fill gaps |
| Codes and standards finder | Extract | The project's licensed standards library | **Proposed** clause references with quotes, edition and locator | Precise citation; saying "not found" |
| Calculation originator | Generate through a tool | Design basis, the approved method, approved tool | `CalculationRun` input record and method script that take every parameter by reference to a controlled input; results come from the run | Writing correct input decks and scripts; unit handling; reading solver output |
| Calculation checker | Check | The originator's calc package, inputs, method | Findings, comparing the recorded calculation run with the alternate run where the grade requires one. The **alternate calculation** uses a method and tool the qualified domain owner selected; it is a separate Generate through a tool run under the checker's separation, never a write from the read-only checker run, and its numbers come from the tool | Spotting unit, boundary and input errors; comparing two recorded runs; never choosing a method and never typing a result |
| Drawing and CAD generator | Generate through a tool | Design basis, interface parameters, templates | Parametric model or drawing script for a pinned CAD tool, with every dimension taken from a controlled input; drawings rendered by the tool | Writing parametric scripts; 3D and spatial reasoning; iterating on render feedback |
| Drawing checker | Check | Rendered drawings and the model, criteria | Findings anchored to sheet and coordinate frame; deterministic checks first (title block, revision, units, clash where a tool gives it) | Vision: reading drawings and title blocks, and spotting where a dimension disagrees with the source. Every dimension or coordinate a finding states comes from the CAD model, the viewer or a measurement tool (DN-06: coordinate values come from the viewer or tool); the model never reads off or states a measurement of its own |
| Interdiscipline checker | Check | `InterfaceRecord`s and both sides' deliverables | Interface findings against deadbands from approved inputs | Cross-document consistency |
| Report writer | Originate | `ReportBuild` references only | Report through a pinned template | Faithful prose that only references controlled quantities |
| Transmittal and cover preparer | Summarize | Release manifest | Transmittal draft | Faithful summary |
| PDF markup reviewer | Check | Delivered PDF revision | Markup anchored to page and coordinates from the viewer | Vision and layout reading |

**What the model never chooses.** Methods (primary and alternate), governing references and their editions, inputs, units, boundary conditions and tolerances are approved by a qualified domain owner before any run. Scripts and input decks take these by reference to controlled inputs. A deterministic check rejects any numeric literal in a model-written script or deck that is not a controlled input or a value the approved method template allows (loop counters, array indices and the like, listed per template). A gap in the controlled inputs holds the run and is raised to the owner; the model does not fill it. No engineering method, tolerance or standard is chosen by this spec.

**Extracted values (C-7).** The design basis extractor writes the quote and locator. The value and unit of each item are parsed by a script from the verified quoted span, never transcribed by the model; a value the script cannot parse is raised as a gap.

**Where tools run (C-9).** Generate through a tool roles never execute engineering tools in counted work. Each round is a one-shot print-mode run (ADR 0020) that writes a script or input deck to its workspace and ends. The control plane then queues a tool-runner job, a separate job kind from a signed flow node: the daemon resolves the tool from its `ToolManifest` by digest (DN-01), runs the numeric-literal check, executes the tool in its own containment with a per-tool, owner-signed network and license policy, and records a `CalculationRun` or generation record with inputs, outputs, tool and environment digests (DN-05). The next round is a new one-shot run reading those outputs as untrusted data. Only tool-runner outputs may be cited. The agent's own sandbox stays as ADR 0021 qualifies it; today it allows network only for public or internal General service work, and Codex cannot be limited to named hosts (`networkFor` in `services/api/src/sandbox.ts`, `CodexPolicyArgs` in `daemon/internal/runner/sandbox.go`), so licensed tools could not run there for Safety or Material work anyway.

**Prerequisites per role.** Each role starts only after its prerequisites, and only with trial items supplied or approved by a qualified domain owner (section 9). Milestone C8 and `plan.md` use this table.

| Role | Prerequisites |
|---|---|
| Design basis extractor | DN-03 (source authority, revision, digest and license); a locator check confirmed by a tool (review panel `section` type, extended to PDF page and region); domain-owner-approved trial items |
| Codes and standards finder | A licensed, controlled standards library per project (owner input); DN-03 |
| Calculation originator | DN-01 tool manifests; DN-05 calculation runs; owner-approved method templates |
| Calculation checker | DN-05; owner-approved alternate methods; the C6 separation rules |
| Drawing and CAD generator | DN-01; DN-02 generation publication; an approved CAD tool (operator-installed, called, not copied); decision C-9 |
| Drawing checker | DN-06 PDF review coordinate frame; a qualified harness with image and PDF input (section 8) |
| Interdiscipline checker | Interface records (ontology 5.9) |
| Report writer | DN-04 |
| Transmittal and cover preparer | Transmittal record (ontology 5.9) |
| PDF markup reviewer | DN-06; a qualified harness with PDF input |

No Capital Projects check counts toward a verdict until the C6 separation rules that apply to it are in force.

## 8. The casting sheet

A **casting sheet** is a signed, versioned record per pack (and per organization, when organizations diverge). For each role it holds an ordered list of candidates per grade and lane:

| Field | Meaning |
|---|---|
| `role` | A role from the pack's catalog. |
| `grade` | Safety, Material, General service, or `any`. The kernel's grade rules (tier, local-model rule, quorum) apply whatever row matched. |
| `lane` | The data lane, or `any`. A restricted lane admits local candidates only (ADR 0021 decision 3). |
| `candidates[]` | Ordered. Each candidate: `harness` (the qualified adapter: claude, codex, grok, agy, opencode, the local runner the plan has yet to choose, or `fake`, which is test only and allowed on version zero and in tests, never in a signed production sheet after version zero), `model` (the exact model id the CLI is launched with, or `default` where today's launch passes none), `effort` (the CLI's reasoning or effort setting, where it has one), `required_tier` (shown and validated against the registry; never the tier that is enforced), and `trial_ref` (the trial result digest that informed the place; `none` for an owner judgement, allowed only as section 15 C-5a and C-5b say; or `none (M9 baseline)` for a checker entered from the signed M9 list). |
| `separation` | The separation rules this role carries (from its duty), copied for display; the kernel reads the signed policy, not this field. |
| `sheet_version`, `signed_by`, `signed_at`, `digest` | As for other signed policy. |

**Which row applies.** For a run's role, grade and lane, exactly one row applies, by this precedence: exact grade and exact lane; then exact grade and `any` lane; then `any` grade and exact lane; then `any` and `any`. Grade comes before lane because the grade carries the consequence. A sheet with two rows for the same role, grade and lane is refused at signing, so the winning row is never ambiguous. If no row matches, the run is held with the reason.

**Scope and signing (C-2, C-3).** There is one sheet per organization and pack, keyed by `org_id` from version zero, with grade and lane rows. Signing a sheet needs current `policy` authority through a sheet signer action (new; `SignerAction` has none today), the signer's qualification must cover the grade of every row the change touches, and Safety or Material rows need a passkey that meets the hardware floor. A pin change on a runtime that holds a check or refute cast needs the same authority. Today that is the owner alone, because the founding member is issued `administrator`, `lane` and `policy` (`services/api/src/tenancy.ts`); no schema change is needed when organizations arrive. A signed sheet can be rolled back to its previous version by a signed act, on the pattern of `rollbackRuntime` in `services/api/src/runtimes.ts` (D-6).

**How a run uses it.** When a package revision is released, the sheet version in force is fixed into its signed package policy, and every run of that revision and flow instance uses that version; later sheets do not apply to it. This makes the sheet and the plan's eligible list in the signed package policy one source of truth, not two. At claim time the control plane walks that sheet's candidates in order and takes the first that passes, in this order: admission (lane, harness qualification for this platform and version), the runtime pin for that runtime and role (a pin fixes the CLI build, as today; it filters, it never reorders; for check and refute roles a pin or installed-version mismatch **holds** the run instead of dropping that runtime and moving on, which `pinnedOffer` does today (D-1)), the sandbox network policy, provider separation against every contributor and other seats (section 10), the local-model rule for the grade, and the capability tier for the grade. Budget and quota are checked on the chosen candidate and **hold** the run when exceeded, as today; they never move the run to the next candidate, so a quota limit cannot quietly put a weaker cast on the work. If no candidate passes, the run is held with the reason and the fix, as today. Nothing falls back silently to a candidate not on the sheet.

**Which machine claims (D-2).** The candidates a claim sees are the runtimes the claiming daemon has installed (`claim` and `admitted` in `services/api/src/work.ts`). For check and refute roles, a daemon may claim only if it offers every candidate the sheet ranks above the one it would run, so the choice of machine never chooses the checker; otherwise the run waits for a daemon that does.

**Recheck after a fail (D-3).** A recheck of a revised deliverable goes to the checker that recorded the fail, unless that checker has lost qualification or the owner signs a reason for another; a trivial revision never routes the next check to a different checker.

**What does not change with the sheet.** Sticky fails stay keyed on the deliverable digest (`queueRun` refuses a check on a deliverable whose fail still stands, unless an unused signed override exists), so a different checker, a re-claim, a quota change or a new sheet cannot clear a fail. The owner's signed independence override (kernel `OverrideIndependence`) stays a separate, per-run act outside the sheet. For a review panel, the seats are the recipients the person confirmed (review panel 6.1a, the confirmation digest covers each seat's runtime and provider); the sheet may propose the default seats shown before confirmation, never replace a confirmed seat. Quorum seats for Safety are allocated by M9 from the sheet's order; the allocation must find a valid pair of distinct families whenever one exists among admitted candidates, rather than hold on a greedy first pick, and a test covers that case. A Safety seat that is missing, times out or hits quota makes the result inconclusive, never a pass (plan, quorum omission).

**What the run records.** The trace already records the requested and reported model (ADR 0020). It gains the sheet version and the candidate index used. Provenance needs positive evidence: an empty or missing `observed_models`, a model outside the cast model's registry entry, or an alias the registry does not list for that CLI version means unknown provenance (plan, provenance steps 4 and 6). This applies to every run whose output feeds a check, not only to checks: an author or consult run with unknown provenance cannot anchor separation, so any check of its output is held. Effort is recorded as requested; where the CLI does not report the effort it ran at, it is "requested, not attested", and it cannot be the reason a candidate meets a tier.

**Tier.** The kernel resolves the attested identity (artifact digest, model, and effort where effort changes capability) against the signed registry and enforces the grade's tier floor and the local-model rule there (M9). The sheet's `required_tier` cannot raise a candidate above what the registry says.

**Version zero.** The first sheet encodes today's behavior exactly: author and intake by today's `pickRuntime` order (claude, codex, fake), pre-check by today's `pickChecker` order (codex, claude, fake) excluding the author's runtime, models `default`, with today's runtime pins, sandbox network filter, budget holds and owner-override rule unchanged (`services/api/src/work.ts`, `services/api/src/runtimes.ts`). Shipping the mechanism changes nothing until the owner signs a sheet that differs, and no other sheet may be signed before C3 (section 13). Because version zero keeps `default`, its runs count as checks exactly as far as they do today and no further: the model registry refuses `default` (`ModelRegistry.Admit` in `daemon/internal/runner/attest.go`), so once registry admission applies, a version-zero check cannot count. Before counted checks rely on a sheet, C3 replaces `default` in every checker entry, and in every author entry whose output a check judges, with an explicit model id that is registered and probed for that CLI version.

**Within the CLI constraint.** The sheet can only name what a qualified harness can launch, through the flag its adapter passes and its attestation parser reads as the model. Today that is `--model` for Claude Code and `-m` for Codex (`ClaudeArgs`, `CodexArgs` and `argvModel` in `daemon/internal/runner`); a model set any other way, such as Codex `-c model=`, is not what attestation compares and must never be used. No adapter passes an effort setting today. Effort is added per CLI only after a flag is shown to work headless, without a second config channel the attestation does not parse, and is recorded as a counted argument. A model reachable only by API key is out until owner decision 5 of the multi-provider plan changes. The adapter's `Capabilities` gains the model ids it can launch, the effort settings valid for each, and the input modalities each takes (text, image, PDF). These come from a qualification probe for that CLI version and platform, run in print mode under the run's sandbox and inside the CLI's own login (ADR 0021; Control Rod never reads, captures or forwards a token). A CLI's own model listing, where one exists, is only a hint for which ids to probe. The sheet is validated against the probe results.

## 9. Role trials: how a cast is earned

A **role trial** is a frozen, owner-held set of tasks for one role at its duty, run through the daemon exactly as production runs are (same adapter, sandbox profile and role prompt), and scored by a script. AGENTS rule 5 applies in full: every score comes from a scoring script with recorded inputs, outputs and digests; no model reports its own score or another model's.

Outputs in check, refute and extract trials are structured (finding, verdict or item schemas with locator and category), so a script can match them to the answer key. Every measure counts omissions as well as errors, and every denominator includes abstentions, timeouts and failed runs.

| Duty | Trial items | Scoring script measures |
|---|---|---|
| Originate (software) | Private packages with hidden acceptance tests, written for trials and never merged into this repository, run against a pre-solution snapshot with no access to later history. | Hidden tests pass on first attempt; criteria that map to a test met (others human-graded); diff size; wall time. Tokens or subscription time are shown as the CLI reported them ("not reported" otherwise), as usage, never as a score. |
| Check | Deliverables with **seeded defects** (the canaries the multi-provider plan deferred until after M9), plus clean deliverables. | Seeded defects found, matched to the answer key by location and category, not only by passing review panel Stage 1; seeded defects missed; findings on clean items; findings that fail Stage 1; injected-instruction resistance (the adversarial suite's injected deliverable case). |
| Refute | Findings with a known answer (true and false). | Correct upheld or refuted against the key, with a citation that passes Stage 1; inconclusive answers counted separately. |
| Generate through a tool | Tool tasks with a known-good output (a test suite to make pass; for Capital Projects, a domain-owner-supplied calc or model with its approved result). | Tool run succeeds; output matches the reference within the tolerance the approved input supplies; every number in the deliverable is a structured reference to a tool output (a number in prose with no reference is flagged); no numeric literal in the script that is not a controlled input. |
| Extract | Documents with an answer key built by a person. | Items found; items missed; items whose quote and locator pass the deterministic check; invented items. |
| Plan | Requests with an owner-accepted plan. | A proxy only: the share of criteria that map to a test or a check (scripted). Edit distance between the candidate's plan and the plan the owner accepted after editing it, computed by script from both retained files; the owner's edit is recorded as an attributed human assessment, not a model score. |
| Summarize | Sources with known facts. | Required facts left out, checked against the fact list; claims not in the source, scored by a script only where summaries are structured as claims citing the source, and human-graded otherwise. |

A measure that no script can score is labelled human-graded, graded blind to the candidate, and attributed to the person.

**Rules for trials.**

- Promotion sets live in a private repository owned by the FlyFission organization account, not a personal account; development sets live in a separate private repository; this public repository holds only digests, the scoring scripts and the results (C-6). Sets are kept for as long as any sheet cites them, with read access for a named auditor. Only the trial runner and scorer check promotion items out, and that checkout path is added to the daemon's denied read set for agent runs. Capital Projects items, answer keys and raw outputs are kept under the project's controlled records. Keeping sets out of public Git limits exposure; it is not evidence of what a hosted model has seen.
- Who seeds canary defects and writes the keys, and whether a model family that helped is barred from candidacy, is open decision D-5. The minimum items, repetitions and margin needed before results may reorder checkers is open decision D-4.
- Development items, used while building roles and prompts, are kept apart from promotion items, used only to compare candidates for a sheet.
- Every candidate compared in a sheet proposal ran on the same trial set digest. When a set is rotated (at least when a new candidate is added), every candidate still on the sheet is rerun on the new set; scores from different sets are never compared.
- Repetitions per item, timeouts, and how failed or empty runs count are fixed in the trial set before it runs, and reported with each result.
- A trial result records: trial set digest, scoring script digest, harness, CLI version, model, effort (requested, and attested where reported), platform, sandbox policy digest, each item's raw output digest and score, and the aggregate. It is evidence under the run attestation, like any run.
- Scoring runs in a separate process the control plane starts after the candidate's run has ended. The candidate has no write access to the scorer, the answer key or the result. The scorer is an approved script, identified by digest; it reads only the raw outputs bound to that trial run's attestation, and its result is bound to the same attestation. The record format rejects a score without these bindings.
- A candidate is trialled only where it is already qualified for the role's sandbox profile on that platform. Trials never relax a sandbox.
- Trial runs are their own job kind. They cannot claim or move a package, accept or check a deliverable, or count toward any quorum.
- Hidden tests and answer keys are never in the candidate's workspace; the scorer reads them after the run.
- Capital Projects trial items and their reference results come from a qualified domain owner. This spec supplies none.
- The comparison shown to the owner reports each measure separately, with the item count and the repetitions, and does not combine them into one ranking number. The owner orders the candidates and signs.
- Agreement between models is never a trial score.
- No trial runs on a subscription plan, attended or not, until a written per-vendor finding exists (C-8).

**Production signals.** From live work the control plane already records (or plans): first-pass acceptance (`UsageRecord`), sticky fails, finding dispositions (accepted, rejected with reason), model mismatches, quota hits. A report per sheet entry shows these to the owner with their denominators, split by role, grade, lane and kind of work. It never changes a cast by itself; it is a reason to run a trial or propose a new sheet. Under the permitted uses in section 2, first-pass acceptance, sticky-fail counts and finding dispositions are diagnostic only for check and refute roles: the report shows them, but the proposal script never uses them to move a checker or refuter, and only canary results and operational signals do.

**Recasting.** A new CLI version or a newly available model starts the same path: qualification (ADR 0021 suite, adversarial suite), then trials, then a sheet proposal as a diff, then the owner's signature. The proposal is generated by a script from the trial results; no agent drafts or edits it. The owner reorders and signs.

## 10. Composition without subagents

The talk's specialists consult other specialists (a legal agent asking a GDPR agent). Inside Control Rod, delegation inside a counted run stays cut, because a subagent is a model and a context the run's attestation cannot see. Composition happens between runs, in the control plane:

- A **flow** (ontology 5.9: `Flow`, `NodeTemplate`, `EdgeTemplate`) chains roles: technical preparer, then test author (on the sealed requirements snapshot) and author, then pre-check once the tests the grade requires exist, then reviewer seats; or extractor, then calc originator, then calc checker and interdiscipline checker.
- A **consult** is a node in a signed flow: the control plane queues a separate print-mode run (ADR 0020) for the specialist role with its own cast, sandbox and attestation. The asking run has ended before the consult output exists; nothing continues a run mid-way. Its output reaches the asking role only through a new one-shot run of that role against frozen inputs, including the consult output as untrusted data. The asking agent does not choose the specialist's model.
- Each node's cast comes from the sheet. Separation applies across the whole flow instance, by lineage: a checker node must be separate from every node whose output reached the deliverable it judges, including consults, extractors, planners and test authors, not only the nominal originator. Lineage comes from attested inputs and outputs; where it is incomplete, the check cannot count. Separation is checked at claim, again when the check is submitted, and again at release.

This gives the specialist structure the talk argues for, with every specialist visible, pinned and attested.

## 11. Fit with the kernel and the existing gates

| Concern | Who enforces | Notes |
|---|---|---|
| Which candidate is tried first | Control plane, from the signed sheet version recorded on the run | A preference, not a gate. |
| A checker is provider-separate from the author | Kernel, on attested facts | Today the kernel compares runtime providers at `SubmitPreCheck`; vendor and family come with M6. Casting cannot override it. A sheet that lists a non-separate checker first just has that candidate refused at claim time. |
| Separation from every contributor in a flow, by lineage; new rules by duty (test author separate from implementer, for the grades C-4 sets; refuter separate from raiser) | Kernel and signed policy | **Protected** under AGENTS rule 2. Needs the owner's signature; part of C6. |
| Capability tier per grade, and no local model deciding on Safety or Material | Kernel (M9), on the attested identity resolved against the signed registry | The sheet's `required_tier` is checked against the registry when the sheet is validated; the kernel enforces the floor, never the sheet field. |
| Model actually used | Daemon attestation (M4) | Positive evidence required: `observed_models` versus the cast model, for every run whose output feeds a check. |
| Sticky fails | Server, keyed on the deliverable digest (M3) | Unchanged by casting. |
| Role prompt, tools, hooks, sandbox profile | Owner gate on agent-authority changes | As for reviewer profiles. |

## 12. What changes where

| Area | Change | Gate |
|---|---|---|
| `packs/software/roles/`, a new `packs/capital-projects/roles/` | Role files with the parts in section 4, starting with the existing three moved under their duty. | Owner gate on role instructions (agent authority) |
| `spec/` | Additive minor version: `AgentRole` (new, with `duty`), `CastingSheet`, `CastingCandidate`, `RoleTrialSet` (digest only), `RoleTrialResult`; `ExecutionTrace` gains `casting_sheet_version` and `candidate_index`. New `RunRole` values as roles are built. Regenerate; never hand-edit. | Review (spec minor) |
| `daemon/` | Adapter `Capabilities` gains probed model ids, effort settings and input modalities; launch takes model and effort from the run (already partly true for model). | Review; qualification probe per CLI version |
| `services/api/` | Claim walks the sheet version recorded on the run instead of hard-coded order; `pickChecker` and `pickRuntime` read it; version zero reproduces today's order. | Review; golden test of today's choices |
| `kernel/`, `policies/` | Lineage-based, duty-based and flow-wide separation. | **Owner signature** (protected) |
| `tools/role_trials/` | Trial runner (through the daemon), the separate scorer process and scoring scripts, and the script that generates sheet proposals; results written as evidence. | Review |
| `apps/web/` | Office view: each desk shows role, duty, harness and model, and the sheet version (C3). Settings shows the sheet and trial results, read only (C5). | Review; axe scan |
| `docs/` | ADR 0023 accepted or returned; this spec. | Owner |

Control Rod-owned hooks (section 4) are not built by this design; they stay with the plan that proposes them.

## 13. Milestones

One pull request each, after or alongside the remaining multi-provider milestones (M5 to M11). Casting is most useful once more than two harnesses are qualified, so C5 waits on at least M7 or M8.

| # | Milestone | Depends on | Signature | Acceptance |
|---|---|---|---|---|
| C0 | Decisions: owner answers section 15 (recorded 2026-11-18, except C-7's discipline, D-4 and D-5); ADR 0023 accepted or returned. | none | Ben | ADR status recorded; decisions in the change record. |
| C1 | Role catalog as pack data: the `AgentRole` contract with `duty` (spec minor), and role files with duty and the section 4 parts for the three existing roles; no dispatch change. | C0 | Ben (role instructions); review (spec minor) | Existing launch goldens unchanged; a test fails if a role file lacks a duty. |
| C2 | Casting sheet contract (spec minor) and version zero, which reproduces today's author, intake and checker choice. Parity only: version zero is the only sheet that may be signed. Sheets are validated against harness names; model ids wait for C3. | C1 | Review | Golden test: every current `pickRuntime` and `pickChecker` case, including pins, the owner override, unavailable candidates, budget holds and held runs, gives the same answer through the sheet. |
| C3 | Probed model ids, effort settings and modalities per adapter; a version that replaces `default` with explicit registered ids in checker entries and in the author entries they judge; model and effort per cast through the adapters; trace records sheet version and candidate index; positive provenance checked for every run that feeds a check; desk view shows the cast. | C2, M4 | Review | A run cast with model X that reports model Y, or reports nothing, is refused as a check, and a check of an author run with unknown provenance is held. |
| C4 | Role trial runner, separate scorer process and scoring scripts; first trial set: **checker canaries** (seeded defects), using review panel Stage 1 and an answer key, after M9 as the multi-provider plan deferred them. Trial evidence only, run as the trial job kind; nothing here affects production eligibility. | C3, M9, review panel R3, trial terms finding (C-8), D-4 and D-5 | Review | Scores are reproduced from stored raw outputs by rerunning only the scorer; a score without scorer, key and attestation bindings is rejected by the record format; a candidate cannot write the result. |
| C4b | Originate and refute trial sets and scoring scripts; the script that generates sheet proposals. | C4, review panel R9 (Stage 2) for refute | Review | As C4, for each new duty. |
| C5 | First software trials across qualified harnesses (author, pre-check, reviewer); comparison report; owner signs sheet version one, with entries for author, intake and pre-check only. A sheet other than version zero is used for counted checks only once M6 and M9 are in force, and until C6 only where the checked deliverable's lineage is one attested author run and nothing else: a deliverable that any consult, extractor, planner or test-author run fed cannot be counted as checked until C6 enforces separation from those nodes. | C4b, M6, M9, M7 or M8 | Ben | A signed sheet whose every non-`none` `trial_ref` resolves to a stored result on the same trial set digest for every compared candidate. |
| C6 | Lineage-based, duty-based and flow-wide separation in the kernel (test author separate from implementer in vendor and family for the grades C-4 sets, refuter separate from raiser, checker separate from every contributor and pairwise between checkers). Sheet entries for refuter and test author become signable here. | C5, M6 | Ben (protected) | Kernel tests and red-team catalog entries for each rule. |
| C7 | Production signals report per sheet entry, with denominators and splits. | C5 | Review | Report only; a test shows it cannot write a sheet. |
| C8 | Capital Projects roles, one pull request per role, each after the prerequisites in the section 7 table and after C6: design basis extractor first, then calc originator and checker, then CAD generator and drawing checker, then the rest. Trial items from a qualified domain owner. | C6, the role's section 7 prerequisites | Ben and the domain owner | Per role: trial results on owner-supplied items; no number in any deliverable that does not trace to a tool run or a cited source; no unlisted numeric literal in any script. |

## 14. Risks

| Risk | Control |
|---|---|
| Trials measure the trial, not the work (overfitting, or the set leaks into training). | Private promotion sets never merged into this public repository; digests only here; development and promotion items apart; rotation reruns every compared candidate; production signals as a cross-check. |
| A model writes or inflates a score. | Scores come only from a separate scorer process the candidate cannot write to; results bound to scorer, key and attestation; rule 5. |
| A strict checker is demoted for failing work. | Section 2 permitted uses: acceptance and disposition signals never count against check or refute roles; canaries decide. |
| Casting quietly concentrates on one vendor, and separation then holds runs. | The comparison report shows vendor spread per flow; the owner signs the order knowing which checkers remain; M9 seat allocation finds a valid pair when one exists. |
| A cheaper cast is chosen for a high-consequence grade, or quota pushes the run down the list. | Tier floor per grade in the kernel on the attested identity (M9); budget and quota hold, never walk; Safety 2-of-2 different families unchanged. |
| Vendor claims or trial results presented as product claims ("best at CAD"). | Copy says what was measured, on which items, at which version; the public-claims check gains phrases such as "best model" and "most accurate". |
| CLI and model churn makes a sheet stale. | Recasting path in section 9; a cast whose harness version is no longer qualified is refused at claim time, which already happens for pins. |
| Capital Projects roles drift into choosing methods, tolerances or numbers. | Section 7: methods, alternates, references, inputs and tolerances come from a qualified domain owner; scripts take parameters by reference; a literal check; the agent drives tools only. |
| Terms of service for unattended trial runs on subscription plans. | A trial-specific per-vendor terms finding before C4 (C-8); trials run at a volume the owner sets. No vendor's terms have been read yet (multi-provider plan, terms of service check: each needs a written finding in the M0 record before that adapter is enabled), so the production finding comes first. |
| Scope: ten milestones on top of eleven. | C0 to C3 are small and mostly no-behavior-change; Capital Projects waits on its prerequisites, one role at a time. |

## 15. Owner decisions

Recorded 2026-11-18. The owner accepted the recommendations below in conversation, after four advisory reviews by Claude subagents (same vendor as the author) and checks against the repository; the record is the authoring agent's note of that conversation, not a signed artifact (change record, verification E-08). Signed sheets and the protected rules in C6 still need the owner's signature when they are built.

| # | Question | Decision |
|---|---|---|
| C-1 | Amend the multi-provider plan's non-goal "an editable strengths matrix, and any learning loop"? | **Amend for every role**, under the permitted uses in section 2. For check and refute roles: the signed M9 static list is the baseline; additions and reorders need canary results meeting the D-4 bar, on the same trial set digest for every compared candidate; a finding on a clean item counts against a checker only after a person dispositions it as wrong. |
| C-2 | One sheet per pack, or per pack and grade? | **One per organization and pack**, keyed by `org_id` from version zero, with grade and lane rows. The sheet version is fixed into the package policy at release, and every run of that revision and flow instance uses it. |
| C-3 | Who may sign a sheet? | **Current `policy` authority**, through a new sheet signer action, with qualification covering every grade a change touches and the hardware passkey floor for Safety and Material rows. A pin change on a runtime that holds a check or refute cast needs the same authority. Today this is the owner alone. |
| C-4 | Separate test author on a different vendor, enforced by the kernel? | **Yes for Material and Safety**, different vendor and family, enforced in C6, and switched on per grade once the registry holds the families that grade needs: Material 3 (implementer, test author, checker), Safety 4 (two checkers, pairwise). Until then the role is not cast for that grade and the record says so. For General service it is optional, and the record states whether the tests were written separately. |
| C-5a | Owner-judgement casts (`trial_ref: none`) for non-checking roles? | **Allowed for Software roles that do not check**, with no calendar expiry; labelled on the desk and record, listed in every sheet proposal, and signed again whenever the harness version is requalified. **Never for Capital Projects roles.** |
| C-5b | Owner-judgement casts for check and refute roles after version zero? | **Only as the M9 baseline**: the signed M9 list enters the sheet as `trial_ref: none (M9 baseline)`. Additions and reorders after that need canary results. Removal is allowed only for lost qualification or operational signals, with the reason recorded. If no canary can run, the role holds; the per-run independence override stays the only bypass. Refuter entries are not signable until C6. |
| C-6 | Where do trial sets live? | **A private repository owned by the FlyFission organization account**; development sets in a separate one; this repository holds digests only; kept for the life of every sheet that cites them, with read access for a named auditor; Capital Projects items, keys and raw outputs under the project's controlled records. |
| C-7 | First Capital Projects role and discipline? | **Design basis extractor**, with values and units parsed by script from the verified quote. Discipline: the first one with a qualified domain owner committed to the trial items. **Still open: which discipline that is.** |
| C-8 | May trials run unattended on subscription plans? | **No trial runs on a subscription plan, attended or not, until a written finding exists for that vendor**, citing the primary terms with retrieval date and digest, read by the owner, covering repeated automated headless runs, starts with no person present, volume and the handling of trial items; it names a nightly cap and is re-checked whenever the terms, plan tier or pinned CLI version change. A production headless finding comes first, since none exists yet. Local models are exempt from vendor terms and keep their tier rules. |
| C-9 | Where do CAD and solver tools run? | **A Control Rod tool runner**, a separate job kind between one-shot rounds, as section 7 describes. Counted work never runs an engineering tool inside the agent's sandbox. |

**Decisions the first list missed**, raised by the adversarial advisory review:

| # | Question | Decision |
|---|---|---|
| D-1 | A pin or installed-version mismatch today drops that runtime and moves on (`pinnedOffer`). Hold or walk? | **Hold** for check and refute roles. |
| D-2 | The candidates are what the claiming daemon has installed. Can the choice of machine choose the checker? | **No.** For check and refute roles, a daemon may claim only if it offers every candidate ranked above the one it would run. |
| D-3 | After a fail, who rechecks a revised deliverable? | **The checker that recorded the fail**, unless it lost qualification or the owner signs a reason. |
| D-4 | The canary evidence bar: minimum items, repetitions and margin before results may reorder checkers. | **Open**, needed before C4. |
| D-5 | Who seeds canary defects and writes the keys, and is a model family that helped barred from candidacy? | **Open**, needed before C4. |
| D-6 | How is a signed sheet rolled back? | **A signed rollback to the previous version**, on the pattern of `rollbackRuntime`. |

## 16. Not claimed

- That any model is better than another at any duty. Section 6 and 7 hypotheses are starting points for trials, not findings.
- That trials prove a cast is correct on real work; they show how it did on the trial items, at that version.
- That keeping trial sets private proves a hosted model has not seen similar items.
- That casting makes checks independent. Provider separation remains the claim, as the multi-provider plan states.
- That any Capital Projects role is ready; each waits on the domain deliverables work and on a qualified domain owner.
- That the design has had an independent review. Three CLIs reviewed it once, dispatched by the authoring side from a brief it wrote (change record, verification).
- Any implemented behavior. This is a design.
