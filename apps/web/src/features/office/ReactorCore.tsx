import { useId } from "react";
import type { CoreState, RodState } from "./plant-instruments.js";

/**
 * The reactor building in plan (plant view design, section 6): the containment, the vessel and the
 * core as a hexagonal lattice of fuel assemblies, with control rod positions among them. It is
 * application code, not theme art, so a theme can never fake it, and it may use filters (bloom) that
 * theme art may not. Assemblies carry no identity: the core is lit or dark as a whole, from whether
 * any shown agent is working, and the rods show the SCRAMs in force. The words are on the reactor
 * building's plate; this drawing is hidden from assistive technology.
 *
 * Motion (the slow turn of the polar crane, the breathing of the glow) runs only while the core is lit,
 * and stops with reduced motion or a hidden tab (office.css).
 */

/** The drawing box: the reactor building's region in the plant layout. */
const W = 280;
const H = 192;
const CX = W / 2;
const CY = H / 2 + 6;
/** An assembly's circumradius, and the lattice's rings around the centre assembly. */
const HEX = 5.4;
const RINGS = 5;
const CONTAINMENT = 84;
const VESSEL = 60;

interface Cell {
  q: number;
  r: number;
  x: number;
  y: number;
  ring: number;
  /** 0 at the centre to 1 at the edge: how hot the assembly is drawn when lit. */
  heat: number;
  rod: "none" | "a" | "b";
}

const hexPath = (x: number, y: number, s: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const t = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(`${(x + s * Math.cos(t)).toFixed(2)},${(y + s * Math.sin(t)).toFixed(2)}`);
  }
  return pts.join(" ");
};

/** The lattice: every assembly within RINGS of the centre; rods on a regular sub-lattice in two banks. */
export const LATTICE: readonly Cell[] = (() => {
  const out: Cell[] = [];
  const step = Math.sqrt(3) * HEX + 0.9;
  for (let q = -RINGS; q <= RINGS; q++)
    for (let r = -RINGS; r <= RINGS; r++) {
      const s = -q - r;
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (ring > RINGS) continue;
      const x = CX + step * (q + r / 2);
      const y = CY + step * (Math.sqrt(3) / 2) * r;
      // A small fixed variation, so the lit core is not flat.
      const jitter = (((q * 73856093) ^ (r * 19349663)) >>> 0) % 100 / 100;
      const heat = Math.min(1, ring / (RINGS + 0.5) + jitter * 0.18);
      const onRodLattice = ring > 0 && ring < RINGS && (q - r) % 3 === 0;
      const rod = onRodLattice ? (ring % 2 === 0 ? "a" : "b") : "none";
      out.push({ q, r, x, y, ring, heat, rod });
    }
  return out;
})();

/** Whether a rod position is drawn inserted, for the rods' state. Bank A is the one a project SCRAM inserts. */
export function rodInserted(position: RodState["position"], bank: "a" | "b"): boolean {
  return position === "inserted" || (position === "bank" && bank === "a");
}

