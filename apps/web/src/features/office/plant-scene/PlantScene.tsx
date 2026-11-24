import { type CSSProperties, Fragment, useLayoutEffect, useMemo, useState } from "react";
import { STATE_INFO, StateMark } from "../../../components/StateMark.js";
import { useInstrumentMotion } from "../../../design/instruments/useInstrumentMotion.js";
import type { FigureState, PlantInstruments, StageFigure } from "../OfficeStage.js";
import { type OccupancyMap, flowSegments, ringPath } from "./flow.js";
import { type Rect, type RoomPlan, leaderBetween, planScene, roomBox } from "./figure-layout.js";
import { CANVAS, CORE_BBOX, CORE_CROP, ROOMS } from "./geometry.js";
import { CHIP_WORD, PlantFigure } from "./PlantFigure.js";
import { PlantRoster } from "./PlantRoster.js";
import { SCENE_LAYOUT } from "./scene-layout.js";
import "../office.css";
import "./plant-scene.css";

/**
 * The Plant as a painted scene (control room redesign, sections 4 and 6). Application owned, like
 * ReactorCore: no theme can fake a state. Hero art is raster only (site plate, room tiles, core and crew images,
 * all aria-hidden); code draws only the named overlays below (Lamp, FlowStripe, the needs-you Halo, the room rosters
 * and count plates). The focusable figure buttons and the room rosters are the semantic layer on top,
 * as in OfficeStage. Where each figure, roster plate and count plate goes is worked out in
 * figure-layout.ts from the room geometry and the scene's scale; rooms come from the geometry,
 * however many it holds, so a new room needs no change here.
 */

const ART = "/plant";
/** The crew image for a state; an input that changed shows the waiting pose (its chip says Changed). */
export const POSE: Record<FigureState, "working" | "waiting" | "stuck" | "needs-you"> = {
  working: "working",
  waiting: "waiting",
  stuck: "stuck",
  needs: "needs-you",
  changed: "waiting",
};
/** The width assumed before the scene is measured (and where there is no layout engine, as in tests): a 1440 px window. */
const ASSUMED_WIDTH = 1176;
/** How many characters of a title a nameplate has room for before it is cut with an ellipsis. */
const TITLE_CHARS = 24;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const at = (x: number, y: number): CSSProperties => ({ left: pct(x, CANVAS.width), top: pct(y, CANVAS.height) });
const boxOf = ([x0, y0, x1, y1]: readonly number[]): CSSProperties => ({
  left: pct(x0!, CANVAS.width),
  top: pct(y0!, CANVAS.height),
  width: pct(x1! - x0!, CANVAS.width),
  height: pct(y1! - y0!, CANVAS.height),
});
const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const rectStyle = (r: Rect): CSSProperties => ({ left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });

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

/** Overlay: a ring at a needs-you figure's feet, in the needs-you colour, so it is found at a glance (a shape, not a dot). */
export function Halo({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <span className="plant-halo" data-overlay="halo" style={{ left: pct(x, CANVAS.width), top: pct(y, CANVAS.height), width: pct(w, CANVAS.width), height: pct(h, CANVAS.height) }} />;
}

/** Overlay: a lit pipe stripe, steady, never moving. */
export function FlowStripe({ from, to, tone }: { from: Parameters<typeof ringPath>[0]; to: Parameters<typeof ringPath>[1]; tone: "screen" | "needs-you" }) {
  return <polyline className="plant-flow-stripe" data-overlay="flow" data-tone={tone} data-from={from} data-to={to} points={ringPath(from, to)} />;
}

/** The scene's width in px, so layout follows the scale the picture is actually drawn at. */
function useSceneWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(ASSUMED_WIDTH);
  useLayoutEffect(() => {
    if (!el) return;
    const read = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(read);
    o.observe(el);
    return () => o.disconnect();
  }, [el]);
  return [setEl, width];
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
  /** Agents on the floor that have no seat (over a room's seats): they count in the room's "+N". */
  overflow?: readonly { place: string; state: FigureState }[];
  /** A "+N" stack or a count plate was used: open that room's figures. */
  onOpenRoom?: ((room: string) => void) | undefined;
  /** The room whose figures are open, for aria-expanded. */
  openRoom?: string | undefined;
}

/**
 * A roster row's title: the package title where it fits, else its start and the work-package number's suffix
 * ("Cable tray… 0023"), so the number is never the part that is cut. Two titles that would read the same
 * also carry the suffix.
 */
