# Review adjudication: workbench and ontology, Revision 0 to Revision 1

Reviews of Revision 0 on 2026-10-29: Codex (`codex.md`, 3 critical, 18 major, 1 minor), OpenCode (`opencode.md`, 6 major, 12 minor), Antigravity (`agy.md`, 2 critical, 4 major, 5 minor; documents inlined, could not inspect code). Grok did not run: first attempt refused a second directory; second attempt returned HTTP 402 "Grok Build usage balance exhausted" (`grok.log`). A Platform Plan reconciliation (working paper outside the repository) found 24 contradictions; its recommendations are adjudicated in the last table.

Dispositions: **accepted** (changed in Revision 1, location given), **accepted, deferred** (recorded as a gate or open question), **rejected** (with reason).

## Codex

| ID | Finding | Disposition | Where |
|---|---|---|---|
| F-01 | Compare has no candidate specific acceptance model | accepted | Spec 5.10 CandidateAssignment, 10.3 verdict subject, 16; plan 8.4, 8.5 protected |
| F-02 | Sandbox plan lacks model and tool capability separation | accepted | Spec 23 brokers; S-0 first; WB-15 floor |
| F-03 | Capture intake is a disclosure bypass | accepted | Spec 11.3 M-0, N-11, WB-04; plan 1.6 |
| F-04 | Unverifiable confinement could satisfy acceptance | accepted | Spec 23 mandatory claims; WB-16 |
| F-05 | Administrative accept contradicts kernel pre-check floor | accepted | Spec 14 table keeps the floor in every tier |
| F-06 | Exception rule could waive mandatory verification | accepted | Spec 11.4 E-1, E-3, N-12 |
| F-07 | Three evidence contracts collapsed into one | accepted | Spec 8 mappings, 11.4 dimensions; plan 1.9 |
| F-08 | Trust rollup underdefined | accepted | Spec 11.4 dimensions, E-2, E-4, E-5; truth tables in WB-14 |
| F-09 | Signature invariant contradicts catalog | accepted | Spec 10.3 Direct versus Absorbed model |
| F-10 | Catalog incomplete; route inventory insufficient | accepted | Spec 10.1 command boundary, 10.2 expanded; plan 1.4 database role |
| F-11 | Identity and observation conflated | accepted | Spec P3, 5.4 Comment events, 5.10 Checkpoint occurrence id, Runtime and Workspace as objects |
| F-12 | Freeze lacks retained source path | accepted | Spec 5.10 SourceManifest, 15; plan 7.5, 7.6 |
| F-13 | Dependency and baseline semantics conflict with ADR 0016 | accepted | Spec 7 separates references, dependencies and Flow edges; ControlledRecord reopens via deadband; plan 1.7 |
| F-14 | Marking propagation lacks persistence and declassification | accepted | Spec 11.3 M-1, M-2; plan 1.8 |
| F-15 | False claims on draft CAS and Claim actor | accepted | Spec 10.2 corrected; plan 1.5 adds CAS |
| F-16 | Runtime pins and reconciliation lack authority models | accepted | Spec 21, 22; plan 2.3, 2.5 |
| F-17 | Chain seals lack protocol | accepted | Spec 11.6 seal protocol, truncation limit, inclusion proofs; interim label |
| F-18 | Plan omits backend work; UI ahead of data | accepted | Plan 1.1, 1.2 storage and services; fixture flag rule; dependency graph rebuilt |
| F-19 | Breaker and budget lack trustworthy inputs | accepted | Spec 20 daemon normalization, 26 reservations; plan 2.6, 2.7, 5.2 |
| F-20 | Viewers need security and network boundary | accepted | Spec 25 isolated origin and hostile file tests; plan 8.2 |
| F-21 | License and clean room evidence not reproducible | accepted | Spec 32 retained evidence; plan 0.3 register with `third_party/licenses/`; 0.4 wording check |
| F-22 | Completion could defer trust controls | accepted | Spec 29 floor column; plan definition of done |

## OpenCode

