import type { ReactNode } from "react";
import "./instruments.css";

export type FrameTone = "normal" | "needs" | "trip";

/**
 * A machined instrument frame: 1 px rule, 8 px corner notches, 12 px padding, and an engraved label
 * set into the top rule. For instruments only, never ordinary cards. Tone changes the rule's colour
 * and nothing else; the label is the frame's accessible name.
 */
export function InstrumentFrame({ label, children, tone = "normal" }: { label: string; children: ReactNode; tone?: FrameTone }) {
  return (
    <section className="instrument-frame" data-tone={tone} aria-label={label}>
      <span className="instrument-frame-label" aria-hidden="true">
        {label}
      </span>
      {children}
    </section>
  );
}
