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

  /**
   * For a decision on a card: how the owner's signing policy takes it. "auto" means Control Rod
   * takes it on its own when it can; "click" a press with no passkey; "passkey" a signed press.
   * Absent for anything that is not a card decision.
   */
  step_mode?: "auto" | "click" | "passkey";

  /** The signing preset in force for this card, when a signing policy covers it. */
  signing_preset?: "light" | "balanced" | "everything" | "custom";

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

/** Audited workspace projects and their default outfall, data lane and runtime settings. */
@route("/workspace/projects")
namespace WorkspaceProjects {
  alias EngineeringMode = "software" | "capital-projects" | "nuclear-grade";
  alias RepoStrategy = "worktree" | "fresh-clone" | "branch";

  model RuntimeSelection {
    ecosystem: string;
    `model`: string;
    reasoning: string;
  }

  model WorkspaceProject {
    id: string;
    name: string;
    mode: EngineeringMode;
    status: string;
    repo: string;
    repoStrategy: RepoStrategy;
    workspaceRoot: string;
    lane: ControlRod.Records.DataLane;
    author: RuntimeSelection;
    checker: RuntimeSelection;
    laneAgents?: Record<string>;

    /** The work lanes the Plant's bays follow; always present in a response (an old project reads as the capital-project preset). */
    work_lanes?: ControlRod.Records.WorkLaneSet;

    /** What needs a passkey on this project's routine cards, once the owner has chosen. Absent: every step is signed. */
    signing?: WorkspaceSigning;
    createdAt: utcDateTime;
  }

  model WorkspaceSigning {
    preset: "light" | "balanced" | "everything" | "custom";
    steps: ControlRod.Records.SigningSteps;
    version: int32;
    signed_by: string;
    signed_at: utcDateTime;
  }

  model UpdateProject {
    repo?: string;
    repoStrategy?: RepoStrategy;
    workspaceRoot?: string;
    lane?: ControlRod.Records.DataLane;
    author?: RuntimeSelection;
    checker?: RuntimeSelection;

    /** Null clears the configured lane overrides. */
    laneAgents?: Record<string> | null;

    /** Sets the project's work lanes. On create, absent means the preset proposed from the repository. */
    work_lanes?: ControlRod.Records.WorkLaneChoice;
  }

  model CreateProjectPayload {
    @minLength(1)
    @maxLength(120)
    name: string;

    mode?: EngineeringMode;
    ...OmitProperties<UpdateProject, "laneAgents">;
    laneAgents?: Record<string>;

    /** What needs a passkey on routine cards, signed with the create. Ignored for Nuclear-grade. */
    signing_preset?: "light" | "balanced" | "everything";
  }

  /** The passkey challenge binds the payload through the project.workspace-create admin command. */
  model CreateProject {
    payload: CreateProjectPayload;
    assertion: Record<unknown>;
  }

  model ArchiveProjectPayload {
    project_id: string;
  }

  model UpdateProjectPayload {
    ...ArchiveProjectPayload;
    patch: UpdateProject;
  }

  /** The project.workspace-update admin challenge binds the project ID and patch. */
  model SignedProjectUpdate {
    payload: UpdateProjectPayload;
    assertion: Record<unknown>;
  }

  /** The project.workspace-archive admin challenge binds the project ID. */
  model SignedProjectArchive {
    payload: ArchiveProjectPayload;
    assertion: Record<unknown>;
  }

  model ArchivedProject {
    id: string;
    status: "archived";
  }

  @get op list(): WorkspaceProject[] | Refused;
  @post op create(@body body: CreateProject): {
    @statusCode _: 201;
    @body project: WorkspaceProject;
  } | Refused;
  @route("/{id}") @patch op update(@path id: string, @body body: SignedProjectUpdate): WorkspaceProject | Refused;
  @route("/{id}/archive") @post op archive(@path id: string, @body body: SignedProjectArchive): ArchivedProject | Refused;
}

