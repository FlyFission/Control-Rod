# Blind review before landing (2026-11-23)

Reviewer: Codex CLI (`gpt-6.2-sol`, read-only sandbox), run on the owner's machine against `git diff origin/main...pr148` at head `0cff56e`. The reviewer saw the diff and the repository, not the author's conclusions. Raw output stays on that machine (`~/Code/control-rod-review/land-out/pr148-codex.md`); findings are quoted in substance below.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | P0 | Merging changes two `spec/` contracts without the maintainer's recorded sign-off. | Recorded: the owner's yes on 2026-11-23 is in the Signature table of [ship](../ship.md). |
| 2 | P1 | `work.ts`: an author or pre-check run read its card's project default from any project id, with no organization check, so a package naming another organization's project took that project's workflow into its brief and event. | Fixed: the lookup joins `object_owners` for the package and matches the project's `org_id`. Test "takes a card's project default only from a project of the package's own organization" (a foreign project with a default is refused; the same default on an own project applies, so the filter is what refused it). |
| 3 | P1 | Drafts of an untagged request launched under the implicit playbook carried no workflow, so a project default set while intake ran moved them onto a pack later. | Fixed: drafts are stamped with the launch-time choice, `playbook` included. Test "stamps the playbook on drafts of an untagged request, so a default set while intake ran does not move them"; the two existing tests that expected no field now expect `playbook`. |
| 4 | P1 | `workflow.ts`: a `[workflow:...]` token inside first-line prose selected a pack though the capture had no tag header. | Fixed: `tagHeader` accepts a first line only when it holds nothing but `[key:value]` tags; `captureWorkflow` and `captureProject` both use it. New cases in `test/workflow.test.ts`. |
| 5 | P2 | The cross-organization intake test names a project that does not exist, so it would pass with the filter removed. | Fixed: the test now creates a real project of another organization, with a default, under the name the request uses. |

## Re-review of the fixes

Codex re-reviewed the fix commit `45cbca2` the same way.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 6 | P1 | `tagHeader` rejected a whole header when a project name holds brackets (`[project:Plant [Phase 2]]`), so the request silently ran the playbook. | Fixed: a tag's value may hold one level of brackets; `captureProject` reads such a name whole. New cases in `test/workflow.test.ts`. |
| 7 | P2 | Row 5's test was still weak. | Fixed as row 5 says. |

The re-review found nothing in the cross-organization lookup or the launch-time stamping.

## Second re-review

Codex re-reviewed `13273d8`.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 8 | P1 | A project named `Plant [workflow:pocock] Upgrade` selected Pocock: a tag inside a value was read as a tag. | Fixed: `captureTags` reads the first line as top-level tags with bracket depth; anything inside a value is that value. |
| 9 | P2 | A workspace path holding `[project:Plant]` was read as a project. | Fixed by the same parser. |
| 10 | P2 | `Plant [Phase [2]]` (two levels) still invalidated the header. | Fixed: any nesting depth; unbalanced brackets make the line prose. |

New cases for each in `test/workflow.test.ts`.

## Third re-review

Codex re-reviewed `bbaa385` and named the root cause behind rows 6 to 10: New work wrote the project name and workspace path into the header unescaped, so any parser rule leaves an edge.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 11 | P1 | A `]` in a project name or workspace path could end its tag early and smuggle in another. | Fixed at the source: New work refuses a project name, or a prepared workspace path, that contains `[` or `]`, with the reason in words. Other header values cannot hold brackets (fixed choices, Git refs, model ids). Test "refuses a project name with brackets, so a name can never carry a tag" in `apps/web/src/components/newwork.test.tsx`. |
| 12 | P2 | The stray-bracket parser case fails outright rather than testing a shifted boundary. | Accepted as is: with brackets refused at the source, a shifted boundary cannot come from the form. |
| 13 | P2 | The "ambiguous tags run the playbook" test checks only the parser, not intake. | Accepted: the intake path is covered by the cross-organization and project-default tests in `test/workflow-brief.test.ts`. |

## Round 4 (Codex, `bbaa385..7873210`)

Round 3's row 11 was too narrow: it said other header values could not hold brackets, but a typed branch is not checked by Git until a workspace is prepared, and a local clone's folder name is free text.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 14 | P1 | A typed branch, submitted without preparing a workspace, reaches the header before Git checks it. | Fixed: New work refuses `[` or `]` in every free header value (project, repository name, branch, prepared path). Test "refuses a branch name with brackets before any workspace is prepared, so a branch can never carry a tag". |
| 15 | P1 | A local clone's folder name reaches the header unchecked. | Fixed by the same guard. Test "refuses a local clone whose folder name has brackets, so a folder name can never carry a tag". |
| 16 | P1 | Quick add and the capture box pass the person's own text through, so a first line of tags routes the request. | Accepted, by design: the tag line is the documented way to route a request, the person writing it is the person whose request it routes, and a workflow grants no authority (it changes how work is sequenced, not who may do what or which checks run). The guard above exists so that values the person did not write as tags (names, branches, paths) can never become tags. Sending routing as structured fields is a contract change and is left for a later change with its own spec/ signature. |
| 17 | P2 | The project-name test used a fixture the parser already rejects. | Fixed: the fixture now types `Plant] [workflow:pocock`, which without the guard would yield a well-formed workflow tag. |
| 18 | P2 | An ambiguous workflow tag fell through to the named project's default at intake. | Fixed: `intakeWorkflow` runs the playbook whenever the header carries any workflow tag it cannot resolve (`captureNamesWorkflow`). Test "runs the playbook for an ambiguous workflow tag, never the named project's default" in `test/workflow-brief.test.ts`. |

Local run after round 4: `test/workflow.test.ts`, `test/workflow-brief.test.ts`: 45 passed; `apps/web` `newwork.test.tsx`: 20 passed; both typechecks exit 0. Workflow budgets remeasured with `node scripts/measure-workflow-briefs.mjs`.

Local run after both rounds (PostgreSQL 16, Linux container): `test/workflow.test.ts`, `test/workflow-brief.test.ts`, `test/workflow-real-pack.test.ts`: 56 passed. API typecheck exits 0.
