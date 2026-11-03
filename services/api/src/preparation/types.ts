// Aliases only. The field definitions are generated from spec/.
import type { components } from "./schema.js";
type S = components["schemas"];
export type WorkPackage = S["ControlRod.Records.WorkPackage"];
export type PreparationSnapshot =
  S["ControlRod.Preparation.PreparationSnapshot"];
export type PreparationContent = S["ControlRod.Preparation.PreparationContent"];
export type PreparationView = S["ControlRod.Preparation.PreparationView"];
export type PreparationBlocker = S["ControlRod.Preparation.PreparationBlocker"];
export type PackageContract = PreparationContent["package_contract"];
export type ResolutionRequest = S["ControlRod.Preparation.ResolutionRequest"];

export type RequirementsConfirmation =
  S["ControlRod.Preparation.RequirementsConfirmation"];

export type PreparationReleaseManifest = S["ControlRod.Preparation.PreparationReleaseManifest"];
export type CriterionResultSubmission = S["ControlRod.Preparation.CriterionResultSubmission"];
export type CriterionResultSet = S["ControlRod.Preparation.CriterionResultSet"];
export type VerificationRecord = S["ControlRod.Records.VerificationRecord"];
export type EvidenceItem = S["ControlRod.Records.EvidenceItem"];

export type PreparationGrant = S["ControlRod.Preparation.PreparationGrant"];
export type PreparationGrantIntent = S["ControlRod.Preparation.PreparationGrantIntent"];
export type PreparationUsePermit = S["ControlRod.Preparation.PreparationUsePermit"];
export type PreparationUseFinalize = S["ControlRod.Preparation.PreparationUseFinalize"];
export type PreparationUseReceipt = S["ControlRod.Preparation.PreparationUseReceipt"];
