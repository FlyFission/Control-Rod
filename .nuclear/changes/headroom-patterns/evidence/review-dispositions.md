# Independent read-only review: findings and dispositions

Reviewer: a separate Claude Code subagent, briefed with the file paths and the sources to check, not with the author's conclusions. It edited nothing. 2026-11-19. Its full report is not stored; each finding is summarized below.

| # | Finding (severity) | Disposition |
|---|---|---|
| 1 | Threat-model row: control column ignored instruction files an author run writes into its own workspace, which later author runs load and which can reach a merge (`runtime.go` comment on `--setting-sources`) (must-fix) | Row now names this as **Open**, and the pattern note's row 1 says the same |
| 2 | Read-only `protectedLoginNames` applies to pre-checks only; author runs protect login folders with deny rules in `sandbox.go` and the Codex profile (should-fix) | Both the row and row 1 now say which mechanism covers which run |
| 3 | Row stated a future-feature rule as a control, and the rule fits Markdown only (should-fix) | Marked "Planned rule"; added that derived text never goes into hooks, settings or executables |
| 4 | Threat model says each threat maps to a red-team case; this one maps to none (should-fix) | Row says "No red-team case yet; RT-013 is adjacent". Adding a case touches `tests/redteam/` and is left to the owner |
| 5 | ADR 0021 is still Proposed (nit) | Row cites `docs/daemon.md` (shipped behavior); row 1 says ADR 0021 is Proposed |
| 6 | Row 7 "Already have header stripping" claimed a control that is not built (must-fix) | Now "Required, not built (ADR 0014 condition)"; adoption phrased as qualifying agentgateway; notes subscription CLIs do not route through it |
| 7 | Row 7 stated planned Headroom work as current behavior and attributed cache breakage to header changes from a file not read (should-fix) | Phrased as the realignment plan's requirements; re-encoding is the cache breaker, header changes the fingerprinting risk |
| 8 | Row 6 past tense for a planned fix (nit) | "The planned fix makes it observe only" |
| 9 | Row 10 said a script fails the PR; it comments and labels instead, and `main` returns 0 (should-fix) | Corrected; header now lists `main` of `pr-governance.py` as read |
| 10 | Row 1's code-fence detail comes from `_find_managed_block`, not declared as read (should-fix) | Header lists `writer.py` first 60 lines, including `_find_managed_block` |
| 11 | Row 1 overstated "sat in a shared, committed file"; default target is gitignored (nit) | "could sit in a committed, shared instruction file"; default target named |
| 12 | Row 3 Fit misdescribed the qualification suite; the paired arms are in ADR 0021 (should-fix) | Fit now cites ADR 0021's positive control and weakened-policy arms; decision marked owner's call |
| 13 | Row 3 "CPU and memory caps" too specific; rollout snapshot missing (nit) | "resource limits"; rollout snapshot added |
| 14 | Row 4 overstated credential and blame wording (nit) | Matched to the ADR's scope |
| 15 | Row 4 ADR 0022 is Proposed and unqualified on real CLIs (nit) | Said so |
| 16 | Row 5 misstated why the ledger history was unfixable (nit) | Rewritten: wrong pricing basis, no cache mix stored; v2 stores shape beside the dollar figure |
| 17 | Row 8 "no run view shows cached tokens" contradicted by `story.ts` and `budgets.ts`; settings sentence unsupported (should-fix) | Corrected; settings sentence removed |
| 18 | Row 9 omitted that the daemon streams raw output lines as the log (nit) | Added |
| 19 | Row 6 Control Rod claim unsourced (nit) | Cites ADR 0012 (deterministic kernel) |
| 20 | "Not borrowed" bullet 2 contradicted row 11 and misread rule 5 (should-fix) | Rewritten: model call replaced regex analysis, loop detection stays mechanical; Control Rod point cites README (kernel decides) and ADR 0022 |
| 21 | Change record was still a blank template (should-fix) | Filled: `risk.md`, `proof.md`, this file |

Not adopted: the reviewer suggested `docs/daemon.md` as the source for "the daemon never decides"; no such sentence was found there, so the note cites the README's "the kernel decides every state change" instead. The reviewer pointed to `docs/daemon.md` for the qualification suite being protected; that line was not found either, so the note says instead that changing how qualification is judged is the owner's call.
