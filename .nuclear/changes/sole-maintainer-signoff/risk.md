# Risk: sole-maintainer sign-off for trust surfaces

- **Mode:** Standard
- Execution owner: Claude Code under the owner's instruction of 2026-11-18.
- Decision owner: Ben Huffer. This changes who may sign trust-surface changes, and edits two files under `.github/` (the pull request template and the issue template) and the CODEOWNERS comment; ownership lines are unchanged. No workflow, policy, red-team fixture, kernel decision function or spec major version is touched.
- Scope: `AGENTS.md`, `CONTRIBUTING.md`, `docs/collaboration.md`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/change.yml`, `.github/CODEOWNERS` (comment only), `.nuclear/changes/readme-shots-lockdown/ship.md`, and this record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Self-approval removes the only human check on trust surfaces. | Nobody else exists to check; the rule keeps a human yes in the maintainer's own words, scoped to one pull request, with CI, review threads and record validation still required. | Any reading under which an agent can approve without the maintainer's words. |
| R-02 | An agent claims or invents a yes. | The yes must be quoted word for word with the question, time and place; relayed summaries, reactions, automated reviewers and second models never count; the agent never types a signature or initials. | A recorded sign-off with no matching message. |
| R-03 | A yes is stretched over later edits. | It covers the pull request as asked; a trust-surface change after the yes needs a new one. | A trust-surface edit pushed after the yes and merged on it. |
| R-04 | The exception outlives its reason. | It lapses when CODEOWNERS names a second maintainer. | A second maintainer listed while the exception is still used. |
| R-05 | Rule statements disagree, and a reader follows the stale one. | Every tracked statement of the signer rule names the exception (`evidence/signer-rule-grep.txt`); historical records are left as they were. | A current rule file that still says the prompter can never sign. |
| R-06 | This change is itself a trust-surface edit with no independent signer. | It is the change that creates the rule, so its sign-off is the owner's yes to merge it, recorded the way the rule says. | Merging without that yes. |

## Selected mode

- **Mode:** Standard
- Basis: governance text plus template wording; reversible by revert; no code, workflow or setting change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the sole-maintainer rule and its five conditions are in `AGENTS.md` and `docs/collaboration.md`, no template or CODEOWNERS line contradicts it, the screenshot record shows both owner approvals, and CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
