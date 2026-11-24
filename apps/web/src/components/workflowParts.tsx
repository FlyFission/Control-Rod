import type { StopState } from "../lib/councilFlow.js";

export const STOP_LABEL: Record<StopState | "no", string> = {
  on: "Stops for you",
  always: "Always stops",
  coming: "Coming soon",
  skipped: "Stops today; your choice skips it later",
  no: "No",
};

/** The passkey glyph beside every step that stops for you. */
export function KeyGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="5" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h7M12.5 8v3M15 8v2.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
