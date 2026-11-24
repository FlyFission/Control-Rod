# Basis: control room and the usage-limits module

**Change slug:** `control-room-usage`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Status:** In build.

## Mission / need

People who seat several agent CLIs at the table run into each subscription's limits (Codex's 5-hour and weekly windows, Claude's 5-hour and 7-day windows) without warning, and a card stalls mid-run. The owner asked for a control room: a separate dashboard of movable modules with metrics, kept apart from the Plant view. Its first module shows how much of each agent subscription's limit window is used and when it resets, in the nuclear control room language of the reference board (`design/references/`, PR #167).

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Build a control room that shows agent usage, on brand. | "Oh-my-pi has this very cool table for usage.  I feel like we could have a control room that does this but with more excellence and on brand." | 2026-11-24, project chat | A new place, `/control-room`, whose modules the viewer can reorder. The first module is subscription usage limits. | Changes to the Plant view. |
| D2 | Reuse open-source code where it does this well. | "You dont have to reinvent the wheel, much open source code does this well already, leverage it." | 2026-11-24, project chat | Use permissive projects' schemas and patterns, with attribution, instead of designing new formats. | Copyleft or source-available code (AGENTS.md rule 4). |
| D3 | Cover the main harnesses, not only the ones with a token-free source. | "This needs to be useful and efficient for at least the top 10 harnesses." | 2026-11-24, project thread | The panel must cover about ten harnesses. How (a usage engine such as CodexBar, or ported fetchers) is a separate owner choice, asked on a decision card. | Which source is used; reading any login token (ADR 0021) until an ADR says so. |

## Sources reused

- **Codex**: the rate-limit snapshot Codex writes into its own session log (`token_count` events, `rate_limits.primary` / `secondary` with `used_percent`, `window_minutes`, `resets_at`). Field names from `openai/codex` (Apache-2.0), `codex-rs/protocol/src/protocol.rs` (`RateLimitSnapshot`, `RateLimitWindow`). Only the schema is used; no code is copied.
- **Claude Code**: the `rate_limit_event` message Claude Code prints in `stream-json` output, which the daemon already reads on every Claude run. Field names from the published Claude Agent SDK type `SDKRateLimitInfo` (`status`, `rateLimitType`, `utilization`, `resetsAt`).
- **Layout and wording**: oh-my-pi (MIT) groups windows per provider, with a bar, the percent and a reset countdown per window. Pattern only; its fetchers read login tokens and are not used.
- Other providers (opencode Go, Grok, Antigravity) have no token-free source the daemon can read today, so the module says "not reported", never 0%.

## The wire contract

The daemon adds `usage_limits` to the claim body, beside `subscription_report`:

```
UsageLimitsReport { read_at: string (RFC 3339); providers: UsageProvider[] (at most 8) }
UsageProvider {
  id: "claude" | "codex" | "grok" | "opencode" | "agy"   // registered adapters only
  source: "cli-log" | "cli-stream" | "none"
  observed_at?: string (RFC 3339)   // when the CLI recorded the snapshot
  plan?: string                     // /^[a-z0-9_-]{1,24}$/, e.g. "plus", "pro"
  windows: UsageWindow[] (at most 8)
}
UsageWindow {
  id: "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet" | "monthly" | "primary" | "secondary"
  window_minutes?: integer (1..60000)
  used_percent: number (0..100)
  resets_at?: string (RFC 3339)
  status?: "allowed" | "warning" | "rejected"
}
```

`GET /usage/limits` returns `{ reported: boolean, read_at?: string, providers: UsageProvider[] }`. The API drops unknown ids, unknown window ids, out-of-range numbers and any extra field.

## Exit criteria

The control room page shows the usage module with every reported window, its reset countdown and how old the reading is; a provider with no source says so; no token is read, stored or sent; modules can be reordered by pointer and by keyboard and the order survives a reload; unit tests for the daemon readers, the API cleaner and the page pass, and the page's axe scan is clean.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
