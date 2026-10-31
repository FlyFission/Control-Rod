import "@typespec/http";
import "./records.tsp";
import "./work.tsp";

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
  code: string;
  message: string;
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
}

@route("/packages")
namespace Packages {
  @get op list(): WorkPackage[];
  @get op read(@path id: string): PackageView | Refused;

  /** Edit a draft. Released revisions are never edited; return them to make a new draft. Requires If-Match with the current draft_etag: 428 without it, 409 when stale. */
  @put op update(@path id: string, @header("If-Match") ifMatch: string, @body pkg: WorkPackage): WorkPackage | Refused;

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

/** What the daemon last reported about each runtime it found, for the office. */
@route("/runtimes")
@get
op runtimes(): {
  reported_at?: utcDateTime;
  runtimes: Runner.RuntimeStatus[];
};

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
  }): LogReply | Refused;

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
