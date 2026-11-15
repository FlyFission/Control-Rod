import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Refusal } from "./refusal.js";

const execFileAsync = promisify(execFile);

export type MaterializeStrategy = "worktree" | "fresh-clone" | "branch";

export interface LocalRepoInfo {
  name: string;
  path: string;
  branch: string;
  remote_url: string | null;
  dirty: boolean;
}

export interface GithubRepoInfo {
  name_with_owner: string;
  default_branch: string;
  is_private: boolean;
  url: string;
  updated_at: string;
}

const SAFE_OWNER_REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SAFE_LOCAL_NAME = /^[A-Za-z0-9._-]+$/;
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

export function defaultWorkspaceRoot(): string {
  return resolve(process.env.CONTROLROD_WORKSPACE_ROOT || join(homedir(), "projects"));
}

/** Ensures user-supplied workspace_root stays within the user's home directory. */
export function resolveSafeWorkspaceRoot(requested?: string): string {
  const home = resolve(homedir());
  const candidate = requested?.trim() ? resolve(requested.trim().replace(/^~(?=\/|$)/, home)) : defaultWorkspaceRoot();
  const rel = relative(home, candidate);
  if (rel.startsWith("..") || rel.includes("..\\")) {
    throw new Refusal(400, "invalid-workspace-root", `Workspace root must stay inside ${home}`);
  }
  return candidate;
}

function assertValidBranch(branch: string, label = "branch"): string {
  const b = branch.trim();
  if (!SAFE_BRANCH.test(b) || b.includes("..") || b.endsWith("/") || b.endsWith(".lock")) {
    throw new Refusal(400, "invalid-branch", `Invalid ${label} name: ${branch}`);
  }
  return b;
}

function safeSlug(branch: string): string {
  return branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "work";
}

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    ...(cwd ? { cwd } : {}),
    timeout: 25_000,
  });
  return stdout.trim();
}

async function gh(args: string[], timeout = 10_000): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, { timeout });
  return stdout.trim();
}

