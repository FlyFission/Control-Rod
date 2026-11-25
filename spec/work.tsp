import "@typespec/json-schema";
import "./records.tsp";

using JsonSchema;

/**
 * Records for running work: captures, runs, decisions and the event log.
 * Version 0.1 additions for the General MVP.
 */
@jsonSchema
@id("https://controlrod.dev/schemas/v0")
namespace ControlRod.Records;

/**
 * Who acted. Agents can never hold a human decision right. The system acts only under the owner's
 * passkey-signed signing policy, and then only to release or to accept a pre-check that passed.
 */
@extension("unevaluatedProperties", false)
model Actor {
  kind: "human" | "agent" | "system";
  id: string;
}

/** A host-validated checkout selection. Only author runs may use it as their working directory. */
@extension("unevaluatedProperties", false)
model CheckoutBinding {
  repo: string;
  root: string;
  path: string;
  branch: string;
  head: string;
  git_dir: string;
  common_dir: string;
}

/** Something a person said they want done, before intake turns it into a package. */
@extension("unevaluatedProperties", false)
model Capture {
  schema_version: "0.1.0";
  id: string;

  @minLength(1)
  @maxLength(20000)
  text: string;

  source: "web" | "cli" | "voice" | "chat";
  /** Validated structured input; capture text cannot grant checkout access. */
  checkout?: CheckoutBinding;
  created_at: utcDateTime;

  /** Intake either answers a quick question directly or drafts a work package. */
  disposition?: "pending" | "answered" | "package";

  /** The direct answer for a quick question. No package, check or approval. */
  @maxLength(20000)
  answer?: string;

  package_id?: string;

  /**
   * The data lane a person with lane authority classified this capture into. Until it is set,
   * nothing from the capture goes to any runtime or provider (specification 11.3 M-0).
   */
  lane?: DataLane;

  classified_by?: string;
  classified_at?: utcDateTime;
}

enum RunRole {
  intake: "intake",
  author: "author",
  pre_check: "pre-check",
  /** Serialized future roles only; legacy dispatch and mutation paths refuse them. */
  requirements_preparer: "requirements-preparer",
  technical_preparer: "technical-preparer",
}

enum RunStatus {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  stopped: "stopped",

  /** The daemon stopped renewing its lease. Terminal; only the owner can requeue the work. */
  lost: "lost",
}

/** One version of a sandbox policy, as a run cites it. */
@extension("unevaluatedProperties", false)
model SandboxPolicyRef {
  id: string;

  @minValue(1)
  version: int32;

  digest: Digest;
}

