// Friendly names for the generated contract types. The source is spec/; never edit schema.d.ts.
import type { components } from "./schema.js";

type S = components["schemas"];

export type Session = S["Auth.Session"];
export type Capture = S["ControlRod.Records.Capture"];
export type NewCapture = S["Captures.NewCapture"];
export type CaptureView = S["Captures.CaptureView"];
export type WorkPackage = S["ControlRod.Records.WorkPackage"];
export type PackageStatus = S["ControlRod.Records.PackageStatus"];
export type PackageView = S["PackageView"];
export type Run = S["ControlRod.Records.Run"];
export type Artifact = S["ControlRod.Records.Artifact"];
export type Digest = S["ControlRod.Records.Digest"];
export type DataLane = S["ControlRod.Records.DataLane"];
export type Decision = S["ControlRod.Records.Decision"];
export type DecisionKind = S["ControlRod.Records.DecisionKind"];
export type DecisionRequest = S["Packages.DecisionRequest"];
export type VerificationRecord = S["ControlRod.Records.VerificationRecord"];
export type Finding = S["ControlRod.Records.Finding"];
export type OfficeItem = S["OfficeItem"];
export type AgentFigure = S["AgentFigure"];
export type ScramEvent = S["ControlRod.Records.ScramEvent"];
export type QuarantineReview = S["ControlRod.Records.QuarantineReview"];
export type ScramRestart = S["ControlRod.Records.ScramRestart"];
export type ScramQuarantineBatch = S["ScramQuarantineBatch"];
export type SealCheck = S["SealCheck"];
export type BudgetStatus = S["BudgetStatus"];
/** Usage (plan task 5.2). */
export interface UsageView {
  budgets: BudgetStatus[];
  records: { id: string; run_id: string; source: "measured" | "reported"; wall_time?: { value: string; unit: string }; input_tokens?: { value: string }; output_tokens?: { value: string };
    recorded_at: string; package_id: string; role: string; runtime: string | null; baseline: string | null }[];
  telemetry: { runtime: string; runs: number; reported: number }[];
  /** From the approved policy's budget_near_percent; null when unset. */
  near_share: number | null;
}
/** The record verified (plan task 5.3). */
export interface RecordsVerification {
  chain: { ok: boolean; count: number; broken_at?: number };
  seals: SealCheck[];
  last_sealed_seq: number;
  unsealed: number;
  witnessed: false;
  statement: "Local chain, not witnessed";
}
export interface ChainHead {
  head_seq: number;
  head_digest: Digest;
  at: string;
}
/** A package's inclusion proof, with the control plane's checks of the bundle and of the whole chain. */
export interface PackageProof {
  ok: boolean;
  chain: { ok: boolean; count: number; broken_at?: number };
  check: { ok: boolean; authenticated: boolean; events: number[]; problem?: string };
  bundle: { package_id: string; segment: unknown[]; seal: { id: string; payload: { head_seq: number; purpose: string } } | null; seal_evidence?: unknown; statement: string };
}
/** When a SCRAM was pulled and, once every run it reached has stopped, how long that took. */
export interface ScramTiming {
  pulled_at?: string;
  stopped?: { ms_to_stop: number; runs: number; at: string };
}
export type ScramPresented = S["ScramPresented"];
export interface ScramSummary extends ScramTiming {
  /** Presenting, only that it holds and over what (ScramPresented): never its reason or runs. */
  scram: ScramEvent | ScramPresented;
  run_count: number;
}
/** What pulling SCRAM with a scope would stop now, by the pull's own selection. */
export interface ScramPreview {
  scope: "organization" | "project";
  project_id?: string;
  running_count: number;
  queued_count: number;
  /** Left out when presenting, where they would name restricted work. */
  running?: string[];
  queued?: string[];
  presenting?: boolean;
  counted_at: string;
}
export interface ScramDetail extends ScramTiming {
  scram: ScramEvent;
  runs: {
    run_id: string;
    role: Run["role"];
    subject: "package" | "capture";
    subject_id: string;
    discipline?: string;
    status: Run["status"];
    outcome_unknown: boolean;
    batches: ScramQuarantineBatch[];
    reviews: QuarantineReview[];
  }[];
  restarts: ScramRestart[];
  packages: { id: string; title: string; discipline?: string; lifted: boolean }[];
}
export interface OfficeFloor {
  figures: AgentFigure[];
  needs_me: number;
  inbox_items: number;
  hidden: number;
  generated_at: string;
}
export type CrEvent = S["ControlRod.Records.Event"];
export type Metrics = S["Metrics"];
export type ApiErrorBody = S["ApiError"];
export type RuntimeStatus = S["Runner.RuntimeStatus"];
export type PreparationView = S["ControlRod.Preparation.PreparationView"];
export type PreparationContent = S["ControlRod.Preparation.PreparationContent"];
export type ResolutionRequest = S["ControlRod.Preparation.ResolutionRequest"];

export type RequirementsConfirmation = S["ControlRod.Preparation.RequirementsConfirmation"];
export type CriterionResultSet = S["ControlRod.Preparation.CriterionResultSet"];

export type ActionDescriptor = S["ActionDescriptor"];
export type RuntimePin = S["ControlRod.Records.RuntimePin"];
export type RosterRole = S["RosterRole"];
/** The Roster (plan task 5.1). */
export interface RosterView {
  roles: RosterRole[];
  baselines: { id: string; roles: string[]; runs: number; last_run_at: string; statuses: Record<string, number> }[];
  baselines_recorded: false;
  versions: { runtime: string; version: string; digest: Digest; last_passed_at: string; pinned_for: string[] }[];
  sandbox: { policies: Record<string, unknown>[]; launched: { runtime: string; sandbox: string; run_id: string; at: string }[] };
}
export type AdminCommandInfo = S["AdminCommandInfo"];
/** GET /admin: who is here, what is in force, and every administrative command with the viewer's standing. */
export interface AdminView {
  me: S["Caller"];
  bootstrap: boolean;
  qualification: S["ControlRod.Records.SignerQualification"] | null;
  members: S["ControlRod.Records.Member"][];
  projects: S["ControlRod.Records.Project"][];
  policy: S["ControlRod.Records.PolicySet"] | null;
  themes: string[];
  commands: AdminCommandInfo[];
  actions: ActionDescriptor[];
  floors: { code: string; sentence: string; change: string }[];
  /** The organization's administrative records, for the forms to choose from (plan task 5.4). */
  registry: S["AdminRegistry"];
}
export type AttentionItem = S["AttentionItem"];
export type DigestLine = S["DigestLine"];
/** GET /inbox: what waits on the viewer, what waits on others, and the digest since a sequence. */
export interface InboxView {
  items: AttentionItem[];
  waiting_on_others: AttentionItem[];
  digest: { head: number; lines: DigestLine[] };
}
export type NormalizedEvent = S["ControlRod.Records.NormalizedEvent"];
