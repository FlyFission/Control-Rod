- High — [sandbox.go:185](/home/flyfission/worktrees/control-rod-p6/daemon/internal/runner/sandbox.go:185): Link discovery skips login folders outside home. With `CODEX_HOME=/srv/codex`, nested symlink targets outside that folder remain readable by Codex. Walk relocated login stores too; add a regression test.

REVISE