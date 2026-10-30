# Execution ledger: workbench buildout

Plan: [workbench buildout plan](../plans/2026-10-29-workbench-buildout.md). Specification: [workbench and ontology](../specs/2026-10-29-workbench-ontology-design.md). Change record: `.nuclear/changes/workbench-ontology/`.

## Pins

| Item | Value |
|---|---|
| Base | `claude/magical-ritchie-e7t851` at `06446bf` (PR #11 on #6) |
| Specification branch | `docs/workbench-ontology-20261029` (PR #13) |
| Phase 0 branch | `phase-0/workbench-governance` |
| Nuclear-grade validator | `8122269a5b55e5694c8f998ad17955e7ce45798a` (CI pin) |
| Theme catalogue | draft PR #12, `feat/overlay-themes` |

## Authorizations

| Authorization | Scope | Status | Source |
|---|---|---|---|
| A | Phase 0 and spikes S-0 to S-5 | granted 2026-10-30 | Owner: "continue with your plan/spec onward to next phase". Each spike run still asks before starting real agent processes |
| B | Phases 1 to 9 | granted 2026-10-30 | Owner: "Approved all. Continue to completion." after D-1 to D-7 were presented with recommendations |

## Phase 0 progress

| Task | Status | Evidence |
|---|---|---|
| 0.1 Execution ledger | done | This file |
| 0.2 Public wording | done | README lines 5, 13, 23 and 31 rewritten to state designed or planned behaviour; `tools/check_public_claims.py` with tests; failed first: the original README yields four findings, the corrected README none |
| 0.3 Borrowed code and asset register | done | `docs/third-party/register.md`, `third_party/licenses/`, `tools/check_register.py` with tests (Python, following the repository's tools convention rather than the plan's `.mjs` name). First entries: four self hosted font files. Donor overlap scan of the whole repository against all twenty pinned donor checkouts: 0 overlaps once the self checkout is excluded |
| 0.4 Kandev notes wording check | done | Independent checker (ADR 0019 condition 3), 2026-10-30: PASS WITH EDITS. Ten shared six word sequences across 28 pages, all UI labels, page titles or everyday phrasing; four sentences reworded as suggested. Notes and report stay outside the repository |
| 0.5 Owner decisions D-1 to D-7 | done | All approved as recommended on 2026-10-30; recorded in the change record basis |
| 0.6 Design tokens from ascertain.it | done | `apps/web/src/design/tokens.css` from ascertain.it `:root` (fetched 2026-10-30); Inter and JetBrains Mono self hosted; Google Fonts removed; hard coded colours moved to tokens except `pages/Floor.tsx`, which PR #12 replaces. Contrast computed in `evidence/phase0/tokens-contrast.txt`: every text and state colour at least 7.18:1 on panel. `tools/check_offline_assets.py` with tests; the previous `index.html` yields two remote references, the new one none. Rendered sign in page: Inter loaded, zero external requests |
| 0.7 Platform Plan references | done | `docs/README.md` names the owner-held plan and its tabs; no private URL in the public repository |
| 0.8 OV acceptance cases | done (owner approved 2026-10-30) | `docs/office-view/acceptance.md`: given, when, then and never for OV-01 to OV-15 and OV-26, written from the Platform Plan because the scenario spreadsheet was not available |
| 0.9 Theme catalogue stream | done (PR #12 squash merged as 6f1cfaf with the owner's DCO sign-off) | PR #12: originality rules and guard, distinct bodies and brief matched props for all fifteen worlds, adopted display names, second independent review fixed, change record valid. Merge needs the author's DCO sign-off and squash |
| 0.10 Authenticator policy | done | `docs/sqa/authenticators.md`, owner approved 2026-10-30 |
| 0.11 openclaw-office pin and license | done | `WW-AI-Lab/openclaw-office` at `def631a`, MIT, assets are screenshots only; recorded in `docs/patterns/workbench-donors.md` |

## Spikes

Run 2026-10-30 on the owner's WSL2 host; records and raw output in `.nuclear/changes/workbench-ontology/evidence/spikes/`.

| Spike | Result | Consequence |
|---|---|---|
| S-0 | Claude Code: pass (11 of 11, weakened control fails as expected). Codex: not established, no stable switch disables its built in shell | Claude lanes can split model client and tools; Codex confined lanes stay unavailable |
| S-1 | WSL2: pass for both CLIs with masked logins (12 of 12) | Not adopted (owner direction, simple design). The owner's Codex login was not harmed |
| S-2 | Pass for Claude (8 of 8) | Not adopted: Control Rod never holds a user's token |
| S-3 | Pass | Interim waiting detection for WB-09 |
| S-4 | Claude stream-json: pass. Codex multi turn: not run | WB-17 interim path for Claude Explore |
| S-5 | Pass in bubblewrap and srt | Codex sandbox may nest; `/tmp` exclusions mandatory |
| S-6 | Pass for both CLIs with Control Rod settings; defaults leak login files to commands | **Chosen design**: normal CLI login, each CLI's own command sandbox, Control Rod always passes read denials for login folders, no network, `failIfUnavailable`; Codex via permission profile overrides and a preflight refusing `sandbox_mode` |

## Phase 1 progress

| Task | Status | Evidence |
|---|---|---|
| 1.1 Tenancy and people types with storage | done | `spec/tenancy.tsp` (Organization, Member, SignerQualification, AuthenticatorCredential, Delegation, Project, RepoBinding, PolicySet, Machine, OwnershipEnvelope, MarkingEnvelope); migration `009-tenancy` with down script; `services/api/src/tenancy.ts`; `services/api/test/tenancy.test.ts`. Down then up over seeded records leaves every capture, package, run, decision, credential and event byte identical and the chain verifying; frozen versions refuse edits, deletes and version gaps in the database; existing passkeys become credential version 1, ineligible for the hardware floor; new passkeys record their registration evidence. Ownership of records written by pre command layer code comes from a sole active organization trigger that refuses when ownership is ambiguous; task 1.4 replaces it with explicit owners |
| 1.2 Workbench types with storage | done | `spec/workbench.tsp` (Exploration, Workspace, Checkpoint, SourceManifest, Promotion, AttemptSet, CandidateAssignment, Selection, RuntimeProbe, RuntimeArtifactVersion, RuntimePin, SandboxPolicy in the ADR 0021 shape, IsolationAttestation, ControlledRecord, PersonVerification, ScramEvent, Comment, Resolution, ChangeRequest, Budget, UsageRecord, BudgetReservation, and the Capital Projects hooks); migration `010-workbench` with down script; `services/api/src/workbench.ts`; `services/api/test/workbench.test.ts`. Link columns are generated from each stored body so foreign keys cannot disagree with it; frozen and observed rows are append only; lifecycled rows move only along transitions listed in the database, refused even through raw SQL. Digest vectors for all nine frozen types (`spec/vectors/object-digests.json`) are computed by `tools/generate_object_vectors.py` and checked against the Rust kernel's digest. SandboxPolicy follows the shape proposed in ADR 0021 (PR #18); a later change to that ADR will update this type |
| 1.3 Decision kinds contract | done | `spec/work.tsp` adds PlanDecisionKind (release, methodology, verdict, clearance), VerdictOutcome, DecisionKindMapping and DecisionReading; the signed Decision and DecisionKind are unchanged. Mapping version 1 in `spec/mappings/decision-kinds-v1.json`, read by `services/api/src/decision-kinds.ts`. `app.test.ts` reads every real signed release, accept and return decision: each passkey signature verifies against its stored credential, each reads as the right plan kind, and the stored bytes are identical before and after; the signature challenge stays over the legacy kind. Methodology and clearance arrive with the protected kernel change (6.6) |
| 1.4 Command layer, reader and writer roles | done | Migration `011-roles`: `controlrod_reader` (select only, including sequences) and `controlrod_writer` (no access to `schema_migrations`); migrations run as the owner. `openDb` returns a reader pool pinned to the reader role; `commands/executor.ts` alone holds the writer (`db/writer.ts`) and runs each write as a named command from `commands/catalog.ts`, visible to the database as `controlrod.command`. All 29 write paths converted: routes, the lease sweep timer, run completion and refusal handlers, grant issue, begin, finish and revoke, intake capture, and authentication bookkeeping. Read paths use `readTx` (read only, repeatable read) instead of row locks; `head`, `requirementsSubject` and the preparation guards take a `lock` flag. `test/command-boundary.test.ts`: reader writes refused, writer used only through named commands, writer cannot touch the migration record, static rules (writer import, `tx` import, pool creation, role changes) hold and fail on a synthetic violation, catalog matches executed commands. `docs/commands/inventory.md`, generated by `tools/generate_command_inventory.py`, traces every command to its routes or timer. Also fixed: unhandled errors are now actually logged (the message said they were), and the preparation guard no longer reports database faults as stale preparations. Limitation: pools are pinned to their roles at connection, but the login is the owner, so the static rules are part of the defense; production deployments should connect as separate login roles (follow up with deployment hardening) |

## Exit criteria

Every Phase 0 task is done or waiting on a named owner decision, and every spike has a recorded result or a recorded reason it did not run.

## Source-lineage note

Ledger format follows the platform buildout ledger in this directory.
