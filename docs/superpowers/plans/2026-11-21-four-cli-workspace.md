# Four-CLI Desktop Workspace Implementation Plan

> **For agentic workers:** Use the executing-plans or subagent-driven-development skill. Check off each independently verified slice.

**Goal** — From the desktop web app, launch a change on an eligible AGY, OpenCode, Codex, or Claude Code runtime, switch among active attempts, and review the exact run's changes and next action without losing your place.

**Architecture** — Keep the existing package, run, checkout and review records. Use the daemon's provider adapter boundary for launch and events, and derive the workspace from existing records plus narrow additions for authorized historical run reads and verified run outputs. Treat browsing improvements and provider qualification as independent work after the baseline.

**Tech stack** — React, TanStack Router and Query, Fastify, TypeSpec, PostgreSQL, Go runner daemon, Vitest, Playwright; WSL2 as the first live qualification platform.

**Design inputs** — [Current switcher](../../../.nuclear/changes/active-run-switcher/basis.md), [Workbench design](../specs/2026-10-29-workbench-ontology-design.md), [Board design](../specs/2026-11-06-board-redesign-design.md), [Wave 2 adapter gating](../../../.nuclear/changes/wave2-multi-cli-adapters/basis.md), and ADRs [0020](../../adr/0020-mvp-print-mode-runs.md), [0021](../../adr/0021-native-cli-sandboxes.md) and [0022](../../adr/0022-run-attestation.md).

## Global constraints

- Preserve owner passkey decisions, data-lane disclosure, independent review, policy refusal, and run attestation. Record evidence and capability by CLI version, adapter, host class, role and policy. Each release matrix row links host, CLI version and build identity, effective policy, selected role, run ID, attestation, output and review outcome. A provider name, worktree, help command and previous review each prove different things.
- Keep ordinary provider sign-in. Project defaults may suggest settings. The server binds and enforces effective inputs on the run. Configuration must stay within the existing execution policy and protection boundaries.
- Existing native headless run semantics apply under ADR 0020. Defer interactive terminal input, resume, automation and new mobile navigation in this milestone.
- Use original implementations. Donor notes inform decisions. Use repository change records and required signatures for protected surfaces.
- Keep the default work item view centered on title, runtime state and the next action. Show expanded evidence and settings on demand.

## Baseline and release test

The desktop shell and Today already link to exact active attempts. Package views currently read the latest revision's runs. AGY and OpenCode are detected/registered but refuse run dispatch pending confinement qualification. The observed checkout is `feat/simple-custody-cli-models-and-walk` at `36e481aac4214cae83f184944819d5e90a3182b9`, with in-progress changes. Preserve the worktree and record the combined baseline before implementation. The most recent pass had 700 passing web tests and eight Chromium checks. The API had two failures in the workspace-project refusal catalog and attestation model registry expectations.

Run a four-concurrent-attempt browser fixture early, with two attempts sharing a title and role. For live qualification, use an authorized synthetic repo with ordinary CLI logins and zero Control Rod bootstrap files or per-project hooks. Start work on separate checkouts, switch between active attempts, refresh one, and inspect each transcript and exact diff. Verify the written files match the intended deliverable and record any setup needed on the host. Open a finished attempt after a later package revision exists. Stop one queued and one running attempt. Confirm a review gate remains enforced and a missing qualification yields an explanation. Ship qualified providers independently. Report the full four-CLI milestone only after all four live rows pass.

## Review focus

- A run finishes or a package advances while the URL is open. The original run remains readable and the current package decision context stays visibly distinct.
- A reload, service reconnect or sign-out occurs while a run is active. The transcript resumes without duplicates, attaches each event to the original run, and workspace state stays within the signed-in identity.
- A model, binary, credentials or effective policy changes between listing and launch. Launch fails closed with the actual blocker.
- Two attempts target the same repo. They keep independent checkouts and outputs, with refused writes on a wrong or unavailable target.
- A patch is absent, truncated, binary, or mismatched to its run. Explain the condition and keep the existing verification gate.

## Delivery order

After capturing the baseline, start OpenCode and AGY feasibility independently of the UI track. Run Slice 1 before Slice 2. The desktop workflow defined by Slices 1, 2 and 4 can ship with Claude and Codex after their own live qualification. Finish the four-provider checkpoint when the OpenCode and AGY rows pass as well.

