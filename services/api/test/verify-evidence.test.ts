import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyEvidenceRecord } from "../src/verify-evidence.js";

/** `pnpm cr verify <record-dir>` against an evidence manifest. Payloads may live in the store, not in git. */
const roots: string[] = [];

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(store: string, rows: { path: string; sha256: string }[]): string {
  const dir = mkdtempSync(join(tmpdir(), "cr-evidence-"));
  roots.push(dir);
  mkdirSync(join(dir, "evidence"));
  writeFileSync(join(dir, "evidence", "manifest.json"), JSON.stringify({ store, files: rows }));
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("pnpm cr verify evidence manifest", () => {
  it("names the missing payload and the store, and does not say verified", () => {
    const payload = Buffer.from("run log");
    const dir = record("evidence-mirror", [{ path: "evidence/run.log", sha256: digest(payload) }]);
    const r = verifyEvidenceRecord(dir);
    expect(r.outcome).toBe("incomplete");
    expect(r.code).toBe(1);
    expect(r.lines.join("\n")).toContain("INCOMPLETE  evidence/run.log");
    expect(r.lines.join("\n")).toContain("Restore from evidence-mirror");
    expect(r.lines.join("\n")).not.toContain("VERIFIED");
  });

  it("verifies when the store holds the bytes named by the digest", () => {
    const payload = Buffer.from("run log");
    const sha = digest(payload);
    const dir = record("evidence-mirror", [{ path: "evidence/run.log", sha256: sha }]);
    const store = mkdtempSync(join(tmpdir(), "cr-store-"));
    roots.push(store);
    writeFileSync(join(store, sha), payload);
    const r = verifyEvidenceRecord(dir, store);
    expect(r.outcome).toBe("verified");
    expect(r.code).toBe(0);
    expect(r.lines[0]).toContain(`VERIFIED  evidence/run.log: digest ${sha} matches.`);
  });

  it("says tampered, not verified, when the restored bytes do not match the row", () => {
    const claimed = digest(Buffer.from("run log"));
    const dir = record("evidence-mirror", [{ path: "evidence/run.log", sha256: claimed }]);
    const store = mkdtempSync(join(tmpdir(), "cr-store-"));
    roots.push(store);
    writeFileSync(join(store, claimed), Buffer.from("different bytes"));
    const r = verifyEvidenceRecord(dir, store);
    expect(r.outcome).toBe("tampered");
    expect(r.code).toBe(1);
    expect(r.lines.join("\n")).toContain("TAMPERED  evidence/run.log");
    expect(r.lines.join("\n")).not.toContain("VERIFIED");
  });

  it("drops a matching row's verified line when another row is missing", () => {
    const kept = Buffer.from("kept");
    const keptSha = digest(kept);
    const missing = digest(Buffer.from("gone"));
    const dir = record("evidence-mirror", [
      { path: "evidence/kept.log", sha256: keptSha },
      { path: "evidence/gone.log", sha256: missing },
    ]);
    writeFileSync(join(dir, "evidence", "kept.log"), kept);
    const r = verifyEvidenceRecord(dir);
    expect(r.outcome).toBe("incomplete");
    expect(r.code).toBe(1);
    expect(r.lines.join("\n")).toContain("INCOMPLETE  evidence/gone.log");
    expect(r.lines.join("\n")).not.toContain("VERIFIED");
  });
});
