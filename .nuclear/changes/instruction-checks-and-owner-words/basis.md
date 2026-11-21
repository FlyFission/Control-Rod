# Basis: instruction checks and owner words

**Change slug:** `instruction-checks-and-owner-words`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-19
**Decision this basis supports:** whether to accept two items from the Plannotator pattern note (`docs/patterns/plannotator.md`):
- PL5: clean-room behaviour checks of text Control Rod gives agents;
- PL8: owner decisions recorded with the owner's own words.

## Mission / need

- **PL5.** `AGENTS.md`, the daemon's author and checker prompts, and later the review brief are instructions whose effect nobody checks. Unit tests check code, not what an agent does with a text.
- **PL8.** Owner-decision tables in change records give a summary of what the owner said. A reader cannot check the record's reading against the words. Sign-offs on trust surfaces already quote the owner word for word (`docs/collaboration.md`, sole-maintainer sign-off); ordinary decisions did not.

## Scope

In scope:
- `tools/instruction_checks/` (runner and cases) and `tools/test_instruction_checks.py`;
- `tools/check_owner_decisions.py` and its test;
- the "Recording owner decisions" section of `docs/collaboration.md`;
- the owner-decision tables of this pull request's four other records;
- the PL5 and PL8 rows of the pattern note and rows in `docs/getting-started.md`.

Out of scope:
- any change to `AGENTS.md`, the daemon's prompts or flags, or CI;
- role trials (role casting design section 9), which score casts through the daemon and are a separate job kind;
- converting records merged before 2026-11-19.

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Start PL5 and PL8. | "start PL5 and PL8" | 2026-11-19, Claude Code session for this pull request | Build a harness and first cases for PL5. Write the PL8 rule with a checker, and apply it to this pull request's records. | Running checks in CI; changing the texts the checks test. |
| D2 | First PL5 cases: the daemon's checker and author prompts, and `AGENTS.md` rule 3. | none: authoring agent's choice, open to the owner | 2026-11-19, this record | These are the texts agents act on today, and each has an outcome a script can judge from files. | The review brief and reviewer profiles, which do not exist yet. |
| D3 | The PL8 rule applies to records dated 2026-11-19 or later. | none: authoring agent's choice, open to the owner | 2026-11-19, this record | Older records stay as written; this pull request converts its own records because they are not merged yet. | Rewriting merged records. |
| D4 | Close out the pull request: settle the open decisions by the agent's best judgement and merge. | "You have my permission to close all of these out in the objectively best way possible continue" | 2026-11-21, Claude project thread "Close out the open review decisions", in reply to a list of the open decisions on #88, #92 and #102 with a recommendation for each | The agent settles each open decision in this record by the recommendation it gave, records each as its own choice, and merges once CI is green. | Confirming words the owner gave in earlier sessions; a person's read of the note for copied wording; any new trust-surface change; building any item. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| These checks are not role trials, so the role casting design's terms finding for trials (C-8) does not block them. | Role trials are their own job kind, run through the daemon to score casts. These checks are run by hand during development to test a text. | The owner treats any scripted CLI run on a subscription login as covered by C-8. |
| One run per case shows what the text can do, not how often. | Each case ran once, except the control described in verification. | A rerun gives a different outcome. Then the case needs repetitions before it can be used as a gate. |
| Saved transcripts hold nothing private. | `run.sanitize` keeps a short allowlist of the opening event and drops rate-limit events; a scan found no email addresses. | A transcript is found to carry account or machine details. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The instruction-check harness and its first cases run against the real CLI with results recorded, the owner-decision rule is in `docs/collaboration.md` with a passing checker, this pull request's records use it, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