@route("/captures")
namespace Captures {
  model NewCapture {
    /** Typed text plus any attachment fences; the visible text is capped at 20,000 characters. */
    @minLength(1)
    @maxLength(30000000)
    text: string;

    source?: "web" | "cli" | "voice" | "chat";

    /** An explicitly prepared checkout. The API validates it and records its Git identity. */
    checkout?: {
      repo: string;
      local_path: string;
      branch: string;
      workspace_root?: string;
    };

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

  /** Dismiss a pending capture and stop its queued intake work. The capture record is retained. */
  @route("/{id}/dismiss") @post op dismiss(@path id: string): Capture | Refused;
}

/** The draft pull request Control Rod opened, or tried to open, for accepted work on a repository checkout. */
model PackagePullRequest {
  /** opening: pushing now; opened: the draft is up; no-changes: the work changed no files; not-opened: it failed, see detail. */
  state: "opening" | "opened" | "no-changes" | "not-opened";
  url?: string;
  branch?: string;
  detail?: string;
  at: utcDateTime;
}

/** What the web app shows for one package: the revision, its runs, output and decisions. */
model PackageView {
  /** Set once accepted work bound to a repository checkout goes out as a pull request. */
  pull_request?: PackagePullRequest;

  /** Strong ETag of the current draft's content; send it as If-Match to edit the draft. */
  draft_etag?: string;

  /** The package's effective lane: its own lane raised by everything it was derived from (11.3 M-1). */
  effective_lane?: ControlRod.Records.DataLane;

  /** Ids of the people who originated the work (captured it, edited its drafts, authored its preparation), the capture's actor first, then the rest ordered by each actor's earliest event. */
  originators?: string[];

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

  /**
   * The latest checker attempts for this package, oldest of that page first, including inconclusive,
   * timeout, error, quota and cancelled. At most 50. Older attempts are on GET /checker-attempts.
   */
  checker_attempts?: ControlRod.Records.CheckerAttempt[];

  /** Signed overrides that allow one more check of a deliverable a check had already failed. */
  recheck_overrides?: ControlRod.Records.RecheckOverride[];

  /**
   * Set when the governing decisive outcome for the current deliverable is fail.
   * Absent after an in-scope overridden recheck passes, when the digest changed, or when an
   * unused override is waiting.
   */
  check_blocked?: ControlRod.Records.CheckBlocked;

  /**
   * Set when several checks of the current digest were inconclusive. A warning only:
   * another check is still allowed.
   */
  check_warning?: ControlRod.Records.CheckWarning;

  /**
   * Set when the author's latest rework round changed files outside the scope the previous
   * check's findings named. A report, not a refusal.
   */
  scope_drift?: ControlRod.Records.ScopeDrift;

  decisions: Decision[];

  /** Digest a decision on this revision must be bound to. */
  subject_digest: Digest;

  /** What a signature on this revision binds, in words (drafts and work in verification). */
  binds?: string;
}

/** Metadata for a stored author output. The digest is verified when its bytes are read. */
model RunOutput {
  ...Artifact;
  size_bytes: int32;
}

/** An integrity-checked, bounded UTF-8 preview. Render its content as plain text. */
model RunOutputPreview {
  ...Artifact;
  content: string;
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

  /** The exact attempt, including attempts from earlier revisions. */
  @route("/{id}/runs/{runId}")
  @get
  op run(@path id: string, @path runId: string): Run | Refused;

  /** Read at most 200 admitted files from the exact author attempt, ordered by path. */
  @route("/{id}/runs/{runId}/outputs")
  @get
  op runOutputs(@path id: string, @path runId: string, @query after?: string): RunOutput[] | Refused;

  @route("/{id}/runs/{runId}/outputs/preview")
  @get
  op runOutputPreview(@path id: string, @path runId: string, @query path: string): RunOutputPreview | Refused;

  @route("/{id}/runs/{runId}/log")
  @get
  op runLog(@path id: string, @path runId: string): {
    lines: string[];
  } | Refused;

  /** Events in chronological order. Choose at most one of after, before, or recent. */
  @route("/{id}/runs/{runId}/events")
  @get
  op runEvents(
    @path id: string,
    @path runId: string,
    @query @minValue(0) after?: int32,
    @query @minValue(1) before?: int32,
    @query recent?: boolean,
    @query @minValue(1) @maxValue(2000) limit?: int32
  ): {
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

  /**
   * Checker attempts for this package, oldest first. limit keeps the latest ones (1 to 100).
   * before, a seq, returns the page older than that attempt.
   * Timeout, error, quota and cancelled attempts are in the list and count as inconclusive.
   */
  @route("/{id}/checker-attempts") @get op checkerAttempts(
    @path id: string,
    @query @minValue(1) @maxValue(100) limit?: int32,
    @query @minValue(1) before?: int32,
  ): ControlRod.Records.CheckerAttempt[] | Refused;

  /**
   * Ask for a check of the current author deliverables. 201 when a check is queued.
   * 409 check-active when one is already queued or running.
   * 409 sticky-fail when a check of that digest has already failed and no signed recheck override
   * is waiting to be used.
   */
  @route("/{id}/checks") @post op requestCheck(@path id: string): {
    @statusCode _: 201;
    @body run: Run;
  } | Refused;

  /**
   * Step 1 of the owner's override to check a failed deliverable again. The digest covers the
   * package, the revision, the deliverable digest, the act "recheck-override" and the reason.
   * The same passkey ceremony as the independence override.
   */
  @route("/{id}/recheck-overrides/options")
  @post
  op recheckOverrideOptions(@path id: string, @body body: OverrideRequest): {
    subject_digest: Digest;
    deliverable_digest: Digest;
    options: Record<unknown>;
  } | Refused;

  /**
   * Step 2: the signed override. It authorizes one check of the deliverable digest the owner was
   * shown. Recorded with the reason and the assertion. A later check needs another signature.
   */
  @route("/{id}/recheck-overrides")
  @post
  op recordRecheckOverride(@path id: string, @body body: {
    ...OverrideRequest;
    assertion: Record<unknown>;
  }): ControlRod.Records.RecheckOverride | Refused;

  /** Every person verification recorded for this package, for every revision, oldest first. */
  @route("/{id}/person-verifications") @get op personVerifications(@path id: string): PersonVerificationEntry[] | Refused;

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

/** A recorded person verification with the package revision it verified. */
model PersonVerificationEntry {
  ...ControlRod.Records.PersonVerification;

  /** The package revision whose candidate was verified. */
  @minValue(0) package_revision: int32;

  /**
   * True when the record's signed digest equals what a verification of the package's current work
   * would sign now: the current revision, its decision subject (outputs and pre-check), its latest
   * author run, and the same criteria and outcome. Within one revision the work can change, so only
   * a pass that covers the current subject counts as verified.
   */
  covers_current_subject: boolean;
}

/** One entry in your office: something that needs a person. */
model OfficeItem {
  kind: "release" | "accept" | "dispute" | "permission" | "lost";
  package_id: string;
  package_revision: int32;
  title: string;
  detail: string;
  since: utcDateTime;

  /** For a run a SCRAM holds: that SCRAM, so a view that must not show its reason knows these words carry it. */
  scram_id?: string;
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

/**
 * Where a figure stands in the office (specification 13): a work bay or a room. The six bay ids are
 * positions (WorkBaySlot); a project's work lanes say what each is called. Under the capital-project
 * preset they are the six disciplines, as before.
 */
union FigurePlace {
  "process", "mechanical", "electrical", "civil", "assurance", "project-controls",
  "review", "interface", "verification", "your-office", "document-control", "bench", "quarantine",
}

/**
 * One agent on the office floor (AgentFigure, specification 13 and 18; plan task 4.6), projected only
 * from recorded data: the package (or, for intake, the capture), its latest run at the current
 * revision, what the Inbox routes to the viewer, SCRAM holds, effective markings, recorded
 * dependencies and the revisions a preparation basis pinned. Never guessed from terminal output.
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

  /**
   * The tightest budget that applies to this agent's work (organization, its project, or its
   * baseline) and how far along it is this window; absent with no budget, and never when presenting.
   */
  spend?: FigureSpend;

  /**
   * The recorded thing behind the cause (a SCRAM, a hold, an input revision, the dependencies
   * awaited, or the run itself), so agents are grouped by what holds them, never by matching words.
   */
  cause_key: string;

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

  /** Recorded inputs whose freshness is unknown, because no preparation basis pinned their revision. */
  unverified_inputs?: string[];

  /** Package inputs the preparation pinned that are still at the pinned revision: freshness established. */
  current_inputs?: string[];

  /** The nearest gate, for the Gate lens. */
  gate_stage: "release" | "in-work" | "pre-check" | "accept" | "settled";

  /** Recorded once a permission wait cannot be observed for this runtime (print mode, plan task 2.9). */
  observability?: string;

  data_lane: DataLane;

  /** The project that owns the work, for the portfolio rollup; absent for organization level work. */
  project_id?: string;

  /** The id of the project work lane that placed this figure's bay, absent outside a work bay. */
  lane?: string;

  /** That lane's name, so a card reads right even when the Plant's bays follow another project's lanes. */
  lane_name?: string;

  /** The run's own status, so the card offers stop exactly when the command layer would take it. */
  run_status: RunStatus;

  /** A stop was asked for and the daemon has not yet confirmed it. */
  stop_requested?: boolean;

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

  /** Everything the Inbox holds for the viewer, agents or not (a draft has no agent yet). */
  inbox_items: int32;

  /** Figures left out because presenting mode hides lanes above internal. */
  hidden: int32;

  /** The work lanes of each project that has a figure, so bay names follow the project. */
  lane_sets?: { project_id: string; work_lanes: WorkLaneSet }[];

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

  /**
   * Agent CLIs with a newer version, as the daemon found when it started. The app shows the npm
   * command, built from fixed parts, for the person to run in a terminal; nothing installs from the browser.
   */
  agent_updates?: Runner.AgentUpdate[];
};

/**
 * Settings > Subscriptions. The daemon's probe of registered provider CLIs.
 * Control Rod does not accept or return a token.
 */
@route("/subscriptions")
@get
op subscriptions(): SubscriptionView;

/** One registered provider CLI, as the daemon probed it. */
@extension("unevaluatedProperties", false)
model SubscriptionProbe {
  id: string;
  display_name: string;
  vendor_family?: string;
  installed: boolean;

  @maxLength(4096)
  path?: string;

  @maxLength(200)
  observed_version?: string;

  /** From the CLI's own status command, or unknown when it has none. */
  auth: "signed-in" | "signed-out" | "unknown";

  @maxLength(200)
  auth_note?: string;

  roles: SubscriptionRole[];
}

@extension("unevaluatedProperties", false)
model SubscriptionRole {
  role: "author" | "checker";
  qualified: boolean;

  @maxLength(300)
  reason: string;
}

/** One model in the daemon's checker registry. Not a live probe. */
@extension("unevaluatedProperties", false)
model SubscriptionChecker {
  id: string;
  harness: string;
  vendor_family?: string;
  deciding: boolean;
  local: boolean;
  hosts: string[];
}

/** How many checkers a grade needs. Safety is 2, from different vendor families; every other grade is 1. */
@extension("unevaluatedProperties", false)
model SubscriptionTier {
  grade: "safety" | "material" | "general-service";

  @minValue(1)
  @maxValue(2)
  required: int32;

  rule: string;
}

/** A pin joined to the version string the passing probe recorded. Checker is the pre-check role. */
@extension("unevaluatedProperties", false)
model SubscriptionPin {
  runtime: string;
  role: "author" | "checker";
  version?: string;
  digest: Digest;
}

@extension("unevaluatedProperties", false)
model SubscriptionView {
  /** False until a daemon has reported. Probes are empty then, and none are invented. */
  reported: boolean;
  reported_at?: utcDateTime;
  platform?: string;
  probes: SubscriptionProbe[];
  checkers: SubscriptionChecker[];
  tiers: SubscriptionTier[];
  local_rule: string;
  pins: SubscriptionPin[];
}

/**
 * First-run setup (docs/patterns/onboarding.md): which agents the person seats and when Control Rod
 * checks with them. Nothing is recorded until the person confirms what was read back to them.
 */
@route("/setup")
@get
op setup(): AgentSetupView;

/** Records the person's confirmed setup. Seat changes are events on the chain; the check-in answer is a preference and is not. */
@route("/setup")
@put
op recordSetup(@body body: AgentSetupRequest): AgentSetupView | Refused;

/** One Agents roster switch: changes that seat only, and does not confirm setup. */
@route("/setup/seats/{runtime}")
@put
op recordSeat(@path runtime: string, @body body: { seated: boolean }): AgentSetupView | Refused;

/**
 * When Control Rod should stop and check with the person (ADR 0024 decision 7). The middle answer is
 * the default and matches today's stops: a passkey to release and to accept.
 */
union CheckIn {
  start: "start",
  "start-and-merge": "start-and-merge",
  "every-step": "every-step",
}

@extension("unevaluatedProperties", false)
model AgentSeat {
  /** A runtime id as the daemon names it (claude, codex, grok, opencode, agy, ollama). */
  @maxLength(40)
  runtime: string;

  /** False benches the agent: no new run is offered to it. Benching never makes a checker the author's runtime. */
  seated: boolean;
}

@extension("unevaluatedProperties", false)
model AgentSetupRequest {
  /** Only the seats the person changed. A seat not named keeps its saved value. */
  @maxItems(20)
  seats: AgentSeat[];

  /** Left out when the person did not change it; the saved answer stays. */
  check_in?: CheckIn;
}

@extension("unevaluatedProperties", false)
model AgentSetupView {
  /** False until the person has confirmed setup once. The app opens on setup until then. */
  confirmed: boolean;

  confirmed_at?: utcDateTime;

  /** Runtimes not listed here are seated. */
  seats: AgentSeat[];

  check_in: CheckIn;
}

/**
 * Control room > Usage limits. How much of each agent subscription's limit window is used, as the
 * agent CLIs themselves reported it. Read from what the CLI already writes (Codex's session log,
 * Claude Code's stream output); Control Rod never reads a login token to get it.
 */
@route("/usage/limits")
@get
op usageLimits(): UsageLimitsView;

/** One limit window of one subscription. */
@extension("unevaluatedProperties", false)
model UsageWindow {
  id: "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet" | "daily" | "weekly" | "monthly" | "primary" | "secondary" | "tertiary";

  @minValue(1) @maxValue(60000)
  window_minutes?: int32;

  @minValue(0) @maxValue(100)
  used_percent: float64;

  resets_at?: utcDateTime;

  /** When the CLI recorded this window's reading; the provider's observed_at is the newest of these. */
  observed_at?: utcDateTime;

  status?: "allowed" | "warning" | "rejected";
}

/** One provider CLI's last limit reading. */
@extension("unevaluatedProperties", false)
model UsageProvider {
  /** A harness id from the API's allowlist (Claude Code, Codex, Gemini CLI, Antigravity, Cursor, Copilot, opencode, Grok, Amp, Kiro, Factory Droid, Windsurf, Kilo, Warp, and others). */
  @pattern("^[a-z0-9-]{1,32}$")
  id: string;

  /**
   * cli-log: the CLI's own session log. cli-stream: the CLI's run output. codexbar: the CodexBar
   * usage engine the person installed, which signs in on its own; Control Rod receives only numbers.
   * none: no source on this machine.
   */
  source: "cli-log" | "cli-stream" | "codexbar" | "none";

  /** When the CLI recorded the reading. */
  observed_at?: utcDateTime;

  plan?: "free" | "go" | "plus" | "pro" | "max" | "team" | "business" | "enterprise" | "edu";

  @maxItems(8)
  windows: UsageWindow[];
}

/** The claim payload for usage limits. */
@extension("unevaluatedProperties", false)
model UsageLimitsReport {
  read_at: utcDateTime;

  /** Whether the CodexBar usage engine was found on this machine, and its version. */
  engine?: UsageEngine;

  @maxItems(24)
  providers: UsageProvider[];
}

@extension("unevaluatedProperties", false)
model UsageEngine {
  id: "codexbar";
  found: boolean;

  @pattern("^\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}$")
  version?: string;
}

model UsageLimitsView {
  reported: boolean;
  read_at?: utcDateTime;
  engine?: UsageEngine;
  providers: UsageProvider[];
}

/** The claim payload. The same probe models the settings page returns. */
@extension("unevaluatedProperties", false)
model SubscriptionReport {
  platform?: string;
  probes?: SubscriptionProbe[];
  checkers?: SubscriptionChecker[];
  local_rule?: string;
};

/** One run role on the Roster: what it does, who has run it, and its pins. */
model RosterRole {
  role: RunRole;
  what: string;

  /** Whether a runtime pin can be set for it (preparer roles launch by their own custody path). */
  pinnable: boolean;

  /** Each runtime and baseline pair recorded on its runs; empty until something has run it. */
  baselines: { runtime: string; baseline: string }[];

  @minValue(0) runs: int32;
  last_run_at?: utcDateTime;
  pins: RuntimePin[];

  /**
   * Per runtime with an earlier, different artifact to roll back to: the artifact pinned now and the
   * one a rollback restores. A rollback signs both; if either changes first, it is refused.
   */
  rollback: { runtime: string; current: Digest; restore: Digest }[];
}

/**
 * The Roster (plan task 5.1): roles, baselines as recorded on runs (not yet controlled items with
 * revisions, so baselines_recorded is false), the artifacts a pin may name, and sandboxes as launched.
 */
@route("/roster")
@get
op roster(): {
  roles: RosterRole[];
  baselines: { id: string; roles: string[]; @minValue(0) runs: int32; last_run_at: utcDateTime; statuses: Record<int32> }[];
  baselines_recorded: false;

  /** Every artifact a passing probe has seen, per pinnable runtime, and the roles pinning it now. */
  versions: { runtime: string; version: string; digest: Digest; last_passed_at: utcDateTime; pinned_for: RunRole[] }[];

  sandbox: {
    /** SandboxPolicy records in force, each with its digest. */
    policies: Record<unknown>[];

    /**
     * Per runtime, the sandbox the daemon asked for on its latest finished run ("not reported" when
     * the run gave none). A request, not an observed result.
     */
    launched: { runtime: string; sandbox: string; run_id: string; at: string }[];
  };
} | ApiError;

/** One seal as verification found it. */
model SealCheck {
  id: string;
  head_seq: int32;
  head_digest: Digest;
  sealed_at: utcDateTime;
  signer_id: string;
  purpose: string;

  /**
   * valid, or why not: the head moved or is missing; no chain.sealed event records this seal as it is;
   * the subject does not match its payload; the signer's key is unknown, was not enrolled to the signer
   * before the seal, has changed since it was recorded with the seal, or was revoked before the seal was
   * recorded; the signature fails; or the chain breaks before its head.
   */
  result: "valid" | "head-mismatch" | "head-missing" | "unrecorded" | "subject-mismatch" | "key-unknown" | "not-enrolled" | "key-changed" | "key-revoked" | "signature-invalid" | "chain-broken-before-head";
}

/** The record verified (plan task 5.3; specification 11.6): the chain, every seal, and the unsealed suffix. */
@route("/records/verify")
@get
op verifyRecords(): {
  chain: { ok: boolean; @minValue(0) count: int32; broken_at?: int32 };
  seals: SealCheck[];
  @minValue(0) last_sealed_seq: int32;

  /** Events after the last valid seal. */
  @minValue(0) unsealed: int32;

  /** Nothing outside this database witnesses the chain yet. */
  witnessed: false;
  statement: "Local chain, not witnessed";
} | ApiError;

/** The head a seal made now would cover. */
@route("/records/head")
@get
op recordsHead(): {
  head: { head_seq: int32; head_digest: Digest; at: utcDateTime } | null;
} | ApiError;

/**
 * A package's inclusion proof: the whole chain from its first event through the recording event of the
 * first valid seal covering the package's last event (or the chain head, unsealed), with that seal and
 * what checking its signature needs. Self contained; trust in the signer's key must come from outside
 * it. Refused (mixed-scope) on an installation with more than one organization, which share one chain.
 */
@route("/packages/{id}/proof")
@get
op packageProof(@path id: string): {
  /** The global chain verifies and the proof holds. */
  ok: boolean;

  chain: { ok: boolean; @minValue(0) count: int32; broken_at?: int32 };

  /** The bundle checked on its own: links from the first event, the package's events derived from it, and the seal's signature. */
  check: { ok: boolean; authenticated: boolean; events: int32[]; problem?: string };

  bundle: {
    package_id: string;
    segment: Record<unknown>[];
    seal: Record<unknown> | null;
    seal_evidence?: { public_key: string; rp_id: string; origins: string[] };

    /** Unsealed: the chain head when the bundle was made, which the segment must end at. Unauthenticated. */
    head?: { seq: int32; digest: string };
    witnessed: false;
    statement: "Local chain, not witnessed";
  };
} | ApiError;

/**
 * An audit export of a time window: the whole chain from its first event through the recording event of
 * the first valid seal covering the last event recorded in the window (or the chain head, unsealed), with
 * that seal and what checking its signature needs. The window is half open, by each event's recorded
 * time. Self contained like a package proof; refused (mixed-scope) on a shared chain.
 */
@route("/records/export")
@get
op recordsExport(
  /** Start of the window, inclusive, with its time zone. */
  @query from: utcDateTime,

  /** End of the window, exclusive, with its time zone. */
  @query to: utcDateTime,
): {
  /** The global chain verifies and the export holds. */
  ok: boolean;

  chain: { ok: boolean; @minValue(0) count: int32; broken_at?: int32 };

  /** The export checked on its own: links from the first event, the window's events derived from their times, and the seal's signature. */
  check: { ok: boolean; authenticated: boolean; events: int32[]; problem?: string };

  bundle: {
    window: { from: utcDateTime; to: utcDateTime };
    segment: Record<unknown>[];
    seal: Record<unknown> | null;
    seal_evidence?: { public_key: string; rp_id: string; origins: string[] };

    /** Unsealed: the chain head when the export was made, which the segment must end at. Unauthenticated. */
    head?: { seq: int32; digest: string };
    witnessed: false;
    statement: "Local chain, not witnessed";
  };
} | ApiError;

/** A budget as a figure carries it. `used` is absent when the budget's unit is not reported. */
model FigureSpend {
  budget_id: string;
  mode: "track" | "alert" | "hard-cap";
  unit: "minute" | "token" | "USD";
  limit: string;
  period: string;
  /** near only when the approved policy sets budget_near_percent; partial when some runs reported nothing. */
  state: "within" | "near" | "over" | "partial" | "not-reported";
  used?: string;

  /** Tokens: runs that reported no complete counts, so use is at least `used`. */
  @minValue(1) unreported_runs?: int32;
}

/** One budget and what it has used in its current rolling window. */
model BudgetStatus {
  budget: Budget;

  /** Used this window (settled at measured value, open reservations at full size); null when the unit is not reported. */
  used: float64 | null;

  /** Of that, what open reservations hold for runs not yet settled. */
  @minValue(0) in_flight: float64;

  /** Tokens: measured runs in the window that reported no complete counts. */
  @minValue(0) unreported_runs: int32;

  /** Where the rolling window starts. */
  since: utcDateTime;

  state: "within" | "near" | "over" | "partial" | "not-reported";
}

/**
 * Usage (plan task 5.2; specification 26): every budget and its use this window, the latest usage
 * records, and per runtime how many finished runs reported tokens, so missing telemetry reads as missing.
 */
@route("/usage")
@get
op usage(): {
  budgets: BudgetStatus[];
  records: Record<unknown>[];
  telemetry: { runtime: string; @minValue(0) runs: int32; @minValue(0) reported: int32 }[];

  /** The share of a limit at which a budget reads as near it, from the approved policy (budget_near_percent); null when unset. */
  near_share: float64 | null;
} | ApiError;

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

/**
 * Step 1 of an administrative command: the subject it would change, and a passkey challenge over it.
 * Step 2 sends the same payload with the signed assertion; the command runs only if it still matches.
 */
@route("/admin/commands/{name}/options")
@post
op adminCommandOptions(@path name: string, @body body: { payload?: Record<unknown> }): {
  subject_digest: Digest;
  options: Record<unknown>;
} | Refused;

@route("/admin/commands/{name}")
@post
op adminCommand(@path name: string, @body body: { payload?: Record<unknown>; assertion?: Record<unknown> }): Record<unknown> | Refused;

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

  /**
   * The hardware attestation formats signing accepts now: the approved policy's, or Control Rod's
   * defaults while no policy has been approved, so a first proposal can start from what is in force.
   */
  hardware_formats_in_force: AttestationFormat[];

  themes: string[];
  commands: AdminCommandInfo[];
  actions: ActionDescriptor[];

  /** The floors in force: no person, decision or setting lifts them. */
  floors: { code: string; sentence: string; change: string }[];

  /** The organization's administrative records as they stand, for the forms to choose from (plan task 5.4). */
  registry: AdminRegistry;
} | ApiError;

/** Each Member's current qualification, passkeys, delegations, bindings, open change requests and budgets. */
model AdminRegistry {
  qualifications: RegistryQualification[];

  /** Each passkey's current state: every Member's for an administrator, otherwise the viewer's own. */
  credentials: RegistryCredential[];

  /** Every delegation, with whether it was revoked, and without its reason. */
  delegations: RegistryDelegation[];
  bindings: Record<unknown>[];

  /** Change requests waiting on approval. */
  change_requests: ChangeRequest[];
  budgets: Budget[];
}

/** A Member's current qualification as the forms show it: no license numbers and no reasons. */
model RegistryQualification {
  org_id: string;
  member_id: string;
  @minValue(1) version: int32;
  roles: string[];
  authorities: string[];
  grades: string[];
  disciplines: string[];
  revoked: boolean;
}

/** A delegation as the forms show it: who, what, when, and whether revoked; never its reason. */
model RegistryDelegation {
  id: string;
  org_id: string;
  from_member_id: string;
  to_member_id: string;
  role: string;
  project_id?: string;
  discipline?: string;
  starts_on: plainDate;
  ends_on: plainDate;
  revoked: boolean;
}

/** A passkey as the forms name it: its owner, when it was registered, and no attestation evidence. */
model RegistryCredential {
  id: string;
  org_id: string;
  member_id: string;
  credential_id: string;
  revoked: boolean;

  /** Whether it meets the hardware key floor under the policy in force now. */
  hardware: boolean;

  registered_at: utcDateTime;
}

/** One quarantine batch: what a SCRAM-stopped run reported in one completion, as digests. */
model ScramQuarantineBatch {
  @minValue(1) id: int32;
  reported: string;
  @minValue(0) output_count: int32;
  recorded_at: utcDateTime;
  outputs: { name: string; @pattern("^[0-9a-f]{64}$") sha256: string }[];
}

/** When a SCRAM was pulled, and once every run it reached has stopped, how long that took. */
model ScramTiming {
  pulled_at?: utcDateTime;

  /** Present once every run in scope has stopped: the stop latency (OV-12). */
  stopped?: {
    @minValue(0) ms_to_stop: int32;
    @minValue(0) runs: int32;
    at: utcDateTime;
  };
}

/** A SCRAM as presenting mode shows it: that it holds and over what, never its reason or runs. */
model ScramPresented {
  id: string;
  org_id: string;
  scope: "organization" | "project";
  project_id?: string;
  drill?: boolean;
}

/**
 * The SCRAMs in force in the viewer's organization (not yet restarted for their whole scope).
 * Presenting, each is a ScramPresented.
 */
@route("/scrams")
@get
op scrams(@query presenting?: boolean): {
  scrams: {
    scram: ScramEvent | ScramPresented;

    /** How many runs it stopped where they stood. */
    @minValue(0) run_count: int32;

    ...ScramTiming;
  }[];
  presenting?: boolean;
} | ApiError;

/**
 * What pulling SCRAM with this scope would stop now, by the pull's own selection: the runs running
 * (stopped where they stand) and queued (held). The pull selects again when it fires.
 * Presenting, only the counts.
 */
@route("/scrams/preview")
@get
op scramPreview(@query scope: "organization" | "project", @query project_id?: string, @query presenting?: boolean): {
  scope: "organization" | "project";
  project_id?: string;
  @minValue(0) running_count: int32;
  @minValue(0) queued_count: int32;

  /** The runs themselves; left out when presenting, where they would name restricted work. */
  running?: string[];
  queued?: string[];
  presenting?: boolean;
  counted_at: utcDateTime;
} | ApiError;

/** A SCRAM, the runs it stopped with their quarantine and reviews, and its restarts. */
@route("/scrams/{id}")
@get
op scram(@path id: string): {
  ...ScramTiming;
  scram: ScramEvent;
  runs: {
    run_id: string;
    role: RunRole;

    /** What the run worked on: a package, or a capture for intake. */
    subject: "package" | "capture";
    subject_id: string;
    discipline?: string;
    status: RunStatus;
    outcome_unknown: boolean;
    batches: ScramQuarantineBatch[];
    reviews: QuarantineReview[];
  }[];
  restarts: ScramRestart[];

  /** Every package the SCRAM reaches, so a staged restart names one it holds; lifted once a restart covers it. */
  packages: { id: string; title: string; discipline?: string; lifted: boolean }[];
} | ApiError;

/** Runs that are queued or running, across every package, for the floor and board. */
@route("/runs")
@get
op activeRuns(): Run[];

/** A bounded projection for the workspace. The title describes the run's recorded package revision. */
model ActiveRunSummary {
  ...PickProperties<Run, "id" | "package_id" | "package_revision" | "role" | "runtime" | "label" | "waiting_reason" | "waiting_cause" | "stop_requested_at">;
  status: "queued" | "running";

  /** The beginning of the recorded package title, bounded for the switcher. */
  @maxLength(120) title?: string;
}

@route("/runs/active")
@get
op activeRunSummaries(): ActiveRunSummary[] | Refused;

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

    /**
     * What the run's agent actions may touch (plan task 6.1). The daemon derives every CLI setting
     * from it, checks it against `sandbox_policy_digest` and the run's recorded policy, and refuses
     * to launch an agent CLI without it.
     */
    sandbox_policy?: SandboxPolicy;

    sandbox_policy_digest?: Digest;
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

    /** Model names or aliases the daemon discovered for the CLI. */
    @maxItems(50)
    models?: RuntimeModel[];
  }

