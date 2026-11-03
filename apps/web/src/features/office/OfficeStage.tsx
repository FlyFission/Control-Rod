import { type CSSProperties, useEffect, useState } from "react";
import { STATE_INFO, StateMark } from "../../components/StateMark.js";
import type { OfficeThemeV1 } from "./contract.js";
import { CANVAS, type Point, REGIONS, type RegionId } from "./layout.js";
import "./office.css";

/**
 * The office stage (specification 13 and 18; plan tasks 4.3 and 4.5). Two layers with fixed stacking:
 * the scene layer draws the active theme's inert art and can never receive a pointer; the semantic
 * layer above it is the application's own and draws every name, mark, code and control. A theme
 * reaches the page only as image sources and scene colours; nothing it supplies is ever markup.
 */

/** The five states a figure can show (OV-02); shapes and colours are the application's, never a theme's. */
export type FigureState = "working" | "needs" | "waiting" | "stuck" | "changed";

export interface StageFigure {
  id: string;
  /** The package code shown under the figure. */
  code: string;
  state: FigureState;
  /** Why the figure is in this state, from recorded data. */
  cause: string;
  region: RegionId;
  /** Where the figure stands, in layout units: a seat or a queue place of its region. */
  at: Point;
  /** Which of the theme's body styles to draw, by index. */
  body: number;
  /** The active lens's colour, drawn as a ring inside the dark outline; never a theme's. */
  tint?: string;
  /** The full name read aloud and in the tooltip, when the code is shortened. */
  name?: string;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const box = (x: number, y: number, w: number, h: number): CSSProperties => ({
  left: pct(x, CANVAS.width),
  top: pct(y, CANVAS.height),
  width: pct(w, CANVAS.width),
  height: pct(h, CANVAS.height),
});
const point = (p: Point): CSSProperties => ({ left: pct(p.x, CANVAS.width), top: pct(p.y, CANVAS.height) });

export interface OfficeStageProps {
  theme: OfficeThemeV1;
  figures: readonly StageFigure[];
  selected?: string | undefined;
  onSelect?: (id: string) => void;
}

/** Whether the tab is visible; motion stops while it is hidden. */
function useVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

export function OfficeStage({ theme, figures, selected, onSelect }: OfficeStageProps) {
  const bodies = theme.bodies;
  const visible = useVisible();
  return (
    <div className="office-stage" data-theme-id={theme.id} data-motion={visible ? "running" : "paused"} style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}>
      <div className="office-scene" aria-hidden="true" style={{ background: theme.tokens.backdrop }} data-layer="scene">
        {REGIONS.map((r) => {
          const art = theme.regions[r.id].art;
          return art ? <img key={r.id} className="office-scene-art" src={art.path} alt="" draggable={false} style={box(r.x, r.y, r.w, r.h)} data-region={r.id} /> : <div key={r.id} className="office-scene-art" style={{ ...box(r.x, r.y, r.w, r.h), background: theme.tokens.floor }} data-region={r.id} />;
        })}
        {figures.map((f) => {
          const body = bodies[f.body % bodies.length];
          return body ? <img key={f.id} className="office-scene-body" src={body.path} alt="" draggable={false} style={point(f.at)} /> : null;
        })}
      </div>
      <div className="office-semantic" data-layer="semantic">
        {REGIONS.map((r) => (
          <section key={r.id} className="office-region" style={box(r.x, r.y, r.w, r.h)} aria-label={`${r.name}: ${r.purpose}`} data-region={r.id}>
            <div className="office-plate" data-semantic="plate">
              <span className="office-plate-name">{r.name}</span>
              <span className="office-plate-label">{theme.regions[r.id].label}</span>
            </div>
          </section>
        ))}
        {figures.map((f) => (
          <FigureMark key={f.id} figure={f} selected={selected === f.id} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function FigureMark({ figure: f, selected, onSelect }: { figure: StageFigure; selected: boolean; onSelect: ((id: string) => void) | undefined }) {
  const label = STATE_INFO[f.state].label;
  const name = f.name ?? f.code;
  return (
    <button
      type="button"
      className="office-figure"
      style={point(f.at)}
      aria-pressed={selected}
      aria-label={`${name}: ${label}. ${f.cause}`}
      title={`${name}: ${label}. ${f.cause}`}
      data-semantic="figure"
      data-state={f.state}
      data-figure={f.id}
      data-region={f.region}
      onClick={() => onSelect?.(f.id)}
    >
      <span className="office-figure-outline" aria-hidden="true" style={f.tint ? ({ "--figure-tint": f.tint } as CSSProperties) : undefined} />
      <span className="office-figure-mark" aria-hidden="true" data-semantic="mark">
        <StateMark kind={f.state} size={13} title={label} />
      </span>
      <span className="office-figure-code" aria-hidden="true" data-semantic="code">
        {f.code}
      </span>
    </button>
  );
}
