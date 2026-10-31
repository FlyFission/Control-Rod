import "@typespec/json-schema";
import "./records.tsp";

using JsonSchema;

/**
 * Tenancy, people and authority (workbench specification 5.1). Additive types.
 * Organization, Member, Project, RepoBinding and Machine are lifecycled identities: their state
 * changes only by commands, each recorded as an event. SignerQualification, AuthenticatorCredential,
 * Delegation and PolicySet are frozen versions: a change is a new version with its own digest, and
 * no stored version is ever edited.
 * Ownership and marking live in envelopes beside each record (OwnershipEnvelope, MarkingEnvelope),
 * never inside a signed body or a chained event payload.
 */
@jsonSchema
@id("https://controlrod.dev/schemas/v0")
namespace ControlRod.Records;

/** A stable identifier: a lowercase type prefix, an underscore, then up to 64 letters, digits or hyphens. */
@pattern("^[a-z][a-z0-9]*_[A-Za-z0-9-]{1,64}$")
scalar TenancyId extends string;

enum LifecycleStatus {
  active: "active",
  suspended: "suspended",
  retired: "retired",
}

/** The tenant boundary. Floors and budgets attach here. */
@extension("unevaluatedProperties", false)
model Organization {
  id: TenancyId;
  name: string;
  status: LifecycleStatus;
}

/** A person in an organization. Passkeys bind here; only a passkey session of a Member is a person. */
@extension("unevaluatedProperties", false)
model Member {
  id: TenancyId;
  org_id: TenancyId;

  /** The WebAuthn user name the Member's passkeys were registered under. */
  user_name: string;

  display_name: string;
  status: LifecycleStatus;

  /** The Member's own office theme: a bundled theme and the digest of its manifest when chosen. */
  office_theme?: OfficeThemeSelection;
}

@extension("unevaluatedProperties", false)
model OfficeThemeSelection {
  @pattern("^[a-z][a-z0-9-]{1,63}$")
  theme_id: string;

  manifest_digest: Digest;
}

/** Grades a signer may sign at. */
enum SignerGrade {
  safety: "safety",
  material: "material",
  general_service: "general-service",
}

/** Roles a signer may hold on a package. */
enum SignerRole {
  originator: "originator",
  checker: "checker",
  approver: "approver",
  discipline_lead: "discipline-lead",
  engineer_in_responsible_charge: "engineer-in-responsible-charge",
}

/** Authorities this specification needs beyond signing roles. */
enum SignerAuthority {
  /** Members, runtimes and sandbox policy. */
  administrator: "administrator",

  /** Classify and raise lanes. Lowering still needs a change request. */
  lane: "lane",

  /** Policy sets, budgets and autonomy level. */
  policy: "policy",
}

/** A professional license as the Member recorded it. */
@extension("unevaluatedProperties", false)
model License {
  /** Issuing jurisdiction, for example "US-SC". */
  jurisdiction: string;

  /** License number as issued. */
  number: string;

  discipline?: string;

  /** Last day the license is valid, as an ISO date. */
  @format("date")
  expires_on: string;
}

/** What a Member is qualified to sign and administer. One frozen version per change. */
@extension("unevaluatedProperties", false)
model SignerQualification {
  id: TenancyId;

  @minValue(1)
  version: int32;

  org_id: TenancyId;
  member_id: TenancyId;
  licenses: License[];
  disciplines: string[];
  grades: SignerGrade[];
  roles: SignerRole[];
  authorities: SignerAuthority[];

  /** A revoked version grants nothing; revocation is a new version, never a deletion. */
  revoked: boolean;

  /** Why this version was issued or revoked. */
  reason: string;

  @format("date-time")
  effective_at: string;
}

/** The attestation statement format a registration returned. "none" means no attestation. */
enum AttestationFormat {
  none: "none",
  packed: "packed",
  tpm: "tpm",
  fido_u2f: "fido-u2f",
  android_key: "android-key",
  android_safetynet: "android-safetynet",
  apple: "apple",
}

/** Whether a credential may sign decisions whose floor requires a hardware backed key. */
@extension("unevaluatedProperties", false)
model HardwareFloorVerdict {
  eligible: boolean;

  /** The evidence that decided it, or the evidence that is missing. */
  reason: string;
}

/** A Member's passkey with its registration evidence. One frozen version per change. */
@extension("unevaluatedProperties", false)
model AuthenticatorCredential {
  id: TenancyId;

  @minValue(1)
  version: int32;

  org_id: TenancyId;
  member_id: TenancyId;

  /** The WebAuthn credential id (base64url). */
  credential_id: string;

  attestation_format: AttestationFormat;

  /** Authenticator model identifier when attested. */
  aaguid?: string;

  user_verified: boolean;

  /**
   * Whether the credential may be synced between devices (multi-device). Absent when the
   * registration did not record it (passkeys registered before migration 009).
   */
  backup_eligible?: boolean;

  hardware_floor: HardwareFloorVerdict;

  /**
   * Whether the attestation chain verified against a retained trust anchor at registration. Absent
   * on records made before it was kept; signing then trusts only the recorded verdict.
   */
  attestation_verified?: boolean;

  /** The registration's attestation, kept so the verdict can be checked again later. */
  attestation_evidence?: AttestationEvidence;

  /** A revoked credential signs nothing and cannot sign in. Revocation is a new version. */
  revoked?: boolean;

  @format("date-time")
  recorded_at: string;
}