  /** A built-in agent CLI the daemon can check for a newer version. */
  union AgentId { "claude", "codex", "agy", "opencode", "grok" }

  /**
   * An agent CLI with a newer published version, as the daemon's startup check found it. The check
   * runs when the daemon starts, never on a timer. The app shows the npm command for the person to run
   * in a terminal (`controlrod agents update` runs the same one after asking); the daemon never runs it.
   */
  @extension("unevaluatedProperties", false)
  model AgentUpdate {
    agent: AgentId;
    @maxLength(60) name: string;
    /** The installed version: strict SemVer 2.0 without build metadata; `latest` is newer. */
    @maxLength(64) @pattern("^(0|[1-9]\\d{0,8})\\.(0|[1-9]\\d{0,8})\\.(0|[1-9]\\d{0,8})(-(0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(\\.(0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*)?$") installed: string;
    /** The latest published version: strict SemVer 2.0 without build metadata. */
    @maxLength(64) @pattern("^(0|[1-9]\\d{0,8})\\.(0|[1-9]\\d{0,8})\\.(0|[1-9]\\d{0,8})(-(0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(\\.(0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*)?$") latest: string;

    /**
     * True when the installed executable is npm's global copy of the agent's package, so
     * `npm install --global <package>@<latest>` updates it. The app builds that command itself from
     * a fixed package per agent and `latest`; no command text is reported or shown from the daemon.
     */
    npm_global?: boolean;

    /** Why no command is offered, in a sentence. */
    @maxLength(300) note?: string;
    ...Record<never>;
  }

