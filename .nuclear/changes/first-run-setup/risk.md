# Risk: First-run setup and the Agents roster

- **Mode:** Standard
- Execution owner: Claude (project thread "Finish first-run setup and agents roster").
- Decision owner: Ben Huffer. No trust surface is edited (`policies/`, `tests/redteam/`, `.github/workflows/`, kernel decision functions, spec major version).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Benching an agent weakens the independent check (the author checks itself). | Benching only filters the offer; `pickChecker` is unchanged and still refuses the author's runtime. | A pre-check dispatched to the author's runtime without a recorded override. |
| R-02 | The page claims an agent was found, or signed in, when nothing checked. | Rows come only from `/runtimes` and `/subscriptions`; with no report every runnable row says "Not checked yet". Unsupported CLIs say "can't run this one yet", never "found". | A row stating found or signed in with no daemon report (test: "never claims to have found an agent nobody checked"). |
| R-03 | A check-in answer is shown as changing behavior it does not change. | Only the middle answer is marked as today's behavior; the others carry "Saved for when check-in points arrive". | A page or record saying fewer stops are in force. |
| R-04 | A seat change is unaudited, or personal preferences leak into exported chain segments. | `setup.record` is a catalog command; each seat change is a `setup.seats-changed` event (seated, benched) with the member as actor. The check-in answer is a preference and is never on the chain. | A seat change with no event, or a check-in answer in an event. |
| R-05 | Any member can bench an agent for the whole install. | Writes need administrator authority, or the bootstrap Member of a single-organization install (`authorizeInstallSetting`). | A Member without administrator authority changing seats (test: "refuses a Member without administrator authority"). |
| R-07 | A claim that read the old seats grants work after a bench returns. | Seats are read inside the claim after the dispatch lock; seat writes take the same lock. | A grant to a runtime benched by a write that had already returned. |
| R-08 | A roster switch overwrites other seats or the answer, or silently confirms setup. | Switches call `PUT /setup/seats/{runtime}`, which changes that seat only and leaves `confirmed` alone; switches are disabled until the saved seats load. | A switch changing another seat, the answer, or `confirmed`. |
| R-06 | The intake brief change makes agents write fields the contract refuses. | Drift test validates a brief-shaped draft against `WorkPackage.json` and checks every required field is named. | That test failing. |

## Selected mode

- **Mode:** Standard
- Basis: an additive API route and setting, a dispatch filter that can only remove candidates, and web pages. Reversible by revert. No protected surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A first run opens on Setup; the person confirms seats and one check-in answer before anything is saved; the Agents roster shows one switch per runnable agent and says in plain words why an agent cannot work, from the same probes as Provider CLIs; a benched agent is never offered work; the intake brief names every field the WorkPackage contract requires. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
