# Design: `omp` Daemon Adapter & Visual Casting Desk

- **Date:** 2026-11-24
- **Branch:** `feat/omp-patterns-adapter-casting-desk`
- **Change record:** `.nuclear/changes/omp-integration-and-casting-desk/`
- **Pattern input:** `docs/patterns/oh-my-pi.md`
- **Related ADRs:** ADR 0021 (Native CLI sandboxes), ADR 0023 (Role Casting), ADR 0024 (Council First)

## Summary & Trust Boundaries

This design delivers two complementary slices on top of Control Rod's existing trust spine:

1. **Part A (Daemon):** Register `omp` (`Oh My Pi`) as a first-class `Adapter` in `daemon/internal/runner/adapter_omp.go`, safely gated behind `AwaitingConfinement` until live OS confinement qualification is signed off under ADR 0021, with full probing, structured JSON event normalization, and upstream `provider/model` + vendor-family extraction for `attest.go`.
2. **Part B (Web App):** Add a visual **Casting Desk** inside `apps/web/src/pages/AgentsRoster.tsx` (one-click presets, role cards with model/vendor/effort controls, plain-language read-back, and an Advanced disclosure with an Author-only Fallback Chain builder) and list `omp` honestly as `not-yet` runnable in `apps/web/src/lib/agents.ts` and `apps/web/src/lib/runtimes.ts`.

**Protected trust surfaces are untouched.** This change makes zero edits to `kernel/`, `policies/`, `tests/redteam/`, `.github/workflows/`, or `spec/`.

---

## Part A: Daemon — `daemon/internal/runner/adapter_omp.go`

### 1. Registration & Capabilities

Register `ompAdapter{}` in `registry` in `daemon/internal/runner/adapter.go` (alongside the other `AwaitingConfinement` adapters, ahead of `fakeAdapter{}`):

- `ID() string` -> `"omp"`
- `Binary() string` -> `"omp"`
- `DisplayName() string` -> `"Oh My Pi"`
- `Providers() []string` -> `[]string{"omp", "oh-my-pi"}`
- `SandboxRequired() bool` -> `true` (embeds `sandboxedBase`)
- `Capabilities() Capabilities`:
  - `Roles`: `[]string{"author", "checker"}`
  - `OutputFormat`: `"json"`
  - `ToolAllowlist`: `false` (`omp` explicitly states `--tools` is not an exclusive security boundary)
  - `NativeSandbox`: `"none"` (honest capability reporting until OS confinement is built and qualified)
  - `NetworkHostLimit`: `false`
  - `MultiVendor`: `true`
  - `ConfigIsolation`: `[]string{"PI_CODING_AGENT_DIR", "--no-session"}`

### 2. Confinement Gate (`AwaitingConfinement`)

`ompAdapter` implements `AwaitingConfinement`:

- `ConfinementGap() string` returns a concrete, plain-language reason stating that `omp` has no OS confinement configured from `SandboxPolicy`, its `--tools` flag is not a security boundary, and live OS confinement qualification (ADR 0021) has not been signed off yet.
- Both `PreflightHost` (`sandbox.go`) and `Command` (`runtime.go`) already invoke `confinementRefusal(a)` after policy validation, so `omp` can be detected and probed on the host, appears honestly as not ready with its confinement gap, and is **refused on every launch path** until a separate qualification change removes `AwaitingConfinement`.

### 3. Availability & Probing

- `Available(lookPath, getenv)` checks `availableBinary(a, lookPath)` (`lookPath("omp")`).
- `Probe(ctx, version, run)` executes `omp --version` via `CommandRunner`, returning a `RuntimeStatus` with `Runtime: "omp"`, observed version string when installed, and honest unavailable/not-ready status.

### 4. Command Construction & Launch Info

When `Command(run, ws, p, at)` is called directly in unit tests (or after future confinement qualification removes `AwaitingConfinement`):

