# ADR 0021: Agent CLIs keep their own login; Control Rod sandboxes the commands they run

- Status: Proposed and conditional (owner direction 2026-10-30; independent review accepted with conditions; awaiting owner review)
- Date: 2026-10-30
- Amends: ADR 0010 on laptops; the runtime confinement specification's credential broker requirement

## Context
The runtime confinement specification asked for a credential broker: Control Rod would hold each provider credential and relay model traffic, and the agent CLI would never see a real login. Spikes S-1 and S-2 showed that works, but at a cost. Control Rod has to take over each CLI's login lifecycle (refresh, rotation, write back), and when it does not, the CLI breaks. In S-1, Codex tried to refresh its login inside the boundary and could not.

The owner's direction: "CLI logins should be super straightforward, dozens of folks do that... simple & secure is the way."

The threat that matters is an agent command (a shell command, a script, a build, a file read) taking the user's login or reaching the internet. Both pinned CLIs ship a command sandbox for exactly that. Spike S-6 measured them.

## Decision
1. Each agent CLI uses the user's ordinary login (`claude login`, `codex login`). Control Rod never reads, stores, copies, relays or masks a token.
2. Control Rod confines every agent action it enables (commands and the CLI's own file tools), using each CLI's built-in sandbox and permission rules, with settings Control Rod passes on every run and never writes into the user's own files:
   - **Claude Code**: `--settings` with the command sandbox enabled, `failIfUnavailable: true`, `allowUnsandboxedCommands: false`, `filesystem.denyRead` for `~/.claude` and `~/.codex`, `network.allowedDomains: []`; and `permissions.deny` rules for Read and Edit on both login folders, because Claude Code's own file tools run outside the command sandbox.
   - **Codex**: a permission profile passed as `-c` overrides: `default_permissions` set to a profile that extends `:workspace`, denies `~/.codex` and `~/.claude`, makes `/tmp` and `$TMPDIR` read only, and disables network. Control Rod never sets `sandbox_mode`, because Codex ignores permission profiles whenever it is set.
3. The CLI process itself talks to its own provider, as it does outside Control Rod. Which provider may receive which lane is decided before the run by the disclosure gate (specification 11.3 M-0); restricted lanes run local only and never start a cloud CLI.
4. Servers and managed cloud keep ADR 0010's OCI driver with microVM isolation; this ADR covers laptops and developer hosts.

## Conditions
Each is checked by Control Rod, not assumed. The first group comes from the independent review (`evidence/reviews/adr-0021/`); each is a test in plan task 6.4 before any confined lane is enabled.

- **Tool allowlist.** Only qualified tools are enabled. For Claude Code that starts as Bash, Read, Edit, Write, Grep and Glob; `WebFetch`, `WebSearch`, `Task` and `NotebookEdit` stay off until each is qualified. For Codex, `apply_patch` and shell; web search off.
- **No ambient extensions or settings.** No MCP servers, plugins or hooks the run did not declare; no user or project settings or rules (`--strict-mcp-config`, `--setting-sources` limited to Control Rod's own file; Codex equivalents). Workspace content can never configure the CLI that runs on it.
- **Denied read set.** The resolved CLI login locations plus common credential stores: `~/.ssh`, `~/.config/gh`, `~/.git-credentials`, `~/.netrc`, cloud CLI folders and keyrings.
- **Environment allowlist and no sockets.** Agent actions get an allowlisted environment with no provider, cloud or proxy secrets, and no Unix sockets (SSH agent, keyring, Docker).
- **Explicit write boundary.** Writes are allowed in the workspace and refused elsewhere by rule, not by an unanswered prompt; no additional directories.
- **Effective policy integrity.** Control Rod derives the settings from its own inputs only, records their digest on the run, and refuses unsupported overrides. Agents cannot write those inputs.
- **Before, not after.** Qualification and preflight complete before any agent action. A failed in-run probe stops the run, not only its verdict.

Operating conditions:
- **Preflight before every run.** The CLI is installed at its pinned version and signed in; the host has what the sandbox needs (bubblewrap on Linux and WSL2, plus socat for Claude Code); a Codex config that sets `sandbox_mode` anywhere refuses the run and names the line to remove. A missing piece refuses the run with the fix, never a fallback to an unsandboxed run.
- **Attestation inside every run.** A fixed probe runs as an agent command and through each enabled file tool: it must fail to read the denied set, fail to reach the network, and fail to write outside the workspace. Any success stops the run and refuses its verdict (specification 23).
- **Per pinned version.** A new CLI version is not used until the qualification suite passes on it, including a positive control (the same probe unsandboxed succeeds) and a deliberately weakened policy that must fail.
- **Per platform.** macOS and native Linux are claimed only after S-6 passes there; WSL2 is the only platform tested so far.

## Alternatives considered
- **Credential relay (S-2) and masked login files (S-1).** Both worked. Both put Control Rod in charge of the user's token and fight the CLI's own refresh; one broke a Codex refresh in testing. Rejected as more complex and more fragile, without stopping the threat above any better than the native sandboxes do.
- **Each CLI's sandbox at default settings.** Rejected: S-6 shows agent commands can read both login files under the defaults (observed at the pinned versions).
- **Account API keys per lane.** Rejected for laptops: one more secret for the user to create, paste and rotate.

## Consequences
- Easier: the user signs in once, as they already do. No token handling in Control Rod, nothing to refresh, nothing to leak from Control Rod's side.
- Harder: Control Rod depends on each CLI's sandbox behaving as configured, so the preflight, the in-run probe and the per-version recheck are mandatory, not optional.
- Given up: the relay could restrict which endpoint, model and request shapes reached the provider. Under this ADR the CLI process chooses its own provider calls; the model is pinned by the run's arguments and recorded from the CLI's own stream (ADR 0020), and provider admission per lane happens before the run.

## Evidence
`.nuclear/changes/workbench-ontology/evidence/spikes/s6-native-sandboxes.md`: on WSL2, for two login folders, Bash, Read and Write, and the Codex command wrapper, Control Rod's settings refuse login reads, network and writes outside the workspace, with positive and weakened controls; defaults leak; real prompts work with the normal login. That is a narrow result; the conditions above define what remains. Also `s1-srt-driver.md`, `s2-model-broker.md`, and the review in `evidence/reviews/adr-0021/`.
