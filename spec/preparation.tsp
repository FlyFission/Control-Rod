import "@typespec/json-schema";
import "./records.tsp";
import "./work.tsp";
using JsonSchema;
using ControlRod.Records;

/** Additive preparation companions; historical WorkPackage 0.1.0 bytes are unchanged. */
@jsonSchema
namespace ControlRod.Preparation;

@extension("unevaluatedProperties", false)
model PackageContract {
  mode: Mode;
  objective: string;
  deliverables: Deliverable[];
  exclusions?: string[];
  design_inputs: DesignInput[];
  assumptions?: Assumption[];
  codes_and_standards?: CodeOrStandard[];
  rigor_mode: RigorMode;
  data_lane: DataLane;
  methodology?: Methodology;
  verification: VerificationPlan;
}
@extension("unevaluatedProperties", false)
model Requirement {
  @minLength(1) id: string;
  statement: string;
  source_refs: string[];
  journey_or_repro_refs: string[];
}
@extension("unevaluatedProperties", false)
model Criterion {
  @minLength(1) id: string;
  requirement_ids: string[];
  statement: string;
  verification_check_ids: string[];
}
@extension("unevaluatedProperties", false)
model PreparationContext {
  problem: string;
  repro?: string;
  expected?: string;
  actual?: string;
  environment?: string;
  current_journey?: string;
  desired_journey?: string;
  implementation_notes?: string;
}
@extension("unevaluatedProperties", false)
model OpenItem {
  @minLength(1) id: string;
  kind: "question" | "assumption" | "conflict";
  text: string;
  owner: string;
  blocking: boolean;
  state: "open" | "resolved" | "deferred";
  resolution_refs: string[];
}
@extension("unevaluatedProperties", false)
model Escalation {
  @minLength(1) id: string;
  criterion_ids: string[];
  reason: string;
  alternatives: string[];
  owner: string;
  resolution_refs: string[];
}
@extension("unevaluatedProperties", false)
model HumanResolution {
  @minLength(1) id: string;
  item_id: string;
  actor: Actor;
  rationale: string;
  source_refs: string[];
}
@extension("unevaluatedProperties", false)
model DesignElement { @minLength(1) id: string; description: string; }
@extension("unevaluatedProperties", false)
model PreparationTask {
  @minLength(1) id: string;
  description: string;
  design_element_ids: string[];
  depends_on: string[];
}
@extension("unevaluatedProperties", false)
model PreparationCheck {
  @minLength(1) id: string;
  criterion_ids: string[];
  method: string;
  required: boolean;
  expected_result: string;
}
@extension("unevaluatedProperties", false)
model TechnicalPlan {
  summary: string;
  current_state_refs: string[];
  design_elements: DesignElement[];
  alternatives: string[];
  tasks: PreparationTask[];
  checks: PreparationCheck[];
  rollout: string;
  risks: string[];
}
@extension("unevaluatedProperties", false)
model BasisRef {
  kind: "capture" | "attachment" | "repository" | "document" | "package" | "policy";
  reference: string;
  revision: string;
  digest: Digest;
  commit?: string;
  path?: string;
  @minValue(1) line_start?: int32;
  @minValue(1) line_end?: int32;
}
@extension("unevaluatedProperties", false)
model PreparationContent {
  request_kind: "general" | "bugfix" | "enhancement" | "capital-projects";
  package_contract: PackageContract;
  requirements: Requirement[];
  criteria: Criterion[];
  context: PreparationContext;
  questions: OpenItem[];
  resolutions: HumanResolution[];
  escalations: Escalation[];
  technical_plan: TechnicalPlan;
  basis: BasisRef[];
}
@extension("unevaluatedProperties", false)
model PreparationSnapshot {
  ...PreparationContent;
  schema_version: "0.1.0";
  id: string;
  package_id: string;
  @minValue(0) package_revision: int32;
  @minValue(0) revision: int32;
  previous_digest?: Digest;
  created_by: Actor;
  created_at: utcDateTime;
}
@extension("unevaluatedProperties", false)
model PreparationBlocker { code: string; message: string; owner: string; }
@extension("unevaluatedProperties", false)
model PreparationView {
  snapshot: PreparationSnapshot;
  content_digest: Digest;
  requirements_digest: Digest;
  confirmed: boolean;
  readiness: "blocked" | "ready";
  blockers: PreparationBlocker[];
  change_summary: string;
  manifest?: PreparationReleaseManifest;
}
@extension("unevaluatedProperties", false)
model PreparationEnrollment {
  @minValue(0) package_revision: int32;
  @minLength(8) @maxLength(100) idempotency_key: string;
}
@extension("unevaluatedProperties", false)
model ResolutionRequest { item_id: string; rationale: string; source_refs: string[]; }
@extension("unevaluatedProperties", false)
model PreparationHistory {
  revisions: PreparationView[];
  next_before?: int32;
}

/** Stored only by the later verified passkey and kernel confirmation path. */
@extension("unevaluatedProperties", false)
model RequirementsConfirmation {
  id: string;
  package_id: string;
  package_revision: int32;
  requirements_digest: Digest;
  actor: Actor;
  decided_at: utcDateTime;
  assertion: PasskeyAssertion;
}
@extension("unevaluatedProperties", false)
model PreparationReleaseManifest {
  package_id: string;
  package_revision: int32;
  preparation_id: string;
  preparation_revision: int32;
  preparation_digest: Digest;
  requirements_confirmation_id: string;
  requirements_digest: Digest;
  basis_refs: BasisRef[];
  feature_version: "0.1.0";
}
@extension("unevaluatedProperties", false)
model CheckResult {
  check_id: string;
  outcome: "pass" | "fail" | "inconclusive" | "open" | "deferred";
  evidence_refs: string[];
}
@extension("unevaluatedProperties", false)
model CriterionResult {
  criterion_id: string;
  outcome: "pass" | "fail" | "inconclusive" | "open" | "deferred";
  check_results: CheckResult[];
  finding_refs: string[];
}
@extension("unevaluatedProperties", false)
model CriterionResultSubmission {
  package_id: string;
  @minValue(0) package_revision: int32;
  release_manifest_digest: Digest;
  results: CriterionResult[];
}
/** Controller binds admitted checker results to the actual normalized verification record. */
@extension("unevaluatedProperties", false)
model CriterionResultSet {
  ...CriterionResultSubmission;
  verification_record_digest: Digest;
}

@extension("unevaluatedProperties", false)
model ConfirmationOptionsRequest { expected_requirements_digest: Digest; }
@extension("unevaluatedProperties", false)
model ConfirmationRequest { assertion: Record<unknown>; }
@extension("unevaluatedProperties", false)
model ConfirmationOptions { requirements_digest: Digest; options: Record<unknown>; }
