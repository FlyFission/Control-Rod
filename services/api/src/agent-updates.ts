import type { Db, Tx } from "./db/index.js";
import { command } from "./commands/executor.js";
import { Refusal } from "./refusal.js";
import { checkSchema } from "./tenancy.js";

/**
 * Agent CLI updates (change record agent-update-prompt). The daemon checks for newer versions once,
 * when it starts, and reports them on its claims with the package-manager command it would run. An
 * administrator asks for an update with a signed `runtime.update`; the daemon takes the request and
 * runs only its own command for that agent, while no run is active. The control plane never sends a
 * command to the daemon, only agent names.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- settings rows are validated JSON */
type Json = any;

const AGENTS = ["claude", "codex", "agy", "opencode", "grok"];

async function readSetting(q: Db | Tx, key: string): Promise<Json | undefined> {
  const r = await q.query<{ value: string }>("select value from settings where key = $1", [key]);
  return r.rows[0] ? JSON.parse(r.rows[0].value) : undefined;
}

async function writeSetting(c: Tx, key: string, value: unknown) {
  await c.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, JSON.stringify(value)]);
}

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
    await writeSetting(c, "agent_updates", list);
    // A request for an agent no longer listed (updated, or gone) has nothing left to do.
    const pending: string[] = (await readSetting(c, "agent_update_requests")) ?? [];
    const listed = new Set(list.map((u) => u.agent));
    await writeSetting(c, "agent_update_requests", pending.filter((a) => listed.has(a)));
  });
}

/** What the app shows: each outdated agent, and the requests the daemon has not taken yet. */
export async function agentUpdateView(db: Db): Promise<{ agent_updates?: Json[]; agent_updates_requested?: string[] }> {
  const updates = await readSetting(db, "agent_updates");
  if (updates === undefined) return {};
  return { agent_updates: updates, agent_updates_requested: (await readSetting(db, "agent_update_requests")) ?? [] };
}

/** The daemon takes the pending requests; each is returned once. */
export async function takeAgentUpdates(db: Db): Promise<{ agents: string[] }> {
  return command(db, "runtime.take-agent-updates", async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('controlrod-agent-updates'))");
    const pending: string[] = (await readSetting(c, "agent_update_requests")) ?? [];
    await writeSetting(c, "agent_update_requests", []);
    return { agents: pending };
  });
}

/**
 * The administrative command runtime.update: asks the daemon to update the named agents. Each must
 * be listed in the daemon's latest report with a command, so the request is exactly what the person
 * saw: an agent whose install the daemon will not touch is refused.
 */
export async function requestAgentUpdates(c: Tx, p: Json): Promise<{ requested: string[] }> {
  const agents = Array.isArray(p.agents) ? p.agents : [];
  if (!agents.length || agents.length > AGENTS.length || agents.some((a: unknown) => typeof a !== "string" || !AGENTS.includes(a)))
    throw new Refusal(400, "invalid", "agents must name one or more of claude, codex, agy, opencode and grok");
  await c.query("select pg_advisory_xact_lock(hashtext('controlrod-agent-updates'))");
  const listed: Json[] = (await readSetting(c, "agent_updates")) ?? [];
  for (const a of agents) {
    const u = listed.find((x) => x.agent === a);
    if (!u) throw new Refusal(409, "no-update", `${a} has no update the daemon reported`);
    if (!Array.isArray(u.command) || !u.command.length)
      throw new Refusal(409, "no-update-command", `${u.name} was not installed by npm, so Control Rod will not update it; ${u.note ?? "update it with the tool you installed it with"}`);
  }
  const pending: string[] = (await readSetting(c, "agent_update_requests")) ?? [];
  const next = [...new Set([...pending, ...agents])];
  await writeSetting(c, "agent_update_requests", next);
  return { requested: next };
}
