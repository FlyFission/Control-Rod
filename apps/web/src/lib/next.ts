import type { ActionDescriptor, AdminView, OfficeItem, PersonVerificationEntry, WorkPackage } from "../api/types.js";
import { boardColumn, isVerified, preCheckState } from "./board.js";

export type NextLine = { tone: "needs" | "wait" | "block" | "ok"; text: string; command?: string };

export type NextInput = {
  pkg: WorkPackage;
  actions: ActionDescriptor[];
  office: OfficeItem[];
  verifications: PersonVerificationEntry[];
  /**
   * Whether a passing person verification is recorded, exactly as the card's column was chosen with it.
   * null means not known. Leave it out to derive it from `verifications`.
   */
  verified?: boolean | null;
  viewerIsOriginator: boolean;
  otherQualifiedVerifier: boolean;
  runActive: boolean;
};

/** Why an action is refused, in the API's own words where it gave them. */
function refusalText(a: ActionDescriptor): string {
  if (a.reason) return a.reason;
  if (a.missing && a.missing.length > 0) return `Missing: ${a.missing.join(", ")}`;
  return `${a.label} is not available yet`;
}

/**
 * The one line on a card that says what happens next: the first allowed action, or why the card waits,
 * or that it is blocked for want of a second qualified person (spec 6.2, O6).
 */
export function nextLine(i: NextInput): NextLine {
  const { pkg } = i;
  if (pkg.status === "accepted") return { tone: "ok", text: "Accepted" };
  if (pkg.status === "closed") return { tone: "ok", text: "Closed" };

  const column = boardColumn(pkg, preCheckState(pkg, i.office), i.verified !== undefined ? i.verified : isVerified(pkg, i.verifications));
  if (column === "person-verifies" && i.viewerIsOriginator && !i.otherQualifiedVerifier) {
    return { tone: "block", text: "Needs a second qualified person" };
  }

  const first = i.actions.find((a) => a.allowed);
  if (first) return { tone: "needs", text: first.label, command: first.command };

  if (column === "person-verifies") return { tone: "wait", text: "Waiting on a person verification" };
  if (preCheckState(pkg, i.office) === "disputed") return { tone: "block", text: "The agent pre-check disputes this work" };
  if (i.runActive) return { tone: "wait", text: "An agent is working on it" };

  const refused = i.actions.find((a) => !a.allowed);
  return { tone: "wait", text: refused ? refusalText(refused) : "Nothing to do yet" };
}

/**
 * Whether some other active member holds a current qualification that covers the grade. `viewer` is the
 * viewer's member id.
 */
export function hasOtherQualified(admin: AdminView, viewer: string, grade: string): boolean {
  const active = new Set(admin.members.filter((m) => m.status === "active").map((m) => m.id));
  return admin.registry.qualifications.some(
    (q) => !q.revoked && q.member_id !== viewer && active.has(q.member_id) && q.grades.includes(grade),
  );
}
