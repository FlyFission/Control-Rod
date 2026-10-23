import type { Db, Tx } from "../db/index.js";
import { Refusal } from "../work.js";
import { rawSha256 } from "./basis.js";
export interface PublishedOutput {
  name: string;
  sha256: string;
  bytes: Buffer;
}
export async function authorOutputIntegrity(
  q: Db | Tx,
  runId: string,
  lock = false,
) {
  const outputs = (
    await q.query<PublishedOutput>(
      "select name,sha256,bytes from outputs where run_id=$1 order by name" +
        (lock ? " for share" : ""),
      [runId],
    )
  ).rows;
  const observed = outputs.map((o) => ({
    name: o.name,
    sha256: rawSha256(o.bytes),
  }));
  return {
    outputs,
    observed,
    intact:
      outputs.length > 0 &&
      outputs.every((o, i) => o.sha256 === observed[i]!.sha256),
  };
}
export async function requireAuthorOutputs(
  q: Db | Tx,
  runId: string,
  lock = false,
) {
  const integrity = await authorOutputIntegrity(q, runId, lock);
  if (!integrity.intact)
    throw new Refusal(
      409,
      "output-changed",
      "Author deliverables are missing or no longer match their recorded digests",
    );
  return integrity.outputs;
}
