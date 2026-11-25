import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Offline check of a change record's evidence manifest (`pnpm cr verify <record-dir>`).
 *
 * Git keeps the digest and the manifest row. The payload may live in the record (older
 * records) or in the evidence store named by the manifest. Three outcomes, and never a
 * silent pass: missing payload bytes are incomplete, a matching digest is verified, a
 * differing digest is tampered. Incomplete and tampered never say verified.
 */

export type EvidenceOutcome = "verified" | "incomplete" | "tampered";

export interface EvidenceReport {
  outcome: EvidenceOutcome;
  /** 0 only when every row verified. 1 otherwise. Never 0 for incomplete or tampered. */
  code: 0 | 1;
  lines: string[];
}

interface ManifestFile {
  path: string;
  sha256: string;
}

interface Manifest {
  store: string;
  files: ManifestFile[];
}

function readManifest(recordDir: string): { manifest: Manifest } | { error: string } {
  const path = join(recordDir, "evidence", "manifest.json");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { error: `${path} cannot be read, so this record's offloaded evidence cannot be checked.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: `${path} is not JSON.` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("store" in parsed) || !("files" in parsed)) {
    return { error: `${path} is not a manifest object.` };
  }
  const store = parsed.store;
  const files = parsed.files;
  if (typeof store !== "string" || !store.trim()) return { error: `${path} has no store to restore from.` };
  if (!Array.isArray(files) || files.length === 0) return { error: `${path} lists no files.` };
  const rows: ManifestFile[] = [];
  for (const row of files) {
    if (!row || typeof row !== "object" || Array.isArray(row) || !("path" in row) || !("sha256" in row)) {
      return { error: `${path} has a file row that is not an object.` };
    }
    const rel = row.path;
    const dig = row.sha256;
    if (typeof rel !== "string" || !rel || rel.startsWith("/") || rel.includes("..")) {
      return { error: `${path} has a file path that is empty, absolute, or walks upward.` };
    }
    if (typeof dig !== "string" || !/^[0-9a-f]{64}$/.test(dig)) {
      return { error: `${path} row ${rel} has no 64-hex SHA-256 digest.` };
    }
    rows.push({ path: rel, sha256: dig });
  }
  return { manifest: { store, files: rows } };
}

function readPayload(recordDir: string, storeRoot: string | undefined, row: ManifestFile): Buffer | null {
  const inRecord = join(recordDir, row.path);
  try {
    if (statSync(inRecord).isFile()) return readFileSync(inRecord);
  } catch {
    /* not in the record; try the store */
  }
  if (!storeRoot) return null;
  const byDigest = join(storeRoot, row.sha256);
  try {
    if (statSync(byDigest).isFile()) return readFileSync(byDigest);
  } catch {
    /* absent */
  }
  return null;
}

/** Check one record directory. `storeRoot` is the local copy of the evidence store, if the caller has one. */
export function verifyEvidenceRecord(recordDir: string, storeRoot?: string): EvidenceReport {
  const found = readManifest(recordDir);
  if ("error" in found) {
    return { outcome: "tampered", code: 1, lines: [`TAMPERED  ${found.error}`] };
  }
  const lines: string[] = [];
  let outcome: EvidenceOutcome = "verified";
  for (const row of found.manifest.files) {
    const bytes = readPayload(recordDir, storeRoot, row);
    if (!bytes) {
      outcome = outcome === "tampered" ? "tampered" : "incomplete";
      lines.push(`INCOMPLETE  ${row.path}: payload bytes are missing. Restore from ${found.manifest.store} (digest ${row.sha256}).`);
      continue;
    }
    const got = createHash("sha256").update(bytes).digest("hex");
    if (got !== row.sha256) {
      outcome = "tampered";
      lines.push(`TAMPERED  ${row.path}: digest ${got} does not match the manifest row ${row.sha256}.`);
      continue;
    }
    lines.push(`VERIFIED  ${row.path}: digest ${row.sha256} matches.`);
  }
  if (outcome !== "verified") {
    return { outcome, code: 1, lines: lines.filter((l) => !l.startsWith("VERIFIED")) };
  }
  return { outcome, code: 0, lines };
}

/** True when `path` is a change-record directory or its manifest, rather than an inclusion-proof file. */
export function isEvidenceRecordArg(path: string): boolean {
  try {
    if (statSync(path).isDirectory()) return true;
  } catch {
    return false;
  }
  return path.endsWith("evidence/manifest.json") || path.endsWith(`${join("evidence", "manifest.json")}`);
}

export function evidenceRecordDir(path: string): string {
  const abs = resolve(path);
  if (abs.endsWith("evidence/manifest.json") || abs.endsWith(`${join("evidence", "manifest.json")}`)) {
    return resolve(abs, "..", "..");
  }
  return abs;
}
