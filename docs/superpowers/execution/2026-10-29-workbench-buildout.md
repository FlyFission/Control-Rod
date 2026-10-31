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

Base branch: from task 1.5 on, `buildout/controlled-preparation-20261023` (PR #20 joined the workbench line with the overlay themes there).

| Task | Status | Evidence |
|---|---|---|
| 1.1 Tenancy and people types with storage | done | `spec/tenancy.tsp` (Organization, Member, SignerQualification, AuthenticatorCredential, Delegation, Project, RepoBinding, PolicySet, Machine, OwnershipEnvelope, MarkingEnvelope); migration `009-tenancy` with down script; `services/api/src/tenancy.ts`; `services/api/test/tenancy.test.ts`. Down then up over seeded records leaves every capture, package, run, decision, credential and event byte identical and the chain verifying; frozen versions refuse edits, deletes and version gaps in the database; existing passkeys become credential version 1, ineligible for the hardware floor; new passkeys record their registration evidence. Ownership of records written by pre command layer code comes from a sole active organization trigger that refuses when ownership is ambiguous; task 1.4 replaces it with explicit owners |
| 1.2 Workbench types with storage | done | `spec/workbench.tsp` (Exploration, Workspace, Checkpoint, SourceManifest, Promotion, AttemptSet, CandidateAssignment, Selection, RuntimeProbe, RuntimeArtifactVersion, RuntimePin, SandboxPolicy in the ADR 0021 shape, IsolationAttestation, ControlledRecord, PersonVerification, ScramEvent, Comment, Resolution, ChangeRequest, Budget, UsageRecord, BudgetReservation, and the Capital Projects hooks); migration `010-workbench` with down script; `services/api/src/workbench.ts`; `services/api/test/workbench.test.ts`. Link columns are generated from each stored body so foreign keys cannot disagree with it; frozen and observed rows are append only; lifecycled rows move only along transitions listed in the database, refused even through raw SQL. Digest vectors for all nine frozen types (`spec/vectors/object-digests.json`) are computed by `tools/generate_object_vectors.py` and checked against the Rust kernel's digest. SandboxPolicy follows the shape proposed in ADR 0021 (PR #18); a later change to that ADR will update this type |
| 1.3 Decision kinds contract | done | `spec/work.tsp` adds PlanDecisionKind (release, methodology, verdict, clearance), VerdictOutcome, DecisionKindMapping and DecisionReading; the signed Decision and DecisionKind are unchanged. Mapping version 1 in `spec/mappings/decision-kinds-v1.json`, read by `services/api/src/decision-kinds.ts`. `app.test.ts` reads every real signed release, accept and return decision: each passkey signature verifies against its stored credential, each reads as the right plan kind, and the stored bytes are identical before and after; the signature challenge stays over the legacy kind. Methodology and clearance arrive with the protected kernel change (6.6) |
| 1.4 Command layer, reader and writer logins | done | The application reads as the `controlrod_reader` login and the command executor writes as the `controlrod_writer` login; each belongs to no role and has no special powers, so neither can switch to a stronger one. `db/roles.ts` provisions them for a local install (passwords in `db-roles.json`, mode 0600) or takes administrator issued connection strings; startup verifies both and refuses on any excess power, membership or wrong login. Migration `011-roles` grants: reader reads tables and sequences; writer writes application tables but not `schema_migrations` or the lifecycle rule tables; `PUBLIC` loses `CREATE` on `public`. `commands/executor.ts` alone holds the writer and runs each write as a catalogued command (30 names, visible to the database as `controlrod.command`) through a guarded client that dies with the command and refuses transaction control and role changes. All write paths converted, including the startup backfill (`migration.backfill-tenancy`). Reads use `readTx` snapshots. `test/command-boundary.test.ts` covers every finding of the independent review; the whole suite runs on the reader login; the real server was started on a fresh embedded database and restarted. `docs/commands/inventory.md` (generated) and `docs/commands/database-roles.md`. Also fixed: unhandled errors are logged as the message claims; database faults in the preparation guard surface as faults |
| 1.5 Administrative commands | done | `services/api/src/admin.ts`, routes `GET /admin`, `POST /admin/commands/:name/options` and `POST /admin/commands/:name`. Nineteen commands from specification 10.2: member enroll, suspend, reactivate and remove (delegations and sessions end, last administrator protected); credential revoke (never the last usable passkey; revoked passkeys cannot sign in or sign); qualification issue and revoke (revocation voids that Member's pending challenges); delegation create (only a held role) and revoke; project create, update and set autonomy (level 4 refused, organization ceiling from the policy set); repository bind and unbind; policy propose (change request carrying the proposal) and approve (digest checked, new policy set version); budget set; office theme select (bundled packs only, manifest digest recorded); organization create (refused until the multi organization phase). Direct commands run only with a passkey assertion over the command, caller and exact payload digest; authority is rechecked in the writer transaction. Bootstrap: while no one holds administrator authority, the first Member may issue their own qualification, once. Migration `012-administration` (delegation revocations, `office_theme` mutable); contract additions are optional fields. `test/admin.test.ts`: signatures (missing, other payload, other command, replay), authority refusals, every command's allowed and refused paths, events and chain. No `policies/` file changed: authority lives in the command layer until Cedar (platform expansion program 1). Registration now has three paths only: the first passkey, an administrator's one time invitation for a new person, or adding a passkey to one's own account after signing with an existing one. One organization lock serializes administrative commands and registrations. Independent review: `evidence/reviews/phase-1/admin-adjudication.md` |
| 1.6 Draft compare and swap | done | `PUT /packages/:id` requires `If-Match` with the draft's strong ETag (its content digest, `draftEtag` in `services/api/src/work.ts`): 428 without it, 409 `stale` when it no longer matches, checked under the package row lock after the state checks so the more specific refusals still win. `GET /packages/:id` returns `draft_etag` for drafts (contract `PackageView.draft_etag`, and the update operation declares the header); the response carries the new ETag. The web criteria editor sends the tag it loaded and is read only without one. `test/draft-cas.test.ts`: missing and stale tags, success with a new tag, the old tag refused afterwards, exactly one of two concurrent edits lands, released packages offer no tag |
| 1.7 Disclosure gate | done | `services/api/src/disclosure.ts`: lane admission table (public and internal admit Claude Code, Codex and local runtimes; proprietary, client confidential and restricted admit local runtimes only until question Q-C is answered). A capture made without a lane, or by someone without lane authority, stays unclassified and queues no intake; `POST /captures/:id/classify` (lane authority) classifies or raises a lane, never lowers it, and releases intake once. The claim step offers each run only the runtimes its lane admits (intake by the capture's lane, package runs by `data_lane`) and records why a run waits, once. No kernel change: admission happens in the API's claim selection. The organization's first Member now starts with administrator, lane and policy authority (founding qualification version 1, also granted by the startup backfill on existing installs); licenses, disciplines and signing roles stay theirs to record. The web capture box has a data lane picker (default Internal, visible before sending) and unclassified captures show a Classify action. Tests: `test/disclosure.test.ts`, web lane picker test |

## Exit criteria

Every Phase 0 task is done or waiting on a named owner decision, and every spike has a recorded result or a recorded reason it did not run.

## Source-lineage note

Ledger format follows the platform buildout ledger in this directory.
