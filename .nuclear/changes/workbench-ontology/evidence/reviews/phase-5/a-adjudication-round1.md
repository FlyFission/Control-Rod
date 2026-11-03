# PR 5A (#36): adjudication of Codex round 1

Codex returned REVISE with six findings. All are accepted and fixed.

| # | Finding | Disposition |
|---|---|---|
| P1 | Rollback did not bind the artifact restored | Fixed at the root: `runtime.rollback` now takes `roles: [{ role, current, restore }]`, the artifacts the screen showed; it refuses with the new `pin-changed` code if either has moved, and restores every role named in one transaction or none. `/roster` returns each rollback as `{ runtime, current, restore }`, chosen exactly as the command chooses, and the page shows and signs both. Tests: a stale view is refused changing nothing; a two role rollback whose second role cannot roll back leaves the first as it was (failure injection); duplicate roles refused |
| P1 | `/roster` read across organizations | Fixed: the route resolves the caller's organization; pins, probes and policies are filtered by `org_id`, runs through `object_owners`. A test records another organization's artifact version, pin, probe, package and run and asserts none of their identifiers appear; removing the pin filter makes it fail |
| P2 | A requested sandbox was presented as the sandbox used | Fixed: the column and words say what the daemon asked for, that achieved isolation is not verified, and "not reported" when the run gave none; the test asserts the request wording and that nothing says a run was confined |
| P2 | The latest run could be hidden | Fixed: per runtime the run that finished last, by its recorded finish time with the id as tie breaker, among finished runs whether or not they reported a sandbox. Test: a run created first but finished last with no trace is the one shown, as "not reported" |
| P2 | Pin wording overstated which runs change | Fixed: "Author runs on claude must then launch exactly this file, and wait while the installed claude is a different one. Runs on other runtimes are unaffected." Asserted |
| P2 | The ledger credited the API tests with launch verification and atomicity | Fixed: the ledger cites the daemon's `internal/runner/artifact_test.go` for launch by verified artifact and the fail closed mismatch, and the new failure injection test for atomic rollback |

Also fixed while writing the isolation test: its fixtures had swallowed insert errors, which hid that the pin fixture failed. The fixtures now use the app's own record path and fail loudly.

The Codex connector thread on run selection is the same as P2 (latest run) and is resolved with it.
