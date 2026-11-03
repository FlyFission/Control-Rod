import "@typespec/json-schema";
import "./records.tsp";
using JsonSchema;
using ControlRod.Records;
@jsonSchema namespace ControlRod.Preparation;

@extension("unevaluatedProperties", false)
model PreparationGrantInput {
  @minLength(1) @maxLength(256) id: string;
  /** Relative to the dedicated input root, never the workspace/host root. */
  @pattern("^[A-Za-z0-9_-]+[.](json|bin)$") path: string;
  reference: string;
  digest: Digest;
  @minValue(0) bytes: int32;
}
@extension("unevaluatedProperties", false)
model PreparationGrant {
  schema_version: "0.1.0";
  id: string;
  run_id: string;
  package_id: string;
  @minValue(0) package_revision: int32;
  preparation_id: string;
  @minValue(0) preparation_revision: int32;
  base_digest: Digest;
  package_digest: Digest;
  /** Assigned baseline/runtime/round; changing them invalidates the grant. */
  assignment_digest: Digest;
  role: "requirements-preparer";
  lane: "public" | "internal";
  expires_at: utcDateTime;
  @maxItems(16) inputs: PreparationGrantInput[];
  proposal_path: "proposal.json";
  @minValue(1) @maxValue(5242880) max_proposal_bytes: int32;
  @minValue(1) @maxValue(64) max_operations: int32;
}
@extension("unevaluatedProperties", false)
model GrantInspectIntent { kind: "inspect"; }
@extension("unevaluatedProperties", false)
model GrantReadIntent { kind: "read-input"; @minLength(1) @maxLength(256) input_id: string; }
@extension("unevaluatedProperties", false)
model GrantWriteIntent { kind: "write-proposal"; }
union PreparationGrantIntent { GrantInspectIntent, GrantReadIntent, GrantWriteIntent }
@extension("unevaluatedProperties", false)
model PreparationUsePermit {
  grant: PreparationGrant;
  use_id: string;
  use_token: string;
  intent: PreparationGrantIntent;
  expires_at: utcDateTime;
}
@extension("unevaluatedProperties", false)
model GrantInspectResult { kind: "inspect"; }
@extension("unevaluatedProperties", false)
model GrantReadResult {
  kind: "read-input";
  @minLength(1) @maxLength(256) input_id: string;
  digest: Digest;
  @minValue(0) bytes: int32;
}
@extension("unevaluatedProperties", false)
model GrantWriteResult {
  kind: "write-proposal";
  @maxLength(6990508) content_base64: string;
}
union PreparationUseResult { GrantInspectResult, GrantReadResult, GrantWriteResult }
@extension("unevaluatedProperties", false)
model PreparationUseFinalize {
  @minLength(1) @maxLength(256) use_id: string;
  @minLength(1) @maxLength(128) use_token: string;
  result: PreparationUseResult;
}
@extension("unevaluatedProperties", false)
model PreparationUseReceipt {
  schema_version: "0.1.0";
  grant_id: string;
  use_id: string;
  intent: PreparationGrantIntent;
  admitted_at: utcDateTime;
  /** Admission is not proof of tool execution or model consumption. */
  custody: "authorization-only" | "broker-reported-read" | "controller-retained-proposal";
  artifact?: Artifact;
  @minValue(0) bytes?: int32;
}
