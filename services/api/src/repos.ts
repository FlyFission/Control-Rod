import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
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

const SAFE_GIT_ENV_VARS = new Set([
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "GIT_SSH_VARIANT",
  "GIT_ASKPASS",
  "GIT_TERMINAL_PROMPT",
  "GIT_SSL_CAINFO",
  "GIT_SSL_CAPATH",
  "GIT_ALLOW_PROTOCOL",
  "GIT_HTTP_USER_AGENT",
  "GIT_CEILING_DIRECTORIES",
  "GIT_TEST_ASSUME_DIFFERENT_OWNER",
]);

const HOST_GIT_CONFIG_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["core.hooksPath", "/dev/null"],
  ["core.fsmonitor", "false"],
  ["core.pager", "cat"],
  ["protocol.ext.allow", "never"],
  ["protocol.file.allow", "user"],
  ["submodule.recurse", "false"],
  ["fetch.recurseSubmodules", "false"],
  ["merge.verifySignatures", "false"],
  ["commit.gpgsign", "false"],
  ["tag.gpgsign", "false"],
];

/**
 * Hardcoded git `-c` overrides passed to host `git` invocations so untrusted repository configs
 * cannot enable hooks, fsmonitor daemons, external protocols, submodules, or commit signing.
 */
export const HOST_GIT_ARGS: readonly string[] = HOST_GIT_CONFIG_PAIRS.flatMap(([k, v]) => ["-c", `${k}=${v}`]);

const GH_NETWORK_ALLOWLIST_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["protocol.allow", "never"],
  ["protocol.http.allow", "always"],
  ["protocol.https.allow", "always"],
  ["protocol.ssh.allow", "always"],
  ["protocol.git.allow", "always"],
];

/** Validates a GitHub `owner/name` or local repository folder identifier. */
export function isSafeRepoIdentifier(repo: string): boolean {
  if (!repo) return false;
  if (!SAFE_OWNER_REPO.test(repo) && !SAFE_LOCAL_NAME.test(repo)) return false;
  const segments = repo.split("/");
  return segments.every(
    (seg) => seg.length > 0 && seg !== "." && seg !== ".." && !seg.startsWith(".") && !seg.startsWith("-"),
  );
}

/** Checks path existence with lstat so dangling symlinks still report as existing. */
export function pathExistsAny(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function canonicalPathOrResolve(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function isWithinOrEqual(base: string, target: string): string | null {
  const rel = relative(base, target);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return rel;
  }
  return null;
}

/**
 * Resolves `targetPath` without traversing symlinks. When `ceilingBase` is provided, `ceilingBase`
 * is canonicalized first and only segments below it are checked for symlinks so symlinked system
 * ancestors above `$HOME` or the workspace root (e.g. `/var -> /private/var`) do not cause false refusals.
 */
export function resolveWithoutSymlinks(targetPath: string, ceilingBase?: string): string {
  const rawTarget = resolve(targetPath);
  let startDir: string;
  let relToWalk: string;
  let canonicalTarget: string;

  if (ceilingBase !== undefined) {
    const rawCeiling = resolve(ceilingBase);
    startDir = canonicalPathOrResolve(rawCeiling);
    const canonicalRel = isWithinOrEqual(startDir, rawTarget);
    if (canonicalRel !== null) {
      relToWalk = canonicalRel;
      canonicalTarget = rawTarget;
    } else {
      const lexicalRel = isWithinOrEqual(rawCeiling, rawTarget);
      if (lexicalRel === null) {
        throw new Refusal(400, "invalid-workspace-root", `Path must stay inside ${startDir}`);
      }
      relToWalk = lexicalRel;
      canonicalTarget = lexicalRel ? join(startDir, lexicalRel) : startDir;
    }
  } else {
    startDir = parse(rawTarget).root;
    relToWalk = rawTarget.slice(startDir.length);
    canonicalTarget = rawTarget;
  }

  const parts = relToWalk ? relToWalk.split(sep).filter(Boolean) : [];
  let cur = startDir;

  for (const part of parts) {
    cur = join(cur, part);
    let st;
    try {
      st = lstatSync(cur);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        break;
      }
      throw err;
    }
    if (st.isSymbolicLink()) {
      throw new Refusal(400, "invalid-workspace-root", `Workspace path must not traverse symbolic links: ${cur}`);
    }
  }

  return existsSync(canonicalTarget) ? realpathSync(canonicalTarget) : canonicalTarget;
}

