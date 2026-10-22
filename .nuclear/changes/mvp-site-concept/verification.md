# Verification: MVP with the site concept job

**Purpose:** Show the evidence for each claim and how independent it is.

**Change slug:** `mvp-site-concept`
**Related basis:** `basis.md`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Verification context

- **Slug:** `mvp-site-concept`
- **Related basis:** `basis.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Verification scope:** claims C-001 to C-014 in `trace.md`, at commit `3f640a1` on `mvp/site-concept`; claims C-015 to C-023 and the revised C-003 (build plan items N1 to N8) at commit `4f7274d`; the owner's two decisions on C-019, and C-024 and C-025 (N9 and the N2 addition), at commit `ed707de`; C-026 (pack files and brief paths, from Codex's third review) at commit `d9cc6dd`.

## Evidence status legend

Use: `pass`, `fail`, `gap`, `deferred`, `not applicable`, `planned`.

## Claim-to-evidence table

| Claim / requirement ID | Verification method | Acceptance criteria | Result status | Evidence link | Gap / follow-up |
|---|---|---|---|---|---|
| C-001 | Kernel tests; API tests | Non-human decisions refused; release refused without a passkey, with a replayed assertion, with the wrong decision kind, from a foreign origin and with a forged signature; acceptance bound to the subject digest | pass | `kernel/src/`, `services/api/test/app.test.ts` | None. |
| C-002 | Kernel tests | Agent actions outside claim, submit, pre-check and revise refused with `NotHuman` or `WrongState` | pass | `kernel/src/transition.rs` | None. |
| C-003 | Kernel tests; API tests | Same baseline refused with `NotIndependent`; same runtime identity refused without an owner override; pre-check claim has a different baseline, a different runtime and no author log | pass | `kernel/src/transition.rs`, `services/api/test/app.test.ts`, `services/api/test/runs.test.ts` | Kernel edit needs the owner's signature. |
| C-004 | Kernel tests | `MissingPreCheck` and `ReasonRequired` raised | pass | `kernel/src/decision.rs` | None. |
| C-005 | API tests | Refusal without a session; daemon refused on people routes; people refused on runner routes; daemon can never decide | pass | `services/api/test/app.test.ts` | None. |
| C-006 | API test | Chain verifies; update and delete on events refused | pass | Same | None. |
| C-007 | API tests | Unknown field refused; dependent package not claimable until its dependency is accepted | pass | Same | None. |
| C-008 | API tests | Return creates a new revision with the direction in its brief; revise loop carries findings | pass | Same | None. |
| C-009 | Live browser run | Five site packages released and accepted with real `cr-site` tools, live FEMA, USFWS, USGS, HIFLD, EIA and Census queries, a CADCraft plan, and `cr-site check` passing | pass | E-005 | Run script not committed. |
| C-010 | Site pack tests | All pass on the committed tree | pass | `packs/capital-projects/site-concept/tests` | 39 passed, 1 skipped. An earlier run failed because `cr_site/data/county_registry.yaml` was ignored and absent; fixed in `3f640a1`. |
| C-011 | License gate | Every shipped dependency on the allowlist | pass | `tools/license-gate.mjs` | Owner signature on the `Unlicense` addition. |
| C-012 | First real run | Claude Code run follows the floors | planned | none yet | Owner's Mac. |
| C-013 | Daemon tests | Runner claims, runs and reports; digest vectors match | pass | `daemon/internal/runner`, `daemon/internal/digest` | Real runtimes untested (C-012). |
| C-014 | Web tests | App views render and call the API as specified | pass | `apps/web` | UI gaps listed in `ship.md`. |
| C-015 | Daemon tests; API test | Exact Codex and Claude argument lists; network flag only with the directive; pre-check TOOLS has no directive | pass | `daemon/internal/runner/launch_test.go`, `services/api/test/runs.test.ts` | No real Codex run yet. |
| C-016 | API, daemon and web tests | Token and lease issued; log renews; foreign token refused; lapsed lease gives `lost` in the run, office and package view; late log and completion refused; daemon and people other than the owner cannot requeue; heartbeats sent while quiet | pass | `services/api/test/runs.test.ts`, `daemon/internal/runner/custody_test.go`, `apps/web/src/components/components.test.tsx` | None. |
| C-017 | API and daemon tests | Same key returns the same receipt; other key refused; missing outcome, unsafe name and invalid trace each leave the run failed with the reason and an event; daemon retries with one key, replays the outbox at start, never retries a refusal | pass | Same | None. |
| C-018 | API test | Empty author run is failed, package stays in work, no pre-check queued, office says why | pass | `services/api/test/runs.test.ts` | None. |
| C-019 | Kernel, API and web tests | Pre-check held with the plain reason and an office item; Opus checking Sonnet (same provider) refused without the override; override needs the owner, a reason and a passkey over its digest; refused without an assertion, with a replayed one, with a swapped reason, and from the daemon; override event carries the assertion; verification record shows shared runtime with the override; another provider is recorded independent | pass | `kernel/src/transition.rs`, `services/api/test/runs.test.ts`, `apps/web/src/components/components.test.tsx` | Kernel edit needs the owner's signature. |
| C-020 | API, daemon and web tests | Stop recorded first; log reply carries stop; daemon kills and completes as stopped; repeat is a no-op; queued run stops at once; an unasked stop report is recorded failed; UI shows stopping | pass | Same | Stop lands within one heartbeat (up to 30 s). |
| C-021 | API test | Changed bytes refused with `output-changed` and an `output.mismatch` event | pass | `services/api/test/runs.test.ts` | None. |
| C-022 | API tests | Foreign origin, other localhost port, `null`, cross-site, same-site and unmarked requests refused; own origin and same-origin fetch accepted; runner route unaffected | pass | `services/api/test/runs.test.ts` | None. |
| C-023 | Daemon and API tests | Trace carries mode, models, tools and sandbox and passes the schema; reported model read only from the runtime's own fields; mismatch event | pass | `daemon/internal/runner/launch_test.go`, `services/api/test/runs.test.ts` | None. |
| C-024 | Daemon, API and web tests | Broken `--version` not ready; Codex logged out not ready; no status subcommand reported as not checked; probe runs only `--version`, `login --help` and `login status`; daemon offers only ready runtimes and reports all; control plane drops a runtime reported not ready; office shows it with the reason | pass | `daemon/internal/runner/probe_test.go`, `services/api/test/runs.test.ts`, `apps/web/src/components/components.test.tsx` | Real Codex CLI not checked here. |
| C-025 | API test | Duplicate live run insert refused by `runs_one_live`; a requeue in a race window gets the live run back and queues nothing new | pass | `services/api/test/runs.test.ts` | None. |
| C-026 | API tests; pack tests; scripted author | A site-charter author job carries `inputs/pack/templates/charter.md` and `inputs/pack/typicals/data-center-50mw.json`, and the scripted author fills `out/charter.md` from them on the real job layout; a site-parcel pre-check gets the stage brief and a site-plan pre-check the full check; the brief lint finds no `in/` path, no missing `inputs/pack/` file and no author reading a dependency from `out/` | pass | `services/api/test/runs.test.ts`, `packs/capital-projects/site-concept/tests/test_briefs.py`, `tests/e2e/fake/author.sh` | Confirm on the first real site run. |

## Verification type guide

| Type | Used here |
|---|---|
| Deterministic checks | C-001 to C-008, C-010, C-011, C-013, C-014 |
| End-to-end run | C-009 |
| Human review | Owner review and signature |
| First real use | C-012 |

## Evidence custody and coupling

The contracts, kernel, control plane, daemon, web app, site pack, tests and this packet were written by AI agents in one session under the owner's direction, and agents of the same family ran the tests. This record says so plainly. The writer of this packet reran the kernel, daemon, web and site pack suites from the merged tree; the orchestrating agent, also Claude, reran the control plane suite against a throwaway system PostgreSQL cluster: 14 passed.

### Custody record

| Evidence ID | Claim ID | Decisive? | Artifact / raw result | Change actor | Generated by | Selected by | Transformed / summarized by | Executed / captured by | Retained by | Presented by | Verified / witnessed by |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E-001 | C-001 / C-002 / C-003 / C-004 | yes | `cargo test -p controlrod-kernel` on 2026-10-22: `test result: ok. 16 passed; 0 failed`; doc tests 0 | AI agents (Claude) under owner direction | same agent family wrote the kernel and its tests | same family chose the cases | packet writer summarized here | packet writer reran from the merged tree | git branch `mvp/site-concept` (tests); run output not committed | packet writer | owner review and signature planned |
| E-002 | C-001 / C-003 / C-005 / C-006 / C-007 / C-008 | yes | Control plane suite against a real Postgres: 14 tests pass | AI agents (Claude) under owner direction | same family wrote the control plane and the tests | same family chose the cases | packet writer summarized here | rerun on 2026-10-22 by the orchestrating agent: 14 passed | git branch `mvp/site-concept` (tests); run output not committed | packet writer | real Postgres and a real WebAuthn library, both independent of the builder; owner review planned |
| E-003 | C-013 | yes | `go test -count=1 -v ./...` on 2026-10-22: `digest` and `runner` packages ok, 15 tests and subtests pass | AI agents (Claude) under owner direction | same family | same family | packet writer | packet writer reran | git branch `mvp/site-concept` (tests) | packet writer | owner review planned |
| E-004 | C-010 | yes | `uv run pytest -q` on 2026-10-22: 39 passed, 1 skipped (`CADCRAFT_CLI not set`) at `3f640a1`; the first run had 1 failure from the missing registry file | AI agents (Claude) under owner direction | same family | same family | packet writer | packet writer reran | git branch `mvp/site-concept` (tests) | packet writer | the earlier failure showed the tree differed from the builder's worktree; the rerun is on the committed tree |
| E-005 | C-009 | yes | Live browser run in Chromium with a virtual passkey: five site packages released and accepted, live public sources queried, plan drawn, `cr-site check` passing, 76 s total | AI agents (Claude) under owner direction | same family wrote the code and drove the browser | same family chose the parcel and steps | builder summarized; packet writer recorded | builder agent | not committed | packet writer | live public services and Chromium's authenticator are independent of the builder; owner review planned |
| E-006 | C-011 | yes | License gate passes with `Unlicense` added for `isbot` (via TanStack Router) | AI agents (Claude) under owner direction | same family | same family | packet writer | builder agent | git branch `mvp/site-concept` (gate) | packet writer | owner signature planned |
| E-007 | C-014 | yes | `pnpm --filter @control-rod/web test` on 2026-10-22: 2 files, 17 tests pass | AI agents (Claude) under owner direction | same family | same family | packet writer | packet writer reran | git branch `mvp/site-concept` (tests) | packet writer | owner review planned |
| E-008 | C-003 / C-019 | yes | `cargo test -p controlrod-kernel` at `4f7274d`: 18 passed; `cargo clippy --all-targets --locked -- -D warnings` clean; WebAssembly binding rebuilt with `scripts/build-kernel-wasm.sh` | AI agent (Claude) under owner direction | same agent wrote the rule and its tests | same agent | same agent | same agent | git branch `mvp/site-concept` (tests, binding) | same agent | owner signature on `kernel/src/transition.rs` planned |
| E-009 | C-003 / C-015 / C-016 / C-017 / C-018 / C-019 / C-020 / C-021 / C-022 / C-023 | yes | Control plane suite at `4f7274d` against a throwaway system PostgreSQL cluster run as a non-root user: 2 files, 29 passed | AI agent (Claude) under owner direction | same agent | same agent | same agent | same agent | git branch `mvp/site-concept` (tests) | same agent | real Postgres and a real WebAuthn library; owner review planned |
| E-010 | C-015 / C-016 / C-017 / C-020 / C-023 | yes | `go test -count=1 -v ./...` in `daemon/` at `4f7274d`: 26 tests pass; `gofmt` and `go vet` clean | AI agent (Claude) under owner direction | same agent | same agent | same agent | same agent | git branch `mvp/site-concept` (tests) | same agent | owner review; first real run planned |
| E-011 | C-016 / C-019 / C-020 | yes | `pnpm --filter @control-rod/web test` at `4f7274d`: 2 files, 22 passed; `pnpm -r typecheck` clean; `cargo deny check licenses bans sources` ok | AI agent (Claude) under owner direction | same agent | same agent | same agent | same agent | git branch `mvp/site-concept` (tests) | same agent | owner review planned |
| E-012 | C-019 | yes | `cargo test -p controlrod-kernel` at `ed707de`: 19 passed; clippy clean; WebAssembly binding rebuilt | AI agent (Claude) under owner direction | same agent wrote the rule and its tests | same agent | same agent | same agent | git branch `mvp/site-concept` (tests, binding) | same agent | owner signature on `kernel/src/transition.rs` planned |
| E-013 | C-019 / C-024 / C-025 | yes | Control plane suite at `ed707de` against a throwaway system PostgreSQL cluster run as a non-root user: 2 files, 31 passed, with the virtual authenticator for the override | AI agent (Claude) under owner direction | same agent | same agent | same agent | same agent | git branch `mvp/site-concept` (tests) | same agent | real Postgres and a real WebAuthn library; owner review planned |
| E-014 | C-024 | yes | `go test -count=1 -v ./...` in `daemon/` at `ed707de`: 29 passed; `gofmt` and `go vet` clean | AI agent (Claude) under owner direction | same agent | same agent | same agent | same agent | git branch `mvp/site-concept` (tests) | same agent | real Codex CLI check on the Mac planned |
| E-015 | C-019 / C-024 | yes | `pnpm --filter @control-rod/web test` at `ed707de`: 2 files, 23 passed; `pnpm -r typecheck` clean; `cargo deny check licenses bans sources` ok | AI agent (Claude) under owner direction | same agent | same agent | same agent | same agent | git branch `mvp/site-concept` (tests) | same agent | owner review planned |
| E-016 | C-014 | yes | Fixes for four Codex review findings on PR #3 (stale page could sign newer draft content; reject had no reason prompt; intake draft inserted twice; outputs in subfolders unreachable). Control plane suite: 34 passed, including 3 new cases; web: 26 passed, including 3 new cases; `pnpm -r typecheck` clean | AI agent (Claude) under owner direction | Codex review bot found the defects; the orchestrating agent wrote fixes and tests | orchestrating agent | orchestrating agent | orchestrating agent | git branch `mvp/site-concept` (tests) | orchestrating agent | an outside reviewer (Codex) found the defects |
| E-017 | C-010 / C-014 | yes | Fixes for the second Codex review of PR #3: agent outputs served in a script-free sandbox (and output links now open the file, where they used to open the app); site pre-check role writes `out/verification.json`, the file the completion path reads; the setback check measures against the whole parcel boundary so multipart parcels work; a major layout finding fails the check. Fourth review: the check reruns `cr-site layout` on the same inputs and fails a layout that differs; long inline WKT is parsed as text. Site pack then 65 passed, 1 skipped. Site pack: 41 passed, 1 skipped (the two new tests fail on the old code); control plane: 35 passed; web: 26 passed | AI agent (Claude) under owner direction | Codex review bot found the defects; the orchestrating agent wrote fixes and tests | orchestrating agent | orchestrating agent | orchestrating agent | git branch `mvp/site-concept` (tests) | orchestrating agent | an outside reviewer (Codex) found the defects |
| E-018 | C-026 | yes | At `d9cc6dd`: control plane suite 37 passed (system PostgreSQL, non-root user); site pack `uv run pytest -q` 63 passed, 1 skipped, `ruff check` and `ruff format --check` clean; web 27 passed; kernel 19, daemon 29, typecheck and deny clean | Codex (third review) found the gap; the coordinator traced it in the code; AI agent (Claude) fixed it under owner direction | the fixing agent wrote the code and tests | the coordinator chose what to test from Codex's findings | the fixing agent | the fixing agent | git branch `mvp/site-concept` (tests) | the fixing agent | Codex's review is a separate model family; owner review and the first real run planned |

### Coupling profile

| Evidence ID | Actor | Context | Mechanism | Authority | Resource | Classification | Admissibility / residual-risk disposition |
|---|---|---|---|---|---|---|---|
| E-001 | coupled: the change actor wrote the kernel and its tests | coupled: no verifier rebuilt the cases from a separate brief | partially separated: deterministic Rust tests | partially separated: the owner sets the floors and holds the signature | coupled: one workspace ran, stored and reported | self-check | Admitted with the owner's signature on the kernel edits, per `ship.md#residual-risks-and-gaps`. |
| E-002 | coupled: the change actor wrote the routes and tests | coupled: same session | partially separated: real Postgres and a real WebAuthn library | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted; rerun by an agent of the same family, carried in `ship.md#residual-risks-and-gaps`. |
| E-003 | coupled: the change actor wrote the daemon and its tests | coupled: same session | partially separated: deterministic Go tests | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted; the first real run is the further check, per `ship.md#residual-risks-and-gaps`. |
| E-004 | coupled: the change actor wrote the tools and tests | coupled: same session | partially separated: deterministic tests run from the committed tree | partially separated: owner holds merge | coupled: one workspace | self-check | Not admitted as passing; the failure blocks merge per `ship.md#residual-risks-and-gaps`. |
| E-005 | coupled: the change actor drove the run | coupled: same session | partially separated: live public services and Chromium's virtual authenticator | partially separated: owner holds merge | coupled: run artifacts kept in the workspace only | self-check | Admitted for a reversible, single-user build; the owner's first real run is the independent check, per `ship.md#residual-risks-and-gaps`. |
| E-006 | coupled: the change actor edited the gate | coupled: same session | partially separated: licenses read from package metadata | partially separated: the allowlist comes from ADR 0002 and needs the owner's signature | coupled: one workspace | self-check | Admitted after the owner signs the gate change, per `ship.md#release-decision`. |
| E-007 | coupled: the change actor wrote the app and its tests | coupled: same session | partially separated: deterministic tests | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted; UI gaps carried in `ship.md#residual-risks-and-gaps`. |
| E-008 | coupled: the change actor wrote the rule and its tests | coupled: same session | partially separated: deterministic Rust tests | partially separated: owner holds the signature on the kernel edit | coupled: one workspace | self-check | Admitted only with the owner's signature on `kernel/src/transition.rs`, per `ship.md#release-decision`. |
| E-009 | coupled: the change actor wrote the routes and tests | coupled: same session | partially separated: real Postgres | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted; first real run on the owner's Mac is the further check, per `ship.md#residual-risks-and-gaps`. |
| E-010 | coupled: the change actor wrote the daemon changes and tests | coupled: same session | partially separated: deterministic Go tests against a fake control plane | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted; Codex flags still need one real run, per `ship.md#residual-risks-and-gaps`. |
| E-011 | coupled: the change actor wrote the app changes and tests | coupled: same session | partially separated: deterministic tests | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted, per `ship.md#residual-risks-and-gaps`. |
| E-012 | coupled: the change actor wrote the rule and its tests | coupled: same session | partially separated: deterministic Rust tests | partially separated: owner holds the signature on the kernel edit | coupled: one workspace | self-check | Admitted only with the owner's signature on `kernel/src/transition.rs`, per `ship.md#release-decision`. |
| E-013 | coupled: the change actor wrote the routes and tests | coupled: same session | partially separated: real Postgres and a real WebAuthn library | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted, per `ship.md#residual-risks-and-gaps`. |
| E-014 | coupled: the change actor wrote the probe and its tests | coupled: same session | partially separated: deterministic Go tests with scripted CLI answers | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted; the real Codex CLI is checked on the Mac, per `ship.md#residual-risks-and-gaps`. |
| E-015 | coupled: the change actor wrote the app changes and tests | coupled: same session | partially separated: deterministic tests | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted, per `ship.md#residual-risks-and-gaps`. |
| E-016 | partially separated: a different vendor's reviewer found the defects; the fixes and tests are ours | coupled: same session | partially separated: deterministic tests | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted, per `ship.md#residual-risks-and-gaps`. |
| E-017 | partially separated: a different vendor's reviewer found the defects; the fixes and tests are ours | coupled: same session | partially separated: deterministic tests | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted, per `ship.md#residual-risks-and-gaps`. |
| E-018 | partially separated: Codex, a different model family, found the gap; Claude wrote the fix and its tests | partially separated: the coordinator traced the findings in a separate context from the fixing agent | partially separated: deterministic tests, a brief lint and the scripted author run on the real job layout | partially separated: owner holds merge | coupled: one workspace | self-check | Admitted; the first real site run on the owner's Mac is the further check, per `ship.md#residual-risks-and-gaps`. |

