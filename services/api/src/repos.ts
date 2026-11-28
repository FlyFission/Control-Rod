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
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { freezeWorkspace } from "./outfall.js";
import { Refusal } from "./refusal.js";

const execFileAsync = promisify(execFile);

/**
 * How a local workspace is prepared. Only "worktree" can be bound to a card's run (bindCheckout); the
 * other two still prepare a folder but are not offered in the app until they can be bound (API-1).
 */
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
  /** Pins gh to this host, whatever GH_HOST says. */
  host?: string | undefined;
}

async function gh(args: string[], options: GhOptions = {}): Promise<string> {
  const { timeout = 10_000, extraConfigPairs = [], ceilingDir, host } = options;
  const env = gitConfigEnv(
    [...HOST_GIT_CONFIG_PAIRS, ...GH_NETWORK_ALLOWLIST_PAIRS, ...extraConfigPairs],
    hostGitEnv(ceilingDir),
  );
  if (host) {
    env.GH_HOST = host;
    delete env.GH_REPO;
    delete env.GH_ENTERPRISE_TOKEN;
    delete env.GITHUB_ENTERPRISE_TOKEN;
  }
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
    key === "core.gitproxy" ||
    key === "core.alternaterefscommand" ||
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

function hasCleanRealAncestors(
  rootDir: string,
  relPath: string,
  cache?: Map<string, boolean>,
): boolean {
  const parts = relPath.split("/").filter(Boolean);
  if (parts.length <= 1) return true;
  let relAcc = "";
  let absAcc = rootDir;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const seg = parts[i]!;
    relAcc = relAcc ? `${relAcc}/${seg}` : seg;
    absAcc = join(absAcc, seg);
    const cached = cache?.get(relAcc);
    if (cached !== undefined) {
      if (!cached) return false;
      continue;
    }
    const ok = pathExistsAny(absAcc) && !lstatSync(absAcc).isSymbolicLink() && lstatSync(absAcc).isDirectory();
    cache?.set(relAcc, ok);
    if (!ok) return false;
  }
  return true;
}

