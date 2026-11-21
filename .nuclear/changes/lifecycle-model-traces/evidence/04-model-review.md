# Review of the package lifecycle model against the kernel

- Date: 2026-11-21
- Reviewer: a Claude Code agent working for the owner in the project thread "Close out the open review decisions". It did not write the model, the traces or the replays, and it was not briefed with the author's conclusions. It is an agent, not a person.
- Read: `models/package-lifecycle.qnt` (whole file) and `kernel/src/transition.rs` (`decide` and the types it uses), both at this branch's head after `main` was merged in on 2026-11-21.
- Not run here: Quint itself. CI runs the native and WebAssembly replays on the pushed head.

## Method

Each branch of `decide` was matched to the model by hand, in the kernel's order of checks: actor id, the human-only gate (`not-human`, then `unsigned`), the agent gate (`forbidden`), the preparation floors, then the status table, including each arm's reason code.

## Result: no disagreement found

| Kernel (`transition.rs`) | Model (`package-lifecycle.qnt`) | Match |
|---|---|---|
| empty `actor_id` after trimming refuses `forbidden` | `actor_id == ""` refuses `forbidden` | yes, see gap 1 |
| `human_only` set: release, accept, accept-with-findings, return, reject, override-independence | `HUMAN_ONLY`, same six | yes |
| a non-human actor on a human-only action refuses `not-human`; an unsigned one refuses `unsigned` | same order | yes |
| every other action needs an `Agent` actor, else `forbidden` | same; `system` refused on both paths | yes |
| preparation floors per action; return, reject and override always pass | `prepAllows`, same conditions; non-enrolled packages pass | yes |
| `submit-pre-check`: same baseline refuses `not-independent`; same provider without a verified override refuses `not-independent`; a missing baseline or runtime refuses `forbidden` | `preCheckDecision`, same three outcomes in the same order | yes |
| `revise`: fail or inconclusive goes to `in-work`; pass refuses `wrong-state`; none refuses `missing-pre-check` | same | yes |
| `accept`: pass goes to `accepted`; any other refuses `reason-required`; none refuses `missing-pre-check` | same | yes |
| `accept-with-findings`: none refuses `missing-pre-check`; no reason refuses `reason-required` | same | yes |
| `override-independence` stays `in-verification` with a reason | same | yes |
| `return` from released, in-work or in-verification goes to `draft`; `reject` from those or draft goes to `closed`; each needs a reason | same | yes |
| anything else refuses `wrong-state` | same | yes |

## Gaps (not disagreements)

1. The kernel trims `actor_id`, but the model only samples `""`, so a whitespace-only id is not exercised. Add `" "` to `ACTOR_IDS` when the model is next regenerated.
2. Provider spellings are sampled from four values. The kernel's trim and ASCII case folding are covered for those four only.
3. The model's state updates (what the server clears on revise or return, and when the override flag resets) are the model's assumptions about the API. They are not checked against `services/api` here. That is the run lease and claim follow-up.
4. Invariants restate the floors and are checked against the model's own `expected`. The comparison with the real kernel happens only in the trace replays.
