/**
 * Evidence dimensions and readiness answers (workbench specification 8 and 11.4; plan task 1.10).
 *
 * Contract values stay byte for byte in historical records; mapping version 1 reads them into the
 * dimensions completeness, outcome and disposition. Freshness and independence come from digests and
 * custody. A readiness answer is derived only after every dimension is enforced, by rules E-1 to E-5.
 * The kernel's own use of these rules (plan task 6.7) is a protected change; this module is the
 * single place the API derives answers until then.
 */

export const MAPPING_VERSION = 1;

export type Completeness = "executed" | "missing";
export type Outcome = "pass" | "fail" | "inconclusive" | "none";
export type Disposition = "none" | "approved-disposition" | "approved-na-basis" | "deferred";
export type Freshness = "current" | "stale";
export type Answer = "YES" | "YES BY APPROVED DISPOSITION" | "N/A WITH APPROVED BASIS" | "NO";

/** The record a contract value came from. */
export type Source = "evidence-item" | "verification-record" | "check-result" | "criterion-result";

export interface Mapped { completeness: Completeness; outcome: Outcome; disposition: Disposition }

/**
 * Mapping version 1 (specification 8). A deferral needs a recorded reason; without one the value is
 * not a deferral the mapping recognizes, and it reads as missing with no disposition.
 */
export function mapV1(source: Source, value: string, reason?: string): Mapped {
  const deferred = (): Mapped => ({ completeness: "missing", outcome: "none", disposition: reason?.trim() ? "deferred" : "none" });
  switch (source) {
    case "evidence-item":
      if (value === "pass") return { completeness: "executed", outcome: "pass", disposition: "none" };
      if (value === "open") return { completeness: "missing", outcome: "none", disposition: "none" };
      if (value === "deferred") return deferred();
      break;
    case "verification-record":
      if (value === "pass" || value === "fail" || value === "inconclusive") return { completeness: "executed", outcome: value, disposition: "none" };
      break;
    case "check-result":
    case "criterion-result":
      if (value === "pass" || value === "fail" || value === "inconclusive") return { completeness: "executed", outcome: value, disposition: "none" };
      if (value === "open") return { completeness: "missing", outcome: "none", disposition: "none" };
      if (value === "deferred") return deferred();
      break;
  }
  throw new Error(`mapping version 1 has no row for ${source} "${value}"`);
}

/** The five coupling axes of a custody profile. */
export const AXES = ["actor", "context", "mechanism", "authority", "resource"] as const;
export type Axis = (typeof AXES)[number];
export type Coupling = "independent" | "shared" | "coupled" | "unknown";

export interface Independence { separated: boolean; unseparated: string[] }

/**
 * Independence from custody (E-5): every axis must be independent and the verifier's baseline must
 * differ from the author's. Shared, coupled and unknown axes are not separated; an empty custody set
 * proves nothing, so it is not separated either. Self evidence is never decisive.
 */
export function independenceOf(custody: Partial<Record<Axis, Coupling>>[], baselines?: { author?: string; verifier?: string }): Independence {
  const unseparated: string[] = [];
  if (custody.length === 0) unseparated.push("no custody was recorded");
  for (const axis of AXES) {
    const values = custody.map((c) => c[axis] ?? "unknown");
    const worst = values.find((v) => v !== "independent");
    if (custody.length && worst) unseparated.push(`${axis} is ${worst}`);
  }
  if (!baselines?.author || !baselines?.verifier) unseparated.push("the author or verifier baseline is unknown");
  else if (baselines.author === baselines.verifier) unseparated.push("the verifier is the author's own baseline");
  return { separated: unseparated.length === 0, unseparated };
}

/** One criterion's evidence on every dimension, and what its grade requires. */
export interface CriterionEvidence {
  criterion_id: string;
  /** Whether every check behind it is mandatory; an optional criterion may take a disposition on an inconclusive result. */
  mandatory: boolean;
  completeness: Completeness;
  outcome: Outcome;
  disposition: Disposition;
  freshness: Freshness;
  independence: Independence;
  /** Whether the grade requires separated independence for a positive answer. */
  independence_required: boolean;
  /** Whether the evidence the result cites is retained and verifies. */
  evidence_retained: boolean;
}

export interface Readiness { criterion_id: string; answer: Answer; reasons: string[]; mapping_version: number }