async function isUnchangedHydratedLfsFile(
  repoDir: string,
  relPath: string,
  workspaceRoot: string,
): Promise<boolean> {
  if (!hasCleanRealAncestors(repoDir, relPath)) return false;
  const fullPath = join(repoDir, relPath);
  if (!pathExistsAny(fullPath)) return false;
  const st = lstatSync(fullPath);
  if (!st.isFile() || st.isSymbolicLink()) return false;

  const attrOut = await git(["check-attr", "filter", "--", relPath], {
    cwd: repoDir,
    workspaceRoot,
  }).catch(() => "");
  if (!/: filter: lfs$/.test(attrOut.trim())) return false;

  const filemodeOut = await git(["config", "--get", "core.filemode"], {
    cwd: repoDir,
    workspaceRoot,
  }).catch(() => "true");
  if (filemodeOut.trim().toLowerCase() !== "false") {
    const lsOut = await git(["ls-files", "-s", "--", relPath], {
      cwd: repoDir,
      workspaceRoot,
    }).catch(() => "");
    const indexedMode = lsOut.split(/\s+/)[0];
    const wtMode = (st.mode & 0o100) !== 0 ? "100755" : "100644";
    if (!indexedMode || indexedMode !== wtMode) return false;
  }

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
  // Always override status.showUntrackedFiles=no and diff.ignoreSubmodules=all so hidden changes still block removal.
  const raw = await gitWithBytes(
    ["status", "--porcelain=v1", "--untracked-files=normal", "--ignore-submodules=none", "-z"],
    {
      cwd: repoDir,
      workspaceRoot,
      extraEnv: filterEnv,
    },
  );
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

async function hasInitializedSubmodule(
  repoDir: string,
  workspaceRoot: string,
  extraEnv?: Record<string, string>,
): Promise<boolean> {
  const raw = await gitWithBytes(["ls-files", "-s", "-z"], {
    cwd: repoDir,
    workspaceRoot,
    ...(extraEnv !== undefined ? { extraEnv } : {}),
  });
  for (const rec of splitNullRecords(raw)) {
    const line = rec.toString("utf8");
    if (!line.startsWith("160000 ")) continue;
    const tabIdx = line.indexOf("\t");
    if (tabIdx < 0) continue;
    const relPath = line.slice(tabIdx + 1);
    if (relPath && pathExistsAny(join(repoDir, relPath, ".git"))) {
      return true;
    }
  }
  return false;
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
      if (hasHydratedLfsClean && !(await hasInitializedSubmodule(resolvedWt, workspaceRoot, filterEnv))) {
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

  const assumedUnchangedPaths: Buffer[] = [];
  const presentSkipPaths: Buffer[] = [];
  for (const rec of records) {
    if (rec.length < 3) continue;
    const tag = String.fromCharCode(rec[0]!);
    const pathBuf = rec.subarray(2);
    if (/^[a-z]$/.test(tag)) assumedUnchangedPaths.push(pathBuf);
    if (tag === "S" || tag === "s") {
      const relPath = pathBuf.toString("utf8");
      if (pathExistsAny(join(repoDir, relPath))) {
        presentSkipPaths.push(pathBuf);
      }
    }
  }

  if (assumedUnchangedPaths.length > 0) {
    await gitWithBytes(["update-index", "--no-assume-unchanged", "-z", "--stdin"], {
      cwd: repoDir,
      workspaceRoot,
      extraEnv: indexEnv,
      input: Buffer.concat([...assumedUnchangedPaths.map((p) => Buffer.concat([p, Buffer.from([0])]))]),
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

async function readSubmoduleHead(subDir: string, subBoundary: string): Promise<string | null> {
  const subGit = join(subDir, ".git");
  if (!pathExistsAny(subGit)) return null;
  resolveRepoGitDirs(subDir, subBoundary, false);
  try {
    const sha = (await git(["rev-parse", "--verify", "HEAD"], { cwd: subDir, workspaceRoot: subBoundary })).trim();
    return sha || null;
  } catch {
    return null;
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

  const ancestorCache = new Map<string, boolean>();
  const deletedPaths: Buffer[] = [];
  const cacheInfoArgs: string[] = [];
  const regularCandidates: Array<{ mode: string; prevOid: string | null; prevStage: string | null; relPath: string }> =
    [];
  const symlinkCandidates: Array<{ prevOid: string | null; prevStage: string | null; relPath: string; target: string }> =
    [];

  const subBoundary = isWithinOrEqual(workspaceRoot, repoDir) !== null ? workspaceRoot : repoDir;

  for (const [relPath, entry] of tracked) {
    if (entry.tag === "S" || entry.tag === "s") continue;
    const fullPath = join(repoDir, relPath);
    if (!hasCleanRealAncestors(repoDir, relPath, ancestorCache) || !pathExistsAny(fullPath)) {
      deletedPaths.push(Buffer.from(relPath, "utf8"));
      continue;
    }
    const st = lstatSync(fullPath);
    if (entry.mode === "160000" && st.isDirectory()) {
      const subHead = await readSubmoduleHead(fullPath, subBoundary);
      if (subHead && (entry.stage !== "0" || subHead !== entry.oid)) {
        cacheInfoArgs.push("--cacheinfo", `160000,${subHead},${relPath}`);
      }
      continue;
    }
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
    } else {
      // Tracked file was replaced by a directory (or non-file node); remove obsolete entry first.
      deletedPaths.push(Buffer.from(relPath, "utf8"));
    }
  }

  const untrackedRaw = await gitWithBytes(["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: repoDir,
    workspaceRoot,
    extraEnv: indexEnv,
  });
  for (const rec of splitNullRecords(untrackedRaw)) {
    const rawRelPath = rec.toString("utf8");
    const isDirEntry = rawRelPath.endsWith("/");
    const relPath = isDirEntry ? rawRelPath.slice(0, -1) : rawRelPath;
    if (!relPath || tracked.has(relPath)) continue;
    if (!hasCleanRealAncestors(repoDir, relPath, ancestorCache)) continue;
    const fullPath = join(repoDir, relPath);
    if (!pathExistsAny(fullPath)) continue;
    const st = lstatSync(fullPath);
    if (isDirEntry) {
      if (st.isDirectory() && pathExistsAny(join(fullPath, ".git"))) {
        const subHead = await readSubmoduleHead(fullPath, subBoundary);
        if (!subHead) {
          throw new Refusal(
            400,
            "git-failed",
            `Embedded repository has no HEAD commit to checkpoint: ${relPath}`,
          );
        }
        cacheInfoArgs.push("--cacheinfo", `160000,${subHead},${relPath}`);
      }
      continue;
    }
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
    await git(["update-index", "--add", "--replace", ...cacheInfoArgs.slice(i, i + CHUNK * 2)], {
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
    const labelSlug = safeSlug(safeSlug(opts.label ?? "snapshot").replace(/^\.+|\.{2,}/g, "-"));
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

/** Validate explicit capture input, never text headers, before recording checkout authority. */
export async function bindCheckout(selection: unknown) {
  const body = asBodyRecord(selection);
  if (typeof body.repo !== "string" || !isSafeRepoIdentifier(body.repo) ||
      typeof body.local_path !== "string" || !isAbsolute(body.local_path) ||
      typeof body.branch !== "string") {
    throw new Refusal(400, "invalid-repo-path", "Specify a prepared repository path, repository and branch.");
  }
  const root = resolveSafeWorkspaceRoot(body.workspace_root);
  const path = resolveWithoutSymlinks(body.local_path);
  if (path === root || !isContainedIn(root, path)) {
    throw new Refusal(400, "invalid-repo-path", "The checkout must be inside its workspace root.");
  }
  const branch = assertValidBranch(body.branch);
  const repo = body.repo;
  const isGithub = SAFE_OWNER_REPO.test(repo);
  const repoName = isGithub ? repo.split("/")[1]!.replace(/\.git$/i, "") : repo;
  const base = join(root, repoName);
  const linked = join(root, ".worktrees", repoName, safeSlug(branch));
  const fresh = join(root, `${repoName}-${safeSlug(branch)}`);
  if (![base, linked, fresh].includes(path)) {
    throw new Refusal(409, "repo-identity-mismatch", "The checkout path does not match the prepared repository and branch.");
  }
  // The author gets write access to the checkout. A base or fresh clone keeps .git inside it, so
  // hooks and config would be writable; only a linked worktree keeps Git administration outside.
  // The fresh-clone and branch strategies are therefore not offered in the app (API-1). Binding a fresh
  // clone would need its Git folder kept outside the checkout (for example --separate-git-dir) and the
  // daemon's custody checks qualified for it; that is a follow-up, not done here.
  if (path !== linked) {
    throw new Refusal(409, "checkout-not-linked-worktree", "A card can only work in its own git worktree. A fresh clone or a branch in your main clone keeps Git's own files inside the folder, where the agent could change them.");
  }
  return withGitRefusal(async () => {
    await validateExistingRepoDir(path, root, isGithub);
    const opts = { cwd: path, workspaceRoot: root };
    const actualBranch = await git(["symbolic-ref", "--short", "HEAD"], opts);
    if (actualBranch !== branch) {
      throw new Refusal(409, "invalid-branch", "The prepared checkout is on a different branch. Prepare it again.");
    }
    if (isGithub) {
      const origin = await git(["remote", "get-url", "origin"], opts);
      if (parseGithubOwnerRepoFromUrl(origin) !== repo.replace(/\.git$/i, "").toLowerCase()) {
        throw new Refusal(409, "repo-identity-mismatch", "The checkout points to a different repository.");
      }
    }
    const head = await git(["rev-parse", "--verify", "HEAD^{commit}"], opts);
    const gitDir = await git(["rev-parse", "--absolute-git-dir"], opts);
    const commonDir = await git(["rev-parse", "--path-format=absolute", "--git-common-dir"], opts);
    // The worktree must belong to the named repository: its common Git directory is the base
    // clone's own, not another repository's placed at this path (GitHub origin is checked above).
    if (resolveWithoutSymlinks(commonDir) !== resolveWithoutSymlinks(join(base, ".git"))) {
      throw new Refusal(409, "repo-identity-mismatch", "The worktree does not belong to the named repository's base clone.");
    }
    for (const dir of [gitDir, commonDir]) {
      const real = resolveWithoutSymlinks(dir);
      if (!isContainedIn(root, real)) {
        throw new Refusal(400, "invalid-repo-path", "Git administration must stay inside the workspace root.");
      }
      if (real === path || isContainedIn(path, real)) {
        throw new Refusal(409, "checkout-not-linked-worktree", "Git administration is inside the checkout, so the author would be able to write it.");
      }
    }
    return { repo, root, path, branch, head, git_dir: gitDir, common_dir: commonDir };
  });
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
  try {
    const targetFilterEnv = await filterDisableEnv(targetDir, ctx.workspaceRoot, "safecrlf-only");
    await git(["checkout", "-b", ctx.branch, ...(ctx.baseBranch ? [ctx.baseBranch] : [])], {
      cwd: targetDir,
      workspaceRoot: ctx.workspaceRoot,
      extraEnv: targetFilterEnv,
    });
  } catch (err) {
    rmSync(targetDir, { recursive: true, force: true });
    throw err;
  }
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

function parseRepoSnapshotRequest(rawBody: unknown): {
  workspaceRoot: string;
  repoPath: string;
  label: string | undefined;
} {
  const body = asBodyRecord(rawBody);
  const workspaceRoot = resolveSafeWorkspaceRoot(body.workspace_root);
  if (typeof body.repo_path !== "string" || !body.repo_path.trim()) {
    throw new Refusal(400, "invalid-repo-path", "repo_path must be inside the workspace root.");
  }
  if (body.label !== undefined && typeof body.label !== "string") {
    throw new Refusal(400, "invalid", "label must be a string.");
  }
  return { workspaceRoot, repoPath: body.repo_path, label: body.label };
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
        repo_path: ctx.baseCloneDir,
        scaffolded_dirs: scaffoldedDirs,
      };
    });
  });

  app.post<{
    Body: { repo_path?: string; label?: string; workspace_root?: string };
  }>("/repos/checkpoint", async (req) => {
    await person(req);
    const { workspaceRoot, repoPath, label } = parseRepoSnapshotRequest(req.body);
    return withGitRefusal(async () => {
      const result = await createCheckpoint({
        repoDir: repoPath,
        workspaceRoot,
        ...(label !== undefined ? { label } : {}),
      });
      return { ok: true, ...result };
    });
  });

  app.post<{
    Body: { repo_path?: string; label?: string; workspace_root?: string };
  }>("/repos/freeze", async (req) => {
    await person(req);
    const { workspaceRoot, repoPath, label } = parseRepoSnapshotRequest(req.body);
    return withGitRefusal(async () => {
      const result = await freezeWorkspace({
        repoDir: repoPath,
        workspaceRoot,
        ...(label !== undefined ? { label } : {}),
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

/** What publishing an accepted card's checkout did. */
/**
 * The state and check rollup of a pull request on github.com, read-only, as gh prints them. Only a
 * plain https://github.com/<owner>/<repo>/pull/<n> link is read; anything else is refused.
 */
export async function readPullRequestFacts(url: string, timeout = 8_000): Promise<string> {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/[1-9][0-9]*$/.exec(url);
  if (!m || /^\.+$/.test(m[1]!) || /^\.+$/.test(m[2]!)) throw new Error("not a GitHub pull request link");
  return gh(["pr", "view", url, "--json", "state,statusCheckRollup"], { timeout, host: "github.com" });
}

export type PublishResult =
  | { opened: true; url: string; branch: string; head: string; reused: boolean }
  | { opened: false; reason: "not-github" | "no-changes" | "failed" | "lane"; detail: string };

/** What goes out: exactly the accepted work, built from recorded inputs, never from the live tree. */
export interface PublishInput {
  /** owner/name on github.com. */
  repo: string;
  /** The workspace root and the bound linked worktree, used only to find the repository. */
  root: string;
  path: string;
  /** The commit the card was bound to, and the commit the accepted author run ended on (same or a descendant). */
  boundHead: string;
  finalHead: string;
  /** The accepted patch output, applied on finalHead in a private index; null when the author committed instead. */
  patch: Buffer | null;
  /** A branch only this package revision publishes to, e.g. controlrod/WP-12-r0. */
  publishBranch: string;
  title: string;
  body: string;
  /** When the work was accepted (ISO time). The commit carries it, so a retry rebuilds the same commit. */
  acceptedAt: string;
  /** Asked right before anything leaves: may this work still go out (its lane)? */
  stillAllowed: () => Promise<boolean>;
  /** Epoch ms after which nothing new is sent: the attempt's claim (the lane barrier) may have run out. */
  deadline?: number;
}

/** Any path inside one of Control Rod's reserved run folders. */
const RUN_DIR_PATH = /(^|\/)\.controlrod-run-[^/]*(\/|$)/i;

/**
 * Opens a draft pull request for accepted work.
 *
 * What may leave the machine is one commit (the bound commit plus the accepted patch, the
 * deliverable the checker reviewed), to one branch of its own, on one repository on github.com.
 * Nothing about the checkout may change that, so the checkout is used only as a store of objects:
 * the commit is built and pushed from an empty scratch repository made here, with no config of the
 * user's, the system's or the checkout's, no hooks, no remotes, and the target given as a URL. The
 * bound commit must already be in the default branch's history on GitHub, so the pull request holds
 * exactly the one checked commit; the commit has a fixed identity and the accept time, so a retry
 * rebuilds the very same commit. The pull request is a draft against the default branch, so the
 * owner's merge stays the check-in. The caller holds the lane barrier (see publishAccepted);
 * `stillAllowed` is asked again before the push and before the pull request, and `deadline` stops
 * a slow attempt before it sends anything once its claim could have run out.
 */
export async function publishCheckout(input: PublishInput, testing: { pushUrl?: string; onBase?: (oid: string, base: string) => Promise<boolean>; defaultBranch?: string } = {}): Promise<PublishResult> {
  const branch = assertValidBranch(input.publishBranch);
  const root = resolveSafeWorkspaceRoot(input.root);
  const path = resolveWithoutSymlinks(input.path);
  if (path === root || !isContainedIn(root, path)) return { opened: false, reason: "failed", detail: "The checkout is not inside its workspace root." };
  // A project bound to a local clone names the clone, not owner/name. When the clone's origin is on
  // GitHub, that is the repository the pull request goes to (most projects are made this way).
  let repo = input.repo;
  if (!SAFE_OWNER_REPO.test(repo)) repo = parseGithubOwnerRepoFromUrl(await getOriginRemoteUrl(path, root)) ?? "";
  if (!SAFE_OWNER_REPO.test(repo)) return { opened: false, reason: "not-github", detail: "Only a GitHub repository gets a pull request; the work stays on its local branch." };
  if (!/^[0-9a-f]{40,64}$/.test(input.boundHead) || !/^[0-9a-f]{40,64}$/.test(input.finalHead)) return { opened: false, reason: "failed", detail: "The recorded commits are not commit ids." };
  if (input.finalHead !== input.boundHead) return { opened: false, reason: "failed", detail: "The author committed on the branch, and the check reviewed only the patch, so nothing was pushed. Open the pull request yourself after reviewing those commits." };
  if (!input.patch || input.patch.length === 0) return { opened: false, reason: "no-changes", detail: "The accepted work has no patch for the repository, so there is nothing to open a pull request for." };
  const owner = repo.replace(/\.git$/i, "");
  const when = new Date(input.acceptedAt);
  if (Number.isNaN(when.getTime())) return { opened: false, reason: "failed", detail: "The accept decision has no usable time." };
  const late = () => input.deadline !== undefined && Date.now() > input.deadline;
  const scratch = mkdtempSyncSafe();
  try {
    // The checkout's object store, and nothing else of it.
    const common = await git(["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: path, workspaceRoot: root });
    const objects = resolveWithoutSymlinks(join(common, "objects"));
    if (!isContainedIn(root, objects)) return { opened: false, reason: "failed", detail: "The checkout's objects are outside its workspace root." };
    // An empty repository of our own: no user, system or checkout config, no hooks, no remotes.
    const repo = join(scratch, "repo.git");
    const home = join(scratch, "home");
    mkdirSync(home, { mode: 0o700 });
    const clean = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "/dev/null", GIT_NO_REPLACE_OBJECTS: "1", HOME: home, XDG_CONFIG_HOME: home };
    await git(["init", "-q", "--bare", repo], { cwd: scratch, workspaceRoot: scratch, extraEnv: clean });
    writeFileSync(join(repo, "objects", "info", "alternates"), `${objects}\n`, { mode: 0o600 });
    const index = join(scratch, "index");
    const patchFile = join(scratch, "accepted.patch");
    writeFileSync(patchFile, input.patch, { mode: 0o600 });
    const env = { ...clean, GIT_DIR: repo, GIT_INDEX_FILE: index };
    const opts = { cwd: scratch, workspaceRoot: scratch, timeout: 60_000, extraEnv: env };
    // No redirects (a renamed repository must not take the push elsewhere), TLS always verified.
    const pinned = ["-c", "push.followTags=false", "-c", "push.recurseSubmodules=no", "-c", "push.gpgSign=false", "-c", "http.followRedirects=false", "-c", "http.sslVerify=true"];
    await git(["cat-file", "-e", `${input.boundHead}^{commit}`], opts);
    // Build the candidate: the bound commit plus the accepted patch, in a private index.
    await git(["read-tree", input.boundHead], opts);
    await git(["apply", "--cached", "--whitespace=nowarn", patchFile], opts);
    const tree = await git(["write-tree"], opts);
    if (tree === (await git(["rev-parse", `${input.boundHead}^{tree}`], opts))) return { opened: false, reason: "no-changes", detail: "The accepted patch changes nothing in the repository, so there is nothing to open a pull request for." };
    // Nothing under a reserved run folder may change, whether added, edited or removed. Paths are
    // read NUL-separated, never as quoted text.
    const touched = await git(["diff-tree", "-r", "-z", "--no-renames", "--name-only", input.boundHead, tree], opts);
    if (touched.split("\0").some((l) => RUN_DIR_PATH.test(l))) return { opened: false, reason: "failed", detail: "The accepted patch touches a .controlrod-run-* folder; nothing was pushed." };
    // A fixed identity and the accept time make the commit depend only on what was accepted.
    const date = `${Math.floor(when.getTime() / 1000)} +0000`;
    const who = {
      GIT_AUTHOR_NAME: "Control Rod", GIT_AUTHOR_EMAIL: "controlrod@localhost", GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: "Control Rod", GIT_COMMITTER_EMAIL: "controlrod@localhost", GIT_COMMITTER_DATE: date,
    };
    const head = await git(["commit-tree", tree, "-p", input.boundHead, "-m", input.title.slice(0, 200), "-m", "Accepted in Control Rod."], { ...opts, extraEnv: { ...env, ...who } });
    const ghOpts = { timeout: 30_000, ceilingDir: root, host: "github.com" };
    const repoArg = `github.com/${owner}`;
    const base = testing.defaultBranch ?? (await gh(["repo", "view", repoArg, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], ghOpts)).trim();
    assertValidBranch(base, "default branch");
    // The bound commit must already be in the default branch's history on GitHub (not only in a fork
    // or on another branch), so the pull request holds exactly the one checked commit.
    const onBase = testing.onBase ?? (async (oid: string, b: string) => {
      const status = await gh(["api", `repos/${owner}/compare/${encodeURIComponent(b)}...${oid}`, "--jq", ".status"], ghOpts).catch(() => "");
      return status.trim() === "identical" || status.trim() === "behind";
    });
    if (!(await onBase(input.boundHead, base))) return { opened: false, reason: "failed", detail: `The commit this card started from is not on ${base} on GitHub, so a pull request would carry commits nobody checked. Push or merge the base first.` };
    const target = testing.pushUrl ?? `https://github.com/${owner}.git`;
    const cred = ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"];
    // These git processes run with an empty home of their own, so `gh auth git-credential` cannot
    // find the person's GitHub sign-in there and the push is refused. The token is read once with
    // the person's own environment and given only to these git processes and their helper.
    const token = process.env.GH_TOKEN || (await gh(["auth", "token", "--hostname", "github.com"], ghOpts).catch(() => ""));
    const pushOpts = token ? { ...opts, extraEnv: { ...env, GH_TOKEN: token } } : opts;
    // The branch is this package revision's own: absent, or already exactly this commit (a retry).
    const remote = await git([...pinned, ...cred, "ls-remote", target, `refs/heads/${branch}`], pushOpts);
    const there = remote.split(/\s+/)[0] ?? "";
    if (there && there !== head) return { opened: false, reason: "failed", detail: `The branch ${branch} already exists on GitHub with other work; nothing was pushed.` };
    // Before anything is sent: the lane first, then the deadline, so a slow lane read cannot outlast the claim.
    const gate = async (what: string): Promise<PublishResult | null> => {
      if (!(await input.stillAllowed())) return { opened: false, reason: "lane", detail: `The work's lane was raised, so ${what}.` };
      if (late()) return { opened: false, reason: "failed", detail: `Opening the pull request took too long, so ${what}; it is tried again later.` };
      return null;
    };
    if (!there) {
      const stop = await gate("nothing was pushed");
      if (stop) return stop;
      await git([...pinned, ...cred, "push", "--no-follow-tags", "--no-recurse-submodules", "--no-verify", `--force-with-lease=refs/heads/${branch}:`, target, `${head}:refs/heads/${branch}`], { ...pushOpts, timeout: 90_000 });
    }
    // The base may have moved while the push ran: it must still be the default branch, with the bound commit in its history.
    const baseNow = testing.defaultBranch ?? (await gh(["repo", "view", repoArg, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], ghOpts)).trim();
    if (baseNow !== base || !(await onBase(input.boundHead, base))) return { opened: false, reason: "failed", detail: `The default branch changed while the work was pushed, so no pull request was opened; the branch ${branch} is on GitHub. It is tried again later.` };
    // Only an open draft from this repository's own branch, at exactly this head and base, is this card's.
    const listing = await gh(["pr", "list", "--repo", repoArg, "--head", branch, "--base", base, "--state", "open", "--json", "url,headRefOid,isDraft,isCrossRepository,headRepositoryOwner,headRefName"], ghOpts);
    const ownerLogin = owner.split("/")[0]!.toLowerCase();
    const found = (JSON.parse(listing || "[]") as { url: string; headRefOid: string; isDraft?: boolean; isCrossRepository?: boolean; headRepositoryOwner?: { login?: string }; headRefName?: string }[])
      .find((p) => p.headRefOid === head && p.isDraft === true && p.isCrossRepository === false && p.headRefName === branch && String(p.headRepositoryOwner?.login ?? "").toLowerCase() === ownerLogin);
    const stop = await gate(`no pull request was opened (the branch ${branch} is on GitHub; delete it there if it must not stay)`);
    if (stop) return stop;
    const url = found?.url ?? (await gh(["pr", "create", "--repo", repoArg, "--head", branch, "--base", base, "--draft", "--title", input.title.slice(0, 250), "--body", input.body.slice(0, 60_000)], ghOpts));
    const link = url.split("\n").reverse().find((l) => new RegExp(`^https://github\\.com/${owner.replace(/[.]/g, "\\.")}/pull/\\d+$`, "i").test(l.trim()))?.trim();
    if (!link) return { opened: false, reason: "failed", detail: "gh did not return a pull request link for this repository." };
    // The receipt is what GitHub holds, not what was asked for: this exact commit, on this base, as a draft from this repository.
    const pr = JSON.parse(await gh(["pr", "view", link, "--json", "headRefOid,baseRefName,isDraft,isCrossRepository,headRefName"], ghOpts)) as { headRefOid?: string; baseRefName?: string; isDraft?: boolean; isCrossRepository?: boolean; headRefName?: string };
    if (pr.headRefOid !== head || pr.baseRefName !== base || pr.isDraft !== true || pr.isCrossRepository !== false || pr.headRefName !== branch) {
      return { opened: false, reason: "failed", detail: `The pull request ${link} does not hold exactly the accepted commit as a draft against ${base}; it is not recorded as this card's.` };
    }
    return { opened: true, url: link, branch, head, reused: Boolean(there || found) };
  } catch (e) {
    const msg = (e as { stderr?: string }).stderr || (e as Error).message || String(e);
    return { opened: false, reason: "failed", detail: msg.replace(/\s+/g, " ").trim().slice(0, 400) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function mkdtempSyncSafe(): string {
  return mkdtempSync(join(tmpdir(), "controlrod-publish-"));
}
