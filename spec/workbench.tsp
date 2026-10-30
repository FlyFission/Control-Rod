import "@typespec/json-schema";
import "./records.tsp";
import "./work.tsp";
import "./tenancy.tsp";

using JsonSchema;

/**
 * Workbench objects (specification 5.7, 5.8, 5.9 and 5.10). Additive types.
 * Classes: frozen versions (F) are digest addressed and never edited; observations (A) are
 * append only; lifecycled identities (L) change state only by commands, each an event.
 * Every object names its organization; ownership and markings live in envelopes beside it.
 */
@jsonSchema
@id("https://controlrod.dev/schemas/v0")
namespace ControlRod.Records;

/** A git object id: SHA-1 (40 hex) or SHA-256 (64 hex). */
@pattern("^([0-9a-f]{40}|[0-9a-f]{64})$")
scalar GitObjectId extends string;

/* ---- Explore and promotion ---- */

enum ExplorationStatus {
  active: "active",
  paused: "paused",
  ended: "ended",
}

/** A live session at the administrative tier. Never on the accept path. (L) */
@extension("unevaluatedProperties", false)
model Exploration {
  id: TenancyId;
  org_id: TenancyId;

  /** Absent for a personal General space. */
  project_id?: TenancyId;

  lane: DataLane;
  sandbox_policy_digest: Digest;
  started_by: TenancyId;
  status: ExplorationStatus;

  /** A person typed into it; it is never a controlled run. */
  interactive: boolean;

  /** No isolation attestation backs it. */
  unattested: boolean;
}

enum WorkspaceKind {
  exploration_worktree: "exploration-worktree",
  run_workspace: "run-workspace",
}

enum WorkspaceStatus {
  provisioning: "provisioning",
  ready: "ready",
  torn_down: "torn-down",
}

/**
 * A materialized working directory. Its identity is not its path. An exploration worktree names
 * its exploration and no run; a run workspace names its run and no exploration. (L)
 */
@extension("unevaluatedProperties", false)
model Workspace {
  id: TenancyId;
  org_id: TenancyId;
  kind: WorkspaceKind;
  exploration_id?: TenancyId;
  run_id?: string;
  path: string;
  lock_holder?: string;
  status: WorkspaceStatus;
}

/** One capture of an exploration's working tree, identified by occurrence. (A) */
@extension("unevaluatedProperties", false)
model Checkpoint {
  id: TenancyId;
  org_id: TenancyId;
  exploration_id: TenancyId;
  workspace_id: TenancyId;
  git_tree: GitObjectId;
  content_digest: Digest;
  parent_id?: TenancyId;
  actor: Actor;

  @format("date-time")
  captured_at: string;
}

enum ManifestEntryMode {
  file: "file",
  executable: "executable",
  symlink: "symlink",
}

@extension("unevaluatedProperties", false)
model ManifestFile {
  @minLength(1)
  path: string;

  mode: ManifestEntryMode;

  /** Content digest; for a symlink, the digest of its target text. */
  digest: Digest;

  link_target?: string;
}

@extension("unevaluatedProperties", false)
model ManifestSubmodule {
  path: string;
  url: string;
  commit: GitObjectId;
}

@extension("unevaluatedProperties", false)
model ManifestExclusion {
  path: string;

  @minLength(1)
  reason: string;
}

enum SymlinkPolicy {
  reject: "reject",
  preserve_inside: "preserve-inside",
}

/** The exact retained input bytes for a promoted revision. Materialized read only for runs. (F) */
@extension("unevaluatedProperties", false)
model SourceManifest {
  id: TenancyId;
  org_id: TenancyId;
  files: ManifestFile[];
  symlink_policy: SymlinkPolicy;
  submodules: ManifestSubmodule[];

  /** Large file pointers were replaced by their content before digests were taken. */
  lfs_resolved: boolean;

  excluded: ManifestExclusion[];

  /** Ignored paths deliberately included as inputs; every other ignored path is excluded. */
  ignored_inputs: string[];
}

