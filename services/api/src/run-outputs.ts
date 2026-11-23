import { createHash } from "node:crypto";
import { command } from "./commands/executor.js";
import type { Db } from "./db/index.js";
import { appendEvent } from "./events.js";
import { Refusal } from "./refusal.js";
import { requireOwnedRun } from "./run-reads.js";

/** The text-only workspace preview uses the same bound as an individual pack text file. */
const PREVIEW_BYTES = 256 * 1024;
const INDEX_PAGE_SIZE = 200;

// The signed deliverable projection admits author output from succeeded runs. Checker evidence has a
// separate admission path. SCRAM quarantines and refused preparations are separate stores.
const REVIEWABLE_OUTPUTS = `from outputs o join runs r on r.id = o.run_id
  where o.run_id = $1 and o.package_id = $2 and o.package_revision = $3
    and r.role = 'author' and r.status = 'succeeded' and r.body->>'scram_id' is null`;

type OutputIdentity = { packageId: string; revision: number; runId: string; path: string };
type RecordedBytes = { bytes: Buffer; sha256: string };

/** Preserve the same read-time digest guard and mismatch record on both output surfaces. */
export async function verifyRecordedOutput(db: Db, output: OutputIdentity, row: RecordedBytes): Promise<void> {
  const actual = createHash("sha256").update(row.bytes).digest("hex");
  if (actual === row.sha256) return;
  await command(db, "output.record-mismatch", (c) =>
    appendEvent(c, "output.mismatch", output.packageId, { kind: "system", id: "control-plane" }, {
      revision: output.revision, run: output.runId, name: output.path, recorded: row.sha256, actual,
    }),
  );
  throw new Refusal(409, "output-changed", "This output changed since it was recorded, so it is not served. The mismatch is on the record.");
}

const declaredDigest = (value: string) => ({ algorithm: "sha256" as const, value });

export async function runOutputs(db: Db, orgId: string, packageId: string, runId: string, after = "") {
  const run = await requireOwnedRun(db, orgId, packageId, runId);
  if (run.role !== "author") return [];
  const { rows } = await db.query<{ name: string; sha256: string; size_bytes: number }>(
    `select o.name, o.sha256, octet_length(o.bytes) as size_bytes ${REVIEWABLE_OUTPUTS}
      and o.name > $4 order by o.name limit $5`,
    [runId, packageId, run.package_revision, after, INDEX_PAGE_SIZE],
  );
  return rows.map(({ name, sha256, size_bytes }) => ({ path: name, digest: declaredDigest(sha256), size_bytes }));
}

export async function runOutputPreview(db: Db, orgId: string, packageId: string, runId: string, path?: string) {
  const run = await requireOwnedRun(db, orgId, packageId, runId);
  if (typeof path !== "string" || !path) throw new Refusal(400, "invalid", "Choose an output path");
  const { rows } = await db.query<{ sha256: string; bytes: Buffer | null }>(
    `select o.sha256, case when octet_length(o.bytes) <= $5 then o.bytes end as bytes
      ${REVIEWABLE_OUTPUTS} and o.name = $4`,
    [runId, packageId, run.package_revision, path, PREVIEW_BYTES],
  );
  const row = rows[0];
  if (!row) throw new Refusal(404, "not-found", "No such recorded author output");
  if (row.bytes === null) throw new Refusal(400, "too-large", "This output is too large to preview as text");
  await verifyRecordedOutput(db, { packageId, revision: run.package_revision, runId, path }, { bytes: row.bytes, sha256: row.sha256 });

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(row.bytes);
  } catch {
    throw new Refusal(400, "invalid", "This output is not UTF-8 text");
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content))
    throw new Refusal(400, "invalid", "This output contains binary data");

  return { path, digest: declaredDigest(row.sha256), content };
}