- **Evidence pattern used:** agent-written deterministic suites, a real database and WebAuthn library, live public services, and a browser run with a virtual authenticator.
- **Verdict owner:** Ben Huffer.
- **Apply-clearance owner:** Ben Huffer, by signing and merging.
- **Minimum profile required by the consequence:** disclosure, reproducibility from the committed tree, owner signature on trust surfaces, and a first real run by the owner.
- **Unmet separation carried into `ship.md`:** actor, context and resource axes are coupled for E-001 to E-015; E-016, E-017 and E-018 are partially separated on the actor axis.

## Commands, evals, and reviews

| Method | Command / review / eval | Environment | Result | Evidence link |
|---|---|---|---|---|
| Kernel | `cargo test -p controlrod-kernel` | Linux container | 16 passed, 0 failed | E-001 |
| Control plane | `pnpm --filter @control-rod/api test` with `TEST_DATABASE_URL` or a system PostgreSQL | Node 22, PostgreSQL 16 | 14 passed (builder run) | E-002 |
| Daemon | `PATH=/usr/local/go/bin:$PATH go test -count=1 -v ./...` in `daemon/` | Go, Linux container | 15 tests and subtests pass | E-003 |
| Web | `pnpm --filter @control-rod/web test` | Node 22, Vitest | 17 passed in 2 files | E-007 |
| Site pack | `uv run pytest -q` in `packs/capital-projects/site-concept` | Python 3.13 | 38 passed, 1 skipped, 1 failed | E-004 |
| Live run | Chromium with a virtual passkey through the web app | Linux container, live internet | 5 of 5 packages accepted in 76 s | E-005 |
| Kernel (N4) | `cargo test -p controlrod-kernel`; `cargo clippy --all-targets --locked -- -D warnings`; `scripts/build-kernel-wasm.sh` | Linux container | 18 passed; clippy clean; binding rebuilt | E-008 |
| Control plane (N1 to N8) | `su postgres -s /bin/bash -c "cd services/api && HOME=<throwaway> npx vitest run"` (system PostgreSQL needs a non-root user) | Node 22, PostgreSQL 16 | 29 passed in 2 files | E-009 |
| Daemon (N1, N2, N5, N8) | `go test -count=1 -v ./...` in `daemon/` | Go, Linux container | 26 passed | E-010 |
| Web and types (N2, N4, N5) | `pnpm --filter @control-rod/web test`; `pnpm -r typecheck`; `cargo deny check licenses bans sources` | Node 22 | 22 passed; typecheck clean; deny ok | E-011 |
| Owner decisions, N9, N2 addition | kernel, control plane, daemon, web, typecheck and deny as above | Linux container | kernel 19; control plane 31; daemon 29; web 22 then 23; all clean | E-012, E-013, E-014, E-015 |
| Codex review findings on PR #3 | control plane and web suites, typecheck | Linux container | control plane 34; web 26; clean | E-016 |
| Second Codex review on PR #3 | site pack, control plane and web suites, typecheck, ruff | Linux container | site 41 + 1 skipped; control plane 35; web 26; clean | E-017 |
| Pack files and brief paths | control plane suite; `uv run pytest -q`, `uv run ruff check .`, `uv run ruff format --check .` in the site pack; web; kernel; daemon; typecheck; deny | Linux container | 37; 63 passed, 1 skipped, clean; 27; 19; 29; clean | E-018 |
| Packet | `ng.py validate --strict-custody` | Python 3.13 | pass | this packet |

