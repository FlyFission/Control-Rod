/**
 * The bundled PostgreSQL package rejects with no reason when the server exits during start, so the
 * message a person sees has to come from the server's own log. This keeps the tail of that log and
 * turns the common causes into a plain next step.
 */
export class PgLogTail {
  private lines: string[] = [];
  constructor(private readonly max = 60) {}
  push(chunk: string): void {
    for (const line of chunk.split("\n")) {
      const l = line.trimEnd();
      if (!l) continue;
      this.lines.push(l);
      if (this.lines.length > this.max) this.lines.shift();
    }
  }
  clear(): void {
    this.lines = [];
  }
  all(): string[] {
    return [...this.lines];
  }
}

/** The text thrown when the bundled database will not start after every attempt. */
export function pgStartFailure(pgDir: string, port: number, log: string[], error: unknown): string {
  const text = log.join("\n");
  const important = log.filter((l) => /\b(FATAL|PANIC|ERROR|DETAIL|HINT):/.test(l));
  const shown = (important.length ? important : log).slice(-12);
  let advice: string;
  const lock = /lock file "postmaster\.pid" already exists/.test(text);
  const pid = text.match(/Is another postmaster \(PID (\d+)\) running/)?.[1];
  if (lock) {
    advice =
      `Another PostgreSQL${pid ? ` (process ${pid})` : ""} is using this data folder, usually one left behind when ` +
      `Control Rod was stopped abruptly. Stop Control Rod everywhere, then check with \`ps -p ${pid ?? "<pid>"} -o command=\`: ` +
      `if it is a postgres for ${pgDir}, stop it with \`kill ${pid ?? "<pid>"}\` and start again. If no such process exists, ` +
      `the lock is stale: remove ${pgDir}/postmaster.pid and start again. Your data is not affected either way.`;
  } else if (/could not bind|Address already in use/i.test(text)) {
    advice =
      `Port ${port} is already in use. Find what holds it with \`lsof -nP -iTCP:${port} -sTCP:LISTEN\`, stop it, or set ` +
      `CONTROLROD_PG_PORT to a free port.`;
  } else if (/database files are incompatible with server/.test(text)) {
    advice =
      `The data in ${pgDir} was made by a different PostgreSQL version than the bundled one. Keep the folder ` +
      `(it holds your records) and report this; do not delete it to get started.`;
  } else if (/could not create shared memory segment|could not map anonymous shared memory/i.test(text)) {
    advice =
      "The system has no shared memory left for PostgreSQL. This is not disk space: on macOS only 32 shared memory " +
      "segments exist, and PostgreSQL runs that were killed leave theirs behind. `controlrod start` (or `pnpm cr start`) " +
      "clears segments left by dead processes; restarting the computer clears them too.";
  } else if (/Permission denied/i.test(text)) {
    advice = `PostgreSQL cannot read or write ${pgDir}. It must be owned by you with permissions 700 (\`chmod 700 ${pgDir}\`).`;
  } else {
    advice = "If Control Rod was just stopped, wait a few seconds and try again.";
  }
  const detail = shown.length ? shown.map((l) => `  ${l}`).join("\n") : `  ${error instanceof Error ? error.message : String(error ?? "no output")}`;
  return `Control Rod could not start its database in ${pgDir}. ${advice}\nPostgreSQL said:\n${detail}`;
}
