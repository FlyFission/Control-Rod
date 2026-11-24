# Trace: control room and the usage-limits module

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| CR-01 The daemon reports Codex's 5-hour and weekly limits from Codex's own session log, with no token and no prompt text. | `daemon/internal/runner/usage.go`, `adapter_codex.go` (`UsageLogDir`) | `usage_test.go` `TestReadCodexUsage`, `TestCodexWindowIDs`, `TestCodexSymlinkNotFollowed` | implemented and tested |
| CR-02 The daemon reports Claude Code's 5-hour and 7-day limits from `rate_limit_event` lines on runs it already makes. | `usage.go`, `adapter_claude.go` (`ParseUsageLine`), `daemon.go` log hook | `TestParseClaudeRateLimit`, `TestLogBufferCapturesUsage`, `TestUsageReport` | implemented and tested |
| CR-03 The API keeps only contract fields, drops invented harnesses and credential-like text, and serves the reading to a signed-in person. | `services/api/src/usage-limits.ts`, `app.ts` | `services/api/test/usage-limits.test.ts` | implemented and tested |
| CR-04 The control room has movable, collapsible modules; the order survives a reload. | `apps/web/src/pages/ControlRoom.tsx`, `src/lib/control-room-layout.ts` | `control-room.test.tsx` | implemented and tested in jsdom |
| CR-05 The usage module shows reserve left, the reset countdown, the reading's age and source, colour only when low, and a harness with no source as not reported. | `src/components/UsageLimits.tsx`, `src/lib/usage-limits.ts`, `control-room.css` | `control-room.test.tsx` | implemented and tested in jsdom |

No kernel source file, policy, red-team fixture or workflow was edited.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
