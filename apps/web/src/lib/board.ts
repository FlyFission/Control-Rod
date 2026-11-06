import type { ActionDescriptor, OfficeItem, PersonVerificationEntry, WorkPackage } from "../api/types.js";

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

/**
 * Whether a passing person verification covers the package's current work: the current revision and,
 * within it, the current subject (the server's covers_current_subject, ruling 18). The author output
 * or pre-check can change within a revision, so a pass on the revision alone is not enough.
 */
export function isVerified(pkg: WorkPackage, verifications: PersonVerificationEntry[]): boolean {
  return verifications.some((v) => v.package_revision === pkg.revision && v.outcome === "pass" && v.covers_current_subject === true);
}

/**
 * What a person verification read says about the current work: true or false, or "unknown" when the
 * read has not arrived or its latest attempt failed. Cached data from an earlier success is not
 * trusted after a failed refresh, so a covering pass that can no longer be read does not count.
 */
export function verificationRead(pkg: WorkPackage, q: { data?: PersonVerificationEntry[] | undefined; isError: boolean }): boolean | "unknown" {
  if (q.isError || q.data === undefined) return "unknown";
  return isVerified(pkg, q.data);
}

/** Decision commands that accept the work. */
export const ACCEPT_COMMANDS: readonly string[] = ["accept", "accept-with-findings"];

/** Why Accept is not offered on independent-check work that no person verification covers. */
export const ACCEPT_WAITS_FOR_VERIFICATION = "A person verification of the current work must come before Accept";

/**
 * Ruling 16, the one rule every entry point uses (board, decision bar, case view): on Safety or
 * Material work that no passing person verification covers (`verified` false, or null when unknown),
 * an allowed accept or accept-with-findings is shown as refused, so the screen offers no Accept.
 * This block is screen-only: the server still allows the accept until the kernel guard D-4 is signed.
 */
export function blockUnverifiedAccept(pkg: WorkPackage, actions: ActionDescriptor[], verified: boolean | null): ActionDescriptor[] {
  if (!needsIndependentCheck(pkg) || verified === true) return actions;
  return actions.map((a) =>
    a.allowed && ACCEPT_COMMANDS.includes(a.command)
      ? { ...a, allowed: false, reason: ACCEPT_WAITS_FOR_VERIFICATION, change: "A qualified checker who did not originate the work records a passing person verification of it." }
      : a,
  );
}
