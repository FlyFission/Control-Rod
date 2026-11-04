Latest commit (`HEAD~1..HEAD`): no defects found in `hardware_formats_in_force`, its contract, policy initialization, or associated tests.

Whole PR (`origin/main...HEAD`): one defect:

- **P2 — Delegation revocation hides project scope** — [AdminSections.tsx:276](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/AdminSections.tsx:276). Two delegations with the same people, role, discipline, and expiry but different projects produce identical options. The confirmation at line 282 and registry listing also omit the project. A user cannot distinguish them and can sign revocation of the wrong project's authority. **Fix:** show the project name or “all projects,” validity dates, and a distinguishing identifier in the selector and confirmation. Add a regression test with otherwise identical delegations for different projects.

Validation: 17 administration UI tests passed; API and web TypeScript checks passed; diff whitespace check passed. API integration tests were blocked during setup by the read-only filesystem; all 50 tests were skipped.

REVISE