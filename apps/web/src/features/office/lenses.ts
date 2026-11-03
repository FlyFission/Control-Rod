import type { AgentFigure } from "../../api/types.js";
import { STATE_INFO } from "../../components/StateMark.js";

/**
 * Lenses (specification 13; plan task 4.8; OV-07). A lens recolours the same figures and never moves
 * one or changes a state shape: it recolours the state shape in the figure's mark chip, which nothing
 * else on the figure covers, against the chip's opaque dark plate, so every lens colour is checked
 * there by the quality harness. Lens colours are the application's, never a theme's. Lens scales are
 * neutral greys (specification 17); the Status lens uses the state colours.
 */

export type LensId = "status" | "gate" | "change" | "spend";

export interface LensScaleStep {
  key: string;
  label: string;
  color: string;
}

export interface Lens {
  id: LensId;
  label: string;
  /** Why a lens cannot be chosen yet; absent when it can. */
  unavailable?: string;
  scale: readonly LensScaleStep[];
  tint: (f: AgentFigure) => string;
  /** The same value in words, for the figure's accessible name and the card: colour is never the only signal. */
  value: (f: AgentFigure) => string;
}

/** Four greys, evenly spaced in luminance, each at least 4.5:1 against the dark plate (#0a0a0c). */
const GREY = { brightest: "#f3f4f6", bright: "#c7ccd4", mid: "#9aa2ae", dim: "#7b8494" } as const;

const GATE_STEPS: Record<AgentFigure["gate_stage"], LensScaleStep> = {
  release: { key: "release", label: "Before release", color: GREY.brightest },
  "in-work": { key: "in-work", label: "In work", color: GREY.bright },
  "pre-check": { key: "pre-check", label: "In pre-check", color: GREY.mid },
  accept: { key: "accept", label: "Awaiting acceptance", color: GREY.dim },
  settled: { key: "settled", label: "Settled", color: GREY.dim },
};

const STATES = ["working", "needs", "waiting", "stuck", "changed"] as const;

export const LENSES: readonly Lens[] = [
  {
    id: "status",
    label: "Status",
    scale: STATES.map((s) => ({ key: s, label: STATE_INFO[s].label, color: STATE_INFO[s].color })),
    tint: (f) => STATE_INFO[f.state].color,
    value: (f) => STATE_INFO[f.state].label,
  },
  {
    id: "gate",
    label: "Gate",
    scale: (["release", "in-work", "pre-check", "accept"] as const).map((k) => GATE_STEPS[k]),
    tint: (f) => GATE_STEPS[f.gate_stage].color,
    value: (f) => GATE_STEPS[f.gate_stage].label,
  },
  {
    id: "change",
    label: "Change",
    scale: [
      { key: "changed", label: "An input changed", color: GREY.brightest },
      { key: "current", label: "Inputs current", color: GREY.dim },
    ],
    tint: (f) => (f.marks.changed_input ? GREY.brightest : GREY.dim),
    value: (f) => (f.marks.changed_input ? `Input ${f.marks.changed_input} changed` : f.unverified_inputs?.length ? "Inputs current as far as recorded" : "Inputs current"),
  },
  {
    id: "spend",
    label: "Spend",
    unavailable: "Spend arrives with usage metering (plan task 5.2); nothing is recorded to show yet.",
    scale: [],
    tint: () => "transparent",
    value: () => "Not recorded yet",
  },
];

export const lensById = (id: LensId) => LENSES.find((l) => l.id === id) ?? LENSES[0]!;

/** Every colour a lens can paint, for the harness to measure. */
export const LENS_COLORS: readonly string[] = [...new Set(LENSES.flatMap((l) => l.scale.map((s) => s.color)))];
