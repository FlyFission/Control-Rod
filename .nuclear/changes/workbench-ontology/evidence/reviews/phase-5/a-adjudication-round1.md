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

# Round 2

Codex confirmed the six round 1 fixes and returned REVISE with three findings. All are accepted and fixed.

| # | Finding | Disposition |
|---|---|---|
| P2 | A rollback entry without a role selected intake | Fixed: every entry must name intake, author or pre-check before anything runs. Test: omitted, null, empty and a non pinnable role are each refused, and no pin changes |
| P2 | The displayed target and the command's target could differ on tied timestamps | Fixed at the root: `/roster` now calls `rollbackTarget`, the command's own selection, which orders by recorded time then id, so they cannot differ. Test: signing exactly the target the roster shows succeeds and restores it |
| P2 | The isolation test could pass on an error response, had no foreign policy, and disabled every trigger | Fixed: it asserts 200, the full role list and the viewer's own baseline, version, pin and launch; it records another organization's sandbox policy and asserts it is excluded; and it sets aside only the two ownership triggers, so foreign keys and every other trigger still hold |

# Round 3

Codex returned MERGE with one nonblocking P3: no test seeded tied timestamps in pin history. Added anyway: two retired author pins of different artifacts recorded in one transaction (so their `recorded_at` is equal) are seeded; the roster shows the later id's artifact as the rollback target, and signing exactly that target restores it.

## Copilot threads on the first commit

- Organization scoping and the latest completed run: already fixed by round 1 (P1 and P2 above); answered and resolved.
- Versions listed a passing probe of a runtime no pin may name: fixed, the probe query is limited to the pinnable runtimes; the roster test records a passing probe of the test runtime and asserts it is not offered.

CI: one run's Rust job failed because GitHub could not download the pinned mise action (infrastructure); the next push reran it.
