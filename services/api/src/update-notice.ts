import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type UpdateNotice = { running_commit: string; checked_at: string; checkout_commit?: string } & (
  { latest_commit: string; behind: number } | { error: string }
);

/**
 * Whether the person turned automatic update checks off: CONTROLROD_UPDATE_CHECK=0 (or off, false,
 * no). The daemon reads the same variable for its check of the agent CLIs (daemon/cmd/controlrod
 * agents.go updateCheckOff), so one setting stops both.
 */
export function updateCheckOff(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.CONTROLROD_UPDATE_CHECK ?? "").trim().toLowerCase();
  return v === "0" || v === "off" || v === "false" || v === "no";
}

/**
 * The check the API makes once at start, which fetches main from the repository's origin (GitHub for
 * a normal clone). Skipped when the person turned checks off; "Check again" on the page still checks,
 * because the person asked.
 */
export function checkAtStart(notice: ReturnType<typeof updateNoticeFor>, env: NodeJS.ProcessEnv = process.env) {
  if (!notice || updateCheckOff(env)) return undefined;
  return notice.check();
}

/** A check that has not finished by then is stopped: a stalled fetch must not hold the API. */
export const UPDATE_CHECK_DEADLINE_MS = 30_000;

export function updateNoticeFor(
  root: string,
  home: string,
  runningCommit: string | undefined,
  helper: string[] = [join(root, "scripts", "update-notice.mjs")],
  deadlineMs: number = UPDATE_CHECK_DEADLINE_MS,
) {
  if (!runningCommit || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(runningCommit)) return undefined;
  const version = runningCommit;
  const empty = { running_commit: version };
  const failed = () => ({ ...empty, checked_at: new Date().toISOString(), error: "Could not check for updates." });
  // The last check's own failure, so an older saved result is never shown as if it were fresh.
  let lastFailure: ReturnType<typeof failed> | undefined;
  const read = async () => {
    if (lastFailure) return lastFailure;
    try {
      const record = JSON.parse(await readFile(join(home, "update-notice.json"), "utf8")) as UpdateNotice;
      return record?.running_commit === version ? record : empty;
    } catch {
      return empty;
    }
  };
  // The helper runs in its own process group, so at the deadline git and its transport go too.
  const runHelper = () =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [...helper, home, version], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      const deadline = setTimeout(() => {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
        reject(new Error("update check timed out"));
      }, deadlineMs);
      child.once("error", (err) => { clearTimeout(deadline); reject(err); });
      child.once("exit", (code) => { clearTimeout(deadline); code === 0 ? resolve() : reject(new Error(`exit ${code}`)); });
    });
  const run = async () => {
    try {
      await runHelper();
      lastFailure = undefined;
      return await read();
    } catch {
      lastFailure = failed();
      return lastFailure;
    }
  };
  let pending: ReturnType<typeof run> | undefined;
  return {
    // A read during a check (the one at start-up, say) waits for it, at most the check's deadline,
    // so a page opened early still learns the result without polling for it.
    read: () => pending ?? read(),
    check: () => (pending ??= run().finally(() => { pending = undefined; })),
  };
}
