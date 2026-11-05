# Phase 6 A (PR 51), Codex round 3 and review threads: adjudication

All accepted.

| Finding | Disposition |
|---|---|
| Codex 1: managed `notify` runs outside the sandbox | Fixed: `notify` is a refused managed key, and every launch passes `-c notify=[]`. Tests. |
| Codex 2: linked common credential stores | Fixed: a named store that is a link, or holds links, is denied at the real paths too (`Denied`). Test with `~/.aws` linked out and a key file linked out of `~/.ssh`. |
| Codex 3: live scorer matches any decoy-like path; empty web session passes | Fixed: only calls on the exact planted file count (Bash naming it, Read of exactly it), only completed sessions count, and a web probe that did not complete fails. Rerun passes. |
| Thread: CLI login directories from the environment | Already fixed (`LoginLocations`). |
| Thread: kept install paths and symlinks; per-entry denial and later entries | Superseded: the per-entry code and the install exception are gone (Codex is staged outside home and the home folder is denied whole). |
| Thread: home folder unresolvable | Fixed: an agent launch refuses when the home folder cannot be resolved. |
| Thread: CLI resolved on the daemon's PATH | Fixed: `ResolveArtifact` and the probe runner find the CLI on the agent's PATH, and the probe runs it with the agent environment. |
| Thread: macOS and native Linux treated as ready | Fixed: `PreflightHost` refuses platforms not yet qualified (only WSL2 is). Test. |
| Thread: unreadable managed config passes | Already fixed (TOML parse; read and parse errors refuse). |
| Thread: empty or malformed feature list passes | Fixed: no rows, or any line that is not a feature row, refuses. Tests. |
| Thread: live check deletes a fixed folder | Fixed: a fresh random folder, refused if it exists, and only it is removed. |
| Thread: login checks under a different environment | Fixed with the PATH change: probes run with `AgentEnv`. |
| Thread: policy version read before the lock | Fixed: `resolveSandboxPolicy` takes the policy lock before reading its version. |
| Thread: concurrent staging; TMPDIR staging | Already fixed (flock per digest; staging in /tmp only). |