| ID | Finding | Disposition | Where |
|---|---|---|---|
| R-01 | Attempt sets cannot run under the current kernel lifecycle | accepted | Spec 16, D-4(b) protected; plan 8.4 |
| R-02 | Administrative row contradicts MissingPreCheck | accepted | Same as Codex F-05 |
| R-03 | Draft CAS misdocumented | accepted | Same as Codex F-15 |
| R-04 | K16 closure claimed without a task | accepted | Plan 1.7 |
| R-05 | Catalog omits Revise, sweep, intake writes | accepted | Spec 10.2 |
| R-06 | Baseline has no tasks | accepted | Renamed ControlledRecord; promotion on clearance in 10.2; reopen via Flow in 7 |
| R-07 | Claim actor is Agent | accepted | Spec 10.2 |
| R-08 | Wrong cross reference; T-3 also protected | accepted | Spec 31 D-4 lists all protected changes |
| R-09 | CriterionResult already has five values | accepted | Spec 8 mappings |
| R-10 | Waiting detection has no task | accepted | Spec 22 (ACP target, S-3 interim) |
| R-11 | T-3 understated existing kernel guard | accepted | Spec 11.4 E-1 cites `required_checks_complete` |
| R-12 | Git hardening "needed today" overstated | accepted | Spec 23: applies from Explore and promotion; plan 7.3 |
| R-13 | G-2 stated in present tense | accepted | Spec 11.1 G-2 target versus current state |
| R-14 | Derived lane not computable for free form exploration | accepted | Spec 15: lane declared at start; M-0 gate |
| R-15 | ExecutionTrace Commentable but not Digested | accepted | Spec 6: ExecutionTrace now Digested |
| R-16 | Map tiles have no owning task | accepted | Plan 8.2 |
| R-17 | Header based register check evadable | accepted | Spec 32; plan 0.3 declares derived files regardless of headers |
| R-18 | Attempt set budget ambiguous | accepted | Spec 26 reservations per candidate including checkers |

## Antigravity

| ID | Finding | Disposition | Where |
|---|---|---|---|
| F-01 | No governed action to reconcile outcome unknown | accepted | Spec 10.2 Reconcile, 22 |
| F-02 | Selection disconnected from acceptance | accepted | Same as Codex F-01 |
| F-03 | Chain seal recursion | accepted | Spec 11.6: seal covers head before the seal; the seal event is covered by the next seal |
| F-04 | Sensitive operations unsigned | accepted in part | Spec 10.3: pins and selection are Absorbed into the verdict subject; lowering protection, SCRAM and lane lowering are Direct. Runtime pin itself remains unsigned because its effect is bound at verdict time |
| F-05 | Headless rerun undefined | accepted | Spec 15 SourceManifest and controlled run from manifest |
| F-06 | Subscription login under confinement at risk | accepted, deferred | S-2 decides per lane; account key path allowed |
| F-07 | Sequencing inversions and cross references | accepted | Plan rebuilt; Case view comments land in Phase 8 with Case scaffold in Phase 3 |
| F-08 | N-9 versus compare ranking | accepted | Spec 16: no model typed score shown |
| F-09 | Clean room custody contradictions | accepted | Donor register wording corrected; notes stay outside until the wording check |
| F-10 | WCAG via axe alone untestable | accepted | Spec Q-8 manual passes; plan 9.5 |
| F-11 | Empty criteria sets undefined | accepted | Spec 11.4 E-4 |

## Platform Plan reconciliation

| Recommendation | Disposition | Where |
|---|---|---|
| Reinstate the office view to OV P1 | accepted | Spec 12, 13; plan Phase 4 |
| People and signing authority | accepted | Spec 5.1, 11.1; plan 1.1, 1.11 |
| Tenancy and project structure | accepted | Spec 5.1, Owned interface |
| Decision kinds release, methodology, verdict, clearance | accepted | Spec 5.5; plan 1.3, 6.6 protected |
| One vocabulary | accepted | Spec 8, P12 |
| SCRAM per plan | accepted | Spec 10.2, WB-25; plan 4.9 |
| Rename Baseline | accepted | ControlledRecord |
| Withdraw palette proposal | accepted | Spec 17, D-2 withdrawn |
| Surfaces as sequencing | accepted | Spec 12, D-3 |
| Merge gate and autonomy | accepted | Spec 24; plan 9.1 |
| Budget and usage, Spend lens | accepted | Spec 5.8, 26; plan 5.2 |
| Grade and missing floors; lane lowering by signed change request | accepted | Spec 5.2, 11.2, 11.3 |
| Sandbox per ADR 0010 | accepted | Spec 23; Omnigent now a pattern for the credential proxy only |
| Interim mechanisms labelled | accepted | Spec 11.6, 11.7, 20 |
| Capital Projects hooks | accepted | Spec 5.9 declared types |
| Explore inside the mode model | accepted | Spec 15 |
| Comment and resolution naming | accepted | Spec 5.4 |
| Lenses, presenting mode, voice record | accepted | Spec 13, 28 |
| Plan alignment section | accepted | Spec 2 |


