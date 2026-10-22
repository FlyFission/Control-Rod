import "@typespec/http";
import "./records.tsp";
import "./work.tsp";

using Http;
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
  @statusCode _: 400 | 401 | 403 | 404 | 409;
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
  }

  @get op list(): Capture[];
  @post op create(@body body: NewCapture): {
    @statusCode _: 201;
    @body capture: Capture;
  } | Refused;
}

/** What the web app shows for one package: the revision, its runs, output and decisions. */
model PackageView {
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

  /** Edit a draft. Released revisions are never edited; return them to make a new draft. */
  @put op update(@path id: string, @body pkg: WorkPackage): WorkPackage | Refused;

  @route("/{id}/outputs/{name}")
  @get
  op output(@path id: string, @path name: string): {
    @header contentType: string;
    @body body: bytes;
  } | Refused;

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
namespace Runner {
  model Job {
    run: Run;
    `package`?: WorkPackage;
    capture?: Capture;

    /** For a pre-check: only the deliverable and criteria, never the author's transcript. */
    inputs: {
      name: string;
      content_base64: string;
    }[];

    findings?: Finding[];

    /** Custody of this run: present the token on every log and completion. */
    claim: RunClaim;
  }

  /** A claim on one run. Log posts renew the lease; a lapsed lease marks the run lost. */
  model RunClaim {
    token: string;
    lease_expires_at: utcDateTime;

    /** Post a log batch, even an empty one, at least this often. */
    heartbeat_seconds: int32;
  }

  /** What the control plane recorded for a completion. A repeat with the same key returns it again. */
  model CompletionReceipt {
    run_id: string;
    idempotency_key: string;
    status: RunStatus;
    outputs: Artifact[];
    received_at: utcDateTime;

    /** Set when the completion could not be applied; the run is then recorded failed with this reason. */
    refusal?: ApiError;
  }

  @route("/claim") @post op claim(@body body: {
    runtimes: string[];
  }): Job | {
    @statusCode _: 204;
  } | Refused;

  @route("/runs/{id}/log") @post op log(@path id: string, @body body: {
    claim_token: string;
    lines: string[];
    label?: string;
  }): {
    /** The owner asked to stop this run: end the process and complete it as stopped. */
    stop: boolean;

    lease_expires_at: utcDateTime;
  } | Refused;

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
    outputs: {
      name: string;
      content_base64: string;
    }[];
    `package`?: WorkPackage;
    verification?: VerificationRecord;
  }

  @route("/runs/{id}/complete") @post op complete(@path id: string, @body body: Completion): CompletionReceipt | Refused;
}
