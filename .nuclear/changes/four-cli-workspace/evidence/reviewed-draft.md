# Four-CLI Desktop Workspace Implementation Plan

> **For agentic workers:** Use the executing-plans or subagent-driven-development skill. Check off each independently verified slice.

**Goal** — From the desktop web app, launch a change on an eligible AGY, OpenCode, Codex, or Claude Code runtime, switch among active attempts, and review the exact run's changes and next action without losing your place.

**Architecture** — Keep the existing package, run, checkout and review records. Use the daemon's provider adapter boundary for launch and events, and derive the workspace from existing records plus narrow additions for authorized historical run reads and verified run outputs. Treat browsing improvements and provider qualification as independent work after the baseline.

**Tech stack** — React, TanStack Router and Query, Fastify, TypeSpec, PostgreSQL, Go runner daemon, Vitest, Playwright; WSL2 as the first live qualification platform.

**Design inputs** — [Current switcher](../../../.nuclear/changes/active-run-switcher/basis.md), [Workbench design](../specs/2026-10-29-workbench-ontology-design.md), [Board design](../specs/2026-11-06-board-redesign-design.md), [Wave 2 adapter gating](../../../.nuclear/changes/wave2-multi-cli-adapters/basis.md), and ADRs [0020](../../adr/0020-mvp-print-mode-runs.md), [0021](../../adr/0021-native-cli-sandboxes.md) and [0022](../../adr/0022-run-attestation.md).

## Global constraints

- Preserve owner passkey decisions, data-lane disclosure, independent review, policy refusal, and run attestation. Record evidence and capability by CLI version, adapter, host class, role and policy. A provider name, worktree, help command and previous review each prove different things.
- Keep ordinary provider sign-in. Project defaults may suggest settings. The server binds and enforces effective inputs on the run. Configuration must stay within the existing execution policy and protection boundaries.
- Existing native headless run semantics apply under ADR 0020. Defer interactive terminal input, resume, automation and new mobile navigation in this milestone.
- Use original implementations. Donor notes inform decisions. Use repository change records and required signatures for protected surfaces.
- Keep the default work item view centered on title, runtime state and the next action. Show expanded evidence and settings on demand.

## Baseline and release test

The desktop shell and Today already link to exact active attempts. Package views currently read the latest revision's runs. AGY and OpenCode are detected/registered but refuse run dispatch pending confinement qualification. The current worktree has unrelated in-progress changes. The most recent pass had 700 passing web tests and eight Chromium checks. The API had two failures in the workspace-project refusal catalog and attestation model registry expectations.

A release demonstration uses one small, authorized synthetic repo. Create two tasks on separate worktrees, start them on different qualified CLIs, switch between them while they work, refresh one, and inspect each transcript and exact diff. Repeat with the other two CLIs. Open a finished attempt after a later package revision exists. Stop one queued and one running attempt. Confirm a review gate remains enforced and a missing qualification yields an explanation. Ship qualified providers independently. Report the full four-CLI milestone only after all four live rows pass.

## Review focus

- A run finishes or a package advances while the URL is open. The original run remains readable and the current package decision context stays visibly distinct.
- A reload, service reconnect or sign-out occurs while a run is active. The transcript resumes without duplicates, attaches each event to the original run, and workspace state stays within the signed-in identity.
- A model, binary, credentials or effective policy changes between listing and launch. Launch fails closed with the actual blocker.
- Two attempts target the same repo. They keep independent checkouts and outputs, with refused writes on a wrong or unavailable target.
- A patch is absent, truncated, binary, or mismatched to its run. Explain the condition and keep the existing verification gate.

## Slice 0 — Establish the starting baseline

**Paths** — `.nuclear/changes/four-cli-workspace/`, `services/api/test/refusals.test.ts`, `services/api/test/run-attestation.test.ts`, `daemon/internal/runner/models.json`.

- [ ] Record the exact target revision, pre-existing worktree edits, toolchain versions and named test failures. Reconcile the two existing API assertions with the relevant owners or the authoritative registries before claiming green. Keep any correction in its own scoped change.
- [ ] Inventory the four installed CLIs on the target Windows/WSL setup. Capture path, version, documented output and interaction transport, and a bounded auth/readiness result. Keep credentials out of evidence.
- [ ] Verify and retain baseline results from the web build/tests, Chromium board suite, the scoped active-runs database test, and daemon adapter tests. Produce a per-provider matrix with independently evidenced cells and a pending state for each unverified claim.

## Slice 1 — Make exact attempts durable

**Paths** — TypeSpec `spec/api.tsp` and generated clients, API `src/app.ts` and `src/work.ts`, web `api/client.ts`, `pages/PackagePage.tsx`, `components/ActiveRuns.tsx` and `components/AgentPanel.tsx`.

**Interface** — Add an authenticated read `GET /packages/{id}/runs/{runId}` returning the exact `Run`. Query by both IDs and enforce run and package organization ownership. Keep `#run-<id>` as the existing entry point. Use `["run", packageId, runId]` for the exact-run query and invalidate it on relevant run events or recovery.

