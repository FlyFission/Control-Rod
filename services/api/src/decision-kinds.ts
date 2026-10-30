import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { digest } from "./kernel.js";
import { checkSchema } from "./tenancy.js";

/**
 * Reads historical decisions as Platform Plan decision kinds (specification 5.5) through a
 * versioned mapping. The stored Decision, its kind and its signature challenge never change; the
 * reading is derived and cites the digest of the body it read.
 */

export type PlanDecisionKind = "release" | "methodology" | "verdict" | "clearance";
export type VerdictOutcome = "accept" | "accept-with-findings" | "return" | "reject";
export interface DecisionKindMapping { mapping_version: number; legacy_kind: string; plan_kind: PlanDecisionKind; verdict_outcome?: VerdictOutcome }
export interface DecisionReading { decision_id: string; decision_digest: { algorithm: "sha256"; value: string }; mapping_version: number; plan_kind: PlanDecisionKind; verdict_outcome?: VerdictOutcome }

const mappingsDir = fileURLToPath(new URL("../../../spec/mappings/", import.meta.url));

/** Loads one mapping version, refusing rows the contract rejects, duplicates or verdicts without an outcome. */
export function loadMapping(version: number): ReadonlyMap<string, DecisionKindMapping> {
  const doc = JSON.parse(readFileSync(`${mappingsDir}decision-kinds-v${version}.json`, "utf8")) as { rows: DecisionKindMapping[] };
  const rows = new Map<string, DecisionKindMapping>();
  for (const row of doc.rows) {
    checkSchema("DecisionKindMapping.json", row);
    if (row.mapping_version !== version) throw new Error(`row for ${row.legacy_kind} claims version ${row.mapping_version}`);
    if ((row.plan_kind === "verdict") !== (row.verdict_outcome !== undefined))
      throw new Error(`${row.legacy_kind}: a verdict outcome is required exactly for verdicts`);
    if (rows.has(row.legacy_kind)) throw new Error(`${row.legacy_kind} is mapped twice`);
    rows.set(row.legacy_kind, row);
  }
  return rows;
}

export const CURRENT_MAPPING_VERSION = 1;
const current = loadMapping(CURRENT_MAPPING_VERSION);

/** Reads one stored decision body. Unknown kinds refuse rather than guess. */
export function readDecision(body: { id: string; kind: string }, mapping: ReadonlyMap<string, DecisionKindMapping> = current): DecisionReading {
  const row = mapping.get(body.kind);
  if (!row) throw new Error(`decision ${body.id} has kind ${body.kind}, which mapping has no row for`);
  const reading: DecisionReading = {
    decision_id: body.id,
    decision_digest: { algorithm: "sha256", value: digest(body) },
    mapping_version: row.mapping_version,
    plan_kind: row.plan_kind,
  };
  if (row.verdict_outcome !== undefined) reading.verdict_outcome = row.verdict_outcome;
  checkSchema("DecisionReading.json", reading);
  return reading;
}