/** What an authenticator returned at registration, and the trust anchor its chain reached. */
@extension("unevaluatedProperties", false)
model AttestationEvidence {
  /** The WebAuthn attestation object exactly as returned (base64url): statement, chain and authenticator data. */
  attestation_object: string;

  /** SHA-256 of the DER trust anchor certificate the chain verified against, when it did. */
  trust_anchor_digest?: Digest;
}

/** A dated, scoped transfer of a role. Nothing is approved on a timeout. */
@extension("unevaluatedProperties", false)
model Delegation {
  id: TenancyId;
  org_id: TenancyId;
  from_member_id: TenancyId;
  to_member_id: TenancyId;
  role: SignerRole;
  project_id?: TenancyId;
  discipline?: string;

  @format("date")
  starts_on: string;

  @format("date")
  ends_on: string;

  reason: string;
}

/** Ends a delegation before its end date. Delegations are frozen; their revocation is its own record. */
@extension("unevaluatedProperties", false)
model DelegationRevocation {
  id: TenancyId;
  org_id: TenancyId;
  delegation_id: TenancyId;
  revoked_by: TenancyId;

  @minLength(1)
  reason: string;

  @format("date-time")
  revoked_at: string;
}

/** A project: its mode, default rigor, admitted lanes, QA overlays and autonomy level. */
@extension("unevaluatedProperties", false)
model Project {
  id: TenancyId;
  org_id: TenancyId;
  name: string;
  mode: Mode;
  default_rigor: RigorMode;

  @minItems(1)
  lanes: DataLane[];

  qa_overlays: string[];

  /** Autonomy level. Level 4 is never permitted (specification 11.2). */
  @minValue(0)
  @maxValue(3)
  autonomy_level: int32;

  status: LifecycleStatus;
}

/** A repository bound to a project (Software mode merge gate). */
@extension("unevaluatedProperties", false)
model RepoBinding {
  id: TenancyId;
  org_id: TenancyId;
  project_id: TenancyId;
  url: string;
  default_branch: string;
  status: LifecycleStatus;
}

/** Floors and settings in effect. Decisions reference a policy set by digest. */
@extension("unevaluatedProperties", false)
model PolicySet {
  id: TenancyId;

  @minValue(1)
  version: int32;

  org_id: TenancyId;

  /** Attestation formats accepted as evidence of a hardware backed key (docs/sqa/authenticators.md). */
  hardware_attestation_formats: AttestationFormat[];

  /** Floor settings by name, each a short string value. */
  settings: Record<string>;

  reason: string;

  @format("date-time")
  effective_at: string;
}

/** An enrolled daemon host. */
@extension("unevaluatedProperties", false)
model Machine {
  id: TenancyId;
  org_id: TenancyId;
  name: string;
  status: LifecycleStatus;
}

/** Who owns a stored object. Kept beside the record, never inside a signed body. */
@extension("unevaluatedProperties", false)
model OwnershipEnvelope {
  /** The stored object's type, for example "package" or "capture". */
  object_kind: string;

  object_id: string;
  org_id: TenancyId;
  project_id?: TenancyId;
}

/**
 * One version of an object's marking (workbench specification 11.3 M-1, M-2). `lane` is the lane the
 * object carried when it was created and is the same in every version. Each later version records
 * why the effective lane was computed again; no version is ever edited.
 */
@extension("unevaluatedProperties", false)
model MarkingEnvelope {
  object_kind: string;
  object_id: string;

  @minValue(1)
  version: int32;

  lane: DataLane;
  reason: string;

  /** A lane a person with lane authority raised the object to. Never lower than an earlier one. */
  assigned?: DataLane;

  /** The input marking versions the effective lane was computed from (provenance edges). */
  inputs?: MarkingInput[];

  /** An approved declassification of this object: it then contributes this lane, whatever its inputs. */
  override?: MarkingOverride;

  /**
   * The most sensitive of the assigned (or creation) lane and every input's effective lane, or the
   * override's lane. Absent on versions recorded before task 1.9, where it equals `lane`.
   */
  effective_lane?: DataLane;

  /** The approved change request that caused this version, when one did. */
  change_request_id?: TenancyId;
}

/** A provenance edge: the marking version of an object another object was derived from. */
@extension("unevaluatedProperties", false)
model MarkingInput {
  object_kind: string;
  object_id: string;

  @minValue(1)
  version: int32;
}

/**
 * A declassification approved by a signed change request over an exact marking version. It covers
 * the input versions the approval saw; an input added later, or raised since, still counts.
 */
@extension("unevaluatedProperties", false)
model MarkingOverride {
  lane: DataLane;
  change_request_id: TenancyId;

  /** The input marking versions the approval covered. */
  covered?: MarkingInput[];

  /**
   * The lane of every configured source (document, policy, repository) in the object's ancestry when
   * the approval was given. A configured lane raised, added or removed since leaves the override
   * standing in the record but not at dispatch.
   */
  covered_configured?: ConfiguredCoverage[];
}

/** A configured source and the lane the owner's config gave it. */
@extension("unevaluatedProperties", false)
model ConfiguredCoverage {
  reference: string;
  lane: DataLane;
}
