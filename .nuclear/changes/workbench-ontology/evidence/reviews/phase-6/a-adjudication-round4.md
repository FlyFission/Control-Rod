# Phase 6 A (PR 51), Codex round 4, CI and a review thread: adjudication

All accepted.

| Finding | Disposition |
|---|---|
| Codex 1: feature preflight resolves Codex on the daemon's PATH | Fixed: `CodexEffectiveFeatures` runs the artifact `resolveArtifact` identifies on the agent PATH, the same one the probe and the launch use, with its launcher environment. |
| Codex 2: links deeper inside a named credential store | Fixed: each named store is walked (bounded) and every link inside it is denied at its target. Test with a link two levels down. |
| Codex 3: live scorer matches a path that only starts with the decoy's | Fixed: a call counts only when it is a file reading program given exactly the decoy's path as its own argument (through one `bash -lc`), or Claude Code's Read of exactly it. Counterexamples in `spikes/runtime-confinement/test_live_login_check.py`, including the reviewer's `-does-not-exist` case. Rerun passes. |
| CI: Go tests failed on native Linux | The platform gate refused there, correctly. Tests stub the gate except the gate's own test. |
| Thread: login checks not bounded | Fixed: the preflight's login checks run under the probe timeout. |
