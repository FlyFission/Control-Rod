# Risk: agent update prompt

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-22 request.
- Decision owner: Ben Huffer. Spec change: additive (minor) changes to `spec/api.tsp`, made after the owner chose it on 2026-11-22; no spec major version, kernel decision function, policy, red-team fixture or workflow is touched. No database migration (settings rows only).
- Scope: `daemon/internal/agentupdate/`, `daemon/cmd/controlrod/`, `daemon/internal/runner/updates.go` and the claim loop, `spec/api.tsp` and its generated files, `services/api/src/agent-updates.ts` with the claim and runtimes wiring, `apps/web/src/components/AgentUpdates.tsx` in the shell, with their tests.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Software is installed without the person's consent. | Startup only logs. `agents update` shows each command and needs a yes, or `--yes`; without a terminal and without `--yes` it refuses (tests; confirmation removal fails a test, `evidence/mutation.log`). | Any install without a yes or `--yes`. |
| R-02 | A registry answer injects arguments into the install command. | The version must match a strict x.y.z[-pre] pattern before it reaches a command, and the command runs without a shell (test; guard removal fails it). | A command built from a value that is not a strict version. |
| R-11 | A runner (or anyone with the daemon token) plants a command that an operator copies and pastes. | No command text crosses the wire: the daemon reports `npm_global`, the contract refuses an entry with a `command` field or a `latest` that is not strict SemVer, and the app builds the command from a fixed package per agent (tests; removing either the contract or the app check fails one). | A shown or copied command containing text from the report other than a strict SemVer version. |
| R-12 | An incomplete check reads as "up to date", or wipes an update already found, including after a daemon restart. | A status that could not compare versions (or whose installed or latest version is not strict SemVer, such as `1.2.3-` or `1.2.3+build`) is "could not check" in the CLI, keeps the known entry in the daemon's report, and is named unchecked on the claim, with the installed version read, so the control plane keeps its row only while that installed version is unchanged, and without a command, since this check did not verify npm's provenance (a CLI updated past the known latest is never offered the older version); with no checkable agent found (none, or only Antigravity) the CLI says so instead of "up to date" (tests). | "Up to date" printed with an agent unchecked. |
| R-14 | A command is offered whose target is not newer than what is installed now: the CLI was updated while the daemon ran, a version is equal or older, or the same agent is named twice. | Before each claim the daemon compares each reported agent's binary stamp (resolved path, size, mode, modification time; a file stat, no process, no network, no timer) with the one taken at the check, and drops the update for good on any change. The API stores, and the panel shows and builds a command for, an entry only when `latest` is newer than `installed` by SemVer precedence; `installed` is required and strict. `agents update` installs each agent once and reads the installed version again after the yes, skipping one at or past latest (tests). | A command shown or run for a version not newer than the installed one. |
| R-15 | Remaining same-user timing windows (accepted). (a) Between the recheck after the yes and npm starting, the same user can still swap the CLI on PATH or install another version; npm then installs the stated version anyway. (b) Between the stamp and the version read at startup, an install shows as a changed stamp on the next claim and drops the update, so the window errs toward hiding. (c) Between the panel's refetch and the person pasting the copied command, the server may clear the update; the command is still the person's own to run, and npm installs exactly the version shown. Each needs the same user acting at that moment; none crosses a user or privilege boundary, and none runs anything without the person. | Recheck just before the install (path, npm copy, version); stamp before the version read; refetch on focus and before Copy (tests). | A window that lets another user, the browser or the control plane cause an install. |
| R-16 | A further stale-cache case in the panel (a cached list shown as current) is found after landing. | The panel shows a command only after the list updates past the mount or focus mark, refetches on mount and focus, and Copy refetches first (tests). By Ben's choice on 2026-11-23 to land after review round 13, any further stale-cache finding is a follow-up change, not a blocker for this one. | A stale-cache report after merge. |
| R-13 | With more than one daemon, one daemon's report replaces another's. | Control Rod has one daemon identity today: a single daemon token, no runner registry and no deregistration, and the runtime status beside this report is one snapshot the same way. The stored report is that daemon's. A row kept for an unchecked agent ends when that agent's check next finishes or the agent is no longer found. Per-runner rows belong with a runner identity, which is outside this change. | A second daemon identity added without keying this report by it. |
| R-03 | The update replaces a CLI installed by another tool, leaving two copies. | A command is offered only when the executable lies in npm's global folder for the package (`npm root -g`/<package>/); a project-local, pnpm or other-prefix copy, Homebrew or a native installer gets only its path (test; a looser match fails it). | A command offered for a non-npm install. |
| R-04 | An updated runtime is run unchecked. | The daemon already probes every 5 minutes and preflights a new artifact before launch; a pinned runtime refuses the new digest until it is pinned again, and `agents update` says so for Claude Code and Codex. | A run launched on an artifact no probe saw. |
| R-05 | The check slows startup or runs on a schedule. | It runs once, in a goroutine, bounded by 8 seconds; there is no timer. It can be turned off, and then the daemon reports an empty list so an earlier report is cleared (test). | Any repeated check without a person's action. |
| R-09 | A terminal update replaces a CLI a run is using. | The update is the person's own terminal action, as if they ran npm themselves; `controlrod agents update` says to update between runs before asking. The daemon never installs. | Control Rod starting an install by itself. |
| R-07 | Software is installed from the browser or the control plane. | No such path exists: the daemon only reports, the API only stores the report, and the app only shows and copies the command (tests: no take route, no `runtime.update` command, no install button, copying sends nothing). | Any route, command or field that leads to an install. |
| R-06 | The check sends data to a third party. | One GET per package to the npm registry (or the configured mirror) for the package's latest tag; no identifiers beyond what an HTTP request carries. | Any other outbound call. |

## Selected mode

- **Mode:** Standard
- Basis: a terminal CLI that can install software on the host when the person confirms; the app and the control plane only show the command; reversible; additive wire fields only.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

AU-01 to AU-06 are implemented with failed-first (mutation) evidence, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
