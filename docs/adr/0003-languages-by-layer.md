# ADR 0003: Each language owns one layer

- Status: Accepted
- Date: 2026-10-22

## Decision
- Rust: the kernel (decisions, Cedar evaluation, canonical hashing, record types).
- Go: the run daemon, CLI and evidence service.
- TypeScript: the control plane, workflows, intake, connectors and every UI. No plain JavaScript.
- Python: the calc SDK.
- TypeSpec: contracts, generated into all four.

## Consequences
Every cross-language boundary is a generated contract. A shared canonical-digest test vector runs in all four languages.
