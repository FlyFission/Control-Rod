# Role: intake, software bugfix

Job guidance for a request to diagnose and fix a defect in existing software. Draft packages with `mode: "software"`, `agent_assignment[0].role: "software-author"`, and `rigor_mode: "standard"` (or `"quick"` for small, low-risk fixes; `"high-consequence"` when touching critical or user-facing safety/security paths).

| Stage / Package | `agent_assignment[0].role` | When to split |
|---|---|---|
| Reproduction & root cause | `software-author` | Split out if diagnosis must be confirmed before patching |
| Fix & regression test | `software-author` | Default single package for scoped defects; `depends_on` diagnosis only if split |

## Acceptance criteria guidance

Require concrete, testable outcomes:
- A failing regression test (or deterministic reproducer) demonstrating the defect before/against the fix.
- Relevant test suite, typecheck, and lint/build commands passing after the final edit, citing observed exit codes and counts.
- Scope bounded to the defect and its tests, with no unrequested refactoring or trust-surface edits.
