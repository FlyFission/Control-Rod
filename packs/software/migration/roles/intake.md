# Role: intake, software migration

Job guidance for a request to migrate schemas, data formats, dependencies, APIs, or runtime infrastructure. Draft packages with `mode: "software"`, `agent_assignment[0].role: "software-author"`, and `rigor_mode: "standard"` or `"high-consequence"`.

| Stage / Package | `agent_assignment[0].role` | When to split |
|---|---|---|
| Migration plan & compatibility check | `software-author` | Split out when staged rollout, data backfill, or downtime constraints require owner sign-off first |
| Migration implementation & preservation tests | `software-author` | Default package; `depends_on` the plan package when split |

## Acceptance criteria guidance

Require concrete, testable outcomes:
- Explicit forward steps, idempotency/compatibility behavior, and rollback procedure documented before execution.
- Preservation test verifying existing data/contracts remain intact across the migration path.
- Post-migration verification commands (schema check, typecheck, migration test, and suite) passing with observed outputs.
- Any unresolved data or environment assumptions flagged with `requires_confirmation: true`.