  /**
   * An agent found whose update check could not finish, with the installed version the daemon read
   * (strict SemVer, left out when unknown). The control plane keeps its earlier row for the agent
   * only while that row's installed version is this one, so a CLI updated since is never offered
   * an older version.
   */
  model UncheckedAgent {
    agent: AgentId;
    @maxLength(64) @pattern("^(0|[1-9]\\d{0,8})\\.(0|[1-9]\\d{0,8})\\.(0|[1-9]\\d{0,8})(-(0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(\\.(0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*)?$") installed?: string;

    ...Record<never>;
  }
  @minLength(1)
  @maxLength(100)
  @pattern("^[a-zA-Z0-9._:/@-]+$")
  scalar RuntimeModel extends string;

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

    /** Required to claim an author run with a checkout binding; omitted means unsupported. */
    supports_checkouts?: boolean;

    /** Provider CLI probes for Settings. Output of a status command is not included. */
    subscription_report?: ControlRod.Api.SubscriptionReport;

    /** Usage-limit readings the agent CLIs reported. No token is read to get them. */
    usage_limits?: ControlRod.Api.UsageLimitsReport;

    /** The longest a run lasts in the daemon (its timeout and graceful stop ladder), in whole seconds rounded up. Sizes budget reservations. */
    @minValue(1) run_ceiling_seconds?: int32;