## Negative / failure-mode checks

| Failure mode | Check performed | Result | Evidence link |
|---|---|---|---|
| Daemon tries to decide | Daemon token on a decision route | pass; refused | E-002 |
| Replayed or forged passkey assertion | Reused assertion; altered signature; foreign origin; wrong decision kind | pass; each refused | E-002 |
| Decision without a passkey | Release with no assertion | pass; refused | E-002 |
| Pre-check with the author's baseline | Same baseline | pass; refused with `NotIndependent` | E-001 |
| Acceptance without a pre-check | Accept with none | pass; refused with `MissingPreCheck` | E-001 |
| History rewritten | Update and delete on events | pass; refused by trigger | E-002 |
| Unknown request field | Extra field in a request | pass; refused | E-002 |
| Fresh checkout differs from builder | Site pack suite from the merged tree | fail; county registry missing | E-004 |
| Pre-check on the author's runtime | Only the author's runtime offered | pass; held with the reason; kernel refuses without an override | E-008, E-009 |
| Daemon dies mid-run | Lease forced to lapse | pass; run lost, shown, late completion refused | E-009 |
| Lost completion reply | Same completion sent twice | pass; same receipt, applied once | E-009, E-010 |
| Refusal while applying a completion | Missing outcome, unsafe name, invalid trace | pass; run failed with the reason, nothing echoed | E-009 |
| Foreign or stale claim token | Other token on log and completion | pass; refused, run unchanged | E-009 |
| Cross-origin or other-port page uses the cookie | Origin and Sec-Fetch-Site variants | pass; refused | E-009 |
| Stored output bytes changed | Bytes edited in the database | pass; refused and logged | E-009 |
| Override without a passkey, replayed, or over another reason | Bare, reused and swapped assertions | pass; refused | E-013 |
| A different model from the same provider as the checker | Opus checking Sonnet | pass; refused without the override | E-012 |
| Installed but broken or signed-out runtime | Scripted probe answers | pass; not offered, shown in the office | E-014, E-013, E-015 |
| The same assignment queued twice | Duplicate insert; requeue race | pass; one live run | E-013 |