/** One agent session working on one package revision in one role. */
@extension("unevaluatedProperties", false)
model Run {
  schema_version: "0.1.0";
  id: string;
  package_id: string;

  @minValue(0)
  package_revision: int32;

  role: RunRole;
  agent_baseline: string;
  runtime: RuntimeRef;
  /** Frozen when queued, for an author only. A daemon must refuse an unavailable or changed checkout. */
  checkout?: CheckoutBinding;

  /** Author and pre-check rounds start at 1; round 3 escalates a dispute to a person. */
  @minValue(1)
  round: int32;

  status: RunStatus;
  queued_at: utcDateTime;

  /** Controlled preparation basis; absent for historical legacy runs. */
  preparation_manifest_digest?: Digest;
  started_at?: utcDateTime;
  finished_at?: utcDateTime;

  /** Short label the runner writes for the office view. Never raw model text. */
  @maxLength(120)
  label?: string;

  error?: string;
  trace?: ExecutionTrace;

  /** While running: when the claim lapses unless the daemon renews it with a log post. */
  lease_expires_at?: utcDateTime;

  /** The run this one was requeued from, after it was lost, failed or stopped. */
  requeue_of?: string;

  /** The run the owner queued to replace this one. */
  requeued_as?: string;

  /** The owner asked to stop this run. It shows as stopping until the daemon confirms. */
  stop_requested_at?: utcDateTime;

  stop_requested_by?: string;

  /**
   * The SCRAM that stopped this run (specification 22a). Whatever the run reports afterwards is
   * quarantined: retained privately with its digests and never applied until a person reviews it.
   */
  scram_id?: string;

  /**
   * The run ceiling its budget reservation was sized from, in seconds (the daemon's timeout and
   * graceful stop ladder). The control plane asks the run to stop once it has run this long.
   */
  @minValue(1)
  budget_ceiling_seconds?: int32;

  /**
   * The sandbox policy version its agent actions run under (workbench plan task 6.1), by digest.
   * The daemon refuses a job whose policy does not match it.
   */
  sandbox_policy?: SandboxPolicyRef;

  /**
   * The minutes a reservation for this run takes (its ceiling and the control plane's margins,
   * rounded up), recorded whenever the daemon reported a ceiling, budget or not, so a minute budget
   * set while the run is in flight counts it at that size.
   */
  @pattern("^[0-9]+\\.[0-9]{2}$")
  reserve_minutes?: string;

  /** Why a queued run is not being handed out, in plain words. */
  @maxLength(300)
  waiting_reason?: string;

  /** The kind of hold, so it reaches whoever may resolve it (the Inbox routes on it). */
  waiting_cause?: "scram" | "lane" | "runtime-pin" | "independent-runtime" | "preparation" | "budget" | "sandbox";

  /**
   * What the hold waits on, where one decision resolves it for every run that names it: a lane's
   * admission, a runtime pin for a role and the runtimes it was offered, or a budget's hard cap. Absent when the hold is
   * the run's own (a preparation, an unclassified source, an independence conflict, a SCRAM).
   */
  @maxLength(300)
  waiting_key?: string;

  /** The owner let this pre-check run on the author's runtime. Recorded before it ran. */
  independence_override?: OwnerOverride;

  /**
   * Which attempt this is at its package revision, role and round, counting from 1. Reports from an
   * attempt a later one superseded are refused (the generation fence, specification 22).
   */
  @minValue(1)
  generation?: int32;

  /** The process the daemon spawned for this run, as it recorded it at spawn. */
  receipt?: OwnershipReceipt;

  /**
   * Set when the run was dispatched but its exit or completion was never observed (specification
   * 9 and 22). It holds requeue until a reconciliation records what happened.
   */
  outcome_unknown?: OutcomeUnknown;

  /** What settled an unknown outcome, and the evidence for it. */
  reconciliation?: Reconciliation;

  /**
   * Lease renewals granted without a heartbeat (after a controller restart, a machine sleep or an
   * apparent outage). At most one is granted until a heartbeat proves the run alive, so no number
   * of restarts keeps a dead run running.
   */
  @minValue(0)
  grace_renewals?: int32;

  /**
   * Whether this run can show that it needs a person's permission (plan task 2.9). observed: a
   * Claude Code PermissionRequest hook reports each request. not-observable: Codex exec mode gives
   * no such signal, so a refused action shows only as a failed tool call.
   */
  permission_waits?: "observed" | "not-observable";

  /**
   * Whether the server verified the daemon's attestation for this run.
   * The kernel does not read this until a later milestone.
   */
  attestation_verified?: boolean;

  /** Why the attestation did or did not verify, in plain words. */
  @maxLength(500)
  attestation_reason?: string;

  /**
   * The checker attempt this run will be recorded as. Assigned when a pre-check
   * starts, and the value the daemon signs as check_id.
   */
  @minLength(1)
  @maxLength(40)
  checker_attempt_id?: string;
}

/**
 * Proof of which process a daemon started for a run (specification 22). A stop, sweep or kill acts
 * only while the live process still matches: same boot, same process id, same start time.
 */
@extension("unevaluatedProperties", false)
model OwnershipReceipt {
  @minValue(1)
  pid: int32;

  /** The process group the run's process leads. */
  @minValue(1)
  pgid: int32;

  /** The process start time in the operating system's own units (Linux: clock ticks since boot). */
  @minLength(1)
  @maxLength(64)
  process_start: string;

  /** The kernel's identifier for this boot; a reboot changes it. */
  @minLength(1)
  @maxLength(64)
  boot_id: string;

  @minValue(1)
  generation: int32;

  started_at: utcDateTime;

  /**
   * cgroup: the run has its own systemd user scope, which the daemon can freeze and kill as one
   * and which reports when it is empty. process-group: the fallback without a user systemd.
   */
  containment: "cgroup" | "process-group";

  /** The scope's unit name (cgroup containment). */
  @maxLength(200)
  unit?: string;
}

@extension("unevaluatedProperties", false)
model OutcomeUnknown {
  since: utcDateTime;

  @maxLength(300)
  reason: string;
}

/**
 * One normalized thing an agent did (specification 20), built by the daemon from each runtime's own
 * output so the browser only renders. Text is clipped; tool inputs are kept as a digest and a short
 * plain summary, never in full.
 */