## Slice 0 — Establish the starting baseline

**Paths** — `.nuclear/changes/four-cli-workspace/`, `services/api/test/refusals.test.ts`, `services/api/test/run-attestation.test.ts`, `daemon/internal/runner/models.json`.

- [ ] Record the exact target revision, pre-existing worktree edits, toolchain versions and named test failures. Reconcile the two existing API assertions with the relevant owners or the authoritative registries before claiming green. Keep any correction in its own scoped change.
- [ ] Inventory the four installed CLIs on the target Windows/WSL setup. Record existing repo hooks/configuration and distinguish existing project setup from Control Rod requirements. Capture path, version, documented output and interaction transport, and a bounded auth/readiness result. Keep credentials out of evidence.
- [ ] Verify and retain baseline results from the web build/tests, Chromium board suite, the scoped active-runs database test, and daemon adapter tests. Produce a per-provider matrix with independently evidenced cells and a pending state for each unverified claim.
- [ ] Begin an authorized synthetic feasibility probe for each provider. Check transcript transport, cancellation and whether the pinned build can meet the current containment policy. Verify live Claude and Codex separately. Close each feasibility row as viable, blocked with a specific dependency, or pending with a named evidence gap. Keep UI work available on fixture data throughout.
- [ ] Capture the desktop browser baseline at the existing fixture widths of 1440 and 1180 px. Record warm and cold switch latency, requests, bytes, and transcript recovery with the same hardware and fixture used for the final benchmark. Establish the performance target from those results before changing request behavior.

**Exit evidence** — Checklist and version/policy matrix in the change record. Record full-suite results against an isolated, identified baseline that preserves authorized uncommitted inputs. Verify any known failure in that baseline before disposition. A fix or separately recorded release disposition is required for a failing gate.

## Slice 1 — Make exact attempts durable

**Paths** — TypeSpec `spec/api.tsp` and generated clients, API `src/app.ts` and `src/work.ts`, web `api/client.ts`, `pages/PackagePage.tsx`, `components/ActiveRuns.tsx` and `components/AgentPanel.tsx`.

**Interface** — Add an authenticated read `GET /packages/{id}/runs/{runId}` returning the exact `Run`. Query by both IDs and enforce run and package organization ownership. Use the same scope check for existing transcript, raw log and new changes reads. Keep `#run-<id>` as the existing entry point. Use `["run", packageId, runId]` for the exact-run query. Refresh on state transitions and recovery. Treat transcript events as cursor deltas so progress does not invalidate every open record. Add a bounded `GET /runs/active` summary projection with title and run state from the scoped query. Keep the existing `GET /runs` response shape for its callers.

- [ ] Add integration fixtures for a current run, a finished older-revision run, an unrelated run in the same org, and a cross-org request. Expect the exact authorized records and an indistinguishable 404 for a missing or invisible target on every read. Test a sign-out during a pending read and a late response after switching attempts. Verify the response never populates a different attempt or identity.
- [ ] Add the scoped read, regenerate clients, and have the package's selected-run panel and action controls consume the exact record. Clearly identify the recorded package revision. Keep historical views read-only. Replace the current decision controls in the historical view with an explicit link to current review. Test that following it displays the current subject and requires a fresh review action before any signature is requested.
- [ ] Reuse the existing cursor-based transcript and add a reconnect/drop test with duplicate and late events. In the Chromium fixture, switch attempts, advance revision, reload the original URL, and confirm transcript, run ID, and revision match. Also exercise four concurrent entries, including two with the same title and role. Distinguish them by repo or package ID, CLI, and run identity. Require at most two selections from the desktop shell to the intended attempt. With a large package collection, opening Runs must issue one bounded summary fetch and zero package or transcript reads until selection. Use fixture APIs here and real workers in the release demonstration.
- [ ] Simulate a long retained transcript. Initially load a bounded recent window and request older entries on demand. Resume from an observed sequence, deduplicate only identical records, and surface a gap when continuity cannot be established. Keep offscreen work quiet and preserve the recorded run list across refresh failures.

**Exit evidence** — Scoped API suite and a passing four-attempt Playwright case, including a reload of an earlier revision and sign-out with a pending read.

## Slice 2 — Put a run's changes beside its transcript