/** Exactly one checkpoint or capture becomes a Draft package revision bound to a SourceManifest. (A) */
@extension("unevaluatedProperties", false)
model Promotion {
  id: TenancyId;
  org_id: TenancyId;
  checkpoint_id?: TenancyId;
  capture_id?: string;
  package_id: string;

  /** Intake drafts revision 0; it can be released as is. */
  @minValue(0)
  package_revision: int32;

  source_manifest_digest: Digest;
  mode: Mode;
  rigor: RigorMode;
  grade: SignerGrade;
  lane: DataLane;
  promoted_by: TenancyId;
}

/* ---- Compare ---- */

enum AttemptSetStatus {
  running: "running",
  ready_to_compare: "ready-to-compare",
  selected: "selected",
  abandoned: "abandoned",
}

/** N candidates against one released revision digest. (L) */
@extension("unevaluatedProperties", false)
model AttemptSet {
  id: TenancyId;
  org_id: TenancyId;
  package_id: string;

  /** Intake drafts revision 0; it can be released as is. */
  @minValue(0)
  package_revision: int32;

  release_digest: Digest;

  @minValue(2)
  @maxValue(8)
  candidates: int32;

  status: AttemptSetStatus;
}

/** Identity of one candidate. Every release creates at least one (ordinal 1, no attempt set). (F) */
@extension("unevaluatedProperties", false)
model CandidateAssignment {
  id: TenancyId;
  org_id: TenancyId;
  package_id: string;

  /** Intake drafts revision 0; it can be released as is. */
  @minValue(0)
  package_revision: int32;

  release_digest: Digest;
  attempt_set_id?: TenancyId;

  @minValue(1)
  @maxValue(8)
  ordinal: int32;

  author_assignment: AgentAssignment;
}

/** Choice of one candidate; a proposal absorbed into the verdict subject. (A) */
@extension("unevaluatedProperties", false)
model Selection {
  id: TenancyId;
  org_id: TenancyId;
  attempt_set_id: TenancyId;
  candidate_id: TenancyId;

  @minLength(1)
  reason: string;

  proposed_by: Actor;
}

/* ---- Runtimes and sandboxing ---- */

enum RuntimeAuthState {
  signed_in: "signed-in",
  signed_out: "signed-out",
  `unknown`: "unknown",
}

/** An observation of a runtime on a machine. (A) */
@extension("unevaluatedProperties", false)
model RuntimeProbe {
  id: TenancyId;
  org_id: TenancyId;
  machine_id?: TenancyId;

  /** For example "claude-code" or "codex". */
  runtime: string;

  artifact_digest: Digest;
  version: string;
  auth_state: RuntimeAuthState;
  outcome: "pass" | "fail";
  detail: string;

  @format("date-time")
  observed_at: string;
}

/** One qualified executable. Traces reference this, never the mutable pin. (F) */
@extension("unevaluatedProperties", false)
model RuntimeArtifactVersion {
  id: TenancyId;
  org_id: TenancyId;
  runtime: string;
  version: string;
  artifact_digest: Digest;
  install_path: string;

  @minItems(1)
  probe_ids: TenancyId[];
}

/** Which artifact version a role launches. Changes are directly signed commands. (L) */
@extension("unevaluatedProperties", false)
model RuntimePin {
  id: TenancyId;
  org_id: TenancyId;
  role: RunRole;
  runtime: string;
  artifact_version_id: TenancyId;
  artifact_digest: Digest;
  status: LifecycleStatus;
}

enum SandboxDriver {
  /** Each CLI's own sandbox with settings Control Rod passes (ADR 0021). */
  native_cli: "native-cli",

  /** OCI driver with microVM isolation per runtime class (ADR 0010). */
  oci: "oci",
}

