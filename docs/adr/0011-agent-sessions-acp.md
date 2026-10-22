# ADR 0011: Agent Client Protocol for agent sessions

- Status: Accepted; Gate R spike partial, conditions tightened
- Date: 2026-10-22

## Decision
Control Rod is the ACP client for every agent session. Runtimes without native ACP use their official adapters.

## Spike evidence
A Go client saw every permission request with its ID and denied it, and the agent did not act, for both a mock agent and the official TypeScript example agent. Replayed IDs, IDs reused while pending, wrong session IDs and unsolicited responses were refused. Two problems: asking permission is optional in the spec, and a mock agent acted without asking, which the client could detect only afterwards; and responses match requests by JSON-RPC ID alone, so without an added binding an approval for one action executed a different one.

## Conditions
1. **ACP is never the gate.** The sandbox is the hard floor. Agent settings sources are not loaded, our own hook is installed, and agent settings folders are mounted read-only.
2. **Every approval binds to the action, not only the request ID.** The client records a digest of the tool call (kind, target, arguments) with each pending request and checks it on the response and again at execution. A mismatch is refused and logged.
3. **Our own thin client.** The community Go SDK hides request IDs from the handler and lagged the schema by 49 types, so we keep a small client of our own.
4. **Generated types with hand-written unions.** Code generation fails on the raw ACP schema; after cleanup about 30 union types (`SessionUpdate`, `ContentBlock` and others) still need hand-written Go with tests against the schema's examples.
5. Actions taken without a permission request are detected from the sandbox and the session stream and recorded as findings.