**Paths** — daemon `internal/runner/daemon.go` around completion and a focused changes-capture module, API `src/repos.ts`, `src/work.ts`, and a focused migration for run change artifacts, plus the TypeSpec completion contract and generated clients, web `features/case`, `components/AgentPanel.tsx`, and the selected panel in `pages/PackagePage.tsx`.

**Interface** — The runner binds a trusted checkout and base commit during workspace preparation. After observed process exit and before releasing the checkout, capture its final tree and a bounded, immutable changes artifact using hardened Git facilities. Deliver the manifest and patch through the existing durable completion path under a run-scoped content digest. Include the package revision, repository, base commit, final tree identity, manifest digest, patch digest and exclusion or truncation metadata. Reuse an existing authoritative patch only when these provenance checks match. The read-only changes response authenticates access and verifies the manifest and returned patch against their recorded digests before serving an index or one file. Extend the existing durable completion/outbox with an optional change artifact, and commit it alongside run completion in a separate run-keyed PostgreSQL relation. Keep comparison bytes outside the signed deliverable set. Use the existing artifact retention controls where they apply and verify the resulting lifetime before wiring capture. A repeat completion with identical content must be idempotent. A conflicting repeat must preserve the recorded artifact. Keep recorded deliverables and derived Git changes visibly distinct. Treat a digest mismatch as unavailable for review and leave the underlying signing subject governed by its existing binding. If checkout binding or capture cannot be established, return an explicit unavailable reason.

- [ ] Add tests for deleted, renamed and binary files, oversized patches, absent base, stale checkout, unauthorized read and two attempts sharing a repo. Include one newly created, in-scope untracked file, an ignored file that stays out, a partial capture, conflicting completion retries, and reopening the attempt after checkout deletion. Confirm late output remains attached to its own attempt and leaves the reviewed artifact intact.
- [ ] Record only verifiable comparison inputs. Add a compact changed-file list and one-file patch pane beside the transcript, with raw artifact links or explicit unavailable states. Render output as untrusted text.
- [ ] Check keyboard entry and return, split width, and isolation between attempts. Fetch the bounded change index once on opening Changes. Fetch one selected patch lazily. Keep patch text out of the default run and shell payloads. Split provider qualification from patch UI acceptance. This slice must work with existing qualified CLIs.
- [ ] Use current server output limits as the starting budget for a response. Record the measured patch sizes and time to render the largest supported fixture. Reject or mark work larger than the budget explicitly. Compare the warm/cold benchmark with Slice 0 on the same host and report both.

**Exit evidence** — Capture-and-read integration case still passes after the checkout is gone. Browser verification includes tampered bytes, unavailable legacy runs, long output, and keyboard reachability at both widths.

## Slice 3 — Qualify OpenCode and AGY independently from Slice 0

**Paths** — Go `daemon/internal/runner/{adapter,adapter_agy,adapter_opencode,runtime,sandbox,contain,probe}.go`, existing launch/stream fixtures, API `src/{disclosure,runtimes,run-attestation}.ts`, and the per-provider eligibility projection consumed by the launcher.

**Interface** — Existing adapter lifecycle and normalized event contract. Eligibility comes from authoritative preflight and qualification, with provider/model eligibility and descriptive reasons. A presentation flag cannot grant launch authority.

- [ ] For each provider, capture the pinned CLI's actual help and a controlled synthetic transcript. Confirm invocation, auth, structured output, effective model/vendor, exit outcome, and cancellation. Resolve differences between the installed AGY interface and the dormant adapter before changing flags.
- [ ] Give each provider its own change record. Before enabling launch, demonstrate the launch policy and applicable confinement on the target host, including requirements for CLI built-in tools, ordinary login, no ambient hooks/config, and disclosure. Exercise the repository's existing qualification suite and golden launch/stream tests. Keep the current refusal until the provider passes. Pin the qualified artifact identity and provide a documented one-command requalification entry point. A new build is an unqualified build until it passes. A refusal should identify the installed and qualified versions where both are known. Preserve user-owned installations and settings.
- [ ] Start with the ordinary author role. Keep checker qualification independent and enforce vendor custody. OpenCode's configured model vendor must be observed where it determines eligibility. Provider installation and transport support are distinct from qualification.
- [ ] Exercise successful, refused, failed and interrupted runs through the real normal entry point. Record cancellation requested, acknowledged and process ended as separate observations under the existing timeout policy. Verify a denied target stays unchanged. Feed authoritative status to the launcher through the existing availability path, with a scoped contract extension if needed.

