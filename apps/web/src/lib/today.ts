import type { AgentFigure, AttentionItem, OfficeFloor } from "../api/types.js";
import type { TileGlyph } from "../design/instruments/AnnunciatorTile.js";

/**
 * The shift brief's numbers and sentence, and the risk band's shape. Pure functions of what the
 * Plant and the Inbox already report; nothing is invented here. A read that failed is passed as
 * undefined and the brief says what it knows, never zero.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface Brief {
  /** Decisions and holds waiting on this person (the Inbox's own list), or undefined while unknown. */
  needs: number | undefined;
  /** Agents working now, from the Plant's figures, or undefined while unknown. */
  working: number | undefined;
  /** Agents stuck, from the Plant's figures, or undefined while unknown. */
  stuck: number | undefined;
  headline: string;
  /** True when nothing is known to need the person and nothing is stuck. */
  calm: boolean;
}

export function countFigures(figures: readonly AgentFigure[]): { working: number; stuck: number } {
  let working = 0;
  let stuck = 0;
  for (const f of figures) {
    if (f.state === "working") working++;
    if (f.state === "stuck") stuck++;
  }
  return { working, stuck };
}

export function brief(floor: OfficeFloor | undefined, inbox: { items: readonly AttentionItem[] } | undefined): Brief {
  const needs = inbox?.items.length;
  const counts = floor ? countFigures(floor.figures) : undefined;
  const working = counts?.working;
  const stuck = counts?.stuck;
  const parts: string[] = [];
  if (needs !== undefined && needs > 0) parts.push(plural(needs, "decision waiting", "decisions waiting"));
  if (working !== undefined && working > 0) parts.push(plural(working, "agent working", "agents working"));
  if (stuck !== undefined && stuck > 0) parts.push(`${stuck} stuck`);
  const calm = needs === 0 && (stuck ?? 0) === 0;
  let headline: string;
  if (needs !== undefined && needs > 0) headline = parts.join(", ");
  else if (calm) headline = working !== undefined && working > 0 ? `Nothing needs you. ${plural(working, "agent is", "agents are")} working.` : "Nothing needs you.";
  else if (parts.length > 0) headline = parts.join(", ");
  else headline = needs === undefined && floor === undefined ? "Reading the plant" : "Nothing is working.";
  return { needs, working, stuck, headline: headline.charAt(0).toUpperCase() + headline.slice(1), calm };
}

export interface RiskBand {
  /** 4 is the riskiest. Sets the band's height. */
  level: 1 | 2 | 3 | 4;
  glyph: TileGlyph;
  tone: "needs-you" | "trip";
}

/**
 * The band at an Inbox item's left edge, by the server's risk rank (inbox.ts gateRisk: 0 security
 * hold, 10 holds an agent, 20 and 21 lost runs, 30 dispute, 40 to 42 gate decisions, the highest
 * consequence first). Height steps with the rank; the glyph follows the kind, as StateMark does,
 * so the band never relies on colour: a cross for stuck, a diamond for a changed input or a hold,
 * a bang for a decision.
 */
export function riskBand(item: Pick<AttentionItem, "kind" | "risk">): RiskBand {
  const rank = item.risk.rank;
  const level = rank <= 10 ? 4 : rank <= 30 ? 3 : rank <= 40 ? 2 : 1;
  const stuck = item.kind === "scram" || item.kind === "lost";
  const changed = item.kind === "permission" || item.kind === "dispute";
  return { level, glyph: stuck ? "cross" : changed ? "diamond" : "bang", tone: stuck ? "trip" : "needs-you" };
}
