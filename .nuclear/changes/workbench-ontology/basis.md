# Basis: workbench and ontology

## Frozen starting points

- Prototype head: `06446bf6b977718b3343c3bb1cd10d9dafbd3cf2` on `claude/magical-ritchie-e7t851` (PR #11 stacked on #6).
- Nuclear-grade context engineering: `e44af0e` on its `main`.
- Donor repositories at the commits in `docs/patterns/workbench-donors.md`.
- Clean room Kandev reader notes dated 2026-10-29, held outside the repository pending the ADR 0019 wording check.

The Control Rod Platform Plan (owner artifact "Control Rod Build Plan", a Claude Docs document with ten tabs) governs; it was located on 2026-10-29 after earlier specifications recorded it as missing. AGENTS.md, ADR 0002, ADR 0011, ADR 0015, ADR 0016, ADR 0019, ADR 0020, the TypeSpec contracts, the platform buildout, runtime confinement, platform expansion and guided preparation specifications, and the observed prototype form the basis.

The owner's instruction of 2026-10-29 authorizes writing the specification and plan and sending them to outside review CLIs (Codex, Grok, Antigravity, OpenCode). It does not authorize implementation, protected surface changes, merges or release. Implementation is split into Authorization A (Phase 0 and spikes) and Authorization B (Phases 1 to 9).

## Owner decisions

| ID | Decision | Status |
|---|---|---|
| D-1 | Explore inside the mode model, with promotion (N-5) | pending |
| D-2 | Design language: the Platform Plan's Ascertain look stands; confirm the token pull from ascertain.it | pending |
| D-3 | Surfaces sequencing: Web plus phone layout now; other surfaces at plan gates | pending |
| D-4 | In principle authorization, for separate signed review, of the complete protected list in spec section 31: (a) decision kind split; (b) attempt set lifecycle and candidate subjects; (c) attestation binding the verdict; (d) disclosure gate in claim admission; (e) signing authority in the kernel; (f) evidence rules E-1 to E-4 in the kernel; (g) PersonVerification guard; (h) red team fixtures; (i) CI and workflow changes (register check, theme harness wiring, performance budgets, merge gate workflows); (j) policies changes | pending |
| D-5 | Sandbox: ADR 0010 sandbox-runtime driver with broker separation, after S-0 to S-2 | pending |
| D-6 | Evidence: plan readiness answers displayed; five dimensions internally | pending |
| D-7 | Office themes: approve the theme contract (gates Phase 4 engine); approve the catalogue list when drafted (gates task 4.9 only) | pending |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The specification, plan and donor register are reviewed, Authorization A is recorded for Phase 0 and spikes, and Authorization B for Phases 1 to 9 once D-1 to D-6 and the D-7 theme contract are recorded (the D-7 catalogue list gates only plan task 4.9), and no planned capability is presented as implemented.

## Source-lineage note

Workflow basis: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. Adapted as a local engineering record, not a compliance certification.
