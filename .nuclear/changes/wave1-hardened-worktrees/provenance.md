# Provenance: host git isolation (backfill)

Source: `GoogleCloudPlatform/scion` at `8845a940763f91519d25e72cde3762d6e31df4cb`, license Apache-2.0 (retained under `third_party/licenses/GoogleCloudPlatform__scion/`), upstream file `pkg/util/git_host.go`.

This file was written after the port merged, by change `agents-map-provenance`, which added the provenance rule (`docs/third-party/port-provenance.md`). It compares the local file at commit `ecc6ba8` with the upstream file at the pinned commit. The port's author has not reviewed it.

| Local path | Upstream path (last commit touching it) | Removed | Renamed or changed | Tests carried |
| --- | --- | --- | --- | --- |
| `daemon/internal/runner/git_host.go` | `pkg/util/git_host.go` (`8845a94`, the pinned commit) | The repository config policy: `repoConfigScope`, `parseGitConfigList`, `splitConfigKey`, `readFilterPins`, the `HostGitCmd` type with `Run`, `Output`, `CombinedOutput` and its post-command check `after`, `HostGitOptions` and `Audience`, `hostGitError`, `hostGitDiscovers`, `hostGitCeilingDir`, `setEnvValue`, `RunHostGit`, `hostGit`; LFS and credentials: `DeriveLFSEndpoint`, `ScopedCredentialHelperEnv`, `NoCredentialHelperEnv`, `existingConfigCount`, `httpSchemeHost`; in `HostGitEnv`, the scrub of the scoped credential variable. | `HostGitArgs`: same settings, but `core.hooksPath` is the literal `/dev/null` where upstream uses `os.DevNull`. The unexported `hostGitNetworkArgs` list became the exported function `HostGitNetworkArgs`, which returns `HostGitArgs` plus that list. `hostGitEnvKept` is unchanged. `HostGitCommand(ctx, dir, args...)` returns a plain `*exec.Cmd` with `HostGitArgs` and the scrubbed environment; upstream's `HostGitCommand(ctx, dir, opts, args...)` returns `(*HostGitCmd, error)` after the config policy checks. | None ported. Local tests are new: `TestHostGitArgsNeutralizesHostExecution`, `TestHostGitNetworkArgsRestrictsProtocols`, `TestHostGitEnvStripsDangerousGitVars`, `TestHostGitCommandSetsArgsAndEnv`. |

## Not carried

Everything that reads the repository's own git config before running git. Upstream uses it to replace filter drivers defined in that config with the global or system definition, to refuse a remote operation when that config has keys outside an allowlist, and to check afterwards that the config did not change. The LFS endpoint and scoped credential helpers were left out with it.

## Unavoidable behaviour differences

1. **Filter drivers and other repository-config commands are not neutralized.** Upstream's file comment says its `HostGitCommand` replaces filter drivers defined in the repository's config and refuses unexpected config on remote operations. The port carries only the fixed `-c` settings and the environment scrub. A filter driver set in a repository's own config is therefore not replaced by this file, and nothing here refuses unexpected config. Whether a run can write that config depends on the runtime mounts. No test pins this either way. This difference was found while writing this backfill. It is reported to the owner and is not changed here.
2. **`core.hooksPath=/dev/null` on Windows.** Upstream uses `os.DevNull`, which is `NUL` on Windows; the port uses `/dev/null` everywhere. No test covers Windows.
3. **`HostGitCommand` accepts an empty directory.** Upstream refuses one. The port runs git in the daemon's current directory instead. `TestHostGitCommandSetsArgsAndEnv` covers a set directory only.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Provenance rule: [`docs/third-party/port-provenance.md`](../../../docs/third-party/port-provenance.md).

## Exit criteria

Every function the port carries, changes or leaves out is named, and each behaviour difference says whether a test pins it.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
