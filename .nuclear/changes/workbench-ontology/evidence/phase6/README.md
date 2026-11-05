# Phase 6 evidence: sandbox policy, native launch and preflight

Plan tasks 6.1 to 6.3 under ADR 0021 (still Proposed and conditional, awaiting the owner). Host: WSL2 (Ubuntu), Claude Code 2.1.318, Codex 0.166.0, bubblewrap and socat from the distribution. No real credential or prompt was used: Claude Code ran against the scripted provider from spike S-0 over loopback with a fixture key, and Codex ran `codex sandbox` with no model.

## Experiments that shaped the launch

Each was run with a positive control (the same thing without the setting, which must leak) so a pass means the setting did the work.

| Question | Result | Consequence |
|---|---|---|
| Does user or project configuration reach a Claude Code run? (`spikes/runtime-confinement/ambient_config_check.py`) | Without isolation flags the user `CLAUDE.md`, a project `CLAUDE.md`, a user hook and user MCP servers all reach the run. With `--strict-mcp-config`, an empty `--mcp-config` and `--setting-sources ""`, none do. | Those flags on every Claude Code launch. |
| Can a parent folder be denied with the workspace inside it? | Codex: yes; the daemon's token and other runs' workspaces are refused and the workspace stays writable. Claude Code: no; denying the parent closes the workspace too. | Codex denies the home folder and the daemon home outright. Claude Code relies on the next row for them. |
| Does `permissions.blockReadsOutsideWorkingDirectories` confine reads? | Yes, for commands and file tools: the home folder outside the workspace (login, daemon token, other runs) is refused; system files and the workspace work. | Always on for Claude Code. It also covers credential stores nobody listed. |
| Where can Claude Code commands write? | Writes outside the workspace in the home folder succeed inside the run but never reach the host (a throwaway layer); `/tmp` and paths outside home are read only. The Write tool, auto-approved, could write outside the workspace. | `--restricted` confines the file tools to the workspace; writes are judged by host evidence. |
| Can Codex deny a folder inside a denied folder? | No: bubblewrap fails to set up the sandbox. | Codex receives only the outermost existing denials. |
| Does a real Codex launch work with the home folder denied? (live, owner's login) | No: Codex re-runs its own binary inside the sandbox for file access, and an install under the home folder (`~/.npm-global`) is then unreachable. Reopening its folder inside a denied home is not possible. Denying the home folder entry by entry, except the folders leading to the workspace and to Codex's own install, works. Links in the home folder (here `~/.aws` and `~/.azure`, into the Windows drive) must be denied at their targets, since bubblewrap cannot mount over a link. | Codex denials are built per entry (`codexDenials`), keeping the probed install's folder. |
| Which Codex features are on by default? | 0.166.0 enables apps, browser use, computer use, plugins, hooks, memories, multi agent and more. | Each is switched off per run; the preflight refuses a version that leaves on anything not listed as qualified. |

## Launch qualification

`spikes/runtime-confinement/launch_qualification.py` runs exactly what `controlrod sandbox-args` prints for the control plane's no-network policy, in a throwaway home holding decoy secrets in the CLI login folders, SSH, GitHub CLI, AWS, a credential store no list names, a shell history file, the daemon's token and another run's workspace, with this run's workspace inside the daemon home. Results: [launch-qualification-wsl2.json](launch-qualification-wsl2.json).

| Check | Result |
|---|---|
| The probe with no sandbox reads every decoy, writes everywhere, reaches loopback listeners and sees the decoy environment variable | pass |
| Claude Code, daemon launch: every read refused by errno; writes to home, `/tmp` and through a symlink never reach the host; the workspace write does; internet, DNS and loopback refused or nothing arrived; no decoy in the environment | pass |
| Claude Code with the read confinement and denials removed leaks | pass |
| Codex, daemon profile: the same | pass |
| Codex with the denials removed leaks | pass |
| Claude Code's file tools refuse the unlisted store and the daemon token, refuse a write outside the workspace, and write inside it | pass |

## Live login check

`spikes/runtime-confinement/live_login_check.py` sends one tiny prompt per CLI with the owner's ordinary login, from a scratch workspace in the daemon's home, launched exactly as `controlrod sandbox-args` prints it: [live-login-wsl2.json](live-login-wsl2.json). Claude Code and Codex both answered `OK`. No credential was read, copied or printed.

## Limits

- WSL2 only. macOS and native Linux are not qualified; ADR 0021 claims a platform only after it passes there.
- The Codex leg runs `codex sandbox` with the daemon's profile, not a full `codex exec` session with `apply_patch`; full sessions, every tool path and the adversarial configurations are plan task 6.4, a protected red team suite that needs the owner's signature.
- The scripted provider stands in for the real API, so a token refresh during a tool using run is not exercised.
- This shows the launch holds on this host now. Plan task 6.5 makes each run prove its own sandbox from inside.
