# Ship: Close the setup escape and harden the sandbox

Release decision: **pending**. Merge is the owner's decision.

- Rollback: revert the commits. No data or migration. Run folders already removed are not restored; their outputs are in the completions.
- Monitoring after merge: on the owner's Mac, an author run in a checkout shows its `Setup:` lines; a checkout with a changed `.npmrc` shows "Setup: skipped, because these files are not as committed". `~/.controlrod/work` stays small. A Claude Code run on macOS starts and signs in from `/tmp/controlrod-runtimes-<uid>`. A long signed-in Claude run passes its token refresh behind the filter.
- Limits: setup still runs on the host and can read the user's files (risk.md R-01). No empty `CARGO_HOME` (R-02). No upstream proxy setting (R-05). DMN-30 has no live test (R-06). The macOS copy was not run on a Mac (R-07). The Antigravity refresh host was not read from a binary.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Checkout setup never runs a program named by a file the agent changed or planted, and its environment holds no provider key, token or SSH agent socket. The checker folder in /var/tmp is used only when it is a private folder of this user. Run folders are removed once the completion is in the outbox, and stale ones at start. Agent processes start in their own session. Claude Code on macOS starts from a verified copy. The egress filter allows the sign-in refresh hosts, closes idle tunnels and is documented as defence in depth. Checker evidence and pull request links open only https or this site. gofmt, go vet (Linux and darwin), go test, the web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
