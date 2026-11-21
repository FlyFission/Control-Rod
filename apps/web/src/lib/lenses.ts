import type { BoardCard } from "../features/board/useBoardData.js";
import { COLUMNS, type ColumnId } from "./board.js";
import type { Kind } from "./kind.js";

export type ColorBy = "kind" | "state" | "agent" | "person" | "none";
export type GroupBy = "none" | "kind" | "person" | "project";
export type Density = "comfortable" | "compact";

export type Lens = {
  kind: "all" | Kind;
  needs: boolean;
  mine: boolean;
  colorBy: ColorBy;
  groupBy: GroupBy;
  density: Density;
};

export const DEFAULT_LENS: Lens = {
  kind: "all",
  needs: false,
  mine: false,
  colorBy: "kind",
  groupBy: "none",
  density: "comfortable",
};

const KINDS: readonly ("all" | Kind)[] = ["all", "code", "doc"];
const COLOR_BYS: readonly ColorBy[] = ["kind", "state", "agent", "person", "none"];
const GROUP_BYS: readonly GroupBy[] = ["none", "kind", "person", "project"];
const DENSITIES: readonly Density[] = ["comfortable", "compact"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((v) => v === value) ?? fallback;
}

/**
 * Parses a Lens from URL query parameters. Unknown or missing values fall back to DEFAULT_LENS.
 */
export function parseLens(q: URLSearchParams): Lens {
  return {
    kind: pick(q.get("kind"), KINDS, DEFAULT_LENS.kind),
    needs: q.get("needs") === "1" || q.get("needs") === "true",
    mine: q.get("mine") === "1" || q.get("mine") === "true",
    colorBy: pick(q.get("colorBy") ?? q.get("color"), COLOR_BYS, DEFAULT_LENS.colorBy),
    groupBy: pick(q.get("groupBy") ?? q.get("group"), GROUP_BYS, DEFAULT_LENS.groupBy),
    density: pick(q.get("density"), DENSITIES, DEFAULT_LENS.density),
  };
}

/**
 * Serializes a Lens to URL query parameters, omitting fields that match DEFAULT_LENS.
 */
export function lensToQuery(l: Lens): string {
  const p = new URLSearchParams();
  if (l.kind !== DEFAULT_LENS.kind) p.set("kind", l.kind);
  if (l.needs) p.set("needs", "1");
  if (l.mine) p.set("mine", "1");
  if (l.colorBy !== DEFAULT_LENS.colorBy) p.set("colorBy", l.colorBy);
  if (l.groupBy !== DEFAULT_LENS.groupBy) p.set("groupBy", l.groupBy);
  if (l.density !== DEFAULT_LENS.density) p.set("density", l.density);
  return p.toString();
}

const LENS_QUERY_KEYS = ["kind", "needs", "mine", "colorBy", "color", "groupBy", "group", "density"] as const;

/**
 * Updates window.location search parameters to match `lens` while preserving unrelated query params.
 */
export function writeLensToUrl(lens: Lens): void {
  if (typeof window === "undefined") return;
  const current = new URLSearchParams(window.location.search);
  for (const k of LENS_QUERY_KEYS) current.delete(k);
  const nextParams = new URLSearchParams(lensToQuery(lens));
  for (const [k, v] of nextParams.entries()) current.set(k, v);
  const qs = current.toString();
  const next = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
  const now = window.location.pathname + window.location.search + window.location.hash;
  if (next !== now) {
    window.history.replaceState(window.history.state, "", next);
  }
}

/**
 * A card is protected by the default-view guard when it is waiting on a person verification or a
 * signature (spec section 3 and 6.2).
 */
export function isProtected(c: BoardCard): boolean {
  return c.column === "person-verifies" || c.column === "needs-signature";
}

function matchesLensFilters(c: BoardCard, l: Lens, me: string): boolean {
  if (l.kind !== "all" && !c.kinds.includes(l.kind)) return false;
  if (l.needs && c.next.tone !== "needs" && c.next.tone !== "block") return false;
  if (l.mine && (me === "" || c.owner !== me)) return false;
  return true;
}

/**
 * Applies the active lens filters to the board cards and counts how many protected cards
 * (waiting on person verification or signature) are hidden by those filters.
 */
export function applyLens(cards: BoardCard[], l: Lens, me: string): { shown: BoardCard[]; hiddenProtected: number } {
  const shown: BoardCard[] = [];
  let hiddenProtected = 0;
  for (const c of cards) {
    if (matchesLensFilters(c, l, me)) {
      shown.push(c);
    } else if (isProtected(c)) {
      hiddenProtected += 1;
    }
  }
  return { shown, hiddenProtected };
}

