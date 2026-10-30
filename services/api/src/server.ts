import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { preparationConfig } from "./preparation/config.js";
import { buildApp } from "./app.js";
import { hashToken } from "./auth.js";
import { closeDb, openDb } from "./db/index.js";
import { localRoleSecrets, privateDir, privateFile } from "./db/roles.js";

/**
 * Starts Control Rod on this machine: an embedded Postgres in ~/.controlrod/pg, the control
 * plane on port 7300, and a daemon token in ~/.controlrod/daemon.token (owner read-only).
 */
const home = process.env.CONTROLROD_HOME ?? join(homedir(), ".controlrod");
const port = Number(process.env.CONTROLROD_PORT ?? 7300);
const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
mkdirSync(home, { recursive: true, mode: 0o700 });
privateDir(home);

/** Postgres: CONTROLROD_DATABASE_URL if set (Postgres.app, Homebrew, a server), else embedded in ~/.controlrod/pg. */
let pgServer: EmbeddedPostgres | null = null;
let dbUrl = process.env.CONTROLROD_DATABASE_URL ?? "";
if (!dbUrl) {
  const pgPassword = privateFile(join(home, "pg.password"), () => randomBytes(24).toString("hex"));
  const pgPort = Number(process.env.CONTROLROD_PG_PORT ?? 7301);
  const pgDir = join(home, "pg");
  pgServer = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: "controlrod",
    password: pgPassword,
    port: pgPort,
    persistent: true,
    onLog: () => undefined,
  });
  if (!existsSync(join(pgDir, "PG_VERSION"))) {
    // Initialisation briefly writes the owner password to a temporary file; keep it private.
    const previous = process.umask(0o077);
    try {
      await pgServer.initialise();
    } finally {
      process.umask(previous);
    }
  }
  // A database stopped a moment ago may still be shutting down; give it a few seconds.
  for (let attempt = 1; ; attempt++) {
    try {
      await pgServer.start();
      break;
    } catch (error) {
      if (attempt === 10)
        throw new Error(`Control Rod could not start its database in ${pgDir}. If Control Rod was just stopped, wait a few seconds and try again. Detail: ${String(error)}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  dbUrl = `postgres://controlrod:${pgPassword}@127.0.0.1:${pgPort}/postgres`;
}
// The app reads and writes through two logins of its own (specification 10.1). An administrator of
// an external database can issue them; otherwise the app creates them, keeping their passwords here.
const roleUrls = process.env.CONTROLROD_DB_READER_URL && process.env.CONTROLROD_DB_WRITER_URL
  ? { readerUrl: process.env.CONTROLROD_DB_READER_URL, writerUrl: process.env.CONTROLROD_DB_WRITER_URL }
  : undefined;
const db = await openDb(dbUrl, roleUrls
  ? { urls: roleUrls }
  : { secrets: localRoleSecrets(join(home, "db-roles.json")), ownsCluster: pgServer !== null });

const tokenPath = join(home, "daemon.token");
const token = randomBytes(32).toString("base64url");
writeFileSync(tokenPath, token, { mode: 0o600 });
chmodSync(tokenPath, 0o600);

const origin = process.env.CONTROLROD_ORIGIN ?? `http://localhost:${port}`;
const sourceConfigPath=process.env.CONTROLROD_PREPARATION_CONFIG;
const sourceConfig=sourceConfigPath?preparationConfig(readFileSync(sourceConfigPath,"utf8")):{};
const app = buildApp({
  ...sourceConfig,
  db,
  root,
  webDir: join(root, "apps", "web", "dist"),
  guidedPreparation: process.env.CONTROLROD_GUIDED_PREPARATION === "1",
  preparedRelease: process.env.CONTROLROD_PREPARED_RELEASE === "1",
  auth: {
    rpID: process.env.CONTROLROD_RP_ID ?? "localhost",
    rpName: "Control Rod",
    origins: [origin, "http://localhost:5173"],
    daemonTokenHash: hashToken(token),
  },
});

const stop = async () => {
  await app.close();
  await closeDb(db);
  await pgServer?.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ host: "127.0.0.1", port });
console.log(`Control Rod is running at ${origin}`);
