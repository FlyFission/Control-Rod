import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishCheckout } from "../src/repos.js";
import { prBody } from "../src/work.js";

/** Accepted work goes out as a draft pull request (change record pr-on-accept). */
const g = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

let root: string;
let worktree: string;
let bare: string;
let base: string;
let saved: Record<string, string | undefined>;
let ghLog: string;

beforeEach(() => {
  saved = { PATH: process.env.PATH, HOME: process.env.HOME, CONTROLROD_WORKSPACE_ROOT: process.env.CONTROLROD_WORKSPACE_ROOT };
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "controlrod-publish-")));
  root = join(tmp, "Code");
  mkdirSync(root);
  process.env.HOME = tmp;
  process.env.CONTROLROD_WORKSPACE_ROOT = root;
  bare = join(tmp, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  const main = join(root, "app");
  mkdirSync(main);
  g(main, "init", "-q", "-b", "main");
  g(main, "config", "user.email", "test@example.com");
  g(main, "config", "user.name", "Test");
  writeFileSync(join(main, "README.md"), "# app\n");
  g(main, "add", "README.md");
  g(main, "commit", "-q", "-m", "initial");
  base = g(main, "rev-parse", "HEAD");
  worktree = join(root, "app-card");
  g(main, "worktree", "add", "-q", "-b", "cr/card", worktree);
  // A gh that records its arguments and prints a pull request link.
  const bin = join(tmp, "bin");
  mkdirSync(bin);
  ghLog = join(tmp, "gh.log");
  writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${ghLog}"\necho https://github.com/acme/app/pull/7\n`);
  chmodSync(join(bin, "gh"), 0o755);
  process.env.PATH = `${bin}:${saved.PATH ?? ""}`;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

const binding = () => ({ repo: "acme/app", root, path: worktree, branch: "cr/card", head: base });

describe("publishCheckout", () => {
  it("commits what the author left, pushes the branch and opens a draft", async () => {
    writeFileSync(join(worktree, "feature.ts"), "export const x = 1;\n");
    mkdirSync(join(worktree, ".controlrod-run-1"));
    writeFileSync(join(worktree, ".controlrod-run-1", "log"), "private\n");
    const r = await publishCheckout(binding(), { title: "Add x", body: "Because" }, { pushUrl: bare });
    expect(r).toMatchObject({ opened: true, url: "https://github.com/acme/app/pull/7", branch: "cr/card", committed: true });
    const pushed = execFileSync("git", ["--git-dir", bare, "ls-tree", "-r", "--name-only", "cr/card"], { encoding: "utf8" });
    expect(pushed).toContain("feature.ts");
    expect(pushed).not.toContain(".controlrod-run-1");
    const args = execFileSync("cat", [ghLog], { encoding: "utf8" }).split("\n");
    expect(args).toEqual(expect.arrayContaining(["pr", "create", "--repo", "acme/app", "--head", "cr/card", "--draft", "--title", "Add x"]));
  });

  it("opens nothing when the author changed nothing", async () => {
    const r = await publishCheckout(binding(), { title: "Nothing", body: "" }, { pushUrl: bare });
    expect(r).toMatchObject({ opened: false, reason: "no-changes" });
  });

  it("opens nothing for a repository that is not on GitHub", async () => {
    const r = await publishCheckout({ ...binding(), repo: "app" }, { title: "x", body: "" }, { pushUrl: bare });
    expect(r).toMatchObject({ opened: false, reason: "not-github" });
  });

  it("refuses to push when the checkout moved to another branch", async () => {
    g(worktree, "checkout", "-q", "-b", "elsewhere");
    writeFileSync(join(worktree, "f"), "1");
    const r = await publishCheckout(binding(), { title: "x", body: "" }, { pushUrl: bare });
    expect(r).toMatchObject({ opened: false, reason: "failed", detail: expect.stringMatching(/moved to branch elsewhere/) });
  });

  it("refuses to push when the repository's own config could redirect the credential", async () => {
    writeFileSync(join(worktree, "f"), "1");
    g(worktree, "config", "url.https://evil.example/.insteadOf", "https://github.com/");
    const r = await publishCheckout(binding(), { title: "x", body: "" }, { pushUrl: bare });
    expect(r).toMatchObject({ opened: false, reason: "failed", detail: expect.stringMatching(/could redirect a push/) });
  });
});

describe("the pull request's description", () => {
  it("names the card, its criteria and who checked it", () => {
    const text = prBody(
      { id: "WP-1", revision: 0, title: "Add x", objective: "Make x exist", acceptance_criteria: ["x is 1"] },
      { outcome: "pass", findings: [], independence: { checker_runtime: { provider: "codex", model: "gpt-5" } } },
    );
    expect(text).toContain("**Add x** (WP-1 r0)");
    expect(text).toContain("- x is 1");
    expect(text).toContain("Blind check: **pass** by codex (gpt-5), 0 findings.");
  });
});