async function scanLocalRepos(root: string): Promise<LocalRepoInfo[]> {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const repos: LocalRepoInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const full = join(root, entry.name);
    if (!existsSync(join(full, ".git"))) continue;
    try {
      const [branch, remote, statusOut] = await Promise.all([
        git(["rev-parse", "--abbrev-ref", "HEAD"], full).catch(() => "HEAD"),
        git(["remote", "get-url", "origin"], full).catch(() => ""),
        git(["status", "--porcelain"], full).catch(() => ""),
      ]);
      repos.push({
        name: entry.name,
        path: full,
        branch,
        remote_url: remote || null,
        dirty: statusOut.length > 0,
      });
    } catch {
      // Skip unreadable directories
    }
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

async function listGithubRepos(): Promise<{ repos: GithubRepoInfo[]; error: string | null }> {
  try {
    const raw = await gh([
      "repo",
      "list",
      "--limit",
      "40",
      "--json",
      "nameWithOwner,defaultBranchRef,isPrivate,url,updatedAt",
    ]);
    const parsed = JSON.parse(raw) as Array<{
      nameWithOwner: string;
      defaultBranchRef?: { name?: string } | null;
      isPrivate: boolean;
      url: string;
      updatedAt: string;
    }>;
    return {
      repos: parsed.map((r) => ({
        name_with_owner: r.nameWithOwner,
        default_branch: r.defaultBranchRef?.name ?? "main",
        is_private: r.isPrivate,
        url: r.url,
        updated_at: r.updatedAt,
      })),
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not query GitHub CLI";
    return { repos: [], error: msg };
  }
}

export function repoRoutes(
  app: FastifyInstance,
  person: (req: FastifyRequest) => Promise<string>,
): void {
  app.get<{ Querystring: { workspace_root?: string } }>("/repos", async (req) => {
    await person(req);
    const workspaceRoot = resolveSafeWorkspaceRoot(req.query.workspace_root);
    const [local, ghResult] = await Promise.all([
      scanLocalRepos(workspaceRoot),
      listGithubRepos(),
    ]);
    return {
      workspace_root: workspaceRoot,
      local,
      github: ghResult.repos,
      github_error: ghResult.error,
    };
  });

  app.post<{
    Body: {
      repo?: string;
      branch?: string;
      base_branch?: string;
      strategy?: MaterializeStrategy;
      workspace_root?: string;
    };
  }>("/repos/materialize", async (req) => {
    await person(req);
    const body = req.body ?? {};
    const repo = (body.repo ?? "").trim();
    if (!SAFE_OWNER_REPO.test(repo) && !SAFE_LOCAL_NAME.test(repo)) {
      throw new Refusal(400, "invalid-repo", "Specify a GitHub repo (owner/name) or local repo folder name.");
    }
    const branch = assertValidBranch(body.branch ?? "", "branch");
    const baseBranch = body.base_branch?.trim() ? assertValidBranch(body.base_branch, "base_branch") : undefined;
    const strategy: MaterializeStrategy =
      body.strategy === "fresh-clone" || body.strategy === "branch" ? body.strategy : "worktree";
    const workspaceRoot = resolveSafeWorkspaceRoot(body.workspace_root);

    mkdirSync(workspaceRoot, { recursive: true });

    const isGithub = SAFE_OWNER_REPO.test(repo);
    const repoName = isGithub ? basename(repo) : repo;
    const baseCloneDir = join(workspaceRoot, repoName);

    // Ensure a local base clone exists when needed for worktree or branch strategy.
    const ensureBaseClone = async () => {
      if (existsSync(baseCloneDir) && statSync(baseCloneDir).isDirectory()) {
        return;
      }
      if (!isGithub) {
        throw new Refusal(404, "repo-not-found", `Local repository not found at ${baseCloneDir}`);
      }
      await gh(["repo", "clone", repo, baseCloneDir], 60_000);
    };

    try {
      if (strategy === "fresh-clone") {
        const targetDir = join(workspaceRoot, `${repoName}-${safeSlug(branch)}`);
        if (existsSync(targetDir)) {
          throw new Refusal(409, "workspace-exists", `Target folder already exists: ${targetDir}`);
        }
        if (isGithub) {
          await gh(["repo", "clone", repo, targetDir], 60_000);
        } else {
          if (!existsSync(baseCloneDir)) {
            throw new Refusal(404, "repo-not-found", `Local repository not found at ${baseCloneDir}`);
          }
          await git(["clone", baseCloneDir, targetDir]);
        }
        await git(["checkout", "-b", branch, ...(baseBranch ? [baseBranch] : [])], targetDir);
        return { ok: true, strategy, repo, branch, local_path: targetDir };
      }

      if (strategy === "branch") {
        await ensureBaseClone();
        const existing = await git(["branch", "--list", branch], baseCloneDir);
        if (existing) {
          await git(["checkout", branch], baseCloneDir);
        } else {
          await git(["checkout", "-b", branch, ...(baseBranch ? [baseBranch] : [])], baseCloneDir);
        }
        return { ok: true, strategy, repo, branch, local_path: baseCloneDir };
      }

      // Default: "worktree"
      await ensureBaseClone();
      await git(["fetch", "--all", "--prune"], baseCloneDir).catch(() => "");
      const worktreesRoot = join(workspaceRoot, ".worktrees", repoName);
      mkdirSync(worktreesRoot, { recursive: true });
      const targetDir = join(worktreesRoot, safeSlug(branch));
      if (existsSync(targetDir)) {
        throw new Refusal(409, "workspace-exists", `Worktree already exists at ${targetDir}`);
      }
      const existing = await git(["branch", "--list", branch], baseCloneDir);
      if (existing) {
        await git(["worktree", "add", targetDir, branch], baseCloneDir);
      } else {
        await git(
          ["worktree", "add", "-b", branch, targetDir, ...(baseBranch ? [baseBranch] : [])],
          baseCloneDir,
        );
      }
      return { ok: true, strategy, repo, branch, local_path: targetDir };
    } catch (err) {
      if (err instanceof Refusal) throw err;
      const msg = err instanceof Error ? err.message : "Git operation failed";
      throw new Refusal(400, "git-failed", msg);
    }
  });
}
