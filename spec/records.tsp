import "@typespec/json-schema";

using JsonSchema;

/**
 * Control Rod records, version 0.1.
 * Released records are written as YAML for people and hashed as RFC 8785 canonical JSON.
 * Engineering values are decimal strings with units, never JSON numbers.
 */
@jsonSchema
@id("https://controlrod.dev/schemas/v0")
namespace ControlRod.Records;

/** Kind of work a project does. General is the base layer with no domain pack. */
enum Mode {
  general: "general",
  software: "software",
  capital_projects: "capital-projects",
}

/** Graded rigor: how much control a package requires. */
enum RigorMode {
  administrative: "administrative",
  quick: "quick",
  standard: "standard",
  high_consequence: "high-consequence",
}

/** Data handling class. Decides runtimes, egress, storage and transcription. */
enum DataLane {
  public: "public",
  internal: "internal",
  proprietary: "proprietary",
  client_confidential: "client-confidential",
  restricted: "restricted",
}

enum PackageStatus {
  draft: "draft",
  released: "released",
  in_work: "in-work",
  in_verification: "in-verification",
  accepted: "accepted",
  closed: "closed",
}

/** A content digest. */
@extension("unevaluatedProperties", false)
model Digest {
  algorithm: "sha256" | "sha384";

  @pattern("^[0-9a-f]{64}([0-9a-f]{32})?$")
  value: string;
}

/** An engineering quantity. The value is a decimal string so no precision is lost. */
@extension("unevaluatedProperties", false)
model Quantity {
  @pattern("^-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?$")
  value: string;

  /** Unit in Pint-compatible notation, for example "kW" or "degF". */
  unit: string;
}

/** A file and its digest. */
@extension("unevaluatedProperties", false)
model Artifact {
  path: string;
  digest: Digest;
}

@extension("unevaluatedProperties", false)
model Deliverable {
  id: string;
  type: string;
  format?: string[];
}

/** A controlled document this package relies on, by reference and revision. */
@extension("unevaluatedProperties", false)
model DesignInput {
  doc: string;
  revision: string;
  title?: string;
  use: string;
}

@extension("unevaluatedProperties", false)
model Assumption {
  id: string;
  statement: string;
  basis: string;
  requires_confirmation: boolean;
  owner: string;
}

@extension("unevaluatedProperties", false)
model CodeOrStandard {
  code: string;
  edition: string;
  sections?: string[];
}

@extension("unevaluatedProperties", false)
model ToolRef {
  name: string;
  version?: string;
  qualification?: "not-required" | "required-before-use" | "qualified";
}

@extension("unevaluatedProperties", false)
model Methodology {
  method: string;
  tools?: ToolRef[];
  status: "proposed" | "approved";
  approved_by?: string;
}

@extension("unevaluatedProperties", false)
model InterfaceConsume {
  parameter: string;
  from: string;
}

@extension("unevaluatedProperties", false)
model InterfaceExport {
  parameter: string;
  value?: Quantity;

  /** Allowed change before consumers must re-check, for example "5%" or a Quantity string. */
  deadband: string;

  consumers: string[];
}

@extension("unevaluatedProperties", false)
model Interfaces {
  consumes?: InterfaceConsume[];
  exports?: InterfaceExport[];
}

@extension("unevaluatedProperties", false)
model AgentAssignment {
  role: string;
  agent_baseline: string;
  baseline_revision: int32;
}

@extension("unevaluatedProperties", false)
model RequiredCustody {
  decisive_evidence_generated_by: "verifier" | "tool" | "author";
  preparer_may_present: boolean;
}

@extension("unevaluatedProperties", false)
model VerificationPlan {
  method:
    | "test-suite"
    | "agent-pre-check"
    | "independent-review"
    | "design-review"
    | "alternate-calculation"
    | "qualification-test";

  verifier: string;

  /** What the verifier may see. Never the author's transcript. */
  verifier_receives: string[];

  required_custody: RequiredCustody;
}