- Builds:
  ```
  omp --print --mode json --no-session --model <resolved-model> --thinking <effort-level> <prompt>
  ```
  - `--model <id>` is included when `run.Model` is specified and non-empty (and not `"default"`).
  - `--thinking <level>` is included when an effort/reasoning level is specified (normalized to `omp`'s supported levels: `off`, `minimal`, `low`, `medium`, `high`, `max`).
  - Sets isolated config directory (`PI_CODING_AGENT_DIR` pointing inside the run workspace) so Control Rod **never** reads or mutates the user's `~/.omp/` configuration or OAuth tokens.
  - Passes flags/environment disabling hidden in-run subagents and advisors so counted runs maintain clean deliverable lineage (ADR 0023 Decision 5).
  - Applies `AgentEnv` (stripping `*_TOKEN`, `*_API_KEY`, `*_BASE_URL`, `*_MODEL`) via `runtime.go` because `SandboxRequired()` is `true`.
- `LaunchInfo(run, ws, p)` populates `Launch` with runtime `"omp"`, requested model, binary `"omp"`, and workspace metadata.

### 5. Event Normalization & Turn End

`ompAdapter` overrides `streamBase`'s `Normalize(line string, now time.Time) []Event` and `TurnEnd(line string) (ended, failed bool)` to parse newline-delimited JSON lines emitted by `omp --mode json`:

- **Assistant text / deltas:** emitted as text/message events.
- **Tool call start / result:** emitted as tool events carrying tool name and status.
- **Usage / token metrics:** preserves provider-reported input, output, and cached token counts verbatim (empty when omitted, never fabricated as zero).
- **Errors & completion:** `TurnEnd` detects terminal success (`turn_end` / `result` / `done` with non-error status) and terminal failure (`error` / failed `result`).
- Non-JSON or unrecognized lines fall back gracefully without panicking.

### 6. Stream Metadata & Vendor-Family Attestation (`StreamMetadataParser`)

Because `omp` is a multi-vendor harness (`MultiVendor: true`), attesting `"omp"` alone is insufficient to enforce blind cross-vendor checking (`kernel/` + `services/api/src/run-attestation.ts`). `ompAdapter` implements `StreamMetadataParser`:

- `StreamLabel(line string) string`: returns a concise human-readable label for log lines (tool call, status, or message summary).
- `StreamModel(line string) string`: extracts the resolved upstream `provider/model` identifier from `omp --mode json` stream events (e.g., `anthropic/claude-sonnet-4-6`, `openai/gpt-5-codex`, `xai/grok-4`, `google/gemini-2.5-pro`, `ollama/qwen2.5-coder:32b`).
- A pure helper `OmpVendorFamily(model string) string` maps the resolved `provider/model` (or bare model prefix) to its canonical vendor family (`"anthropic"`, `"openai"`, `"xai"`, `"google"`, `"deepseek"`, `"mistral"`, `"local"`, or `""` when unknown — failing closed so unknown vendors never count as an independent checker family).

---

## Part B: Web App — Visual Casting Desk (`apps/web/`)

### 1. Honest `omp` Runtime Listing

- `apps/web/src/lib/agents.ts`:
  - Add `"omp"` to `AgentId`.
  - Add `{ id: "omp", name: "Oh My Pi", vendor: "multi-provider", runnable: false }` to `AGENTS`.
  - Because `runnable: false`, `agentRows()` automatically gives it state `"not-yet"` with the honest `NOT_YET` message explaining it needs a Control Rod sandbox before it can run work.
- `apps/web/src/lib/runtimes.ts`:
  - Add `"omp"` to `CliEcosystemId` and `CLI_ECOSYSTEMS` with `label: "Oh My Pi (omp)"`, `cliCommand: "omp"`, `runnable: false`, representative multi-provider models, and `reasoningLevels: ["default", "off", "minimal", "low", "medium", "high", "max"]`.

### 2. Casting Desk Module & UI (`AgentsRoster.tsx`)

Create a focused casting model module (`apps/web/src/lib/casting.ts`) and UI component (`apps/web/src/components/CastingDesk.tsx`), mounted inside `apps/web/src/pages/AgentsRoster.tsx` as a dedicated panel alongside the existing "At the table" roster:

#### Simple View (Default — ADR 0024 Decision 3)
- **One-click Presets:**
  1. **Balanced** — Claude Sonnet (Anthropic, `medium`) authors; Codex GPT-5 / GPT-6.2 (OpenAI, `high`) checks blindly; Planner on high; Quick / Summarizer on fast/low.
  2. **Deep** — Top reasoning models (`high`/`max`) across distinct vendors for Author and Blind Checker.
  3. **Fast & Frugal** — Faster, lighter models (`low`/`medium`) across distinct vendors for quick iteration.
  4. **Local-Only** — Local models (`ollama/...` via local runtime) for Restricted / Proprietary data lanes, with an explicit inline warning that local models cannot serve as deciding checkers on Safety or Material grades (per `attest.go` and `disclosure.ts`).
- **Role Cards (4 seats):**
  - `Author`
  - `Blind Checker`
  - `Planner`
  - `Quick / Summarizer`
  Each card displays:
  - Role title and short plain-language responsibility,
  - Model selector populated from the structured catalog (showing model name, vendor family badge, and locality tag),
  - Effort pill/selector (`low`, `medium`, `high`, `max`).
- **Plain-Language Read-Back:**
  - Live `aria-live="polite"` summary sentence describing the current casting (e.g., *"Claude Sonnet 4.6 (Anthropic, medium) authors; Codex GPT-5 (OpenAI, high) checks blindly without seeing how it was written."*).
  - If Author and Blind Checker share the same vendor family, surfaces a clear inline warning that Control Rod's blind cross-vendor rule requires distinct vendors.

#### Advanced Disclosure (Collapsed by Default)
- **Author-Only Fallback Chain Builder:**
  - Ordered list (`Primary -> Fallback 1 -> Fallback 2`) editable with add, remove, and move-up/move-down controls for the **Author** role only.
  - Explicit inline governance notice: *"Author fallback only (ADR 0024 Decision 6): if the primary author hits a quota limit or goes offline, Control Rod logs the switch and pauses for your review before merge. Blind Checkers never fail over."*
  - No fallback chain controls are rendered for Blind Checker.

#### Honest UI & Persistence Boundary
- Drafts persist in `localStorage` under a versioned key (`controlrod.castingDesk.v1`) so users can explore presets, roles, effort levels, and author fallback chains immediately.
- A visible notice clearly states: **"Local draft preview — saved in this browser only. Applying a Casting Sheet to live runs requires API persistence and passkey signing (ADR 0023), which is not wired yet."**
- Zero API key, token, or secret input fields exist anywhere in the Casting Desk (`docs/plan/HANDOFF.md` rule).

---

## Verification Plan

- **Daemon (`go test`):** `daemon/internal/runner/adapter_omp_test.go` verifies `omp` registration, `AwaitingConfinement` refusal in `PreflightHost` and `Command`, `NativeSandbox == "none"`, `Probe`, `Command` argument/env construction (isolated `PI_CODING_AGENT_DIR`, `--print --mode json --no-session`), `Normalize`, `TurnEnd`, and `StreamMetadataParser` + `OmpVendorFamily`.
- **Web (`vitest` / `tsc`):** Unit and component tests verify `omp` `not-yet` listing in `agents.ts` / `runtimes.ts`, preset application, role card model/effort updates, cross-vendor read-back warnings, Author-only fallback chain add/reorder/remove, absence of checker failover, and honest local-draft preview notice.
- **Register check:** `python3 tools/check_register.py` passes with zero errors.
