import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { promisify } from "node:util";
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
  package_id: string;
  freeze_digest: string;
  signer_id: string;
  status: "accepted" | "rejected";
  decided_at: string;
}

export interface OutfallClearance {
  id: string;
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
