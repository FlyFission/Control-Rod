# ADR 0025: Usage limits from the CLIs, and CodexBar as an optional usage engine

- Status: Proposed on 2026-11-24. Accepted only with the owner's recorded yes on the pull request that adds it (ADR 0001, `docs/collaboration.md#sole-maintainer-sign-off`).
- Date: 2026-11-24
- Relates to: ADR 0021 (native CLI sandboxes: Control Rod never reads, stores, copies, relays or masks a token), ADR 0024 decision 4 (one usage gauge across subscriptions; "not reported" where a CLI reports nothing).

## Context

ADR 0024 decision 4 promised one usage gauge across the subscriptions people already pay for. The owner asked for it to be "useful and efficient for at least the top 10 harnesses" (2026-11-24).

Only two harnesses report their limits where Control Rod can read them without a token. Codex writes a `rate_limits` snapshot into its own session log, and Claude Code prints `rate_limit_event` lines in the `stream-json` output Control Rod already reads. No other harness was found to report its limits that way. Every other route found (oh-my-pi's fetchers, CodexBar's providers) reads the harness's login token or browser cookies and calls a provider endpoint. Many of those endpoints are undocumented and change without notice.

CodexBar (MIT, github.com/steipete/CodexBar) is an open-source usage tracker with more than 100 providers. Among them are Claude Code, Codex, Gemini CLI, Antigravity, Cursor, Copilot, opencode and opencode Go, Grok, Amp, Kiro, Factory Droid, Windsurf, Kilo and Warp. It ships a CLI for macOS and Linux with JSON output (`codexbar usage --format json`), and its maintainers keep each provider working as endpoints change.

## Decision

1. **Token-free readings first.** The daemon reads Codex's session-log snapshot and Claude Code's stream events. Both are on by default and need nothing installed.
2. **CodexBar is an optional usage engine.** When the person has installed the `codexbar` CLI, the daemon runs it in the background, at most every 5 minutes with a 60-second limit. It asks only for the providers enabled in the person's CodexBar settings, minus Claude Code and Codex, which decision 1 already covers. It keeps only the numbers: harness, window, percent used, window length and reset time. Free text from CodexBar (labels, account names, messages) is never kept, and the plan name and version are kept only when they match a fixed list or pattern. It never keeps an account name, email, diagnostic or error text. `CONTROLROD_CODEXBAR=off` turns it off.
3. **Control Rod still never touches a token.** ADR 0021 stands for Control Rod's own code. CodexBar does its own sign-in work under the person's control, as a tool the person chose to install. The control room says so in plain words where it shows CodexBar's numbers.
4. **Never guess.** A harness with no reading is shown as "not reported", never as 0%. Every reading shows its age and where it came from, and a window whose reset time has passed is marked stale.
5. **No bundling.** Control Rod does not ship, download or install CodexBar. It links to CodexBar's project page.

## Consequences

- With CodexBar installed, the control room covers the top harnesses. Without it, Codex and Claude Code still work.
- CodexBar may show a sign-in or Keychain prompt of its own on macOS the first time it reads a provider. Control Rod runs `codexbar usage` in its background mode with CodexBar's own Keychain access turned off (`CODEXBAR_DISABLE_KEYCHAIN_ACCESS=1`), and never asks it about Claude Code or Codex. A provider's own CLI that CodexBar launches may still prompt; CodexBar offers no switch for that.
- Native Windows is not covered by CodexBar. WSL uses the Linux build.
- A change in CodexBar's JSON output can break the reader. The reader fails closed: no reading, shown as not reported.

## Alternatives considered

- **Port oh-my-pi's fetchers (MIT) into Control Rod.** Rejected by the owner on 2026-11-24. Control Rod would read tokens itself, against ADR 0021, and would maintain each fetcher.
- **Token-free only.** Covers two harnesses, short of the owner's ask.
