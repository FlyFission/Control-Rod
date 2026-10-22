# ADR 0007: DBOS for durable workflows; approvals are kernel state

- Status: Accepted, pending Gate R test
- Date: 2026-10-22

## Decision
Durable workflows run on DBOS inside Postgres. Human approvals are kernel state in Postgres, never long workflow waits.

## Conditions
Patching enabled, stable executor IDs, explicit application versions (FIPS builds avoid the default MD5 version hash), no dependence on the proprietary Conductor service.

## Alternatives considered
Temporal (extra servers on every laptop and air-gapped site; kept as a documented scale-out option), Absurd (very new).
