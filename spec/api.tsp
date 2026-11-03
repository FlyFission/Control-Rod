import "@typespec/http";
import "./records.tsp";
import "./work.tsp";
import "./workbench.tsp";

using Http;
using JsonSchema;
using ControlRod.Records;

/** Control Rod control plane API, version 0.1. */
@service(#{ title: "Control Rod API" })
@server("http://localhost:7300", "Local control plane")
namespace ControlRod.Api;

model Health {
  status: "ok";
  version: string;
}

model ApiError {
  /** A stable reason code (services/api/src/refusals.ts lists every one). */
  code: string;

  message: string;

  /** The one fact that would change the answer (WB-03). */
  change?: string;

  /** Set when a floor refused: no person, decision or setting lifts it. */
  floor?: boolean;
}

/**
 * One command for an object and the viewing Member (workbench specification 5.7): allowed or
 * refused, why in words, what would change it, how it is signed and the authority it needs.
 */
model ActionDescriptor {
  /** The command or decision, for example "release" or "draft.edit". */
  command: string;

  label: string;
  allowed: boolean;
  signature: "direct" | "absorbed" | "none";

  /** Any one of these roles or authorities may take it. */
  authority?: string[];

  /** Qualifications the viewer lacks for it, in words. */
  missing?: string[];

  reason_code?: string;
  reason?: string;
  change?: string;
  floor?: boolean;
}

alias Refused = {
  @statusCode _: 400 | 401 | 403 | 404 | 409 | 428;
  @body error: ApiError;
};

@route("/health")
@get
op health(): Health;

/** Single-user local sign-in with a passkey. */
@route("/auth")
namespace Auth {
  model Session {
    registered: boolean;
    signed_in: boolean;
    user?: string;
  }

  /** WebAuthn options as JSON, passed straight to the browser API. */
  model Options {
    options: Record<unknown>;
  }

  @route("/session") @get op session(): Session;
  @route("/register/options") @post op registerOptions(@body body: { name: string }): Options | Refused;
  @route("/register/verify") @post op registerVerify(@body body: Record<unknown>): Session | Refused;
  @route("/login/options") @post op loginOptions(): Options | Refused;
  @route("/login/verify") @post op loginVerify(@body body: Record<unknown>): Session | Refused;
  @route("/logout") @post op logout(): Session;
}

@route("/captures")
namespace Captures {
  model NewCapture {
    /** Typed text plus any attachment fences; the visible text is capped at 20,000 characters. */
    @minLength(1)
    @maxLength(30000000)
    text: string;

    source?: "web" | "cli" | "voice" | "chat";

    /** Classifies the capture at once when the sender holds lane authority; otherwise it waits unclassified. */
    lane?: ControlRod.Records.DataLane;
  }

  /** Classifies a capture's data lane. Needs lane authority; a capture's lane can be raised, never lowered here. */
  model Classification {
    lane: ControlRod.Records.DataLane;
  }

  /** The latest intake run for a capture still pending, so a failed intake is never stranded. */
  model IntakeState {
    run_id: string;
    status: RunStatus;
    error?: string;
  }

  model CaptureView {
    ...Capture;
    package_ids?: string[];
    intake?: IntakeState;

    /** The capture's effective lane (specification 11.3 M-3), shown wherever it appears. */
    effective_lane?: ControlRod.Records.DataLane;
  }

  @get op list(): CaptureView[];
  @post op create(@body body: NewCapture): {
    @statusCode _: 201;
    @body capture: Capture;
  } | Refused;
  @route("/{id}/classify") @post op classify(@path id: string, @body body: Classification): Capture | Refused;
}

/** What the web app shows for one package: the revision, its runs, output and decisions. */
model PackageView {
  /** Strong ETag of the current draft's content; send it as If-Match to edit the draft. */
  draft_etag?: string;

  /** The package's effective lane: its own lane raised by everything it was derived from (11.3 M-1). */
  effective_lane?: ControlRod.Records.DataLane;

  preparation_enabled?: boolean;
  preparation_enrolled?: boolean;
  preparation_release_ready?: boolean;
  preparation_verification_complete?: boolean;
  preparation_results_pass?: boolean;
  deliverable_integrity?: "intact" | "changed";
  criterion_results?: ControlRod.Preparation.CriterionResultSet;
  criterion_results_run_id?: string;
  criterion_results_integrity?: "intact" | "changed";
  `package`: WorkPackage;
  runs: Run[];
  outputs: Artifact[];
  pre_check?: VerificationRecord;
  decisions: Decision[];

  /** Digest a decision on this revision must be bound to. */
  subject_digest: Digest;

  /** What a signature on this revision binds, in words (drafts and work in verification). */
  binds?: string;
}

@route("/packages")
namespace Packages {
  @get op list(): WorkPackage[];
  @get op read(@path id: string): PackageView | Refused;

  /** Edit a draft. Released revisions are never edited; return them to make a new draft. Requires If-Match with the current draft_etag: 428 without it, 409 when stale. */
  @put op update(@path id: string, @header("If-Match") ifMatch: string, @body pkg: WorkPackage): WorkPackage | Refused;

  /** What the viewing person can do with this package now, each allowed or refused with the reason. */
  @route("/{id}/actions") @get op actions(@path id: string): ActionDescriptor[] | Refused;

  @route("/{id}/outputs/{name}")
  @get
  op output(@path id: string, @path name: string): {
    @header contentType: string;
    @body body: bytes;
  } | Refused;

  /** Authenticated access only to evidence referenced by an admitted checker result. */
  @route("/{id}/verification-evidence/{runId}/{name}") @get
  op verificationEvidence(@path id: string, @path runId: string, @path name: string): { @header contentType: string; @body body: bytes; } | Refused;

  @route("/{id}/runs/{runId}/log")
  @get
  op runLog(@path id: string, @path runId: string): {
    lines: string[];
  } | Refused;

  /** The run's story: its normalized events in order, after a sequence number. */
  @route("/{id}/runs/{runId}/events")
  @get
  op runEvents(@path id: string, @path runId: string, @query after?: int32): {
    events: { seq: int32; event: NormalizedEvent }[];
  } | Refused;

  /**
   * The owner queues a new run in place of one that was lost, failed or stopped. The old run
   * keeps its record. Repeating returns the run already queued.
   */
  /**
   * The owner stops a run. A queued run stops at once. For a running run the request is
   * recorded first, then the daemon is told in its next log reply and ends the process; the run
   * shows as stopping until the daemon confirms. Repeating is harmless.
   */
  @route("/{id}/runs/{runId}/stop")
  @post
  op stop(@path id: string, @path runId: string): Run | Refused;

  /** Settle a run's unknown outcome: the person signs that it will not report, with a reason. */
  @route("/{id}/runs/{runId}/reconcile/options") @post op reconcileOptions(@path id: string, @path runId: string, @body body: { @minLength(1) @maxLength(2000) reason: string }): {
    subject_digest: Digest;
    options: Record<unknown>;
  } | Refused;

  @route("/{id}/runs/{runId}/reconcile") @post op reconcile(@path id: string, @path runId: string, @body body: { @minLength(1) @maxLength(2000) reason: string; assertion: Record<unknown> }): Run | Refused;

  model OverrideRequest {
    @minLength(1)
    @maxLength(2000)
    reason: string;
  }

  /**
   * Step 1 of the owner's override: the server returns the digest of (package id, revision, run
   * id, "override-independence", reason) and a WebAuthn challenge derived from it.
   */
  @route("/{id}/runs/{runId}/override-independence/options")
  @post
  op overrideIndependenceOptions(@path id: string, @path runId: string, @body body: OverrideRequest): {
    subject_digest: Digest;
    options: Record<unknown>;
  } | Refused;

  /**
   * Step 2: the signed override. The challenge is consumed once; the kernel allows it only as a
   * signed human act with a reason. Recorded as an event with the assertion, carried into the
   * verification record, and only then may the pre-check run on the author's provider.
   */
  @route("/{id}/runs/{runId}/override-independence")
  @post
  op overrideIndependence(@path id: string, @path runId: string, @body body: {
    ...OverrideRequest;
    assertion: Record<unknown>;
  }): Run | Refused;

  @route("/{id}/runs/{runId}/requeue")
  @post
  op requeue(@path id: string, @path runId: string): {
    @statusCode _: 201;
    @body run: Run;
  } | Refused;

  model DecisionRequest {
    kind: DecisionKind;

    @minValue(0)
    package_revision: int32;

    reason?: string;

    /**
     * The subject digest the person was shown. The server refuses the options request when the
     * package has changed since, so a person never signs content they did not see.
     */
    expected_subject_digest?: Digest;
  }

  /** Step 1: the server returns the digest to sign and a WebAuthn challenge derived from it. */
  @route("/{id}/decisions/options")
  @post
  op decisionOptions(@path id: string, @body body: DecisionRequest): {
    subject_digest: Digest;
    options: Record<unknown>;
  } | Refused;

  /** Step 2: the signed decision. The kernel decides whether it is allowed. */
  @route("/{id}/decisions")
  @post
  op decide(@path id: string, @body body: {
    ...DecisionRequest;
    assertion: Record<unknown>;
  }): {
    @statusCode _: 201;
    @body decision: Decision;
  } | Refused;

  /** What a qualified checker verified in person (specification 11.5). */
  model PersonVerificationRequest {
    @minValue(0) package_revision: int32;

    /** Criterion ids: a prepared package's criteria, or AC-1, AC-2 and so on for acceptance criteria. */
    @minItems(1) criteria: string[];

    outcome: "pass" | "fail" | "inconclusive";
  }

  /** Step 1: every rule that needs no signature is checked, then the digest to sign. */
  @route("/{id}/person-verifications/options")
  @post
  op personVerificationOptions(@path id: string, @body body: PersonVerificationRequest): {
    subject_digest: Digest;
    options: Record<unknown>;
  } | Refused;

  /** Step 2: the signed verification, checked again and recorded. */
  @route("/{id}/person-verifications")
  @post
  op recordPersonVerification(@path id: string, @body body: {
    ...PersonVerificationRequest;
    assertion: Record<unknown>;
  }): {
    @statusCode _: 201;
    @body record: ControlRod.Records.PersonVerification;
  } | Refused;
}

/** One entry in your office: something that needs a person. */
model OfficeItem {
  kind: "release" | "accept" | "dispute" | "permission" | "lost";
  package_id: string;
  package_revision: int32;
  title: string;
  detail: string;
  since: utcDateTime;
}

/** Where an item opens: a page, and for a package which one and which section. */
model AttentionTarget {
  to: string;
  id?: string;
  hash?: string;
}

/**
 * One thing waiting (AttentionItem, specification 5.11). Decisions state what a signature binds;
 * risk orders the Inbox (gate risk, then age).
 */
model AttentionItem {
  kind: "release" | "accept" | "dispute" | "permission" | "lost" | "scram" | "confirm";
  package_id?: string;
  package_revision?: int32;
  scram_id?: string;

  /** For a held intake run: the capture it reads (no package exists yet). */
  capture_id?: string;
  title: string;
  detail: string;
  since: utcDateTime;
  risk: { rank: int32; label: string };

  /** The sentence a signer reads: what the digest covers. */
  binds?: string;
  subject_digest?: Digest;

  /** Decisions the viewer may take on it now. */
  decisions?: string[];

  /** For an item waiting on someone else: who, and why not the viewer. */
  waiting_on?: string;
  reason?: string;
  href: AttentionTarget;
}

/** A line of the "since you last looked" digest, in words. */
model DigestLine {
  topic: "changes" | "signatures" | "lateness" | "disputes" | "gates" | "spend";
  text: string;
  count: int32;
}

/** The Inbox for the viewing person (specification 12; OV-01, OV-09). */
@route("/inbox")
@get
op inbox(
  /** The last event sequence the viewer saw; absent on a first visit, which returns only the head. */
  @query since?: int32,
): {
  items: AttentionItem[];
  waiting_on_others: AttentionItem[];
  digest: { head: int32; lines: DigestLine[] };
} | ApiError;

/** Whether Control Rod earns its place: measured per accepted package. */
model Metrics {
  packages_accepted: int32;
  first_pass_accepted: int32;

  /** Findings the pre-checker raised that the author fixed before you saw the work. */
  findings_caught_before_review: int32;

  /** Median minutes from the work reaching your office to your decision. */
  median_review_minutes?: string;

  /** Median minutes from capture to acceptance. */
  median_minutes_to_done?: string;

  quick_answers: int32;
}

@route("/metrics")
@get
op metrics(): Metrics;

@route("/office")
@get
op office(): OfficeItem[];

/** Where a figure stands in the office (specification 13): a discipline's cube set, or a room. */
union FigurePlace {
  "process", "mechanical", "electrical", "civil", "assurance", "project-controls",
  "review", "interface", "verification", "your-office", "document-control", "bench", "quarantine",
}

/**
 * One agent on the office floor (AgentFigure, specification 13 and 18; plan task 4.6), projected only
 * from recorded data: the package, its latest run at the current revision, what the Inbox routes to
 * the viewer, SCRAM holds and recorded dependencies. Never guessed from terminal output.
 */
model AgentFigure {
  /** The run the figure stands for. */
  id: string;
  package_id: string;
  package_revision: int32;
  title: string;
  role: RunRole;

  /** The five states (OV-02); each always carries a cause. */
  state: "working" | "needs" | "waiting" | "stuck" | "changed";

  /** Why, in words: what it is doing, what you must decide, who it waits on, what blocks it, which input changed. */
  @maxLength(300)
  cause: string;

  /** Who it waits on, by name, when waiting. */
  waiting_on?: string;

  /** When the present state began, so a reader sees how long. */
  since: utcDateTime;

  place: FigurePlace;

  /** True when the discipline is unset or unmapped, so the figure stands in Process by default. */
  place_defaulted?: boolean;

  /** At most these marks besides the state shape (OV-06). */
  marks: {
    /** A gate decision (release or accept) waits on this package. */
    gate: boolean;

    /** The input that changed, when one did. */
    changed_input?: string;

    /** The run's round, when past the first. */
    loop?: int32;

    /** Safety grade work. */
    safety: boolean;
  };

  /** The nearest gate, for the Gate lens. */
  gate_stage: "release" | "in-work" | "pre-check" | "accept" | "settled";

  /** Recorded once a permission wait cannot be observed for this runtime (print mode, plan task 2.9). */
  observability?: string;

  data_lane: DataLane;
  href: AttentionTarget;
}

/**
 * The office floor for the viewing person. In presenting mode, work above the internal lane is left
 * out of the response entirely and only counted.
 */
@route("/office/figures")
@get
op officeFigures(@query presenting?: boolean): {
  figures: AgentFigure[];

  /** How many figures stand in Your office: the viewer's own (OV-01). */
  needs_me: int32;

  /** Figures left out because presenting mode hides lanes above internal. */
  hidden: int32;

  generated_at: utcDateTime;
} | ApiError;

/** What the daemon last reported about each runtime it found, for the office. */
@route("/runtimes")
@get
op runtimes(): {
  reported_at?: utcDateTime;
  runtimes: Runner.RuntimeStatus[];

  /** The active pins, per runtime and role. */
  pins: RuntimePin[];
};

/** The viewing member, as the command layer knows them. */
model Caller {
  userName: string;
  memberId: string;
  orgId: string;
}

/** An administrative command and what it needs (specification 10.2). */
model AdminCommandInfo {
  name: string;
  label: string;
  signature: "direct" | "none";

  /** "member", or authorities joined by "+" (any member, or each listed authority). */
  need: string;
}

/** Administration: who is here, what is in force, and every command with the viewer's standing. */
@route("/admin")
@get
op admin(): {
  me: Caller;
  bootstrap: boolean;
  qualification: SignerQualification | null;
  members: Member[];
  projects: Project[];
  policy: PolicySet | null;
  themes: string[];
  commands: AdminCommandInfo[];
  actions: ActionDescriptor[];

  /** The floors in force: no person, decision or setting lifts them. */
  floors: { code: string; sentence: string; change: string }[];
} | ApiError;

/** One quarantine batch: what a SCRAM-stopped run reported in one completion, as digests. */
model ScramQuarantineBatch {
  @minValue(1) id: int32;
  reported: string;
  @minValue(0) output_count: int32;
  recorded_at: utcDateTime;
  outputs: { name: string; @pattern("^[0-9a-f]{64}$") sha256: string }[];
}

/** A SCRAM, the runs it stopped with their quarantine and reviews, and its restarts. */
@route("/scrams/{id}")
@get
op scram(@path id: string): {
  scram: ScramEvent;
  runs: {
    run_id: string;
    status: RunStatus;
    outcome_unknown: boolean;
    batches: ScramQuarantineBatch[];
    reviews: QuarantineReview[];
  }[];
  restarts: ScramRestart[];
} | ApiError;

/** Runs that are queued or running, across every package, for the floor and board. */
@route("/runs")
@get
op activeRuns(): Run[];

@route("/events")
namespace Events {
  @get op list(@query after?: int32): Event[];

  /** Server-sent events: one `event` message per appended entry. */
  @route("/stream") @get op stream(): {
    @header contentType: "text/event-stream";
    @body body: string;
  };

  /** Recomputes the hash chain and reports the first broken link, if any. */
  @route("/verify") @get op verify(): {
    ok: boolean;
    count: int32;
    broken_at?: int32;
  };
}

/** Run daemon API. Authenticated with the daemon token; it can never make a decision. */
@route("/runner")
@jsonSchema
namespace Runner {
  @extension("unevaluatedProperties", false)
  model NamedFile { name: string; content_base64: string; }

  @extension("unevaluatedProperties", false)
  model LogReply {
    /** End the agent process when the owner has requested a stop. */
    stop: boolean;
    lease_expires_at: utcDateTime;
  }

  @extension("unevaluatedProperties", false)
  model Job {
    run: Run;
    `package`?: WorkPackage;
    capture?: Capture;

    /** For a pre-check: only the deliverable and criteria, never the author's transcript. */
    inputs: NamedFile[];

    findings?: Finding[];

    /** Custody of this run: present the token on every log and completion. */
    claim: RunClaim;

    /** The artifact this run must launch, when one is pinned for its runtime and role. */
    runtime_pin?: RuntimePinRef;
  }

  /** A claim on one run. Log posts renew the lease; a lapsed lease marks the run lost. */
  @extension("unevaluatedProperties", false)
  model RunClaim {
    token: string;
    lease_expires_at: utcDateTime;

    /** Post a log batch, even an empty one, at least this often. */
    heartbeat_seconds: int32;
  }

  /** What the control plane recorded for a completion. A repeat with the same key returns it again. */
  @extension("unevaluatedProperties", false)
  model CompletionReceipt {
    run_id: string;
    idempotency_key: string;
    status: RunStatus;
    outputs: Artifact[];
    received_at: utcDateTime;

    /** Set when the completion could not be applied; the run is then recorded failed with this reason. */
    refusal?: ApiError;
  }

  /** The daemon's probe of one runtime it found: whether it is ready for work, and why not. */
  @extension("unevaluatedProperties", false)
  model RuntimeStatus {
    runtime: string;
    ready: boolean;
    version?: string;

    @maxLength(300)
    reason?: string;

    /** The CLI could say whether a login is present. The probe never signs in. */
    login_checked: boolean;

    /** The executable the probe checked: its resolved path and SHA-256. Runs launch exactly this. */
    artifact?: RuntimeArtifact;
  }

  /**
   * A runtime's native executable and its SHA-256. A runtime whose npm launcher wraps a platform
   * binary with helper files (Codex) is identified by a digest over that whole platform directory.
   * Script launchers whose own digest would not identify what runs are refused.
   */
  @extension("unevaluatedProperties", false)
  model RuntimeArtifact {
    @maxLength(4096) path: string;
    digest: Digest;
  }

  /** The artifact a run must launch, from the pin for its runtime and role (specification 21). */
  @extension("unevaluatedProperties", false)
  model RuntimePinRef {
    runtime: string;
    digest: Digest;
    version?: string;
  }

  @route("/claim") @post op claim(@body body: {
    /** Runtimes ready for work. The control plane picks only from these. */
    runtimes: string[];

    runtime_status?: RuntimeStatus[];
  }): Job | {
    @statusCode _: 204;
  } | Refused;

  @route("/runs/{id}/log") @post op log(@path id: string, @body body: {
    claim_token: string;
    lines: string[];
    label?: string;

    /** The spawn receipt, sent until the control plane has recorded it. */
    receipt?: OwnershipReceipt;

    /** Normalized events since the last post. */
    @maxItems(500) events?: NormalizedEvent[];

    /**
     * How many of this run's events the daemon had delivered before this batch. The control plane
     * keeps each event once by its index, so a batch resent after an upload whose answer was lost
     * is not recorded twice.
     */
    @minValue(0) events_from?: int32;
  }): LogReply | Refused;

  /**
   * After a restart the daemon reports, from its retained receipts, runs whose process it found gone
   * (or stopped, after verifying the receipt). The control plane settles their unknown outcome.
   */
  @route("/runs/{id}/evidence") @post op evidence(@path id: string, @body body: {
    claim_token: string;
    receipt: OwnershipReceipt;
    observation: "process-gone";
  }): {
    run_id: string;
    reconciled: boolean;
  } | Refused;

  @extension("unevaluatedProperties", false)
  model Completion {
    claim_token: string;

    /** Chosen by the daemon once per completion and kept across retries. */
    @minLength(8)
    @maxLength(100)
    idempotency_key: string;

    /** "stopped" only after the owner asked to stop the run. */
    status: "succeeded" | "failed" | "stopped";
    error?: string;
    trace?: ExecutionTrace;
    outputs: NamedFile[];
    `package`?: WorkPackage;
    verification?: VerificationRecord;
    criterion_results?: ControlRod.Preparation.CriterionResultSubmission;

    /** The run's spawn receipt, so it is on record even if no log post carried it. */
    receipt?: OwnershipReceipt;

    /**
     * What proves the run's processes ended: cgroup (its scope is empty), process-group (the
     * leader and its group are gone; a process that left the group is not seen) or none (no
     * process was started). Absent means no proof: a failed or stopped run then keeps an unknown
     * outcome.
     */
    containment?: "cgroup" | "process-group" | "none";

    /**
     * Events no log post delivered (the last upload failed), carried by the completion, which the
     * daemon retries until it is recorded. Indexed from events_from like a log batch.
     */
    @maxItems(500) events?: NormalizedEvent[];

    @minValue(0) events_from?: int32;
  }

  @route("/runs/{id}/complete") @post op complete(@path id: string, @body body: Completion): CompletionReceipt | Refused;
}

/** Human-only manual preparation. Enrollment is explicitly enabled by the owner. */
@route("/packages/{id}/preparation")
namespace Preparations {
  @post op enroll(@path id: string, @body body: ControlRod.Preparation.PreparationEnrollment): ControlRod.Preparation.PreparationView | Refused;
  @get op read(@path id: string): ControlRod.Preparation.PreparationView | Refused;
  @put op edit(@path id: string, @header("If-Match") ifMatch: string, @body body: ControlRod.Preparation.PreparationContent): ControlRod.Preparation.PreparationView | Refused;
  @route("/resolutions") @post op resolve(@path id: string, @header("If-Match") ifMatch: string, @body body: ControlRod.Preparation.ResolutionRequest): ControlRod.Preparation.PreparationView | Refused;
  @route("/basis/refresh") @post op refreshBasis(@path id: string, @header("If-Match") ifMatch: string): ControlRod.Preparation.PreparationView | Refused;
  @route("/confirm/options") @post op confirmOptions(@path id: string, @body body: ControlRod.Preparation.ConfirmationOptionsRequest): ControlRod.Preparation.ConfirmationOptions | Refused;
  @route("/confirm") @post op confirm(@path id: string, @body body: ControlRod.Preparation.ConfirmationRequest): { @statusCode _: 201; @body confirmation: ControlRod.Preparation.RequirementsConfirmation; } | Refused;
  @route("/history") @get op history(@path id: string, @query before?: int32, @query limit?: int32): ControlRod.Preparation.PreparationHistory | Refused;
}

/** Narrow broker credentials only. No public grant issuance or native dispatch. */
@route("/runner/preparation-grants/{id}")
namespace PreparationGrantBroker {
  @route("/begin") @post op begin(@path id: string, @header("Authorization") grantAuthorization: string, @body body: ControlRod.Preparation.PreparationGrantIntent): ControlRod.Preparation.PreparationUsePermit | Refused;
  @route("/finalize") @post op finalize(@path id: string, @header("Authorization") grantAuthorization: string, @body body: ControlRod.Preparation.PreparationUseFinalize): ControlRod.Preparation.PreparationUseReceipt | Refused;
}
@route("/packages/{packageId}/preparation-grants/{id}/revoke") @post
op revokePreparationGrant(@path packageId: string,@path id: string): {revoked: boolean} | Refused;
