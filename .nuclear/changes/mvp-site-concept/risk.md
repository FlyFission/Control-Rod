# Risk: MVP with the site concept job

**Purpose:** Sort the first usable Control Rod (the General base layer plus the BaseMark site concept job) by risk and name the least evidence needed before it merges.

**Change slug:** `mvp-site-concept`
**Owner:** Ben Huffer, FlyFission Consulting Group
**Date:** 2026-10-22
**Lifecycle phase:** Verify
**Status:** Ready for owner review on branch `mvp/site-concept`.

---

## Change identity

- **Slug:** `mvp-site-concept`
- **PR / issue:** pull request from `mvp/site-concept`, to be opened by the owner's decision
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Current lifecycle phase:** Verify
- **Summary:** The first build the owner can run on his Mac. Adds MVP contracts in `spec/`, kernel lifecycle transitions with the core floors and a WebAssembly binding, a Fastify and Postgres control plane with passkey decisions bound to a subject digest and a hash-chained event log, a Go run daemon, a React web app, the General roles, and the site concept pack (`cr-site` tools, a 50 MW data center typical, six site roles and templates). One command (`pnpm cr start`) runs it all at `http://localhost:7300`.

## Mission anchor

- **Objective:** the owner can hand Control Rod a parcel and a facility type, watch agents produce a site concept package with live public data and a drawing, and release or accept each package himself with a passkey, with every step on a verifiable record.
- **Success criterion (done when):** the kernel, control plane, daemon, web and site pack tests pass; a live browser run releases and accepts all five site packages with real public data sources and a passing plan check; this packet validates; the owner signs the trust-surface edits.
- **Non-goals:** no Cedar policies, no transparency log or witnesses, no sandbox driver beyond a tool allowlist, no multi-user, no Kandev decision, no mobile or desktop app.

## Questioning-attitude summary

| Question | Answer |
|---|---|
| What could this change quietly get wrong? | An agent or the daemon reaching a human decision, a decision applied to content other than what the person saw, a pre-check run with the author's context, a record that can be edited after the fact, or a site package that states a number nobody computed. Each has a check below. |
| What did testing find that we did not expect? | Browser page loads at paths the API also serves (`/office`, `/packages/:id`) got JSON; the server now returns the app for HTML requests. The embedded Postgres Linux binary needs `libicu60`, so the test harness starts a throwaway cluster from a system PostgreSQL instead. While writing this packet, the site pack's county registry file turned out to be ignored by the root `.gitignore` (`data/`) and never committed, so one parcel test fails on a fresh checkout. |
| What is assumed rather than shown? | That real Claude Code and Codex runs behave like the scripted agents used here. The first real run is on the owner's Mac. |

## Affected configuration items

| Item | Type | Why it matters | Link |
|---|---|---|---|
| Work and API contracts | Spec | Source of truth for every package, run, decision and event. | `spec/work.tsp`, `spec/api.tsp` |
| Kernel lifecycle and decisions | Trust surface (kernel decision functions) | Holds the floors: who may move a package and on what evidence. | `kernel/src/transition.rs`, `kernel/src/decision.rs` |
| Kernel WebAssembly binding | Generated code | Lets the control plane call the same kernel. | `kernel/bindings/wasm`, `services/api/kernel`, `scripts/build-kernel-wasm.sh` |
| Control plane | Code | Sessions, passkeys, routes, events, runs. | `services/api/src/` |
| Run daemon | Code | Claims jobs and runs agent runtimes in workspaces. | `daemon/internal/runner` |
| Web app | Code | Where the owner captures, reviews and decides. | `apps/web` |
| General roles | Role briefs | Intake, author and pre-check for any job. | `packs/general/roles` |
| Site concept pack | Code, role briefs, templates | Parcel, plat, constraints, layout, plan and check tools; site roles. | `packs/capital-projects/site-concept` |
| One-command start | Script | How the owner runs it. | `scripts/cr.mjs` |
| Scripted agents | Test code | Stand in for real runtimes in end-to-end runs. | `tests/e2e/fake` |
| License gate | Trust-adjacent tool | Adds `Unlicense` to the allowlist for `isbot`. | `tools/license-gate.mjs` |

## Threshold screen

| Dimension | Low / medium / high | Notes |
|---|---|---|
| Consequence | Medium | Site packages inform real siting decisions for BaseMark; a wrong constraint could mislead. Nothing is issued outside the owner's review. |
| Reversibility | High | Branch work; revert is one command. Local Postgres data can be deleted. |
| Detectability | Medium | Floors and the event chain are tested; agent output quality is judged by the owner. |
| Exposure | Low | One user on one machine, bound to `127.0.0.1`. |
| Uncertainty | Medium | Real agent runtimes untested here; public GIS services change without notice. |
| Dependency trust | Medium | New runtime dependencies (Fastify, SimpleWebAuthn, wasm-bindgen, TanStack, pg) and live public data services. |
| AI authority | High | Agents author and pre-check engineering work. The kernel holds every decision for a human with a passkey. |

## HPI work-mode screen

| Factor | Rating | Notes |
|---|---|---|
| Familiarity | Medium | Each piece is familiar; this is the first time they run together. |
| Time pressure | Medium | The owner wants to start testing soon. |
| Complexity | High | Five components built in parallel and merged. |
| Distraction risk | High | Long session with parallel builders and a Kandev review running. This packet fixes scope. |

## Selected mode

- **Mode:** Standard
- **Why this mode:** behavior the owner sees, new dependencies, and changes to kernel decision functions.
- **Why lighter mode is not enough:** kernel decision functions and the license gate changed, and agents act on engineering work.
- **Why heavier mode is not yet required:** one user, local only, fully reversible, and no deliverable leaves the owner's hands without his own passkey decision. The kernel edits are held for the owner's signature before merge.

## Activated artifacts

| Artifact | Activated? | Reason | Owner |
|---|---|---|---|
| `basis.md` | yes | Protected outcomes for floors, record and site output. | Ben Huffer |
| `plan.md` | yes | Build order and proof commands. | Ben Huffer |
| `trace.md` | yes | Claims tied to tests. | Ben Huffer |
| `verification.md` | yes | Results, custody and coupling. | Ben Huffer |
| `ship.md` | yes | Merge decision, signatures and residual risk. | Ben Huffer |
| Nuclear subset record | no | The floors are new and covered by kernel and API tests; the owner's signature on the kernel edits is the added control. | Ben Huffer |

## Immediate evidence obligations

- **Least evidence before build:** the floors written as kernel reason codes, and the contracts.
- **Least evidence before merge:** all suites passing on a fresh checkout, the live browser run, this packet validated, the county registry committed, and the owner's signature on the kernel decision functions and the license gate.
- **Independent review needed?** Yes. The owner reviews and signs; his first real run on his Mac is the first use by someone other than the builders.

## Required links

- Packet: `.nuclear/changes/mvp-site-concept/`
- `basis.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- Decisions: `docs/adr/0012-run-daemon-go.md`, `docs/adr/0013-identity.md`, `docs/adr/0015-modes-rigor-overlays.md`, `docs/adr/0016-flows-and-typicals.md`, `docs/adr/0018-drawing-engine-cadcraft.md`

## Exit criteria

- The mode is justified.
- The activated artifacts are named.
- Risks, assumptions and evidence duties live in this packet rather than in chat.

## Source-lineage note

Packet structure follows nuclear-grade context engineering, whose public source map is at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
