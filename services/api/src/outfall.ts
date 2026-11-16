import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { callerFor } from "./admin.js";
import { command } from "./commands/executor.js";
import type { Db } from "./db/index.js";
import { appendEvent } from "./events.js";
import { Refusal } from "./refusal.js";
import { HOST_GIT_ARGS, type WorkspaceMode, createCheckpoint, hostGitEnv } from "./repos.js";

const execFileAsync = promisify(execFile);

export interface FreezeResult {
  checkpoint_ref: string;
  commit_sha: string;
  tree_sha: string;
  manifest_digest: string;
  file_count: number;
}

export interface OutfallVerdict {
  id: string;
  org_id?: string;
  package_id: string;
  freeze_digest: string;
  signer_id: string;
  status: "accepted" | "rejected";
  decided_at: string;
}

export interface OutfallClearance {
  id: string;
  org_id?: string;
  verdict_id: string;
  package_id: string;
  freeze_digest: string;
  mode: WorkspaceMode;
  target: string;
  authorizer_id: string;
  cleared_at: string;
}

export interface ControlledRecord {
  id: string;
  org_id?: string;
  package_id: string;
  mode: WorkspaceMode;
  freeze_digest: string;
  verdict_id: string;
  clearance_id: string;
  target: string;
  external_ref: string;
  artifact_digest: string;
  record_digest: string;
  recorded_at: string;
}

/**
 * Non-destructive Merkle Freeze: captures a private temp-index checkpoint and computes
 * a deterministic SHA-256 manifest digest over the frozen git tree.
 */
export async function freezeWorkspace(opts: {
  repoDir: string;
  label?: string;
  workspaceRoot?: string;
}): Promise<FreezeResult> {
  const cp = await createCheckpoint({
    repoDir: opts.repoDir,
    ...(opts.workspaceRoot !== undefined ? { workspaceRoot: opts.workspaceRoot } : {}),
    label: opts.label ?? "freeze",
  });
  const trimmed = opts.repoDir.trim();
  const safeCwd = trimmed.startsWith("~") ? trimmed.replace(/^~(?=\/|$)/, homedir()) : trimmed;
  const { stdout } = await execFileAsync(
    "git",
    [...HOST_GIT_ARGS, "ls-tree", "-r", "--full-tree", cp.tree_sha],
    { cwd: safeCwd, env: hostGitEnv(opts.workspaceRoot), timeout: 25_000, maxBuffer: 32 * 1024 * 1024 },
  );
  const entries = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
  const manifestDigest = createHash("sha256").update(entries.join("\n")).digest("hex");
  return {
    checkpoint_ref: cp.ref,
    commit_sha: cp.commit_sha,
    tree_sha: cp.tree_sha,
    manifest_digest: manifestDigest,
    file_count: entries.length,
  };
}

/** Stage 1 of Governed Outfall: technical Verdict bound to a frozen Merkle digest. */
export function recordVerdict(opts: {
  packageId: string;
  freezeDigest: string;
  signerId: string;
  status: "accepted" | "rejected";
}): OutfallVerdict {
  if (!opts.packageId.trim() || !opts.freezeDigest.trim() || !opts.signerId.trim()) {
    throw new Refusal(400, "invalid-verdict", "packageId, freezeDigest, and signerId are required.");
  }
  return {
    id: `vrd_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
    package_id: opts.packageId,
    freeze_digest: opts.freezeDigest,
    signer_id: opts.signerId,
    status: opts.status,
    decided_at: new Date().toISOString(),
  };
}

/** Stage 2 of Governed Outfall: target-bound Clearance (Software PR or Capital Transmittal). */
export function issueClearance(opts: {
  verdict: OutfallVerdict;
  mode: WorkspaceMode;
  target: string;
  authorizerId: string;
}): OutfallClearance {
  if (opts.verdict.status !== "accepted") {
    throw new Refusal(409, "verdict-not-accepted", "Cannot issue outfall clearance for a rejected verdict.");
  }
  if (!opts.target.trim() || !opts.authorizerId.trim()) {
    throw new Refusal(400, "invalid-clearance", "target and authorizerId are required.");
  }
  return {
    id: `clr_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
    verdict_id: opts.verdict.id,
    package_id: opts.verdict.package_id,
    freeze_digest: opts.verdict.freeze_digest,
    mode: opts.mode,
    target: opts.target.trim(),
    authorizer_id: opts.authorizerId,
    cleared_at: new Date().toISOString(),
  };
}