    /** Agent CLIs with a newer version, from the daemon's startup check. Empty when every agent is current. */
    @maxItems(10) agent_updates?: AgentUpdate[];

    /**
     * Agents found whose check could not finish (the registry did not answer, or the CLI gave no
     * strict version). Sent with `agent_updates`; the control plane keeps its earlier row for each
     * only while the installed version is unchanged.
     */
    @maxItems(10) agent_updates_unchecked?: UncheckedAgent[];
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

    /** The daemon's signed statement for a counted pre-check. Absent for other runs. */
    attestation?: RunAttestation;

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

@route("/repos")
namespace Repos {
  model LocalRepoInfo {
    name: string;
    path: string;
    branch: string;
    remote_url: string | null;
    dirty: boolean;
  }

  model GithubRepoInfo {
    name_with_owner: string;
    default_branch: string;
    is_private: boolean;
    url: string;
    updated_at: string;
  }

  model ReposResponse {
    workspace_root: string;
    local: LocalRepoInfo[];
    github: GithubRepoInfo[];
    github_error: string | null;
  }

  enum MaterializeStrategy {
    worktree: "worktree",
    freshClone: "fresh-clone",
    branch: "branch",
  }

  model MaterializeRepoRequest {
    repo: string;
    branch: string;
    base_branch?: string;
    strategy?: MaterializeStrategy;
    workspace_root?: string;
    mode?: "software" | "capital-projects";
  }

  model MaterializeRepoResult {
    ok: boolean;
    strategy: MaterializeStrategy;
    mode?: "software" | "capital-projects";
    repo: string;
    branch: string;
    local_path: string;
    /** The base clone the worktree belongs to, which removing the worktree names. */
    repo_path?: string;
    scaffolded_dirs?: string[];
  }

  model CheckpointRequest {
    repo_path: string;
    label?: string;
    workspace_root?: string;
  }

  model CheckpointResult {
    ok: boolean;
    ref: string;
    commit_sha: string;
    tree_sha: string;
  }

  model RemoveWorktreeRequest {
    worktree_path: string;
    repo_path: string;
    workspace_root?: string;
    force?: boolean;
  }

  model RemoveWorktreeResult {
    ok: boolean;
    removed: string;
  }

  @get op list(@query workspace_root?: string): ReposResponse | Refused;
  @route("/materialize") @post op materialize(@body body: MaterializeRepoRequest): MaterializeRepoResult | Refused;
  @route("/checkpoint") @post op checkpoint(@body body: CheckpointRequest): CheckpointResult | Refused;
  @route("/remove") @post op remove(@body body: RemoveWorktreeRequest): RemoveWorktreeResult | Refused;
}

