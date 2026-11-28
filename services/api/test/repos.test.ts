import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Refusal } from "../src/refusal.js";
import { teach } from "../src/refusals.js";
import {
  CAPITAL_PROJECT_DIRS,
  HOST_GIT_ARGS,
  type HeldCheckout,
  createCheckpoint,
  hostGitEnv,
  isDangerousWorktreeRemovalPath,
  removeWorktreeSafely,
  repoRoutes,
  scaffoldCapitalProjectDirs,
} from "../src/repos.js";

function buildTestApp(held?: () => Promise<HeldCheckout[]>): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Refusal) {
      const taught = teach(err.code);
      return reply.code(err.status).send({ code: err.code, message: err.message, change: taught.change });
    }
    throw err;
  });
  repoRoutes(app, async () => "person-test", held);
  return app;
}

async function withTestApp<T>(fn: (app: FastifyInstance) => Promise<T>, held?: () => Promise<HeldCheckout[]>): Promise<T> {
  const app = buildTestApp(held);
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}

describe("repos Wave 1 hardening", () => {
  let tempHome: string;
  let origEnv: Map<string, string | undefined>;

  beforeEach(() => {
    origEnv = new Map();
    const keysToSave = new Set<string>([
      "HOME",
      "CONTROLROD_WORKSPACE_ROOT",
      "XDG_CONFIG_HOME",
      "GH_TOKEN",
      "GITHUB_TOKEN",
      ...Object.keys(process.env).filter((k) => k.startsWith("GIT_")),
    ]);
    for (const key of keysToSave) {
      origEnv.set(key, process.env[key]);
    }

    for (const key of Object.keys(process.env)) {
      if (key.startsWith("GIT_")) {
        delete process.env[key];
      }
    }
    delete process.env.CONTROLROD_WORKSPACE_ROOT;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;

    tempHome = realpathSync(mkdtempSync(join(tmpdir(), "cr-repos-test-")));
    const xdgConfigHome = join(tempHome, ".config");
    mkdirSync(xdgConfigHome, { recursive: true });

    process.env.HOME = tempHome;
    process.env.XDG_CONFIG_HOME = xdgConfigHome;
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("GIT_") && !origEnv.has(key)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of origEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(tempHome, { recursive: true, force: true });
  });

  function makeTempRepo(
    name = "sample-repo",
    options: { commit?: boolean } = {},
  ): { workspaceRoot: string; repoDir: string } {
    const workspaceRoot = join(tempHome, "projects");
    const repoDir = join(workspaceRoot, name);
    mkdirSync(repoDir, { recursive: true });
    execFileSync("git", ["init", "-b", "main"], { cwd: repoDir });
    execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    if (options.commit !== false) {
      writeFileSync(join(repoDir, ".gitignore"), ".env.local\n*.secret\n");
      writeFileSync(join(repoDir, "README.md"), "# Sample\n");
      execFileSync("git", ["add", ".gitignore", "README.md"], { cwd: repoDir });
      execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir });
    }
    return { workspaceRoot, repoDir };
  }

  it("refuses to remove a worktree while a run is working in it (review API-11)", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    let held: HeldCheckout[] = [];
    await withTestApp(async (app) => {
      const wtRes = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: { repo: "sample-repo", branch: "feat/held", strategy: "worktree", workspace_root: workspaceRoot },
      });
      expect(wtRes.statusCode, wtRes.body).toBe(200);
      const wtPath = wtRes.json().local_path as string;
      const remove = () => app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: wtPath, repo_path: repoDir, workspace_root: workspaceRoot, force: true },
      });
      // The run names the checkout by another spelling of the same path, and force does not override it.
      held = [{ run: "R-held0001", path: `${wtPath}/` }];
      const refused = await remove();
      expect(refused.statusCode, refused.body).toBe(409);
      expect(refused.json()).toMatchObject({
        code: "worktree-in-use",
        message: "Run R-held0001 is working in this worktree, so it was not removed. Wait for the run to finish, or stop it, then remove the worktree.",
      });
      expect(existsSync(wtPath)).toBe(true);
      // A run in a folder inside the worktree holds it too; a run elsewhere does not.
      held = [{ run: "R-held0002", path: join(wtPath, "sub") }];
      expect((await remove()).statusCode).toBe(409);
      held = [{ run: "R-other001", path: join(workspaceRoot, "elsewhere") }];
      const removed = await remove();
      expect(removed.statusCode, removed.body).toBe(200);
      expect(existsSync(wtPath)).toBe(false);
    }, async () => held);
  });

  it("HOST_GIT_ARGS neutralizes hooks, fsmonitor, ext protocol, and submodules", () => {
    expect(HOST_GIT_ARGS).toContain("core.hooksPath=/dev/null");
    expect(HOST_GIT_ARGS).toContain("core.fsmonitor=false");
    expect(HOST_GIT_ARGS).toContain("protocol.ext.allow=never");
    expect(HOST_GIT_ARGS).toContain("submodule.recurse=false");
  });

  it("hostGitEnv strips dangerous GIT_* vars and preserves safe ones", () => {
    process.env.GIT_DIR = "/tmp/evil";
    process.env.GIT_TERMINAL_PROMPT = "0";
    const env = hostGitEnv({ GIT_INDEX_FILE: "/tmp/custom-idx" });
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.GIT_INDEX_FILE).toBe("/tmp/custom-idx");
  });

  it("POST /repos/materialize does not copy gitignored secret files, scaffolds capital-projects, and rejects invalid mode", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, ".env.local"), "API_MODE=dev\nSECRET_KEY=top-secret\n");
    writeFileSync(join(repoDir, "app.secret"), "dummy\n");

    await withTestApp(async (app) => {
      const badMode = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/bad-mode",
          strategy: "worktree",
          workspace_root: workspaceRoot,
          mode: "invalid-mode",
        },
      });
      expect(badMode.statusCode).toBe(400);
      expect(badMode.json().code).toBe("invalid");

      const nonStringMode = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/bad-mode-type",
          strategy: "worktree",
          workspace_root: workspaceRoot,
          mode: 123,
        },
      });
      expect(nonStringMode.statusCode).toBe(400);
      expect(nonStringMode.json().code).toBe("invalid");

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
    });
  });

  it("createCheckpoint neutralizes LFS required=true, custom filters with '=', and CRLF config", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n*.dat filter=my=drv\n");
    writeFileSync(join(repoDir, "asset.bin"), "raw-binary-payload\r\n");
    writeFileSync(join(repoDir, "custom.dat"), "custom-payload\r\n");
    execFileSync("git", ["config", "filter.lfs.clean", "git-lfs clean -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.smudge", "git-lfs smudge -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.process", "git-lfs filter-process"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.required", "true"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.my=drv.clean", "exit 1"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.my=drv.required", "true"], { cwd: repoDir });
    execFileSync("git", ["config", "core.autocrlf", "true"], { cwd: repoDir });
    execFileSync("git", ["config", "core.safecrlf", "true"], { cwd: repoDir });

    const cp = await createCheckpoint({ repoDir, label: "lfs-safe", workspaceRoot });
    expect(cp.ref).toMatch(/^refs\/cr-checkpoints\/lfs-safe-/);

    const binContent = execFileSync("git", ["show", `${cp.commit_sha}:asset.bin`], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(binContent).toBe("raw-binary-payload\r\n");

    const datContent = execFileSync("git", ["show", `${cp.commit_sha}:custom.dat`], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(datContent).toBe("custom-payload\r\n");
  });

  it("status, worktree add, and checkout neutralize LFS required=true and safecrlf=true", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n");
    writeFileSync(join(repoDir, "tracked.bin"), "lfs-raw-bytes\r\n");
    execFileSync("git", ["add", ".gitattributes", "tracked.bin"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "add lfs fixture"], { cwd: repoDir });

    execFileSync("git", ["config", "filter.lfs.clean", "git-lfs clean -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.smudge", "git-lfs smudge -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.process", "git-lfs filter-process"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.required", "true"], { cwd: repoDir });
    execFileSync("git", ["config", "core.autocrlf", "true"], { cwd: repoDir });
    execFileSync("git", ["config", "core.safecrlf", "true"], { cwd: repoDir });

    await withTestApp(async (app) => {
      const listRes = await app.inject({
        method: "GET",
        url: `/repos?workspace_root=${encodeURIComponent(workspaceRoot)}`,
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().local).toHaveLength(1);

      const wtRes = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/lfs-wt",
          strategy: "worktree",
          workspace_root: workspaceRoot,
        },
      });
      expect(wtRes.statusCode).toBe(200);
      const wtPath = wtRes.json().local_path as string;

      const rmRes = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: {
          worktree_path: wtPath,
          repo_path: repoDir,
          workspace_root: workspaceRoot,
        },
      });
      expect(rmRes.statusCode).toBe(200);

      const branchRes = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/lfs-branch",
          strategy: "branch",
          workspace_root: workspaceRoot,
        },
      });
      expect(branchRes.statusCode).toBe(200);
    });
  });

  it("preserves clean-status semantics for core.autocrlf=true checkouts in GET /repos, branch, and non-force remove", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, "notes.txt"), "line one\nline two\n");
    execFileSync("git", ["add", "notes.txt"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "add lf text"], { cwd: repoDir });
    execFileSync("git", ["config", "core.autocrlf", "true"], { cwd: repoDir });
    // Re-checkout working file with CRLF under core.autocrlf=true
    rmSync(join(repoDir, "notes.txt"));
    execFileSync("git", ["checkout", "--", "notes.txt"], { cwd: repoDir });

    await withTestApp(async (app) => {
      const listRes = await app.inject({
        method: "GET",
        url: `/repos?workspace_root=${encodeURIComponent(workspaceRoot)}`,
      });
      expect(listRes.statusCode).toBe(200);
      const local = (listRes.json().local as Array<{ name: string; dirty: boolean }>).find(
        (r) => r.name === "sample-repo",
      );
      expect(local?.dirty).toBe(false);

      const wtRes = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/crlf-wt",
          strategy: "worktree",
          workspace_root: workspaceRoot,
        },
      });
      expect(wtRes.statusCode).toBe(200);

      const rmRes = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: {
          worktree_path: wtRes.json().local_path,
          repo_path: repoDir,
          workspace_root: workspaceRoot,
        },
      });
      expect(rmRes.statusCode).toBe(200);

      const branchRes = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/crlf-branch",
          strategy: "branch",
          workspace_root: workspaceRoot,
        },
      });
      expect(branchRes.statusCode).toBe(200);
    });
  });

  it.each(["core.gitProxy", "core.alternateRefsCommand"])("refuses a local %s before materializing", async (key) => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    execFileSync("git", ["config", key, "test-placeholder"], { cwd: repoDir });

    await withTestApp(async (app) => {
      const response = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: { repo: "sample-repo", branch: "feat/local-config", strategy: "worktree", workspace_root: workspaceRoot },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "invalid-workspace-root", message: expect.stringContaining(key.toLowerCase()) });
    });
  });

  it("checkpoints conflicted working text without changing the real index", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repoDir, encoding: "utf8" });
    const commitText = (text: string) => {
      writeFileSync(join(repoDir, "README.md"), text);
      git("commit", "-am", text.trim());
    };
    git("checkout", "-b", "side");
    commitText("side\n");
    git("checkout", "main");
    commitText("main\n");
    expect(() => git("merge", "side")).toThrow();
    const unmerged = git("ls-files", "-u");
    expect(unmerged).not.toBe("");
    const conflicted = git("diff", "--name-only", "--diff-filter=U");
    expect(conflicted.trim()).toBe("README.md");
    const checkpoint = await createCheckpoint({ repoDir, workspaceRoot });
    expect(git("show", checkpoint.commit_sha + ":README.md")).toContain("<<<<<<< HEAD");
    expect(git("ls-files", "-u")).toBe(unmerged);
  });

  it.each(["v1..v2", ".hidden", "...", "v1.2"])("checkpoints under a valid Git ref for label %s", async (label) => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const checkpoint = await createCheckpoint({ repoDir, workspaceRoot, label });
    expect(execFileSync("git", ["rev-parse", checkpoint.ref], { cwd: repoDir, encoding: "utf8" }).trim())
      .toBe(checkpoint.commit_sha);
    if (label === "v1.2") expect(checkpoint.ref).toContain("/v1.2-");
  });

  it("createCheckpoint clears --assume-unchanged in tempIndex while preserving it in real index", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, "note file.txt"), "original\n");
    execFileSync("git", ["add", "note file.txt"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "track file"], { cwd: repoDir });
    execFileSync("git", ["update-index", "--assume-unchanged", "note file.txt"], { cwd: repoDir });
    writeFileSync(join(repoDir, "note file.txt"), "edited-despite-assume-unchanged\n");

    const cp = await createCheckpoint({ repoDir, label: "assume-unchanged", workspaceRoot });
    const captured = execFileSync("git", ["show", `${cp.commit_sha}:note file.txt`], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(captured).toBe("edited-despite-assume-unchanged\n");

    const realFlags = execFileSync("git", ["ls-files", "-v", "note file.txt"], {
      cwd: repoDir,
      encoding: "utf8",
    }).trim();
    expect(realFlags.startsWith("h ")).toBe(true);
  });

  it("createCheckpoint captures present skip-worktree edits while preserving absent sparse entries and bypasses gitattributes EOL conversion", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, ".gitattributes"), "*.txt text\n");
    writeFileSync(join(repoDir, "sparse-present.txt"), "present-orig\n");
    writeFileSync(join(repoDir, "sparse-absent.txt"), "sparse-orig\n");
    writeFileSync(join(repoDir, "attr-raw.txt"), "initial\n");
    execFileSync("git", ["add", ".gitattributes", "sparse-present.txt", "sparse-absent.txt", "attr-raw.txt"], {
      cwd: repoDir,
    });
    execFileSync("git", ["commit", "-m", "setup sparse and attr"], { cwd: repoDir });

    execFileSync("git", ["update-index", "--skip-worktree", "sparse-present.txt", "sparse-absent.txt"], {
      cwd: repoDir,
    });
    rmSync(join(repoDir, "sparse-absent.txt"));
    writeFileSync(join(repoDir, "sparse-present.txt"), "present-edited\r\n");
    writeFileSync(join(repoDir, "attr-raw.txt"), "raw-mixed\r\ncrlf\r\n");

    const cp = await createCheckpoint({ repoDir, label: "skip-and-attr", workspaceRoot });

    const presentCaptured = execFileSync("git", ["show", `${cp.commit_sha}:sparse-present.txt`], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(presentCaptured).toBe("present-edited\r\n");

    const absentCaptured = execFileSync("git", ["show", `${cp.commit_sha}:sparse-absent.txt`], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(absentCaptured).toBe("sparse-orig\n");

    const rawAttrCaptured = execFileSync("git", ["show", `${cp.commit_sha}:attr-raw.txt`], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(rawAttrCaptured).toBe("raw-mixed\r\ncrlf\r\n");

    const realFlags = execFileSync("git", ["ls-files", "-v", "sparse-present.txt", "sparse-absent.txt"], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(realFlags).toContain("S sparse-present.txt");
    expect(realFlags).toContain("S sparse-absent.txt");
  });

  it("createCheckpoint captures invalid working-tree-encoding raw bytes without failing", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, ".gitattributes"), "*.txt working-tree-encoding=UTF-16LE\n");
    writeFileSync(join(repoDir, "encoded.txt"), Buffer.from([0x61, 0x00, 0x0a, 0x00]));
    execFileSync("git", ["add", ".gitattributes", "encoded.txt"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "utf16le tracked"], { cwd: repoDir });

    const invalidRaw = Buffer.from([0x01, 0x02, 0x03]);
    writeFileSync(join(repoDir, "encoded.txt"), invalidRaw);

    const cp = await createCheckpoint({ repoDir, label: "raw-invalid-utf16", workspaceRoot });
    const captured = execFileSync("git", ["show", `${cp.commit_sha}:encoded.txt`], { cwd: repoDir });
    expect(Buffer.compare(captured, invalidRaw)).toBe(0);
  });

  it("createCheckpoint handles file-to-directory and directory-to-file replacements", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, "input"), "file-before\n");
    mkdirSync(join(repoDir, "dir"), { recursive: true });
    writeFileSync(join(repoDir, "dir", "child"), "child-before\n");
    execFileSync("git", ["add", "input", "dir/child"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "file and dir fixtures"], { cwd: repoDir });

    rmSync(join(repoDir, "input"));
    mkdirSync(join(repoDir, "input"), { recursive: true });
    writeFileSync(join(repoDir, "input", "child"), "now-inside-dir\r\n");

    rmSync(join(repoDir, "dir"), { recursive: true, force: true });
    writeFileSync(join(repoDir, "dir"), "now-a-file\n");

    const cp = await createCheckpoint({ repoDir, label: "replace-file-dir", workspaceRoot });
    const childContent = execFileSync("git", ["show", `${cp.commit_sha}:input/child`], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(childContent).toBe("now-inside-dir\r\n");

    const dirFileContent = execFileSync("git", ["show", `${cp.commit_sha}:dir`], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(dirFileContent).toBe("now-a-file\n");

    const treePaths = execFileSync("git", ["ls-tree", "-r", "--name-only", cp.commit_sha], {
      cwd: repoDir,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(treePaths).toContain("input/child");
    expect(treePaths).toContain("dir");
    expect(treePaths).not.toContain("input");
    expect(treePaths).not.toContain("dir/child");
  });

  it("createCheckpoint refuses to traverse symlinked ancestors when staging tracked paths", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    mkdirSync(join(repoDir, "dir"), { recursive: true });
    writeFileSync(join(repoDir, "dir", "secret"), "inside-repo\n");
    writeFileSync(join(repoDir, ".gitignore"), "dir/\n");
    execFileSync("git", ["add", ".gitignore"], { cwd: repoDir });
    execFileSync("git", ["add", "-f", "dir/secret"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "track dir/secret and ignore dir"], { cwd: repoDir });

    const outsideDir = mkdtempSync(join(tmpdir(), "cr-outside-secret-"));
    try {
      writeFileSync(join(outsideDir, "secret"), "LEAKED-EXTERNAL-SECRET\n");
      rmSync(join(repoDir, "dir"), { recursive: true, force: true });
      symlinkSync(outsideDir, join(repoDir, "dir"));

      const cp = await createCheckpoint({ repoDir, label: "symlink-ancestor", workspaceRoot });
      const treePaths = execFileSync("git", ["ls-tree", "-r", "--name-only", cp.commit_sha], {
        cwd: repoDir,
        encoding: "utf8",
      })
        .trim()
        .split("\n");
      expect(treePaths).not.toContain("dir/secret");
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("createCheckpoint captures the checked-out commit of tracked submodules without staging inner files", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const subSource = join(workspaceRoot, "sub-source");
    mkdirSync(subSource, { recursive: true });
    execFileSync("git", ["init", "-b", "main"], { cwd: subSource });
    execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: subSource });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: subSource });
    writeFileSync(join(subSource, "lib.txt"), "v1\n");
    execFileSync("git", ["add", "lib.txt"], { cwd: subSource });
    execFileSync("git", ["commit", "-m", "sub v1"], { cwd: subSource });
    const subV1 = execFileSync("git", ["rev-parse", "HEAD"], { cwd: subSource, encoding: "utf8" }).trim();

    execFileSync("git", ["-c", "protocol.file.allow=always", "submodule", "add", subSource, "sub"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "add submodule"], { cwd: repoDir });

    const subWork = join(repoDir, "sub");
    execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: subWork });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: subWork });
    writeFileSync(join(subWork, "lib.txt"), "v2\n");
    execFileSync("git", ["add", "lib.txt"], { cwd: subWork });
    execFileSync("git", ["commit", "-m", "sub v2"], { cwd: subWork });
    const subV2 = execFileSync("git", ["rev-parse", "HEAD"], { cwd: subWork, encoding: "utf8" }).trim();
    // Unstaged inner file inside submodule must not be staged into the superproject tree.
    writeFileSync(join(subWork, "untracked-inner.txt"), "ignore-me\n");

    expect(subV2).not.toBe(subV1);

    const cp = await createCheckpoint({ repoDir, label: "submodule-head", workspaceRoot });
    const lsTree = execFileSync("git", ["ls-tree", cp.commit_sha, "sub"], { cwd: repoDir, encoding: "utf8" }).trim();
    expect(lsTree).toBe(`160000 commit ${subV2}\tsub`);
    const allPaths = execFileSync("git", ["ls-tree", "-r", "--name-only", cp.commit_sha], {
      cwd: repoDir,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(allPaths).toContain("sub");
    expect(allPaths).not.toContain("sub/lib.txt");
    expect(allPaths).not.toContain("sub/untracked-inner.txt");
  });

  it("createCheckpoint captures committed unstaged embedded repositories as gitlinks and refuses unborn embedded repos", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const depDir = join(repoDir, "dependency");
    mkdirSync(depDir, { recursive: true });
    execFileSync("git", ["init", "-b", "main"], { cwd: depDir });
    execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: depDir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: depDir });
    writeFileSync(join(depDir, "mod.txt"), "embedded-v1\n");
    execFileSync("git", ["add", "mod.txt"], { cwd: depDir });
    execFileSync("git", ["commit", "-m", "embedded v1"], { cwd: depDir });
    const depSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: depDir, encoding: "utf8" }).trim();

    const cp = await createCheckpoint({ repoDir, label: "unstaged-embedded", workspaceRoot });
    const lsTree = execFileSync("git", ["ls-tree", cp.commit_sha, "dependency"], {
      cwd: repoDir,
      encoding: "utf8",
    }).trim();
    expect(lsTree).toBe(`160000 commit ${depSha}\tdependency`);

    const unbornDir = join(repoDir, "unborn-dep");
    mkdirSync(unbornDir, { recursive: true });
    execFileSync("git", ["init", "-b", "main"], { cwd: unbornDir });
    await expect(createCheckpoint({ repoDir, label: "unborn-embedded", workspaceRoot })).rejects.toMatchObject({
      status: 400,
      code: "git-failed",
    });
  });

  it("preserves clean-status semantics for hydrated LFS files while flagging actual LFS modifications", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const payload = Buffer.from("hydrated-lfs-binary-payload-bytes");
    const sha = createHash("sha256").update(payload).digest("hex");
    const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${sha}\nsize ${payload.length}\n`;
    writeFileSync(join(repoDir, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n");
    writeFileSync(join(repoDir, "asset.bin"), pointer);
    execFileSync("git", ["add", ".gitattributes", "asset.bin"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "add lfs pointer"], { cwd: repoDir });

    execFileSync("git", ["config", "filter.lfs.clean", "git-lfs clean -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.smudge", "git-lfs smudge -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.process", "git-lfs filter-process"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.required", "true"], { cwd: repoDir });

    // Hydrate asset.bin with matching payload bytes (stat dirty relative to pointer blob, content clean)
    writeFileSync(join(repoDir, "asset.bin"), payload);

    await withTestApp(async (app) => {
      const listRes = await app.inject({
        method: "GET",
        url: `/repos?workspace_root=${encodeURIComponent(workspaceRoot)}`,
      });
      expect(listRes.statusCode).toBe(200);
      const local = (listRes.json().local as Array<{ name: string; dirty: boolean }>).find(
        (r) => r.name === "sample-repo",
      );
      expect(local?.dirty).toBe(false);

      const branchRes = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/lfs-hydrated-branch",
          strategy: "branch",
          workspace_root: workspaceRoot,
        },
      });
      expect(branchRes.statusCode).toBe(200);

      const wtRes = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/lfs-hydrated-wt",
          strategy: "worktree",
          workspace_root: workspaceRoot,
        },
      });
      expect(wtRes.statusCode).toBe(200);
      const wtPath = wtRes.json().local_path as string;

      // Hydrate worktree asset.bin too -> non-force removal succeeds
      writeFileSync(join(wtPath, "asset.bin"), payload);
      const rmCleanRes = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: wtPath, repo_path: repoDir, workspace_root: workspaceRoot },
      });
      expect(rmCleanRes.statusCode).toBe(200);

      // Chmod on hydrated LFS file with matching bytes -> core.filemode=true makes it dirty
      const wtRes3 = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/lfs-chmod-wt",
          strategy: "worktree",
          workspace_root: workspaceRoot,
        },
      });
      expect(wtRes3.statusCode).toBe(200);
      const wtPath3 = wtRes3.json().local_path as string;
      writeFileSync(join(wtPath3, "asset.bin"), payload);
      chmodSync(join(wtPath3, "asset.bin"), 0o755);
      const rmChmodRes = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: wtPath3, repo_path: repoDir, workspace_root: workspaceRoot },
      });
      expect(rmChmodRes.statusCode).toBe(409);
      expect(rmChmodRes.json().code).toBe("worktree-dirty");

      // Re-create worktree and mutate asset.bin -> non-force removal refuses 409 worktree-dirty
      const wtRes2 = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/lfs-modified-wt",
          strategy: "worktree",
          workspace_root: workspaceRoot,
        },
      });
      expect(wtRes2.statusCode).toBe(200);
      const wtPath2 = wtRes2.json().local_path as string;
      writeFileSync(join(wtPath2, "asset.bin"), Buffer.from("mutated-lfs-content-different-len"));
      const rmDirtyRes = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: wtPath2, repo_path: repoDir, workspace_root: workspaceRoot },
      });
      expect(rmDirtyRes.statusCode).toBe(409);
      expect(rmDirtyRes.json().code).toBe("worktree-dirty");
    });
  });

  it("refuses implicit --force worktree removal when status.showUntrackedFiles=no hides an untracked file alongside clean hydrated LFS", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const payload = Buffer.from("hydrated-lfs-binary-payload-bytes");
    const sha = createHash("sha256").update(payload).digest("hex");
    const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${sha}\nsize ${payload.length}\n`;
    writeFileSync(join(repoDir, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n");
    writeFileSync(join(repoDir, "asset.bin"), pointer);
    execFileSync("git", ["add", ".gitattributes", "asset.bin"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "add lfs pointer"], { cwd: repoDir });

    execFileSync("git", ["config", "filter.lfs.clean", "git-lfs clean -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.smudge", "git-lfs smudge -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.process", "git-lfs filter-process"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.required", "true"], { cwd: repoDir });
    execFileSync("git", ["config", "status.showUntrackedFiles", "no"], { cwd: repoDir });

    await withTestApp(async (app) => {
      const wtRes = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/lfs-untracked-guard",
          strategy: "worktree",
          workspace_root: workspaceRoot,
        },
      });
      expect(wtRes.statusCode).toBe(200);
      const wtPath = wtRes.json().local_path as string;

      writeFileSync(join(wtPath, "asset.bin"), payload);
      writeFileSync(join(wtPath, "valuable.txt"), "keep-this-untracked-file\n");

      const rmRes = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: wtPath, repo_path: repoDir, workspace_root: workspaceRoot },
      });
      expect(rmRes.statusCode).toBe(409);
      expect(rmRes.json().code).toBe("worktree-dirty");
      expect(existsSync(join(wtPath, "valuable.txt"))).toBe(true);
    });
  });

  it("refuses implicit --force worktree removal for initialized or diff.ignoreSubmodules=all submodules alongside hydrated LFS", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const subSource = join(workspaceRoot, "sub-source");
    mkdirSync(subSource, { recursive: true });
    execFileSync("git", ["init", "-b", "main"], { cwd: subSource });
    execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: subSource });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: subSource });
    writeFileSync(join(subSource, "lib.txt"), "v1\n");
    execFileSync("git", ["add", "lib.txt"], { cwd: subSource });
    execFileSync("git", ["commit", "-m", "sub v1"], { cwd: subSource });

    const payload = Buffer.from("hydrated-lfs-binary-payload-bytes");
    const sha = createHash("sha256").update(payload).digest("hex");
    const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${sha}\nsize ${payload.length}\n`;
    writeFileSync(join(repoDir, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n");
    writeFileSync(join(repoDir, "asset.bin"), pointer);
    execFileSync("git", ["-c", "protocol.file.allow=always", "submodule", "add", subSource, "sub"], { cwd: repoDir });
    execFileSync("git", ["add", ".gitattributes", "asset.bin"], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "add lfs and sub"], { cwd: repoDir });

    execFileSync("git", ["config", "filter.lfs.clean", "git-lfs clean -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.smudge", "git-lfs smudge -- %f"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.process", "git-lfs filter-process"], { cwd: repoDir });
    execFileSync("git", ["config", "filter.lfs.required", "true"], { cwd: repoDir });

    await withTestApp(async (app) => {
      const wtRes = await app.inject({
        method: "POST",
        url: "/repos/materialize",
        payload: {
          repo: "sample-repo",
          branch: "feat/lfs-sub-guard",
          strategy: "worktree",
          workspace_root: workspaceRoot,
        },
      });
      expect(wtRes.statusCode).toBe(200);
      const wtPath = wtRes.json().local_path as string;

      execFileSync("git", ["-c", "protocol.file.allow=always", "submodule", "update", "--init"], { cwd: wtPath });
      writeFileSync(join(wtPath, "asset.bin"), payload);

      // Clean initialized submodule + hydrated LFS must still fail non-force removal like ordinary git worktree remove.
      const rmCleanSubRes = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: wtPath, repo_path: repoDir, workspace_root: workspaceRoot },
      });
      expect(rmCleanSubRes.statusCode).toBe(400);
      expect(rmCleanSubRes.json().code).toBe("git-failed");
      expect(existsSync(join(wtPath, "sub", "lib.txt"))).toBe(true);

      // Dirty submodule hidden behind diff.ignoreSubmodules=all must fail with 409 worktree-dirty.
      execFileSync("git", ["config", "diff.ignoreSubmodules", "all"], { cwd: repoDir });
      writeFileSync(join(wtPath, "sub", "valuable.txt"), "keep-sub-file\n");
      const rmDirtySubRes = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: wtPath, repo_path: repoDir, workspace_root: workspaceRoot },
      });
      expect(rmDirtySubRes.statusCode).toBe(409);
      expect(rmDirtySubRes.json().code).toBe("worktree-dirty");
      expect(existsSync(join(wtPath, "sub", "valuable.txt"))).toBe(true);
    });
  });

  it("createCheckpoint preserves force-staged ignored files via --git-path index in repos and worktrees", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    writeFileSync(join(repoDir, "forced.secret"), "keep-me\n");
    execFileSync("git", ["add", "-f", "forced.secret"], { cwd: repoDir });

    const cp = await createCheckpoint({ repoDir, label: "force-staged", workspaceRoot });
    const treeFiles = execFileSync("git", ["ls-tree", "--name-only", cp.commit_sha], {
      cwd: repoDir,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(treeFiles).toContain("forced.secret");

    const realStaged = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: repoDir,
      encoding: "utf8",
    }).trim();
    expect(realStaged).toBe("forced.secret");

    // Worktree with .git gitfile also resolves index via --path-format=absolute --git-path index
    const wtDir = join(workspaceRoot, ".worktrees", "sample-repo", "wt-idx");
    mkdirSync(join(workspaceRoot, ".worktrees", "sample-repo"), { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", "feat/wt-idx", wtDir], { cwd: repoDir });
    writeFileSync(join(wtDir, "wt-forced.secret"), "wt-keep\n");
    execFileSync("git", ["add", "-f", "wt-forced.secret"], { cwd: wtDir });

    const wtCp = await createCheckpoint({ repoDir: wtDir, label: "wt-force", workspaceRoot });
    const wtTreeFiles = execFileSync("git", ["ls-tree", "--name-only", wtCp.commit_sha], {
      cwd: wtDir,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(wtTreeFiles).toContain("wt-forced.secret");
  });

  it("createCheckpoint works on unborn HEAD without an index", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo("unborn-repo", { commit: false });
    expect(existsSync(join(repoDir, ".git", "index"))).toBe(false);
    writeFileSync(join(repoDir, "first.txt"), "hello unborn\n");

    const cp = await createCheckpoint({ repoDir, label: "unborn", workspaceRoot });
    expect(cp.ref).toMatch(/^refs\/cr-checkpoints\/unborn-/);

    const files = execFileSync("git", ["ls-tree", "--name-only", cp.commit_sha], {
      cwd: repoDir,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(files).toEqual(["first.txt"]);

    // Verify HEAD remains unborn
    expect(() => execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: repoDir, stdio: "ignore" })).toThrow();
  });

  it("createCheckpoint refuses plain subdirectories without .git and uses unique UUID refs with CAS update-ref", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const subDir = join(repoDir, "nested-plain");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "note.txt"), "plain\n");

    await expect(createCheckpoint({ repoDir: subDir, workspaceRoot })).rejects.toMatchObject({
      status: 404,
      code: "repo-not-found",
    });

    const [cp1, cp2] = await Promise.all([
      createCheckpoint({ repoDir, label: "concurrent", workspaceRoot }),
      createCheckpoint({ repoDir, label: "concurrent", workspaceRoot }),
    ]);
    const uuidPattern = /^refs\/cr-checkpoints\/concurrent-[0-9a-z]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(cp1.ref).toMatch(uuidPattern);
    expect(cp2.ref).toMatch(uuidPattern);
    expect(cp1.ref).not.toBe(cp2.ref);

    // CAS update-ref with empty oldvalue rejects overwriting an existing ref
    expect(() =>
      execFileSync("git", ["update-ref", cp1.ref, cp1.commit_sha, ""], { cwd: repoDir, stdio: "pipe" }),
    ).toThrow();
  });

  it("isDangerousWorktreeRemovalPath blocks root, home, workspaceRoot, repoPath, uncontained repoPath, symlinks, and ~user paths", () => {
    const home = homedir();
    const ws = join(home, "projects");
    mkdirSync(ws, { recursive: true });
    const repo = join(ws, "Control-Rod");
    mkdirSync(repo, { recursive: true });
    const outsideRepo = join(home, "other", "Control-Rod");
    mkdirSync(outsideRepo, { recursive: true });

    const realTarget = join(ws, "real-wt");
    mkdirSync(realTarget, { recursive: true });
    const symlinkWt = join(ws, ".worktrees", "Control-Rod", "sym-wt");
    mkdirSync(join(ws, ".worktrees", "Control-Rod"), { recursive: true });
    symlinkSync(realTarget, symlinkWt);

    expect(isDangerousWorktreeRemovalPath("/", repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath(home, repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath(ws, repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath(repo, repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath("/tmp/outside", repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath(join(ws, ".worktrees", "Control-Rod", "feat"), outsideRepo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath(symlinkWt, repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath("~otheruser/projects/.worktrees/Control-Rod/feat", repo, ws)).toBe(true);
    expect(isDangerousWorktreeRemovalPath("~/projects/.worktrees/Control-Rod/feat", repo, ws)).toBe(false);
    expect(isDangerousWorktreeRemovalPath(join(ws, ".worktrees", "Control-Rod", "feat"), repo, ws)).toBe(false);
  });

  it("removeWorktreeSafely refuses dirty worktrees without force, rejects string 'false', and prunes missing registered worktrees", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const wtDir = join(workspaceRoot, ".worktrees", "sample-repo", "wt-rm");
    mkdirSync(join(workspaceRoot, ".worktrees", "sample-repo"), { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", "feat/wt-rm", wtDir], { cwd: repoDir });

    writeFileSync(join(wtDir, "dirty.txt"), "uncommitted\n");
    await expect(
      removeWorktreeSafely({ worktreePath: wtDir, repoPath: repoDir, workspaceRoot }),
    ).rejects.toMatchObject({ code: "worktree-dirty" });
    await expect(
      removeWorktreeSafely({
        worktreePath: wtDir,
        repoPath: repoDir,
        workspaceRoot,
        force: "false" as unknown as boolean,
      }),
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

    // Unregistered missing worktree returns 404 worktree-not-found
    await expect(
      removeWorktreeSafely({
        worktreePath: join(workspaceRoot, ".worktrees", "sample-repo", "never-existed"),
        repoPath: repoDir,
        workspaceRoot,
      }),
    ).rejects.toMatchObject({ status: 404, code: "worktree-not-found" });

    // Missing-on-disk target worktree removes only itself without pruning unrelated missing worktrees or bypassing locks
    const staleWt = join(workspaceRoot, ".worktrees", "sample-repo", "wt-stale");
    const otherMissingWt = join(workspaceRoot, ".worktrees", "sample-repo", "wt-other-missing");
    const lockedMissingWt = join(workspaceRoot, ".worktrees", "sample-repo", "wt-locked-missing");
    execFileSync("git", ["worktree", "add", "-b", "feat/wt-stale", staleWt], { cwd: repoDir });
    execFileSync("git", ["worktree", "add", "-b", "feat/wt-other-missing", otherMissingWt], { cwd: repoDir });
    execFileSync("git", ["worktree", "add", "-b", "feat/wt-locked-missing", lockedMissingWt], { cwd: repoDir });
    execFileSync("git", ["worktree", "lock", lockedMissingWt], { cwd: repoDir });
    rmSync(staleWt, { recursive: true, force: true });
    rmSync(otherMissingWt, { recursive: true, force: true });
    rmSync(lockedMissingWt, { recursive: true, force: true });
    expect(existsSync(staleWt)).toBe(false);

    const pruned = await removeWorktreeSafely({
      worktreePath: staleWt,
      repoPath: repoDir,
      workspaceRoot,
    });
    expect(pruned.removed).toBe(staleWt);
    const listAfter = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(listAfter).not.toContain(staleWt);
    expect(listAfter).toContain(otherMissingWt);
    expect(listAfter).toContain(lockedMissingWt);

    await expect(
      removeWorktreeSafely({
        worktreePath: lockedMissingWt,
        repoPath: repoDir,
        workspaceRoot,
        force: true,
      }),
    ).rejects.toThrow(/locked/i);

    await withTestApp(async (app) => {
      const lockedResp = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { repo_path: repoDir, worktree_path: lockedMissingWt, workspace_root: workspaceRoot, force: false },
      });
      expect(lockedResp.statusCode).toBe(400);
      expect(lockedResp.json().code).toBe("git-failed");
    });

    const listFinal = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(listFinal).toContain(otherMissingWt);
    expect(listFinal).toContain(lockedMissingWt);
  });

  it("POST /repos/checkpoint and POST /repos/remove validate runtime types and map git failures to 400 git-failed", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();

    await withTestApp(async (app) => {
      const badRepoPath = await app.inject({
        method: "POST",
        url: "/repos/checkpoint",
        payload: { repo_path: 123, workspace_root: workspaceRoot },
      });
      expect(badRepoPath.statusCode).toBe(400);
      expect(badRepoPath.json().code).toBe("invalid-repo-path");

      const badLabel = await app.inject({
        method: "POST",
        url: "/repos/checkpoint",
        payload: { repo_path: repoDir, label: 42, workspace_root: workspaceRoot },
      });
      expect(badLabel.statusCode).toBe(400);
      expect(badLabel.json().code).toBe("invalid");

      const badRemoveTypes = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: 123, repo_path: repoDir, workspace_root: workspaceRoot },
      });
      expect(badRemoveTypes.statusCode).toBe(400);
      expect(badRemoveTypes.json().code).toBe("invalid-worktree-path");

      const badForce = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: join(workspaceRoot, ".worktrees", "sample-repo", "wt"), repo_path: repoDir, workspace_root: workspaceRoot, force: "false" },
      });
      expect(badForce.statusCode).toBe(400);
      expect(badForce.json().code).toBe("invalid");

      // Git failure on /repos/remove (plain dir inside .worktrees not registered as a worktree)
      const bogusWt = join(workspaceRoot, ".worktrees", "sample-repo", "not-a-wt");
      mkdirSync(bogusWt, { recursive: true });
      const rmGitFail = await app.inject({
        method: "POST",
        url: "/repos/remove",
        payload: { worktree_path: bogusWt, repo_path: repoDir, workspace_root: workspaceRoot },
      });
      expect(rmGitFail.statusCode).toBe(400);
      expect(rmGitFail.json().code).toBe("git-failed");

      // Git failure on /repos/checkpoint (block refs/cr-checkpoints with a regular file)
      rmSync(join(repoDir, ".git", "refs", "cr-checkpoints"), { recursive: true, force: true });
      writeFileSync(join(repoDir, ".git", "refs", "cr-checkpoints"), "not-a-dir\n");
      const cpGitFail = await app.inject({
        method: "POST",
        url: "/repos/checkpoint",
        payload: { repo_path: repoDir, label: "blocked", workspace_root: workspaceRoot },
      });
      expect(cpGitFail.statusCode).toBe(400);
      expect(cpGitFail.json().code).toBe("git-failed");
    });
  });

  it("createCheckpoint writes a private ref via temp index without altering HEAD or real index", async () => {
    const { workspaceRoot, repoDir } = makeTempRepo();
    const headBefore = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
    writeFileSync(join(repoDir, "README.md"), "# Modified\n");
    writeFileSync(join(repoDir, "notes.txt"), "untracked note\n");

    const cp = await createCheckpoint({ repoDir, label: "before-freeze", workspaceRoot });
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
