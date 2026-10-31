/**
 * Refusals teach (workbench specification WB-03; plan task 1.11). Every reason code the API or the
 * kernel can answer with has a sentence a person can read and the one fact that would change the
 * answer. Floors (specification 11.2) are marked: no person, decision or setting lifts them.
 * A test reads every `new Refusal(...)` in the source and every kernel reason code, and fails when
 * one is missing here.
 */
export interface Reason {
  /** What happened, in words. */
  sentence: string;
  /** The one fact that would change the answer. For a floor, why nothing will. */
  change: string;
  /** Set for the floors of specification 11.2. */
  floor?: true;
}

const r = (sentence: string, change: string): Reason => ({ sentence, change });
const floor = (sentence: string, change: string): Reason => ({ sentence, change, floor: true });

export const REASONS: Record<string, Reason> = {
  // Floors (specification 11.2). Each is fail closed.
  "not-human": floor("Only a person may take this action; an agent or a daemon never decides, clears, sets policy or approves its own baseline.", "Nothing changes this; a person signed in with a passkey must take the action."),
  "not-independent": floor("The checker is the author or shares the author's baseline, so the check would not be independent.", "Assign a checker with a different baseline, or have a qualified person sign an override for a shared runtime."),
  "hardware-key-required": floor("This decision needs a credentialed person signing with a hardware backed key, and the passkey used has no attestation from an approved hardware authenticator.", "Enroll an attested hardware security key from the organization's approved list and sign with it."),
  "lane-local-only": floor("Restricted work runs only on local runtimes.", "Nothing changes this for restricted work; run it on a local runtime."),
  "sealed-no-auto-merge": floor("A sealed deliverable is never merged automatically.", "A qualified person must clear and apply the change by hand."),
  "autonomy-floor": floor("Autonomy level 4 is never permitted.", "Nothing changes this; choose level 3 or lower."),

  // Kernel reason codes (kernel/src/decision.rs).
  "not-implemented": r("The kernel has no rule for this request yet, so it refuses rather than guess.", "This needs a reviewed kernel change that adds the rule."),
  "policy-error": r("A policy failed to evaluate, so the request was refused rather than allowed by mistake.", "Fix the policy so it evaluates; the request can then be tried again."),
  forbidden: r("A floor or policy forbids this request.", "Only a change to the governing policy, made by its own signed process, could allow it."),
  unsigned: r("This needs a verified passkey signature over the exact digest on record, and none was given.", "Sign the request with your passkey over the version you reviewed."),
  "wrong-state": r("The work is not in a state this action applies to.", "Wait for the work to reach the step this action belongs to, or choose the action for its current step."),
  "missing-pre-check": r("Acceptance was asked for before any pre-check exists.", "Let the agent pre-check finish, then decide."),
  "reason-required": r("This action needs a written reason.", "Write why, then try again."),

  // Sessions, passkeys and requests.
  "signed-out": r("You are not signed in.", "Sign in with your passkey."),
  unauthorized: r("This route is for the runner daemon and needs its token.", "Call it from the daemon, which holds the token."),
  "cross-origin": r("The request did not come from the Control Rod app, so it was refused to protect your session.", "Make the change from the Control Rod app itself."),
  "not-a-member": r("This passkey belongs to no member of the organization.", "Ask an administrator to enroll you, then register with their invitation."),
  "not-registered": r("No passkey is registered yet.", "Register a passkey first."),
  "registration-refused": r("The passkey registration was refused.", "Register again with an administrator's invitation, or add a passkey to your own account by signing with one you hold."),
  "invitation-invalid": r("The invitation is not valid: it was used, voided or has expired.", "Ask an administrator for a new invitation."),
  "own-account-only": r("You can add a passkey only to your own account.", "Ask an administrator to invite the other person; they register their own passkey."),
  "step-up-required": r("Adding a passkey needs a signature from a passkey you already hold.", "Sign with your existing passkey first."),
  "step-up-failed": r("That signature did not come from a passkey on your account.", "Sign with one of your own registered passkeys."),
  "signature-required": r("This command needs your passkey.", "Sign it with your passkey."),
  "signature-mismatch": r("The signature does not cover this exact request.", "Request a fresh prompt for the request as it now stands and sign that."),
  "signature-revoked": r("The passkey that signed this is no longer valid.", "Sign with a passkey that is still registered to you."),
  "precondition-required": r("This edit must say which version it started from.", "Send the draft's current ETag in If-Match; the app does this when you edit from the page."),
  stale: r("The record changed since you opened it.", "Reload, review the current version and save again."),
  changed: r("The package changed since you opened it.", "Reload and review the current version before deciding."),
  conflict: r("That already exists.", "Use the existing record, or choose a different name or id."),
  invalid: r("The request is missing something or has a value outside what is allowed.", "Correct the field named in the message and send it again."),
  "not-found": r("Nothing by that id exists here.", "Check the id, or reload to see what exists now."),
  "reference-missing": r("Something this refers to does not exist in your organization.", "Create or choose an existing record to refer to."),
  "too-large": r("An attachment is over the size limit.", "Send a smaller file or split it."),
  "too-many-lines": r("Too many log lines were sent in one batch.", "Send the log in smaller batches."),
  "duplicate-output": r("Two outputs have the same name.", "Give each output a unique name."),

  // Members, authority and administration.
  "member-inactive": r("Your membership is not active.", "An administrator must reactivate your membership."),
  "member-not-active": r("That member is not active.", "An administrator must reactivate them first."),
  "member-retired": r("A removed member stays removed.", "Enroll the person again as a new member."),
  "member-has-passkey": r("This member already has a passkey; invitations are only for a first passkey.", "The member adds more passkeys themselves, signing with one they hold."),
  "authority-missing": r("Your qualification does not include the authority this needs.", "An administrator must issue you a qualification with that authority."),
  "qualification-missing": r("Your qualification does not cover this signature.", "Have your qualification reissued with the role, grade, discipline or license the message names."),
  "role-missing": r("You can delegate only a role you hold.", "Hold the role yourself first, or ask someone who holds it to delegate."),
  "discipline-missing": r("You can delegate only within a discipline you hold.", "Choose a discipline your qualification includes."),
  "invalid-dates": r("A delegation must run forward from its start, for at most a year.", "Choose an end date after the start and within a year of it."),
  "already-revoked": r("This is already revoked.", "Nothing to do; it no longer grants anything."),
  "last-administrator": r("This would leave the organization with no active administrator.", "Give another member administrator authority first."),
  "last-credential": r("This is the member's last usable passkey.", "Add another passkey before revoking this one."),
  "multi-organization-later": r("Control Rod runs one organization until the multi-organization phase.", "Nothing changes this before that phase."),
  "autonomy-ceiling": r("The organization's policy caps autonomy below the level asked for.", "Ask a person with policy authority to raise the ceiling through a policy change request."),
  "unknown-setting": r("That policy setting is not one Control Rod understands.", "Use one of the settings the policy page lists."),
  "invalid-setting": r("That policy setting has an invalid value.", "Use a value the setting allows."),
  "unknown-theme": r("Only bundled office themes can be selected.", "Pick one of the themes in the list."),
  "not-proposed": r("This change request is no longer open.", "Propose a new change request."),
  "proposal-mismatch": r("The proposal no longer matches the digest it was proposed with.", "Propose the change again."),

  // Markings and disclosure.
  "lowering-needs-change-request": r("Lowering a data lane is a declassification.", "Propose a declassification; a person with lane authority approves it with a passkey."),
  "not-lower": r("A declassification only lowers a lane, and this one would not.", "Choose a lane less sensitive than the current one."),
  "marking-changed": r("The marking changed after the change request named its version.", "Propose the declassification again for the current version."),
  "impact-changed": r("What depends on this changed after the change request listed it.", "Propose the declassification again so the impact list is current."),
  "unclassified-source": r("A source has no classified data lane, so nothing derived from it may use it yet.", "Have a person with lane authority classify the source first."),
  "mixed-lane-export": r("The export's lane does not cover every part it would carry.", "Export at a lane at least as sensitive as every part, or leave the more sensitive parts out."),

  // Packages, dependencies and runs.
  "unknown-dependency": r("This package depends on a package that does not exist.", "Name an existing package, or remove the dependency."),
  "invalid-dependency": r("This dependency is not allowed: a package cannot wait on itself, and two packages cannot wait on each other.", "Remove the dependency that closes the loop."),
  "preparation-edit-required": r("This package is under preparation, so its contract and criteria are edited together there.", "Edit it from the preparation view."),
  "not-requeueable": r("This run cannot be requeued in its current state.", "Only a failed, lost or stopped run can be requeued."),
  "not-running": r("The run is not running.", "Nothing to stop; check its current state."),
  "run-lost": r("The run's lease expired, so a late report cannot revive it.", "Requeue the run."),
  "stale-claim": r("The runner reporting this does not hold the run's claim.", "Only the runner that claimed the run may report on it."),
  stopped: r("The run was stopped, so its output cannot advance the package.", "Requeue the run if the work should continue."),
  "already-complete": r("This run already has a different completion on record.", "Nothing to do; the first completion stands."),
  "unsupported-run-role": r("This run needs its own approved execution and custody path, and the general path refuses it.", "Run it through the path its role requires."),
  "invalid-runtime": r("The runtime kind is not one Control Rod knows.", "Use a supported runtime."),
  "invalid-trace": r("The execution trace is invalid.", "Fix the trace so it matches the contract."),
  "output-changed": r("The author's deliverables are missing or no longer match their recorded digests.", "Run the author again so the deliverables and their digests agree."),
  "output-required": r("No author deliverable is available for acceptance.", "Let the author run produce its deliverables first."),
  "verifier-is-originator": r("You originated this work, so your verification would not be independent.", "Ask a qualified checker who did not capture or edit this work to verify it."),
  "verification-incomplete": r("A person's verification must cover every mandatory criterion.", "Verify every mandatory criterion the message lists, then sign."),
  "evidence-changed": r("The checker's evidence no longer matches its retained digest.", "Run the check again so fresh evidence is retained."),

  // Preparation.
  "not-enrolled": r("This package has no preparation.", "Enroll the package in preparation first."),
  "already-enrolled": r("This package already has preparation.", "Open its current preparation instead."),
  "already-resolved": r("This item already has a recorded resolution.", "Raise a new question for the changed basis."),
  "item-not-found": r("No such question or escalation.", "Reload the preparation to see its current items."),
  "resolved-item-immutable": r("A resolved question cannot change.", "Create a new question."),
  "human-resolution-required": r("Resolutions are recorded only through the human resolution action.", "Use the resolve action on the item."),
  "id-kind": r("A requirement or criterion id cannot change kind.", "Give the new item a new id."),
  "retired-id": r("A retired requirement or criterion id cannot be reused.", "Give the item a new id."),
  "duplicate-id": r("Preparation ids must be unique across item kinds.", "Rename the duplicate."),
  "unknown-source": r("The resolution refers to a source the preparation does not have.", "Cite one of the preparation's recorded sources."),
  "verification-controlled": r("The verification assignment is controlled by the package lifecycle.", "Change it through the package's release, not by editing."),
  "preparation-disabled": r("Manual preparation enrollment is not enabled.", "The owner can enable guided preparation in the settings."),
  "prepared-release-disabled": r("Prepared release is not enabled.", "The owner can enable prepared release in the settings."),
  "preparation-blocked": r("Preparation has open blockers.", "Resolve the blockers the message lists."),
  "requirements-blocked": r("The requirements cannot be confirmed while blockers remain.", "Resolve the blockers the message lists, then confirm."),
  "preparation-stale": r("An enrolled run cannot fall back to the legacy path.", "Run it through preparation."),
  "preparation-corrupt": r("Stored preparation no longer matches its recorded digest.", "Restore the preparation from its last verified revision; report this, as stored records should never change."),
  "capture-basis": r("The original capture must stay bound to this preparation.", "Keep the capture in the controlled basis."),
  "attachment-basis": r("An original attachment is missing from the controlled basis.", "Add the attachment back to the basis."),
  "basis-unverified": r("Only SHA-256 source pins are supported.", "Pin the source by its SHA-256 digest."),
  "design-input-basis": r("A design input must pin exactly one source at its declared revision.", "Pin one source at the declared revision."),
  "design-input-revision": r("A design input's current revision differs from the one declared.", "Revise the declared input explicitly, then refresh."),
  "design-input-unaccepted": r("A package this one uses as an input is not accepted yet.", "Wait for that package to be accepted."),
  "design-input-unavailable": r("A configured input source is unavailable or over its budget.", "Make the source available or raise its budget, then refresh."),
  "design-input-unverified": r("An accepted input package's author output is missing.", "Restore that package's accepted output."),
  "invalid-manifest": r("The preparation release manifest is incomplete.", "Release the package again so the manifest is complete."),
  "manifest-missing": r("The prepared checker run needs its release manifest.", "Release the package through preparation."),
  "manifest-mismatch": r("The criterion results name a different released basis.", "Check against the current release."),
  "criterion-role": r("Only the assigned checker can submit criterion results.", "Submit them from the checker run."),
  "criterion-results-required": r("Prepared verification must record every controlled criterion and check.", "Record a result for each criterion and check."),
  "criterion-results-corrupt": r("The results no longer match their recorded verification.", "Run the check again."),
  "criterion-evidence-changed": r("Retained checker evidence changed, so acceptance is blocked.", "Run the check again so fresh evidence is retained."),
  "invalid-criterion-results": r("The criterion results are not valid.", "Correct the results the message names."),

  // Preparation grants (the controller file broker).
  "grant-token-required": r("A valid credential for this preparation grant is required.", "Use the grant credential issued to this run."),
  "grant-exists": r("This run already has a grant, and a grant is never reissued.", "Use the existing grant."),
  "grant-stale": r("The run, lease, preparation or input behind this grant is no longer current.", "Start a new run for the current preparation."),
  "grant-budget": r("This grant's operation budget is used up.", "Start a new run if more work is needed."),
  "grant-input-budget": r("The assigned inputs exceed the supported resource budget.", "Assign fewer or smaller inputs."),
  "grant-input": r("This input is not assigned to the grant.", "Use only the inputs the grant assigns."),
  "grant-intent": r("The result does not match this permit's intent.", "Submit a result for the permit's declared intent."),
  "grant-replay": r("This permit already has a different result.", "Nothing to do; the first result stands."),
  "grant-pending": r("Every pending operation slot is in use.", "Wait for a pending operation to finish."),
  "grant-proposal-exists": r("This grant already has its one admitted proposal.", "Nothing to do; one proposal per grant."),
  "grant-content": r("The proposal encoding is not canonical base64.", "Encode the proposal as canonical base64."),
  "grant-busy": r("The authority did not acknowledge in time.", "Retry the same request."),
  "grant-database-version": r("Controller grants need PostgreSQL 17 or newer.", "Upgrade PostgreSQL to version 17 or newer."),

  // The server itself.
  error: r("Something went wrong on the server.", "The cause is in the server log; try again once it is fixed."),
};

/** The sentence and change for a reason code, or a plain fallback for a code not listed. */
export function teach(code: string): Reason {
  return REASONS[code] ?? { sentence: "The request was refused.", change: "Read the message for what to change." };
}
