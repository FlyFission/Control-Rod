import type { Db } from "./db/index.js";
import { command } from "./commands/executor.js";
import { checkSchema } from "./tenancy.js";
import { newer } from "./semver.js";

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
 * for it while the installed version is unchanged, so a fresh daemon's partial check never clears
 * what was known, and never keeps an update a newer install has passed.
 */
export async function recordAgentUpdates(db: Db, raw: unknown, rawUnchecked?: unknown): Promise<void> {
  if (!Array.isArray(raw)) return;
  const list: Json[] = [];
  for (const u of raw.slice(0, 10)) {
    try {
      checkSchema("AgentUpdate.json", u);
      // Only an update: latest must be newer than installed by SemVer precedence. One row per
      // agent: a repeated agent is left out.
      if (newer(u.latest, u.installed) && !list.some((x) => x.agent === u.agent)) list.push(u);
    } catch {
      /* a malformed entry is left out */
    }
  }
  // Agent to the installed version the daemon read now, for agents whose check could not finish.
  const unchecked = new Map<string, string>();
  if (Array.isArray(rawUnchecked)) {
    for (const a of rawUnchecked.slice(0, 10)) {
      try {
        checkSchema("UncheckedAgent.json", a);
        if (typeof a.installed === "string") unchecked.set(a.agent, a.installed);
      } catch {
        /* a malformed entry keeps nothing */
      }
    }
  }
  await command(db, "runtime.report-agent-updates", async (c) => {
    if (unchecked.size > 0) {
      const prior = await c.query<{ value: string }>("select value from settings where key = 'agent_updates' for update");
      const reported = new Set(list.map((u) => u.agent));
      const kept: Json[] = prior.rows[0] ? JSON.parse(prior.rows[0].value) : [];
      // A row is kept only while its installed version is the one read now: a CLI updated (or
      // changed) since is never offered the older row's version.
      for (const u of Array.isArray(kept) ? kept : []) {
        if (!reported.has(u?.agent) && unchecked.has(u.agent) && u.installed === unchecked.get(u.agent)) list.push(u);
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
