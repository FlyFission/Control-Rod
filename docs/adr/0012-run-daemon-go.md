# ADR 0012: Go run daemon; decisions live on the server

- Status: Accepted; Gate R kernel spike passed with conditions
- Date: 2026-10-22

## Decision
The run daemon and CLI are one Go binary. It loads the Rust kernel through WebAssembly to apply rules locally. Only the server's kernel state in Postgres and its signed attestations count as decisions; the daemon's copy enforces what it is told.

## Spike evidence
The kernel gave byte-identical decisions natively in Rust, in Go through wazero (compiler and interpreter engines) and in Node through napi-rs. Latency at p99 was 77 µs native, 253 µs with the wazero compiler, 95 µs in Node, and 8.5 ms with the wazero interpreter.

## Conditions
1. The daemon uses wazero's compiler engine; the interpreter misses the 5 ms decision budget and is allowed only for tests.
2. wazero 1.12 needs Go 1.25 or later; the toolchain pin moves to Go 1.25 when the daemon first loads the kernel.
3. The kernel is deterministic and asks the host for nothing random. The WASM build imports WASI `random_get`, and wazero's default source for it is deterministic, so any randomness the kernel ever needs comes from the host's crypto source, wired explicitly and tested.

## Consequences
Go's FIPS 140-3 module covers the daemon and evidence service. Ported Composio terminal runtimes, worktrees and session guard keep their Apache-2.0 notices.
