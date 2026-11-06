import type { ActionDescriptor, AdminView, OfficeItem, PersonVerificationEntry, WorkPackage } from "../api/types.js";
import { blockUnverifiedAccept, boardColumn, isVerified, preCheckState } from "./board.js";

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
  /** The people who originated the work (user names, from the package view), first originator first. */
  originators: string[];
  /** Whether someone other than every originator could verify it (see hasOtherQualified). */
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

  const verified = i.verified !== undefined ? i.verified : isVerified(pkg, i.verifications);
  const column = boardColumn(pkg, preCheckState(pkg, i.office), verified);
  // O6: shown to every viewer, since nobody can clear the step, and naming who is excluded and why.
  if (column === "person-verifies" && !i.otherQualifiedVerifier) {
    const who = i.originators.length > 0 ? `. Originators cannot verify their own work: ${i.originators.join(", ")}` : "";
    return { tone: "block", text: `Needs a second qualified person${who}` };
  }

  // Ruling 16: the verification outranks an allowed accept (screen-only until D-4; see blockUnverifiedAccept).
  const offered = blockUnverifiedAccept(pkg, i.actions, verified);
  const first = offered.find((a) => a.allowed);
  if (first) return { tone: "needs", text: first.label, command: first.command };

  if (column === "person-verifies") return { tone: "wait", text: "Waiting on a person verification" };
  if (preCheckState(pkg, i.office) === "disputed") return { tone: "block", text: "The agent pre-check disputes this work" };
  if (i.runActive) return { tone: "wait", text: "An agent is working on it" };

  const refused = offered.find((a) => !a.allowed);
  return { tone: "wait", text: refused ? refusalText(refused) : "Nothing to do yet" };
}

/** The verify role set, as the server's ACTION_ROLES.verify (services/api/src/authority.ts). */
const VERIFY_ROLES = ["checker", "approver", "engineer-in-responsible-charge"];

/**
 * Whether some member other than every originator could verify the work, by the server's rules as
 * far as the web can see them (services/api/src/person-verification.ts admissible, authority.ts
 * gapsIn): an active member whose latest qualification version is not revoked, holds a verify role,
 * covers the grade and, for Safety and Material work with a discipline, that discipline.
 * `excluded` holds the originators' member ids. Licence currency for Safety work is not visible to
 * the web, so a lapsed licence can make this say yes when the server would refuse; Task 7 reads
 * eligibility from the server instead.
 */
export function hasOtherQualified(admin: AdminView, needs: { grade: string; discipline?: string }, excluded: ReadonlySet<string>): boolean {
  const active = new Set(admin.members.filter((m) => m.status === "active").map((m) => m.id));
  const latest = new Map<string, AdminView["registry"]["qualifications"][number]>();
  for (const q of admin.registry.qualifications) {
    const seen = latest.get(q.member_id);
    if (!seen || q.version > seen.version) latest.set(q.member_id, q);
  }
  const grade = needs.grade || "general-service";
  return [...latest.values()].some(
    (q) =>
      !q.revoked &&
      active.has(q.member_id) &&
      !excluded.has(q.member_id) &&
      q.roles.some((r) => VERIFY_ROLES.includes(r)) &&
      q.grades.includes(grade as never) &&
      (grade === "general-service" || !needs.discipline || q.disciplines.includes(needs.discipline)),
  );
}
