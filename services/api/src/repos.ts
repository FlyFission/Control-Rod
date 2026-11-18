import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Refusal } from "./refusal.js";

const execFileAsync = promisify(execFile);

export type MaterializeStrategy = "worktree" | "fresh-clone" | "branch";
export type WorkspaceMode = "software" | "capital-projects";

export const CAPITAL_PROJECT_DIRS = ["calculations", "drawings", "specifications"] as const;

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
  "GIT_SSH_VARIANT",
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
  ["core.sshCommand", "ssh -o BatchMode=yes"],
  ["core.askPass", ""],
  ["credential.helper", ""],
  ["core.pager", "cat"],
  ["protocol.ext.allow", "never"],
  ["protocol.file.allow", "user"],
  ["submodule.recurse", "false"],
  ["fetch.recurseSubmodules", "false"],
  ["merge.verifySignatures", "false"],
  ["commit.gpgsign", "false"],
  ["tag.gpgsign", "false"],
  ["remote.origin.uploadpack", "git-upload-pack"],
  ["remote.origin.receivepack", "git-receive-pack"],
  ["remote.origin.proxy", ""],
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

function asBodyRecord(rawBody: unknown): Record<string, unknown> {
  if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return rawBody as Record<string, unknown>;
  }
  return {};
}

function expandHomePath(rawPath: string, home: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("~")) {
    if (trimmed !== "~" && !trimmed.startsWith("~/")) return null;
    return trimmed.replace(/^~(?=\/|$)/, home);
  }
  return trimmed;
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
  let expanded: string;
  if (raw) {
    const homeExpanded = expandHomePath(raw, home);
    if (!homeExpanded) {
      throw new Refusal(400, "invalid-workspace-root", "Workspace root must stay inside your home directory.");
    }
    expanded = homeExpanded;
  } else {
    expanded = defaultWorkspaceRoot();
  }
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
export function hostGitEnv(
  ceilingDirOrExtra?: string | Record<string, string>,
  extraEnv?: Record<string, string>,
): NodeJS.ProcessEnv {
  const ceilingDir = typeof ceilingDirOrExtra === "string" ? ceilingDirOrExtra : undefined;
  const mergedExtra =
    typeof ceilingDirOrExtra === "object" && ceilingDirOrExtra !== null ? ceilingDirOrExtra : extraEnv;
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith("GIT_") && !SAFE_GIT_ENV_VARS.has(key)) continue;
    env[key] = value;
  }
  delete env.SSH_ASKPASS;
  env.SSH_ASKPASS_REQUIRE = "never";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_CEILING_DIRECTORIES = ceilingDir ?? defaultWorkspaceRoot();
  if (mergedExtra) {
    for (const [k, v] of Object.entries(mergedExtra)) {
      env[k] = v;
    }
  }
  return env;
}

function pairsToGitConfigEnv(pairs: ReadonlyArray<readonly [string, string]>): Record<string, string> {
  const env: Record<string, string> = {
    GIT_CONFIG_COUNT: String(pairs.length),
  };
  pairs.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  });
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
  return { ...baseEnv, ...pairsToGitConfigEnv(pairs) };
}

const CRLF_DISABLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["core.autocrlf", "false"],
  ["core.safecrlf", "false"],
  ["core.eol", "lf"],
];

/**
 * Queries configured `filter.<driver>.*` entries in `repoDir` and returns transient
 * `GIT_CONFIG_COUNT`/`KEY_i`/`VALUE_i` overrides that neutralize clean/smudge/process
 * filters (including `required=true` and driver names with `=`). Line-ending overrides
 * are scoped cleanly: status checks use `"none"`, checkouts use `"safecrlf-only"`, and
 * raw-byte checkpoints use `"all"`.
 */
async function filterDisableEnv(
  repoDir: string,
  workspaceRoot?: string,
  crlfMode: "none" | "safecrlf-only" | "all" = "none",
): Promise<Record<string, string>> {
  let rawKeys = "";
  try {
    rawKeys = await git(
      ["config", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process|required)$"],
      { cwd: repoDir, workspaceRoot },
    );
  } catch (err) {
    // `git config --get-regexp` exits with status 1 when no keys match.
    if ((err as { code?: unknown }).code !== 1) {
      throw err;
    }
  }

  const drivers = new Set<string>();
  for (const line of rawKeys.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(filter\..+)\.(clean|smudge|process|required)$/i.exec(trimmed);
    if (match?.[1]) {
      drivers.add(match[1]);
    }
  }

  const pairs: Array<readonly [string, string]> =
    crlfMode === "all"
      ? [...CRLF_DISABLE_PAIRS]
      : crlfMode === "safecrlf-only"
        ? [["core.safecrlf", "false"]]
        : [];
  for (const prefix of drivers) {
    pairs.push(
      [`${prefix}.clean`, ""],
      [`${prefix}.smudge`, ""],
      [`${prefix}.process`, ""],
      [`${prefix}.required`, "false"],
    );
  }
  return pairsToGitConfigEnv(pairs);
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
  extraEnv?: Record<string, string> | undefined;
}

