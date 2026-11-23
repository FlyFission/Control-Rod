import type { AgentFigure, ScramSummary } from "../../api/types.js";
import { time } from "../../lib/format.js";

/**
 * The plant's instruments (plant view design, section 6): the annunciator, the core and its control
 * rods. Each is a pure function of what the control plane reported, and each says when it does not
 * know: a read that has not arrived, or failed, is never shown as zero, as dark, or as "no SCRAM".
 */

/** One read the instruments depend on: its data when it arrived, whether its last attempt failed, and when it last succeeded. */
export interface Read<T> {
  data: T | undefined;
  failed: boolean;
  /** Epoch milliseconds of the last successful read; 0 when none. */
  at: number;
}

export interface Floor {
  figures: readonly AgentFigure[];
  needs_me: number;
  inbox_items: number;
  hidden: number;
}

export type WindowId = "waiting-on-you" | "stuck" | "changed" | "scram";
export type WindowState = "dark" | "lit" | "loading" | "unavailable";

export interface AnnunciatorWindow {
  id: WindowId;
  label: string;
  state: WindowState;
  /** The count, when the read arrived. */
  count?: number;
  /** "as of 10:42" when the last refresh failed and this is the last known reading. */
  asOf?: string;
  /** One line under the label: a scope, a drill, or the inbox items no agent holds. */
  note?: string;
}

const LABELS: Record<WindowId, string> = {
  "waiting-on-you": "Waiting on you",
  stuck: "Stuck",
  changed: "Input changed",
  scram: "SCRAM",
};

function windowFrom<T>(id: WindowId, read: Read<T>, count: (d: T) => number, note?: (d: T, n: number) => string | undefined): AnnunciatorWindow {
  const label = LABELS[id];
  if (read.data === undefined) return { id, label, state: read.failed ? "unavailable" : "loading" };
  const n = count(read.data);
  const w: AnnunciatorWindow = { id, label, state: n > 0 ? "lit" : "dark", count: n };
  const extra = note?.(read.data, n);
  if (extra) w.note = extra;
  if (read.failed && read.at > 0) w.asOf = `as of ${time(new Date(read.at).toISOString())}`;
  return w;
}

const isDrill = (s: ScramSummary) => Boolean(s.scram.drill);

/**
 * The four windows, left to right: Waiting on you, Stuck, Input changed, SCRAM. Normal waiting is not
 * a window, so the strip is dark when the plant is normal. "Waiting on you" is the control plane's own
 * count for the viewer (needs_me), never the count of figures in the needs state, which can be
 * someone else's.
 */
export function annunciator(floor: Read<Floor>, scrams: Read<{ scrams: readonly ScramSummary[] }>): AnnunciatorWindow[] {
  return [
    windowFrom("waiting-on-you", floor, (f) => f.needs_me, (f, n) => {
      const rest = Math.max(0, f.inbox_items - n);
      return rest > 0 ? `${rest} more in the Inbox` : undefined;
    }),
    windowFrom("stuck", floor, (f) => f.figures.filter((x) => x.state === "stuck").length),
    windowFrom("changed", floor, (f) => f.figures.filter((x) => x.state === "changed").length),
    // A drill is shown, and named, but a drill alone never lights the SCRAM window.
    windowFrom("scram", scrams, (d) => d.scrams.filter((s) => !isDrill(s)).length, (d) => {
      const drills = d.scrams.filter(isDrill).length;
      const real = d.scrams.filter((s) => !isDrill(s));
      const parts: string[] = [];
      if (real.some((s) => s.scram.scope === "organization")) parts.push("Organization");
      else if (real.length) parts.push(`${real.length} ${real.length === 1 ? "project" : "projects"}`);
      if (drills) parts.push(`${drills} ${drills === 1 ? "drill" : "drills"}`);
      return parts.length ? parts.join(", ") : undefined;
    }),
  ];
}

export interface CoreState {
  /** Lit while at least one shown figure is working; null when the floor has not been read. */
  lit: boolean | null;
  caption: string;
}

/**
 * The core: lit while any shown agent is working, dark when none is. It is a count in words, never a
 * power level: no percentage, no units. Presenting, it says how many are hidden, so "No agent
 * working" is never said of work it cannot see.
 */
export function coreState(floor: Read<Floor>): CoreState {
  if (floor.data === undefined) return { lit: null, caption: "Status unavailable" };
  const working = floor.data.figures.filter((f) => f.state === "working").length;
  const hidden = floor.data.hidden;
  const agents = (n: number) => `${n} ${n === 1 ? "agent" : "agents"}`;
  let caption: string;
  if (hidden > 0) caption = `${working} shown working, ${hidden} hidden`;
  else caption = working === 0 ? "No agent working" : `${agents(working)} working`;
  if (floor.failed && floor.at > 0) caption += `, as of ${time(new Date(floor.at).toISOString())}`;
  return { lit: working > 0, caption };
}

export type RodPosition = "unknown" | "withdrawn" | "inserted" | "bank" | "drill";

export interface RodState {
  position: RodPosition;
  caption?: string;
}

/**
 * The control rods, from the SCRAMs in force (not yet restarted for their whole scope). An
 * organization SCRAM inserts every rod; project SCRAMs insert one bank and say other work continues;
 * a drill is drawn dashed and never darkens anything. Pulled is not stopped: the caption claims the
 * stop only once the control plane has recorded it.
 */
export function rodState(scrams: Read<{ scrams: readonly ScramSummary[] }>): RodState {
  if (scrams.data === undefined) return { position: "unknown", caption: "SCRAM status unavailable" };
  const real = scrams.data.scrams.filter((s) => !isDrill(s));
  const asOf = scrams.failed && scrams.at > 0 ? `, as of ${time(new Date(scrams.at).toISOString())}` : "";
  if (real.length === 0) {
    if (scrams.data.scrams.length > 0) return { position: "drill", caption: `SCRAM drill in force${asOf}` };
    return asOf ? { position: "withdrawn", caption: `No SCRAM in force${asOf}` } : { position: "withdrawn" };
  }
  const org = real.find((s) => s.scram.scope === "organization");
  if (org) {
    const stop = org.stopped ? `runs stopped at ${time(org.stopped.at)}` : "stop not yet recorded";
    return { position: "inserted", caption: `SCRAM in force: organization, ${stop}${asOf}` };
  }
  const n = real.length;
  return { position: "bank", caption: `SCRAM in force: ${n} ${n === 1 ? "project" : "projects"}. Other work continues${asOf}.` };
}
