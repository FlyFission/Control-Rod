# Office view acceptance cases (OV P1)

Status: **approved by the owner on 2026-10-30** (workbench plan task 0.8). The Platform Plan's scenario spreadsheet (100 scenarios) was not available, so these cases are written from the Platform Plan's office view section (Experience tab) and the workbench specification, sections 13 and 18. Once approved, each case becomes a test or a recorded check in plan task 4.7, run on both the default theme and the structural test theme.

Each case states a **given** (fixture state), a **when** (event or action), a **then** (what the floor and its panels must show, derived only from recorded data) and a **never** (the negative check). "Figure" means an AgentFigure projection; "card" means the panel that opens from a figure.

## OV-01 Needs me, routed

- **Given** three agents: one blocked on a permission only the viewer can grant, one waiting on a signature from the viewer, one waiting on another Member.
- **When** the floor loads.
- **Then** the first two figures stand in Your office (four inside, others queued at the door) and the header count reads 2; the Inbox lists them ordered by gate risk, then age.
- **Never** the third agent in Your office, or counted in needs me.

## OV-02 Every state says why

- **Given** one agent each in working, needs you, waiting on someone, stuck and input changed.
- **When** the floor loads.
- **Then** each figure shows its state shape and a cause label from recorded events: what it is doing; what you must decide; who it waits on (by name); what blocks it and for how long; which input changed.
- **Never** a state without a cause label, or a cause guessed from terminal output. In print mode runs, permission waits show "permission waits not observable in print mode" until ACP lands.

## OV-03 Group by cause

- **Given** five agents stuck on the same missing input owned by one Member for 2 days.
- **When** the floor loads.
- **Then** one cause chip shows the input, its owner and age, with a count of 5; opening it lists the five agents.
- **Never** five separate, unrelated looking stuck figures with no shared cause.

## OV-04 Change ripple

- **Given** a certified vendor data change arrives for an input three packages consume, one of them already in verification.
- **When** the change event is recorded.
- **Then** the dock shows the arrival; a ripple view names the packages that reopen, the ones that unblock, and the card pulled back from verification.
- **Never** a silent change to an accepted record, or a ripple that names packages the change does not reach.

## OV-05 Your office is a work surface

- **Given** a permission request, a signature request and a dispute in Your office.
- **When** the viewer opens each.
- **Then** each offers only its own actions: approve once or deny with reason; review and sign, later, or delegate to a qualified person; rule, send to the review room, or give direction. Signing opens the evidence first and binds to that revision with a passkey.
- **Never** an approval on timeout, or a sign button for a Member who lacks the needed qualification (the refusal names what is missing).

## OV-06 Act from the agent

- **Given** a working agent.
- **When** the viewer opens its card.
- **Then** the card offers call to my office, give direction, inputs and reach, watch live, park and stop; each action is a governed command with its own event.
- **Never** an action on the card that bypasses the command layer.

## OV-07 Lenses

- **Given** a populated floor.
- **When** the viewer switches between the Status, Gate, Change and Spend lenses.
- **Then** the same figures recolour by that lens; Spend appears only under its lens; presenting mode hides spend and any restricted wing.
- **Never** a lens that moves figures, or a state shape that changes with the lens.

## OV-08 Per agent glance and card

- **Given** a Safety grade agent with a changed input and two review loops.
- **When** the floor loads and the viewer opens its card.
- **Then** the figure shows at most five marks (state shape, gate flag, changed input triangle, loop count, Safety ring) and the package code; the card shows rung, due date, input quality and stale inputs, last real progress, checker and signer, interfaces owned and spend against budget.
- **Never** more than five marks on a figure.

## OV-09 Since you last looked

- **Given** activity since the viewer's last visit: two changes, one signature, one late package, one dispute, one gate criterion still at NO, and new spend.
- **When** the viewer returns.
- **Then** a six line digest summarises changes, signatures, lateness, disputes, gate criteria still at NO and spend, with readiness as counts of open criteria.
- **Never** raw event codes in the digest.

## OV-10 Rigor and independence visible

- **Given** a standard rigor package whose pre-check ran on the same provider as its author, with an owner override.
- **When** the viewer opens its card.
- **Then** the card shows the rigor tier and states, in words, that the pre-check shares the author's provider, with the override's reason and signer.
- **Never** a pre-check presented as independent when an axis is shared.

## OV-11 Roles and walls

- **Given** a Member qualified in electrical discipline only.
- **When** they open a mechanical Material grade deliverable awaiting verification.
- **Then** verify and sign are shown as unavailable, with the missing discipline and grade named; cube sets keep each discipline's own lead and signer.
- **Never** a live sign or verify control without the matching qualification.

## OV-12 Scoped stop and staged restart

- **Given** a project with seven agents running, one with an unreconciled outcome unknown.
- **When** the viewer starts SCRAM for the project.
- **Then** the scope is stated before it fires, a passkey signature is required, all seven stop where they stand, credentials are revoked, partial work is quarantined, and stop latency is shown; staged restart by discipline or package asks for a reason and is refused for the package with outcome unknown.
- **Never** a stop that reaches other projects, or a restart without a reason.

## OV-13 Spend and providers visible

- **Given** agents on two runtimes, one near its budget's alert line.
- **When** the viewer opens the Spend lens.
- **Then** figures tint by spend against budget, cards name the runtime and pinned version, and the alert is visible; unavailable telemetry shows as unavailable.
- **Never** missing usage shown as zero.

## OV-14 Disputes and loops surface

- **Given** a package on its third review loop with an open dispute.
- **When** the floor loads.
- **Then** the figure's loop count reads 3, and the dispute appears in Your office with its parties and the review room offered.
- **Never** a dispute visible only inside a card.

## OV-15 Security holds stand apart

- **Given** a run held because its sandbox attestation refuted a mandatory claim.
- **When** the floor loads.
- **Then** the figure stands in quarantine with the refuted claim named; the hold is distinct from ordinary stuck work.
- **Never** a security hold shown as an ordinary block, or released without a signed decision.

## OV-26 Fits the project

- **Given** a software project with three agents and a capital project with forty.
- **When** each floor loads.
- **Then** empty cube sets stay empty and regulatory agents appear only where the sector needs them; past about forty agents the floor becomes an exceptions overlay with healthy work folded into per room counts.
- **Never** a crowded floor that hides the agents needing attention.

## Exit criteria

The owner approves these cases or edits them; each approved case then has a test or recorded check in plan task 4.7.

## Source-lineage note

Written from the owner's Control Rod Platform Plan (Experience tab, office view) and the workbench specification. No scenario spreadsheet content was available.
