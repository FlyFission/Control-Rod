# ADR 0007: DBOS for durable workflows; approvals are kernel state

- Status: Accepted; Gate R spike partial, conditions tightened
- Date: 2026-10-22

## Decision
Durable workflows run on DBOS inside Postgres. Human approvals are kernel state in Postgres, never long workflow waits: an approval is a row, and writing that row starts a new, short workflow.

## Spike evidence
DBOS 5.3 ran offline in embedded Postgres under a non-superuser role with no Conductor, and no step ran twice in any scenario. A workflow left waiting across a code change survived only in narrow cases: on default settings it stayed pending forever (the default version hash covers the SDK version, so an SDK upgrade alone strands work); with patching and a stable executor ID it recovered only if every change was wrapped in `DBOS.patch`, and an unwrapped change became a permanent error; a new executor ID stranded it again. The approval-row pattern survived a code change on default settings, and re-running the step that starts finalize workflows created no duplicates.

## Conditions
1. Workflows are short: no workflow waits on a human or on an outside event. Waits are rows in kernel state.
2. Explicit application versions and stable executor IDs; patching enabled, with a CI check that a changed workflow body is wrapped in `DBOS.patch` or bumps the version.
3. Explicit versions also keep DBOS off its default MD5 version hash, which fails under a FIPS provider.
4. No dependence on DBOS internal tables or on the proprietary Conductor service.

## Alternatives considered
Temporal (extra servers on every laptop and air-gapped site; kept as a documented scale-out option), Absurd (very new).
