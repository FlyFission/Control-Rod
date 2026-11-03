Verdict: authorize investigation, but withhold full buildout approval. Revision 2 leaves several round 2 corrections inconsistent and introduces two major lifecycle defects.

Spec means 2026-10-29-workbench-ontology-design.md; Plan means 2026-10-29-workbench-buildout.md.

Unresolved round 2 items:

| ID | Status | Why |
|---|---|---|
| Codex R2-09; OpenCode R-06 | Partly resolved | Spec §5.10 and §24 correctly require observed application, but §10.2, line 318, still creates ControlledRecord through “System on clearance.” Change the command trigger to verified merge or recorded issuance, retaining clearance as authorization evidence. |
| Codex F-11 | Partly resolved | RuntimeArtifactVersion now exists, but Spec §7, line 227, still targets “RuntimePin version,” which remains undefined. Point the trace relationship to RuntimeArtifactVersion, consistently with §5.10. |
| OpenCode R-08 | Partly resolved | Spec D-4 claims a complete protected-change list but omits theme-harness CI wiring in Plan 4.3 and merge-gate workflows in 9.1. The D-4 row in packet/basis.md also retains only the earlier four categories. Synchronize these approval inventories. |
| Codex R2-11; OpenCode N-03, N-09 | Partly resolved | The operative authorization split is corrected, but packet/plan.md:3 still instructs presentation with D-1 through D-6. Spec D-7 and Q-B still identify catalogue production as task 4.8, which now implements lenses; catalogue production is 4.9. |

New critical or major findings:

| ID | Severity | Location | Problem | Fix |
|---|---|---|---|---|
| R3-01 | major | Spec §10.2, lines 304 to 305; §11.5, line 387; §16, line 474; Plan 6.8 | Verification and selection prerequisites now block negative verdicts. Verdict includes return and reject, yet Safety and Material verdicts require person verification covering every mandatory criterion, and the candidate lifecycle requires selection of a candidate with complete evidence. An incomplete or failed case therefore cannot receive an ordinary return or rejection. Existing kernel transitions permit those decisions before verification completes. | Limit acceptance prerequisites to accept and accept with findings. Define return and reject subjects for incomplete or failed work without requiring completed verification or an eligible selection. |
| R3-02 | major | Spec §16, line 473 | When no candidate has complete evidence, the new lifecycle automatically returns the package to Draft without specifying revision supersession or the governing command. Making the released revision editable would violate frozen history. Existing work.ts:1367 creates a new revision on return and closes the previous revision. | Specify preservation of the failed released revision and creation of a new Draft revision. Define the automatic command, authority, preparation rollover and release invalidation rules. |

Authorization A: Yes, because Phase 0 and the separately approved, evidence-only spikes can proceed under the stated isolation and protected-edit restrictions.

Authorization B: No, because recording D-1 through D-7 does not resolve the remaining command contradictions and new lifecycle defects.