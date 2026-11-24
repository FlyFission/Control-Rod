import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { Refusal } from "./refusal.js";
import {
  HOST_GIT_ARGS,
  type WorkspaceMode,
  createCheckpoint,
  defaultWorkspaceRoot,
  hostGitEnv,
  resolveSafeWorkspaceRoot,
  resolveWithoutSymlinks,
} from "./repos.js";

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

function canonicalHome(): string {
  const h = homedir();
  try {
    return realpathSync(h);
  } catch {
    return h;
  }
}

/**
 * Streams NUL-delimited, unquoted `git ls-tree` output directly into SHA-256 so large
 * repositories never hit `execFile` buffer limits and filenames with spaces or non-ASCII bytes
 * hash losslessly and deterministically.
 */
function hashFrozenTree(
  treeSha: string,
  cwd: string,
  ceilingDir: string,
): Promise<{ manifestDigest: string; fileCount: number }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "git",
      [...HOST_GIT_ARGS, "-c", "core.quotePath=false", "ls-tree", "-r", "-z", "--full-tree", treeSha],
      { cwd, env: hostGitEnv(ceilingDir), stdio: ["ignore", "pipe", "pipe"] },
    );
    const hash = createHash("sha256");
    let fileCount = 0;
    let trailingBytes = false;
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;
    let settled = false;

    const finishError = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(err);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finishError(new Error("git ls-tree timed out"));
    }, 25_000);

    child.stdout.on("data", (chunk: Buffer) => {
      hash.update(chunk);
      for (let i = 0; i < chunk.length; i += 1) {
        if (chunk[i] === 0) {
          fileCount += 1;
          trailingBytes = false;
        } else {
          trailingBytes = true;
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrBytes < 16_384) {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      }
    });
    child.on("error", (err) => finishError(err));
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const detail = Buffer.concat(stderrChunks).toString("utf8").trim();
        rejectPromise(new Error(detail || `git ls-tree exited with ${signal ?? code}`));
        return;
      }
      if (trailingBytes) {
        fileCount += 1;
      }
      resolvePromise({ manifestDigest: hash.digest("hex"), fileCount });
    });
  });
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
    label: opts.label ?? "freeze",
    ...(opts.workspaceRoot !== undefined ? { workspaceRoot: opts.workspaceRoot } : {}),
  });
  const ceilingDir =
    opts.workspaceRoot !== undefined
      ? resolveSafeWorkspaceRoot(opts.workspaceRoot)
      : defaultWorkspaceRoot();
  const expandedRepo = opts.repoDir.trim().replace(/^~(?=\/|$)/, canonicalHome());
  const resolvedRepoDir =
    opts.workspaceRoot !== undefined
      ? resolveWithoutSymlinks(expandedRepo, ceilingDir)
      : resolveWithoutSymlinks(expandedRepo);
  const { manifestDigest, fileCount } = await hashFrozenTree(cp.tree_sha, resolvedRepoDir, ceilingDir);
  return {
    checkpoint_ref: cp.ref,
    commit_sha: cp.commit_sha,
    tree_sha: cp.tree_sha,
    manifest_digest: manifestDigest,
    file_count: fileCount,
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
