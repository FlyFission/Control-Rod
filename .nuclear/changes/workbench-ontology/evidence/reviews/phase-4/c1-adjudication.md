# PR C1 (#33) review adjudication

## Round 1 (Codex, `c1-codex-round1.md`): REVISE, ten findings

| # | Finding | Decision | Change |
|---|---|---|---|
| 1 | Pooled figure coverage never evaluated | Accepted (a regression in this PR: the finalize step was deleted while replacing the lens check) | Restored after the figure's last part, and a figure with no measured edge at all fails. Control: a hidden Safety ring must fail. |
| 2 | Covering logic: transparent covers, cross-figure stacking | Accepted | Only parts of the same figure (each figure is its own stacking context) or plates among plates can cover one another. A covering part's opacity is held by its own plate check; controls: a transparent mark chip, pill, code plate or name plate each fail their plate check. |
| 3 | Lens expectation read from the shape | Accepted | The expected colour is the requested tint resolved on its own, never read from the shape. Control: under the Gate lens, shapes forced back to a state colour must fail. The real lens to data mapping is held by the unit tests (`office-view.test.tsx`). |
| 4 | Gate flag and triangle could be any bright block | Accepted | Each symbol is matched against templates drawn from OfficeStage's own path data, with a minimum of ink; thresholds midway between measurements (real 0.17 to 0.21 mismatch with ink 27 to 31; a substituted block 0.65 or worse with ink 14). Control: a block in place of the gate flag must fail. |
| 5 | Fully marked neighbours paint into each other | Accepted | The dark bands on the chip, pill and code (this PR's earlier fix) came off; the Safety ring instead carries its own outer dark band, which keeps the figure's silhouette edge readable where the chip or pill lies over it. A fully marked figure paints 50 by 52px at minimum zoom. `validateLayout` rejects places closer than that (`FIGURE_SPAN`), and the harness runs a worst case floor with every figure carrying every mark and checks no painted extents meet. |
| 6 | Overlay folds work with unknown input freshness | Accepted | An agent with unverified inputs is not healthy and stays drawn. Test added. |
| 7 | "Every pinned input is current" overclaims | Accepted | The projection reports `current_inputs` (pinned package inputs still at their pinned revision); the card states only what is established (changed, current as pinned, or unknown) and says documents and other sources are not compared. |
| 8 | Signer always picks acceptance | Accepted | The card names the signature the rung opens: release for a draft, acceptance in verification, otherwise none. Also raised by an automated review thread. Test added. |
| 9 | Watch live and inputs and reach record no event | Deferred: owner decision | Both are reads. Whether a read of an agent's work should be recorded as its own event (an audit trail of who watched) is a policy decision for the owner, not something to invent here. Stop is a governed command with its event now; OV-06 stays partly open in the ledger with this reason. |
| 10 | Checker wording implies completed checking | Accepted | The checker shows its run's status (queued, checking now, finished, failed, stopped, lost) and the recorded pre-check outcome when one exists. |

## Round 2 (Codex, `c1-codex-round2.md`): REVISE, one finding, accepted

Finding 9's deferral judged reasonable.

| # | Finding | Decision | Change |
|---|---|---|---|
| 1 | The Change lens shows unknown freshness as current | Accepted | Three steps: an input changed; freshness unknown (any input not established, or no package input pinned); inputs current as pinned (only when every recorded input is established). Distinct greys, legend and accessible values; unit tests cover unverified, absent and mixed evidence. |

Also from the review's validation note: the worst case harness case now fills every seat and queue place on the floor (not 40 of them), every figure carrying every mark.

## Automated GitHub review threads on #33

| Thread | Decision | Change |
|---|---|---|
| office-harness.spec.ts: pooled coverage not evaluated | Already fixed | Round 1 finding 1. |
| AgentCard.tsx: signer picks acceptance on drafts (two threads) | Already fixed | Round 1 finding 8. |
| AgentCard.tsx: Stop stays enabled after a stop request | Fixed | Stop follows the run log's rule: queued, or running with no stop asked for yet; once asked, the card says the daemon has not confirmed it. Test added. |
| AgentCard.tsx: Stop always disabled for intake agents (two threads) | Fixed | The projection now carries `run_status` and `stop_requested`, so the card decides from the run itself, with or without a package view. Test: stopping a running intake agent. |
| figures.ts: no API test for `project_id` | Fixed | API test: a package and an intake capture owned by a project carry `project_id`; organization level work carries none; run status and stop request are projected. |
