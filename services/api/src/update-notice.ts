import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

export type UpdateNotice = { running_commit: string; checked_at: string; checkout_commit?: string } & (
  { latest_commit: string; behind: number } | { error: string }
);

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
  const run = async () => {
    try {
      await promisify(execFile)(process.execPath, [...helper, home, version], {
        timeout: deadlineMs,
        killSignal: "SIGKILL",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      lastFailure = undefined;
      return await read();
    } catch {
      lastFailure = failed();
      return lastFailure;
    }
  };
  let pending: ReturnType<typeof run> | undefined;
  return {
    // Reading never waits for a check in progress: it shows what was last saved.
    read,
    check: () => (pending ??= run().finally(() => { pending = undefined; })),
  };
}
