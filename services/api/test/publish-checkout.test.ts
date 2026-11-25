import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
  writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "GH_HOST=$GH_HOST" >> "${ghLog}"\nprintf '%s\\n' "$@" >> "${ghLog}"\nif [ "$2" = "list" ]; then cat "${ghLog}.existing" 2>/dev/null || echo "[]"; exit 0; fi\necho https://github.com/acme/app/pull/7\n`);
  chmodSync(join(bin, "gh"), 0o755);
  process.env.PATH = `${bin}:${saved.PATH ?? ""}`;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

/** The worktree's changes as the author's patch output, and the inputs the publisher takes. */
function accepted(extra: Partial<Parameters<typeof publishCheckout>[0]> = {}) {
  const patch = Buffer.from(execFileSync("git", ["diff", "--binary", "HEAD"], { cwd: worktree }));
  return {
    repo: "acme/app", root, path: worktree, boundHead: base, finalHead: g(worktree, "rev-parse", "HEAD"), patch,
    publishBranch: "controlrod/WP-1-r0", title: "Add x", body: "Because", acceptedAt: "2026-11-25T03:00:00Z", stillAllowed: async () => true, ...extra,
  };
}
const onGitHub = { pushUrl: "", remoteHas: async () => true, defaultBranch: "main" };
const t = () => ({ ...onGitHub, pushUrl: bare });
const pushed = (ref = "controlrod/WP-1-r0") => execFileSync("git", ["--git-dir", bare, "ls-tree", "-r", "--name-only", ref], { encoding: "utf8" });
const remoteBranches = () => execFileSync("git", ["--git-dir", bare, "branch", "--list"], { encoding: "utf8" });

describe("publishCheckout", () => {
  it("pushes exactly the accepted patch to a branch of its own and opens a draft against the default branch", async () => {
    writeFileSync(join(worktree, "README.md"), "# app\nchanged\n");
    const input = accepted();
    // Edits made after the check never go out.
    writeFileSync(join(worktree, "late.ts"), "export const late = 1;\n");
    const r = await publishCheckout(input, t());
    expect(r).toMatchObject({ opened: true, url: "https://github.com/acme/app/pull/7", branch: "controlrod/WP-1-r0", reused: false });
    expect(pushed()).not.toContain("late.ts");
    expect(execFileSync("git", ["--git-dir", bare, "show", "controlrod/WP-1-r0:README.md"], { encoding: "utf8" })).toContain("changed");
    expect(remoteBranches()).not.toContain("cr/card");
    const log = readFileSync(ghLog, "utf8");
    expect(log).toContain("GH_HOST=github.com");
    expect(log.split("\n")).toEqual(expect.arrayContaining(["create", "--repo", "github.com/acme/app", "--head", "controlrod/WP-1-r0", "--base", "main", "--draft"]));
  });

  it("rebuilds the same commit on a retry and finds the pull request it already opened", async () => {
    writeFileSync(join(worktree, "README.md"), "# app\nchanged\n");
    const input = accepted();
    const first = await publishCheckout(input, t());
    expect(first.opened).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    writeFileSync(`${ghLog}.existing`, JSON.stringify([{ url: "https://github.com/acme/app/pull/7", headRefOid: (first as { head: string }).head, isDraft: true }]));
    expect(await publishCheckout(input, t())).toMatchObject({ opened: true, reused: true, url: "https://github.com/acme/app/pull/7" });
    expect(readFileSync(ghLog, "utf8").split("\n").filter((l) => l === "create")).toHaveLength(1);
  });

  it("refuses a branch that already holds other work", async () => {
    writeFileSync(join(worktree, "README.md"), "# app\none\n");
    expect((await publishCheckout(accepted(), t())).opened).toBe(true);
    writeFileSync(join(worktree, "README.md"), "# app\ntwo\n");
    expect(await publishCheckout(accepted(), t())).toMatchObject({ opened: false, reason: "failed", detail: expect.stringMatching(/already exists on GitHub with other work/) });
  });

  it("never sends anything under a run folder", async () => {
    mkdirSync(join(worktree, ".controlrod-run-1"));
    writeFileSync(join(worktree, ".controlrod-run-1", "log"), "private\n");
    g(worktree, "add", "-f", ".controlrod-run-1/log");
    expect(await publishCheckout(accepted(), t())).toMatchObject({ opened: false, detail: expect.stringMatching(/controlrod-run/) });
    expect(remoteBranches()).toBe("");
  });

  it("refuses work the author committed past the bound commit, since the check reviewed the patch", async () => {
    writeFileSync(join(worktree, "x.ts"), "1");
    g(worktree, "add", "x.ts");
    g(worktree, "commit", "-q", "-m", "direct");
    expect(await publishCheckout(accepted(), t())).toMatchObject({ opened: false, detail: expect.stringMatching(/author committed/) });
  });

  it("refuses when the starting commit is not on GitHub, so no unreviewed commit rides along", async () => {
    writeFileSync(join(worktree, "README.md"), "# app\nchanged\n");
    expect(await publishCheckout(accepted(), { ...t(), remoteHas: async () => false })).toMatchObject({ opened: false, detail: expect.stringMatching(/not on GitHub yet/) });
    expect(remoteBranches()).toBe("");
  });

  it("sends nothing once the lane is raised", async () => {
    writeFileSync(join(worktree, "README.md"), "# app\nchanged\n");
    expect(await publishCheckout(accepted({ stillAllowed: async () => false }), t())).toMatchObject({ opened: false, reason: "lane" });
    expect(remoteBranches()).toBe("");
  });

  it("opens nothing when the accepted work changes nothing", async () => {
    expect(await publishCheckout(accepted(), t())).toMatchObject({ opened: false, reason: "no-changes" });
  });

  it("opens nothing for a repository that is not on GitHub", async () => {
    expect(await publishCheckout(accepted({ repo: "app" }), t())).toMatchObject({ opened: false, reason: "not-github" });
  });

  it("refuses when the repository's own config could change what the push sends", async () => {
    writeFileSync(join(worktree, "README.md"), "# app\nchanged\n");
    g(worktree, "config", "push.followTags", "true");
    expect(await publishCheckout(accepted(), t())).toMatchObject({ opened: false, reason: "failed", detail: expect.stringMatching(/push\.followtags/i) });
    g(worktree, "config", "--unset", "push.followTags");
    g(worktree, "config", "url.https://evil.example/.insteadOf", "https://github.com/");
    expect(await publishCheckout(accepted(), t())).toMatchObject({ opened: false, reason: "failed", detail: expect.stringMatching(/could change what a push sends/) });
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
