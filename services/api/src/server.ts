import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { preparationConfig } from "./preparation/config.js";
import { buildApp } from "./app.js";
import { hashToken, isRegistered } from "./auth.js";
import { closeDb, openDb } from "./db/index.js";
import { localRoleSecrets, privateDir, privateFile } from "./db/roles.js";
import { loadTrustAnchors } from "./attestation.js";
import { PgLogTail, pgStartFailure } from "./pg-start-error.js";
import { updateNoticeFor } from "./update-notice.js";

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
// Started by `pnpm cr start`, the control plane runs in its own process group, out of reach of the
// terminal's Ctrl+C, and the launcher stops it. If the launcher is gone (killed outright), this
// process has been reparented: stop rather than run on unowned. Armed before the database starts,
// since migrations can wait on a lock; until the app is built, stopping means stopping PostgreSQL.
let onLauncherGone: () => Promise<void> = async () => {
  await pgServer?.stop().catch(() => undefined);
  process.exit(0);
};
const launcher = Number(process.env.CONTROLROD_LAUNCHER_PID);
if (Number.isInteger(launcher) && launcher > 1) {
  setInterval(() => {
    if (process.ppid !== launcher) void onLauncherGone();
  }, 1000).unref();
}
let dbUrl = process.env.CONTROLROD_DATABASE_URL ?? "";
if (!dbUrl) {
  const pgPassword = privateFile(join(home, "pg.password"), () => randomBytes(24).toString("hex"));
  const pgPort = Number(process.env.CONTROLROD_PG_PORT ?? 7301);
  const pgDir = join(home, "pg");
  // Kept so a failed start can say what PostgreSQL said, not just that it stopped.
  const pgLog = new PgLogTail();
  pgServer = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: "controlrod",
    password: pgPassword,
    port: pgPort,
    persistent: true,
    onLog: (message: string) => pgLog.push(String(message)),
    onError: (message: unknown) => pgLog.push(String(message)),
  });
  if (!existsSync(join(pgDir, "PG_VERSION"))) {
    // Initialisation briefly writes the owner password to a temporary file; keep it private.
    const previous = process.umask(0o077);
    try {
      await pgServer.initialise();
    } catch (error) {
      // initdb's own output is in the error message; show it the same way as a failed start.
      pgLog.push(error instanceof Error ? error.message : String(error));
      console.error(`\n${pgStartFailure(pgDir, pgPort, pgLog.all(), error)}\n`);
      process.exit(1);
    } finally {
      process.umask(previous);
    }
  }
  // A database stopped a moment ago may still be shutting down; give it a few seconds.
  for (let attempt = 1; ; attempt++) {
    pgLog.clear();
    try {
      await pgServer.start();
      break;
    } catch (error) {
      if (attempt === 10) {
        console.error(`\n${pgStartFailure(pgDir, pgPort, pgLog.all(), error)}\n`);
        process.exit(1);
      }
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
const tokenTmp = `${tokenPath}.tmp.${process.pid}`;
const token = randomBytes(32).toString("base64url");
writeFileSync(tokenTmp, token, { mode: 0o600 });
chmodSync(tokenTmp, 0o600);
renameSync(tokenTmp, tokenPath);

// The command line's token (controlrod card add, controlrod cards), written the same way.
const cliTokenPath = join(home, "cli.token");
const cliTokenTmp = `${cliTokenPath}.tmp.${process.pid}`;
const cliToken = randomBytes(32).toString("base64url");
writeFileSync(cliTokenTmp, cliToken, { mode: 0o600 });
chmodSync(cliTokenTmp, 0o600);
renameSync(cliTokenTmp, cliTokenPath);

// Until the first passkey is registered, registering it needs a one-time setup code that only the
// person who started Control Rod can read: printed below and written to a file only they can open.
// Anyone else who can reach the port (another account on this machine, a proxy or tunnel in front of
// it) cannot claim the installation first. A new code each start; the file goes once a passkey exists.
const setupCodePath = join(home, "setup-code");
let setupCode: string | undefined;
if (!(await isRegistered(db))) {
  const raw = randomBytes(8).toString("hex").toUpperCase();
  setupCode = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
  const setupTmp = `${setupCodePath}.tmp.${process.pid}`;
  writeFileSync(setupTmp, `${setupCode}\n`, { mode: 0o600 });
  chmodSync(setupTmp, 0o600);
  renameSync(setupTmp, setupCodePath);
} else {
  rmSync(setupCodePath, { force: true });
}

const origin = process.env.CONTROLROD_ORIGIN ?? `http://localhost:${port}`;
const sourceConfigPath=process.env.CONTROLROD_PREPARATION_CONFIG;
const sourceConfig=sourceConfigPath?preparationConfig(readFileSync(sourceConfigPath,"utf8")):{};
const updateNotice = updateNoticeFor(root, home, process.env.CONTROLROD_RUNNING_COMMIT);
const app = buildApp({
  ...sourceConfig,
  db,
  root,
  webDir: join(root, "apps", "web", "dist"),
  updateNotice,
  ...(setupCode ? { setupCode, onSetupDone: () => rmSync(setupCodePath, { force: true }) } : {}),
  guidedPreparation: process.env.CONTROLROD_GUIDED_PREPARATION === "1",
  preparedRelease: process.env.CONTROLROD_PREPARED_RELEASE === "1",
  auth: {
    rpID: process.env.CONTROLROD_RP_ID ?? "localhost",
    rpName: "Control Rod",
    origins: [origin, "http://localhost:5173"],
    daemonTokenHash: hashToken(token),
    cliTokenHash: hashToken(cliToken),
    trustAnchors: loadTrustAnchors(join(home, "trust-anchors")),
  },
});

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  try {
    await app.close().catch(() => undefined);
    await closeDb(db).catch(() => undefined);
    await pgServer?.stop().catch(() => undefined);
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
onLauncherGone = stop;

await app.listen({ host: "127.0.0.1", port });
void updateNotice?.check();
console.log(`Control Rod is running at ${origin}`);
if (setupCode) console.log(`To set it up, open it and type this setup code: ${setupCode} (also saved in ${setupCodePath})`);