export function titles(figs: readonly StageFigure[]): Map<string, string> {
  const key = (f: StageFigure) => (f.title ?? f.code).slice(0, TITLE_CHARS).toLowerCase();
  const seen = new Map<string, number>();
  for (const f of figs) seen.set(key(f), (seen.get(key(f)) ?? 0) + 1);
  return new Map(
    figs.map((f) => {
      const full = f.title ?? f.code;
      const tail = (f.name ?? f.code).slice(-4);
      if (full.length <= TITLE_CHARS && (seen.get(key(f)) ?? 0) < 2) return [f.id, full];
      const room = TITLE_CHARS - tail.length - 2;
      return [f.id, `${full.slice(0, room).trimEnd()}… ${tail}`];
    }),
  );
}

const plural = (n: number) => `${n} ${n === 1 ? "agent" : "agents"}`;

export function PlantScene({ figures, selected, onSelect, instruments, occupancy, labels, overflow, onOpenRoom, openRoom }: PlantSceneProps) {
  const motion = useInstrumentMotion();
  const [measure, width] = useSceneWidth();
  const [hot, setHot] = useState<string | undefined>();
  // The room whose plate is hovered or focused (its roster, its tile), so the plate opens.
  const [peek, setPeek] = useState<string | undefined>();
  const scram = instruments.rods.position === "inserted" || instruments.rods.position === "bank";
  const cold = instruments.core.lit !== true && !scram;
  const segments = flowSegments(occupancy, instruments.waiting, scram);
  const u = width / CANVAS.width;
  const nameOf = (room: string) => SCENE_LAYOUT.region[room as keyof typeof SCENE_LAYOUT.region]?.name ?? room;
  const plan = useMemo(() => {
    const folded = new Map<string, number>();
    for (const [room, o] of occupancy) {
      const drawn = figures.filter((f) => f.region === room).length + (overflow ?? []).filter((f) => f.place === room).length;
      if (o.count > drawn) folded.set(room, o.count - drawn);
    }
    return planScene({
      figures: figures.map((f) => ({ id: f.id, region: f.region, state: f.state })),
      extra: (overflow ?? []).map((f) => ({ region: f.place, state: f.state })),
      folded,
      u,
      name: nameOf,
    });
  }, [figures, overflow, occupancy, u]);
  const byId = new Map(figures.map((f) => [f.id, f]));
  const shown = plan.rooms.flatMap((r) => r.rows.map((id) => byId.get(id)!).filter(Boolean));
  const title = titles(shown);
  const canvasW = CANVAS.width * u;
  const canvasH = CANVAS.height * u;
  const office = ROOMS["your-office" as keyof typeof ROOMS];
  // Tiles are cut at the plate's size and at the 1440 path's: the smaller is plenty below a 1500 px scene.
  const tileSuffix = width > 1500 ? "" : "-1440";
  // Back to front, so a room in front covers the one behind it, as the picture's depth says.
  const depth = [...plan.rooms].sort((a, b) => a.box.y + a.box.h - (b.box.y + b.box.h));
  return (
    <div className="plant-scene" data-layout="plant" data-motion={motion} data-mode={plan.mode} data-scram={scram ? "" : undefined}>
      <div className="plant-scene-canvas" ref={measure} style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}>
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
          {depth.map((r) => {
            const room = ROOMS[r.id as keyof typeof ROOMS];
            const lit = (occupancy.get(r.id)?.count ?? 0) > 0;
            const file = (layer: string) => `${ART}/tiles/${room.tile}-${layer}${tileSuffix}.webp`;
            return (
              <Fragment key={r.id}>
                <img className="plant-art" data-hero="tile" data-tile-layer="dark" data-room={r.id} src={file("dark")} alt="" draggable={false} style={boxOf(room.box)} />
                <img className="plant-art plant-fade" data-hero="tile" data-tile-layer="lit" data-room={r.id} data-lit={lit} src={file("lit")} alt="" draggable={false} loading="lazy" style={boxOf(room.box)} />
                {[...r.placed]
                  .sort((a, b) => a.seat.y - b.seat.y)
                  .map((p) => (
                    <div key={p.id} className="plant-figure-art" data-figure-art={p.id} data-state={p.state} data-hot={hot === p.id ? "" : undefined}>
                      {p.state === "needs" && <Halo x={p.seat.x / u} y={p.seat.y / u} w={(plan.frame * 0.8) / u} h={(plan.frame * 0.3) / u} />}
                      <img
                        className="plant-crew"
                        data-hero="figure"
                        data-pose={POSE[p.state]}
                        src={`${ART}/crew/${POSE[p.state]}.webp`}
                        alt=""
                        draggable={false}
                        style={{ left: pct(p.frame.x, canvasW), top: pct(p.frame.y, canvasH), width: pct(p.frame.w, canvasW), height: pct(p.frame.h, canvasH) }}
                      />
                    </div>
                  ))}
                <img className="plant-art" data-hero="tile" data-tile-layer="front" data-room={r.id} src={file("front")} alt="" draggable={false} style={boxOf(room.box)} />
              </Fragment>
            );
          })}
          {instruments.waiting && office && <Lamp x={(office.bbox[0] + office.bbox[2]) / 2} y={office.bbox[1] + 8} tone="needs-you" pulse />}
        </div>
        <div className="office-semantic" data-layer="semantic">
          {plan.rooms.map((r) => {
            const region = SCENE_LAYOUT.region[r.id as keyof typeof SCENE_LAYOUT.region];
            const name = region?.name ?? r.name;
            const purpose = region?.purpose ? `: ${region.purpose}` : "";
            const theme = labels?.[r.id]?.label;
            return (
              <section key={r.id} className="office-region plant-room" onMouseEnter={() => setPeek(r.id)} onMouseLeave={() => setPeek((p) => (p === r.id ? undefined : p))} style={boxOf(ROOMS[r.id as keyof typeof ROOMS].bbox)} aria-label={theme ? `${name}, ${theme}${purpose}` : `${name}${purpose}`} data-region={r.id}>
                <span className="sr-only">{name}</span>
              </section>
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
          <svg className="plant-leaders" width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`} aria-hidden="true" focusable="false">
            {plan.rooms.map((r) => {
              const rect = r.roster && (peek === r.id || (hot && byId.get(hot)?.region === r.id) ? r.open ?? r.roster : r.roster);
              const l = rect && leaderBetween(rect, roomBox(r.id, u));
              return l ? <line key={r.id} data-leader={r.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} /> : null;
            })}
          </svg>
          {plan.rooms.map((r) => (
            <RoomControls key={r.id} room={r} figures={byId} titles={title} selected={selected} hot={hot} onHot={setHot} onSelect={onSelect} onOpenRoom={onOpenRoom} open={openRoom === r.id} peeked={peek === r.id || (hot !== undefined && byId.get(hot)?.region === r.id)} onPeek={setPeek} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One room's focusable parts: its figures, then its roster plate, or its count plate when figures are not drawn. */
function RoomControls({ room: r, figures, titles: names, selected, hot, onHot, onSelect, onOpenRoom, open, peeked, onPeek }: { room: RoomPlan; figures: ReadonlyMap<string, StageFigure>; titles: ReadonlyMap<string, string>; selected: string | undefined; hot: string | undefined; onHot: (id: string | undefined) => void; onSelect: ((id: string) => void) | undefined; onOpenRoom: ((room: string) => void) | undefined; open: boolean; peeked: boolean; onPeek: (room: string | undefined) => void }) {
  const words = r.byState.map(([s, n]) => `${n} ${CHIP_WORD[s]}`).join(", ");
  return (
    <>
      {[...r.placed]
        .sort((a, b) => a.seat.y - b.seat.y)
        .map((p) => {
          const f = figures.get(p.id);
          return f ? <PlantFigure key={p.id} figure={f} placed={p} selected={selected === p.id} hot={hot === p.id} onSelect={onSelect} onHot={onHot} /> : null;
        })}
      <PlantRoster room={r} figures={figures} titles={names} hot={hot} onHot={onHot} onSelect={onSelect} onOpenRoom={onOpenRoom} open={open} peeked={peeked} onPeek={onPeek} />
      {r.tag && (
        <span className="plant-tag" data-label="tag" data-room={r.id} style={rectStyle(r.tag)} aria-hidden="true">
          <span className="plant-tag-name">{r.name}</span>
          {r.total > 0 && <b>{r.total}</b>}
        </span>
      )}
      {r.count && (
        <button
          type="button"
          className="plant-count"
          data-label="count"
          data-tier={r.count.tier}
          data-room={r.id}
          style={rectStyle(r.count.rect)}
          aria-expanded={open}
          aria-label={`${r.name}: ${plural(r.total)}, ${words}. Show them.`}
          onClick={() => onOpenRoom?.(r.id)}
        >
          {r.count.tier === "full" ? (
            r.byState.map(([s, n]) => (
              <span key={s} className="plant-count-row" data-state={s} aria-hidden="true">
                <StateMark kind={s} size={10} title={STATE_INFO[s].label} />
                <b>{n}</b>
                <span>{CHIP_WORD[s]}</span>
              </span>
            ))
          ) : (
            <span className="plant-count-row" data-state={r.byState[0]![0]} aria-hidden="true">
              <StateMark kind={r.byState[0]![0]} size={10} title={STATE_INFO[r.byState[0]![0]].label} />
              <b>{r.total}</b>
            </span>
          )}
        </button>
      )}
    </>
  );
}
