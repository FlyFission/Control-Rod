import type { OfficeItem, PersonVerificationEntry, WorkPackage } from "../api/types.js";

export type ColumnId = "ready" | "drafting" | "agent-check" | "person-verifies" | "needs-signature" | "reached";

export const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: "ready", title: "Ready" },
  { id: "drafting", title: "Drafting" },
  { id: "agent-check", title: "Agent check" },
  { id: "person-verifies", title: "Person verifies" },
  { id: "needs-signature", title: "Needs signature" },
  { id: "reached", title: "Accepted" },
];

export type PreCheck = "none" | "passed" | "disputed";

/** Safety and Material work needs a person verification by someone other than its originator (spec 6.2). */
export function needsIndependentCheck(pkg: WorkPackage): boolean {
  return pkg.grade === "safety" || pkg.grade === "material";
}

/**
 * Board columns are work steps toward a package's next rung. A card's status is still its rung.
 * Closed packages leave the board. `verified` is whether a passing person verification is recorded for
 * the current revision; null means the caller cannot see person verifications, so a passed pre-check
 * goes straight to Needs signature as it did before Person verifies existed.
 */
export function boardColumn(pkg: WorkPackage, preCheck: PreCheck, verified: boolean | null): ColumnId | null {
  switch (pkg.status) {
    case "draft":
      return "ready";
    case "released":
    case "in-work":
      return "drafting";
    case "in-verification":
      if (preCheck !== "passed") return "agent-check";
      if (verified === false && needsIndependentCheck(pkg)) return "person-verifies";
      return "needs-signature";
    case "accepted":
      return "reached";
    case "closed":
      return null;
  }
}

/** The pre-check state from the office: a dispute for this revision wins over an accept. */
export function preCheckState(pkg: WorkPackage, office: OfficeItem[]): PreCheck {
  const mine = office.filter((o) => o.package_id === pkg.id && o.package_revision === pkg.revision);
  if (mine.some((o) => o.kind === "dispute")) return "disputed";
  if (mine.some((o) => o.kind === "accept")) return "passed";
  return "none";
}

/** Whether a passing person verification is recorded for the package's current revision. */
export function isVerified(pkg: WorkPackage, verifications: PersonVerificationEntry[]): boolean {
  return verifications.some((v) => v.package_revision === pkg.revision && v.outcome === "pass");
}
