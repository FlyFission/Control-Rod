// Aliases only. The field definitions are generated from spec/.
import type { components } from "./schema.js";
type S = components["schemas"];
export type WorkPackage = S["ControlRod.Records.WorkPackage"];
export type PreparationSnapshot = S["ControlRod.Preparation.PreparationSnapshot"];
export type PreparationContent = S["ControlRod.Preparation.PreparationContent"];
export type PreparationView = S["ControlRod.Preparation.PreparationView"];
export type PreparationBlocker = S["ControlRod.Preparation.PreparationBlocker"];
export type PackageContract = PreparationContent["package_contract"];
export type ResolutionRequest = S["ControlRod.Preparation.ResolutionRequest"];
