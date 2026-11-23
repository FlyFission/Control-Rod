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
  for (let a = 0; a < 360; a += 10) {
    const t = (a * Math.PI) / 180;
    const long = a % 30 === 0;
    const r0 = CONTAINMENT + 3;
    const r1 = CONTAINMENT + (long ? 9 : 6);
    ticks.push(`M${(CX + Math.cos(t) * r0).toFixed(1)} ${(CY + Math.sin(t) * r0).toFixed(1)}L${(CX + Math.cos(t) * r1).toFixed(1)} ${(CY + Math.sin(t) * r1).toFixed(1)}`);
  }
  return (
    <svg className="plant-core-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" data-lit={state} data-rods={rods.position}>
      <defs>
        <radialGradient id={`${id}-cherenkov`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#7fd0ff" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#2f8cff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#1a4fbf" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-concrete`} cx="50%" cy="50%" r="50%">
          <stop offset="0.82" stopColor="#0c131c" />
          <stop offset="0.9" stopColor="#2a3a4c" />
          <stop offset="0.97" stopColor="#1a2532" />
          <stop offset="1" stopColor="#0b1119" />
        </radialGradient>
        <radialGradient id={`${id}-pool`} cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#0d2338" />
          <stop offset="1" stopColor="#060d16" />
        </radialGradient>
        <filter id={`${id}-bloom`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      {/* Containment: the concrete shell with its buttresses and graduation ring. */}
      <circle cx={CX} cy={CY} r={CONTAINMENT} fill={`url(#${id}-concrete)`} stroke="#4a6580" strokeWidth="1.2" />
      {[45, 135, 225, 315].map((a) => (
        <rect key={a} className="plant-core-buttress" x={CX + CONTAINMENT - 4} y={CY - 5} width="9" height="10" rx="1.5" transform={`rotate(${a} ${CX} ${CY})`} />
      ))}
      <path className="plant-core-ticks" d={ticks.join("")} />
      <circle cx={CX} cy={CY} r={CONTAINMENT - 9} fill={`url(#${id}-pool)`} stroke="#5b7a99" strokeWidth="0.8" />
      {/* The polar crane: a ring rail and its bridge, turning slowly while the core is lit. */}
      <g className="plant-core-crane">
        <circle cx={CX} cy={CY} r={CONTAINMENT - 14} fill="none" stroke="#33485f" strokeWidth="2" strokeDasharray="3 4" />
        <rect x={CX - CONTAINMENT + 14} y={CY - 3} width={(CONTAINMENT - 14) * 2} height="6" fill="#1b2837" stroke="#4a6580" strokeWidth="0.8" opacity="0.85" />
        <rect x={CX + 18} y={CY - 6} width="12" height="12" rx="1.5" fill="#2a3b4f" stroke="#6f8ba8" strokeWidth="0.8" />
      </g>
      {/* The glow in the water around the core. */}
      <circle className="plant-core-glow" cx={CX} cy={CY} r={VESSEL + 22} fill={`url(#${id}-cherenkov)`} />
      {/* The vessel. */}
      <circle className="plant-core-vessel" cx={CX} cy={CY} r={VESSEL} />
      <circle cx={CX} cy={CY} r={VESSEL - 4} fill="#050b13" stroke="#24364a" strokeWidth="1" />
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
      </g>
      {rods.position !== "unknown" && (
        <g className="plant-core-rods">
          {LATTICE.filter((c) => c.rod !== "none").map((c) => {
            const inserted = rodInserted(rods.position, c.rod as "a" | "b");
            return (
              <g key={`rod-${c.q},${c.r}`}>
                {inserted && <circle className="plant-core-rod-halo" cx={c.x} cy={c.y} r={4.2} filter={`url(#${id}-soft)`} />}
                <circle
                  className="plant-core-rod"
                  data-inserted={inserted ? "" : undefined}
                  data-drill={rods.position === "drill" ? "" : undefined}
                  cx={c.x}
                  cy={c.y}
                  r={2.6}
                />
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
