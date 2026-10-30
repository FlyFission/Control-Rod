# Workbench buildout plan

Date: 2026-10-30. Revision 2. Implements the [workbench and ontology specification](../specs/2026-10-29-workbench-ontology-design.md) Revision 2 (WB-00 to WB-25), under the Control Rod Platform Plan. Change record: `.nuclear/changes/workbench-ontology/`. Base: `claude/magical-ritchie-e7t851` at `06446bf` (PR #11 on #6).

## Authorization

Two separate approvals:

1. **Authorization A: Phase 0 and spikes.** Phase 0 is documentation, registers, tokens and acceptance cases. Spikes produce evidence only, run in throwaway workspaces, and each spike run needs the owner's go ahead at the time because it starts real agent processes. Authorization A does not require decisions D-1 to D-7; Phase 0 task 0.5 is where they are recorded.
2. **Authorization B: Phases 1 to 9.** Requires decisions D-1 to D-6 and the D-7 theme contract approval recorded in the basis. The D-7 catalogue is PR #12; porting it is task 4.9.

## How to execute

- Isolated worktree off the current prototype head; one branch per phase; small commits naming the WB ids they advance.
- Test first for every behaviour change; record RED and GREEN in the execution ledger `docs/superpowers/execution/2026-10-29-workbench-buildout.md`.
- Contracts first in `spec/`, regenerate, then storage, commands, API, UI. Never hand edit generated output.
- **[protected]** marks AGENTS rule 2 surfaces (kernel decision functions, `policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` major versions). Procedure: write an unsigned proposal (intended diff described in prose, exact target files, tests to be added); obtain the owner's signature on that proposal; only then edit the protected files. No protected file is edited before the signature.
- Borrowed code and assets: register entry with retained license evidence before the first ported line (task 0.3).
- A UI task may scaffold against fixtures behind a `fixture_data` flag, but its WB row passes only on integrated data.
- Each phase ends with an independent review and a fix pass with failed first regressions.

## Dependency overview

```
Authorization A:
  0 governance (incl. theme catalogue stream, OV acceptance cases)
  S-0 (first) -> S-1 -> S-2 ; S-3, S-4, S-5 in any order
Authorization B:
  1 contracts, storage, command layer, disclosure, authority ──┬── 2 run safety + SCRAM backend ──┬── 6 sandbox + attestation (after S-0..S-2)
                                                               │                                 └── 7 Explore + promotion (after 6 for confined lanes, S-4)
                                                               ├── 3 design system, Inbox, Case preview
                                                               ├── 5 Roster, Usage, Records, Policies
                                                               └── 4 Office + themes + SCRAM UI (needs 2, 3; Spend lens needs 5.2)
  8 comments, viewers, Compare (8.1 to 8.3 need 1, 2, 3; 8.4 to 8.6 also need 6.6 to 6.8; protected lifecycle) ; WB-08 closes here
  9 merge gate, voice record, completion
```

## Phase 0. Governance of the build (Authorization A)

| Task | Goal | Files | Evidence | WB |
|---|---|---|---|---|
| 0.1 | Execution ledger | `docs/superpowers/execution/2026-10-29-workbench-buildout.md` | Pins, gates, decision table | all |
| 0.2 | Correct public wording | `README.md`, UI strings | Wording review recorded; string scan test | WB-00 |
| 0.3 | Borrowed code and asset register | `docs/third-party/register.md`, `third_party/licenses/<donor>/` (license, NOTICE, path inventory, hashes), `scripts/check-register.mjs` | Fails on declared derived files or assets lacking entries or retained evidence; plus a similarity scan of new code against the pinned donor trees, flagging undeclared overlap for review. Undeclared ports that evade both remain a review responsibility, stated honestly | WB-23 |
| 0.4 | Kandev notes wording check | change record evidence | ADR 0019 condition 3 result | N-8 |
| 0.5 | Record owner decisions D-1 to D-7 | `.nuclear/changes/workbench-ontology/basis.md` | Dated decisions | all |
| 0.6 | Design tokens from ascertain.it | `apps/web/src/design/tokens.css`, self hosted fonts | Tokens match source; no third party request | WB-08, Q-9 |
| 0.7 | Platform Plan references | `docs/README.md` link to the Platform Plan | Links resolve | all |
| 0.8 | OV acceptance cases | `docs/office-view/acceptance.md`: for each OV P1 item, inputs, expected AgentFigure projection and commands; derived from the scenario spreadsheet if the owner supplies it, otherwise written self contained and owner approved | Owner approval recorded | WB-06 |
| 0.9 | Theme catalogue stream | Land draft PR #12 (fifteen original worlds, originality guard, distinct casts and props); write the structurally different test theme brief and the mapping from PR #12 stations to the office view's rooms and cube sets | PR #12 merged after its human art and distribution review; mapping approved | WB-07 |
| 0.10 | Authenticator policy | `docs/sqa/authenticators.md`: which attested authenticator classes count as hardware backed (Q-E) | Owner approval | WB-05 |
| 0.11 | openclaw-office pin and license check | donor register entry, retained license | Pinned commit and license evidence | WB-23 |

## Spikes (Authorization A; evidence only)

| Spike | Question | Output |
|---|---|---|
| S-0 | Capability separation per pinned runtime: model transport apart from every tool, builtin bypasses disabled | `evidence/spikes/s0-capability-separation.md` |
| S-1 | sandbox-runtime driver with broker only egress for each pinned CLI on macOS, native Linux and WSL2 | `evidence/spikes/s1-srt-driver.md` |
| S-2 | Subscription login through the model broker versus account key per lane | `evidence/spikes/s2-model-broker.md` |
| S-3 | Claude Code permission hooks in print mode | `evidence/spikes/s3-hooks-print-mode.md` |
| S-4 | Stable structured multi turn interfaces until ACP | `evidence/spikes/s4-structured-sessions.md` |
| S-5 | Codex sandbox nested in the outer driver | `evidence/spikes/s5-nesting.md` |

## Phase 1. Contracts, storage, command layer, disclosure, authority

| Task | Goal | Tests | WB | Protected |
|---|---|---|---|---|
| 1.1 | Tenancy and people types with storage (Organization, Member, SignerQualification with administrator, lane and policy authorities, AuthenticatorCredential, Delegation, Project, RepoBinding, PolicySet, Machine); ownership and marking envelopes beside records | Migration up and down; backfill to one organization never rewrites signed bodies, events or digests (verified by chain verification before and after) | WB-01, WB-05 | no |
| 1.2 | Workbench types with storage (Workspace, Exploration, Checkpoint, SourceManifest, Promotion, AttemptSet, CandidateAssignment, Selection, RuntimeProbe, RuntimePin, RuntimeArtifactVersion, SandboxPolicy, IsolationAttestation, ControlledRecord, PersonVerification, ScramEvent, Comment, Resolution, ChangeRequest, Budget, UsageRecord, BudgetReservation) and the Capital Projects minimum hooks of spec 5.9 | Schema; constraints; digest vectors per Digested type | WB-01 | no |
| 1.3 | Decision kinds contract, additive, with companion mapping | Historical signed bytes verify unchanged | WB-01 | no (kernel use in 6.6 is protected) |
| 1.4 | Command layer, reader and writer roles, executor import check; refactor existing writes (routes, `sweepLost`, completion handlers, grant begin and finalize, intake) | Reader role write refused; import check fails on violation; inventory across routes, timers, handlers, migrations | WB-02 | no |
| 1.5 | Administrative commands of spec 10.2 (organization, members, credentials, qualifications, delegation, projects, autonomy, repo binding, policy change, budgets, theme selection) | Allowed and refused cases per command; signatures where Direct | WB-02, WB-05 | **[protected]** for `policies/` |
| 1.6 | Draft compare and swap | Second concurrent write 409; missing If-Match 428 | WB-02 | no |
| 1.7 | Disclosure gate | No intake, attachment processing, exploration message or claim before classification; lane admits runtime and provider | WB-04 | **[protected]** if claim admission touches the kernel |
| 1.8 | Explicit `depends_on` with migration classifying existing `design_inputs[].doc` entries | Citations never gate readiness; unknown package target refuses | WB-01 | no |
| 1.9 | Marking metadata, provenance and declassification | Effective marking rule; declassification override recomputes derived versions; mixed lane export refused | WB-13 | no |
| 1.10 | Evidence dimensions and mapping version 1 | Truth tables per spec 8 and 11.4, including mandatory inconclusive blocking and aggregation | WB-14 | no (kernel use in 6.7 is protected) |
| 1.11 | Refusals and ActionDescriptor including authority gaps | Every reason code, floor and missing qualification renders | WB-03 | no |
| 1.12 | Attested credential enrollment | Attestation requested and stored; existing credentials marked ineligible for the hardware floor; re-enrollment path | WB-05 | no |
| 1.13 | Person verification command and record | Separation rules; required before Safety and Material verdicts once 6.8 lands | WB-05 | no (guard in 6.8 is protected) |
| 1.14 | Signing authority checks in commands | Unqualified Member refused with the missing qualification named | WB-05 | **[protected]** where `evaluate_authority` lands in the kernel |

## Phase 2. Run safety and SCRAM backend

| Task | Goal | WB | Protected |
|---|---|---|---|
| 2.1 | Ownership receipts (pattern from agent-deck, register entry) | WB-10 | no |
| 2.2 | Graceful identity checked stop; write authority revoked first | WB-10 | no |
| 2.3 | Outcome unknown and Reconcile with evidence rules | WB-10 | no |
| 2.4 | Reaper outage rule and generation fence | WB-10 | no |
| 2.5 | Runtime artifact versions, pins and probes; launch by digest; directly signed changes | WB-12 | no |
| 2.6 | Daemon normalized events | WB-09 | no |
| 2.7 | Breaker (policy pattern from Munder Difflin, register entry) | WB-10 | no |
| 2.8 | Resumable stream with loss frame | WB-11 | no |
| 2.9 | Interim waiting detection if S-3 passes; otherwise the honest "not observable in print mode" cause | WB-06, WB-10 | no |
| 2.10 | SCRAM backend: persistent stopped state, command refusals in scope, daemon heartbeat and disconnect behaviour, credential revocation, quarantine, staged restart eligibility, drill timing | WB-25 | **[protected]** for red team fixtures |

## Phase 3. Design system, Inbox, Case preview

| Task | Goal | WB |
|---|---|---|
| 3.1 | Shell and places (Inbox, Office, Packages, Registers, Explore, Roster, Usage, Records, Policies) | WB-08 |
| 3.2 | Command palette from ActionDescriptor | WB-03 |
| 3.3 | Inbox: gate risk then age, binding sentence, digest | WB-06 |
| 3.4 | Case view as a preview beside the existing package page: Asked, Ran, Checked, Open, Sign | WB-08 (partial) |
| 3.5 | Decision bar never absent, with floors, authority and binding digest | WB-08 (partial) |
| 3.6 | Run stories and trace facts with honest flags | WB-09 |
| 3.7 | Rigor and grade scaling; pre-check floor never hidden | WB-08 (partial) |

## Phase 4. Office view, themes, SCRAM UI

Order matters: the theme contract and harness come before the renderer.

| Task | Goal | Tests | WB | Protected |
|---|---|---|---|---|
| 4.1 | Canonical layout graph (semantic regions, anchors, paths, room names) | Graph validation; 40 agent scale | WB-06 | no |
| 4.2 | Theme contract, schema and validator (inert scene data, sanitized SVG, region containment, scene token list) | Rejects scripts, handlers, external refs, styles, out of region art, non scene tokens | WB-07 | no |
| 4.3 | Theme quality harness (contrast per region and lens, occlusion, pointer interception, legibility at minimum zoom and 40 agents, frame budget, reduced motion, switch preserves state) | Harness runs in CI locally; CI wiring protected | WB-07 | **[protected]** for CI wiring only |
| 4.4 | Default theme and structurally different test theme | Both pass 4.2 and 4.3 | WB-07 | no |
| 4.5 | Floor renderer with scene layer and application owned semantic layer | Built against both themes from its first commit; semantic layer above scene with fixed stacking and hit testing | WB-06, WB-07 | no |
| 4.6 | AgentFigure projection with full inputs: kernel, run, sandbox, waiting detection (2.9), qualifications and pending signatures (1.5, 1.14), changed inputs (input quality), usage (5.2) | Five states and causes from recorded data only | WB-06 | no |
| 4.7 | OV P1 items against the acceptance cases of 0.8, on both themes | One passing case per OV-01 to OV-15 and OV-26 | WB-06 | no |
| 4.8 | Lenses and presenting mode (Spend lens after 5.2) | Spend only under its lens; restricted wing hidden in presenting mode | WB-06 | no |
| 4.9 | Port PR #12's fifteen worlds to the office view's room regions as scene data | Each passes 4.2 and 4.3; assets registered; originality and distinct cast tests stay green | WB-07 | no |
| 4.10 | SCRAM UI on the floor and the phone layout, on the Phase 2.10 backend | Scope shown before firing; signature; stop latency displayed | WB-25 | no |
| 4.11 | Exceptions overlay past 40 agents and portfolio roll up | Healthy work folds | WB-06 | no |

## Phase 5. Roster, Usage, Records, Policies

| Task | Goal | WB | Protected |
|---|---|---|---|
| 5.1 | Roster: roles, baselines, runtime versions and pins, sandbox policies | WB-12 | no |
| 5.2 | Budgets, reservations (spec 26 sizing, exhaustion, settlement), usage ledger, Spend lens data | WB-21 | no |
| 5.3 | Records: chain, interim seals per spec 11.6, inclusion proofs, unsealed suffix report | WB-20 | no |
| 5.4 | Policies and Administration screens over the 1.5 commands | WB-05 | **[protected]** for `policies/` |

## Phase 6. Sandbox, attestation, kernel decisions (after S-0, S-1, S-2)

| Task | Goal | WB | Protected |
|---|---|---|---|
| 6.1 | SandboxPolicy resolution per lane and grade | WB-15 | no |
| 6.2 | sandbox-runtime driver integration (ADR 0010) | WB-15 | **[protected]** red team fixtures |
| 6.3 | Model broker | WB-15 | **[protected]** red team fixtures |
| 6.4 | Tool broker; proof tools cannot reach the model broker | WB-15 | **[protected]** red team fixtures |
| 6.5 | Attestation probes and records for mandatory claims | WB-16 | no |
| 6.6 | Methodology, verdict and clearance split; clearance subject and freshness | WB-05, WB-24 | **[protected]** kernel |
| 6.7 | Verdict refuses missing or unverifiable mandatory claims; evidence rules E-1 to E-4 | WB-14, WB-16 | **[protected]** kernel |
| 6.8 | PersonVerification guard for Safety and Material verdicts | WB-05 | **[protected]** kernel |

## Phase 7. Explore and promotion

| Task | Goal | WB |
|---|---|---|
| 7.1 | Exploration service and Workspace objects (patterns from Vibe Kanban worktree manager and Emdash ignored file copy) | WB-17 |
| 7.2 | ACP session adapter (target) or interim structured adapter per S-4 | WB-17 |
| 7.3 | Git hardening on every daemon git call in agent writable trees (pattern from Scion) | WB-17 |
| 7.4 | Checkpoints to private refs (pattern from T3 Code) | WB-17 |
| 7.5 | SourceManifest retention and read only materialization | WB-17 |
| 7.6 | Promotion command and UI; controlled runs from manifest only | WB-17 |

## Phase 8. Comments, viewers, Compare, Case completion

| Task | Goal | WB | Protected |
|---|---|---|---|
| 8.1 | Comment and Resolution with locator schemes | WB-18 | no |
| 8.2 | Isolated viewers with hostile file tests; self hosted map tiles or none | WB-18, Q-9 | no |
| 8.3 | One non code format chosen by the owner (Q-A) | WB-18 | no |
| 8.4 | Candidate identity through runs, results, outputs (singleton path first) | WB-19 | **[protected]** |
| 8.5 | Attempt set lifecycle per spec 16 and Compare view; Selection absorbed into the verdict subject (after 6.6 to 6.8) | WB-19 | **[protected]** |
| 8.6 | Case view replaces the package page; WB-08 closes (after 6.6 and 8.1) | WB-08 | no |

## Phase 9. Merge gate, voice record, completion

| Task | Goal | WB | Protected |
|---|---|---|---|
| 9.1 | GitHub App, required no bypass check bound to clearance subjects, autonomy levels, ControlledRecord on observed merge | WB-24 | **[protected]** workflows |
| 9.2 | Voice evidence record on Capture | WB-01 | no |
| 9.3 | Quality of life Q-1 to Q-10, each separately tested or checked | WB-22 | no |
| 9.4 | Performance budgets on the named reference machine and workload | Q-10 | **[protected]** CI |
| 9.5 | Accessibility: automated plus recorded manual passes per core journey | Q-8 | no |
| 9.6 | Owner pilot of the new experience | all | no |

## Definition of done

- Every floor row (F) passes; floor rows qualified by a condition pass or are recorded not applicable with the condition stated, and the gated capability stays disabled.
- Every other WB row passes or is deferred with a recorded reason and owner acknowledgement.
- Each WB row traces to its tasks, negative scenarios and retained evidence, one row per requirement.
- Every protected change was signed before its edit.
- The register covers every declared port and asset with retained evidence; the similarity scan's flags are resolved.
- The owner pilot is recorded. No public wording claims more than the evidence.

## Required links

[Specification](../specs/2026-10-29-workbench-ontology-design.md), [change record](../../../.nuclear/changes/workbench-ontology/basis.md), [donor register](../../patterns/workbench-donors.md), [review adjudication](../../../.nuclear/changes/workbench-ontology/evidence/reviews/adjudication.md).
