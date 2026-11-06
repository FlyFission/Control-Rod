import { describe, expect, it } from "vitest";
import type { ActionDescriptor, AdminView, OfficeItem, PersonVerificationEntry, WorkPackage } from "../api/types.js";
import { pkg } from "../test/fixtures.js";
import { hasOtherQualified, nextLine, type NextInput } from "./next.js";

const allowed = (command: string, label = command): ActionDescriptor => ({ command, label, allowed: true, signature: "direct" });
const refused = (command: string, reason?: string, missing?: string[]): ActionDescriptor => ({ command, label: command, allowed: false, signature: "none", ...(reason ? { reason } : {}), ...(missing ? { missing } : {}) });

/** `column: "person-verifies"` builds a Safety package in verification with a passed pre-check. */
function input(over: Partial<Omit<NextInput, "pkg">> & { status?: WorkPackage["status"]; grade?: WorkPackage["grade"]; column?: "person-verifies" } = {}): NextInput {
  const { status, grade, column, ...rest } = over;
  const p = column === "person-verifies"
    ? pkg({ status: "in-verification", grade: grade ?? "safety" })
    : pkg({ ...(status ? { status } : {}), ...(grade ? { grade } : {}) });
  const office: OfficeItem[] = column === "person-verifies"
    ? [{ kind: "accept", package_id: p.id, package_revision: p.revision, title: "t", detail: "d", since: "2026-10-22T10:00:00Z" }]
    : [];
  return { pkg: p, actions: [], office, verifications: [], originators: [], otherQualifiedVerifier: true, runActive: false, ...rest };
}

describe("nextLine", () => {
  it("names the first allowed decision as the next line", () => {
    expect(nextLine(input({ actions: [refused("accept"), allowed("release", "Release")] }))).toEqual({ tone: "needs", text: "Release", command: "release" });
  });
  it("says nobody else can verify, naming who is excluded, to every viewer", () => {
    expect(nextLine(input({ grade: "safety", column: "person-verifies", originators: ["ben", "ana"], otherQualifiedVerifier: false })))
      .toEqual({ tone: "block", text: "Needs a second qualified person. Originators cannot verify their own work: ben, ana" });
    expect(nextLine(input({ column: "person-verifies", originators: [], otherQualifiedVerifier: false })).text).toBe("Needs a second qualified person");
  });
  it("uses the verified value it is given, not one recomputed from the list", () => {
    // The list holds a pass, but the caller says it could not tell: the column is Needs signature, not Person verifies.
    const base = input({ column: "person-verifies", originators: ["ben"], otherQualifiedVerifier: false });
    const passed: PersonVerificationEntry = { id: "pv1", package_id: base.pkg.id, package_revision: base.pkg.revision, outcome: "pass", covers_current_subject: true, verifier_member_id: "m", criteria: [], recorded_at: "2026-10-22T10:00:00Z" } as unknown as PersonVerificationEntry;
    expect(nextLine({ ...base, verified: null, verifications: [passed] }).tone).not.toBe("block");
    expect(nextLine({ ...base, verified: false, verifications: [passed] }).tone).toBe("block");
  });
  it("is not blocked when another qualified person exists", () => {
    expect(nextLine(input({ column: "person-verifies", originators: ["ben"], otherQualifiedVerifier: true })).tone).toBe("wait");
  });
  it("puts the verification before an allowed Accept on unverified independent-check work", () => {
    const acts = [allowed("accept", "Accept"), allowed("accept-with-findings", "Accept with findings")];
    expect(nextLine(input({ column: "person-verifies", actions: acts }))).toEqual({ tone: "wait", text: "Waiting on a person verification" });
    // Unknown verification state is not a pass either.
    expect(nextLine(input({ column: "person-verifies", actions: acts, verified: null })).text).not.toMatch(/^Accept/);
    // Other allowed actions still show.
    expect(nextLine(input({ column: "person-verifies", actions: [...acts, allowed("return", "Return")] })).text).toBe("Return");
  });
  it("is not blocked once the work is verified", () => {
    const v = [{ package_revision: 0, outcome: "pass", covers_current_subject: true }] as PersonVerificationEntry[];
    const out = nextLine(input({ column: "person-verifies", originators: ["ben"], otherQualifiedVerifier: false, verifications: v, actions: [allowed("accept", "Accept")] }));
    expect(out).toEqual({ tone: "needs", text: "Accept", command: "accept" });
  });
  it("waits with the refusal reason when nothing is allowed", () => {
    expect(nextLine(input({ actions: [refused("accept", "The agent pre-check has not finished")] }))).toEqual({ tone: "wait", text: "The agent pre-check has not finished" });
  });
  it("falls back to what the viewer lacks, then to a plain line", () => {
    expect(nextLine(input({ actions: [refused("accept", undefined, ["Safety grade"])] })).text).toBe("Missing: Safety grade");
    expect(nextLine(input()).text).toBe("Nothing to do yet");
  });
  it("says an agent is working while a run is active and nothing is allowed", () => {
    expect(nextLine(input({ status: "in-work", runActive: true, actions: [refused("accept", "no")] }))).toEqual({ tone: "wait", text: "An agent is working on it" });
  });
  it("blocks on a disputed pre-check", () => {
    const p = pkg({ status: "in-verification" });
    const office: OfficeItem[] = [{ kind: "dispute", package_id: p.id, package_revision: p.revision, title: "t", detail: "d", since: "2026-10-22T10:00:00Z" }];
    expect(nextLine({ ...input(), pkg: p, office }).tone).toBe("block");
  });
  it("reads accepted packages as ok", () => {
    expect(nextLine(input({ status: "accepted" })).tone).toBe("ok");
  });
});

