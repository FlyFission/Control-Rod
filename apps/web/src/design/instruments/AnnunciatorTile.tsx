import type { ReactNode } from "react";
import "./instruments.css";
import { useInstrumentMotion } from "./useInstrumentMotion.js";

export type TileLamp = "needs-you" | "trip" | "neutral";
export type TileGlyph = "bang" | "cross" | "pause" | "diamond";

/** A lit tile carries a shape as well as a colour. Waiting is a pause and input changed a diamond, both on the neutral lamp. */
const DEFAULT_GLYPH: Record<TileLamp, TileGlyph> = { "needs-you": "bang", trip: "cross", neutral: "diamond" };

const GLYPH_PATH: Record<TileGlyph, ReactNode> = {
  bang: <path d="M8 2 L15 14 H1 Z M8 6 V10 M8 12 V12.5" />,
  cross: <path d="M3 3 L13 13 M13 3 L3 13" />,
  pause: <path d="M5 3 V13 M11 3 V13" />,
  diamond: <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" />,
};

export interface AnnunciatorTileProps {
  label: string;
  /** Lit when true. */
  active: boolean;
  lamp?: TileLamp;
  glyph?: TileGlyph;
  /** A readout under the label (a count, a scope). */
  readout?: string;
  onActivate?: () => void;
}

/**
 * A 160 x 56 px backlit annunciator tile: dark when clear, lit with its lamp colour and a glyph when
 * active. It is a button; Enter (and Space) activates it. A lit tile pulses by opacity, paused under
 * reduced motion and in a hidden tab.
 */
export function AnnunciatorTile({ label, active, lamp = "neutral", glyph, readout, onActivate }: AnnunciatorTileProps) {
  const motion = useInstrumentMotion();
  const g = glyph ?? DEFAULT_GLYPH[lamp];
  const name = `${label}${readout ? `, ${readout}` : ""}, ${active ? "lit" : "clear"}`;
  return (
    <button type="button" className="annunciator-tile" data-lit={active} data-lamp={lamp} data-motion={motion} aria-label={name} onClick={onActivate}>
      {active && (
        <svg className="annunciator-tile-glyph" data-glyph={g} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          {GLYPH_PATH[g]}
        </svg>
      )}
      <span className="annunciator-tile-text">
        <span className="annunciator-tile-label">{label}</span>
        {readout && <span className="annunciator-tile-readout">{readout}</span>}
      </span>
    </button>
  );
}