async function git(args: string[], options: GitOptions = {}): Promise<string> {
  const { cwd, timeout = 25_000, workspaceRoot, extraEnv } = options;
  const ceilingDir = workspaceRoot ?? defaultWorkspaceRoot();
  const { stdout } = await execFileAsync("git", [...HOST_GIT_ARGS, ...args], {
    ...(cwd ? { cwd } : {}),
    timeout,
    env: hostGitEnv(ceilingDir, extraEnv),
  });
  return stdout.trim();
}

async function gitWithBytes(args: string[], options: GitOptions & { input?: Buffer } = {}): Promise<Buffer> {
  const { cwd, timeout = 25_000, workspaceRoot, extraEnv, input } = options;
  const ceilingDir = workspaceRoot ?? defaultWorkspaceRoot();
  return new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const child = execFile(
      "git",
      [...HOST_GIT_ARGS, ...args],
      {
        ...(cwd ? { cwd } : {}),
        timeout,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
        env: hostGitEnv(ceilingDir, extraEnv),
      },
      (err, stdout) => {
        if (err) rejectPromise(err);
        else resolvePromise(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      },
    );
    if (input !== undefined) {
      child.stdin?.end(input);
    } else {
      child.stdin?.end();
    }
  });
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

const STANDARD_LFS_FILTERS: Readonly<Record<string, string>> = {
  "filter.lfs.clean": "git-lfs clean -- %f",
  "filter.lfs.smudge": "git-lfs smudge -- %f",
  "filter.lfs.process": "git-lfs filter-process",
};

function isDangerousLocalGitConfig(rawKey: string, rawValue: string): string | null {
  const key = rawKey.toLowerCase();
  const val = rawValue.trim();

  if (
    key === "core.sshcommand" ||
    key === "core.worktree" ||
    key === "core.hookspath" ||
    key === "core.askpass" ||
    key === "diff.external" ||
    key === "credential.helper" ||
    (key.startsWith("credential.") && key.endsWith(".helper")) ||
    key === "include.path" ||
    (key.startsWith("includeif.") && key.endsWith(".path")) ||
    key.startsWith("uploadpack.")
  ) {
    return rawKey;
  }

  if (key === "core.fsmonitor" && val !== "" && val.toLowerCase() !== "false") {
    return rawKey;
  }

  if (key === "core.bare" && val !== "" && !["false", "0", "no", "off"].includes(val.toLowerCase())) {
    return rawKey;
  }

  if (
    key.startsWith("remote.") &&
    (key.endsWith(".uploadpack") || key.endsWith(".receivepack") || key.endsWith(".proxy") || key.endsWith(".vcs"))
  ) {
    return rawKey;
  }

  if (
    key.startsWith("filter.") &&
    (key.endsWith(".clean") || key.endsWith(".smudge") || key.endsWith(".process"))
  ) {
    if (STANDARD_LFS_FILTERS[key] !== val) {
      return rawKey;
    }
  }

  return null;
}

async function assertSafeGitConfigFile(configPath: string, workspaceRoot: string): Promise<void> {
  if (!pathExistsAny(configPath)) return;
  const st = lstatSync(configPath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new Refusal(400, "invalid-workspace-root", `Repository git config must be a regular file: ${configPath}`);
  }

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "git",
      [...HOST_GIT_ARGS, "config", "--file", configPath, "--no-includes", "--null", "--list"],
      { timeout: 10_000, env: hostGitEnv(workspaceRoot) },
    ));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Refusal(400, "invalid-workspace-root", `Unreadable repository git config ${configPath}: ${detail}`);
  }

  for (const entry of stdout.split("\0")) {
    if (!entry) continue;
    const nl = entry.indexOf("\n");
    const rawKey = nl === -1 ? entry : entry.slice(0, nl);
    const rawVal = nl === -1 ? "" : entry.slice(nl + 1);
    const disallowed = isDangerousLocalGitConfig(rawKey, rawVal);
    if (disallowed) {
      throw new Refusal(
        400,
        "invalid-workspace-root",
        `Repository git config sets disallowed local key: ${disallowed}`,
      );
    }
  }
}

function resolveGitDirWithCommonDir(gitDir: string, baseCloneDir: string, workspaceRoot: string): string[] {
  const commondirFile = join(gitDir, "commondir");
  if (!pathExistsAny(commondirFile)) {
    return [gitDir];
  }
  const commonStat = lstatSync(commondirFile);
  if (commonStat.isSymbolicLink() || !commonStat.isFile()) {
    throw new Refusal(400, "invalid-workspace-root", `Invalid repository commondir entry: ${commondirFile}`);
  }
  const commonTarget = resolve(gitDir, readFileSync(commondirFile, "utf8").trim());
  if (!isContainedIn(baseCloneDir, commonTarget) && !isContainedIn(workspaceRoot, commonTarget)) {
    throw new Refusal(400, "invalid-workspace-root", "Repository commondir target escapes the workspace.");
  }
  if (!existsSync(commonTarget) || !statSync(commonTarget).isDirectory()) {
    throw new Refusal(
      400,
      "invalid-workspace-root",
      `Repository commondir target must be an existing directory: ${commonTarget}`,
    );
  }
  return [gitDir, commonTarget];
}

