import type { BoardCard } from "./useBoardData.js";

/**
 * Attention-first order inside one column: cards marked Needs you or Blocked come first, then the
 * rest, keeping the incoming order inside each group. A card's mark counts only while the stream is
 * live and the card's reads are current; a last-known or unknown card is never promoted, because its
 * mark may already be out of date. Columns fold after a few cards, so this keeps work that waits on a
 * person above the fold. Never mutates the input.
 */
export function attentionFirst<T extends Pick<BoardCard, "next" | "lastKnown">>(
  cards: readonly T[],
  stream: "connecting" | "live" | "unknown",
): T[] {
  const needsYou = (c: T) => stream === "live" && !c.lastKnown && (c.next.tone === "needs" || c.next.tone === "block");
  return [...cards.filter(needsYou), ...cards.filter((c) => !needsYou(c))];
}

/**
 * A card's spinner turns only while an agent run on it is actually running, as last read on a live
 * stream. A queued run, including a pre-check held for an independent runtime, does not spin: nothing
 * is executing yet, and a spinner would say otherwise.
 */
export function showsRunSpinner(card: Pick<BoardCard, "runRunning" | "lastKnown">, stream: "connecting" | "live" | "unknown"): boolean {
  return stream === "live" && !card.lastKnown && card.runRunning === true;
}
