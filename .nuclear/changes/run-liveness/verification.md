# Verification: run liveness after the agent is done

Evidence status: **pass** for RL-01 to RL-04 on this host (Linux, Go 1.24.7). **Open** for the raw-log cap (R-04) and for a real Claude Code or Codex run on the owner's Mac, which this change did not perform: every run here used the fake runtime, which streams a script's stdout exactly as the daemon reads a real runtime's.

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | With the settle release removed, three runs that reported their result then lingered all stayed running past the test's 20-second wait (the reported symptom). | `evidence/red-settle.log` |
| E-02 | pass | With the retry gate always due, a completion the control plane keeps failing was tried 100 times in 2 seconds; with it, a few. | `evidence/red-retry.log` |
| E-03 | pass | With the old `ChildEnv` and no Claude switch, the environment tests fail. | `evidence/red-env.log` |
| E-04 | pass | `go vet` clean and the whole daemon suite passes with `-race`. | `evidence/green-race.log` |
| E-05 | pass | The variables pnpm 10.28.0 gives a script, recorded, not assumed; the test fixture is built from them. | `evidence/pnpm-launcher-env.txt` |
| E-06 | pass | Claude Code 2.1.318 reads `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` to disable background tasks (binary digest recorded). Not checked on the version the owner has pinned. | `evidence/claude-background-switch.txt` |
| E-07 | open | Real-runtime behaviour on the owner's Mac. | Not executed |

## Evidence custody

All evidence was generated, selected, executed and presented by the implementing agent with the local toolchain, and verified only by self-check (mutation runs). No independent review was done.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).
