# ADR 0014: agentgateway for account and local model runtimes

- Status: Accepted
- Date: 2026-10-22

## Decision
Account and local model runtimes route through agentgateway, which calls our policy service before every model and MCP call and emits token usage.

## Conditions (from the Gate R gateway spike)
- Its token limit charges after a request completes, so it can overshoot; it is a budget control. Hard caps are enforced by our ledger before dispatch.
- Strip Control Rod headers before requests reach a provider.
- The published binary is not a FIPS build; FIPS deployments build from source and confirm the module's certificate status.

## Evidence
Gate R gateway spike: missing work-package header denied with a clean 403 before the upstream; callback outage fails closed; usage reported for OpenAI-style and Anthropic-style APIs, including streaming.