@extension("unevaluatedProperties", false)
model NormalizedEvent {
  kind: "message" | "tool_start" | "tool_end" | "file_change" | "permission_request" | "usage" | "error" | "exit" | "dropped" | "notice";
  at: utcDateTime;

  @maxLength(60) tool?: string;
  @maxLength(120) summary?: string;
  @pattern("^[0-9a-f]{64}$") input_digest?: string;
  @maxLength(80) call_id?: string;
  ok?: boolean;
  @maxLength(2100) path?: string;
  @maxLength(2100) text?: string;
  @minValue(0) input_tokens?: int32;
  @minValue(0) output_tokens?: int32;
  @minValue(0) cached_tokens?: int32;

  /**
   * Usage: true when the counts are the whole run's so far (a runtime's final result), not one
   * step's, so they replace the steps' counts rather than add to them.
   */
  cumulative?: boolean;

  /** How many events admission refused before this one (kind dropped). */
  @minValue(1) dropped?: int32;
}

/** How an unknown outcome was settled. */
@extension("unevaluatedProperties", false)
model Reconciliation {
  /**
   * completed-late: the daemon's completion arrived after the run was marked lost; it is retained,
   * never applied. process-gone: the daemon proved from its receipt that the process no longer runs.
   * abandoned: a person signed that the run will not report, with a reason.
   */
  disposition: "completed-late" | "process-gone" | "abandoned";

  @maxLength(2000)
  evidence: string;

  recorded_at: utcDateTime;
  by: Actor;
}

/**
 * A person's choice to proceed past a hold, with who, when and why, signed with their passkey
 * over the digest of (package, revision, run, the act and the reason).
 */
@extension("unevaluatedProperties", false)
model OwnerOverride {
  by: string;
  at: utcDateTime;

  @minLength(1)
  @maxLength(2000)
  reason: string;

  subject_digest: Digest;
  assertion: PasskeyAssertion;
}

/** A WebAuthn assertion over the decision digest, made by the person's own authenticator. */
@extension("unevaluatedProperties", false)
model PasskeyAssertion {
  credential_id: string;
  authenticator_data: string;
  client_data_json: string;
  signature: string;
}

/**
 * What one checker attempt counts as. A checker may report pass, fail or inconclusive.
 * Timeout, error, quota and cancelled are recorded as themselves and count as inconclusive:
 * they are never a pass, and they never erase a fail already recorded for the same deliverable.
 */
enum CheckerAttemptOutcome {
  pass: "pass",
  fail: "fail",
  inconclusive: "inconclusive",
  timeout: "timeout",
  error: "error",
  quota: "quota",
  cancelled: "cancelled",
}

/**
 * One checker attempt on one deliverable digest. Append-only: a later attempt is a new row.
 * Added in API 0.1; existing records are unchanged.
 */
@extension("unevaluatedProperties", false)
model CheckerAttempt {
  schema_version: "0.1.0";
  id: string;
  package_id: string;

  @minValue(0)
  package_revision: int32;

  run_id: string;

  @minValue(1)
  round: int32;

  /** The checker runtime the daemon assigned. "unassigned" when the run never started. */
  @minLength(1)
  @maxLength(80)
  checker_runtime: string;

  /** The model the runtime said it used. Absent when it did not say. */
  @maxLength(200)
  reported_model?: string;

  /** Place in the package's attempt history. Older attempts are read with before set to this value. */
  @minValue(1)
  seq?: int32;

  /**
   * Digest of the author deliverables this attempt checked, names and digests in name order.
   * Absent when digest_unknown is set: the bytes were not captured, and the attempt is not
   * attached to the deliverable the package holds now.
   */
  deliverable_digest?: Digest;

  /** The bytes this attempt checked were not captured. It does not stick to today's deliverable. */
  digest_unknown?: true;

  outcome: CheckerAttemptOutcome;

  /** pass and fail stand. inconclusive, timeout, error, quota and cancelled count as inconclusive. */
  counts_as: "pass" | "fail" | "inconclusive";

  started_at: utcDateTime;
  finished_at: utcDateTime;

  /**
   * Where to read the evidence: the run log, which holds the trace, the error and the outputs.
   * When a verification was admitted, verification_run_id names that record too.
   */
  @minLength(1)
  @maxLength(300)
  evidence: string;

  /** Set when a verification record was admitted for this attempt. */
  verification_run_id?: string;

  /** The signed override that allowed this attempt after a fail on the same digest. */
  recheck_override?: OwnerOverride;
}

/**
 * A fail on the current deliverable digest is sticky: another check is refused until the
 * deliverable changes or the owner signs an override. The words are what the API and the page show.
 */
@extension("unevaluatedProperties", false)
model CheckBlocked {
  code: "sticky-fail";

  @minLength(1)
  @maxLength(500)
  reason: string;

  @minLength(1)
  @maxLength(500)
  change: string;

  deliverable_digest: Digest;
}

/**
 * Several checks of this digest were inconclusive. Another check is still allowed.
 * The page warns; it does not refuse the check.
 */
