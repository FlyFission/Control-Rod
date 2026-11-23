import { type CSSProperties, useEffect, useState } from "react";
import { STATE_INFO, StateMark } from "../../components/StateMark.js";
import { type OfficeThemeV1, layoutOf } from "./contract.js";
import type { Point, RegionId } from "./layout.js";
import { PLANT_LAYOUT } from "./plant-layout.js";
import type { CoreState, RodState } from "./plant-instruments.js";
import { ReactorCore } from "./ReactorCore.js";
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
  /** The active lens's colour for the state shape (the shape never changes); never a theme's. */
  tint?: string;
  /** The full name read aloud and in the tooltip, when the code is shortened. */
  name?: string;
  /** The active lens's value in words, read with the figure. */
  lensNote?: string;
  /** The marks besides the state shape (OV-08): at most four, so a figure never carries more than five. */
  marks?: FigureMarks;
}

export interface FigureMarks {
  /** A gate decision (release or accept) waits on this package. */
  gate?: boolean;
  /** An input changed since the preparation pinned it. */
  changed?: boolean;
  /** The run's round, shown past the first. */
  loop?: number;
  /** Safety grade work. */
  safety?: boolean;
}

/** The marks in words, for the accessible name and the tooltip. */
export function marksInWords(m: FigureMarks | undefined): string {
  if (!m) return "";
  return [m.gate && "a gate decision waits", m.changed && "an input changed", m.loop && m.loop > 1 && `round ${m.loop}`, m.safety && "Safety grade"].filter(Boolean).join(", ");
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
type Canvas = { width: number; height: number };
const box = (c: Canvas, x: number, y: number, w: number, h: number): CSSProperties => ({
  left: pct(x, c.width),
  top: pct(y, c.height),
  width: pct(w, c.width),
  height: pct(h, c.height),
});
const point = (c: Canvas, p: Point): CSSProperties => ({ left: pct(p.x, c.width), top: pct(p.y, c.height) });

/** The plant's live instruments, drawn only on the plant layout. */
export interface PlantInstruments {
  core: CoreState;
  rods: RodState;
  /** Something waits on the viewer: the main control room is lit. */
  waiting: boolean;
}

export interface OfficeStageProps {
  theme: OfficeThemeV1;
  figures: readonly StageFigure[];
  selected?: string | undefined;
  onSelect?: (id: string) => void;
  /** The plant's core, rods and control room light; ignored on the office layout. */
  instruments?: PlantInstruments;
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

export function OfficeStage({ theme, figures, selected, onSelect, instruments }: OfficeStageProps) {
  const bodies = theme.bodies;
  const visible = useVisible();
  const layout = layoutOf(theme);
  const c = layout.canvas;
  const plant = layout.id === "plant" ? PLANT_LAYOUT : undefined;
  const core = plant?.core;
  const label = (id: RegionId) => theme.regions[id].label;
  return (
    <div className="office-stage" data-theme-id={theme.id} data-layout={layout.id} data-motion={visible ? "running" : "paused"} style={{ aspectRatio: `${c.width} / ${c.height}` }}>
      <div className="office-scene" aria-hidden="true" style={{ background: theme.tokens.backdrop }} data-layer="scene">
        {theme.site && <img className="office-scene-art" src={theme.site.path} alt="" draggable={false} style={box(c, 0, 0, c.width, c.height)} data-site="" />}
        {layout.regions.map((r) => {
          const art = theme.regions[r.id].art;
          return art ? <img key={r.id} className="office-scene-art" src={art.path} alt="" draggable={false} style={box(c, r.x, r.y, r.w, r.h)} data-region={r.id} /> : <div key={r.id} className="office-scene-art" style={{ ...box(c, r.x, r.y, r.w, r.h), background: theme.tokens.floor }} data-region={r.id} />;
        })}
        {plant && (
          // The control room's light: warm only while something waits on the viewer.
          <div className="plant-control-light" style={box(c, plant.region["your-office"].x, plant.region["your-office"].y, plant.region["your-office"].w, plant.region["your-office"].h)} data-lit={instruments?.waiting ? "" : undefined} />
        )}
        {core && instruments && (
          <div className="plant-core" style={box(c, core.x, core.y, core.w, core.h)}>
            <ReactorCore core={instruments.core} rods={instruments.rods} />
          </div>
        )}
        {figures.map((f) => {
          const body = bodies[f.body % bodies.length];
          return body ? <img key={f.id} className="office-scene-body" src={body.path} alt="" draggable={false} style={point(c, f.at)} /> : null;
        })}
      </div>
      <div className="office-semantic" data-layer="semantic">
        {plant?.zones
          .filter((z) => z.id !== "reactor")
          .map((z) => (
            // Each zone's name set into its boundary line; the legend under the stage says what each means.
            <span key={z.id} className="plant-zone-name" aria-hidden="true" data-zone={z.id} style={point(c, z.id === "site" ? { x: 14, y: c.height - 8 } : { x: z.x + 14, y: z.y })}>
              {z.name}
            </span>
          ))}
        {layout.regions.map((r) => (
          <section key={r.id} className="office-region" style={box(c, r.x, r.y, r.w, r.h)} aria-label={plant ? `${r.name}, ${label(r.id)}: ${r.purpose}` : `${r.name}: ${r.purpose}`} data-region={r.id}>
            <div className="office-plate" data-semantic="plate">
              <span className="office-plate-name">{r.name}</span>
              <span className="office-plate-label">{label(r.id)}</span>
            </div>
          </section>
        ))}
        {core && instruments && (
          <section className="office-region plant-reactor" style={box(c, core.x, core.y, core.w, core.h)} aria-label="Reactor building" data-region="reactor">
            <div className="office-plate" data-semantic="plate">
              <span className="office-plate-name">Reactor</span>
              <span className="office-plate-label" data-instrument="core">
                {instruments.core.caption}
              </span>
            </div>
            {instruments.rods.caption && (
              <p className="plant-rods-caption" data-instrument="rods">
                {instruments.rods.caption}
              </p>
            )}
          </section>
        )}
        {figures.map((f) => (
          <FigureMark key={f.id} canvas={c} figure={f} selected={selected === f.id} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function FigureMark({ canvas, figure: f, selected, onSelect }: { canvas: Canvas; figure: StageFigure; selected: boolean; onSelect: ((id: string) => void) | undefined }) {
  const label = STATE_INFO[f.state].label;
  const name = f.name ?? f.code;
  const m = f.marks ?? {};
  const flags = [m.gate && "gate", m.changed && "changed", m.loop && m.loop > 1 && "loop"].filter(Boolean) as string[];
  const words = marksInWords(m);
  const spoken = `${name}: ${label}. ${f.cause}${words ? ` Marks: ${words}.` : ""}${f.lensNote ? ` ${f.lensNote}.` : ""}`;
  return (
    <button
      type="button"
      className="office-figure"
      style={point(canvas, f.at)}
      aria-pressed={selected}
      aria-label={spoken}
      title={spoken}
      data-semantic="figure"
      data-state={f.state}
      data-figure={f.id}
      data-region={f.region}
      data-safety={m.safety ? "" : undefined}
      data-tint={f.tint}
      onClick={() => onSelect?.(f.id)}
    >
      <span className="office-figure-outline" aria-hidden="true" />
      {m.safety && <span className="office-figure-safety" aria-hidden="true" data-semantic="safety" />}
      {flags.length > 0 && (
        <span className="office-figure-flags" aria-hidden="true" data-semantic="flags">
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
      )}
      <span className="office-figure-mark" aria-hidden="true" data-semantic="mark">
        <StateMark kind={f.state} size={13} title={label} {...(f.tint ? { color: f.tint } : {})} />
      </span>
      <span className="office-figure-code" aria-hidden="true" data-semantic="code">
        {f.code}
      </span>
    </button>
  );
}
