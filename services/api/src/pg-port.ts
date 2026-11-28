import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The port of the embedded PostgreSQL. It used to be 7301 always, one above the web port, so the
 * obvious fix for a busy 7300 (CONTROLROD_PORT=7301) collided with it. Now:
 *
 * 1. CONTROLROD_PG_PORT, when set, is used as given.
 * 2. Otherwise the port recorded in <home>/pg.port is kept, so an install's database stays where it
 *    was (scripts and pass files that name it keep working).
 * 3. An install made before that file existed (its data folder is there, no pg.port) was on 7301,
 *    and keeps 7301.
 * 4. A new install takes the web port plus 10000 (17300 by default), which no nearby web port reaches.
 *
 * A kept port that equals the web port cannot work, so that one case moves to the derived port and
 * says so. The data folder is not tied to a port: PostgreSQL is only told the port when it starts, so
 * moving never touches the records. The chosen port is written to <home>/pg.port.
 */
export const LEGACY_PG_PORT = 7301;

export interface PgPortChoice {
  port: number;
  /** A line for the log when the database moved from the port it had before. */
  moved?: string;
}

const validPort = (n: number) => Number.isInteger(n) && n > 0 && n <= 65535;

/** The web port plus 10000, or minus 10000 when that would pass 65535. */
export function derivedPgPort(webPort: number): number {
  return webPort + 10000 <= 65535 ? webPort + 10000 : webPort - 10000;
}

export function choosePgPort(opts: { home: string; webPort: number; env?: string | undefined; dataExists: boolean }): PgPortChoice {
  const { home, webPort, env, dataExists } = opts;
  if (env !== undefined && env.trim() !== "") {
    const n = Number(env.trim());
    if (!validPort(n)) throw new Error(`CONTROLROD_PG_PORT must be a port number from 1 to 65535, not ${JSON.stringify(env)}.`);
    if (n === webPort) throw new Error(`CONTROLROD_PG_PORT and CONTROLROD_PORT are both ${n}. Give the database another port.`);
    return { port: n };
  }
  const file = join(home, "pg.port");
  let kept: number | null = null;
  const recorded = existsSync(file);
  if (recorded) {
    const n = Number(readFileSync(file, "utf8").trim());
    kept = validPort(n) ? n : null;
  } else if (dataExists) {
    kept = LEGACY_PG_PORT;
  }
  let choice: PgPortChoice;
  if (kept === null) choice = { port: derivedPgPort(webPort) };
  else if (kept === webPort) {
    const port = derivedPgPort(webPort);
    choice = {
      port,
      moved: `The bundled database moved from port ${kept} to ${port}, because the web app now uses ${kept}. Its data is unchanged. Set CONTROLROD_PG_PORT to choose the port yourself.`,
    };
  } else choice = { port: kept };
  if (!recorded || kept !== choice.port) {
    const tmp = `${file}.tmp.${process.pid}`;
    writeFileSync(tmp, `${choice.port}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, file);
  }
  return choice;
}
