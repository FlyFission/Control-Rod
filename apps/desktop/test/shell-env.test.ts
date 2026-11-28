import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  commonCliDirs,
  ENV_END_MARKER,
  ENV_START_MARKER,
  mergePaths,
  parseNullDelimitedEnv,
  resolveDesktopEnv,
} from "../src/main/shell-env.js";

describe("shell-env", () => {
  it("extracts allowlisted NUL-delimited variables and ignores MOTD banners and secrets", () => {
    const raw = [
      "Welcome to zsh! Last login: today\n",
      ENV_START_MARKER,
      "PATH=/opt/homebrew/bin:/Users/dev/.local/bin:/usr/bin\0",
      "LANG=en_US.UTF-8\0",
      "LC_ALL=en_US.UTF-8\0",
      "CLAUDE_CONFIG_DIR=/Users/dev/.claude\0",
      "CODEX_HOME=/Users/dev/.codex\0",
      "OPENAI_API_KEY=sk-should-not-leak\0",
      "ANTHROPIC_API_KEY=sk-ant-should-not-leak\0",
      ENV_END_MARKER,
      "trailing output",
    ].join("");

    const parsed = parseNullDelimitedEnv(raw);
    expect(parsed).toEqual({
      PATH: "/opt/homebrew/bin:/Users/dev/.local/bin:/usr/bin",
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      CLAUDE_CONFIG_DIR: "/Users/dev/.claude",
      CODEX_HOME: "/Users/dev/.codex",
    });
    expect(parsed.OPENAI_API_KEY).toBeUndefined();
    expect(parsed.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("merges PATH groups without duplicates while preserving precedence", () => {
    const merged = mergePaths(["/opt/homebrew/bin:/usr/bin", "/usr/bin:/usr/local/bin", "/opt/homebrew/bin:/home/u/.local/bin"], ":");
    expect(merged).toBe("/opt/homebrew/bin:/usr/bin:/usr/local/bin:/home/u/.local/bin");
  });

  it("includes macOS Homebrew and user local bin fallback directories", () => {
    const dirs = commonCliDirs("/Users/alice", "darwin");
    expect(dirs).toContain("/Users/alice/.local/bin");
    expect(dirs).toContain("/opt/homebrew/bin");
    expect(dirs).toContain("/usr/local/bin");
    expect(dirs).toContain("/Users/alice/.local/share/mise/shims");
  });

  it("finds and runs a user-installed agent CLI when launched from a minimal GUI PATH", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cr-shell-env-"));
    try {
      const cliDir = join(tmp, "agent-bin");
      const fakeShell = join(tmp, "fake-login-shell.sh");
      const fakeClaude = join(cliDir, "claude");
      const fakeHome = join(tmp, "home");

      // Create a fake agent CLI in a directory that is NOT in /usr/bin:/bin.
      spawnSync("mkdir", ["-p", cliDir, fakeHome]);
      writeFileSync(fakeClaude, "#!/bin/sh\necho 'claude-cli-ok'\n", { mode: 0o755 });
      chmodSync(fakeClaude, 0o755);

      // Fake login shell that prints a noisy banner, exports cliDir into PATH, and runs the probe command.
      writeFileSync(
        fakeShell,
        `#!/bin/sh\necho "noisy shell banner"\nexport PATH="${cliDir}:$PATH"\nexport CLAUDE_CONFIG_DIR="${fakeHome}/.claude"\nshift\nexec /bin/sh -c "$1"\n`,
        { mode: 0o755 },
      );
      chmodSync(fakeShell, 0o755);

      // Simulate macOS launchd minimal GUI environment.
      const minimalGuiEnv: NodeJS.ProcessEnv = {
        HOME: fakeHome,
        PATH: "/usr/bin:/bin",
        SHELL: fakeShell,
      };

      const resolved = resolveDesktopEnv(minimalGuiEnv, {
        shell: fakeShell,
        home: fakeHome,
        platform: "darwin",
      });

      expect(resolved.PATH?.split(":")).toContain(cliDir);
      expect(resolved.CLAUDE_CONFIG_DIR).toBe(`${fakeHome}/.claude`);

      // Verify `claude` is actually discovered and executable under the resolved GUI environment.
      const run = spawnSync("claude", ["--version"], { encoding: "utf8", env: resolved });
      expect(run.status).toBe(0);
      expect(run.stdout.trim()).toBe("claude-cli-ok");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
