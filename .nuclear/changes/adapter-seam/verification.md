# Verification: adapter seam for the run daemon

Evidence status: **pass** for the local checks below (E-01 to E-05). **Open** for the owner's review of the pull request (E-06). No allowlist finding: every named provider, proxy and socket variable is dropped, and no subtest was skipped. Nothing here claims a new CLI or a changed sandbox.

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | Golden launch files were written by `TestLaunchGolden` with `CONTROLROD_WRITE_LAUNCH_GOLDEN=1` before any adapter code existed, then compared again after the refactor. Ten cases (Claude and Codex: author with default tools and model `default`, an explicit model, pre-check, intake, and a tools file naming network hosts). The policy is `testPolicy` with its `/mnt` denial pointed at a directory the test creates, so Codex's outermost denial set does not depend on the host. The process environment is the fixed list in `launch_golden_test.go`. | `daemon/internal/runner/testdata/launch-golden/`; `evidence/adapter-tests.log` |
| E-02 | pass | Claude and Codex adapters match the committed stream goldens in `testdata/stream-golden/` for `testdata/claude-stream.jsonl` and `testdata/codex-stream.jsonl` (the Codex lines are the cases in `events_test.go`: a tool call, `turn.completed` with usage, `turn.failed`). The comparison is not against the live `Normalize` function. Registry order is Claude, Codex, fake. Fake is offered only when `CONTROLROD_ALLOW_FAKE=1`. Unknown runtime error text is unchanged. | `daemon/internal/runner/testdata/stream-golden/` |
| E-03 | pass | `AgentEnv` drops `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `XAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `OLLAMA_HOST`, `OLLAMA_API_KEY`, `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and `SSH_AUTH_SOCK`. All fifteen subtests passed. The allowlist was not edited. No M2 finding. | `evidence/adapter-tests.log` |
| E-04 | pass | `gofmt -l .` in `daemon/` prints nothing. `go vet ./...` exits 0. `go test -count=1 ./...` exits 0 (confinement, digest and runner packages ok; cmd, version and wire have no tests). Local toolchain only. | `evidence/gofmt.log`, `evidence/vet.log`, `evidence/test.log` |
| E-05 | pass | `controlrod sandbox-args` before and after, same policy file (`evidence/policy.json`, the `testPolicy` fields) and the same workspace `/tmp/adapter-seam-sandbox/workspace`. Claude stdout, stderr and exit code are byte-identical (stdout sha256 `fb6230fbef6ca498de4335ade010c727307a7122711522e9ee7bf29cad68e084`). Codex is not installed here: with `PATH=/usr/bin:/bin` both binaries print `stage codex: codex is not on the agent PATH` and exit 1 (stderr sha256 `585f47a79d986ff3c6432df752f22e1ef1136435054af5b386a0b71a58b75833`). With `/tmp/adapter-seam-bin/codex` a copy of `/bin/true`, both binaries print the staged launch and the stdout bytes match (sha256 `9bfdb09486f24f681cda2ba6ddafd498b3864e462d8ef2652d452634d5badc7c`). `git diff --stat` of the five existing assertion files is empty. The runtime-name switch scan outside `adapter*.go` and tests is empty; the three runtime constants remain in `runtime.go`. | `evidence/sandbox-args-*`, `evidence/sandbox-args-sha256.txt`, `evidence/sandbox-args-invocation.txt`, `evidence/switch-scan.txt` |
| E-06 | open | Owner review of the pull request. | Not executed |

## Deviations from the milestone text

`Providers` and `Available` stay on the core interface. `Detect` and `RuntimeFor` cannot dispatch without them. The other runtime-specific branches are optional interfaces (`HookProvider`, `LaunchNotifier`, `HostNeeder`, `ManagedConfigChecker`, `CLIPreflight`, `ArtifactStager`, `OutputCopier`, `ExtraEnvProvider`). Claude and Codex embed `sandboxedBase`. `Capabilities` is not read to choose a path.

`Probe` receives the daemon version. The fake adapter records it. Claude and Codex ignore it and record the CLI's own `--version`.

The fake adapter's `Binary` is `bash`, the program that runs `inputs/FAKE.sh`. `Available` does not look `bash` up: doing so would stop offering the fake runtime on a machine without bash, which is not today's rule. The gate remains `CONTROLROD_ALLOW_FAKE=1`. Claude and Codex `Available` methods look up `Binary()`.

`Normalize` and `TurnEnd` in `events.go` still switch on event type, not on a runtime name. The log buffer calls the selected adapter, and today's adapters embed the shared functions.

`Command` still switches on the run role (`intake`, `author`, `pre-check`) before the registry. That switch is not on a runtime name.

`UsesVerifiedLaunch` was removed. It was the same predicate as `SandboxRequired` for every registered runtime, so verified launch and the trace version use `SandboxRequired`.

For an unregistered runtime id, `hostLabel` now returns that id. It used to return "Codex". No shipped runtime takes that path. Claude and Codex still use their display names.

## Review findings

| Finding | What changed |
|---|---|
| Security gate belonged in each adapter, and the registry slice was mutable. | `Command` runs `requireAgentPolicy` and chooses `AgentEnv` or `ChildEnv` from `SandboxRequired` before it returns the process. Only the fake runtime returns false, and only when `CONTROLROD_ALLOW_FAKE=1`. `registry` is unexported; `RegisteredAdapters` returns a copy. `TestSandboxedAdaptersRefuseNilPolicyAndUseAgentEnv` covers every sandboxed adapter. |
| Launch and stream tests compared an adapter to the function it calls. | Those tests are gone. Stream results are committed in `testdata/stream-golden/`. Launch results stay the pre-refactor fixtures, compared after the test's own directory is rewritten to `/golden`. |
| Log ingestion did not call the adapter. | `logBuffer` calls the adapter's `Normalize` and `TurnEnd`. `TestLogIngestionUsesTheAdapter` installs a parser that disagrees with the shared functions and requires the buffer to follow it. |
| A kept environment variable skipped the subtest. | `TestAgentEnvDropsProviderProvenance` calls `t.Fatalf`. The allowlist is unchanged. All fifteen keys are still dropped. |
| The interface carried every runtime's branches. | The core interface is id, binary, display name, capabilities, providers, availability, probe, command, launch, normalize, turn end, and `SandboxRequired`. The other behaviors are optional interfaces. Codex owns its feature preflight; `Preflight` still accepts the existing callback and stores it on the context so the current tests keep supplying a feature list. |
| Host needs, probe version, host label, binary lookup, and the switch scan were incomplete. | `HostNeeds` returns nothing when `SandboxRequired` is false. The fake version is set inside the fake adapter. `hostLabel` falls back to the runtime id. Claude and Codex availability use `Binary()`. `probeInstalled` and `CodexEffectiveFeatures` take the PATH name (`Binary()`) separately from the registry id. `TestProviderAndIDUnique` and `TestNoRuntimeNameSwitch` cover the registry and `daemon/` including `cmd/controlrod` and `adapter*.go`. |
| The golden test deleted a shared directory, cleared the process environment, and could rewrite fixtures and then compare to itself. | The test uses `t.TempDir` and `t.Setenv`. Rewriting fixtures is `go test -tags launchgoldenupdate`, which writes and does not compare. |

## Evidence custody and coupling

| Evidence ID | Claim ID | Decisive? | Artifact / raw result | Change actor | Generated by | Selected by | Transformed / summarized by | Executed / captured by | Retained by | Presented by | Verified / witnessed by |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E-01 | T-02 | yes | testdata/launch-golden/; evidence/adapter-tests.log | Implementing agent | `go test` `TestLaunchGolden` | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check; fixtures captured before the refactor |
| E-02 | T-01, T-03, T-04, T-06 | yes | evidence/adapter-tests.log | Implementing agent | `go test` | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-03 | T-05 | yes | evidence/adapter-tests.log | Implementing agent | `go test` | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-04 | T-01 | yes | evidence/gofmt.log, evidence/vet.log, evidence/test.log | Implementing agent | gofmt, go vet, go test | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-05 | T-07, T-08, T-09, T-10 | yes | evidence/sandbox-args-*, evidence/switch-scan.txt | Implementing agent | `controlrod sandbox-args`, git diff, ripgrep | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-06 | T-09 | yes | Owner review | Implementing agent | Not executed | Owner | Not executed | Not executed | Packet | Implementing agent | Not supplied |

| Evidence ID | Actor | Context | Mechanism | Authority | Resource | Classification | Admissibility / residual-risk disposition |
|---|---|---|---|---|---|---|---|
| E-01 | coupled: implementing agent wrote the test and the refactor | partially separated: fixtures were generated from the code before the refactor | separated: byte comparison | separated: owner retains merge decision | coupled: local machine | self-check | The `/mnt` path in the policy fixture is a directory the test creates; other policy fields match `testPolicy` [Ship limits](ship.md) |
| E-02 | coupled: implementing agent | coupled: one session | separated: byte and deep comparison of events | separated: owner retains merge decision | coupled: local machine | self-check | Stream parsers are the existing functions; the test shows the adapter calls them [Ship limits](ship.md) |
| E-03 | coupled: implementing agent | coupled: one session | separated: `AgentEnv` on a fixed input | separated: owner retains merge decision | coupled: local machine | self-check | No key was kept; the allowlist was not edited [Ship limits](ship.md) |
| E-04 | coupled: implementing agent | coupled: one session | separated: gofmt, vet, test | separated: owner retains merge decision | coupled: local machine | self-check | Local toolchain only [Ship limits](ship.md) |
| E-05 | coupled: implementing agent | coupled: one session | separated: byte comparison of CLI output | separated: owner retains merge decision | coupled: local machine | self-check | No Codex install; the printed Codex launch uses a copy of `/bin/true` so staging can run. The absent-binary error was also compared [Ship limits](ship.md) |
| E-06 | separated: owner | separated: owner's own review | separated: the owner's review has not run | separated: owner decides | coupled: local machine | self-check | Not executed [Ship limits](ship.md) |

No human independent review has been done yet.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The registry is the only dispatch for `Detect`, `Command`, `LaunchFor`, `RuntimeFor` and `Probe`. Golden launch output and `sandbox-args` output match the pre-refactor bytes. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