/** Stage 3 of Governed Outfall: immutable ControlledRecord binding external PR or ZIP manifest. */
export function recordApplication(opts: {
  clearance: OutfallClearance;
  externalRef: string;
  artifactDigest: string;
}): ControlledRecord {
  if (!opts.externalRef.trim() || !opts.artifactDigest.trim()) {
    throw new Refusal(400, "invalid-application", "externalRef and artifactDigest are required.");
  }
  const recorded_at = new Date().toISOString();
  const payload = [
    opts.clearance.package_id,
    opts.clearance.mode,
    opts.clearance.freeze_digest,
    opts.clearance.verdict_id,
    opts.clearance.id,
    opts.clearance.target,
    opts.externalRef.trim(),
    opts.artifactDigest.trim(),
    recorded_at,
  ].join("|");
  const record_digest = createHash("sha256").update(payload).digest("hex");
  return {
    id: `rec_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
    package_id: opts.clearance.package_id,
    mode: opts.clearance.mode,
    freeze_digest: opts.clearance.freeze_digest,
    verdict_id: opts.clearance.verdict_id,
    clearance_id: opts.clearance.id,
    target: opts.clearance.target,
    external_ref: opts.externalRef.trim(),
    artifact_digest: opts.artifactDigest.trim(),
    record_digest,
    recorded_at,
  };
}

/**
 * Governed Outfall HTTP routes (Stage 1 Verdict -> Stage 2 Clearance -> Stage 3 Application).
 * Durable across restarts via immutable records appended to the Postgres `events` chain.
 */
export function outfallRoutes(
  app: FastifyInstance,
  db: Db,
  person: (req: FastifyRequest) => Promise<string>,
): void {
  app.post<{
    Body: { package_id?: string; freeze_digest?: string; status?: string };
  }>("/outfall/verdict", async (req) => {
    const signerId = await person(req);
    const caller = await callerFor(db, signerId);
    const body = req.body ?? {};
    if (body.status !== "accepted" && body.status !== "rejected") {
      throw new Refusal(400, "invalid-status", "status must be 'accepted' or 'rejected'.");
    }
    const v: OutfallVerdict = {
      ...recordVerdict({
        packageId: body.package_id ?? "",
        freezeDigest: body.freeze_digest ?? "",
        signerId,
        status: body.status,
      }),
      org_id: caller.orgId,
    };
    await command(db, "outfall.verdict", (c) =>
      appendEvent(c, "outfall.verdict", v.id, { kind: "human", id: signerId }, { verdict: v }),
    );
    return { ok: true, verdict: v };
  });

  app.post<{
    Body: { verdict_id?: string; mode?: string; target?: string };
  }>("/outfall/clearance", async (req) => {
    const authorizerId = await person(req);
    const caller = await callerFor(db, authorizerId);
    const body = req.body ?? {};
    if (body.mode !== "software" && body.mode !== "capital-projects") {
      throw new Refusal(400, "invalid-mode", "mode must be 'software' or 'capital-projects'.");
    }
    const verdictRow = await db.query<{ verdict: OutfallVerdict }>(
      "select body->'data'->'verdict' as verdict from events where body->>'type' = 'outfall.verdict' and body->>'subject' = $1 and body->'data'->'verdict'->>'org_id' = $2 limit 1",
      [body.verdict_id ?? "", caller.orgId],
    );
    const verdict = verdictRow.rows[0]?.verdict;
    if (!verdict) {
      throw new Refusal(404, "verdict-not-found", `Verdict not found: ${body.verdict_id ?? ""}`);
    }
    const c: OutfallClearance = {
      ...issueClearance({
        verdict,
        mode: body.mode,
        target: body.target ?? "",
        authorizerId,
      }),
      org_id: caller.orgId,
    };
    await command(db, "outfall.clearance", (txc) =>
      appendEvent(txc, "outfall.clearance", c.id, { kind: "human", id: authorizerId }, { clearance: c }),
    );
    return { ok: true, clearance: c };
  });

  app.post<{
    Body: { clearance_id?: string; external_ref?: string; artifact_digest?: string };
  }>("/outfall/apply", async (req) => {
    const actorId = await person(req);
    const caller = await callerFor(db, actorId);
    const body = req.body ?? {};
    const clrRow = await db.query<{ clearance: OutfallClearance }>(
      "select body->'data'->'clearance' as clearance from events where body->>'type' = 'outfall.clearance' and body->>'subject' = $1 and body->'data'->'clearance'->>'org_id' = $2 limit 1",
      [body.clearance_id ?? "", caller.orgId],
    );
    const clearance = clrRow.rows[0]?.clearance;
    if (!clearance) {
      throw new Refusal(404, "clearance-not-found", `Clearance not found: ${body.clearance_id ?? ""}`);
    }
    const rec: ControlledRecord = {
      ...recordApplication({
        clearance,
        externalRef: body.external_ref ?? "",
        artifactDigest: body.artifact_digest ?? "",
      }),
      org_id: caller.orgId,
    };
    await command(db, "outfall.application", (txc) =>
      appendEvent(txc, "outfall.application", rec.id, { kind: "human", id: actorId }, { record: rec }),
    );
    return { ok: true, record: rec };
  });

  app.get("/outfall/records", async (req) => {
    const caller = await callerFor(db, await person(req));
    const r = await db.query<{ record: ControlledRecord }>(
      "select body->'data'->'record' as record from events where body->>'type' = 'outfall.application' and body->'data'->'record'->>'org_id' = $1 order by seq desc limit 200",
      [caller.orgId],
    );
    return { records: r.rows.map((x) => x.record) };
  });
}
