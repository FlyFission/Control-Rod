# Trace: First-run setup and the Agents roster

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| FS-01 A card's intake does not fail because the brief and contract disagree. | `packs/general/roles/intake.md` | `services/api/test/intake-brief.test.ts` (fails on the old brief: title, use, statement, basis) | implemented and tested |
| FS-02 First run opens on setup; nothing is saved until Looks right. | `pages/Setup.tsx`, `lib/firstRun.ts` | `pages/setup.test.tsx` "saves nothing until Looks right"; screenshot `evidence/setup.png` | implemented and tested |
| FS-03 One question with three answers, middle preselected; other answers honest about today. | `lib/agents.ts` CHECK_IN_CHOICES | `setup.test.tsx`; API default `start-and-merge` | implemented and tested |
| FS-04 The roster and Provider CLIs agree, and an off agent says why in plain words. | `lib/agents.ts` agentRows | `setup.test.tsx` "says why an installed, signed-in agent is off" | implemented and tested |
| FS-05 A benched agent gets no new work; seated again, it does. | `work.ts` claim, `setup.ts` | `services/api/test/setup.test.ts` | implemented and tested |
| FS-06 Setup changes are validated and recorded on the chain. | `setup.ts`, catalog `setup.record`, refusal `invalid-setup` | `setup.test.ts`, `refusals.test.ts`, inventory `--check` | implemented and tested |
| FS-07 No unclickable, unbuilt controls; nav says Control / Setup. | `Explore.tsx` (Snapshots), `places.ts`, router redirects | `wave3-pages.test.tsx`, `places.test.tsx` | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A first run opens on Setup; the person confirms seats and one check-in answer before anything is saved; the Agents roster shows one switch per runnable agent and says in plain words why an agent cannot work, from the same probes as Provider CLIs; a benched agent is never offered work; the intake brief names every field the WorkPackage contract requires. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
