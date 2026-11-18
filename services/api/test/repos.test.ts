import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { Refusal } from "../src/refusal.js";
import { teach } from "../src/refusals.js";
import {
  CAPITAL_PROJECT_DIRS,
  HOST_GIT_ARGS,
  createCheckpoint,
  hostGitEnv,
  isDangerousWorktreeRemovalPath,
  removeWorktreeSafely,
  repoRoutes,
  scaffoldCapitalProjectDirs,
} from "../src/repos.js";

const tempDirs: string[] = [];
let prevHome: string | undefined;
let hasSavedHome = false;

function makeTempRepo(): { workspaceRoot: string; repoDir: string } {
  if (!hasSavedHome) {
    prevHome = process.env.HOME;
    hasSavedHome = true;
  }
  const tempHome = realpathSync(mkdtempSync(join(tmpdir(), "cr-repos-test-")));
  tempDirs.push(tempHome);
  process.env.HOME = tempHome;
  const workspaceRoot = join(tempHome, "projects");
  const repoDir = join(workspaceRoot, "sample-repo");
  mkdirSync(repoDir, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  writeFileSync(join(repoDir, ".gitignore"), ".env.local\n*.secret\n");
  writeFileSync(join(repoDir, "README.md"), "# Sample\n");
  execFileSync("git", ["add", ".gitignore", "README.md"], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir });
  return { workspaceRoot, repoDir };
}

afterEach(() => {
  if (hasSavedHome) {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    hasSavedHome = false;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("repos Wave 1 hardening", () => {
  it("HOST_GIT_ARGS neutralizes hooks, fsmonitor, ext protocol, and submodules", () => {
    expect(HOST_GIT_ARGS).toContain("core.hooksPath=/dev/null");
    expect(HOST_GIT_ARGS).toContain("core.fsmonitor=false");
    expect(HOST_GIT_ARGS).toContain("protocol.ext.allow=never");
    expect(HOST_GIT_ARGS).toContain("submodule.recurse=false");
  });

  it("hostGitEnv strips dangerous GIT_* vars and preserves safe ones", () => {
    const prevDir = process.env.GIT_DIR;
    const prevPrompt = process.env.GIT_TERMINAL_PROMPT;
    process.env.GIT_DIR = "/tmp/evil";
    process.env.GIT_TERMINAL_PROMPT = "0";
    try {
      const env = hostGitEnv({ GIT_INDEX_FILE: "/tmp/custom-idx" });
      expect(env.GIT_DIR).toBeUndefined();
      expect(env.GIT_TERMINAL_PROMPT).toBe("0");
      expect(env.GIT_INDEX_FILE).toBe("/tmp/custom-idx");
    } finally {
      if (prevDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = prevDir;
      if (prevPrompt === undefined) delete process.env.GIT_TERMINAL_PROMPT;
      else process.env.GIT_TERMINAL_PROMPT = prevPrompt;
    }
  });

  it("POST /repos/materialize does not copy gitignored secret files or return copied_artifacts", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, ".env.local"), "API_MODE=dev\nSECRET_KEY=top-secret\n");
    writeFileSync(join(repoDir, "app.secret"), "dummy\n");

    const app = Fastify({ logger: false });
    app.setErrorHandler((err, _req, reply) => {
      if (err instanceof Refusal) {
        const taught = teach(err.code);
        return reply.code(err.status).send({ code: err.code, message: err.message, change: taught.change });
      }
      throw err;
    });
    repoRoutes(app, async () => "person-test");

    try {
      const res = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/no-secrets",
          strategy: "worktree",
          workspace_root: workspaceRoot,
          mode: "capital-projects",
          preserve_patterns: [".env.local", "app.secret"],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe("capital-projects");
      expect(body.scaffolded_dirs).toEqual([...CAPITAL_PROJECT_DIRS]);
      expect("copied_artifacts" in body).toBe(false);
      expect(existsSync(join(body.local_path, ".env.local"))).toBe(false);
      expect(existsSync(join(body.local_path, "app.secret"))).toBe(false);
      for (const dir of CAPITAL_PROJECT_DIRS) {
        expect(existsSync(join(body.local_path, dir))).toBe(true);
      }
    } finally {
      await app.close();
    }
  });

  it("isDangerousWorktreeRemovalPath blocks root, home, workspaceRoot, repoPath, and ancestors", () => {
    const home = homedir();
    const ws = join(home, "projects");
    const repo = join(ws, "Control-Rod");
    expect(isDangerousWorktreeRemovalPath("/", repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath(home, repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath(ws, repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath(repo, repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath("/tmp/outside", repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath(join(ws, ".worktrees", "Control-Rod", "feat"), repo, ws)).toBe(
      false,
    );
  });

  it("removeWorktreeSafely refuses dirty worktrees without force and removes clean ones", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const wtDir = join(workspaceRoot, ".worktrees", "sample-repo", "wt-rm");
    mkdirSync(join(workspaceRoot, ".worktrees", "sample-repo"), { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", "feat/wt-rm", wtDir], { cwd: repoDir });

    writeFileSync(join(wtDir, "dirty.txt"), "uncommitted\n");
    await expect(
      removeWorktreeSafely({ worktreePath: wtDir, repoPath: repoDir, workspaceRoot }),
    ).rejects.toMatchObject({ code: "worktree-dirty" });
    expect(existsSync(wtDir)).toBe(true);

    const removed = await removeWorktreeSafely({
      worktreePath: wtDir,
      repoPath: repoDir,
      workspaceRoot,
      force: true,
    });
    expect(removed.removed).toBe(wtDir);
    expect(existsSync(wtDir)).toBe(false);
  });

  it("createCheckpoint writes a private ref via temp index without altering HEAD or real index", async () => {
    const { repoDir } = makeTempRepo();
    const headBefore = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
    writeFileSync(join(repoDir, "README.md"), "# Modified\n");
    writeFileSync(join(repoDir, "notes.txt"), "untracked note\n");

    const cp = await createCheckpoint({ repoDir, label: "before-freeze" });
    expect(cp.ref).toMatch(/^refs\/cr-checkpoints\/before-freeze-/);

    const headAfter = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
    expect(headAfter).toBe(headBefore);

    const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: repoDir,
      encoding: "utf8",
    }).trim();
    expect(staged).toBe("");

    const filesInCheckpoint = execFileSync("git", ["ls-tree", "--name-only", cp.commit_sha], {
      cwd: repoDir,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(filesInCheckpoint).toContain("notes.txt");
    expect(filesInCheckpoint).toContain("README.md");
  });

  it("scaffoldCapitalProjectDirs creates calculations, drawings, and specifications", () => {
    const { workspaceRoot } = makeTempRepo();
    const dossierDir = join(workspaceRoot, "capital-dossier");
    mkdirSync(dossierDir, { recursive: true });
    const created = scaffoldCapitalProjectDirs(dossierDir);
    expect(created).toEqual([...CAPITAL_PROJECT_DIRS]);
    for (const dir of CAPITAL_PROJECT_DIRS) {
      expect(existsSync(join(dossierDir, dir))).toBe(true);
    }
  });
});
