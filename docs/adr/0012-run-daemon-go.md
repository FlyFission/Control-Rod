# ADR 0012: Go run daemon; decisions live on the server

- Status: Accepted
- Date: 2026-10-22

## Decision
The run daemon and CLI are one Go binary. It loads the Rust kernel through WebAssembly to apply rules locally. Only the server's kernel state in Postgres and its signed attestations count as decisions; the daemon's copy enforces what it is told.

## Consequences
Go's FIPS 140-3 module covers the daemon and evidence service. Ported Composio terminal runtimes, worktrees and session guard keep their Apache-2.0 notices.
