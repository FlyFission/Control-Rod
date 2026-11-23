# Risk: First-run setup and the Agents roster

- **Mode:** Standard
- Execution owner: Claude (project thread "Finish first-run setup and agents roster").
- Decision owner: Ben Huffer. No trust surface is edited (`policies/`, `tests/redteam/`, `.github/workflows/`, kernel decision functions, spec major version).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Benching an agent weakens the independent check (the author checks itself). | Benching only filters the offer; `pickChecker` is unchanged and still refuses the author's runtime. | A pre-check dispatched to the author's runtime without a recorded override. |
| R-02 | The page claims an agent was found, or signed in, when nothing checked. | Rows come only from `/runtimes` and `/subscriptions`; with no report every runnable row says "Not checked yet". Unsupported CLIs say "can't run this one yet", never "found". | A row stating found or signed in with no daemon report (test: "never claims to have found an agent nobody checked"). |
| R-03 | A check-in answer is shown as changing behavior it does not change. | Only the middle answer is marked as today's behavior; the others carry "Saved for when check-in points arrive". | A page or record saying fewer stops are in force. |
| R-04 | A setup change is unaudited. | `setup.record` is a catalog command; each change is a `setup.recorded` event with the member as actor. | A seat change with no event. |
| R-05 | Any member of an organization can bench an agent for the whole install. | Owner-local install with one person today; recorded on the chain with who did it. Revisit if multi-member installs ship. | A multi-member install shipping without a role check here. |
| R-06 | The intake brief change makes agents write fields the contract refuses. | Drift test validates a brief-shaped draft against `WorkPackage.json` and checks every required field is named. | That test failing. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A first run opens on Setup; the person confirms seats and one check-in answer before anything is saved; the Agents roster shows one switch per runnable agent and says in plain words why an agent cannot work, from the same probes as Provider CLIs; a benched agent is never offered work; the intake brief names every field the WorkPackage contract requires. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
