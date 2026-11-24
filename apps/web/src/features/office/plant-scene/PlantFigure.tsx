import type { CSSProperties } from "react";
import { AgentBadge } from "../../../components/AgentBadge.js";
import { STATE_INFO, StateMark } from "../../../components/StateMark.js";
import { type FigureState, type StageFigure, marksInWords } from "../OfficeStage.js";
import type { Placed } from "./figure-layout.js";

/** The words on a nameplate's state chip: short, so a chip stays one line at the label size. */
export const CHIP_WORD: Record<FigureState, string> = {
  working: "Working",
  needs: "Needs you",
  waiting: "Waiting",
  stuck: "Stuck",
  changed: "Changed",
};

const px = (n: number): CSSProperties["left"] => `${Math.round(n * 100) / 100}px`;

/** The chip: the state's shape and its word. Colour is an accent on the shape; the word is text on the plate. */
export function StateChip({ state, tint, size = 10 }: { state: FigureState; tint?: string | undefined; size?: number }) {
  return (
    <span className="plant-chip" data-state={state}>
      <StateMark kind={state} size={size} title={STATE_INFO[state].label} {...(tint ? { color: tint } : {})} />
      <span className="plant-chip-word">{CHIP_WORD[state]}</span>
    </span>
  );
}

/** The marks a figure carries (gate, changed input, loop count), as small shapes; empty when it has none. */
export function Marks({ figure: f }: { figure: StageFigure }) {
  const m = f.marks ?? {};
  if (!(m.gate || m.changed || (m.loop && m.loop > 1))) return null;
  return (
    <span className="plant-np-marks" data-semantic="flags">
      {m.gate && (
        <svg className="office-flag" data-mark="gate" width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 1v8.5" style={{ stroke: "var(--text, #e8f0f8)" }} strokeWidth="1.5" fill="none" />
          <path d="M2.5 1.2h6l-1.6 2.2 1.6 2.2h-6z" style={{ fill: "var(--text, #e8f0f8)" }} />
        </svg>
      )}
      {m.changed && (
        <svg className="office-flag" data-mark="changed" width="10" height="10" viewBox="0 0 10 10">
          <path d="M5 1.2 9 8.6H1z" style={{ stroke: "var(--changed, #ffb347)" }} strokeWidth="1.6" strokeLinejoin="round" fill="none" />
        </svg>
      )}
      {m.loop && m.loop > 1 && (
        <span className="office-loop" data-mark="loop">
          {m.loop}
        </span>
      )}
    </span>
  );
}

/**
 * One agent on the Plant: a button over the painted figure, with its full accessible name and a
 * tooltip with the full name that opens on hover and on focus. The agent's badge, short title and
 * state chip are on the room's roster plate (PlantRoster), not here; focusing or hovering a figure
 * highlights its roster row and the other way round (`hot`). The focus ring is the accent outline.
 */
export function PlantFigure({ figure: f, placed, selected, hot, onSelect, onHot }: { figure: StageFigure; placed: Placed; selected: boolean; hot: boolean; onSelect: ((id: string) => void) | undefined; onHot: (id: string | undefined) => void }) {
  const label = STATE_INFO[f.state].label;
  const name = f.name ?? f.code;
  const m = f.marks ?? {};
  const words = marksInWords(m);
  const agent = f.runtime ? ` Agent: ${f.runtime}.` : "";
  const spoken = `${name}: ${label}. ${f.title ? `${f.title}. ` : ""}${f.cause}${words ? ` Marks: ${words}.` : ""}${f.lensNote ? ` ${f.lensNote}.` : ""}${agent}`;
  const { body } = placed;
  return (
    <button
      type="button"
      className="plant-figure"
      style={{ left: px(body.x), top: px(body.y), width: px(body.w), height: px(body.h) }}
      aria-pressed={selected}
      aria-label={spoken}
      aria-description={f.title}
      data-semantic="figure"
      data-state={f.state}
      data-figure={f.id}
      data-region={f.region}
      data-hot={hot ? "" : undefined}
      data-safety={m.safety ? "" : undefined}
      data-tint={f.tint}
      onClick={() => onSelect?.(f.id)}
      onMouseEnter={() => onHot(f.id)}
      onMouseLeave={() => onHot(undefined)}
      onFocus={() => onHot(f.id)}
      onBlur={() => onHot(undefined)}
    >
      <span className="plant-tip" data-side={placed.tip} data-align={placed.align} aria-hidden="true">
        {name}
        {f.title ? `: ${f.title}` : ""}
      </span>
    </button>
  );
}