describe("hasOtherQualified", () => {
  const member = (id: string, status: "active" | "suspended" | "retired" = "active") => ({ id, org_id: "o", user_name: id, display_name: id, status });
  const qual = (member_id: string, grades: string[], o: { revoked?: boolean; roles?: string[]; disciplines?: string[]; version?: number } = {}) =>
    ({ org_id: "o", member_id, version: o.version ?? 1, roles: o.roles ?? ["checker"], authorities: [], grades, disciplines: o.disciplines ?? [], revoked: o.revoked ?? false });
  const admin = (members: ReturnType<typeof member>[], quals: ReturnType<typeof qual>[]) =>
    ({ members, registry: { qualifications: quals } }) as unknown as AdminView;
  const safety = { grade: "safety" };

  it("counts an active member with a verify role who covers the grade and is not an originator", () => {
    expect(hasOtherQualified(admin([member("me"), member("you")], [qual("you", ["safety"])]), safety, new Set(["me"]))).toBe(true);
  });
  it("ignores originators, other grades, revoked records and inactive members", () => {
    const a = admin([member("me"), member("b"), member("c"), member("d", "suspended")], [qual("me", ["safety"]), qual("b", ["material"]), qual("c", ["safety"], { revoked: true }), qual("d", ["safety"])]);
    expect(hasOtherQualified(a, safety, new Set(["me"]))).toBe(false);
  });
  it("excludes every originator, not only the viewer", () => {
    const a = admin([member("me"), member("ana"), member("you")], [qual("ana", ["safety"]), qual("you", ["safety"])]);
    expect(hasOtherQualified(a, safety, new Set(["ana", "you"]))).toBe(false);
    expect(hasOtherQualified(a, safety, new Set(["ana"]))).toBe(true);
  });
  it("needs a checker, approver or engineer in responsible charge role", () => {
    const only = (roles: string[]) => hasOtherQualified(admin([member("you")], [qual("you", ["safety"], { roles })]), safety, new Set());
    expect(only(["originator", "discipline-lead"])).toBe(false);
    for (const r of ["checker", "approver", "engineer-in-responsible-charge"]) expect(only([r])).toBe(true);
  });
  it("needs the package discipline for Safety and Material work, not for General service", () => {
    const a = admin([member("you")], [qual("you", ["safety", "general-service"], { disciplines: ["civil"] })]);
    expect(hasOtherQualified(a, { grade: "safety", discipline: "mechanical" }, new Set())).toBe(false);
    expect(hasOtherQualified(a, { grade: "safety", discipline: "civil" }, new Set())).toBe(true);
    expect(hasOtherQualified(a, { grade: "general-service", discipline: "mechanical" }, new Set())).toBe(true);
  });
  it("reads only the latest qualification version of each member", () => {
    const a = admin([member("you")], [qual("you", ["safety"], { version: 1 }), qual("you", ["safety"], { version: 2, revoked: true })]);
    expect(hasOtherQualified(a, safety, new Set())).toBe(false);
  });
});
