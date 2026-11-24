import type { AttentionItem } from "../api/types.js";
import { TileGlyphIcon } from "../design/instruments/AnnunciatorTile.js";
import { riskBand } from "../lib/today.js";
import "../pages/screens.css";

/**
 * The risk band at an item's left edge: a strip whose height steps with the risk rank and whose
 * glyph says what kind of risk (shape as well as colour). Decoration only: the item's own risk
 * label says the same in words.
 */
export function RiskBand({ item }: { item: Pick<AttentionItem, "kind" | "risk"> }) {
  const b = riskBand(item);
  return (
    <span className="risk-band" data-level={b.level} data-tone={b.tone} data-rank={item.risk.rank} aria-hidden="true">
      <TileGlyphIcon glyph={b.glyph} size={14} />
    </span>
  );
}
