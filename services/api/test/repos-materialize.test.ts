import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Refusal } from "../src/refusal.js";
import { teach } from "../src/refusals.js";
import {
  isContainedIn,
  isSafeRepoIdentifier,
  parseGithubOwnerRepoFromUrl,
  pathExistsAny,
  realpathOrNearest,
  repoRoutes,
  resolveSafeWorkspaceRoot,
} from "../src/repos.js";

function gitInitRepo(dir: string, originUrl?: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "README.md"), "# test\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: dir, stdio: "ignore" });
  if (originUrl) {
    execFileSync("git", ["remote", "add", "origin", originUrl], { cwd: dir, stdio: "ignore" });
  }
}

function buildTestApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Refusal) {
      const taught = teach(err.code);
      return reply.code(err.status).send({
        code: err.code,
        message: err.message,
        change: taught.change,
        ...(taught.floor ? { floor: true } : {}),
      });
    }
    throw err;
  });
  repoRoutes(app, async () => "person-test");
  return app;
}

describe("repos.ts hardening", () => {
  let tempHome: string;
  let origHome: string | undefined;
  let origWsRoot: string | undefined;
  let origPath: string | undefined;
  let origGitDir: string | undefined;

  beforeEach(() => {
    origHome = process.env.HOME;
    origWsRoot = process.env.CONTROLROD_WORKSPACE_ROOT;
    origPath = process.env.PATH;
    origGitDir = process.env.GIT_DIR;
    tempHome = mkdtempSync(join(tmpdir(), "controlrod-repos-test-"));
    process.env.HOME = tempHome;
    delete process.env.CONTROLROD_WORKSPACE_ROOT;
  });

  afterEach(() => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    if (origWsRoot === undefined) delete process.env.CONTROLROD_WORKSPACE_ROOT;
    else process.env.CONTROLROD_WORKSPACE_ROOT = origWsRoot;
    if (origPath === undefined) delete process.env.PATH;
    else process.env.PATH = origPath;
    if (origGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = origGitDir;
    rmSync(tempHome, { recursive: true, force: true });
  });

  describe("isSafeRepoIdentifier", () => {
    it("rejects empty, dot segments, leading dashes, and leading dots", () => {
      const invalid = [
        "",
        " ",
        ".",
        "..",
        "owner/.",
        "owner/..",
        "./repo",
        "../repo",
        "-u/repo",
        "owner/-repo",
        "-local",
        ".git",
        ".worktrees",
        ".hidden/repo",
        "owner/.git",
        "owner/.worktrees",
        "a/b/c",
        "foo bar",
      ];
      for (const candidate of invalid) {
        expect(isSafeRepoIdentifier(candidate), candidate).toBe(false);
      }
    });

    it("accepts valid owner/name, owner/name.git, and local repo names", () => {
      const valid = ["owner/name", "FlyFission/Control-Rod", "FlyFission/Control-Rod.git", "local-repo", "my_repo.1"];
      for (const candidate of valid) {
        expect(isSafeRepoIdentifier(candidate), candidate).toBe(true);
      }
    });
  });

  describe("realpathOrNearest, pathExistsAny, and isContainedIn", () => {
    it("detects dangling symlinks via pathExistsAny and refuses symlinks in realpathOrNearest", () => {
      const ws = join(tempHome, "projects");
      mkdirSync(ws, { recursive: true });
      const dangling = join(ws, "dangling");
      symlinkSync(join(ws, "nonexistent-target"), dangling);

      expect(pathExistsAny(dangling)).toBe(true);
      expect(() => realpathOrNearest(dangling)).toThrowError(Refusal);

      const realSub = join(tempHome, "real-sub");
      mkdirSync(realSub, { recursive: true });
      const linkParent = join(ws, "link-parent");
      symlinkSync(realSub, linkParent);
      expect(() => realpathOrNearest(join(linkParent, "child"))).toThrowError(Refusal);
    });

    it("refuses equal paths and external paths in isContainedIn", () => {
      const ws = join(tempHome, "projects");
      mkdirSync(ws, { recursive: true });
      expect(isContainedIn(ws, ws)).toBe(false);
      expect(isContainedIn(ws, tempHome)).toBe(false);
      expect(isContainedIn(ws, join(ws, "repo"))).toBe(true);

      const link = join(ws, "sym");
      symlinkSync(join(ws, "missing"), link);
      expect(() => isContainedIn(ws, link)).toThrowError(Refusal);
    });
  });

  describe("resolveSafeWorkspaceRoot", () => {
    it("rejects $HOME itself, dot directories under $HOME, and paths outside $HOME", () => {
      for (const bad of [tempHome, "~", "~/.ssh", "~/.config/gh", "~/.claude", "../outside", "/tmp"]) {
        expect(() => resolveSafeWorkspaceRoot(bad), bad).toThrowError(Refusal);
      }
    });

    it("accepts non-dot folders inside $HOME", () => {
      const resolved = resolveSafeWorkspaceRoot("~/projects");
      expect(resolved).toBe(join(tempHome, "projects"));
    });

    it("rejects non-string workspace_root values with 400 invalid-workspace-root", () => {
      expect(() => resolveSafeWorkspaceRoot(["a", "b"])).toThrowError(Refusal);
    });
  });

  describe("parseGithubOwnerRepoFromUrl", () => {
    it("parses HTTPS, SSH SCP, and ssh.github.com URLs to lowercase owner/name", () => {
      expect(parseGithubOwnerRepoFromUrl("https://github.com/FlyFission/Control-Rod.git")).toBe(
        "flyfission/control-rod",
      );
      expect(parseGithubOwnerRepoFromUrl("https://github.com/FlyFission/Control-Rod")).toBe("flyfission/control-rod");
      expect(parseGithubOwnerRepoFromUrl("https://github.com/FlyFission/Control-Rod/")).toBe("flyfission/control-rod");
      expect(parseGithubOwnerRepoFromUrl("https://github.com/FlyFission/Control-Rod.git/")).toBe(
        "flyfission/control-rod",
      );
      expect(parseGithubOwnerRepoFromUrl("git@github.com:FlyFission/Control-Rod.git")).toBe("flyfission/control-rod");
      expect(parseGithubOwnerRepoFromUrl("git@github.com:FlyFission/Control-Rod/")).toBe("flyfission/control-rod");
      expect(parseGithubOwnerRepoFromUrl("git@ssh.github.com:FlyFission/Control-Rod")).toBe("flyfission/control-rod");
      expect(parseGithubOwnerRepoFromUrl("ssh://git@ssh.github.com:443/FlyFission/Control-Rod.git")).toBe(
        "flyfission/control-rod",
      );
    });

    it("rejects non-GitHub hosts and preserves non-.git suffixes so mismatches fail", () => {
      expect(parseGithubOwnerRepoFromUrl("https://evil.example/github.com/owner/repo")).toBeNull();
      expect(parseGithubOwnerRepoFromUrl("git@evil.example:github.com/owner/repo")).toBeNull();
      expect(parseGithubOwnerRepoFromUrl("http://github.com/owner/repo")).toBeNull();
      expect(parseGithubOwnerRepoFromUrl("https://github.com/owner/repo/extra")).toBeNull();
      const parsedEvilSuffix = parseGithubOwnerRepoFromUrl("https://github.com/owner/name.evil");
      expect(parsedEvilSuffix).not.toBe("owner/name");
    });
  });

  describe("POST /repos/materialize route hardening", () => {
    it("rejects invalid strategy, dot-segments, and non-string repo/branch", async () => {
      const app = buildTestApp();
      try {
        const badStrategy = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "owner/repo", branch: "feat/x", strategy: "mirror" },
        });
        expect(badStrategy.statusCode).toBe(400);
        expect(badStrategy.json().code).toBe("invalid-strategy");

        for (const badRepo of [".", "..", "owner/..", ".git", "-u/repo"]) {
          const r = await app.inject({
            method: "POST",
            url: "/repos/materialize",
            payload: { repo: badRepo, branch: "feat/x" },
          });
          expect(r.statusCode, badRepo).toBe(400);
          expect(r.json().code, badRepo).toBe("invalid-repo");
        }

        const nonStringRepo = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: 123, branch: "feat/x" },
        });
        expect(nonStringRepo.statusCode).toBe(400);
        expect(nonStringRepo.json().code).toBe("invalid-repo");

        const nonStringBranch = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "owner/repo", branch: { bad: true } },
        });
        expect(nonStringBranch.statusCode).toBe(400);
        expect(nonStringBranch.json().code).toBe("invalid-branch");
      } finally {
        await app.close();
      }
    });

    it("returns 409 repo-identity-mismatch when reusing baseCloneDir with wrong or missing origin", async () => {
      const ws = join(tempHome, "projects");
      const baseDir = join(ws, "Control-Rod");
      gitInitRepo(baseDir, "https://github.com/someone-else/Control-Rod.git");

      const app = buildTestApp();
      try {
        const r1 = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "FlyFission/Control-Rod", branch: "feat/test", strategy: "branch" },
        });
        expect(r1.statusCode).toBe(409);
        expect(r1.json().code).toBe("repo-identity-mismatch");

        execFileSync("git", ["remote", "set-url", "origin", "https://github.com/FlyFission/Control-Rod.evil"], {
          cwd: baseDir,
        });
        const r2 = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "FlyFission/Control-Rod", branch: "feat/test", strategy: "worktree" },
        });
        expect(r2.statusCode).toBe(409);
        expect(r2.json().code).toBe("repo-identity-mismatch");
      } finally {
        await app.close();
      }
    });

    it("never walks up to $HOME/.git when reusing a plain non-git folder", async () => {
      gitInitRepo(tempHome); // dotfiles repo at $HOME/.git
      const ws = join(tempHome, "projects");
      const plainDir = join(ws, "plain");
      mkdirSync(plainDir, { recursive: true });
      writeFileSync(join(plainDir, "hello.txt"), "not a git repo\n");

      const app = buildTestApp();
      try {
        const rLocalBranch = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "plain", branch: "feat/x", strategy: "branch" },
        });
        expect(rLocalBranch.statusCode).toBe(404);
        expect(rLocalBranch.json().code).toBe("repo-not-found");

        const rGithubWorktree = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "FlyFission/plain", branch: "feat/x", strategy: "worktree" },
        });
        expect(rGithubWorktree.statusCode).toBe(409);
        expect(rGithubWorktree.json().code).toBe("workspace-exists");
      } finally {
        await app.close();
      }
    });

    it("never walks up to a .git placed directly inside workspaceRoot", async () => {
      const ws = join(tempHome, "projects");
      gitInitRepo(ws, "https://github.com/FlyFission/Control-Rod.git");
      const plainDir = join(ws, "plain");
      mkdirSync(plainDir, { recursive: true });
      writeFileSync(join(plainDir, "hello.txt"), "not a git repo\n");

      const app = buildTestApp();
      try {
        const rLocalBranch = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "plain", branch: "feat/x", strategy: "branch" },
        });
        expect(rLocalBranch.statusCode).toBe(404);
        expect(rLocalBranch.json().code).toBe("repo-not-found");

        const rGithubWorktree = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "FlyFission/plain", branch: "feat/x", strategy: "worktree" },
        });
        expect(rGithubWorktree.statusCode).toBe(409);
        expect(rGithubWorktree.json().code).toBe("workspace-exists");
      } finally {
        await app.close();
      }
    });

    it("fresh-clone rejects local non-git baseCloneDir and pre-existing dangling symlink at targetDir", async () => {
      const ws = join(tempHome, "projects");
      const plainDir = join(ws, "plain");
      mkdirSync(plainDir, { recursive: true });

      const validLocal = join(ws, "myrepo");
      gitInitRepo(validLocal);
      const danglingTarget = join(ws, "myrepo-feat-dangling");
      symlinkSync(join(ws, "does-not-exist"), danglingTarget);

      const app = buildTestApp();
      try {
        const rNonGit = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "plain", branch: "feat/one", strategy: "fresh-clone" },
        });
        expect(rNonGit.statusCode).toBe(404);
        expect(rNonGit.json().code).toBe("repo-not-found");

        const rDangling = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "myrepo", branch: "feat/dangling", strategy: "fresh-clone" },
        });
        expect(rDangling.statusCode).toBe(409);
        expect(rDangling.json().code).toBe("workspace-exists");
      } finally {
        await app.close();
      }
    });

    it("branch strategy refuses dirty baseCloneDir", async () => {
      const ws = join(tempHome, "projects");
      const localRepo = join(ws, "dirty-repo");
      gitInitRepo(localRepo);
      writeFileSync(join(localRepo, "untracked.txt"), "dirty\n");

      const app = buildTestApp();
      try {
        const r = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "dirty-repo", branch: "feat/clean", strategy: "branch" },
        });
        expect([400, 409]).toContain(r.statusCode);
        expect(["workspace-exists", "git-failed"]).toContain(r.json().code);
      } finally {
        await app.close();
      }
    });

    it("rejects .git gitfile pointing outside workspace and strips unsafe GIT_DIR env", async () => {
      const ws = join(tempHome, "projects");
      const outsideGit = join(tempHome, "outside-git");
      gitInitRepo(outsideGit);
      const evilRepo = join(ws, "evil");
      mkdirSync(evilRepo, { recursive: true });
      writeFileSync(join(evilRepo, ".git"), `gitdir: ${join(outsideGit, ".git")}\n`);

      process.env.GIT_DIR = join(outsideGit, ".git");

      const app = buildTestApp();
      try {
        const r = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "evil", branch: "feat/pwn", strategy: "worktree" },
        });
        expect(r.statusCode).toBe(400);
        expect(r.json().code).toBe("invalid-workspace-root");
      } finally {
        await app.close();
      }
    });

    it("rejects .git gitfile pointing to nonexistent path or regular file inside workspaceRoot", async () => {
      const ws = join(tempHome, "projects");
      const missingTargetRepo = join(ws, "missing-gitdir");
      mkdirSync(missingTargetRepo, { recursive: true });
      writeFileSync(join(missingTargetRepo, ".git"), `gitdir: ${join(ws, "no-such-dir")}\n`);

      const fileTargetRepo = join(ws, "file-gitdir");
      mkdirSync(fileTargetRepo, { recursive: true });
      const regularFile = join(ws, "not-a-dir");
      writeFileSync(regularFile, "plain file\n");
      writeFileSync(join(fileTargetRepo, ".git"), `gitdir: ${regularFile}\n`);

      const app = buildTestApp();
      try {
        const rMissing = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "missing-gitdir", branch: "feat/x", strategy: "worktree" },
        });
        expect(rMissing.statusCode).toBe(400);
        expect(rMissing.json().code).toBe("invalid-workspace-root");

        const rFile = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "file-gitdir", branch: "feat/x", strategy: "worktree" },
        });
        expect(rFile.statusCode).toBe(400);
        expect(rFile.json().code).toBe("invalid-workspace-root");
      } finally {
        await app.close();
      }
    });

    it("converts mkdirSync ENOTDIR errors on workspace_root into 400 invalid-workspace-root", async () => {
      writeFileSync(join(tempHome, "somefile"), "not a directory\n");
      const app = buildTestApp();
      try {
        const res = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: {
            repo: "owner/repo",
            branch: "feat/x",
            workspace_root: "~/somefile/sub",
          },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe("invalid-workspace-root");
      } finally {
        await app.close();
      }
    });

    it("gh() injects GIT_CONFIG_COUNT/KEY/VALUE env without writing core.hooksPath into .git/config", async () => {
      const binDir = join(tempHome, "bin");
      mkdirSync(binDir, { recursive: true });
      const envLogPath = join(tempHome, "gh-env.json");
      const stubGhPath = join(binDir, "gh");

      // Stub `gh repo clone <repo> <dest>` creates a real git repo at <dest> and logs GIT_CONFIG_* env vars.
      writeFileSync(
        stubGhPath,
        `#!/usr/bin/env node
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const args = process.argv.slice(2);
const captured = {
  args,
  GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT,
  GIT_CEILING_DIRECTORIES: process.env.GIT_CEILING_DIRECTORIES,
  GIT_DIR: process.env.GIT_DIR ?? null,
  GIT_CONFIG_COUNT: process.env.GIT_CONFIG_COUNT,
  configs: [],
};
const count = Number(process.env.GIT_CONFIG_COUNT || 0);
for (let i = 0; i < count; i++) {
  captured.configs.push([process.env["GIT_CONFIG_KEY_" + i], process.env["GIT_CONFIG_VALUE_" + i]]);
}
fs.writeFileSync(${JSON.stringify(envLogPath)}, JSON.stringify(captured, null, 2));
if (args[0] === "repo" && args[1] === "clone") {
  const dest = args[3];
  fs.mkdirSync(dest, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: dest });
  execFileSync("git", ["config", "user.email", "stub@example.com"], { cwd: dest });
  execFileSync("git", ["config", "user.name", "Stub"], { cwd: dest });
  fs.writeFileSync(dest + "/README.md", "stub\\n");
  execFileSync("git", ["add", "README.md"], { cwd: dest });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dest });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/" + args[2] + ".git"], { cwd: dest });
}
`,
      );
      chmodSync(stubGhPath, 0o755);

      process.env.PATH = `${binDir}:${origPath ?? ""}`;
      process.env.GIT_DIR = "/tmp/should-be-stripped";

      const app = buildTestApp();
      try {
        const res = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "FlyFission/Control-Rod", branch: "feat/gh-env", strategy: "fresh-clone" },
        });
        expect(res.statusCode).toBe(200);
        const targetDir = res.json().local_path as string;
        expect(existsSync(envLogPath)).toBe(true);

        const captured = JSON.parse(readFileSync(envLogPath, "utf8")) as {
          args: string[];
          GIT_TERMINAL_PROMPT: string;
          GIT_CEILING_DIRECTORIES: string;
          GIT_DIR: string | null;
          GIT_CONFIG_COUNT: string;
          configs: Array<[string, string]>;
        };

        expect(captured.args).toEqual(["repo", "clone", "FlyFission/Control-Rod", targetDir]);
        expect(captured.GIT_TERMINAL_PROMPT).toBe("0");
        expect(captured.GIT_CEILING_DIRECTORIES).toBe(join(tempHome, "projects"));
        expect(captured.GIT_DIR).toBeNull();
        expect(Number(captured.GIT_CONFIG_COUNT)).toBeGreaterThanOrEqual(15);
        expect(captured.configs).toEqual(
          expect.arrayContaining([
            ["core.hooksPath", "/dev/null"],
            ["core.fsmonitor", "false"],
            ["protocol.ext.allow", "never"],
            ["protocol.allow", "never"],
            ["protocol.https.allow", "always"],
            ["protocol.ssh.allow", "always"],
          ]),
        );

        const gitConfig = readFileSync(join(targetDir, ".git", "config"), "utf8");
        expect(gitConfig).not.toContain("hooksPath");
      } finally {
        await app.close();
      }
    });

    it("worktree skips fetch when local repo has no origin and surfaces fetch errors when origin fails", async () => {
      const ws = join(tempHome, "projects");
      const localOnly = join(ws, "local-only");
      gitInitRepo(localOnly);

      const brokenOrigin = join(ws, "broken-origin");
      gitInitRepo(brokenOrigin, "file:///nonexistent/remote/repo.git");

      const app = buildTestApp();
      try {
        const okRes = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "local-only", branch: "feat/no-origin", strategy: "worktree" },
        });
        expect(okRes.statusCode).toBe(200);
        expect(okRes.json().local_path).toBe(join(ws, ".worktrees", "local-only", "feat-no-origin"));

        const failRes = await app.inject({
          method: "POST",
          url: "/repos/materialize",
          payload: { repo: "broken-origin", branch: "feat/fail", strategy: "worktree" },
        });
        expect(failRes.statusCode).toBe(400);
        expect(failRes.json().code).toBe("git-failed");
      } finally {
        await app.close();
      }
    });
  });

  describe("GET /repos route hardening", () => {
    it("returns 400 invalid-workspace-root for repeated workspace_root query params", async () => {
      const app = buildTestApp();
      try {
        const res = await app.inject({
          method: "GET",
          url: "/repos?workspace_root=a&workspace_root=b",
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe("invalid-workspace-root");
      } finally {
        await app.close();
      }
    });

    it("skips local entries with symlinked .git or external/invalid gitdir targets", async () => {
      const ws = join(tempHome, "projects");
      const validRepo = join(ws, "valid-repo");
      gitInitRepo(validRepo, "https://github.com/FlyFission/Control-Rod.git");

      const outsideRepo = join(tempHome, "outside-repo");
      gitInitRepo(outsideRepo);

      const symlinkGitRepo = join(ws, "symlink-git");
      mkdirSync(symlinkGitRepo, { recursive: true });
      symlinkSync(join(outsideRepo, ".git"), join(symlinkGitRepo, ".git"));

      const externalGitdirRepo = join(ws, "external-gitdir");
      mkdirSync(externalGitdirRepo, { recursive: true });
      writeFileSync(join(externalGitdirRepo, ".git"), `gitdir: ${join(outsideRepo, ".git")}\n`);

      const missingGitdirRepo = join(ws, "missing-gitdir");
      mkdirSync(missingGitdirRepo, { recursive: true });
      writeFileSync(join(missingGitdirRepo, ".git"), `gitdir: ${join(ws, "does-not-exist")}\n`);

      const app = buildTestApp();
      try {
        const res = await app.inject({
          method: "GET",
          url: "/repos",
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { local: Array<{ name: string }> };
        expect(body.local.map((r) => r.name)).toEqual(["valid-repo"]);
      } finally {
        await app.close();
      }
    });
  });
});
