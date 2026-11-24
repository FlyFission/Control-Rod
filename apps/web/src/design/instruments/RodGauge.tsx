import type { RodPosition } from "../../features/office/plant-instruments.js";
import "./instruments.css";
import { useInstrumentMotion } from "./useInstrumentMotion.js";

/** The position in words, for the accessible name. */
export const ROD_WORDS: Record<RodPosition, string> = {
  withdrawn: "Control rods withdrawn, no SCRAM in force",
  bank: "Control rods: project bank inserted, SCRAM in force",
  inserted: "Control rods all inserted, SCRAM in force",
  drill: "Control rods shown for a SCRAM drill, nothing stopped",
  unknown: "Control rods unknown, SCRAM status unavailable",
};

/** How far down the gauge the rods sit, as a share of their travel: a layout fraction, not a measurement. */
const DROP: Record<RodPosition, number> = { withdrawn: 0, bank: 0.5, inserted: 1, drill: 1, unknown: 0 };
const RODS = [0, 1, 2];
/** Which rods drop for a project bank: the first one only. */
const dropped = (position: RodPosition, i: number) => (position === "bank" ? i === 0 : DROP[position] === 1);

/**
 * The rod gauge, 18 x 56 px. Rods hang from the top and drop on a trip by a CSS transform; under
 * reduced motion or in a hidden tab they move at once. A drill is drawn dashed (outline only), an
 * unknown reading hatched.
 */
export function RodGauge({ position, caption }: { position: RodPosition; caption?: string }) {
  const motion = useInstrumentMotion();
  return (
    <span className="rod-gauge" role="img" aria-label={caption ? `${ROD_WORDS[position]}. ${caption}` : ROD_WORDS[position]} data-position={position} data-motion={motion}>
      {RODS.map((i) => (
        <span key={i} className="rod-gauge-rod" data-dropped={dropped(position, i)} />
      ))}
    </span>
  );
}