/** The readiness answer for one criterion (E-1, E-2, E-5). Anything not positive is NO, with reasons. */
export function answer(e: CriterionEvidence): Readiness {
  const reasons: string[] = [];
  const no = () => ({ criterion_id: e.criterion_id, answer: "NO" as const, reasons, mapping_version: MAPPING_VERSION });
  const fresh = e.freshness === "current";
  if (!fresh) reasons.push("an input or basis changed since the evidence was produced");

  // N/A with an approved basis needs no executed evidence, and so no independence; it still needs current freshness.
  if (e.disposition === "approved-na-basis") {
    return fresh ? { criterion_id: e.criterion_id, answer: "N/A WITH APPROVED BASIS", reasons, mapping_version: MAPPING_VERSION } : no();
  }
  // E-1: missing results and missing retained evidence are never waivable, by any disposition.
  if (e.completeness === "missing") {
    reasons.push(e.disposition === "deferred" ? "the check was deferred; a deferral is never a result" : "a required result is missing");
    return no();
  }
  if (!e.evidence_retained) {
    reasons.push("the evidence the result cites is not retained or does not verify");
    return no();
  }
  if (e.independence_required && !e.independence.separated) reasons.push(`not independent: ${e.independence.unseparated.join("; ")}`);
  const positive = fresh && (!e.independence_required || e.independence.separated);

  if (e.outcome === "pass") return positive ? { criterion_id: e.criterion_id, answer: "YES", reasons, mapping_version: MAPPING_VERSION } : no();
  if (e.outcome === "fail") {
    if (e.disposition !== "approved-disposition") { reasons.push("the result failed and has no approved disposition"); return no(); }
    return positive ? { criterion_id: e.criterion_id, answer: "YES BY APPROVED DISPOSITION", reasons, mapping_version: MAPPING_VERSION } : no();
  }
  if (e.outcome === "inconclusive") {
    // A mandatory inconclusive check stays blocking, as the kernel's required_checks_complete does.
    if (e.mandatory) { reasons.push("a mandatory check was inconclusive; no disposition can clear it"); return no(); }
    if (e.disposition !== "approved-disposition") { reasons.push("the optional check was inconclusive and has no approved disposition"); return no(); }
    return positive ? { criterion_id: e.criterion_id, answer: "YES BY APPROVED DISPOSITION", reasons, mapping_version: MAPPING_VERSION } : no();
  }
  reasons.push("no outcome was recorded");
  return no();
}

/**
 * Aggregation over a gate or package (E-4): NO if any criterion is NO; otherwise YES BY APPROVED
 * DISPOSITION if any is; otherwise N/A WITH APPROVED BASIS if every one is; otherwise YES. A set with
 * no applicable criteria is NO unless an N/A basis is approved for the set.
 */
export function aggregate(answers: Answer[], setBasisApproved = false): Answer {
  if (answers.length === 0) return setBasisApproved ? "N/A WITH APPROVED BASIS" : "NO";
  if (answers.includes("NO")) return "NO";
  if (answers.includes("YES BY APPROVED DISPOSITION")) return "YES BY APPROVED DISPOSITION";
  if (answers.every((a) => a === "N/A WITH APPROVED BASIS")) return "N/A WITH APPROVED BASIS";
  return "YES";
}

/**
 * Combines several results for one criterion (mixed and conflicting sets). Executed only when every
 * result executed and there is at least one; the outcome is the most adverse: fail, then
 * inconclusive, then pass.
 */
export function combine(results: Mapped[]): Mapped {
  if (results.length === 0 || results.some((r) => r.completeness === "missing")) {
    const deferred = results.some((r) => r.disposition === "deferred");
    return { completeness: "missing", outcome: "none", disposition: deferred ? "deferred" : "none" };
  }
  const outcomes = results.map((r) => r.outcome);
  const outcome: Outcome = outcomes.includes("fail") ? "fail" : outcomes.includes("inconclusive") ? "inconclusive" : outcomes.includes("pass") ? "pass" : "none";
  return { completeness: "executed", outcome, disposition: "none" };
}

/**
 * Whether an accept with findings may cover these criteria (E-3): only completed adverse results the
 * floors allow, never incompleteness. Returns the reasons it may not.
 */
export function acceptWithFindingsBlockers(criteria: Pick<CriterionEvidence, "criterion_id" | "completeness" | "evidence_retained" | "mandatory" | "outcome">[]): string[] {
  const out: string[] = [];
  for (const c of criteria) {
    if (c.completeness === "missing") out.push(`${c.criterion_id}: a result is missing`);
    else if (!c.evidence_retained) out.push(`${c.criterion_id}: its evidence is not retained`);
    else if (c.mandatory && c.outcome === "inconclusive") out.push(`${c.criterion_id}: a mandatory check was inconclusive`);
  }
  return out;
}