/** What a run's agent actions may touch. Decisions and traces cite its digest. (F per version) */
@extension("unevaluatedProperties", false)
model SandboxPolicy {
  id: TenancyId;

  @minValue(1)
  version: int32;

  org_id: TenancyId;
  driver: SandboxDriver;

  /** Paths agent actions can never read; always includes the CLI login folders. */
  @minItems(1)
  denied_read: string[];

  writable_roots: string[];

  /** Hosts agent actions may reach; empty means no network. */
  allowed_hosts: string[];

  /** Agent tools enabled for the run; anything not listed is off. */
  enabled_tools: string[];

  /** Claims the in-run probe must observe before the verdict counts. */
  mandatory_claims: string[];
}

enum ClaimResult {
  observed: "observed",
  refuted: "refuted",
  unverifiable: "unverifiable",
}

@extension("unevaluatedProperties", false)
model ClaimObservation {
  @minLength(1)
  claim: string;

  result: ClaimResult;
  evidence: string;
}

/** Evidence for each mandatory claim, bound to run, generation, policy and artifact. (A) */
@extension("unevaluatedProperties", false)
model IsolationAttestation {
  id: TenancyId;
  org_id: TenancyId;
  run_id: string;

  @minValue(0)
  generation: int32;

  policy_digest: Digest;
  artifact_digest: Digest;

  @minItems(1)
  claims: ClaimObservation[];

  @format("date-time")
  observed_at: string;
}

/* ---- Records, verification and SCRAM ---- */

enum ControlledRecordKind {
  deliverable_revision: "deliverable-revision",
  merged_change: "merged-change",
}

/** An accepted and applied revision. Created only after application is observed. (F) */
@extension("unevaluatedProperties", false)
model ControlledRecord {
  id: TenancyId;
  org_id: TenancyId;
  project_id?: TenancyId;
  kind: ControlledRecordKind;
  package_id: string;

  /** Intake drafts revision 0; it can be released as is. */
  @minValue(0)
  package_revision: int32;

  candidate_id: TenancyId;

  @minItems(1)
  input_digests: Digest[];

  clearance_decision_id: string;

  /** The observed application: the merged commit, or the issuance record. */
  @minLength(1)
  applied_ref: string;
}

/** A qualified person's verification of a candidate for Safety or Material work. (A) */
@extension("unevaluatedProperties", false)
model PersonVerification {
  id: TenancyId;
  org_id: TenancyId;
  verifier_member_id: TenancyId;
  qualification_id: TenancyId;

  @minValue(1)
  qualification_version: int32;

  candidate_id: TenancyId;

  @minItems(1)
  criteria: string[];

  outcome: "pass" | "fail" | "inconclusive";
  assertion: PasskeyAssertion;
}

enum ScramScope {
  organization: "organization",
  project: "project",
}

/** Who pulled SCRAM, where, why, and what was stopped. (A) */
@extension("unevaluatedProperties", false)
model ScramEvent {
  id: TenancyId;
  org_id: TenancyId;
  scope: ScramScope;

  /** Present exactly when the scope is a project. */
  project_id?: TenancyId;
  pulled_by: TenancyId;

  @minLength(1)
  reason: string;

  assertion: PasskeyAssertion;

  /** Run ids stopped, with their outputs quarantined. */
  quarantine: string[];
}

/* ---- Comments and change control ---- */

enum CommentStatus {
  open: "open",
  resolved: "resolved",
  withdrawn: "withdrawn",
}

/** A comment anchored to a subject digest and a locator. Valid for that digest only. (L) */
@extension("unevaluatedProperties", false)
model Comment {
  id: TenancyId;
  org_id: TenancyId;
  subject_digest: Digest;

  /** Where in the subject, in the subject type's declared locator scheme. */
  locator: string;

  author: Actor;

  @minLength(1)
  text: string;

  reply_to?: TenancyId;
  status: CommentStatus;
}

/** Cites what resolved a comment: a later revision or a reply. (A) */
@extension("unevaluatedProperties", false)
model Resolution {
  id: TenancyId;
  org_id: TenancyId;
  comment_id: TenancyId;
  resolved_by: Actor;
  cites_kind: "revision" | "reply";

  @minLength(1)
  cites: string;
}

