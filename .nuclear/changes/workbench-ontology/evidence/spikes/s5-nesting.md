# S-5: Codex sandbox nested in the outer driver

**Question.** Does Codex's own sandbox start inside the outer driver?

**Script.** `spikes/runtime-confinement/nesting_spike.py`. Raw output: [s5-nesting.json](s5-nesting.json). The srt case is in [S-1](s1-srt-driver.md) (`codex_sandbox_nests_and_enforces`).

## Setup

`codex sandbox` with `sandbox_mode="workspace-write"` runs a fixed probe twice: directly on the host, and nested inside a bubblewrap boundary like a confined run's (`--unshare-all`, read only system, workspace bound). The probe writes inside the workspace, writes outside it, and opens a network connection. No model or credential.

## Result

| Run | write_workspace | write_outside | network | outside marker on host |
|---|---|---|---|---|
| Host | allowed | refused (OSError) | refused (PermissionError) | no |
| Nested in bubblewrap | allowed | refused (OSError) | refused (PermissionError) | no |
| Nested in srt (S-1) | allowed | refused (OSError) | not probed | no |

## Findings

1. **`workspace-write` allows `/tmp` and `$TMPDIR` by default.** The first run wrote outside the workspace through `/tmp`. The daemon must always pass `-c sandbox_workspace_write.exclude_slash_tmp=true -c sandbox_workspace_write.exclude_tmpdir_env_var=true`.
2. **Inside srt, Codex's sandbox needs `allowNestedUserNamespaces: true`** in the outer policy (S-1 finding 6).

## Answer

**Yes.** Codex's sandbox starts and enforces inside bare bubblewrap and inside srt on this host.

## Limits

WSL2 only; `codex sandbox` command, not a full `codex exec` agent run with tool calls.

## Unblocks

Nesting policy: Codex lanes may layer Codex's sandbox inside the outer driver, with the `/tmp` exclusions mandatory.