/**
 * Clears every filter that can hide protected cards (`kind`, `needs`, `mine`) while keeping the
 * presentation lenses (`colorBy`, `groupBy`, `density`) unchanged.
 */
export function revealHidden(l: Lens): Lens {
  return { ...l, kind: "all", needs: false, mine: false };
}

/*
 * Person, agent and state palettes are chosen in the blue / cyan / indigo / violet / slate range
 * so they stay visually distinct from the four fixed meaning hues in tokens.css and
 * .nuclear/changes/board-m1/evidence/tokens-contrast-looks.txt:
 *   --needs (amber #ffaa00 / #8f4506 / #a8470a)
 *   --check (magenta #e58bd8 / #a21caf)
 *   --stuck (red-orange #ff7a59 / #b42318 / #c4251a)
 *   --done  (green #00ff9d / #1a6e4c / #09703f)
 */
const STATE_COLOR: Record<ColumnId, string> = {
  ready: "#64748b",
  drafting: "#3b82f6",
  "agent-check": "#0891b2",
  "person-verifies": "#6366f1",
  "needs-signature": "#0284c7",
  reached: "#475569",
};

const PERSON_PALETTE: readonly string[] = [
  "#4f6ef7",
  "#0891b2",
  "#6366f1",
  "#0284c7",
  "#7c3aed",
  "#475569",
  "#2563eb",
  "#0e7490",
];

const AGENT_PALETTE: readonly string[] = [
  "#0284c7",
  "#6366f1",
  "#0891b2",
  "#4f6ef7",
  "#475569",
  "#7c3aed",
];

function hashIndex(name: string, length: number): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % length;
}

export function personPaletteColor(owner: string): string {
  return PERSON_PALETTE[hashIndex(owner, PERSON_PALETTE.length)]!;
}

export function agentPaletteColor(agent: string): string {
  return AGENT_PALETTE[hashIndex(agent, AGENT_PALETTE.length)]!;
}

/**
 * Returns the 3 px left-edge color for a card under the active `colorBy` lens.
 * Never returns a meaning token (`var(--needs)`, `var(--check)`, `var(--stuck)`, `var(--done)`).
 */
export function edgeColor(c: BoardCard, l: Lens): string {
  switch (l.colorBy) {
    case "kind":
      return c.kinds[0] === "code" ? "var(--kind-code)" : "var(--kind-doc)";
    case "state":
      return STATE_COLOR[c.column];
    case "agent": {
      const agent = c.pkg.agent_assignment[0]?.agent_baseline;
      return agent ? agentPaletteColor(agent) : "var(--line-2)";
    }
    case "person":
      return c.owner ? personPaletteColor(c.owner) : "var(--line-2)";
    case "none":
      return "var(--line-2)";
  }
}

export const COLOR_BY_LABEL: Record<ColorBy, string> = {
  kind: "Kind",
  state: "State",
  agent: "Agent",
  person: "Person",
  none: "None",
};

export type LegendEntry = { label: string; color: string };

/**
 * Builds the color legend swatches for the active `colorBy` lens.
 */
export function legendEntries(
  cards: BoardCard[],
  lens: Lens,
  columnTitles?: Record<ColumnId, string>,
): LegendEntry[] {
  switch (lens.colorBy) {
    case "kind":
      return [
        { label: "Code", color: "var(--kind-code)" },
        { label: "Documents", color: "var(--kind-doc)" },
      ];
    case "state":
      return COLUMNS.map((c) => ({
        label: columnTitles ? columnTitles[c.id] : c.title,
        color: STATE_COLOR[c.id],
      }));
    case "agent": {
      const agents = [...new Set(cards.map((c) => c.pkg.agent_assignment[0]?.agent_baseline).filter((a): a is string => Boolean(a)))].sort();
      return agents.map((a) => ({ label: a, color: agentPaletteColor(a) }));
    }
    case "person": {
      const owners = [...new Set(cards.map((c) => c.owner).filter((o): o is string => Boolean(o)))].sort();
      return owners.map((o) => ({ label: o, color: personPaletteColor(o) }));
    }
    case "none":
      return [];
  }
}

export function lensesEqual(a: Lens, b: Lens): boolean {
  return (
    a.kind === b.kind &&
    a.needs === b.needs &&
    a.mine === b.mine &&
    a.colorBy === b.colorBy &&
    a.groupBy === b.groupBy &&
    a.density === b.density
  );
}