# Round 2: Revision 1 to Revision 2

Round 2 reviews (`round2/`): Codex (13 new findings plus 15 partial items; conditional go for Phase 0 and spikes), OpenCode (14 new plus 6 partial; hold for a targeted fix), Antigravity (10 new plus 5 partial; approve Phase 0 and spikes only). Grok remained unavailable.

## Partially resolved round 1 items

| Item | Round 2 resolution |
|---|---|
| Codex F-01, OpenCode R-01, Antigravity F-02 (candidate lifecycle) | Spec 16 lifecycle steps 1 to 5; singleton candidate (5.10) |
| Codex F-07, F-08 (mappings, aggregation) | Spec 8 mapping table version 1; 11.4 E-2 freshness and independence for every positive answer; E-4 aggregation |
| Codex F-10, OpenCode N-01 (commands for new objects) | Spec 10.2 administrative rows; 10.1 reader and writer role mechanism; plan 1.4, 1.5 |
| Codex F-11, Antigravity (Workspace, pin versions) | Spec 5.10 Workspace, RuntimeArtifactVersion, Checkpoint exploration id |
| Codex F-13 (citations become refusals) | Spec 7 explicit `depends_on` with migration; plan 1.8 |
| OpenCode R-06 (ControlledRecord tasks) | Spec 5.10 creation rules; plan 9.1 (Software, observed merge); Capital Projects creation deferred with program 5 |
| OpenCode R-08 (protected list) | Spec D-4 complete list (a) to (j) |
| OpenCode R-10 (waiting detection) | Plan 2.9 conditional on S-3, honest cause otherwise |
| Codex F-14 (declassification arithmetic) | Spec 11.3 M-2 override and recomputation; plan 1.9 test |
| Codex F-18 (office inputs) | Plan 4.6 full input list; Phase 4 depends on 2, 3 and 5.2 for Spend |
| Codex F-19 (reservation sizing) | Spec 26 sizing, exhaustion, settlement |
| Codex F-22 (merge gate deferral) | Spec 24 and WB-24 floor before Software clearance |
| Platform: people and grade | Spec 10.2 Verify (person), 11.5, PersonVerification; plan 1.13, 6.8 |
| Platform: Capital Projects hooks | Spec 5.9 minimum typed hooks; plan 1.2 |
| Platform: SCRAM | Spec 22a persistent stopped state; plan 2.10 backend, 4.10 UI |
| OpenCode R-17 (register evasion) | Plan 0.3 similarity scan against pinned donor trees; residual risk stated as review responsibility |
| Antigravity F-07, OpenCode (WB-08 in Phase 3) | Spec WB-08 closes in Phase 8; plan 3.4 preview, 8.6 replacement |

## Codex round 2

| ID | Disposition | Where |
|---|---|---|
| R2-01 theme contract cannot enforce N-13 alone | accepted | Spec 13 two layers; 18 inert scene data, sanitizer, occlusion and pointer tests |
| R2-02 motion and geometry contradictions | accepted | Spec 18 canonical layout, decorative geometry only, single motion whitelist |
| R2-03 themes could fall behind | accepted | Plan 4.2 to 4.5 order; two themes from the first renderer commit; 0.9 catalogue stream |
| R2-04 Safety and Material without person verification (critical) | accepted | Spec 5.10 PersonVerification, 10.2 Verify (person), 11.5; plan 1.13, 6.8 protected |
| R2-05 hardware key floor unimplementable | accepted | Spec 5.1 AuthenticatorCredential, G-5; plan 1.12, 0.10 |
| R2-06 clearance subject undefined | accepted | Spec 10.3 clearance subject and freshness; 24 |
| R2-07 mandatory inconclusive relaxation | accepted | Spec 11.4 E-2: mandatory inconclusive stays blocking |
| R2-08 ownership metadata versus signed bytes | accepted | Spec 5 envelopes; plan 1.1 chain verification before and after backfill |
| R2-09 ControlledRecord implies merge | accepted | Spec 5.10, 24: created only on observed merge |
| R2-10 signature gate too late | accepted | Plan How to execute; risk.md |
| R2-11 approval gate inconsistent | accepted | Plan Authorization A and B; packet synchronized |
| R2-12 OV acceptance depends on optional spreadsheet | accepted | Plan 0.8 acceptance cases; spec Q-D |
| R2-13 E-09 overstated | accepted | verification.md E-09 reworded |

## OpenCode round 2

