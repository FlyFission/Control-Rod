import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "../src/db/migrate.js";

/**
 * Released migrations never change: a database that applied one must keep upgrading. This lock
 * records each released migration's checksum (the same sha256 the runner checks). A migration joins
 * the lock when it merges; editing a locked one fails here instead of at a user's next startup.
 * Regenerate after adding a migration: UPDATE_MIGRATION_LOCK=1 pnpm test -- test/migration-lock.test.ts
 */
const lockFile = new URL("../src/db/migrations/released.json", import.meta.url);
const sha = (sql: string) => createHash("sha256").update(sql).digest("hex");

describe("released migrations", () => {
  it("keep their checksums", () => {
    const current = Object.fromEntries(MIGRATIONS.map((m) => [m.version, sha(m.sql)]));
    if (process.env.UPDATE_MIGRATION_LOCK) {
      writeFileSync(lockFile, JSON.stringify({ released: current }, null, 2) + "\n");
      return;
    }
    const lock = JSON.parse(readFileSync(lockFile, "utf8")) as { released: Record<string, string> };
    for (const [version, checksum] of Object.entries(lock.released)) expect(current[version], version).toBe(checksum);
  });
});