function resolveRepoGitDirs(baseCloneDir: string, workspaceRoot: string, isGithub: boolean): string[] {
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
    return resolveGitDirWithCommonDir(targetGitDir, baseCloneDir, workspaceRoot);
  }
  if (!dotGitStat.isDirectory()) {
    throw new Refusal(409, "workspace-exists", `Existing .git entry at ${dotGit} is not a directory or gitfile.`);
  }
  return resolveGitDirWithCommonDir(dotGit, baseCloneDir, workspaceRoot);
}

async function assertSafeWorkingTree(repoDir: string, workspaceRoot: string): Promise<void> {
  let out: string;
  try {
    out = await git(["rev-parse", "--is-bare-repository", "--is-inside-work-tree", "--show-toplevel"], {
      cwd: repoDir,
      workspaceRoot,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Refusal(400, "invalid-workspace-root", `Invalid git working tree at ${repoDir}: ${detail}`);
  }

  const lines = out.split(/\r?\n/);
  const [isBare, isInsideWorkTree, toplevel] = lines;
  if (isBare !== "false" || isInsideWorkTree !== "true" || !toplevel) {
    throw new Refusal(400, "invalid-workspace-root", `Repository at ${repoDir} must have a non-bare working tree.`);
  }
  if (canonicalPathOrResolve(toplevel) !== canonicalPathOrResolve(repoDir)) {
    throw new Refusal(
      400,
      "invalid-workspace-root",
      `Repository working tree (${toplevel}) does not match ${repoDir}.`,
    );
  }
}

/**
 * Validates that an existing repo directory is a real directory with a non-symlink `.git` directory
 * or a `.git` gitfile whose `gitdir:` target stays inside `baseCloneDir` or `workspaceRoot`,
 * inspects its local git config for disallowed command/boundary keys, and verifies its effective
 * working tree matches `baseCloneDir`.
 */
async function validateExistingRepoDir(baseCloneDir: string, workspaceRoot: string, isGithub: boolean): Promise<void> {
  const gitDirs = resolveRepoGitDirs(baseCloneDir, workspaceRoot, isGithub);
  for (const dir of gitDirs) {
    await assertSafeGitConfigFile(join(dir, "config"), workspaceRoot);
    await assertSafeGitConfigFile(join(dir, "config.worktree"), workspaceRoot);
  }
  await assertSafeWorkingTree(baseCloneDir, workspaceRoot);
}

const LFS_POINTER_RE = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([0-9a-f]{64})\r?\nsize (\d+)\r?\n?$/;

function hashFileSha256(filePath: string): string {
  const hash = createHash("sha256");
  const fd = openSync(filePath, "r");
  const chunk = Buffer.allocUnsafe(64 * 1024);
  try {
    for (;;) {
      const n = readSync(fd, chunk, 0, chunk.length, null);
      if (n <= 0) break;
      hash.update(chunk.subarray(0, n));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

async function isUnchangedHydratedLfsFile(
  repoDir: string,
  relPath: string,
  workspaceRoot: string,
): Promise<boolean> {
  const fullPath = join(repoDir, relPath);
  if (!pathExistsAny(fullPath)) return false;
  const st = lstatSync(fullPath);
  if (!st.isFile() || st.isSymbolicLink()) return false;

  const attrOut = await git(["check-attr", "filter", "--", relPath], {
    cwd: repoDir,
    workspaceRoot,
  }).catch(() => "");
  if (!/: filter: lfs$/.test(attrOut.trim())) return false;

  const indexBlob = await gitWithBytes(["cat-file", "blob", `:${relPath}`], {
    cwd: repoDir,
    workspaceRoot,
  }).catch(() => Buffer.alloc(0));
  if (indexBlob.length === 0 || indexBlob.length > 512) return false;
  const match = LFS_POINTER_RE.exec(indexBlob.toString("utf8"));
  if (!match) return false;
  const expectedSha = match[1]!;
  const expectedSize = Number(match[2]!);
  if (st.size !== expectedSize) return false;
  return hashFileSha256(fullPath) === expectedSha;
}

/**
 * Checks working-tree dirtiness while filters are neutralized, treating hydrated
 * Git LFS files whose size and SHA-256 still match their indexed LFS pointer as clean
 * without invoking `git-lfs` or untrusted filter drivers on the host.
 */
async function inspectRepoDirtiness(
  repoDir: string,
  workspaceRoot: string,
  filterEnv: Record<string, string>,
): Promise<{ dirty: boolean; hasHydratedLfsClean: boolean }> {
  const raw = await gitWithBytes(["status", "--porcelain=v1", "-z"], {
    cwd: repoDir,
    workspaceRoot,
    extraEnv: filterEnv,
  });
  const records = splitNullRecords(raw);
  if (records.length === 0) return { dirty: false, hasHydratedLfsClean: false };

  let hasHydratedLfsClean = false;
  for (let i = 0; i < records.length; i += 1) {
    const entry = records[i]!.toString("utf8");
    if (entry.length < 4) return { dirty: true, hasHydratedLfsClean };
    const xy = entry.slice(0, 2);
    const relPath = entry.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      // Rename/copy porcelain-z records emit an extra source path record; always dirty.
      return { dirty: true, hasHydratedLfsClean };
    }
    if (xy !== " M") {
      return { dirty: true, hasHydratedLfsClean };
    }
    if (await isUnchangedHydratedLfsFile(repoDir, relPath, workspaceRoot)) {
      hasHydratedLfsClean = true;
      continue;
    }
    return { dirty: true, hasHydratedLfsClean };
  }
  return { dirty: false, hasHydratedLfsClean };
}

async function scanLocalRepos(root: string): Promise<LocalRepoInfo[]> {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const repos: LocalRepoInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const full = join(root, entry.name);
    try {
      await validateExistingRepoDir(full, root, false);
    } catch {
      continue;
    }
    try {
      const filterEnv = await filterDisableEnv(full, root);
      const [branch, remote, dirtiness] = await Promise.all([
        git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: full, workspaceRoot: root }).catch(() => "HEAD"),
        getOriginRemoteUrl(full, root),
        inspectRepoDirtiness(full, root, filterEnv).catch(() => ({ dirty: false, hasHydratedLfsClean: false })),
      ]);
      repos.push({
        name: entry.name,
        path: full,
        branch,
        remote_url: remote || null,
        dirty: dirtiness.dirty,
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

function resolveSafeRemovalTarget(
  rawPath: string,
  home: string,
  workspaceRoot: string,
): string | null {
  const expanded = expandHomePath(rawPath, home);
  if (!expanded) return null;
  return resolveWithoutSymlinks(expanded, workspaceRoot);
}

/**
 * Returns true if removing `worktreePath` (for `repoPath` inside `workspaceRoot`) is unsafe:
 * empty, `~user` form, root/home/workspace/repo itself, uncontained `repoPath` or `worktreePath`,
 * symlinked path component, ancestor of `repoPath`, or inside `repoPath/.git`.
 */
export function isDangerousWorktreeRemovalPath(
  worktreePath: string,
  repoPath: string,
  workspaceRoot: string,
): boolean {
  const home = canonicalPathOrResolve(homedir());
  const expandedRoot = expandHomePath(workspaceRoot, home);
  if (!expandedRoot) return true;
  try {
    const resolvedRoot = resolveWithoutSymlinks(expandedRoot, homedir());
    const resolvedWt = resolveSafeRemovalTarget(worktreePath, home, resolvedRoot);
    const resolvedRepo = resolveSafeRemovalTarget(repoPath, home, resolvedRoot);
    if (!resolvedWt || !resolvedRepo) return true;
    if (
      resolvedWt === "/" ||
      resolvedWt === home ||
      resolvedWt === resolvedRoot ||
      resolvedWt === resolvedRepo
    ) {
      return true;
    }
    const repoDotGit = join(resolvedRepo, ".git");
    if (
      !isContainedIn(resolvedRoot, resolvedRepo) ||
      !isContainedIn(resolvedRoot, resolvedWt) ||
      isContainedIn(resolvedWt, resolvedRepo) ||
      resolvedWt === repoDotGit ||
      isContainedIn(repoDotGit, resolvedWt)
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

async function findRegisteredWorktree(
  resolvedRepo: string,
  resolvedWt: string,
  workspaceRoot: string,
): Promise<string | null> {
  const listOut = await git(["worktree", "list", "--porcelain"], {
    cwd: resolvedRepo,
    workspaceRoot,
  });
  for (const line of listOut.split(/\r?\n/)) {
    if (!line.startsWith("worktree ")) continue;
    const raw = line.slice("worktree ".length).trim();
    if (canonicalPathOrResolve(raw) === resolvedWt) {
      return raw;
    }
  }
  return null;
}

export async function removeWorktreeSafely(opts: {
  worktreePath: string;
  repoPath: string;
  workspaceRoot?: string;
  force?: boolean;
}): Promise<{ removed: string }> {
  const workspaceRoot = resolveSafeWorkspaceRoot(opts.workspaceRoot);
  if (isDangerousWorktreeRemovalPath(opts.worktreePath, opts.repoPath, workspaceRoot)) {
    throw new Refusal(
      400,
      "unsafe-worktree-path",
      `Refusing to remove protected or out-of-bounds worktree path: ${opts.worktreePath}`,
    );
  }
  const home = canonicalPathOrResolve(homedir());
  const resolvedWt = resolveSafeRemovalTarget(opts.worktreePath, home, workspaceRoot)!;
  const resolvedRepo = resolveSafeRemovalTarget(opts.repoPath, home, workspaceRoot)!;
  const force = opts.force === true;

  if (!pathExistsAny(resolvedRepo)) {
    throw new Refusal(404, "repo-not-found", `Repository not found at ${resolvedRepo}`);
  }
  resolveRepoGitDirs(resolvedRepo, workspaceRoot, false);
  await assertSafeWorkingTree(resolvedRepo, workspaceRoot);

  let targetArg = resolvedWt;
  let filterEnv: Record<string, string> | undefined;
  let passSingleForce = force;

  if (!pathExistsAny(resolvedWt)) {
    const registeredPath = await findRegisteredWorktree(resolvedRepo, resolvedWt, workspaceRoot);
    if (registeredPath === null) {
      throw new Refusal(404, "worktree-not-found", `Worktree not found: ${resolvedWt}`);
    }
    targetArg = registeredPath;
  } else {
    if (!lstatSync(resolvedWt).isDirectory()) {
      throw new Refusal(400, "unsafe-worktree-path", `Worktree path is not a directory: ${resolvedWt}`);
    }
    filterEnv = await filterDisableEnv(resolvedWt, workspaceRoot);
    if (!force) {
      const { dirty, hasHydratedLfsClean } = await inspectRepoDirtiness(resolvedWt, workspaceRoot, filterEnv);
      if (dirty) {
        throw new Refusal(
          409,
          "worktree-dirty",
          "Worktree has uncommitted changes. Commit, checkpoint, or pass force=true.",
        );
      }
      if (hasHydratedLfsClean) {
        // Hydrated LFS files match their indexed pointer bytes; single --force still preserves worktree locks.
        passSingleForce = true;
      }
    }
  }

  await git(["worktree", "remove", ...(passSingleForce ? ["--force"] : []), targetArg], {
    cwd: resolvedRepo,
    workspaceRoot,
    ...(filterEnv !== undefined ? { extraEnv: filterEnv } : {}),
  });
  if ((await findRegisteredWorktree(resolvedRepo, resolvedWt, workspaceRoot)) !== null) {
    throw new Refusal(400, "git-failed", `Worktree registration still exists after removal: ${resolvedWt}`);
  }
  return { removed: resolvedWt };
}

/**
 * Captures a private git checkpoint ref (`refs/cr-checkpoints/...`) using a
 * temporary GIT_INDEX_FILE so the workspace's real index and HEAD are untouched.
 * Checkpoints on Git LFS repositories neutralize clean/smudge/process filters and
 * record raw working-tree or pointer bytes without invoking external filter drivers.
 */
function splitNullRecords(buf: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0) {
      if (i > start) parts.push(buf.subarray(start, i));
      start = i + 1;
    }
  }
  if (start < buf.length) parts.push(buf.subarray(start));
  return parts;
}

async function prepareTempIndexFlags(
  repoDir: string,
  workspaceRoot: string,
  indexEnv: Record<string, string>,
): Promise<void> {
  const raw = await gitWithBytes(["ls-files", "-v", "-z"], {
    cwd: repoDir,
    workspaceRoot,
    extraEnv: indexEnv,
  });
  const records = splitNullRecords(raw);
  if (records.length === 0) return;

  const allPaths: Buffer[] = [];
  const presentSkipPaths: Buffer[] = [];
  for (const rec of records) {
    if (rec.length < 3) continue;
    const tag = String.fromCharCode(rec[0]!);
    const pathBuf = rec.subarray(2);
    allPaths.push(pathBuf);
    if (tag === "S" || tag === "s") {
      const relPath = pathBuf.toString("utf8");
      if (pathExistsAny(join(repoDir, relPath))) {
        presentSkipPaths.push(pathBuf);
      }
    }
  }

  if (allPaths.length > 0) {
    await gitWithBytes(["update-index", "--no-assume-unchanged", "-z", "--stdin"], {
      cwd: repoDir,
      workspaceRoot,
      extraEnv: indexEnv,
      input: Buffer.concat([...allPaths.map((p) => Buffer.concat([p, Buffer.from([0])]))]),
    });
  }
  if (presentSkipPaths.length > 0) {
    await gitWithBytes(["update-index", "--no-skip-worktree", "-z", "--stdin"], {
      cwd: repoDir,
      workspaceRoot,
      extraEnv: indexEnv,
      input: Buffer.concat([...presentSkipPaths.map((p) => Buffer.concat([p, Buffer.from([0])]))]),
    });
  }
}

async function stageRawWorkingTreeBlobs(
  repoDir: string,
  workspaceRoot: string,
  indexEnv: Record<string, string>,
): Promise<void> {
  const cachedRaw = await gitWithBytes(["ls-files", "-s", "-v", "-z"], {
    cwd: repoDir,
    workspaceRoot,
    extraEnv: indexEnv,
  });
  const tracked = new Map<string, { tag: string; mode: string; oid: string; stage: string }>();
  for (const rec of splitNullRecords(cachedRaw)) {
    const line = rec.toString("utf8");
    const tabIdx = line.indexOf("\t");
    if (tabIdx < 0 || line.length < 3) continue;
    const tag = line[0]!;
    const meta = line.slice(2, tabIdx).split(" ");
    const mode = meta[0];
    const oid = meta[1];
    const stage = meta[2];
    const relPath = line.slice(tabIdx + 1);
    if (!mode || !oid || !stage || !relPath) continue;
    tracked.set(relPath, { tag, mode, oid, stage });
  }

  const deletedPaths: Buffer[] = [];
  const regularCandidates: Array<{ mode: string; prevOid: string | null; prevStage: string | null; relPath: string }> =
    [];
  const symlinkCandidates: Array<{ prevOid: string | null; prevStage: string | null; relPath: string; target: string }> =
    [];

  for (const [relPath, entry] of tracked) {
    if (entry.tag === "S" || entry.tag === "s") continue;
    if (entry.mode === "160000") continue;
    const fullPath = join(repoDir, relPath);
    if (!pathExistsAny(fullPath)) {
      deletedPaths.push(Buffer.from(relPath, "utf8"));
      continue;
    }
    const st = lstatSync(fullPath);
    if (st.isSymbolicLink()) {
      symlinkCandidates.push({
        prevOid: entry.oid,
        prevStage: entry.stage,
        relPath,
        target: readlinkSync(fullPath),
      });
    } else if (st.isFile()) {
      const mode = (st.mode & 0o100) !== 0 ? "100755" : "100644";
      regularCandidates.push({ mode, prevOid: entry.oid, prevStage: entry.stage, relPath });
    }
  }

  const untrackedRaw = await gitWithBytes(["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: repoDir,
    workspaceRoot,
    extraEnv: indexEnv,
  });
  for (const rec of splitNullRecords(untrackedRaw)) {
    const relPath = rec.toString("utf8");
    if (!relPath || relPath.endsWith("/") || tracked.has(relPath)) continue;
    const fullPath = join(repoDir, relPath);
    if (!pathExistsAny(fullPath)) continue;
    const st = lstatSync(fullPath);
    if (st.isSymbolicLink()) {
      symlinkCandidates.push({
        prevOid: null,
        prevStage: null,
        relPath,
        target: readlinkSync(fullPath),
      });
    } else if (st.isFile()) {
      const mode = (st.mode & 0o100) !== 0 ? "100755" : "100644";
      regularCandidates.push({ mode, prevOid: null, prevStage: null, relPath });
    }
  }

  if (deletedPaths.length > 0) {
    await gitWithBytes(["update-index", "--force-remove", "-z", "--stdin"], {
      cwd: repoDir,
      workspaceRoot,
      extraEnv: indexEnv,
      input: Buffer.concat(deletedPaths.map((p) => Buffer.concat([p, Buffer.from([0])]))),
    });
  }

  const CHUNK = 200;
  const cacheInfoArgs: string[] = [];
  for (let i = 0; i < regularCandidates.length; i += CHUNK) {
    const batch = regularCandidates.slice(i, i + CHUNK);
    const out = await git(
      ["hash-object", "-w", "--no-filters", "--", ...batch.map((c) => c.relPath)],
      { cwd: repoDir, workspaceRoot, extraEnv: indexEnv },
    );
    const oids = out ? out.split(/\r?\n/) : [];
    if (oids.length !== batch.length) {
      throw new Error(`hash-object returned ${oids.length} oids for ${batch.length} paths`);
    }
    batch.forEach((c, idx) => {
      const rawOid = oids[idx]!.trim();
      const prevMode = tracked.get(c.relPath)?.mode;
      if (rawOid && (c.prevStage !== "0" || rawOid !== c.prevOid || prevMode !== c.mode)) {
        cacheInfoArgs.push("--cacheinfo", `${c.mode},${rawOid},${c.relPath}`);
      }
    });
  }

  for (const sym of symlinkCandidates) {
    const out = await gitWithBytes(["hash-object", "-w", "--stdin"], {
      cwd: repoDir,
      workspaceRoot,
      extraEnv: indexEnv,
      input: Buffer.from(sym.target, "utf8"),
    });
    const rawOid = out.toString("utf8").trim();
    const prevMode = tracked.get(sym.relPath)?.mode;
    if (rawOid && (sym.prevStage !== "0" || rawOid !== sym.prevOid || prevMode !== "120000")) {
      cacheInfoArgs.push("--cacheinfo", `120000,${rawOid},${sym.relPath}`);
    }
  }

  for (let i = 0; i < cacheInfoArgs.length; i += CHUNK * 2) {
    await git(["update-index", "--add", ...cacheInfoArgs.slice(i, i + CHUNK * 2)], {
      cwd: repoDir,
      workspaceRoot,
      extraEnv: indexEnv,
    });
  }
}

export async function createCheckpoint(opts: {
  repoDir: string;
  label?: string;
  workspaceRoot?: string;
}): Promise<{ ref: string; commit_sha: string; tree_sha: string }> {
  if (opts.label !== undefined && typeof opts.label !== "string") {
    throw new Refusal(400, "invalid", "label must be a string.");
  }
  const home = canonicalPathOrResolve(homedir());
  const expandedRepo = expandHomePath(opts.repoDir, home);
  if (!expandedRepo) {
    throw new Refusal(400, "invalid-repo-path", "repo_path is required.");
  }

  let workspaceRoot: string;
  let repoDir: string;
  if (opts.workspaceRoot !== undefined) {
    workspaceRoot = resolveSafeWorkspaceRoot(opts.workspaceRoot);
    if (!isContainedIn(workspaceRoot, expandedRepo)) {
      throw new Refusal(400, "invalid-repo-path", "repo_path must be inside the workspace root.");
    }
    repoDir = resolveWithoutSymlinks(expandedRepo, workspaceRoot);
  } else {
    workspaceRoot = defaultWorkspaceRoot();
    repoDir = resolveWithoutSymlinks(expandedRepo);
  }

  if (!pathExistsAny(repoDir)) {
    throw new Refusal(404, "repo-not-found", `Repository not found: ${repoDir}`);
  }
  resolveRepoGitDirs(repoDir, workspaceRoot, false);
  await assertSafeWorkingTree(repoDir, workspaceRoot);

  const filterEnv = await filterDisableEnv(repoDir, workspaceRoot, "all");
  const tempIndex = join(tmpdir(), `cr-checkpoint-index-${randomUUID()}`);
  const indexEnv: Record<string, string> = {
    ...filterEnv,
    GIT_INDEX_FILE: tempIndex,
    GIT_AUTHOR_NAME: "Control-Rod Checkpoint",
    GIT_AUTHOR_EMAIL: "checkpoint@control-rod.local",
    GIT_COMMITTER_NAME: "Control-Rod Checkpoint",
    GIT_COMMITTER_EMAIL: "checkpoint@control-rod.local",
  };
  try {
    let headSha: string | null = null;
    try {
      headSha = await git(["rev-parse", "--verify", "HEAD"], { cwd: repoDir, workspaceRoot });
    } catch {
      headSha = null;
    }
    const idxPath = await git(["rev-parse", "--path-format=absolute", "--git-path", "index"], {
      cwd: repoDir,
      workspaceRoot,
    });
    if (pathExistsAny(idxPath)) {
      if (lstatSync(idxPath).isSymbolicLink()) {
        throw new Refusal(400, "invalid-workspace-root", `Repository index must not be a symbolic link: ${idxPath}`);
      }
      copyFileSync(idxPath, tempIndex);
      await prepareTempIndexFlags(repoDir, workspaceRoot, indexEnv);
    } else if (headSha) {
      await git(["read-tree", "HEAD"], { cwd: repoDir, workspaceRoot, extraEnv: indexEnv });
    }
    await stageRawWorkingTreeBlobs(repoDir, workspaceRoot, indexEnv);
    const treeSha = await git(["write-tree"], { cwd: repoDir, workspaceRoot, extraEnv: indexEnv });
    const labelSlug = safeSlug(opts.label ?? "snapshot");
    const stamp = Date.now().toString(36);
    const ref = `refs/cr-checkpoints/${labelSlug}-${stamp}-${randomUUID()}`;
    const commitArgs = [
      "commit-tree",
      treeSha,
      ...(headSha ? ["-p", headSha] : []),
      "-m",
      `control-rod checkpoint: ${opts.label ?? "snapshot"}`,
    ];
    const commitSha = await git(commitArgs, { cwd: repoDir, workspaceRoot, extraEnv: indexEnv });
    await git(["update-ref", ref, commitSha, ""], { cwd: repoDir, workspaceRoot });
    return { ref, commit_sha: commitSha, tree_sha: treeSha };
  } finally {
    rmSync(tempIndex, { force: true });
    rmSync(`${tempIndex}.lock`, { force: true });
  }
}

export function scaffoldCapitalProjectDirs(targetDir: string): string[] {
  const created: string[] = [];
  for (const dir of CAPITAL_PROJECT_DIRS) {
    const full = join(targetDir, dir);
    mkdirSync(full, { recursive: true });
    created.push(dir);
  }
  return created;
}

interface MaterializeContext {
  repo: string;
  repoName: string;
  isGithub: boolean;
  branch: string;
  baseBranch: string | undefined;
  strategy: MaterializeStrategy;
  mode: WorkspaceMode;
  workspaceRoot: string;
  baseCloneDir: string;
}

function parseMaterializeRequest(rawBody: unknown): MaterializeContext {
  const body = asBodyRecord(rawBody);
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
  if (body.mode !== undefined && body.mode !== "software" && body.mode !== "capital-projects") {
    throw new Refusal(400, "invalid", "mode must be 'software' or 'capital-projects'.");
  }

  const repo = body.repo.trim();
  if (!isSafeRepoIdentifier(repo)) {
    throw new Refusal(400, "invalid-repo", "Specify a GitHub repo (owner/name) or local repo folder name.");
  }
  const branch = assertValidBranch(body.branch, "branch");
  const baseBranch = body.base_branch?.trim() ? assertValidBranch(body.base_branch, "base_branch") : undefined;
  const strategy: MaterializeStrategy = body.strategy ?? "worktree";
  const mode: WorkspaceMode = body.mode ?? "software";
  const workspaceRoot = resolveSafeWorkspaceRoot(body.workspace_root);
  const isGithub = SAFE_OWNER_REPO.test(repo);
  const repoName = isGithub ? repo.split("/")[1]!.replace(/\.git$/i, "") : repo;
  const baseCloneDir = join(workspaceRoot, repoName);

  return {
    repo,
    repoName,
    isGithub,
    branch,
    baseBranch,
    strategy,
    mode,
    workspaceRoot,
    baseCloneDir,
  };
}

async function ensureBaseClone(ctx: MaterializeContext): Promise<void> {
  if (pathExistsAny(ctx.baseCloneDir)) {
    await validateExistingRepoDir(ctx.baseCloneDir, ctx.workspaceRoot, ctx.isGithub);
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
  const [existing, filterEnv] = await Promise.all([
    git(["branch", "--list", branch], { cwd: repoDir, workspaceRoot }),
    filterDisableEnv(repoDir, workspaceRoot, "safecrlf-only"),
  ]);
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
    await git(args, { cwd: repoDir, workspaceRoot, extraEnv: filterEnv });
    return;
  }
  const args = existing
    ? ["checkout", branch]
    : ["checkout", "-b", branch, ...(options.baseBranch ? [options.baseBranch] : [])];
  await git(args, { cwd: repoDir, workspaceRoot, extraEnv: filterEnv });
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
    await validateExistingRepoDir(ctx.baseCloneDir, ctx.workspaceRoot, false);
    const cloneFilterEnv = await filterDisableEnv(ctx.baseCloneDir, ctx.workspaceRoot, "safecrlf-only");
    await git(["clone", ctx.baseCloneDir, targetDir], {
      cwd: ctx.workspaceRoot,
      timeout: 60_000,
      workspaceRoot: ctx.workspaceRoot,
      extraEnv: cloneFilterEnv,
    });
  }
  const targetFilterEnv = await filterDisableEnv(targetDir, ctx.workspaceRoot, "safecrlf-only");
  await git(["checkout", "-b", ctx.branch, ...(ctx.baseBranch ? [ctx.baseBranch] : [])], {
    cwd: targetDir,
    workspaceRoot: ctx.workspaceRoot,
    extraEnv: targetFilterEnv,
  });
  return targetDir;
}

async function materializeBranch(ctx: MaterializeContext): Promise<string> {
  await ensureBaseClone(ctx);
  const filterEnv = await filterDisableEnv(ctx.baseCloneDir, ctx.workspaceRoot);
  const { dirty } = await inspectRepoDirtiness(ctx.baseCloneDir, ctx.workspaceRoot, filterEnv);
  if (dirty) {
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

async function withGitRefusal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Refusal) throw err;
    const msg = err instanceof Error ? err.message : "Git operation failed";
    throw new Refusal(400, "git-failed", msg);
  }
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
      mode?: WorkspaceMode;
    };
  }>("/repos/materialize", async (req) => {
    await person(req);
    const ctx = parseMaterializeRequest(req.body);
    ensureDirectorySafe(ctx.workspaceRoot, "Workspace root");
    assertContainedIn(ctx.workspaceRoot, ctx.baseCloneDir, "Repository path must stay inside workspace root.");

    return withGitRefusal(async () => {
      const localPath =
        ctx.strategy === "fresh-clone"
          ? await materializeFreshClone(ctx)
          : ctx.strategy === "branch"
            ? await materializeBranch(ctx)
            : await materializeWorktree(ctx);

      const scaffoldedDirs =
        ctx.mode === "capital-projects" ? scaffoldCapitalProjectDirs(localPath) : [];

      return {
        ok: true,
        strategy: ctx.strategy,
        mode: ctx.mode,
        repo: ctx.repo,
        branch: ctx.branch,
        local_path: localPath,
        scaffolded_dirs: scaffoldedDirs,
      };
    });
  });

  app.post<{
    Body: { repo_path?: string; label?: string; workspace_root?: string };
  }>("/repos/checkpoint", async (req) => {
    await person(req);
    const body = asBodyRecord(req.body);
    const workspaceRoot = resolveSafeWorkspaceRoot(body.workspace_root);
    if (typeof body.repo_path !== "string" || !body.repo_path.trim()) {
      throw new Refusal(400, "invalid-repo-path", "repo_path must be inside the workspace root.");
    }
    if (body.label !== undefined && typeof body.label !== "string") {
      throw new Refusal(400, "invalid", "label must be a string.");
    }
    const repoPathInput = body.repo_path;
    const labelInput = body.label;
    return withGitRefusal(async () => {
      const result = await createCheckpoint({
        repoDir: repoPathInput,
        workspaceRoot,
        ...(labelInput !== undefined ? { label: labelInput } : {}),
      });
      return { ok: true, ...result };
    });
  });

  app.post<{
    Body: { worktree_path?: string; repo_path?: string; workspace_root?: string; force?: boolean };
  }>("/repos/remove", async (req) => {
    await person(req);
    const body = asBodyRecord(req.body);
    if (
      typeof body.worktree_path !== "string" ||
      typeof body.repo_path !== "string" ||
      !body.worktree_path.trim() ||
      !body.repo_path.trim()
    ) {
      throw new Refusal(400, "invalid-worktree-path", "Specify worktree_path and repo_path.");
    }
    if (body.force !== undefined && typeof body.force !== "boolean") {
      throw new Refusal(400, "invalid", "force must be a boolean.");
    }
    const worktreePath = body.worktree_path;
    const repoPath = body.repo_path;
    const force = body.force === true;
    const workspaceRootInput = body.workspace_root;
    if (workspaceRootInput !== undefined && typeof workspaceRootInput !== "string") {
      throw new Refusal(400, "invalid-workspace-root", "Workspace root must be a string.");
    }
    return withGitRefusal(async () => {
      const result = await removeWorktreeSafely({
        worktreePath,
        repoPath,
        ...(workspaceRootInput !== undefined ? { workspaceRoot: workspaceRootInput } : {}),
        force,
      });
      return { ok: true, ...result };
    });
  });
}
