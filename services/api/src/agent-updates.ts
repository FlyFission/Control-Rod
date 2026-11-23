import type { Db, Tx } from "./db/index.js";
import { command } from "./commands/executor.js";
import { Refusal } from "./refusal.js";
import { checkSchema } from "./tenancy.js";

/**
 * Agent CLI updates (change record agent-update-prompt). The daemon checks for newer versions once,
 * when it starts, and reports them on its claims with the package-manager command it would run. An
 * administrator asks for an update with a signed `runtime.update` naming each agent and the version
 * they were shown; the daemon takes the request and runs only its own command, only when it installs
 * exactly that version, and only while nothing could be using an agent CLI. The control plane never
 * sends a command to the daemon, only agent names and versions. Every read-modify-write of the
 * request queue holds one advisory lock, so a report, a request and a take never overwrite each other.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- settings rows are validated JSON */
type Json = any;

const AGENTS = ["claude", "codex", "agy", "opencode", "grok"];
type Request = { agent: string; version: string };
const LOCK = "select pg_advisory_xact_lock(hashtext('controlrod-agent-updates'))";

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
    await c.query(LOCK);
    await writeSetting(c, "agent_updates", list);
    // A request no longer matching what the daemon would install (updated, gone, or a newer version
    // found) has nothing left to do: the person signs again for what is shown now.
    const pending: Request[] = (await readSetting(c, "agent_update_requests")) ?? [];
    await writeSetting(c, "agent_update_requests", pending.filter((r) => list.some((u) => u.agent === r.agent && u.latest === r.version)));
  });
}

/** What the app shows: each outdated agent, and the requests the daemon has not taken yet. */
export async function agentUpdateView(db: Db): Promise<{ agent_updates?: Json[]; agent_updates_requested?: string[] }> {
  const updates = await readSetting(db, "agent_updates");
  if (updates === undefined) return {};
  const pending: Request[] = (await readSetting(db, "agent_update_requests")) ?? [];
  return { agent_updates: updates, agent_updates_requested: pending.map((r) => r.agent) };
}

/** The daemon takes the pending requests; each is returned once. */
export async function takeAgentUpdates(db: Db): Promise<{ requests: Request[] }> {
  return command(db, "runtime.take-agent-updates", async (c) => {
    await c.query(LOCK);
    const pending: Request[] = (await readSetting(c, "agent_update_requests")) ?? [];
    await writeSetting(c, "agent_update_requests", []);
    return { requests: pending };
  });
}

/**
 * The administrative command runtime.update: asks the daemon to update the named agents to the
 * versions the person was shown, `{ agents: [{ agent, version }] }`, signed with their passkey. Each
 * must be listed in the daemon's latest report with a command and exactly that version, so the
 * signature covers what will be installed: a newer report in between refuses it.
 */
export async function requestAgentUpdates(c: Tx, p: Json): Promise<{ requested: string[] }> {
  const asked: unknown[] = Array.isArray(p.agents) ? p.agents : [];
  // Exactly { agent, version }: nothing else a signature covered is carried to the daemon.
  const valid = (r: Json) => r && typeof r === "object" && !Array.isArray(r) && Object.keys(r).every((k) => k === "agent" || k === "version") && typeof r.agent === "string" && AGENTS.includes(r.agent) && typeof r.version === "string" && r.version.length <= 64;
  if (!asked.length || asked.length > AGENTS.length || !asked.every(valid) || new Set(asked.map((r: Json) => r.agent)).size !== asked.length)
    throw new Refusal(400, "invalid", "agents must list each agent once, as { agent, version }, from claude, codex, agy, opencode and grok");
  const reqs: Request[] = (asked as Request[]).map((r) => ({ agent: r.agent, version: r.version }));
  await c.query(LOCK);
  const listed: Json[] = (await readSetting(c, "agent_updates")) ?? [];
  for (const r of reqs) {
    const u = listed.find((x) => x.agent === r.agent);
    if (!u) throw new Refusal(409, "no-update", `${r.agent} has no update the daemon reported`);
    if (!Array.isArray(u.command) || !u.command.length)
      throw new Refusal(409, "no-update-command", `${u.name} was not installed by npm, so Control Rod will not update it; ${u.note ?? "update it with the tool you installed it with"}`);
    if (u.latest !== r.version)
      throw new Refusal(409, "update-changed", `${u.name} would now install ${u.latest}, not ${r.version}; look again and sign the version shown`);
  }
  const pending: Request[] = (await readSetting(c, "agent_update_requests")) ?? [];
  const next = [...pending.filter((x) => !reqs.some((r) => r.agent === x.agent)), ...reqs];
  await writeSetting(c, "agent_update_requests", next);
  return { requested: next.map((r) => r.agent) };
}
