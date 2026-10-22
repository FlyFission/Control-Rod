# ADR 0011: Agent Client Protocol for agent sessions

- Status: Accepted, pending Gate R test
- Date: 2026-10-22

## Decision
Control Rod is the ACP client for every agent session. Go types are generated from the official ACP schema. Runtimes without native ACP use their official adapters.

## Conditions
Permission requests are optional for agents in the ACP spec, so ACP is never the only gate: the sandbox is the hard floor, agent settings sources are not loaded, our own hook is installed, and agent settings folders are mounted read-only.