/** Returns true iff `targetPath` is strictly inside `parentDir` without traversing symlinks. */
export function isContainedIn(parentDir: string, targetPath: string): boolean {
  const parent = canonicalPathOrResolve(parentDir);
  const rawParent = resolve(parentDir);
  const rawTarget = resolve(targetPath);
  const inCanonical = isWithinOrEqual(parent, rawTarget);
  const inLexical = isWithinOrEqual(rawParent, rawTarget);
  if (!inCanonical && !inLexical) {
    return false;
  }
  const target = resolveWithoutSymlinks(targetPath, parentDir);
  const rel = relative(parent, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function assertContainedIn(
  root: string,
  candidate: string,
  message = "Path must stay inside workspace root.",
): void {
  if (!isContainedIn(root, candidate)) {
    throw new Refusal(400, "invalid-workspace-root", message);
  }
}

function ensureDirectorySafe(dir: string, label = "Directory"): void {
  if (pathExistsAny(dir) && !lstatSync(dir).isDirectory()) {
    throw new Refusal(400, "invalid-workspace-root", `${label} is not a directory: ${dir}`);
  }
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Refusal(400, "invalid-workspace-root", `Cannot create ${label.toLowerCase()} ${dir}: ${detail}`);
  }
}

/**
 * Default workspace root (`CONTROLROD_WORKSPACE_ROOT` or `~/projects`), resolving `$HOME`
 * canonically when it exists so symlinked ancestors above `$HOME` do not break containment checks.
 */
export function defaultWorkspaceRoot(): string {
  const home = canonicalPathOrResolve(homedir());
  const envRoot = process.env.CONTROLROD_WORKSPACE_ROOT?.trim();
  if (!envRoot) {
    return join(home, "projects");
  }
  return resolve(envRoot.replace(/^~(?=\/|$)/, home));
}

/**
 * Ensures user-supplied `workspace_root` (and `CONTROLROD_WORKSPACE_ROOT`, which must point to a
 * non-dot folder inside `$HOME`) stays strictly within a non-dot directory under `$HOME`.
 */
export function resolveSafeWorkspaceRoot(requested?: unknown): string {
  if (requested !== undefined && typeof requested !== "string") {
    throw new Refusal(400, "invalid-workspace-root", "Workspace root must be a string.");
  }
  const rawHome = homedir();
  const home = canonicalPathOrResolve(rawHome);
  const raw = requested?.trim();
  const expanded = raw ? raw.replace(/^~(?=\/|$)/, home) : defaultWorkspaceRoot();
  const candidate = resolveWithoutSymlinks(expanded, rawHome);
  const rel = relative(home, candidate);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Refusal(400, "invalid-workspace-root", `Workspace root must stay inside a folder under ${home}`);
  }
  const firstSegment = rel.split(sep)[0];
  if (!firstSegment || firstSegment.startsWith(".")) {
    throw new Refusal(
      400,
      "invalid-workspace-root",
      "Workspace root cannot point to a hidden dot-folder under home.",
    );
  }
  return candidate;
}

function normalizeGithubOwnerRepoPath(rawPath: string): string | null {
  const parts = rawPath.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const owner = parts[0];
  const name = parts[1].replace(/\.git$/i, "");
  if (!owner || !name) return null;
  const normalized = `${owner}/${name}`;
  return isSafeRepoIdentifier(normalized) ? normalized.toLowerCase() : null;
}

