# Basis: MVP with the site concept job

**Purpose:** State what must stay true for the owner to trust the first build with real site work.

**Change slug:** `mvp-site-concept`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `mvp-site-concept`
- **Related risk record:** `risk.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Decision this basis supports:** whether branch `mvp/site-concept` can merge as the first build the owner runs for BaseMark work.

## Mission / need

The owner wants to hand a parcel and a facility type (first case: a 50 MW data center) to agents and get back a site concept package: parcel and plat, constraints from public data, a site charter, a site plan drawing and next-stage scope. It has to be more useful than typing the same request into a chatbot or running agents on a plain board. The difference this build must show: agents cannot sign off their own work, an independent pre-check sees only the output, every number comes from a tool, and every step lands on a record nobody can quietly edit.

## Protected outcomes

| Protected outcome | Why it matters | Evidence needed |
|---|---|---|
| Only a human with a verified passkey over the matching subject digest can release, accept, return or reject. | Agents and the daemon must never sign off work, and a decision must bind to what the person saw. | Kernel transition tests; API refusals for missing, replayed, wrong-kind, foreign-origin and forged assertions; acceptance bound to the digest. |
| Agents can only claim, submit output, submit a pre-check or revise. | Keeps agent authority inside the floors. | Kernel tests for `NotHuman` and `WrongState`. |
| The pre-check is independent of the author. | A check written with the author's context repeats the author's mistakes. | Kernel `NotIndependent` on the same baseline or the same runtime identity (provider and model) without a recorded owner override; API tests that a pre-check is held rather than run on the author's runtime, that it gets no author log, and that an override shows on the verification record. |
| Acceptance needs a pre-check, and a non-pass pre-check needs a written reason. | No package is accepted unchecked or over an unexplained finding. | Kernel `MissingPreCheck` and `ReasonRequired`. |
| The record is append-only and verifiable. | Lets anyone confirm nothing was rewritten. | Hash chain verifies; update and delete on events are refused. |
| Site numbers come from tools with recorded inputs. | AGENTS.md rule 5: no engineering number is typed by a model. | `cr-site` tool tests; live run with real public sources and a passing `cr-site check`. |
| Only permissive licenses ship. | Open-core license plan. | License gate passes; `Unlicense` addition signed by the owner. |
| A run's custody is never ambiguous. | A dead daemon, a lost reply or a refused completion must not leave work looking busy, applied twice or quietly dropped. | Claim token and lease; lost runs swept and shown; idempotent completion with a stored receipt; refusals recorded as failed runs with the reason; daemon outbox; owner-only requeue and stop. |

## Unacceptable outcomes

| Unacceptable outcome | Consequence | Prevent / detect / mitigate |
|---|---|---|
| The daemon or an agent releases or accepts a package. | Unreviewed work treated as approved. | Kernel refuses non-human decisions; daemon token refused on people routes; tested. |
| A decision applies to a newer revision than the one reviewed. | The owner approves content he never saw. | Assertion challenge binds digest, kind, revision and a nonce; acceptance checks the digest. |
| An event is edited or deleted. | The record lies. | Database trigger refuses update and delete; chain verify route. |
| A site package states a setback, area or capacity no tool produced. | A wrong number reaches a siting decision. | Role briefs require `cr-site` outputs; holds are written as holds; owner review. |
| A pre-check runs on the author's runtime without anyone choosing that. | The check shares the author's blind spots and the record overstates independence. | Pre-check held with a plain reason; kernel refuses a shared runtime without an owner override; the override is an event and sits on the verification record. |
| A run whose daemon died stays "running" forever, or a retried completion is applied twice. | The owner waits on work nobody is doing, or a package moves on a duplicate. | Lease and sweep to `lost`; completion keyed and idempotent; stale or foreign token refused. |
| A fresh checkout misses files a builder had locally. | The owner's first run fails or behaves differently. | Run every suite from the committed tree; the ignored county registry is the current case. |

## Assumptions, constraints, and invalidation triggers

| Assumption / constraint | Basis or source | Invalidation trigger | Owner |
|---|---|---|---|
| Scripted agents exercise the same routes and floors real runtimes will. | Daemon uses one runner path for all runtimes. | First real Claude Code or Codex run on the owner's Mac. | Ben Huffer |
| Public services (FEMA, USFWS, USGS, HIFLD, EIA, Census) answer as they did on 2026-10-22. | Live run on that date. | Any service change or outage; tools report the failure as a hold. | Ben Huffer |
| One user on `127.0.0.1` needs no policy engine. | Non-goal for MVP. | A second user or a network listener. | Ben Huffer |
| Program sizes for the facility are owner-set. | Example values appear in tests only. | The owner supplies real program values. | Ben Huffer |
| Embedded Postgres works on macOS. | Package supports macOS; Linux build needs `libicu60`. | Owner's first `pnpm cr start`. | Ben Huffer |

## Grounding status

| Claim area | Grounded in | Status |
|---|---|---|
| Floors | Kernel reason codes and tests; ADR 0013 identity | pass |
| Passkey verification | `@simplewebauthn/server` 14.0.3 with a software authenticator in tests and a Chromium virtual authenticator live | pass |
| Public data sources | Live queries on 2026-10-22 | pass |
| Real agent runtimes | none yet | planned |
| Codex launch flags | `codex exec --help` on Codex 0.163.0, read by the orchestrating agent on 2026-10-22; argument lists tested in the daemon | pass by reading; no real Codex run yet |

## Interfaces and trust boundaries

- **Internal interfaces affected:** contracts in `spec/`, kernel binding, control plane routes, daemon runner API.
- **External services/APIs affected:** FEMA NFHL, USFWS NWI, USGS, HIFLD, EIA and Census services, read only, from `cr-site`.
- **Data classes affected:** the owner's parcels and site packages, stored locally.
- **Human approval boundaries:** release, accept, return and reject need the owner's passkey over the subject digest.
- **AI/model/tool authority boundaries:** agents claim, submit output, pre-check and revise; tool allowlist per role; the fake runtime runs only when `CONTROLROD_ALLOW_FAKE=1`.

## Dependency / model / supplier intended use

| Dependency/model/service | Intended use | Consequence if wrong/unavailable/compromised | Evidence or compensating control | Revalidation trigger |
|---|---|---|---|---|
| `@simplewebauthn/server` 14.0.3 | Passkey registration and assertions | Forged or replayed decisions | API refusal tests | Version change |
| wasm-bindgen 0.2.104 | Kernel binding for the control plane | Floors differ between Rust and Node | Control plane calls the kernel for every transition; API tests | Version change |
| Fastify, pg, TanStack, React | Control plane and web app | Outage or wrong behavior | Test suites; license gate | Version change |
| CADCraft `e4214f7` | Site plan drawing | Wrong or missing sheet | ADR 0018 checks; `cr-site check` | Any upgrade |
| Public GIS services | Constraint data | Missing or stale constraints | Failures become holds with the source named | Each run |

## Derived requirements or claims

| ID | Requirement / claim | Basis | Design feature or control | Evidence planned |
|---|---|---|---|---|
| C-001 | Only a human with a verified passkey over the matching subject digest can release, accept, return or reject. | Protected outcome 1 | Kernel decision rules; signed challenge over digest, kind, revision and nonce | Kernel tests; API tests |
| C-002 | Agents can only claim, submit output, submit a pre-check or revise. | Protected outcome 2 | Kernel transition table | Kernel tests |
| C-003 | The pre-checker runs on a different baseline and a different runtime identity from the author, or on the same runtime only after a recorded owner override, and never receives the author's log. | Protected outcome 3 | Kernel `NotIndependent` with runtime identity; claim hold; claim payload | Kernel and API tests |
| C-004 | Acceptance needs a pre-check, and a non-pass pre-check needs a written reason. | Protected outcome 4 | Kernel `MissingPreCheck`, `ReasonRequired` | Kernel tests |
| C-005 | People and the daemon cannot use each other's routes, and nothing acts without a session. | Protected outcome 1 | Route guards in `app.ts` | API tests |
| C-006 | The event log is hash-chained and refuses update and delete. | Protected outcome 5 | Chain in `events.ts`; database trigger | API test |
| C-007 | Requests with unknown fields are refused, and dependencies gate claims. | Contracts are the source of truth | Schemas generated from `spec/`; dependency check in `work.ts` | API tests |
| C-008 | A return creates a new revision with the direction in the brief, and a revise loop carries findings. | Protected outcome 4 | `work.ts` | API tests |
| C-009 | A full site job runs in a browser: five packages released and accepted with real tools and live public data, a drawn plan and a passing plan check. | Protected outcome 6 | `cr-site`, site roles, scripted agents | Live browser run |
| C-010 | The site tools compute parcel, plat, constraints, layout and plan checks from recorded inputs. | Protected outcome 6 | `cr-site` | Site pack tests |
| C-011 | Shipped dependencies use permissive licenses. | Protected outcome 7 | `tools/license-gate.mjs` | License gate |
| C-012 | Real Claude Code and Codex runs follow the same floors. | Assumption 1 | Same runner path | First run on the owner's Mac |
| C-013 | The daemon claims eligible jobs, runs the role's runtime in a workspace and reports the trace; the fake runtime runs only with `CONTROLROD_ALLOW_FAKE=1`. | Protected outcome 2 | `daemon/internal/runner` | Daemon tests |
| C-014 | The web app lets the owner sign in, capture, review packages and decide with a passkey. | Protected outcome 1 | `apps/web` | Web tests; live browser run |
| C-015 | Codex runs start with a workspace-write sandbox rooted at the run workspace and skip the repository check; network inside the sandbox only for author runs of roles whose tools ask for it. | Assumption 1 | `CodexArgs`, `network: on` directive, site role tools files | Daemon and API tests |
| C-016 | Each claimed run carries a claim token and a lease renewed by log posts; a lapsed lease marks the run lost with the reason, shown in the office and package view; only the owner can requeue it. | Protected outcome 8 | `startRun`, `runLog`, `sweepLost`, `requeueRun`; daemon heartbeat | API, daemon and web tests |
| C-017 | Completion presents the claim token and an idempotency key: a repeat returns the stored receipt, a stale or foreign token is refused, a refusal while applying leaves the run failed with the reason, an invalid trace is refused with a reason, and the daemon keeps completions in an outbox and retries with backoff. | Protected outcome 8 | `complete`, `recordRefused`; daemon `Outbox`, `Handle` | API and daemon tests |
| C-018 | An author run with no output is recorded failed with a reason and never advances the package. | Protected outcome 4 | `applyCompletion` | API test |
| C-019 | A pre-check whose only available runtime is the author's is held with a plain reason; the owner may proceed with a written override that is recorded and shown on the verification record. | Protected outcome 3 | `pickChecker`, `overrideIndependence`, verification `independence` block, `pnpm cr doctor` text | Kernel, API and web tests |
| C-020 | The owner can stop a run: recorded first, the daemon told in its log reply and kills the process, shown as stopping until confirmed, and repeating is harmless. | Protected outcome 8 | `stopRun`; daemon `flushLoop` | API, daemon and web tests |
| C-021 | Outputs are re-hashed when served; a mismatch is refused and logged. | Protected outcome 5 | `packageOutput` | API test |
| C-022 | Cookie-authenticated state changes need an allowed Origin, or a same-origin or none Sec-Fetch-Site; runner routes are left to the token. | Protected outcome 1 | `onRequest` hook in `app.ts` | API tests |
| C-023 | The trace records runtime mode, requested and reported model, permission mode, tool list and sandbox; a model the run did not ask for raises an event; ADR 0020 records print mode with ACP deferred. | Protected outcome 5 | `LaunchFor`, `ReportedModel`, `modelMismatch`, ADR 0020 | Daemon and API tests |

## Design outline

The owner captures a request in the web app. Intake turns it into packages with dependencies. The daemon claims eligible packages and runs the role's runtime in a workspace; the author submits output, a pre-check role on a different baseline reviews the output alone, and the owner decides with a passkey assertion over the subject digest. Every transition goes through the kernel through its WebAssembly binding, and every event lands on a hash-chained, append-only log streamed to the app over SSE.

## Required links

- `risk.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- `spec/work.tsp`, `spec/api.tsp`, `kernel/src/`, `services/api/`, `daemon/`, `apps/web`, `packs/capital-projects/site-concept`

## Exit criteria

- Builder and reviewer can say what must stay true, including the custody and independence fixes from build plan items N1 to N8.
- Every assumption has an invalidation trigger.
- Evidence needs flow into `verification.md`.

## Source-lineage note

Basis structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
