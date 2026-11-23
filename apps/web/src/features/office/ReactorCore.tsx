import { useId } from "react";
import type { CoreState, RodState } from "./plant-instruments.js";

/**
 * The reactor core in plan (plant view design, section 6): a fixed lattice of fuel positions inside
 * the reactor building's shell, with control rod positions among them. It is application code, not
 * theme art, so a theme can never fake it. Positions carry no identity: the lattice is lit or dark as a
 * whole, from whether any shown agent is working, and the rods show the SCRAMs in force. The words are
 * on the reactor building's plate; this drawing is hidden from assistive technology.
 */

/** The drawing box: the reactor building's region in the plant layout. */
const W = 280;
const H = 192;
const CX = W / 2;
const CY = H / 2;
const PITCH = 11;
const SIZE = 9;
/** The core's radius, inside the shell the site art draws. */
const RADIUS = 52;

interface Cell {
  i: number;
  j: number;
  x: number;
  y: number;
  rod: "none" | "a" | "b";
}

/** The lattice: every position whose square fits inside the core's circle; rods on a regular sub-grid in two banks. */
export const LATTICE: readonly Cell[] = (() => {
  const out: Cell[] = [];
  for (let i = -5; i <= 5; i++)
    for (let j = -5; j <= 5; j++) {
      const x = CX + i * PITCH;
      const y = CY + j * PITCH;
      const corner = Math.hypot(Math.abs(i * PITCH) + SIZE / 2, Math.abs(j * PITCH) + SIZE / 2);
      if (corner > RADIUS + 4) continue;
      const rod = i % 2 === 0 && j % 2 === 0 && !(i === 0 && j === 0) ? ((i / 2 + j / 2) % 2 === 0 ? "a" : "b") : "none";
      out.push({ i, j, x, y, rod });
    }
  return out;
})();

/** Whether a rod position is drawn inserted, for the rods' state. Bank A is the one a project SCRAM inserts. */
export function rodInserted(position: RodState["position"], bank: "a" | "b"): boolean {
  return position === "inserted" || (position === "bank" && bank === "a");
}

export function ReactorCore({ core, rods }: { core: CoreState; rods: RodState }) {
  const glow = useId().replace(/:/g, "");
  const lit = core.lit === true;
  return (
    <svg className="plant-core-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" data-lit={core.lit === null ? "unknown" : lit ? "lit" : "dark"} data-rods={rods.position}>
      <defs>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#5aa7ff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#2b6fc0" stopOpacity="0.18" />
          <stop offset="1" stopColor="#2b6fc0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="plant-core-glow" cx={CX} cy={CY} r={RADIUS + 26} fill={`url(#${glow})`} />
      {LATTICE.map((c) => (
        <rect key={`${c.i},${c.j}`} className="plant-core-cell" x={c.x - SIZE / 2} y={c.y - SIZE / 2} width={SIZE} height={SIZE} rx={1.2} />
      ))}
      {rods.position !== "unknown" &&
        LATTICE.filter((c) => c.rod !== "none").map((c) => {
          const inserted = rodInserted(rods.position, c.rod as "a" | "b");
          return (
            <rect
              key={`rod-${c.i},${c.j}`}
              className="plant-core-rod"
              data-inserted={inserted ? "" : undefined}
              data-drill={rods.position === "drill" ? "" : undefined}
              x={c.x - 2.5}
              y={c.y - 2.5}
              width={5}
              height={5}
            />
          );
        })}
    </svg>
  );
}
