import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

export type UpdateNotice = { running_commit: string; checked_at: string; checkout_commit?: string } & (
  { latest_commit: string; behind: number } | { error: string }
);

export function updateNoticeFor(root: string, home: string, runningCommit: string | undefined) {
  if (!runningCommit || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(runningCommit)) return undefined;
  const version = runningCommit;
  const empty = { running_commit: version };
  const read = async () => {
    try {
      const record = JSON.parse(await readFile(join(home, "update-notice.json"), "utf8")) as UpdateNotice;
      return record?.running_commit === version ? record : empty;
    } catch {
      return empty;
    }
  };
  const run = async () => {
    try {
      await promisify(execFile)(process.execPath, [join(root, "scripts", "update-notice.mjs"), home, version]);
      return await read();
    } catch {
      return { ...empty, error: "Could not check for updates." };
    }
  };
  let pending: ReturnType<typeof run> | undefined;
  return {
    read: () => pending ?? read(),
    check: () => (pending ??= run().finally(() => { pending = undefined; })),
  };
}
