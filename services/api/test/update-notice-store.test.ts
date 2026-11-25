import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
