# ADR 0010: Pluggable sandbox drivers

- Status: Accepted
- Date: 2026-10-22

## Decision
A sandbox interface with drivers: Anthropic's open-source sandbox-runtime (srt) on laptops, one OCI driver on servers and managed cloud with microVM isolation per runtime class, WSL2 first on Windows. Lane egress runs through the driver's proxy with a fail-closed decider in the Go daemon, and Smokescreen at the lane boundary.

## Conditions (from the Gate R sandbox spike)
- Pin srt exactly (0.0.81 tested; it needs Node 22.12 or later) and accept upgrades only through our tests.
- Launch srt with an explicit, minimal environment: srt passes the caller's whole environment into the sandbox by default.
- Validate srt settings against our own schema before launch: misspelled keys are silently ignored.
- Treat any srt proxy exit as a fault: it exits 0 after a decider failure.
- Add `.codex/`, `AGENTS.md` and our own trust surfaces to the protected list: defaults assume Claude Code.
- FIPS builds use the OCI driver: srt's TLS interception uses node-forge, which is not FIPS-validated.

## Evidence
Gate R sandbox spike: workspace writes allowed; trust-file writes, symlinks, moves and deletes blocked; unlisted hosts denied; decider death, malformed frames and mismatched answers all fail closed.
