# Plan: Close the setup escape and harden the sandbox

1. setup.go: commit comparison guard, done-folder rule, Git-source rule, new flags, `SetupEnv`. daemon.go passes `gitBaseline(ws.Dir, head)`.
2. setup_test.go: each planted file refuses setup; a real pnpm never loads a planted pnpmfile; a real step's environment holds no secret; three author rounds end to end; `gitBaseline` reads the bound commit.
3. private_dir.go and its tests; checker root and stage folder use it.
4. workspace_cleanup.go and its tests; Handle and Run call it; two end-to-end tests read what they need from the completion.
5. proc_unix.go `Setsid`, with a session test.
6. artifact.go `copiesBeforeExec` through the `ExecCopier` capability, with tests; `GOOS=darwin go vet`.
7. daemon.go sign-in hosts, egress_proxy.go idle timeout, tests; docs/daemon.md Checkout setup, Egress filter, Workspace and checker sections.
8. apps/web lib/links.ts, both components, tests; typecheck.
9. gofmt, go vet, go test ./..., the web tests, the repo gates. The owner decides on merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Checkout setup never runs a program named by a file the agent changed or planted, and its environment holds no provider key, token or SSH agent socket. The checker folder in /var/tmp is used only when it is a private folder of this user. Run folders are removed once the completion is in the outbox, and stale ones at start. Agent processes start in their own session. Claude Code on macOS starts from a verified copy. The egress filter allows the sign-in refresh hosts, closes idle tunnels and is documented as defence in depth. Checker evidence and pull request links open only https or this site. gofmt, go vet (Linux and darwin), go test, the web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