/** Parses a strict GitHub HTTPS/SSH/SCP remote URL into lowercase `owner/name`, or `null`. */
export function parseGithubOwnerRepoFromUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const scpMatch = /^git@(github\.com|ssh\.github\.com):(.+)$/i.exec(trimmed);
  if (scpMatch) {
    const rawPath = scpMatch[2]!;
    if (rawPath.startsWith("/")) return null;
    return normalizeGithubOwnerRepoPath(rawPath.replace(/\/+$/, ""));
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "ssh:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "ssh.github.com") return null;
  if (parsed.search || parsed.hash) return null;

  return normalizeGithubOwnerRepoPath(parsed.pathname.replace(/^\/+|\/+$/g, ""));
}

/**
 * Builds a sanitized environment for host `git` / `gh` calls by stripping unsafe `GIT_*`
 * overrides (e.g. `GIT_DIR`, `GIT_INDEX_FILE`), disabling interactive prompts, and setting
 * `GIT_CEILING_DIRECTORIES` so git never walks up into `$HOME` or `workspaceRoot`.
 */
export function hostGitEnv(ceilingDir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith("GIT_") && !SAFE_GIT_ENV_VARS.has(key)) continue;
    env[key] = value;
  }
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_CEILING_DIRECTORIES = ceilingDir ?? defaultWorkspaceRoot();
  return env;
}

/**
 * Injects transient `GIT_CONFIG_COUNT`/`KEY_i`/`VALUE_i` environment pairs so subprocesses like
 * `gh repo clone` inherit hardened git config without mutating the cloned repository's `.git/config`.
 */
export function gitConfigEnv(
  pairs: ReadonlyArray<readonly [string, string]>,
  baseEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  env.GIT_CONFIG_COUNT = String(pairs.length);
  pairs.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  });
  return env;
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

interface GitOptions {
  cwd?: string | undefined;
  timeout?: number | undefined;
  workspaceRoot?: string | undefined;
}

async function git(args: string[], options: GitOptions = {}): Promise<string> {
  const { cwd, timeout = 25_000, workspaceRoot } = options;
  const ceilingDir = workspaceRoot ?? defaultWorkspaceRoot();
  const { stdout } = await execFileAsync("git", [...HOST_GIT_ARGS, ...args], {
    ...(cwd ? { cwd } : {}),
    timeout,
    env: hostGitEnv(ceilingDir),
  });
  return stdout.trim();
}

interface GhOptions {
  timeout?: number | undefined;
  extraConfigPairs?: ReadonlyArray<readonly [string, string]> | undefined;
  ceilingDir?: string | undefined;
}

async function gh(args: string[], options: GhOptions = {}): Promise<string> {
  const { timeout = 10_000, extraConfigPairs = [], ceilingDir } = options;
  const env = gitConfigEnv(
    [...HOST_GIT_CONFIG_PAIRS, ...GH_NETWORK_ALLOWLIST_PAIRS, ...extraConfigPairs],
    hostGitEnv(ceilingDir),
  );
  const { stdout } = await execFileAsync("gh", args, { timeout, env });
  return stdout.trim();
}

async function getOriginRemoteUrl(cwd: string, workspaceRoot: string): Promise<string> {
  return git(["remote", "get-url", "origin"], { cwd, workspaceRoot }).catch(() => "");
}

function assertDirectoryOrMissing(dir: string, label = "Directory"): void {
  if (pathExistsAny(dir) && !lstatSync(dir).isDirectory()) {
    throw new Refusal(400, "invalid-workspace-root", `${label} is not a directory: ${dir}`);
  }
}

/**
 * Validates that an existing repo directory is a real directory with a non-symlink `.git` directory
 * or a `.git` gitfile whose `gitdir:` target stays inside `baseCloneDir` or `workspaceRoot`.
 */
