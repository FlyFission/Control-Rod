Reviewed both diffs at `04e42730cd4cf70e60adb51b7eaca9be1d0d31bc`.

Round 1 verification:

- **StageArtifact:** both tree and single-file branches rehash copies and reused artifacts; the base permissions are checked. The retained environment is the resolver’s npm package root and marker. Staging location and concurrency remain defective below.
- **Whole-home denial:** the per-entry workaround and install exception are removed. This closes the reported late-entry exposure for ordinary layouts.
- **LoginLocations:** handles environment-selected directory symlinks, but misses default credential-location symlinks.
- **sandbox_mode scan:** catches the previously reported literal spellings and read errors, but still accepts valid escaped keys.
- **preflightedArtifact:** closes the reported repin-between-probe-and-launch bypass by requiring a matching ready artifact.
- **Policy refusals:** the writable-root, unknown-tool and Codex tool-subset refusals address the reported cases. Codex still exposes an unqualified tool.
- **Qualification:** the internet/DNS positive-control assertion is corrected. The live-check scorer does not establish the claimed refusals or qualify `code_mode_host`.

Remaining defects:

1. **High — Valid TOML still bypasses the unsandboxed-mode check.**  
   [sandbox.go:496](/home/flyfission/worktrees/control-rod-p6/daemon/internal/runner/sandbox.go:496) searches raw text. `"sandbox\u005fmode" = "danger-full-access"` contains no literal `sandbox_mode`, but TOML decodes that key to `sandbox_mode`. I reproduced this parser/scanner disagreement in memory. The managed setting can therefore defeat the permission profile despite passing preflight.  
   **Fix:** parse TOML and inspect decoded configuration keys; reject parsing and reading failures. Add escaped-key cases.

2. **High — Default credential directories symlinked outside home remain readable by Codex.**  
   [sandbox.go:136](/home/flyfission/worktrees/control-rod-p6/daemon/internal/runner/sandbox.go:136) resolves login directories only when their environment variables are set. For example, with `~/.codex -> /srv/codex-login` and `CODEX_HOME` unset, the external directory is never denied. [sandbox.go:168](/home/flyfission/worktrees/control-rod-p6/daemon/internal/runner/sandbox.go:168) drops the lexical `~/.codex` denial beneath the whole-home denial, leaving `/srv/codex-login/auth.json` accessible by its actual path. Credential-file symlinks have the same underlying problem. The README acknowledges external link targets, but that limitation includes credentials covered by the accepted finding.  
   **Fix:** resolve default and overridden credential locations, including credential-file targets. Refuse credential/workspace overlaps that cannot preserve both boundaries.

3. **High — Codex’s hosted web-search tool escapes the declared tool/network policy.**  
   [sandbox.go:322](/home/flyfission/worktrees/control-rod-p6/daemon/internal/runner/sandbox.go:322) never sets `web_search="disabled"`. Codex 0.166.0 defaults to cached web search; an explicit managed search setting can select live search. Its search-mode resolver does not disable search merely because the command permission profile disables networking. These are provider-side tool calls, beyond the command sandbox measured by `codex sandbox`. This contradicts ADR 0021’s “web search off” condition. See the pinned [configuration implementation](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/config/mod.rs#L3996) and [hosted-tool construction](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/tools/hosted_spec.rs#L14).  
   **Fix:** explicitly disable web search and verify its absence in a full `codex exec` session, including adversarial managed configuration.

4. **High — Staging is not guaranteed to be outside agent-writable storage.**  
   [artifact.go:333](/home/flyfission/worktrees/control-rod-p6/daemon/internal/runner/artifact.go:333) uses `os.TempDir()`, which honors inherited `TMPDIR`. Nothing rejects a staging root inside the workspace. Mode `0700` does not protect files from an agent running as the same user with workspace write access. Such a layout lets commands replace staged helper executables after verification; the primary executable’s lease does not protect helpers executed later. A temporary directory beneath home also contradicts the claimed outside-home staging layout.  
   **Fix:** canonicalize and validate staging against the workspace and denied roots before launch. Use a location inaccessible for agent writes and refuse unsupported layouts.

5. **Medium — Concurrent staging can delete an artifact another launch has begun using.**  
   [artifact.go:263](/home/flyfission/worktrees/control-rod-p6/daemon/internal/runner/artifact.go:263) checks reuse separately from unconditional removal at line 266. Two cold callers can both miss; one publishes and starts using the artifact, then the other removes it based on its earlier miss. This can break subsequent Codex re-execution or helper startup. Competing publication can also unnecessarily fail at `Rename`. This is a source-derived race, not a demonstrated escape.  
   **Fix:** coordinate publication across daemon processes per digest, verify a competing winner, and avoid deleting published generations while launches use them.

6. **Medium — Live-check success does not prove refusal, so qualification claims remain excessive.**  
   [live_login_check.py:55](/home/flyfission/worktrees/control-rod-p6/spikes/runtime-confinement/live_login_check.py:55) accepts any Codex item mentioning the decoy, including an ordinary assistant message. I reproduced `attempted=True` with an `agent_message` alone. At [line 102](/home/flyfission/worktrees/control-rod-p6/spikes/runtime-confinement/live_login_check.py:102), absence of the canary then becomes `decoy_refused=True`, without requiring a completed read, an explicit denial, both requested tool paths, or successful session completion. Consequently, [README.md:17](/home/flyfission/worktrees/control-rod-p6/.nuclear/changes/workbench-ontology/evidence/phase6/README.md:17), its live-check paragraph, and [the ledger:120](/home/flyfission/worktrees/control-rod-p6/docs/superpowers/execution/2026-10-29-workbench-buildout.md:120) overstate what establishes refusal and qualifies `code_mode_host`.  
   **Fix:** match completed tool calls to their results, require explicit refusal evidence for each requested path, and preserve a sanitized transcript. Narrow the claims until those checks pass.

No files were changed. The parser and scorer counterexamples were reproduced in memory; sandbox escape scenarios above are source-derived. Full suites and live credential sessions were not rerun in this read-only environment.

REVISE