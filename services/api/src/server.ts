import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { buildApp } from "./app.js";
import { hashToken } from "./auth.js";
import { openDb } from "./db/index.js";

/**
 * Starts Control Rod on this machine: an embedded Postgres in ~/.controlrod/pg, the control
 * plane on port 7300, and a daemon token in ~/.controlrod/daemon.token (owner read-only).
 */
const home = process.env.CONTROLROD_HOME ?? join(homedir(), ".controlrod");
const port = Number(process.env.CONTROLROD_PORT ?? 7300);
const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
mkdirSync(home, { recursive: true, mode: 0o700 });

/** Postgres: CONTROLROD_DATABASE_URL if set (Postgres.app, Homebrew, a server), else embedded in ~/.controlrod/pg. */
let pgServer: EmbeddedPostgres | null = null;
let dbUrl = process.env.CONTROLROD_DATABASE_URL ?? "";
if (!dbUrl) {
  const pwFile = join(home, "pg.password");
  if (!existsSync(pwFile)) writeFileSync(pwFile, randomBytes(24).toString("hex"), { mode: 0o600 });
  const pgPassword = readFileSync(pwFile, "utf8").trim();
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
  if (!existsSync(join(pgDir, "PG_VERSION"))) await pgServer.initialise();
  await pgServer.start();
  dbUrl = `postgres://controlrod:${pgPassword}@127.0.0.1:${pgPort}/postgres`;
}
const db = await openDb(dbUrl);

const tokenPath = join(home, "daemon.token");
const token = randomBytes(32).toString("base64url");
writeFileSync(tokenPath, token, { mode: 0o600 });
chmodSync(tokenPath, 0o600);

const origin = process.env.CONTROLROD_ORIGIN ?? `http://localhost:${port}`;
const app = buildApp({
  db,
  root,
  webDir: join(root, "apps", "web", "dist"),
  guidedPreparation: process.env.CONTROLROD_GUIDED_PREPARATION === "1",
  auth: {
    rpID: process.env.CONTROLROD_RP_ID ?? "localhost",
    rpName: "Control Rod",
    origins: [origin, "http://localhost:5173"],
    daemonTokenHash: hashToken(token),
  },
});

const stop = async () => {
  await app.close();
  await db.end();
  await pgServer?.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ host: "127.0.0.1", port });
console.log(`Control Rod is running at ${origin}`);
