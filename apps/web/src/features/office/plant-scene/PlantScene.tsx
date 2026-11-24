import type { CSSProperties } from "react";
import { useInstrumentMotion } from "../../../design/instruments/useInstrumentMotion.js";
import { REGION, type RegionId } from "../layout.js";
import { FigureMark, type FigureState, type PlantInstruments, type StageFigure } from "../OfficeStage.js";
import { type OccupancyMap, flowSegments, ringPath } from "./flow.js";
import { CANVAS, CORE_BBOX, CORE_CROP, CREW_BASELINE, CREW_FRAME, PLACE_IDS, ROOMS } from "./geometry.js";
import "../office.css";
import "./plant-scene.css";

/**
 * The Plant as a painted scene (control room redesign, sections 4 and 6). Application owned, like
 * ReactorCore: no theme can fake a state. Hero art is raster only (base, room, core and crew images,
 * all aria-hidden); code draws only the named overlays below (Lamp, FlowStripe, Label, FocusOutline).
 * The focusable figure buttons and their labels are the semantic layer on top, as in OfficeStage.
 */

const ART = "/plant";
/** The crew image for a state; an input that changed shows the waiting pose and a diamond mark. */
export const POSE: Record<FigureState, "working" | "waiting" | "stuck" | "needs-you"> = {
  working: "working",
  waiting: "waiting",
  stuck: "stuck",
  needs: "needs-you",
  changed: "waiting",
};
/** One crew frame on the canvas, in canvas units: figures stand about 45 units tall. */
const CREW_UNITS = 52;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const at = (x: number, y: number): CSSProperties => ({ left: pct(x, CANVAS.width), top: pct(y, CANVAS.height) });
const boxOf = ([x0, y0, x1, y1]: readonly number[]): CSSProperties => ({
  left: pct(x0!, CANVAS.width),
  top: pct(y0!, CANVAS.height),
  width: pct(x1! - x0!, CANVAS.width),
  height: pct(y1! - y0!, CANVAS.height),
});

/** Overlay: a small status lamp at a station (amber, red, or neutral with a shape). */
export function Lamp({ x, y, tone, glyph, pulse }: { x: number; y: number; tone: "needs-you" | "trip" | "neutral"; glyph?: "pause" | "diamond"; pulse?: boolean }) {
  return (
    <span className="plant-lamp" data-overlay="lamp" data-tone={tone} data-pulse={pulse ? "" : undefined} style={at(x, y)}>
      {glyph && (
        <svg viewBox="0 0 8 8" width="8" height="8" focusable="false">
          {glyph === "pause" ? <path d="M2.5 1.5V6.5M5.5 1.5V6.5" /> : <path d="M4 .8 7.2 4 4 7.2.8 4Z" />}
        </svg>
      )}
    </span>
  );
}

/** Overlay: a lit pipe stripe, steady, never moving. */
export function FlowStripe({ from, to, tone }: { from: Parameters<typeof ringPath>[0]; to: Parameters<typeof ringPath>[1]; tone: "screen" | "needs-you" }) {
  return <polyline className="plant-flow-stripe" data-overlay="flow" data-tone={tone} data-from={from} data-to={to} points={ringPath(from, to)} />;
}

/** Overlay: a room's name, set under its box. */
function Label({ children, x, y }: { children: string; x: number; y: number }) {
  return (
    <span className="plant-room-label" data-overlay="label" style={at(x, y)}>
      {children}
    </span>
  );
}

export interface PlantSceneProps {
  figures: readonly StageFigure[];
  selected?: string | undefined;
  onSelect?: ((id: string) => void) | undefined;
  instruments: PlantInstruments;
  /** Per place: every figure on the floor (also those folded or over capacity), so a room is lit iff it holds one. */
  occupancy: OccupancyMap;
  /** The plant's functional name for each place (the theme's label), read with the room. */
  labels?: Readonly<Record<string, { label: string }>>;
}