/** The lit colour of an assembly: white-blue at the centre to deep blue at the edge. */
function litColour(heat: number): string {
  const from = [214, 244, 255];
  const to = [38, 120, 214];
  const c = from.map((f, i) => Math.round(f + (to[i]! - f) * heat));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

export function ReactorCore({ core, rods }: { core: CoreState; rods: RodState }) {
  const id = useId().replace(/:/g, "");
  const lit = core.lit === true;
  const state = core.lit === null ? "unknown" : lit ? "lit" : "dark";
  const ticks: string[] = [];
  const cardinalTicks: string[] = [];
  for (let a = 0; a < 360; a += 10) {
    const t = (a * Math.PI) / 180;
    const cardinal = a % 90 === 0;
    const major = a % 30 === 0;
    const r0 = CONTAINMENT + 3;
    const r1 = CONTAINMENT + (cardinal ? 12 : major ? 8.5 : 5.5);
    const seg = `M${(CX + Math.cos(t) * r0).toFixed(1)} ${(CY + Math.sin(t) * r0).toFixed(1)}L${(CX + Math.cos(t) * r1).toFixed(1)} ${(CY + Math.sin(t) * r1).toFixed(1)}`;
    if (cardinal) cardinalTicks.push(seg);
    else ticks.push(seg);
  }
  const bolts: { x: number; y: number }[] = [];
  for (let a = 0; a < 360; a += 15) {
    const t = (a * Math.PI) / 180;
    bolts.push({
      x: CX + Math.cos(t) * (VESSEL + 2.2),
      y: CY + Math.sin(t) * (VESSEL + 2.2),
    });
  }
  return (
    <svg className="plant-core-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" data-lit={state} data-rods={rods.position}>
      <defs>
        <radialGradient id={`${id}-cherenkov`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#b8eeff" stopOpacity="0.92" />
          <stop offset="0.32" stopColor="#5cc4ff" stopOpacity="0.62" />
          <stop offset="0.62" stopColor="#1e74e6" stopOpacity="0.28" />
          <stop offset="0.86" stopColor="#0d3588" stopOpacity="0.09" />
          <stop offset="1" stopColor="#091f5c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-concrete`} cx="50%" cy="50%" r="50%">
          <stop offset="0.8" stopColor="#0a111a" />
          <stop offset="0.88" stopColor="#2c3e52" />
          <stop offset="0.95" stopColor="#1b2736" />
          <stop offset="1" stopColor="#091018" />
        </radialGradient>
        <radialGradient id={`${id}-pool`} cx="50%" cy="44%" r="56%">
          <stop offset="0" stopColor="#102a44" />
          <stop offset="0.65" stopColor="#091726" />
          <stop offset="1" stopColor="#050b13" />
        </radialGradient>
        <filter id={`${id}-bloom`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      {/* Containment: the concrete shell with its buttresses and azimuth graduation ring. */}
      <circle cx={CX} cy={CY} r={CONTAINMENT} fill={`url(#${id}-concrete)`} stroke="#526f8c" strokeWidth="1.2" />
      {[45, 135, 225, 315].map((a) => (
        <rect key={a} className="plant-core-buttress" x={CX + CONTAINMENT - 4} y={CY - 5} width="9" height="10" rx="1.5" transform={`rotate(${a} ${CX} ${CY})`} />
      ))}
      <path className="plant-core-ticks" d={ticks.join("")} />
      <path className="plant-core-ticks-cardinal" d={cardinalTicks.join("")} />
      <circle cx={CX} cy={CY} r={CONTAINMENT - 9} fill={`url(#${id}-pool)`} stroke="#5d7fa0" strokeWidth="0.9" />
      {/* Four primary coolant loop nozzles linking the pressure vessel to the biological shield. */}
      {[45, 135, 225, 315].map((a) => (
        <g key={`nozzle-${a}`} className="plant-core-nozzle" transform={`rotate(${a} ${CX} ${CY})`}>
          <rect className="plant-core-nozzle-body" x={CX + VESSEL - 1} y={CY - 5.5} width="16.5" height="11" rx="1.4" />
          <rect className="plant-core-nozzle-flange" x={CX + VESSEL + 3.2} y={CY - 6.8} width="3" height="13.6" rx="0.8" />
          <rect className="plant-core-coolant" x={CX + VESSEL - 2} y={CY - 1.9} width="17.5" height="3.8" rx="1.2" />
        </g>
      ))}
      {/* The polar crane: a ring rail and its bridge, turning slowly while the core is lit. */}
      <g className="plant-core-crane">
        <circle cx={CX} cy={CY} r={CONTAINMENT - 14} fill="none" stroke="#33485f" strokeWidth="2" strokeDasharray="3 4" />
        <rect x={CX - CONTAINMENT + 14} y={CY - 3} width={(CONTAINMENT - 14) * 2} height="6" fill="#1b2837" stroke="#4a6580" strokeWidth="0.8" opacity="0.85" />
        <rect x={CX + 18} y={CY - 6} width="12" height="12" rx="1.5" fill="#2a3b4f" stroke="#6f8ba8" strokeWidth="0.8" />
      </g>
      {/* The glow and subtle caustic ring in the pool water around the core. */}
      <circle className="plant-core-glow" cx={CX} cy={CY} r={VESSEL + 24} fill={`url(#${id}-cherenkov)`} />
      <circle className="plant-core-caustic" cx={CX} cy={CY} r={VESSEL + 11} fill="none" />
      {/* Dramatic double-ringed crimson trip halo, visible only when rods are inserted. */}
      <circle className="plant-core-trip-ring" cx={CX} cy={CY} r={VESSEL + 7.5} fill="none" />
      {/* Pressure vessel flange, bolt circle, vessel wall and thermal shield barrel. */}
      <circle className="plant-core-flange" cx={CX} cy={CY} r={VESSEL + 4.4} />
      <g className="plant-core-bolts">
        {bolts.map((b, i) => (
          <circle key={i} className="plant-core-stud" cx={b.x.toFixed(1)} cy={b.y.toFixed(1)} r="0.95" />
        ))}
      </g>
      <circle className="plant-core-vessel" cx={CX} cy={CY} r={VESSEL} />
      <circle className="plant-core-trip-ring-inner" cx={CX} cy={CY} r={VESSEL - 2.2} fill="none" />
      <circle cx={CX} cy={CY} r={VESSEL - 4} fill="#050b13" stroke="#283d54" strokeWidth="1" />
      {/* Bloom: a blurred copy of the lit assemblies under the sharp ones. */}
      <g className="plant-core-bloom" filter={`url(#${id}-bloom)`}>
        {LATTICE.map((c) => (
          <polygon key={`b${c.q},${c.r}`} points={hexPath(c.x, c.y, HEX + 1.5)} fill={litColour(c.heat)} />
        ))}
      </g>
      <g className="plant-core-assemblies">
        {LATTICE.map((c) => (
          <polygon key={`${c.q},${c.r}`} className="plant-core-cell" points={hexPath(c.x, c.y, HEX)} style={lit ? { fill: litColour(c.heat) } : undefined} />
        ))}
        {LATTICE.filter((c) => c.ring <= 2).map((c) => (
          <circle key={`g${c.q},${c.r}`} className="plant-core-glint" cx={c.x} cy={c.y} r={c.ring === 0 ? 1.9 : 1.15} />
        ))}
      </g>
      {rods.position !== "unknown" && (
        <g className="plant-core-rods">
          {LATTICE.filter((c) => c.rod !== "none").map((c) => {
            const inserted = rodInserted(rods.position, c.rod as "a" | "b");
            return (
              <g key={`rod-${c.q},${c.r}`}>
                {inserted && <circle className="plant-core-rod-halo" cx={c.x} cy={c.y} r={4.8} filter={`url(#${id}-soft)`} />}
                <circle
                  className="plant-core-rod"
                  data-inserted={inserted ? "" : undefined}
                  data-drill={rods.position === "drill" ? "" : undefined}
                  cx={c.x}
                  cy={c.y}
                  r={2.6}
                />
                {inserted && <circle className="plant-core-rod-core" cx={c.x} cy={c.y} r={1.1} />}
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