- [ ] Add integration fixtures for a current run, a finished older-revision run, an unrelated run in the same org, and a cross-org request. Expect the exact authorized records and an indistinguishable 404 for a missing or invisible target. Exercise session changes.
- [ ] Add the scoped read, regenerate clients, and have the package's selected-run panel and action controls consume the exact record. Clearly identify its recorded package revision. The existing decision bar continues to govern the current subject.
- [ ] Reuse the existing cursor-based transcript and add a reconnect/drop test with duplicate and late events. In the Chromium fixture, switch attempts, advance revision, reload the original URL, and confirm transcript, run ID, and revision match. Use fixture APIs here and real workers in the release demonstration.

## Slice 2 — Put a run's changes beside its transcript

**Paths** — API `src/repos.ts` and existing output/report records, spec and generated clients where needed, web `features/case`, `components/AgentPanel.tsx`, and the selected panel in `pages/PackagePage.tsx`.

**Interface** — A read-only run changes response links a recorded run, repository, base, output tree/digest and available patch. Reuse a recorded patch when the run already produced one. Where a run has a trustworthy base and output checkout, generate an immutable diff using existing hardened Git facilities. Read details on demand.

- [ ] Add tests for deleted, renamed and binary files, oversized patches, absent base, stale checkout, unauthorized read and two attempts sharing a repo. Assert the historical run's diff stays constant after the working tree changes.
- [ ] Record only verifiable comparison inputs. Add a compact changed-file list and one-file patch pane beside the transcript, with raw artifact links or explicit unavailable states. Render output as untrusted text.
- [ ] Check keyboard entry and return, split width, bounded initial query/read cost, and isolation between attempts. Split provider qualification from patch UI acceptance. This slice must work with existing qualified CLIs.

## Slice 3 — Qualify OpenCode and AGY independently

**Paths** — Go `daemon/internal/runner/{adapter,adapter_agy,adapter_opencode,runtime,sandbox,contain,probe}.go`, existing launch/stream fixtures, API `src/{disclosure,runtimes,run-attestation}.ts`, web `lib/runtimes.ts` and launcher.

**Interface** — Existing adapter lifecycle and normalized event contract. Eligibility comes from authoritative preflight and qualification, with provider/model eligibility and descriptive reasons. A presentation flag cannot grant launch authority.

- [ ] For each provider, capture the pinned CLI's actual help and a controlled synthetic transcript. Confirm invocation, auth, structured output, effective model/vendor, exit outcome, and cancellation. Resolve differences between the installed AGY interface and the dormant adapter before changing flags.
- [ ] Give each provider its own change record. Demonstrate the launch policy and applicable confinement on the target host, including requirements for CLI built-in tools, ordinary login, no ambient hooks/config, and disclosure. Exercise the repository's existing qualification suite and golden launch/stream tests. Keep the current refusal until the provider passes.
- [ ] Start with the ordinary author role. Keep checker qualification independent and enforce vendor custody. OpenCode's configured model vendor must be observed where it determines eligibility. Provider installation and transport support are distinct from qualification.
- [ ] Exercise successful, refused, failed and interrupted runs through the real normal entry point. Surface each eligible role and runtime in the launcher with a resolved model/repo summary and concise reasons for unavailable choices.

## Slice 4 — Preserve place and reduce setup friction

**Paths** — `apps/web/src/components/{Shell,ActiveRuns,NewWorkModal}.tsx`, `apps/web/src/lib/{session,storage,projects,workDefaults}.ts`, `services/api/src/workspace-projects.ts` and the existing capture/release flow.

**Interface** — Scoped browser preferences for recent or pinned run IDs and view state. Effective project defaults resolve once at launch, with explicit per-run overrides and a recorded snapshot. Package and run IDs remain the source of identity.

- [ ] Test restoring a pinned run and selected file across a browser reload, reordering entries, unavailable storage, missing records, and signing in as another user on the same browser.
- [ ] Extend the existing Runs surface with a recent/pinned group. Store IDs and view preferences only. Revalidate scope on navigation. Keep loading lazy and avoid one request per row.
- [ ] Reuse the current work form and project defaults. Give one clear path from a ready work item to a policy-eligible run. Show repo/ref, provider/model and role together. Freeze effective inputs at approved launch and preserve record changes when a later run overrides defaults.
- [ ] Walk the release demonstration. Verify desktop controls at standard and narrower widths. Measure capture-to-launch actions, run-switch actions, and change inspection requests. Record failures and limits explicitly in the release record.

## Verification and rollout

Run `pnpm --filter @control-rod/web test`, `pnpm --filter @control-rod/web build`, `pnpm -C apps/web exec playwright test -c playwright.board.config.ts --project=chromium`, `pnpm --filter @control-rod/api test`, and `go test ./internal/runner` from `daemon/`. Use the repository's live fixtures for integrated evidence and a separately recorded synthetic four-provider run on WSL2. Capture baseline and results per slice. Roll back provider availability per adapter and UI changes independently. Leave historic run and decision records readable.
