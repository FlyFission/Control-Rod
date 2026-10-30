# Verification: workbench and ontology

Evidence status: **planned** for every WB requirement; this packet holds a specification and plan only.

| Evidence ID | Status | Claim and practical limit | Artifact |
|---|---|---|---|
| E-01 | pass | Donor licenses at root confirmed from GitHub metadata and license files on 2026-10-29 | `docs/patterns/workbench-donors.md` |
| E-02 | partial | Donor mechanisms located by source reading at pinned commits; nothing executed. Reading records are working papers outside the repository; file level license evidence is retained only when a port starts (plan 0.3) | Working papers outside the repository |
| E-03 | pass | Unprivileged user namespaces work and bubblewrap is installed on the owner's WSL2 host | Session observation 2026-10-29 |
| E-04 | pass | Control Rod daemon stops runs with an immediate process group SIGKILL | `daemon/internal/runner/proc_unix.go:19` |
| E-05 | pass | Round 1 reviews of Revision 0 by Codex, OpenCode and Antigravity; every finding adjudicated. Grok did not run (usage balance exhausted) | `evidence/reviews/`, `evidence/reviews/adjudication.md` |
| E-08 | pass | Round 2 reviews of Revision 1 by Codex, OpenCode and Antigravity; all findings adjudicated into Revision 2 | `evidence/reviews/round2/`, adjudication round 2 tables |
| E-10 | pass | Round 3 confirmation: all three reviewers say yes to Authorization A; residual items they cited for Authorization B were fixed and recorded | `evidence/reviews/round3/`, adjudication round 3 table |
| E-09 | pass (analysis) | Platform Plan located and its 24 contradictions analysed; each has a disposition in the adjudication, several resolved by declared hooks or gated tasks rather than implemented behaviour | Adjudication, Platform Plan table |
| E-06 | pending | Kandev reader notes wording check (ADR 0019 condition 3) | Change record evidence, when done |
| E-07 | planned | All WB requirements | Plan phases |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The specification, plan and donor register are reviewed, Authorization A is recorded for Phase 0 and spikes, and Authorization B for Phases 1 to 9 once D-1 to D-6 and the D-7 theme contract are recorded (the D-7 catalogue list gates only plan task 4.9), and no planned capability is presented as implemented.

## Source-lineage note

Workflow basis: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. Adapted as a local engineering record, not a compliance certification.