@extension("unevaluatedProperties", false)
model CheckWarning {
  code: "repeated-inconclusive";

  @minLength(1)
  @maxLength(500)
  reason: string;

  @minValue(3)
  count: int32;
}

/** One signed override allowing a single re-check of a deliverable that already failed. */
@extension("unevaluatedProperties", false)
model RecheckOverride {
  id: string;
  package_id: string;

  @minValue(0)
  package_revision: int32;

  deliverable_digest: Digest;
  override: OwnerOverride;
}

enum DecisionKind {
  release: "release",
  accept: "accept",
  accept_with_findings: "accept-with-findings",
  `return`: "return",
  reject: "reject",
}

/** A person's decision on one package revision. Bound to the digest of what they saw. */
@extension("unevaluatedProperties", false)
model Decision {
  schema_version: "0.1.0";
  id: string;
  package_id: string;

  @minValue(0)
  package_revision: int32;

  kind: DecisionKind;
  actor: Actor;

  /** Digest of the package revision, output and pre-check record the person reviewed. */
  subject_digest: Digest;

  @maxLength(4000)
  reason?: string;

  assertion: PasskeyAssertion;

  /**
   * The one-time nonce the passkey challenge was built from, so the binding of the signature to
   * this subject, kind and revision can be re-verified from the record alone. Absent on decisions
   * recorded before it was kept.
   */
  @pattern("^[0-9a-f]{32}$")
  challenge_nonce?: string;

  /**
   * Present when the step went through under the owner's signing policy instead of a passkey of
   * its own: a copy of the signed policy it relied on. `assertion` is then the policy's assertion.
   */
  signing_policy?: SigningPolicyRef;

  decided_at: utcDateTime;
}

/** How each step on a routine card is taken: by Control Rod itself, by a press, or signed with a passkey. */
union SigningStepMode {
  "auto",
  "click",
  "passkey",
}

/** The owner's choice of what needs a passkey on a project's routine cards. */
@extension("unevaluatedProperties", false)
model SigningSteps {
  release: SigningStepMode;
  accept: SigningStepMode;
  `return`: "click" | "passkey";
  reject: "click" | "passkey";
}

/** The signed policy a decision relied on, without its assertion (the decision carries that). */
@extension("unevaluatedProperties", false)
model SigningPolicyRef {
  @pattern("^SP-[0-9a-f]{8}$")
  id: string;

  @minValue(1)
  version: int32;

  preset: "light" | "balanced" | "everything" | "custom";
  steps: SigningSteps;
  signed_by: string;
  signed_at: utcDateTime;

  /** The digest the owner's passkey signed: the command, the member and this exact choice. */
  subject_digest: string;

  @pattern("^[0-9a-f]{32}$")
  challenge_nonce?: string;
}

/** The signing policy as stored on its project: the reference plus the owner's passkey assertion. */
@extension("unevaluatedProperties", false)
model SigningPolicy {
  ...SigningPolicyRef;
  assertion: PasskeyAssertion;
}

/** One entry in the append-only event log. Each entry carries the digest of the one before. */
@extension("unevaluatedProperties", false)
model Event {
  @minValue(1)
  seq: int32;

  at: utcDateTime;
  type: string;
  subject: string;
  actor: Actor;
  data?: Record<unknown>;
  prev?: Digest;
  digest: Digest;
}

/**
 * Decision kinds of the Platform Plan (specification 5.5). Additive: the signed Decision record and
 * its DecisionKind are unchanged, and every historical decision is read through a versioned
 * DecisionKindMapping. Methodology and clearance have no legacy kind; they arrive with the
 * protected kernel change (plan 6.6).
 */
enum PlanDecisionKind {
  release: "release",
  methodology: "methodology",
  verdict: "verdict",
  clearance: "clearance",
}

/** The judgement a verdict records. */
enum VerdictOutcome {
  accept: "accept",
  accept_with_findings: "accept-with-findings",
  `return`: "return",
  reject: "reject",
}

/** One row of a mapping version: how a legacy kind reads as a plan kind. */
@extension("unevaluatedProperties", false)
model DecisionKindMapping {
  @minValue(1)
  mapping_version: int32;

  legacy_kind: DecisionKind;
  plan_kind: PlanDecisionKind;

  /** Present exactly when plan_kind is verdict. */
  verdict_outcome?: VerdictOutcome;
}

/** A historical decision read through a mapping version. Derived; never stored in place of it. */
@extension("unevaluatedProperties", false)
model DecisionReading {
  decision_id: string;

  /** Digest of the stored decision body, which the reading never alters. */
  decision_digest: Digest;

  @minValue(1)
  mapping_version: int32;

  plan_kind: PlanDecisionKind;
  verdict_outcome?: VerdictOutcome;
}