enum ChangeRequestKind {
  lane_lowering: "lane-lowering",
  declassification: "declassification",
  policy_change: "policy-change",
  authenticator_policy: "authenticator-policy",
}

enum ChangeRequestStatus {
  proposed: "proposed",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "withdrawn",
}

/** A change only an authorized person may approve, over an exact subject version. (L) */
@extension("unevaluatedProperties", false)
model ChangeRequest {
  id: TenancyId;
  org_id: TenancyId;
  kind: ChangeRequestKind;
  subject_digest: Digest;

  @minLength(1)
  reason: string;

  /** Downstream objects the change affects, listed before approval. */
  impact: string[];

  proposed_by: Actor;
  status: ChangeRequestStatus;

  /** The proposed content (for a policy change, the policy set body); its digest is subject_digest. */
  proposal?: Record<unknown>;
}

/* ---- Budgets and usage ---- */

enum BudgetScope {
  organization: "organization",
  project: "project",
  agent: "agent",
}

enum BudgetMode {
  track: "track",
  alert: "alert",
  hard_cap: "hard-cap",
}

/** A spending or usage limit. (L) */
@extension("unevaluatedProperties", false)
model Budget {
  id: TenancyId;
  org_id: TenancyId;
  scope: BudgetScope;
  scope_id: string;
  mode: BudgetMode;

  /** The limit with its unit, for example "USD" or "tokens". */
  limit: Quantity;

  /** ISO 8601 duration, for example "P1M". */
  period: string;

  status: LifecycleStatus;
}

/** Reported or measured usage of one run or session. (A) */
@extension("unevaluatedProperties", false)
model UsageRecord {
  id: TenancyId;
  org_id: TenancyId;
  run_id?: string;
  exploration_id?: TenancyId;

  /** Whether the runtime reported the figures or Control Rod measured them. */
  source: "reported" | "measured";

  input_tokens?: Quantity;
  output_tokens?: Quantity;
  cache_read_tokens?: Quantity;
  context_pack_tokens?: Quantity;
  wall_time?: Quantity;
  cost?: Quantity;
  first_pass_accepted?: boolean;
}

enum ReservationStatus {
  reserved: "reserved",
  settled: "settled",
  released: "released",
}

/** Budget held for a run before it starts, settled from usage after. (L) */
@extension("unevaluatedProperties", false)
model BudgetReservation {
  id: TenancyId;
  org_id: TenancyId;
  budget_id: TenancyId;
  run_id: string;
  amount: Quantity;
  status: ReservationStatus;
}

/* ---- Capital Projects hooks: identity, owner and links only (specification 5.9) ---- */

/** A project deliverable. Distinct from a package's Deliverable entry. */
@extension("unevaluatedProperties", false)
model ProjectDeliverable {
  id: TenancyId;
  org_id: TenancyId;
  project_id: TenancyId;
  discipline: string;
  grade: SignerGrade;
}

@extension("unevaluatedProperties", false)
model DeliverableRevision {
  id: TenancyId;
  org_id: TenancyId;
  deliverable_id: TenancyId;

  /** Its status is its rung on the project's ladder. */
  rung: string;

  /** Both or neither. */
  package_id?: string;

  @minValue(0)
  package_revision?: int32;
}

@extension("unevaluatedProperties", false)
model InterfaceRecord {
  id: TenancyId;
  org_id: TenancyId;
  provider_package_id: string;
  receiver_package_ids: string[];

  /** From identified through accepted. */
  maturity: string;
}

@extension("unevaluatedProperties", false)
model FlowEdgeRef {
  id: TenancyId;
  org_id: TenancyId;
  flow_id: string;
  deadband?: Quantity;
}

@extension("unevaluatedProperties", false)
model PhaseGate {
  id: TenancyId;
  org_id: TenancyId;
  project_id: TenancyId;
  criteria_ids: string[];
}
