/**
 * The 1 second budget for a real SCRAM (control room redesign, section 6.6) is measured from the
 * server event reaching the browser to the banner being visible. Three moments are logged, in
 * development builds only: the event received, the `scrams` query refreshed, the banner visible.
 * Nothing is sent anywhere and production builds record nothing.
 */
export type ScramStage = "received" | "refreshed" | "visible";
export interface ScramTiming {
  received?: number;
  refreshed?: number;
  visible?: number;
}

let current: ScramTiming = {};
/** Every completed or partial run this page has seen, newest last (read by tests and the dev console). */
export const scramTimings: ScramTiming[] = [];

const enabled = () => Boolean(import.meta.env.DEV);

/** True for a stream event that concerns a SCRAM. */
export const isScramEvent = (type: unknown): boolean => typeof type === "string" && type.startsWith("scram.");

export function markScram(stage: ScramStage, at = performance.now()): void {
  if (!enabled()) return;
  // A new event starts a new measurement; the later stages fill in the one in progress.
  if (stage === "received") {
    current = { received: at };
    scramTimings.push(current);
  } else if (current.received === undefined || current[stage] !== undefined) {
    return;
  } else {
    current[stage] = at;
  }
  const since = current.received === undefined ? "" : ` (+${Math.round(at - current.received)} ms from event received)`;
  console.debug(`[scram timing] ${stage}${since}`);
}

/** Test seam. */
export function resetScramTimings(): void {
  current = {};
  scramTimings.length = 0;
}
