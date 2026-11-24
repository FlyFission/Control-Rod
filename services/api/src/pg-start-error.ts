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
export function pgStartFailure(pgDir: string, port: number, log: string[], error: unknown, os: string = process.platform): string {
  const text = log.join("\n");
  const important = log.filter((l) => /\b(FATAL|PANIC|ERROR|DETAIL|HINT):/.test(l));
  const shown = (important.length ? important : log).slice(-12);
  let advice: string;
  const lock = /lock file "postmaster\.pid" already exists/.test(text);
  const pid = text.match(/Is another postmaster \(PID (\d+)\) running/)?.[1];
  if (lock) {
    advice =
      `Another PostgreSQL${pid ? ` (process ${pid})` : ""} may still be using this data folder, usually one left behind when ` +
      `Control Rod was stopped abruptly. Stop this Control Rod (\`controlrod stop\`) and any other one using this data folder, wait a few seconds and start again. ` +
      `If it still fails, check \`ps -p ${pid ?? "<pid>"} -o command=\`: if that is a postgres for ${pgDir}, stop it with ` +
      `\`kill ${pid ?? "<pid>"}\`. Do not delete files in ${pgDir}: it holds your records.`;
  } else if (/Address already in use/i.test(text)) {
    advice =
      `Port ${port} is already in use. Find what holds it with \`lsof -nP -iTCP:${port} -sTCP:LISTEN\`, stop it, or set ` +
      `CONTROLROD_PG_PORT to a free port.`;
  } else if (/database files are incompatible with server/.test(text)) {
    advice =
      `The data in ${pgDir} was made by a different PostgreSQL version than the bundled one. Keep the folder ` +
      `(it holds your records) and report this; do not delete it to get started.`;
  } else if (/could not create shared memory segment/i.test(text) && /No space left on device/i.test(text)) {
    advice =
      os === "darwin"
        ? "The system has no System V shared memory segments left for PostgreSQL. This is not disk space: macOS allows only " +
          "32 in all, and PostgreSQL runs that were killed leave theirs behind. `controlrod doctor` lists the ones whose " +
          "PostgreSQL is gone and `controlrod doctor --fix` frees them; restarting the computer frees them too."
        : "The system has no System V shared memory segments left for PostgreSQL. This is not disk space. `ipcs -m` lists them; " +
          "ones with 0 attached whose creating process is gone can be freed with `ipcrm -m <id>`, or restart the computer.";
  } else if (/could not map anonymous shared memory|could not create shared memory segment/i.test(text)) {
    advice = "The system would not give PostgreSQL the shared memory it asked for. Close memory-hungry programs or restart the computer, then try again.";
  } else if (/Permission denied/i.test(text)) {
    advice = `PostgreSQL cannot read or write ${pgDir}. It must be owned by you with permissions 700 (\`chmod 700 ${pgDir}\`).`;
  } else {
    advice = "If Control Rod was just stopped, wait a few seconds and try again.";
  }
  const detail = shown.length ? shown.map((l) => `  ${l}`).join("\n") : `  ${error instanceof Error ? error.message : String(error ?? "no output")}`;
  return `Control Rod could not start its database in ${pgDir}. ${advice}\nPostgreSQL said:\n${detail}`;
}