function validateExistingRepoDir(baseCloneDir: string, workspaceRoot: string, isGithub: boolean): void {
  const refuseMissingOrInvalid = (githubMessage: string): never => {
    if (!isGithub) {
      throw new Refusal(404, "repo-not-found", `Local repository not found at ${baseCloneDir}`);
    }
    throw new Refusal(409, "workspace-exists", githubMessage);
  };

  const st = lstatSync(baseCloneDir);
  if (!st.isDirectory()) {
    refuseMissingOrInvalid(`Target path already exists and is not a directory: ${baseCloneDir}`);
  }

  const dotGit = join(baseCloneDir, ".git");
  if (!pathExistsAny(dotGit)) {
    refuseMissingOrInvalid(`Existing folder at ${baseCloneDir} is not a Git repository.`);
  }

  const dotGitStat = lstatSync(dotGit);
  if (dotGitStat.isSymbolicLink()) {
    throw new Refusal(400, "invalid-workspace-root", `Repository .git entry must not be a symbolic link: ${dotGit}`);
  }
  if (dotGitStat.isFile()) {
    const content = readFileSync(dotGit, "utf8");
    const match = /^gitdir:\s*(.+)$/m.exec(content);
    if (!match?.[1]) {
      throw new Refusal(400, "invalid-workspace-root", `Invalid .git gitdir reference in ${dotGit}`);
    }
    const targetGitDir = resolve(baseCloneDir, match[1].trim());
    if (!isContainedIn(baseCloneDir, targetGitDir) && !isContainedIn(workspaceRoot, targetGitDir)) {
      throw new Refusal(400, "invalid-workspace-root", "Repository .git gitdir target escapes the workspace.");
    }
    if (!existsSync(targetGitDir) || !statSync(targetGitDir).isDirectory()) {
      throw new Refusal(
        400,
        "invalid-workspace-root",
        `Repository .git gitdir target must be an existing directory: ${targetGitDir}`,
      );
    }
    return;
  }
  if (!dotGitStat.isDirectory()) {
    throw new Refusal(409, "workspace-exists", `Existing .git entry at ${dotGit} is not a directory or gitfile.`);
  }
}

