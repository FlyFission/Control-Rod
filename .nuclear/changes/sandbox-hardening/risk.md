# Risk: Close the setup escape and harden the sandbox

- R-01: setup still runs on the host, outside a sandbox. Running it inside the agent's confinement was judged not workable: the CLIs own that sandbox, the daemon has none of its own on macOS, and the package caches would have to be writable and shared. The commit comparison keeps every program-naming file as the user committed it, and the agent cannot commit (Git's own files are outside its sandbox). Setup can still read the user's files.
- R-02: `CARGO_HOME` is not emptied. An empty one would put the downloads where the agent's own `cargo` does not look. A checkout's `.cargo/` config must match the commit instead; the user's own `~/.cargo/config.toml` is trusted as the user's.
- R-03: a private registry that reads its token from an environment variable stops working in setup, because secret-like names are dropped. The fix is the token in the user's `~/.npmrc`. Setup failing never fails the run.
- R-04: a run folder removed too early. Only a folder Prepare or prepareCheckerIn made is marked; a checkout never is. It is removed only after the outbox write, and kept while the run's processes are not confirmed gone. The startup sweep touches only `work/<package>/r<revision>/<leaf>` older than max(24h, 2 x timeout), not of a run with a receipt or running now, and never follows a link. The shared checker root is not swept at start.
- R-05: the egress filter remains advisory. It holds back only clients that honour the proxy variables. There is no upstream proxy setting; `CONTROLROD_EGRESS_FILTER=0` is the documented way out.
- R-06: Claude's home read denials (DMN-30) rest on Claude Code settings already covered by settings tests; no live test with a signed-in Claude was possible here.
- R-07: the macOS copy of Claude Code was not run on a Mac here. If the copy cannot reach the sign-in, a run fails visibly at launch; it does not run unchecked.
- R-08: `Setsid` gives the agent no controlling terminal. A CLI that needs a terminal would fail; the CLIs already run headless with standard input from /dev/null.
- Trust surface: none touched (no `policies/`, `tests/redteam/`, `.github/`, kernel, `spec/` or ADR file).

## Selected mode

- **Mode:** Standard
- Basis: daemon and web hardening; each part is reversible by revert, and no contract or schema changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Checkout setup never runs a program named by a file the agent changed or planted, and its environment holds no provider key, token or SSH agent socket. The checker folder in /var/tmp is used only when it is a private folder of this user. Run folders are removed once the completion is in the outbox, and stale ones at start. Agent processes start in their own session. Claude Code on macOS starts from a verified copy. The egress filter allows the sign-in refresh hosts, closes idle tunnels and is documented as defence in depth. Checker evidence and pull request links open only https or this site. gofmt, go vet (Linux and darwin), go test, the web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
