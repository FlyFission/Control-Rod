# S-1: sandbox-runtime driver per CLI

> **Not adopted.** The owner chose the simpler design in [S-6](s6-native-sandboxes.md): each CLI keeps its normal login and its own command sandbox. This record stays as evidence of what was tried. Finding 1 below is corrected: the owner's Codex login was not harmed.

**Question.** Does sandbox-runtime run each pinned CLI under default deny with broker only egress on macOS, native Linux and WSL2?

**Script.** `spikes/runtime-confinement/srt_driver_spike.py`. Raw output: [s1-srt-driver.json](s1-srt-driver.json).

## Setup

`srt` 0.0.81 (ADR 0010's driver) with one policy for every leg:

- Reads: the owner's home denied, re-allowed only for the throwaway workspace, the tool binary's directory and srt's own package (srt runs its seccomp helper from there).
- Writes: the workspace only. `CLAUDE_CODE_TMPDIR` points srt's TMPDIR into the workspace; srt's default (`/tmp/claude`) is a host path shared by every sandbox.
- Network: allow list of one host per leg (`api.anthropic.com`, or `chatgpt.com` and `auth.openai.com` for Codex), TLS terminated by srt's proxy so a masked credential can be restored on egress.
- Credentials: Claude's OAuth token is passed to srt in `CLAUDE_CODE_OAUTH_TOKEN` and masked (sentinel inside, real value restored only toward `api.anthropic.com`). Codex's `~/.codex/auth.json` is masked by an extract pattern on its access and refresh tokens.

## Result (12 of 12)

| Check | Result | Observation |
|---|---|---|
| owner_credentials_unreadable | pass | `~/.claude/.credentials.json` does not exist inside |
| workspace_read_write | pass | |
| write_outside_never_reaches_host | pass | See finding 2 |
| write_system_path_refused | pass | `/var/tmp` is read only |
| no_raw_internet | pass | Raw TCP to 1.1.1.1 fails: no network namespace |
| allowed_host_reachable_via_proxy | pass | HTTP 404 from api.anthropic.com root |
| denied_host_refused | pass | example.com refused by the proxy |
| claude_answers_with_masked_token | pass | Real prompt, `result: "OK"` |
| codex_starts_under_srt | pass | `codex-cli 0.166.0` |
| codex_sandbox_nests_and_enforces | pass | Codex workspace writable; a path srt allows but Codex should not is refused |
| codex_answers_with_masked_login | pass | Real `codex exec` prompt, agent text `OK` |
| token_never_written_to_spike_files | pass | Claude and Codex secrets scanned |

## Findings

1. **Token refresh must never happen inside the boundary (critical for the design).** Codex decided its ChatGPT login was due for refresh (last refresh ten days earlier) and refreshed from inside the sandbox. Its refresh attempts failed with "refresh token was already used" and it could not write to the read only masked file; the prompt still answered on the existing access token. **Correction:** the owner's login was not harmed; Codex refreshed its own login successfully later the same day. The lesson is the one the owner drew: hiding or relaying a CLI's login fights the CLI's own lifecycle. Leave the login alone and sandbox the commands instead ([S-6](s6-native-sandboxes.md)).
2. **A denied read region is an empty scratch mount, not a refusal.** Writing into a denied directory "succeeds" inside but never reaches the host. Attestation must test persistence on the host, not the return code inside.
3. **srt needs `socat` and `ripgrep` on Linux and fails late without them;** the daemon's preflight must check both, plus the seccomp helper being readable under the read policy.
4. **srt treats the command's own flags as its own** unless the command follows `--`. The driver must always pass `--`.
5. **`codex exec` blocks waiting on stdin;** the driver must close stdin.
6. **Codex's nested sandbox needs `allowNestedUserNamespaces: true`** in srt's policy. That widens the outer boundary slightly; record it as a named policy difference for Codex lanes.

## Answer

**WSL2: yes for both pinned CLIs**, with real prompts and masked logins, as long as the driver follows the findings above. **macOS and native Linux: not run**; they need their own runs before WB-15 claims those platforms.

## Limits

One WSL2 host. srt's TLS termination puts a proxy CA in the child's trust store; both CLIs accepted it at these versions, which a future version that pins certificates could break. S-1 alone does not provide capability separation: tools and model client share the srt boundary here. S-0's split (or a qualified tool sandbox) is still required.

## Unblocks

The ADR 0010 driver on WSL2, and a simpler model broker design: srt's credential masking can replace the hand written broker in [S-2](s2-model-broker.md) for egress, provided refresh stays outside (finding 1).

## Rerun

`python3 spikes/runtime-confinement/srt_driver_spike.py --srt <srt dist/cli.js> --claude <native claude> --codex <native codex> --deps <dir with socat-wrap and usr/bin/rg>`. Running it can trigger a Codex token refresh; run it only right after a fresh `codex login`, or drop the Codex exec leg.