/** The only unit of work an agent may start. */
@extension("unevaluatedProperties", false)
model WorkPackage {
  schema_version: "0.1.0";
  id: string;

  @minValue(0)
  revision: int32;

  title: string;
  project: string;
  mode: Mode;
  discipline?: string;
  status: PackageStatus;
  rigor_mode: RigorMode;
  data_lane: DataLane;
  overlays?: string[];
  objective: string;

  @minItems(1)
  deliverables: Deliverable[];

  exclusions?: string[];
  design_inputs: DesignInput[];
  assumptions?: Assumption[];
  codes_and_standards?: CodeOrStandard[];
  methodology?: Methodology;
  interfaces?: Interfaces;

  @minItems(1)
  agent_assignment: AgentAssignment[];

  /** Protected trust surface. */
  @minItems(1)
  acceptance_criteria: string[];

  /** Protected trust surface. */
  verification: VerificationPlan;

  revalidation_triggers?: string[];
}

@extension("unevaluatedProperties", false)
model RuntimeRef {
  kind: "subscription" | "account" | "local";
  provider: string;
  `model`: string;
}

@extension("unevaluatedProperties", false)
model SkillRef {
  name: string;
  version: string;
  digest: Digest;
}

/** A hired agent role bound to a runtime. A controlled item. */
@extension("unevaluatedProperties", false)
model AgentBaseline {
  schema_version: "0.1.0";
  id: string;

  @minValue(0)
  revision: int32;

  role: string;
  runtime: RuntimeRef;
  prompt_digest: Digest;
  skills: SkillRef[];
  tools: string[];
  permission_profile: string;

  @minItems(1)
  allowed_lanes: DataLane[];

  approved_by?: string;
}

/** Proof of where outputs came from. Recorded by the runner, never by the agent. */
@extension("unevaluatedProperties", false)
model ExecutionTrace {
  schema_version: "0.1.0";
  run_id: string;
  package_id: string;
  package_revision: int32;
  agent_baseline: string;
  baseline_revision: int32;
  tool: ToolRef;
  inputs: Artifact[];
  outputs: Artifact[];
  environment?: Record<string>;
  started_at: utcDateTime;
  finished_at: utcDateTime;

  /**
   * How the runtime was driven. "print" is a headless, one-prompt run (`claude -p`, `codex exec`)
   * where no ACP permission binding is in force; "acp" is reserved for ACP sessions.
   */
  runtime_mode?: "print" | "acp" | "fake";

  /** The model the run asked for, or "default" when it left the choice to the runtime. */
  @maxLength(200)
  requested_model?: string;

  /** The model the runtime said it used, read from its own event stream. Absent when it did not say. */
  @maxLength(200)
  reported_model?: string;

  /** Permission mode the runtime started in, when it has one. */
  @maxLength(100)
  permission_mode?: string;

  /** Tool allowlist passed to the runtime, when it takes one. */
  allowed_tools?: string[];

  /** Sandbox the daemon asked the runtime for: "none", "workspace-write" or "workspace-write+network". */
  @maxLength(100)
  sandbox?: string;
}

/** Independence of one axis of the actor and evidence coupling profile. */
enum Coupling {
  independent: "independent",
  shared: "shared",
  coupled: "coupled",
  `unknown`: "unknown",
}

@extension("unevaluatedProperties", false)
model CouplingProfile {
  actor: Coupling;
  context: Coupling;
  mechanism: Coupling;
  authority: Coupling;
  resource: Coupling;
}

@extension("unevaluatedProperties", false)
model Custody {
  generated_by: string;
  selected_by: string;
  presented_by: string;
  coupling: CouplingProfile;
}

@extension("unevaluatedProperties", false)
model EvidenceItem {
  claim: string;
  status: "pass" | "deferred" | "open";
  artifact?: Artifact;
  custody: Custody;
}

@extension("unevaluatedProperties", false)
model Finding {
  id: string;
  severity: "info" | "minor" | "major" | "critical";
  text: string;
  resolution?: string;
}

/** Evidence that a result met its criteria. Inconclusive never counts as a pass. */
@extension("unevaluatedProperties", false)
model VerificationRecord {
  schema_version: "0.1.0";
  package_id: string;
  package_revision: int32;
  output: Artifact;
  method: VerificationPlan.method;
  verifier: string;
  evidence: EvidenceItem[];
  findings: Finding[];
  outcome: "pass" | "fail" | "inconclusive";
}
