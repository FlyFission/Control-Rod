# Risk: answer the review of the sole-maintainer rule

- **Mode:** Standard
- Execution owner: Claude Code, as follow-up review work on #97 under the owner's standing instruction to do reversible work without asking.
- Decision owner: Ben Huffer. Touches trust surfaces: `docs/adr/` (new ADR 0024, a header line in ADR 0001) and `.github/` (the two templates). No workflow, policy, kernel, spec or setting change.
- Scope: `AGENTS.md`, `CONTRIBUTING.md`, `docs/collaboration.md`, `docs/adr/0001-record-decisions.md`, `docs/adr/0024-sole-maintainer-sign-off.md`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/change.yml`, the `readme-shots-lockdown` and `sole-maintainer-signoff` records, and this record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Filling the screenshot record's signature after the fact overstates what was approved. | The table quotes each question and answer word for word with its time, says both came before the rule existed, and says it is not an independent review. | A signature row with no matching chat message. |
| R-02 | Editing an accepted ADR changes its meaning. | ADR 0001's text is unchanged; only an "Amended by" line is added. | Any change to ADR 0001's decision text. |
| R-03 | Widening `AGENTS.md` rule 2 blocks routine edits. | The added paths are ones CODEOWNERS already routes for review; the rule now says what review routing already did. | A path added that CODEOWNERS does not cover. |
| R-04 | Condition 1 becomes too loose. | It now asks for each trust surface by path or plain words, which is stricter than "says it touches a trust surface". | A question that names no trust surface counting as a yes. |

## Selected mode

- **Mode:** Standard
- Basis: governance text and records; reversible by revert; no code, workflow or setting change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-04 are met: ADR 0024 records the decision and ADR 0001 points to it, the trust-surface lists match CODEOWNERS, condition 1 names each trust surface, and the screenshot and sign-off records carry their signatures and real CI evidence; CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
