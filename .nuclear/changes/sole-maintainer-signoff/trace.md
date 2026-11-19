# Trace: sole-maintainer sign-off for trust surfaces

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| RS-01 While CODEOWNERS names a single maintainer, that maintainer's recorded yes is the human signature for a trust-surface change, on five stated conditions, and the exception lapses with a second maintainer. | `AGENTS.md` rule 2; `docs/collaboration.md` "Sole-maintainer sign-off" | `evidence/rule-diff.patch`; review of the text | implemented |
| RS-02 No current statement of the signer rule contradicts RS-01. | `CONTRIBUTING.md`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/change.yml`, `.github/CODEOWNERS` comment, the "Who reviews what" paragraph | `evidence/signer-rule-grep.txt` | implemented |
| RS-03 The screenshot record shows the owner's yes to #95. | `.nuclear/changes/readme-shots-lockdown/ship.md` | `evidence/rule-diff.patch` | implemented |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the sole-maintainer rule and its five conditions are in `AGENTS.md` and `docs/collaboration.md`, no template or CODEOWNERS line contradicts it, the screenshot record shows both owner approvals, and CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
