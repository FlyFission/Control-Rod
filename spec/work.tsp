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

/** Who acted. Agents and the system can never hold a human decision right. */
@extension("unevaluatedProperties", false)
model Actor {
  kind: "human" | "agent" | "system";
  id: string;
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

  /** Why a queued run is not being handed out, in plain words. */
  @maxLength(300)
  waiting_reason?: string;

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

  decided_at: utcDateTime;
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
