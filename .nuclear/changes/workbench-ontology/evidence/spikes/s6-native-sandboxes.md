# S-6: the CLIs' own command sandboxes, with the user's normal login

**Question.** Can Control Rod keep each CLI's ordinary login (`claude login`, `codex login`) untouched and still keep agent commands away from that login and the network, using only each CLI's built-in command sandbox and settings Control Rod writes?

Added after the owner's direction on 2026-10-30: "CLI logins should be super straightforward... simple & secure is the way." It replaces the relay and credential masking explored in [S-1](s1-srt-driver.md) and [S-2](s2-model-broker.md).

**Script.** `spikes/runtime-confinement/native_sandbox_spike.py`. Raw output: [s6-native-sandboxes.json](s6-native-sandboxes.json).

## Setup

A throwaway home holds decoy login files (`~/.claude/.credentials.json`, `~/.codex/auth.json`) containing a canary string; no real credential is involved. One fixed probe runs as an agent command and tries to read both login files, open raw TCP and HTTPS to the internet, write in the workspace, write in the home directory and write in `/tmp`.

- **Claude Code** runs on the host as usual. Its Bash tool runs the probe inside Claude Code's own sandbox. The model is the scripted provider from S-0, over loopback with a fixture key, so no real prompt is spent.
- **Codex** runs the probe under `codex sandbox`. No model is involved.

Each CLI runs twice: with its sandbox on at default settings, then with the settings Control Rod would always write.

**Control Rod settings, Claude Code** (passed with `--settings`, never written into the user's files):

```json
{"sandbox": {"enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false,
  "autoAllowBashIfSandboxed": true,
  "filesystem": {"denyRead": ["~/.claude", "~/.codex"]},
  "network": {"allowedDomains": []}}}
```

**Control Rod settings, Codex** (a permission profile passed as `-c` overrides, never written into the user's `config.toml`):

```
-c default_permissions="control-rod"
-c permissions.control-rod.extends=":workspace"
-c permissions.control-rod.filesystem={"~/.codex"="deny","~/.claude"="deny",":slash_tmp"="read",":tmpdir"="read"}
-c permissions.control-rod.network.enabled=false
```

## Result

| Run | Read login files | Internet (raw, HTTPS) | Write workspace | Write home | Write `/tmp` |
|---|---|---|---|---|---|
| Claude Code, sandbox defaults | **readable (canary leaked)** | refused | allowed | refused | refused |
| Claude Code, Control Rod settings | refused | refused | allowed | refused | refused |
| Codex, `workspace-write` with `/tmp` exclusions | **readable (canary leaked)** | refused | allowed | refused | refused |
| Codex, Control Rod profile in `config.toml` | refused | refused | allowed | refused | refused |
| Codex, Control Rod profile as `-c` overrides | refused | refused | allowed | refused | refused |

Then one tiny real prompt per CLI, with the owner's normal login and the Control Rod settings: Claude Code answered `OK`; `codex exec` answered `OK`. Codex had refreshed its own login normally earlier the same day (`last_refresh` 2026-10-30T17:53Z), writing its own file as it always does.

## Findings

1. **The defaults are not enough.** With each sandbox on at default settings, an agent command can read both login files. Network is blocked, so the token cannot be sent directly, but it could be written into the workspace and leave through an output, a diff or a commit. Control Rod must always pass the read denials; they are a requirement, not a hardening option.
2. **Codex ignores a permission profile whenever `sandbox_mode` is set anywhere** (user config, a profile, or `--sandbox`). Control Rod must set only `default_permissions`, and the preflight must refuse to start a Codex run when the user's config sets `sandbox_mode`, naming the line to remove, because otherwise the protection silently does not apply.
3. **Claude Code needs `failIfUnavailable: true` and `allowUnsandboxedCommands: false`.** Without them, a host missing bubblewrap or socat runs commands unsandboxed instead of refusing.
4. **Login stays ordinary.** Neither CLI needed any change to sign in, refresh or answer. Control Rod never reads, stores, relays or hides a token.

## Answer

**Yes, for both pinned CLIs on WSL2:** the user's normal login plus each CLI's built-in command sandbox, with the settings above, keeps agent commands away from login files, the network and everything outside the workspace.

## Limits

WSL2 only; macOS and native Linux need the same run. The Codex leg exercises `codex sandbox`, the same enforcement `codex exec` uses for commands, not a full agent run with tool calls. A CLI update can change sandbox behaviour, so this probe runs again for every pinned version and inside every run (see the specification change that follows these spikes).

## Correction to S-1

S-1 said the sandboxed Codex run had probably spent the owner's refresh token. It had not: Codex later refreshed its own login successfully, and its login is valid. The in-sandbox refresh failed only because the masked file was read only.

## Rerun

`python3 spikes/runtime-confinement/native_sandbox_spike.py --claude <native claude> --codex <native codex> --deps <dir with socat-wrap and usr/bin/rg>` (no real prompts).
