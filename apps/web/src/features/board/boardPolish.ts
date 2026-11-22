import type { NextLine } from "../../lib/next.js";
import type { BoardCard } from "./useBoardData.js";

/**
 * Truthful readiness of a card's live status indicator.
 * Only `"active"` and `"live"` represent an actively executing run or check whose progress is live.
 */
export type StatusReadiness =
  | "active"
  | "live"
  | "connecting"
  | "settled"
  | "held"
  | "unknown"
  | "last-known"
  | "blocked";

/**
 * Pure gate for card/lane status spinners: spinners animate ONLY during genuinely active
 * runs/checks (`isActive === true` and `readiness` is `"active"` or `"live"`), and never beside
 * settled, held, blocked, connecting, last-known, or unknown states.
 */
export function shouldSpinStatus(readiness: StatusReadiness, isActive: boolean): boolean {
  if (!isActive) return false;
  return readiness === "active" || readiness === "live";
}

/**
 * Derives a card's `StatusReadiness` from its stream health, staleness, hold state, and next line.
 */
export function cardStatusReadiness(
  card: Pick<BoardCard, "next" | "runActive" | "lastKnown" | "heldPreCheck">,
  stream: "connecting" | "live" | "unknown",
): StatusReadiness {
  if (stream === "unknown") return "unknown";
  if (card.lastKnown) return "last-known";
  if (stream === "connecting") return "connecting";
  if (card.next.tone === "block") return "blocked";
  if (card.next.tone === "ok") return "settled";
  if (card.heldPreCheck) return "held";
  if (card.runActive && card.next.tone === "wait") return "active";
  return "settled";
}

const ATTENTION_TONES: ReadonlySet<NextLine["tone"]> = new Set(["block", "needs"]);

function attentionPriority(tone: NextLine["tone"]): number {
  if (ATTENTION_TONES.has(tone)) return 0;
  if (tone === "wait") return 1;
  return 2;
}

/**
 * Attention-first lane sort: places cards needing human action (`needs` / `block` tone) above
 * ordinary waiting/settled cards within a column while preserving input order (recency) inside
 * each tier. Never mutates the input array.
 */
export function sortLaneCards<T extends Pick<BoardCard, "next">>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => attentionPriority(a.next.tone) - attentionPriority(b.next.tone));
}

/**
 * Selectors to which the scoped board `Cmd/Ctrl+F` find shortcut MUST yield so native typing,
 * browser find inside inputs, and modal dialogs keep control.
 */
export const BOARD_FIND_YIELDS_TO =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]';

/**
 * Returns true when focus (`target`) is inside a field, editable region, or dialog where the
 * board's scoped `Cmd/Ctrl+F` shortcut must yield.
 */
export function shouldYieldBoardFind(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest(BOARD_FIND_YIELDS_TO) !== null;
}

/**
 * Case-insensitive substring filter for board cards against title, ID, project, owner,
 * discipline, agent baseline, and next-step text. Empty/whitespace queries return all cards.
 */
export function filterBoardCards(
  cards: readonly BoardCard[],
  query: string,
  projects: Record<string, string> = {},
): BoardCard[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...cards];
  return cards.filter((c) => {
    const projectName = projects[c.pkg.project] ?? "";
    const agent = c.pkg.agent_assignment[0]?.agent_baseline ?? "";
    const haystacks = [
      c.pkg.title,
      c.pkg.id,
      c.pkg.project,
      projectName,
      c.pkg.discipline ?? "",
      c.owner ?? "",
      agent,
      c.next.text,
    ];
    return haystacks.some((s) => s.toLowerCase().includes(needle));
  });
}
