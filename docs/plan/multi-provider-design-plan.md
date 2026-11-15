# Control Rod: multi-provider agents design plan

How to run each subscription CLI as its own agent, with checker routing that keeps providers separate. Revised 2026-11-14 after four adversarial reviews (Claude Code, Codex, Antigravity, local Qwen).

## Contents

- [In short](#in-short)
- [Goals and non-goals](#goals-and-non-goals)
- [What the kernel can and cannot prove](#what-the-kernel-can-and-cannot-prove)
- [Current state in the repo](#current-state-in-the-repo)
- [Provider adapter interface](#provider-adapter-interface)
- [Provenance and run attestation](#provenance-and-run-attestation)
- [Deliverables are untrusted input](#deliverables-are-untrusted-input)
- [Private home versus subscription login](#private-home-versus-subscription-login)
- [Per-provider notes](#per-provider-notes)
- [Cross-check routing](#cross-check-routing)
- [Fit with the kernel's guarantees](#fit-with-the-kernels-guarantees)
- [UI changes](#ui-changes)
- [Security, sandbox and qualification](#security-sandbox-and-qualification)
- [Terms of service check per vendor](#terms-of-service-check-per-vendor)
- [Risks](#risks)
- [Open questions for Ben](#open-questions-for-ben)
- [Phased rollout](#phased-rollout)
- [Milestone 1, ready to hand off](#milestone-1-ready-to-hand-off)
- [Review log](#review-log)
- [Sources](#sources)

## In short

**Provider separation, not proven independence.** Control Rod can ensure that a checker was launched on a different, pinned vendor and model family than the author, in a sandbox, with the endpoint and model it observed recorded and signed by the daemon. It cannot prove which model actually answered, or that two vendors don't share blind spots. The plan therefore covers four things. It pins and attests provenance. It treats every deliverable as untrusted input to the checker. It makes failed checks sticky and quorum rules part of the signed package policy. And it adds CLIs only after each one passes an adversarial qualification on WSL2 and on macOS.

| | |
|---|---|
| 2 | Runtimes wired today. claude, codex (plus a fake for tests) |
| 4 | Independent reviews applied. 3 hosted, 1 local |
| M1 | Needs no signature. Daemon adapter seam only |
| 11 | Milestones, one PR each |

## Goals and non-goals

### Goals

- Each signed-in subscription CLI, plus chosen local Ollama models, runs as its own agent.
- Control Rod never reads, stores or relays a token (ADR 0021). CLAUDE_CODE_OAUTH_TOKEN and similar token environment variables are never passed.
- Provider separation: the checker's pinned vendor and family differ from the author's, and between any two checkers, enforced by the kernel on attested facts.
- Deliverables can't instruct, hook or write over the checker.
- Failed checks stay failed until the deliverable changes or the owner signs.
- Every CLI is sandboxed and qualified per version and per platform, including macOS, or it doesn't run.

### Non-goals (cut or deferred)

- An editable strengths matrix, and any learning loop. Cut. A static ordered list of eligible checkers is used instead.
- Routing one subscription's login through another tool, such as Claude plans through OpenCode.
- Live steering or mid-run chat (ADR 0020 stays).
- Agents debating, subagent delegation, or model fallback inside a counted run.
- Gemini CLI. Deferred: it needs API keys and duplicates the Google slot.
- Claiming the kernel proves independence.

## What the kernel can and cannot prove

| The kernel can enforce | The kernel cannot prove |
|---|---|
| A pre-check counts only if the facts it receives say the vendor and family differ, pairwise, and the quorum in the signed package policy is met. | Which model actually produced the tokens. A CLI, proxy or endpoint that lies consistently passes every string check. |
| Those facts arrived with a daemon signature over the artifact digest, policy digest, effective endpoint and observed models (once M5 lands). | That the daemon or the machine wasn't compromised. The signature moves trust to the daemon's key, it doesn't remove it. |
| Missing seats, unknown provenance or a stale snapshot never count as a pass. | That different vendors don't share training data, distillation or failure modes. |
| Only a person accepts, with a passkey over the digest. | That the person read the evidence. |

Product copy, the receipt and the docs say "provider separation" and "independent check by a different provider". They never say "proven independent".

## Current state in the repo

| Area | What it does today | Where |
|---|---|---|
| Runtime launch | Hard-coded constants claude, codex and fake, dispatched by switch statements. Claude runs `-p --output-format stream-json --verbose` with `--restricted`, `--strict-mcp-config`, an empty `--mcp-config`, `--setting-sources ""`, `--disable-slash-commands` and `--no-session-persistence` already set. Codex runs `exec --json --skip-git-repo-check -C <ws>` with a `-c` permission profile. | [runtime.go](https://github.com/FlyFission/Control-Rod/blob/main/daemon/internal/runner/runtime.go) and [sandbox.go](https://github.com/FlyFission/Control-Rod/blob/main/daemon/internal/runner/sandbox.go) |
| Environment | `AgentEnv` is an allowlist (HOME, USER, PATH, LANG, TZ, TMPDIR, CODEX_HOME, CLAUDE_CONFIG_DIR and a few more), so base-URL, model and token variables are already dropped. It has no explicit test for those names yet. | [sandbox.go](https://github.com/FlyFission/Control-Rod/blob/main/daemon/internal/runner/sandbox.go) |
| Codex config | Runs pass `--ignore-user-config --ignore-rules --ephemeral`, which also neutralizes Ben's `config.toml` that routes Codex to Ollama cloud. The probe still runs plain `codex login status`. | [daemon.md](https://github.com/FlyFission/Control-Rod/blob/main/docs/daemon.md) |
| Event normalization | One Event shape. `TurnEnd` knows Claude's result event and Codex's turn.completed and turn.failed. | [events.go](https://github.com/FlyFission/Control-Rod/blob/main/daemon/internal/runner/events.go) |
| Pins | Passkey-signed pin of a probed artifact by SHA-256 per runtime and role. `PINNABLE = ["claude","codex"]`. | [runtimes.ts](https://github.com/FlyFission/Control-Rod/blob/main/services/api/src/runtimes.ts) |
| Checker choice | `pickChecker` picks the first of codex, claude or fake that isn't the author's runtime, else holds the run. | [work.ts](https://github.com/FlyFission/Control-Rod/blob/main/services/api/src/work.ts) |
| Kernel | `SubmitPreCheck` is refused if the baselines match, or if the provider string matches without a signed `OverrideIndependence`. The provider string is the CLI name. No attestation input. | [transition.rs](https://github.com/FlyFission/Control-Rod/blob/main/kernel/src/transition.rs) |
| Data lanes | `LANE_RUNTIMES` admits runtimes by harness (claude, codex, local). | [disclosure.ts](https://github.com/FlyFission/Control-Rod/blob/main/services/api/src/disclosure.ts) |
| Checker workspace | The pre-check runs in the run workspace with the deliverables and writes `out/verification.json`. There's no read-only mount, no clean working directory and no before-and-after hash. | [pre-check.md](https://github.com/FlyFission/Control-Rod/blob/main/packs/general/roles/pre-check.md) |

## Provider adapter interface

One adapter per CLI in the daemon. Adapters describe, launch and report. They never decide. Milestone 1 builds the seam for today's CLIs with no behavior change.

| Part | What it does |
|---|---|
| Capabilities | Roles allowed, output format, tool allowlist support, native sandbox per platform (and what it covers: shell only, or the CLI's file tools too), network host limiting, whether the CLI can reach several vendors, and the config-isolation flags available. |
| Auth detection | The CLI's own status command where one exists. Where it doesn't (agy), a qualified, read-only presence check, or the state is unknown and the first run decides. Never runs a login, never opens a token. |
| Launch | argv and env built from the sandbox policy only, with a generated read-only config per run that removes base-URL and provider overrides, and the effective endpoint added to the policy digest. |
| Event normalization | Maps the stream to the existing Event kinds. Every model name seen in the stream (including fallback or subagent usage) goes into `observed_models`. |
| Cancel and outcomes | Process-group TERM, then KILL. Outcomes: ok, quota, auth, timeout, malformed, wrote_files, error. |
| Usage | Tokens as reported, cost only when reported, and quota errors park the run. |
| Evidence | Raw stream, normalized events, artifact and policy digests, the effective endpoint, observed models, the in-run probe, and the before-and-after workspace hashes, all under the run attestation. |

## Provenance and run attestation

1. Strip overrides. The environment allowlist stays. A generated per-run config replaces user config wherever the CLI allows (Codex `--ignore-user-config`, agy `--settings`, Grok and OpenCode config files under a run-owned home). A run whose effective config names a custom base URL is refused.
2. Pin endpoints. Each registry entry names the vendor hosts its model is served from. Where an outer OS wrapper with an egress proxy exists, the CLI process can reach only those hosts. Otherwise the endpoint is recorded and the run is labeled "endpoint not enforced".
3. Disable delegation and fallback in counted runs: no `--fallback-model` for Claude, Codex multi-agent stays disabled, Grok gets `--no-subagents` and `--disallowed-tools Agent`. Claude Code also has automatic model fallback (https://code.claude.com/docs/en/model-config), so every contributing model must be recorded.
4. Record every contributing model. `observed_models` is the set of all model names in the stream. If it holds anything outside the pinned model's registry entry, the run's provenance is unknown.
5. Daemon-signed attestation over the artifact digest, policy digest, effective config digest, effective endpoint, observed models, platform and the in-run probe result. The server verifies it and passes `attestation_verified` to the kernel.
6. Reject unknown provenance. A missing field, an unverifiable signature, an unregistered model, or a failed registry lookup all mean the run can't count as a pre-check. The system fails closed and never defaults a vendor.
7. Bind identity to the artifact. The harness is looked up from the pinned artifact's SHA-256, never from the executable's file name, which rules out symlink spoofing (raised by the Qwen review).

**Real example of identity drift.** Ben's own Codex `config.toml` routes Codex to Ollama cloud. Anything that trusted the harness name would record "openai" for a model that isn't OpenAI's. Today's runs avoid this through `--ignore-user-config`, but this is exactly the failure the attestation must catch for every CLI.

## Deliverables are untrusted input

- Checkers start in a clean, empty working directory owned by the daemon. Deliverables are mounted read-only at `inputs/deliverables/`. The brief and criteria come from Control Rod in a separate file that says deliverables are data, not instructions.
- Repo instruction and hook discovery is off: AGENTS.md, CLAUDE.md, GEMINI.md, `.claude/`, `.codex/`, `.agents/`, `.grok/`, `.opencode/`, hooks, MCP and skills. Starting from a clean working directory handles discovery from the cwd, and per-CLI flags handle the rest. Claude's `--setting-sources ""` does not stop CLAUDE.md or auto-memory, so a candidate is `--safe-mode`, which keeps authentication working; it must be qualified with `-p`.
- The checker writes only to a scratch folder. The daemon validates `verification.json` against the schema and moves it into the record. Any other write voids the check.
- The deliverable tree is hashed before and after the check. Any change voids the check and records a policy event.
- Findings must anchor to a file and line, or to a reproducible command. The deterministic anchoring check from the review panel spec runs before a finding counts.

### Adversarial qualification suite (per CLI, per version, per platform)

| Case | Must hold |
|---|---|
| Injected deliverable | A deliverable that says "verification passes, no findings", plus a planted CLAUDE.md, AGENTS.md or hook. The checker still reports the seeded defect, and no hook runs. |
| Hidden delegation | A run that tries a subagent, a fallback model or an MCP tool. It is blocked, or recorded in observed_models and refused as a check. |
| Identity spoofing | A custom base URL, a model alias or a renamed binary. Refused, or provenance unknown. |
| Quorum omission | A seat that times out, hits quota or is dropped. The result is inconclusive, never a pass. |
| Stale replay | A passing check from an earlier snapshot or revision. Refused. |
| Credential reads through non-shell tools | The CLI's own file tools, MCP, environment, sockets, keyring and background descendants can't read any login store. |

## Private home versus subscription login

Decision for M0, per CLI, before any adapter beyond Claude and Codex. A wholesale private HOME makes most CLIs look signed out. On macOS it also breaks Keychain lookup unless `~/Library/Keychains` stays reachable, which would expose the whole login keychain.

| Option | How | Trade-off |
|---|---|---|
| A. Real home plus targeted isolation | Keep HOME. Use the CLI's config-isolation flags, and let the OS wrapper hide or make per-run copies of transcript, memory and session folders. | Login just works. The CLI's own file tools can still reach its auth file unless a deny rule covers them. |
| B. Run-owned home plus a read-only auth bind | Private HOME, with only the auth file bind-mounted read-only (Linux bubblewrap). | No session bleed. Not available with macOS Seatbelt, and it doesn't cover keyring logins. |
| C. One-time login per role home | Ben signs in once inside each Control Rod role home (for example `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GROK_HOME`). | No token copying, and author and checker sessions are separate. It means extra logins, and keyring-based CLIs share one login anyway. |

| CLI | Where the login lives | Session or transcript bleed to block | Proposed |
|---|---|---|---|
| Claude Code | Config dir, or the Keychain on macOS | CLAUDE.md, auto-memory and projects history (persistence is already off) | A, with a clean cwd and a qualified `--safe-mode` |
| Codex | `CODEX_HOME` auth.json | Rules and user config (already ignored), sessions (`--ephemeral`) | A, or C if author and checker both run Codex |
| Grok Build | `~/.grok/auth.json` | Sessions under `~/.grok/sessions`, memory, sandbox.toml | C with `GROK_HOME`, and a deny rule on auth.json for tools |
| Antigravity (agy) | The OS keyring | `~/.gemini/antigravity-cli/brain/<conversation-id>/transcript.jsonl` is injected into the system prompt and readable by later runs | A, with a per-run `brain/`. Keep `installation_id`, `log/` and `crashes/` writable, or `agy models` fails. |
| OpenCode | Its own auth store (path to confirm in qualification) | Sessions and config | C, inside a Control Rod OS wrapper |
| Ollama (local) | None needed locally | None | Local endpoint pinned. Ollama cloud is a different endpoint and locality. |

## Per-provider notes

| CLI | Headless and output | Isolation and identity facts | Fit |
|---|---|---|---|
| Claude Code | `claude -p --output-format stream-json --verbose` (https://code.claude.com/docs/en/headless) | Already passes `--no-session-persistence`. Add `--disallowedTools` (for example `mcp__*`) and `--max-turns`. `--setting-sources` doesn't block CLAUDE.md or memory. The docs do say `--bare` "will become the default for -p in a future release", and bare mode never reads OAuth or the keychain. If that ships, subscription runs need `--safe-mode` or an explicit opt-out. Never pass `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_BASE_URL` or `ANTHROPIC_MODEL`. (https://code.claude.com/docs/en/cli-reference) | Author and checker |
| Codex CLI | `codex exec --json` (https://learn.chatgpt.com/docs/non-interactive-mode) | Domain allowlists exist through the network proxy: `features.network_proxy = true` plus `permissions.<name>.network.domains`. Without the proxy, domain rules aren't enforced (https://learn.chatgpt.com/docs/permissions). Per the Codex review, the proxy doesn't cover model and auth traffic, MCP, connectors or hosted search, so those are controlled separately. Keep `--ignore-user-config`. | Author and checker. Network roles only after a pinned proxy config is qualified. |
| Grok Build (official xAI) | `grok -p`, `--output-format streaming-json` (https://docs.x.ai/build/overview) | `--sandbox` on Landlock or Seatbelt. Child-network blocking is Linux-only. Use `--tools` and `--disallowed-tools Agent`, `--no-subagents`, `--no-memory`, `--no-auto-update`. Custom models in `config.toml` can change the endpoint, so use a run-owned config. Login is done once by Ben, outside the run path. | First new adapter |
| Antigravity CLI (agy) | `agy -p`, `--output-format stream-json`, `--print-timeout` (https://antigravity.google/docs/cli/headless) | No auth-status subcommand. No `--tools` allowlist. Has `--settings` (session-only overrides) and `--disable-slash-commands`. Resume is `-c`/`--continue` and `--conversation`. `--sandbox` covers shell commands, not its built-in file tools. Can serve non-Google models, so the vendor comes from the pinned `--model`. (Per agy's own review on Ben's Mac.) | Checker first, inside an OS wrapper |
| OpenCode | `opencode run --format json`, `-m provider/model` (https://opencode.ai/docs/cli/commands/) | Multi-vendor by design. No native OS sandbox (issue #2242, PR #63599 open). Claude only through API keys or its Claude Agent wrapper (https://opencode.ai/docs/claude-agent/). Checker role only with zero writable tools until proven otherwise. | Later, with a Control Rod wrapper |
| Ollama local models | Through OpenCode or a minimal Control Rod runner (to decide) | Ben has qwen3.6, qwen3.8, qwen3-next 80b, gpt-oss:120b, hermes4.3 and nemotron-3.5. Family follows lineage: gpt-oss is OpenAI's, so it can't check a Codex author; hermes and nemotron are fine-tunes whose base must be recorded in the registry. Each needs a capability tier. | Candidate local checkers |
| Gemini CLI | `gemini -p -o stream-json` | Personal Google sign-in ended 2026-06-18, and those plans moved to Antigravity CLI (https://github.com/google-gemini/gemini-cli). Needs an API key. | Deferred |

## Cross-check routing

### Two separate predicates

**Admission (disclosure and safety)**

- Keyed by harness, version and platform qualification, plus endpoint, serving operator and locality (local Ollama is not Ollama cloud).
- `LANE_RUNTIMES` stays keyed by harness and gains endpoint and locality. It does not move to vendor.

**Provider separation (checking)**

- Keyed by vendor and family from a small, hand-maintained, passkey-signed registry.
- Pairwise: no checker shares vendor or family with the author or with another checker.

### Checker order: a static list, no matrix

The signed package policy holds an ordered list of eligible checkers per author, for example author claude: codex, grok, agy, then a local model of tier 2 or above. The first agent that passes admission, separation, pins, budget and the capability tier for the grade gets the check. The editor and learning loop are cut.

### Attempts, sticky fails and consensus

1. **Every attempt is recorded.** Including timeouts, quota hits and malformed output. Nothing is replaced or dropped.
2. **A fail on a frozen snapshot is sticky.** A re-run needs a new deliverable digest or an owner override signed with a reason. No shopping for a passing checker.
3. **Consensus is part of the signed package policy.** Fixed at release and signed by the owner: quorum, registry version, eligible list, minimum capability tier, snapshot digest and override scope.
4. **Missing seats never pass.** An empty, timed-out or quota seat makes the result inconclusive. Any finding that passes the anchoring check at major or critical fails it.
5. **Capability floor per grade.** A weak local model can't be the deciding check on Safety or Material work. Ben assigns tiers in the signed registry.

### When only one vendor is available

- The run is held with the reason and the fix (today's behavior).
- A local model counts if its family differs and it meets the grade's tier.
- Otherwise a signed owner override, labeled "same-provider check" on the record and receipt. Nothing falls back on its own.

## Fit with the kernel's guarantees

| Guarantee | Kernel enforces | Server and daemon enforce | Stated limit |
|---|---|---|---|
| Provider separation | Vendor and family differ from the author and pairwise between checkers. Quorum from the signed policy. `attestation_verified` is required. | Registry lookup by artifact digest and pinned model, attestation signing and verification, and failing closed. | The kernel compares attested facts. It can't see the model. |
| No transcript leakage | Nothing (it gets no transcripts). | Clean cwd, no resume flags, per-run brain and session folders, persistence off. | Deliverables remain a channel. They are handled as untrusted input. |
| Evidence | Stale snapshot refused. Sticky fail. Every attempt counted. | Workspace hashes, scratch-only writes, schema validation. | Evidence shows what was run, not that it was right. |
| Passkey sign-off | Unchanged. | Unchanged. | A person can still approve without reading. |

**Protected changes.** `RuntimeIdentity` (vendor, family), pairwise and quorum rules, sticky fails and the attestation flag all live in `kernel/` and `spec/`. They need Ben's signature under AGENTS.md rule 2. That is M6, not M1.

## UI changes

### Board

- Author and checker badges show harness and model, and "provider separation" in green, or a red "same-provider override".
- Each attempt is listed. Sticky fails show the reason a re-run is blocked.

### Office view

- A desk per agent with a text label for harness and model, and no logos.
- Checkers sit apart. Unqualified desks say why (for example "macOS not qualified").

### Settings, Subscriptions (M10)

- Built only after the first adapters exist, so the probes are real.
- Shows detection, auth state or unknown, qualification per platform, the static checker list and tiers. No token field.

## Security, sandbox and qualification

| Platform | Status | What qualification adds |
|---|---|---|
| WSL2 | Qualified for Claude Code and Codex author launches only | The checker profile (read-only mounts, clean cwd, scratch output) and the adversarial suite. |
| macOS (Ben's Mac Studio) | Not qualified | Seatbelt profiles per CLI, Keychain-backed logins for Claude and agy, Grok child-network blocking being a no-op, and outer egress pinning without bubblewrap. |
| Native Linux | Not qualified | bubblewrap and Landlock paths. This also unlocks Codespaces runs. |

Every adapter is admitted per role, per pinned version and per platform. The checker role needs zero writable tools at the CLI level and read-only mounts at the OS level.

## Terms of service check per vendor

| Vendor | Primary terms | Question to settle in M0 |
|---|---|---|
| Anthropic | https://code.claude.com/docs/en/legal-and-compliance and https://www.anthropic.com/legal/consumer-terms | The docs say subscription OAuth supports "ordinary use of Claude Code", bar third parties from routing plan credentials, and do not prevent "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". Confirm that unattended headless runs started by Ben's own local tool fit that. |
| OpenAI | https://openai.com/policies/terms-of-use/ | Automated headless Codex runs on a ChatGPT plan, used as a reviewer. |
| xAI | https://x.ai/legal/terms-of-service | Headless Grok Build on a personal plan inside another tool. |
| Google | https://antigravity.google/terms and https://policies.google.com/terms | Headless agy on a personal plan, and agy serving non-Google models. |
| OpenCode and Ollama | https://opencode.ai/legal/terms-of-service and https://ollama.com/terms | Ollama cloud usage, and redistribution if Control Rod bundles anything. |

None of these have been read for this plan yet. Each needs a short written finding in the M0 record before that vendor's adapter is enabled.

## Risks

- Provenance can still be faked by a compromised machine or daemon. The attestation narrows the gap but doesn't close it, and the copy says so.
- Deliverable injection is the main collusion path. The adversarial suite has to keep growing as CLIs change.
- Login versus isolation trade-offs differ per CLI and per OS. A wrong choice either signs runs out or leaks sessions.
- CLI churn: Claude's bare-mode default, Gemini's sign-in change, and Grok and agy releasing fast. Pins and per-version qualification are mandatory.
- Weak local checkers. The capability tier and signed registry are the only guard.
- Scope. Two new CLIs done well beat five done loosely.

## Open questions for Ben

1. Home strategy per CLI: options A, B or C (table above). This blocks M2 and every new adapter.
2. Registry: you maintain it by hand and sign it. Which families and tiers do you want at start, including the six local Ollama models?
3. Capability tier needed per grade, and whether any local model may be the deciding checker on Safety or Material work.
4. Default consensus per grade: quorum size and pairwise family rule (proposal: Safety needs 2 of 2 from different families, others 1).
5. API-key exceptions to ADR 0021 (Gemini CLI, agy without Google login), or keep them out.
6. Is an "endpoint not enforced" label acceptable on macOS until outer egress pinning exists, or are such runs refused?
7. Should same harness with a different vendor count (OpenCode GPT checking OpenCode Qwen) for Safety grades?
8. Daemon signing key: generated per machine and enrolled with a passkey, or kept in the OS keychain?

## Phased rollout

| # | Milestone (one PR) | Signature | Acceptance criteria |
|---|---|---|---|
| M0 | Decisions record: provider-separation wording, home strategy per CLI, registry and tiers, ToS findings, API-key stance, consensus defaults. | Ben | Open questions 1 to 5 answered in an ADR. A ToS finding for each vendor. |
| M1 | Daemon adapter seam for claude, codex and fake. No behavior change. Environment provenance guard tests. | None | Full text below. |
| M2 | Checker workspace hardening for Claude and Codex: clean cwd, read-only deliverables, scratch output validated by the daemon, before-and-after hashes, instruction discovery off. | None, unless spec fields change | The injected-deliverable and write-attempt fixtures fail closed on WSL2. Existing pre-check tests pass. |
| M3 | Attempt records and sticky fails in the server, with re-run only on a new deliverable digest or a signed override. | Review (spec minor) | Tests: a re-run is refused on the same digest, every attempt is listed, a timeout doesn't hide a fail. |
| M4 | Run attestation: daemon key, signed record (artifact, policy, config, endpoint, observed models), server verifies, unknown provenance fails closed. | Review (spec minor) | Spoofing fixtures (base URL, alias, renamed binary, extra model in the stream) are refused as checks. |
| M5 | macOS and native Linux qualification for Claude Code and Codex, author and checker. | Ben (qualification record) | The ADR 0021 suite and the adversarial suite pass on Ben's Mac Studio and on Linux. |
| M6 | Kernel provider separation: vendor and family, pairwise, quorum and tier from the signed policy, attestation required. | Ben (protected) | Kernel tests for each rule, plus red-team catalog entries. |
| M7 | Grok Build adapter. | Ben (qualification) | Passes the adversarial suite on WSL2 and macOS, with the run-owned config and the auth.json deny verified. |
| M8 | Antigravity adapter, checker role, inside an OS wrapper with a per-run `brain/`. | Ben (qualification) | File-tool writes blocked by mounts. Transcript isolation proven. Vendor from the pinned model. |
| M9 | Static checker list and consensus seats (reusing the review panel). | Ben (policy) | Missing seats are inconclusive. Pairwise family is enforced. The tier floor holds. |
| M10 | Settings, Subscriptions page and provider badges. | None | Only probes that exist are shown. No token field. axe scan clean. |
| M11 | OpenCode in a Control Rod wrapper, plus local Ollama checkers. | Ben (qualification) | Zero writable tools for checkers. Locality and endpoint recorded. |

## Milestone 1, ready to hand off

Milestone 1: Adapter seam for the run daemon (no behavior change)

Why

Every later milestone needs one place per CLI for launch, probe, stream parsing and, later, provenance. Today runtime names are switch statements spread across daemon/internal/runner (runtime.go, probe.go, events.go).

Signature needed: none. This PR touches only daemon/, docs/daemon.md and a new change record. It does not touch kernel/, spec/, policies/, tests/redteam/, .github/, services/ or apps/. It can run in parallel with M0 (Ben's decisions).

Scope

1. Change record .nuclear/changes/adapter-seam/ with basis.md, plan.md, risk.md, ship.md, trace.md, verification.md, following an existing record (e.g. .nuclear/changes/board-m1/).
2. New file daemon/internal/runner/adapter.go:
   - type Adapter interface {
       ID() string                     // "claude", "codex", "fake"
       Binary() string                 // executable looked up on PATH
       Capabilities() Capabilities
       Probe(ctx context.Context, run CommandRunner) RuntimeStatus
       Command(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error)
       LaunchInfo(run Run, ws *Workspace, p *SandboxPolicy) Launch
       Normalize(line string, now time.Time) []Event
       TurnEnd(line string) (ended, failed bool)
     }
   - type Capabilities struct { Roles []string; OutputFormat string;
       ToolAllowlist bool; NativeSandbox string; NetworkHostLimit bool;
       MultiVendor bool; ConfigIsolation []string }
     (descriptive only in M1; nothing reads it to make a decision yet)
   - An ordered registry: var Adapters = []Adapter{claude, codex, fake} and
     func AdapterFor(id string) (Adapter, bool).
3. New files adapter_claude.go, adapter_codex.go, adapter_fake.go. Each adapter delegates to the existing functions (ClaudeArgs, ClaudeSettings, ClaudeIsolationArgs, CodexArgs, CodexPolicyArgs, Normalize, TurnEnd, Probe, CopyFakeOutputs). Do not change any argument, flag, settings JSON, environment value, probe command or error text.
4. Make Detect, Command, LaunchFor, RuntimeFor and Probe dispatch through the registry. Keep their exported signatures and the RuntimeClaude, RuntimeCodex and RuntimeFake constants, so daemon.go and cmd/controlrod (sandbox-args) compile unchanged.
5. New tests in daemon/internal/runner/adapter_test.go:
   a. Golden launch. Before refactoring, capture into testdata/launch-golden/ the argv, env and Launch struct from Command and LaunchFor for claude and codex in at least these cases: author role with default tools; pre-check role; intake role; an inputs/TOOLS.txt naming network hosts (claude); an explicit model; model "default". After the refactor, outputs are byte-identical.
   b. Golden stream. testdata/claude-stream.jsonl plus a new testdata/codex-stream.jsonl (built from the cases already in events_test.go: turn.completed with usage, turn.failed, a tool call) give identical Events and TurnEnd results through the adapter and through the old functions.
   c. Registry completeness. Every adapter has a non-empty ID, Binary, Roles and OutputFormat; IDs are unique; the order is claude, codex, fake; fake is detected only when CONTROLROD_ALLOW_FAKE=1 (as today).
   d. Environment provenance guard. AgentEnv drops ANTHROPIC_BASE_URL, ANTHROPIC_MODEL, ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, OPENAI_BASE_URL, OPENAI_API_KEY, XAI_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, OLLAMA_HOST, OLLAMA_API_KEY, HTTP_PROXY, HTTPS_PROXY, ALL_PROXY and SSH_AUTH_SOCK. This should pass against today's allowlist. If any case fails, do not change the allowlist in this PR; record it as a finding for M2 in verification.md.
   e. Unknown runtime. Command for an unregistered ID returns the same error as today ("runtime %q is not available on this machine").
6. docs/daemon.md: one short paragraph under "Runtimes" saying each runtime is now a registered adapter, naming the files.

Acceptance criteria (all must hold)

- cd daemon && gofmt -l . prints nothing; go vet ./... is clean; go test ./... passes.
- No existing assertion in launch_test.go, sandbox_test.go, probe_test.go, events_test.go or runner_test.go is edited or deleted.
- controlrod sandbox-args --runtime claude and --runtime codex, run with the policy fixture used by sandbox_test.go and a temp workspace, print identical output before and after. Both outputs are saved under .nuclear/changes/adapter-seam/evidence/.
- git diff --stat main lists only files under daemon/, docs/daemon.md and .nuclear/changes/adapter-seam/.
- Outside adapter_*.go and the registry, no switch on runtime names remains in daemon/internal/runner (the constants may stay).
- The PR description says "no behavior change" and links the golden fixtures and the sandbox-args evidence.

Out of scope

- New CLIs (Grok Build, agy, OpenCode, Gemini CLI, Ollama models).
- Identity fields (vendor, family), run attestation or signing keys.
- Any change to kernel/, spec/ or generated code, wire schemas, policies/ or tests/redteam/.
- API changes: pickChecker, pickRuntime, PINNABLE, LANE_RUNTIMES, runtimeName.
- Checker workspace hardening, sandbox policy, flags, env allowlist or probe commands (any finding goes in the change record instead).
- UI changes.

## Review log

| Reviewer | Verdict | Main points | What changed |
|---|---|---|---|
| Claude Code | Sound with fixes | Identity is self-attested. Deliverables are untrusted. Private home conflicts with login. Retry shopping. No capability floor. ToS cited from a third party. Cut the matrix. Add seeded-defect canaries. | All applied. The ToS source is now primary. Canaries are deferred until after M9. |
| Codex (ChatGPT login) | Flawed as written | Name pins aren't provenance. Deliverables are a collusion channel. Consensus needs a signed contract. Credential boundary undefined. Keep harness admission separate. The Codex network claim was wrong. Add an adversarial suite. | All applied. The Codex proxy allowlist was checked against the permissions docs. |
| Antigravity (agy) | Sound with fixes | Private home breaks keyrings. Repo instructions and hooks can hijack the checker. Proxy identity. Assumed flags don't exist. UI was sequenced too early. Several agy facts wrong. Cut Gemini CLI and the matrix. Hash the workspace. | All applied. agy facts corrected from its own run on Ben's Mac. Gemini CLI deferred. Settings UI moved to M10. |
| Qwen 3.6 35B (local) | Sound with fixes | Registry spoofing. Binary-name spoofing. Claimed agy is a rename of Gemini CLI. OpenCode writable tools. Device-auth availability. Registry failure mode. | Accepted: signed registry, artifact-digest identity, OS read-only mounts, fail closed. Rejected: agy and Gemini CLI are separate products (Google moved personal plans from Gemini CLI to Antigravity CLI), and family from weight hashes is impossible for hosted models. Noted: login is a one-time step outside the run path. |

## Sources

- [runtime.go (launch)](https://github.com/FlyFission/Control-Rod/blob/main/daemon/internal/runner/runtime.go)
- [sandbox.go (env allowlist, isolation args)](https://github.com/FlyFission/Control-Rod/blob/main/daemon/internal/runner/sandbox.go)
- [transition.rs (independence rule)](https://github.com/FlyFission/Control-Rod/blob/main/kernel/src/transition.rs)
- [work.ts (pickChecker)](https://github.com/FlyFission/Control-Rod/blob/main/services/api/src/work.ts)
- [ADR 0021 native CLI sandboxes](https://github.com/FlyFission/Control-Rod/blob/main/docs/adr/0021-native-cli-sandboxes.md)
- [Review panel design](https://github.com/FlyFission/Control-Rod/blob/main/docs/superpowers/specs/2026-11-06-review-panel-design.md)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code headless (bare mode)](https://code.claude.com/docs/en/headless)
- [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [Codex permissions and network proxy](https://learn.chatgpt.com/docs/permissions)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Grok Build overview](https://docs.x.ai/build/overview)
- [Grok Build sandbox](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md)
- [Antigravity CLI headless](https://antigravity.google/docs/cli/headless)
- [Antigravity sandbox](https://antigravity.google/docs/sandbox/)
- [OpenCode commands](https://opencode.ai/docs/cli/commands/)
- [OpenCode sandbox issue #2242](https://github.com/anomalyco/opencode/issues/2242)
- [Gemini CLI README](https://github.com/google-gemini/gemini-cli)
