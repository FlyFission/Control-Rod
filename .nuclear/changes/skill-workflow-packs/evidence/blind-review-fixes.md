# Blind review before landing (2026-11-23)

Reviewer: Codex CLI (`gpt-6.2-sol`, read-only sandbox), run on the owner's machine against `git diff origin/main...pr148` at head `0cff56e`. The reviewer saw the diff and the repository, not the author's conclusions. Raw output stays on that machine (`~/Code/control-rod-review/land-out/pr148-codex.md`); findings are quoted in substance below.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | P0 | Merging changes two `spec/` contracts without the maintainer's recorded sign-off. | Recorded: the owner's yes on 2026-11-23 is in the Signature table of [ship](../ship.md). |
| 2 | P1 | `work.ts`: an author or pre-check run read its card's project default from any project id, with no organization check, so a package naming another organization's project took that project's workflow into its brief and event. | Fixed: the lookup joins `object_owners` for the package and matches the project's `org_id`. Test "takes a card's project default only from a project of the package's own organization" (a foreign project with a default is refused; the same default on an own project applies, so the filter is what refused it). |
| 3 | P1 | Drafts of an untagged request launched under the implicit playbook carried no workflow, so a project default set while intake ran moved them onto a pack later. | Fixed: drafts are stamped with the launch-time choice, `playbook` included. Test "stamps the playbook on drafts of an untagged request, so a default set while intake ran does not move them"; the two existing tests that expected no field now expect `playbook`. |
| 4 | P1 | `workflow.ts`: a `[workflow:...]` token inside first-line prose selected a pack though the capture had no tag header. | Fixed: `tagHeader` accepts a first line only when it holds nothing but `[key:value]` tags; `captureWorkflow` and `captureProject` both use it. New cases in `test/workflow.test.ts`. |
| 5 | P2 | The cross-organization intake test names a project that does not exist, so it would pass with the filter removed. | Covered by the new author-run test in row 2, which has a real foreign project; the intake path's filter is unchanged. |

Local run after the fixes (PostgreSQL 16, Linux container): `test/workflow.test.ts`, `test/workflow-brief.test.ts`, `test/workflow-real-pack.test.ts`: 56 passed. API typecheck exits 0.
