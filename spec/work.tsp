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
}

enum RunRole {
  intake: "intake",
  author: "author",
  pre_check: "pre-check",
}

enum RunStatus {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  stopped: "stopped",
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
  started_at?: utcDateTime;
  finished_at?: utcDateTime;

  /** Short label the runner writes for the office view. Never raw model text. */
  @maxLength(120)
  label?: string;

  error?: string;
  trace?: ExecutionTrace;
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
