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
  return { pkg: p, actions: [], office, verifications: [], viewerIsOriginator: false, otherQualifiedVerifier: true, runActive: false, ...rest };
}

describe("nextLine", () => {
  it("names the first allowed decision as the next line", () => {
    expect(nextLine(input({ actions: [refused("accept"), allowed("release", "Release")] }))).toEqual({ tone: "needs", text: "Release", command: "release" });
  });
  it("says who is missing when the viewer originated Safety work and nobody else is qualified", () => {
    expect(nextLine(input({ grade: "safety", column: "person-verifies", viewerIsOriginator: true, otherQualifiedVerifier: false })))
      .toEqual({ tone: "block", text: "Needs a second qualified person" });
  });
  it("uses the verified value it is given, not one recomputed from the list", () => {
    // The list holds a pass, but the caller says it could not tell: the column is Needs signature, not Person verifies.
    const base = input({ column: "person-verifies", viewerIsOriginator: true, otherQualifiedVerifier: false });
    const passed: PersonVerificationEntry = { id: "pv1", package_id: base.pkg.id, package_revision: base.pkg.revision, outcome: "pass", verifier_member_id: "m", criteria: [], recorded_at: "2026-10-22T10:00:00Z" } as unknown as PersonVerificationEntry;
    expect(nextLine({ ...base, verified: null, verifications: [passed] }).text).not.toBe("Needs a second qualified person");
    expect(nextLine({ ...base, verified: false, verifications: [passed] }).text).toBe("Needs a second qualified person");
  });
  it("is not blocked when another qualified person exists", () => {
    expect(nextLine(input({ column: "person-verifies", viewerIsOriginator: true, otherQualifiedVerifier: true })).tone).toBe("wait");
  });
  it("is not blocked once the work is verified", () => {
    const v = [{ package_revision: 0, outcome: "pass" }] as PersonVerificationEntry[];
    const out = nextLine(input({ column: "person-verifies", viewerIsOriginator: true, otherQualifiedVerifier: false, verifications: v, actions: [allowed("accept", "Accept")] }));
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
  const qual = (member_id: string, grades: string[], revoked = false) => ({ org_id: "o", member_id, version: 1, roles: [], authorities: [], grades, disciplines: [], revoked });
  const admin = (members: ReturnType<typeof member>[], quals: ReturnType<typeof qual>[]) =>
    ({ members, registry: { qualifications: quals } }) as unknown as AdminView;

  it("counts an active other member who covers the grade", () => {
    expect(hasOtherQualified(admin([member("me"), member("you")], [qual("you", ["safety"])]), "me", "safety")).toBe(true);
  });
  it("ignores the viewer, other grades, revoked records and inactive members", () => {
    const a = admin([member("me"), member("b"), member("c"), member("d", "suspended")], [qual("me", ["safety"]), qual("b", ["material"]), qual("c", ["safety"], true), qual("d", ["safety"])]);
    expect(hasOtherQualified(a, "me", "safety")).toBe(false);
  });
});