export function PlantScene({ figures, selected, onSelect, instruments, occupancy, labels }: PlantSceneProps) {
  const motion = useInstrumentMotion();
  const scram = instruments.rods.position === "inserted" || instruments.rods.position === "bank";
  const cold = instruments.core.lit !== true && !scram;
  const segments = flowSegments(occupancy, instruments.waiting, scram);
  const frameH = CREW_UNITS;
  return (
    <div className="plant-scene" data-layout="plant" data-motion={motion} data-scram={scram ? "" : undefined}>
      <div className="plant-scene-canvas" style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}>
        <div className="plant-scene-art" aria-hidden="true" data-layer="scene">
          <img
            className="plant-art"
            data-hero="base"
            src={`${ART}/base.webp`}
            srcSet={`${ART}/base-1440.webp 1440w, ${ART}/base.webp 2400w`}
            sizes="(max-width: 1440px) 1440px, 2400px"
            alt=""
            draggable={false}
            style={boxOf([0, 0, CANVAS.width, CANVAS.height])}
          />
          {PLACE_IDS.map((p) => {
            const b = ROOMS[p].bbox;
            const lit = (occupancy.get(p)?.count ?? 0) > 0;
            return (
              <img
                key={p}
                className="plant-art plant-fade"
                data-hero="room"
                data-room={p}
                data-lit={lit}
                src={`${ART}/rooms/${p}-lit.webp`}
                alt=""
                draggable={false}
                loading="lazy"
                style={boxOf([b[0], b[1], b[2] + 1, b[3] + 1])}
              />
            );
          })}
          {(["healthy", "tripped"] as const).map((k) => (
            <img
              key={k}
              className="plant-art plant-fade"
              data-hero="core"
              data-core={k}
              data-shown={k === "tripped" ? scram : !scram}
              data-cold={k === "healthy" && cold ? "" : undefined}
              src={`${ART}/core-${k}.webp`}
              alt=""
              draggable={false}
              style={boxOf(CORE_CROP)}
            />
          ))}
          <svg className="plant-scene-flow" viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} preserveAspectRatio="none" focusable="false">
            {segments.map((s) => (
              <FlowStripe key={s.id} from={s.from} to={s.to} tone={s.tone} />
            ))}
          </svg>
          {instruments.waiting && <Lamp x={(ROOMS["your-office"].bbox[0] + ROOMS["your-office"].bbox[2]) / 2} y={ROOMS["your-office"].bbox[1] + 8} tone="needs-you" pulse />}
          {figures.map((f) => {
            const pose = POSE[f.state];
            const h = pose === "needs-you" ? frameH : frameH;
            return (
              <div key={f.id} className="plant-figure-art" data-figure-art={f.id} data-state={f.state}>
                <img
                  className="plant-crew"
                  data-hero="figure"
                  data-pose={pose}
                  src={`${ART}/crew/${pose}.webp`}
                  alt=""
                  draggable={false}
                  style={{
                    left: pct(f.at.x - h / 2, CANVAS.width),
                    top: pct(f.at.y - (h * CREW_BASELINE) / CREW_FRAME, CANVAS.height),
                    width: pct(h, CANVAS.width),
                    height: pct(h, CANVAS.height),
                  }}
                />
                {f.state === "needs" && <Lamp x={f.at.x + 12} y={f.at.y - 38} tone="needs-you" />}
                {f.state === "stuck" && <Lamp x={f.at.x + 12} y={f.at.y - 30} tone="trip" />}
                {f.state === "waiting" && <Lamp x={f.at.x + 12} y={f.at.y - 30} tone="neutral" glyph="pause" />}
                {f.state === "changed" && <Lamp x={f.at.x + 12} y={f.at.y - 30} tone="neutral" glyph="diamond" />}
              </div>
            );
          })}
        </div>
        <div className="office-semantic" data-layer="semantic">
          {PLACE_IDS.map((p) => {
            const b = ROOMS[p].bbox;
            const r = REGION[p as RegionId];
            return (
              <section key={p} className="office-region plant-room" style={boxOf(b)} aria-label={labels?.[p] ? `${r.name}, ${labels[p]!.label}: ${r.purpose}` : `${r.name}: ${r.purpose}`} data-region={p}>
                <span className="sr-only">{r.name}</span>
              </section>
            );
          })}
          {PLACE_IDS.map((p) => {
            const b = ROOMS[p].bbox;
            return (
              <Label key={p} x={(b[0] + b[2]) / 2} y={b[3] + 2}>
                {REGION[p as RegionId].name}
              </Label>
            );
          })}
          <section className="office-region plant-reactor" style={boxOf(CORE_BBOX)} aria-label="Reactor building" data-region="reactor">
            <div className="plant-reactor-plate">
              <span className="plant-reactor-name">Reactor</span>
              <span className="plant-reactor-caption" data-instrument="core">
                {instruments.core.caption}
              </span>
              {instruments.rods.caption && (
                <span className="plant-reactor-caption" data-instrument="rods" data-trip={scram ? "" : undefined}>
                  {instruments.rods.caption}
                </span>
              )}
            </div>
          </section>
          {figures.map((f) => (
            <div key={f.id} className="plant-figure-slot" data-overlay="focus" style={at(f.at.x, f.at.y)}>
              <FigureMark canvas={CANVAS} figure={{ ...f, at: { x: 0, y: 0 } }} selected={selected === f.id} onSelect={onSelect} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