async function scanLocalRepos(root: string): Promise<LocalRepoInfo[]> {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const repos: LocalRepoInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const full = join(root, entry.name);
    try {
      validateExistingRepoDir(full, root, false);
    } catch {
      continue;
    }
    try {
      const [branch, remote, statusOut] = await Promise.all([
        git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: full, workspaceRoot: root }).catch(() => "HEAD"),
        getOriginRemoteUrl(full, root),
        git(["status", "--porcelain"], { cwd: full, workspaceRoot: root }).catch(() => ""),
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

async function listGithubRepos(ceilingDir?: string): Promise<{ repos: GithubRepoInfo[]; error: string | null }> {
  try {
    const raw = await gh(
      [
        "repo",
        "list",
        "--limit",
        "40",
        "--json",
        "nameWithOwner,defaultBranchRef,isPrivate,url,updatedAt",
      ],
      { ceilingDir },
    );
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

interface MaterializeContext {
  repo: string;
  repoName: string;
  isGithub: boolean;
  branch: string;
  baseBranch: string | undefined;
  strategy: MaterializeStrategy;
  workspaceRoot: string;
  baseCloneDir: string;
}

function parseMaterializeRequest(rawBody: unknown): MaterializeContext {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  if (typeof body.repo !== "string") {
    throw new Refusal(400, "invalid-repo", "Specify a GitHub repo (owner/name) or local repo folder name.");
  }
  if (typeof body.branch !== "string") {
    throw new Refusal(400, "invalid-branch", "Specify a valid Git branch name.");
  }
  if (body.base_branch !== undefined && typeof body.base_branch !== "string") {
    throw new Refusal(400, "invalid-branch", "Base branch name must be a string.");
  }
  if (body.workspace_root !== undefined && typeof body.workspace_root !== "string") {
    throw new Refusal(400, "invalid-workspace-root", "Workspace root must be a string.");
  }
  if (
    body.strategy !== undefined &&
    body.strategy !== "worktree" &&
    body.strategy !== "fresh-clone" &&
    body.strategy !== "branch"
  ) {
    throw new Refusal(400, "invalid-strategy", "Strategy must be one of worktree, fresh-clone, or branch.");
  }

  const repo = body.repo.trim();
  if (!isSafeRepoIdentifier(repo)) {
    throw new Refusal(400, "invalid-repo", "Specify a GitHub repo (owner/name) or local repo folder name.");
  }
  const branch = assertValidBranch(body.branch, "branch");
  const baseBranch = body.base_branch?.trim() ? assertValidBranch(body.base_branch, "base_branch") : undefined;
  const strategy: MaterializeStrategy = body.strategy ?? "worktree";
  const workspaceRoot = resolveSafeWorkspaceRoot(body.workspace_root);
  const isGithub = SAFE_OWNER_REPO.test(repo);
  const repoName = isGithub ? repo.split("/")[1]!.replace(/\.git$/i, "") : repo;
  const baseCloneDir = join(workspaceRoot, repoName);

  return { repo, repoName, isGithub, branch, baseBranch, strategy, workspaceRoot, baseCloneDir };
}

async function ensureBaseClone(ctx: MaterializeContext): Promise<void> {
  if (pathExistsAny(ctx.baseCloneDir)) {
    validateExistingRepoDir(ctx.baseCloneDir, ctx.workspaceRoot, ctx.isGithub);
    if (ctx.isGithub) {
      const expectedOwnerRepo = ctx.repo.replace(/\.git$/i, "").toLowerCase();
      const remoteUrl = await getOriginRemoteUrl(ctx.baseCloneDir, ctx.workspaceRoot);
      const actualOwnerRepo = parseGithubOwnerRepoFromUrl(remoteUrl);
      if (!actualOwnerRepo || actualOwnerRepo !== expectedOwnerRepo) {
        throw new Refusal(
          409,
          "repo-identity-mismatch",
          `Existing folder at ${ctx.baseCloneDir} points to ${actualOwnerRepo ?? "a missing or non-GitHub origin"} instead of ${expectedOwnerRepo}.`,
        );
      }
    }
    return;
  }

  if (!ctx.isGithub) {
    throw new Refusal(404, "repo-not-found", `Local repository not found at ${ctx.baseCloneDir}`);
  }
  await gh(["repo", "clone", ctx.repo, ctx.baseCloneDir], { timeout: 60_000, ceilingDir: ctx.workspaceRoot });
}

async function checkoutOrCreateBranch(
  repoDir: string,
  branch: string,
  workspaceRoot: string,
  options: { baseBranch?: string | undefined; worktreeTargetDir?: string | undefined } = {},
): Promise<void> {
  const existing = await git(["branch", "--list", branch], { cwd: repoDir, workspaceRoot });
  if (options.worktreeTargetDir) {
    const args = existing
      ? ["worktree", "add", options.worktreeTargetDir, branch]
      : [
          "worktree",
          "add",
          "-b",
          branch,
          options.worktreeTargetDir,
          ...(options.baseBranch ? [options.baseBranch] : []),
        ];
    await git(args, { cwd: repoDir, workspaceRoot });
    return;
  }
  const args = existing
    ? ["checkout", branch]
    : ["checkout", "-b", branch, ...(options.baseBranch ? [options.baseBranch] : [])];
  await git(args, { cwd: repoDir, workspaceRoot });
}

async function materializeFreshClone(ctx: MaterializeContext): Promise<string> {
  const targetDir = join(ctx.workspaceRoot, `${ctx.repoName}-${safeSlug(ctx.branch)}`);
  assertContainedIn(ctx.workspaceRoot, targetDir, "Target path must stay inside workspace root.");
  if (pathExistsAny(targetDir)) {
    throw new Refusal(409, "workspace-exists", `Target folder already exists: ${targetDir}`);
  }
  if (ctx.isGithub) {
    await gh(["repo", "clone", ctx.repo, targetDir], { timeout: 60_000, ceilingDir: ctx.workspaceRoot });
  } else {
    if (!pathExistsAny(ctx.baseCloneDir)) {
      throw new Refusal(404, "repo-not-found", `Local repository not found at ${ctx.baseCloneDir}`);
    }
    validateExistingRepoDir(ctx.baseCloneDir, ctx.workspaceRoot, false);
    await git(["clone", ctx.baseCloneDir, targetDir], {
      cwd: ctx.workspaceRoot,
      timeout: 60_000,
      workspaceRoot: ctx.workspaceRoot,
    });
  }
  await git(["checkout", "-b", ctx.branch, ...(ctx.baseBranch ? [ctx.baseBranch] : [])], {
    cwd: targetDir,
    workspaceRoot: ctx.workspaceRoot,
  });
  return targetDir;
}

async function materializeBranch(ctx: MaterializeContext): Promise<string> {
  await ensureBaseClone(ctx);
  const statusOut = await git(["status", "--porcelain"], {
    cwd: ctx.baseCloneDir,
    workspaceRoot: ctx.workspaceRoot,
  });
  if (statusOut.length > 0) {
    throw new Refusal(
      409,
      "workspace-exists",
      `Repository at ${ctx.baseCloneDir} has uncommitted changes; commit or stash them before switching branches.`,
    );
  }
  await checkoutOrCreateBranch(ctx.baseCloneDir, ctx.branch, ctx.workspaceRoot, { baseBranch: ctx.baseBranch });
  return ctx.baseCloneDir;
}

async function materializeWorktree(ctx: MaterializeContext): Promise<string> {
  await ensureBaseClone(ctx);
  const originUrl = await getOriginRemoteUrl(ctx.baseCloneDir, ctx.workspaceRoot);
  if (originUrl) {
    await git(["fetch", "--prune", "origin"], { cwd: ctx.baseCloneDir, workspaceRoot: ctx.workspaceRoot });
  }

  const worktreesRoot = join(ctx.workspaceRoot, ".worktrees", ctx.repoName);
  assertContainedIn(ctx.workspaceRoot, worktreesRoot, "Worktree directory must stay inside workspace root.");
  const targetDir = join(worktreesRoot, safeSlug(ctx.branch));
  assertContainedIn(ctx.workspaceRoot, targetDir, "Worktree target must stay inside workspace root.");
  if (pathExistsAny(targetDir)) {
    throw new Refusal(409, "workspace-exists", `Worktree already exists at ${targetDir}`);
  }
  ensureDirectorySafe(worktreesRoot, "Worktree directory");

  await checkoutOrCreateBranch(ctx.baseCloneDir, ctx.branch, ctx.workspaceRoot, {
    baseBranch: ctx.baseBranch,
    worktreeTargetDir: targetDir,
  });
  return targetDir;
}

export function repoRoutes(
  app: FastifyInstance,
  person: (req: FastifyRequest) => Promise<string>,
): void {
  app.get<{ Querystring: { workspace_root?: unknown } }>("/repos", async (req) => {
    await person(req);
    const workspaceRoot = resolveSafeWorkspaceRoot(req.query.workspace_root);
    assertDirectoryOrMissing(workspaceRoot, "Workspace root");
    const [local, ghResult] = await Promise.all([
      scanLocalRepos(workspaceRoot),
      listGithubRepos(workspaceRoot),
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
    const ctx = parseMaterializeRequest(req.body);
    ensureDirectorySafe(ctx.workspaceRoot, "Workspace root");
    assertContainedIn(ctx.workspaceRoot, ctx.baseCloneDir, "Repository path must stay inside workspace root.");

    try {
      const localPath =
        ctx.strategy === "fresh-clone"
          ? await materializeFreshClone(ctx)
          : ctx.strategy === "branch"
            ? await materializeBranch(ctx)
            : await materializeWorktree(ctx);
      return { ok: true, strategy: ctx.strategy, repo: ctx.repo, branch: ctx.branch, local_path: localPath };
    } catch (err) {
      if (err instanceof Refusal) throw err;
      const msg = err instanceof Error ? err.message : "Git operation failed";
      throw new Refusal(400, "git-failed", msg);
    }
  });
}
