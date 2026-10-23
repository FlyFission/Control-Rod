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
export type Decision = S["ControlRod.Records.Decision"];
export type DecisionKind = S["ControlRod.Records.DecisionKind"];
export type DecisionRequest = S["Packages.DecisionRequest"];
export type VerificationRecord = S["ControlRod.Records.VerificationRecord"];
export type Finding = S["ControlRod.Records.Finding"];
export type OfficeItem = S["OfficeItem"];
export type CrEvent = S["ControlRod.Records.Event"];
export type Metrics = S["Metrics"];
export type ApiErrorBody = S["ApiError"];
export type RuntimeStatus = S["Runner.RuntimeStatus"];
export type PreparationView = S["ControlRod.Preparation.PreparationView"];
export type PreparationContent = S["ControlRod.Preparation.PreparationContent"];
export type ResolutionRequest = S["ControlRod.Preparation.ResolutionRequest"];

export type RequirementsConfirmation = S["ControlRod.Preparation.RequirementsConfirmation"];
export type CriterionResultSet = S["ControlRod.Preparation.CriterionResultSet"];
