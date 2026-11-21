# Provenance: host git isolation with repository filter-driver pins

Source: `GoogleCloudPlatform/scion` at `8845a940763f91519d25e72cde3762d6e31df4cb`, license Apache-2.0 (retained under `third_party/licenses/GoogleCloudPlatform__scion/`), read on 2026-11-21.

This replaces the backfill in change `wave1-hardened-worktrees` for both files below. That backfill's behaviour differences 1 to 3 are closed here, except the policy part of difference 1 (see "Not carried").

| Local path | Upstream path (last commit touching it) | Removed | Renamed or changed | Tests carried |
| --- | --- | --- | --- | --- |
| `daemon/internal/runner/git_host.go` | `pkg/util/git_host.go` (`8845a94`, the pinned commit) | `HostGitOptions` and `Audience`, `checkRepoConfigPolicy` and `verifyConfigStable` calls with `repoConfigSnapshot`, `HostGitCeiling`, `hostGitDiscovers`, `hostGitCeilingDir`, `hostGitError`, `setEnvValue`, `HostGitResult`, `RunHostGit`, `hostGit`, `hostGitWaitDelay`, `DeriveLFSEndpoint`, `ScopedCredentialHelperEnv`, `NoCredentialHelperEnv`, `existingConfigCount`, `httpSchemeHost`, `scopedGitCredentialEnv`, `scopedCredentialHelperText`; in `HostGitEnv`, the scrub of the scoped credential variable. | `HostGitCommand(ctx, dir, args...)` returns `(*HostGitCmd, error)` with no options. Upstream `readFilterPins` is split into `listGitConfig` and `filterPins`; pins are `configPin` values passed through `GIT_CONFIG_COUNT`/`KEY_<n>`/`VALUE_<n>` (`pinEnv`) instead of `-c`, so driver names containing "=" are pinned. `hasConditionalInclude` added to refuse `includeIf`. `filterDriverKey` added so the empty driver name (`filter..clean`) is pinned and checked. Valueless trusted entries pinned as `true`. The after-run check compares only repository filter-driver entries (`repoFilterEntries`). `hostGitNetworkArgs` became the function `HostGitNetworkArgs`. `HostGitArgs`, `hostGitEnvKept`, `ErrRepoConfigChanged`, `HostGitCmd` (`Run`, `Output`, `CombinedOutput`, `after`), `repoConfigScope`, `gitConfigEntry`, `parseGitConfigList`, `splitConfigKey`, `filterDriverVars`, `hostGitVerifyTimeout` unchanged. | Ported tests: none verbatim. Local tests: `TestHostGitArgsNeutralizesHostExecution`, `TestHostGitNetworkArgsRestrictsProtocols`, `TestHostGitEnvStripsDangerousGitVars`, `TestHostGitCommandSetsArgsAndEnv`, and those listed in the next row. |
| `daemon/internal/runner/git_host_test.go` | `pkg/util/git_host_test.go` (`8845a94`, the pinned commit) | Every upstream test of the omitted policy, ceiling, LFS, credential, worktree and `RunHostGit` code. | `hostGitTestEnv` (without `SCION_HOST_UID`), `hostRunGit`, `assertNoMarkers` adapted; `TestParseGitConfigList` carried; `TestHostGitCmdDetectsFilterConfigChange` reduced to filter-driver and unrelated-key cases. | Carried: `TestParseGitConfigList`, `TestHostGitCmdDetectsFilterConfigChange` (adapted). New: `TestHostGitCommandNeutralizesRepoFilterDriver`, `...IncludedFilterDriver`, `...WorktreeFilterDriver`, `...FilterNameWithEquals`, `...EmptyFilterName`, `TestHostGitCommandKeepsGlobalFilterDefinition`, `TestHostGitCommandRequiresDir`, `TestFilterPins`, `TestFilterPinsValuelessTrustedRequired`, `TestFilterDriverKey`, `TestPinEnv`, `TestHostGitCommandRefusesConditionalInclude`. |

## Not carried

Upstream's deny-by-default repository config policy (`checkRepoConfigPolicy`, `verifyConfigStable`, `RepoConfigPolicy` and its allowlists), which refuses an include directive or any repository key outside an allowlist before and after the command; it is not in the pinned file. The discovery ceiling, LFS endpoint pinning and scoped credential helpers. See risk R-04.

## Unavoidable behaviour differences

1. **Other repository-config commands are not refused.** Without the policy, keys such as `core.sshCommand` or `diff.<x>.textconv` in repository config are not refused. No test pins this. A caller in a repository an agent can write needs the policy first (`ship.md`).
2. **Pins are in the environment, not on the command line.** Upstream's `-c` pins miss driver names containing "="; these do not (`TestHostGitCommandNeutralizesFilterNameWithEquals`). A caller that replaces `cmd.Env` drops the pins.
3. **The empty driver name is pinned.** Upstream skips it (`TestHostGitCommandNeutralizesEmptyFilterName`).
4. **Conditional includes are refused; plain includes are allowed.** Upstream's policy refuses every include directive; here only `includeIf` is refused (`TestHostGitCommandRefusesConditionalInclude`), and a plain `include.path` is listed and pinned (`TestHostGitCommandNeutralizesIncludedFilterDriver`).
5. **The after-run check covers filter drivers and conditional includes only.** Upstream also checks remote, branch, submodule, worktree and signing keys and re-runs the policy. Covered for filter drivers by `TestHostGitCmdDetectsFilterConfigChange`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Provenance rule: [`docs/third-party/port-provenance.md`](../../../docs/third-party/port-provenance.md).

## Exit criteria

Every function the port carries, changes or leaves out is named, and each behaviour difference says whether a test pins it.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
