import type { Db } from "./db/index.js";
import { command } from "./commands/executor.js";
import { checkSchema } from "./tenancy.js";

/**
 * Agent CLI updates (change record agent-update-prompt). The daemon checks for newer versions once,
 * when it starts, and reports the outdated ones (installed and latest version, and whether npm
 * installed the CLI) on its claims. The app builds the npm command from its own package list and
 * shows it; the person runs it in a terminal (or `controlrod agents update`, which asks first).
 * Nothing here installs anything, and no command is stored or travels to the daemon.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- settings rows are validated JSON */
type Json = any;

/**
 * Keeps the daemon's latest report, agent by agent. Entries the schema refuses are dropped, never
 * stored. An agent the daemon names as unchecked (its check could not finish) keeps the row stored
 * for it, so a fresh daemon's partial check never clears what was known.
 */
export async function recordAgentUpdates(db: Db, raw: unknown, rawUnchecked?: unknown): Promise<void> {
  if (!Array.isArray(raw)) return;
  const list: Json[] = [];
  for (const u of raw.slice(0, 10)) {
    try {
      checkSchema("AgentUpdate.json", u);
      // One row per agent: a repeated agent is left out.
      if (!list.some((x) => x.agent === u.agent)) list.push(u);
    } catch {
      /* a malformed entry is left out */
    }
  }
  const unchecked = new Set<string>();
  if (Array.isArray(rawUnchecked)) {
    // Only names a stored row could carry match anything: stored rows passed the schema above.
    for (const a of rawUnchecked.slice(0, 10)) if (typeof a === "string") unchecked.add(a);
  }
  await command(db, "runtime.report-agent-updates", async (c) => {
    if (unchecked.size > 0) {
      const prior = await c.query<{ value: string }>("select value from settings where key = 'agent_updates' for update");
      const reported = new Set(list.map((u) => u.agent));
      const kept: Json[] = prior.rows[0] ? JSON.parse(prior.rows[0].value) : [];
      for (const u of Array.isArray(kept) ? kept : []) {
        if (unchecked.has(u?.agent) && !reported.has(u.agent)) list.push(u);
      }
    }
    await c.query("insert into settings (key, value) values ('agent_updates', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(list)]);
  });
}

/** What the app shows: each outdated agent the daemon last reported. */
export async function agentUpdateView(db: Db): Promise<{ agent_updates?: Json[] }> {
  const r = await db.query<{ value: string }>("select value from settings where key = 'agent_updates'");
  return r.rows[0] ? { agent_updates: JSON.parse(r.rows[0].value) } : {};
}
