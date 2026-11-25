import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { updateNoticeFor } from "../src/update-notice.js";

test("ignores records for other launches and shares an active check with readers and callers", async () => {
  const root = await mkdtemp(join(tmpdir(), "controlrod-notice-"));
  try {
    const scripts = join(root, "scripts");
    const home = join(root, "data");
    await mkdir(scripts);
    await mkdir(home);
    const running = "a".repeat(40);
    const latest = "b".repeat(40);
    await writeFile(join(home, "update-notice.json"), JSON.stringify({ running_commit: latest, behind: 0 }));
    await writeFile(join(scripts, "update-notice.mjs"), `
      import { writeFile } from "node:fs/promises";
      import { join } from "node:path";
      const [home, running] = process.argv.slice(2);
      await writeFile(join(home, "update-notice.json"), JSON.stringify({
        running_commit: running, latest_commit: ${JSON.stringify(latest)}, behind: 1, checked_at: new Date().toISOString(),
      }));
    `);
    const store = updateNoticeFor(root, home, running)!;
    expect(await store.read()).toEqual({ running_commit: running });
    const check = store.check();
    expect(store.check()).toBe(check);
    expect(store.read()).toBe(check);
    expect(await check).toEqual({ running_commit: running, latest_commit: latest, behind: 1, checked_at: expect.any(String) });
    expect(await store.read()).toEqual(await check);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stops a stalled check at its deadline and never shows an older result as fresh", async () => {
  const root = await mkdtemp(join(tmpdir(), "controlrod-notice-"));
  try {
    const home = join(root, "data");
    await mkdir(home);
    const running = "a".repeat(40);
    const saved = { running_commit: running, latest_commit: "b".repeat(40), behind: 3, checked_at: "2026-11-24T00:00:00.000Z" };
    await writeFile(join(home, "update-notice.json"), JSON.stringify(saved));
    const stall = join(root, "stall.mjs");
    const pidFile = join(root, "grandchild.pid");
    // Like git under the helper: a grandchild that would outlive a kill of the helper alone.
    await writeFile(stall, `
      import { spawn } from "node:child_process";
      import { writeFileSync } from "node:fs";
      const g = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
      writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
      setInterval(() => {}, 1000);
    `);
    const store = updateNoticeFor(root, home, running, [stall], 500)!;
    expect(await store.read()).toEqual(saved);
    const started = Date.now();
    const result = await store.check();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result).toMatchObject({ running_commit: running, error: "Could not check for updates." });
    expect(await store.read()).toEqual(result);
    const grandchild = Number(await readFile(pidFile, "utf8"));
    await new Promise((r) => setTimeout(r, 100));
    expect(() => process.kill(grandchild, 0)).toThrow();

    const fails = join(root, "fails.mjs");
    await writeFile(fails, "process.exit(1);");
    const again = updateNoticeFor(root, home, running, [fails])!;
    expect(await again.check()).toMatchObject({ error: "Could not check for updates." });
    expect(await again.read()).not.toHaveProperty("behind");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
