import type { Db, Tx } from "./db/index.js";
import { command } from "./commands/executor.js";
import { appendEvent } from "./events.js";
import { type Caller, authorizeInstallSetting } from "./admin.js";
import { Refusal } from "./refusal.js";

/**
 * First-run setup (docs/patterns/onboarding.md, ADR 0024 decision 7): which agents sit at the table
 * and when Control Rod checks with the person. It is install-wide, like the daemon's runtimes: one
 * machine, one set of agent CLIs.
 *
 * Benching an agent only removes it from what a claim may offer. It can never add a runtime, and the
 * pre-check still refuses the author's own runtime, so benching can make work wait but cannot weaken
 * the independent check.
 *
 * Because it changes dispatch for the whole install, only an administrator (or the bootstrap Member of
 * a single-organization install) may write it. Writes take the claim's dispatch lock, so once a write
 * returns no claim that read the old seats can still grant work. The chain records seat changes only;
 * the check-in answer is a preference and stays out of the exportable chain.
 */

/** The lock every claim takes before reading seats (work.ts claim). */
export const DISPATCH_LOCK = "select pg_advisory_xact_lock(hashtext('controlrod-budget'))";

export const CHECK_IN = ["start", "start-and-merge", "every-step"] as const;
export type CheckIn = (typeof CHECK_IN)[number];

/** Runtimes a seat may name: the daemon's known runtimes. The fake runtime is a test double and has no seat. */
export const SEATABLE = ["claude", "codex", "grok", "opencode", "agy", "ollama"] as const;

export interface AgentSeat { runtime: string; seated: boolean }
export interface AgentSetupView { confirmed: boolean; confirmed_at?: string; seats: AgentSeat[]; check_in: CheckIn }

const KEY = "agent_setup";
const DEFAULT: AgentSetupView = { confirmed: false, seats: [], check_in: "start-and-merge" };

type Json = Record<string, unknown>;

function parse(value: string | undefined): AgentSetupView {
  if (!value) return { ...DEFAULT };
  try {
    const v = JSON.parse(value) as Json;
    const seats = Array.isArray(v.seats)
      ? (v.seats as Json[]).filter((s) => SEATABLE.includes(String(s?.runtime) as never)).map((s) => ({ runtime: String(s.runtime), seated: s.seated !== false }))
      : [];
    const check_in = CHECK_IN.includes(v.check_in as CheckIn) ? (v.check_in as CheckIn) : DEFAULT.check_in;
    return {
      confirmed: v.confirmed === true,
      ...(typeof v.confirmed_at === "string" ? { confirmed_at: v.confirmed_at } : {}),
      seats,
      check_in,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function setupView(db: Db | Tx): Promise<AgentSetupView> {
  const r = await db.query<{ value: string }>("select value from settings where key = $1", [KEY]);
  return parse(r.rows[0]?.value);
}

/** Runtimes the person benched. Claims leave them out of every offer. */
export async function benchedRuntimes(db: Db | Tx): Promise<Set<string>> {
  const v = await setupView(db);
  return new Set(v.seats.filter((s) => !s.seated).map((s) => s.runtime));
}

/** Validates the request in full before anything is written; an unknown runtime or answer is refused. */
export function parseSetupRequest(body: unknown): { seats: AgentSeat[]; check_in: CheckIn } {
  const b = (body ?? {}) as Json;
  if (!Array.isArray(b.seats) || b.seats.length > 20) throw new Refusal(400, "invalid-setup", "Setup needs a list of seats");
  const seats: AgentSeat[] = [];
  const seen = new Set<string>();
  for (const raw of b.seats as Json[]) {
    const runtime = String(raw?.runtime ?? "");
    if (!SEATABLE.includes(runtime as never)) throw new Refusal(400, "invalid-setup", `There is no agent called ${runtime.slice(0, 40)}`);
    if (typeof raw?.seated !== "boolean") throw new Refusal(400, "invalid-setup", `Say whether ${runtime} is seated`);
    if (seen.has(runtime)) throw new Refusal(400, "invalid-setup", `${runtime} is listed twice`);
    seen.add(runtime);
    seats.push({ runtime, seated: raw.seated });
  }
  if (!CHECK_IN.includes(b.check_in as CheckIn)) throw new Refusal(400, "invalid-setup", "Choose when Control Rod should check with you");
  return { seats, check_in: b.check_in as CheckIn };
}

/** Records the confirmed setup (the setup page's Looks right). Seat changes go on the event chain. */
export async function recordSetup(db: Db, caller: Caller, body: unknown): Promise<AgentSetupView> {
  const req = parseSetupRequest(body);
  return command(db, "setup.record", async (c) => {
    await authorizeInstallSetting(c, caller);
    await c.query(DISPATCH_LOCK);
    const before = await setupView(c);
    const view: AgentSetupView = { confirmed: true, confirmed_at: new Date().toISOString(), seats: req.seats, check_in: req.check_in };
    await write(c, view);
    await seatEvent(c, caller, before, view);
    return view;
  });
}

/** One switch on the Agents roster: changes that seat only, keeping the others and whether setup was confirmed. */
export async function recordSeat(db: Db, caller: Caller, runtime: string, body: unknown): Promise<AgentSetupView> {
  if (!SEATABLE.includes(runtime as never)) throw new Refusal(400, "invalid-setup", `There is no agent called ${runtime.slice(0, 40)}`);
  const seated = (body as Json | undefined)?.seated;
  if (typeof seated !== "boolean") throw new Refusal(400, "invalid-setup", `Say whether ${runtime} is seated`);
  return command(db, "setup.record", async (c) => {
    await authorizeInstallSetting(c, caller);
    await c.query(DISPATCH_LOCK);
    const before = await setupView(c);
    const seats = [...before.seats.filter((s) => s.runtime !== runtime), { runtime, seated }].sort(
      (a, b) => SEATABLE.indexOf(a.runtime as never) - SEATABLE.indexOf(b.runtime as never),
    );
    const view: AgentSetupView = { ...before, seats };
    await write(c, view);
    await seatEvent(c, caller, before, view);
    return view;
  });
}

async function write(c: Tx, view: AgentSetupView) {
  await c.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [KEY, JSON.stringify(view)]);
}

/** Only seats that changed (a runtime is seated unless benched), so the chain carries dispatch changes and nothing else. */
async function seatEvent(c: Tx, caller: Caller, before: AgentSetupView, after: AgentSetupView) {
  const was = (v: AgentSetupView, r: string) => v.seats.find((s) => s.runtime === r)?.seated ?? true;
  const benched = SEATABLE.filter((r) => was(before, r) && !was(after, r));
  const seated = SEATABLE.filter((r) => !was(before, r) && was(after, r));
  if (benched.length === 0 && seated.length === 0) return;
  await appendEvent(c, "setup.seats-changed", "setup", { kind: "human", id: caller.memberId }, { seated, benched });
}