**Human participation** — Ordinary sign-in if needed, use of an authorized synthetic fixture, required review decisions, and passkey actions. Record the provider row as pending if a required participant or host is unavailable.

**Exit evidence** — One signed-off qualification record per enabled CLI/host/role/policy, containing launch and stream goldens, executable identity, containment/preflight evidence and the live run disposition. Each provider can be withdrawn without affecting other rows.

## Slice 4 — Preserve place and reduce setup friction

**Paths** — `apps/web/src/components/{Shell,ActiveRuns,NewWorkModal}.tsx`, `apps/web/src/lib/{session,storage,projects,workDefaults}.ts`, `services/api/src/workspace-projects.ts` and the existing capture/release flow.

**Interface** — Scoped browser preferences for recent run IDs and view state. Start with automatic recent entries. Defer manual pinning and reordering until use shows they pay for their controls. Effective project defaults resolve once at launch, with explicit per-run overrides and a recorded snapshot. Order settings as explicit per-run choice, project preference, then shipped defaults. Validate after resolution, at release and at dispatch, against the active policy. A stale preference produces a visible refusal or an explicit new choice. Package and run IDs remain the source of identity.

- [ ] Test restoring the last run and selected file across a browser reload, unavailable storage, missing records, and signing in as another user on the same browser.
- [ ] Extend the existing Runs surface with a short recent group and restore the selected file and transcript position on return to an attempt. Store IDs and view preferences only. Revalidate scope on navigation. Keep loading lazy and avoid one request per row.
- [ ] Reuse the current work form and project defaults. Give one primary path from a ready item to its resolved launch. Show repo/ref, provider/model and role together and put optional overrides and unavailable choices behind one disclosure. With valid defaults and standing already present, the path should take at most two deliberate selections. Any needed gate still appears explicitly. Freeze effective inputs at approved launch and preserve record changes when a later run overrides defaults.
- [ ] Walk the release demonstration. Verify desktop controls at standard and narrower widths. Measure capture-to-launch actions, run-switch actions, and change inspection requests. Verify that Control Rod added zero repo hook/config or bootstrap files and only the intended deliverables changed in the fixture. Record failures and limits explicitly in the release record.

**Exit evidence** — Browser workflow with restored first-run state, a passkey-backed gate where applicable, measured action counts, and the synthetic repo setup diff.

## Acceptance trace

| Behavior | Owning proof |
| --- | --- |
| Exact concurrent selection, historical reload, no stale identity, no misleading decision | Slice 1 Playwright and scoped API cases |
| Stable patch after checkout deletion, no mismatched or incomplete evidence | Slice 2 completion/API case and browser review case |
| Eligible CLI launch, stale pin refusal, isolated checkout, correct stop outcome | Slice 0 feasibility matrix and Slice 3 per-provider host run |
| Fewer choices and zero new repo hooks, restored transcript/file context | Slice 4 desktop walk and fixture repo comparison |
| Request and latency limits | Same-host baseline in Slice 0 and measured reruns in Slices 1, 2 and 4 |

## Verification and rollout

Run `pnpm --filter @control-rod/web test`, `pnpm --filter @control-rod/web build`, `pnpm -C apps/web exec playwright test -c playwright.board.config.ts --project=chromium`, `pnpm --filter @control-rod/api test`, and `go test ./internal/runner` from `daemon/`. Use the repository's live fixtures for integrated evidence and a separately recorded synthetic four-provider run on WSL2. Capture baseline and results per slice. Roll back provider availability per adapter and UI changes independently. Leave historic run and decision records readable.

## Review status

Codex Astra reviewed the frozen draft and checked the revised plan. Claude Code reported a successful `claude-fable-5-2` review of the same draft. Both reviews informed the delivery order and acceptance tests. AGY returned `RESOURCE_EXHAUSTED` across its default, Gemini 4 Neon High and Gemini 3.8 Flash High attempts. Its review remains pending. These are advisory design reviews. Live provider qualification and release decisions belong to implementation.
