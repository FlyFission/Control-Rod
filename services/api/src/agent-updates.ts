import type { Db } from "./db/index.js";
import { command } from "./commands/executor.js";
import { checkSchema } from "./tenancy.js";

/**
 * Agent CLI updates (change record agent-update-prompt). The daemon checks for newer versions once,
 * when it starts, and reports them on its claims with the npm command that installs each one. The
 * app shows them; the person runs the command in a terminal (or `controlrod agents update`, which
 * asks first). Nothing here installs anything, and no command travels to the daemon.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- settings rows are validated JSON */
type Json = any;

/** Keeps the daemon's latest report. Entries the schema refuses are dropped, never stored. */
export async function recordAgentUpdates(db: Db, raw: unknown): Promise<void> {
  if (!Array.isArray(raw)) return;
  const list: Json[] = [];
  for (const u of raw.slice(0, 10)) {
    try {
      checkSchema("AgentUpdate.json", u);
      list.push(u);
    } catch {
      /* a malformed entry is left out */
    }
  }
  await command(db, "runtime.report-agent-updates", async (c) => {
    await c.query("insert into settings (key, value) values ('agent_updates', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(list)]);
  });
}

/** What the app shows: each outdated agent the daemon last reported. */
export async function agentUpdateView(db: Db): Promise<{ agent_updates?: Json[] }> {
  const r = await db.query<{ value: string }>("select value from settings where key = 'agent_updates'");
  return r.rows[0] ? { agent_updates: JSON.parse(r.rows[0].value) } : {};
}