| ID | Disposition | Where |
|---|---|---|
| N-01 commands for new objects | accepted | As Codex F-10 above |
| N-02 candidate identity on default path | accepted | Spec 5.10 singleton candidate |
| N-03 packet gate text | accepted | All packet exit criteria; packet plan.md |
| N-04 openclaw-office license unverified | accepted | Spec 13 pending verification; plan 0.11 |
| N-05 waiting detection hole | accepted | Plan 2.9 |
| N-06 donor register section numbers | accepted | Register remapped to Revision 2 sections |
| N-07 trace stale reference | accepted | trace.md |
| N-08 Digested membership and theme home | accepted | Spec 6 Digested covers all class F; 5.10 OfficeTheme authoritative home |
| N-09 D-7 gate contradiction | accepted | Spec D-7 split; plan Authorization B |
| N-10 tileset licensing claim unevidenced | accepted | Verified from Munder Difflin `LICENSE-ASSETS` at the pinned commit; recorded in the register and spec 18 |
| N-11 Linux coverage; ADR 0010 narrowing | accepted | Spec 23 restores ADR wording; S-1 includes native Linux |
| N-12 WB-16 vacuity | accepted | Spec WB-16; plan definition of done |
| N-13 Phase 2 to Phase 4 edge | accepted | Plan graph; SCRAM backend moved to 2.10 |
| N-14 React line count | accepted | Spec 1 corrected to about 3,500 lines |

## Antigravity round 2

| ID | Disposition | Where |
|---|---|---|
| N-01 runtime pins unsigned (critical) | accepted | Spec 10.2 Direct; 5.10 RuntimeArtifactVersion |
| N-02 admin and lane authority undefined (critical) | accepted | Spec 5.1 authorities |
| N-03 theme geometry and containment | accepted | Spec 18 |
| N-04 room flavour text | accepted | Spec 18: canonical names always shown; flavour subtitle beneath only |
| N-05 SCRAM in a UI phase | accepted | Plan 2.10 |
| N-06 catalogue bottleneck | accepted | Plan 0.9 parallel stream; 4.9 gated only by the list |
| N-07 Case view replaces page too early | accepted | Plan 3.4 preview, 8.6 replacement |
| N-08 N-9 overbroad | rejected in part | N-9 restates AGENTS rule 5, which is intentionally broad: engineering numbers come from tools with recorded provenance, not from model text. Wording clarified to cite the rule and add compare scores |
| N-09 OfficeTheme lacks commands | accepted | Spec 5.10 bundled manifest; 10.2 Select office theme |
| N-10 System reconcile without oversight | accepted | Spec 10.2 Reconcile evidence rules |

# Round 3: confirmation of Revision 2

Round 3 (`round3/`): Antigravity and Codex both answered **yes** to Authorization A and **not yet** to Authorization B, citing the items below; all were fixed in Revision 2 before presentation. OpenCode answered **yes** to Authorization A and **yes** to Authorization B provided D-4 names the complete protected list; its three residual items (D-4 completeness, the D-7 task number, the ControlledRecord catalog wording) are the same items fixed below.

| ID | Finding | Disposition | Where |
|---|---|---|---|
| Antigravity NEW-02, Codex R2-09 residue | ControlledRecord command still triggered on clearance | accepted | Spec 10.2 Record ControlledRecord on observed application; 7 records link |
| Antigravity NEW-01 | Phase 8 lacked a dependency on Phase 6 | accepted | Plan graph; 8.5, 8.6 |
| Antigravity, Codex | Packet D-4 list and D-7 task numbers out of sync | accepted | basis.md D-4; spec D-7 and Q-B cite plan task 4.9; packet plan.md D-1 to D-7 |
| Codex F-11 residue | Trace link to undefined RuntimePin version | accepted | Spec 7 ran under RuntimeArtifactVersion |
| Codex R-08 residue | D-4 omitted theme harness CI and merge workflows | accepted | Spec D-4 (i); basis.md |
| Codex R3-01 | Prerequisites blocked return and reject | accepted | Spec 11.5 and 16: person verification and selection gate only accept and accept with findings |
| Codex R3-02 | No complete candidate: Draft without supersession | accepted | Spec 16 step 3: automatic Return via existing kernel path, new Draft revision, released revision preserved |

## Exit criteria

Every finding has a disposition. Remaining approval is the owner's: Authorization A now; Authorization B after decisions D-1 to D-7.

## Source-lineage note

Reviewer outputs are retained beside this file. The reconciliation working paper is kept outside the repository at `~/repo-scouting/agent-workbench-2026-10-29/findings/platform-plan-reconciliation.md`.
