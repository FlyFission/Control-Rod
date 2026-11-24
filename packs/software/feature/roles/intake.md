# Role: intake, software feature

Job guidance for a request to design and implement new software functionality. Draft packages with `mode: "software"`, `agent_assignment[0].role: "software-author"`, and `rigor_mode: "standard"` (or `"high-consequence"` when the feature changes security boundaries, data models, or external contracts).

| Stage / Package | `agent_assignment[0].role` | When to split |
|---|---|---|
| Interface / design spec | `software-author` | Split out when contracts or architecture need owner approval before coding |
| Feature implementation & tests | `software-author` | Default package; add `depends_on` to the design package when split |

## Acceptance criteria guidance

Require concrete, testable outcomes:
- Every new behavior and edge case covered by automated unit or integration tests.
- Public interfaces, error handling, and configuration updates documented accurately without unverified claims.
- Typecheck, relevant test suites, and build checks passing after the final edit, citing observed outputs.