## AI-assisted work checks

- **AI scope:** agents wrote all code, tests, role briefs, templates and this packet under the owner's direction.
- **Model/tool used:** Claude in a cloud workspace, with parallel builder agents on separate branches.
- **Permissions/actions allowed:** local edits, builds, tests, a local browser and local commits. No push or merge.
- **Independent checks performed:** real Postgres, a real WebAuthn library, Chromium's virtual authenticator and live public services; owner review planned.
- **Hallucination/slop screening:** test counts above were copied from command output on 2026-10-22, except E-002 and E-005, which come from the builder's runs in the same session. E-008 to E-011 were copied from the fixer's own runs at `4f7274d`, E-012 to E-015 at `ed707de`, and E-018 at `d9cc6dd`.
- **Human approval gates exercised:** the owner chose General first, the Mac Studio target, core floors only, and the BaseMark site job; the owner holds signature and merge.

## Security / dependency / supply-chain checks

- **Dependency review:** license gate passes; `Unlicense` added and held for signature.
- **SBOM/provenance/build evidence:** lockfiles committed (`pnpm-lock.yaml`, `uv.lock`, `Cargo.lock`, `go.sum`); CADCraft built from a pinned commit.
- **Vulnerability/security review:** not performed beyond the floor tests (gap). The control plane binds to `127.0.0.1`, the daemon token file is owner read-only, and the fake runtime needs `CONTROLROD_ALLOW_FAKE=1`.
- **Revalidation trigger:** any dependency version change, a network listener, or a second user.

## Required links

- `risk.md`, `basis.md`, `plan.md`, `trace.md`, `ship.md`
- Implementation: branch `mvp/site-concept`

## Exit criteria

- Each claim has a status.
- Evidence is linked, and long logs stay out of the record.
- Gaps are carried into `ship.md`.

## Source-lineage note

Verification and custody structure follow nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
