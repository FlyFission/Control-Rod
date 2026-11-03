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

/** The Spend lens's step for a figure: its tightest budget's state, or none. */
export function spendStep(f: AgentFigure): "over" | "near" | "within" | "none" {
  const st = f.spend?.state;
  return st === "over" || st === "near" || st === "within" ? st : "none";
}

/** The Change lens's step for a figure, from established evidence only. */
export function changeStep(f: AgentFigure): "changed" | "unknown" | "current" {
  if (f.marks.changed_input) return "changed";
  if (f.unverified_inputs?.length || !f.current_inputs?.length) return "unknown";
  return "current";
}

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
    // Current only where established: a pinned package input still at its pinned revision, and no
    // input whose freshness is unknown. Anything not established is said to be unknown.
    scale: [
      { key: "changed", label: "An input changed", color: GREY.brightest },
      { key: "unknown", label: "Freshness unknown", color: GREY.mid },
      { key: "current", label: "Inputs current as pinned", color: GREY.dim },
    ],
    tint: (f) => GREY[changeStep(f) === "changed" ? "brightest" : changeStep(f) === "unknown" ? "mid" : "dim"],
    value: (f) => {
      const step = changeStep(f);
      if (step === "changed") return `Input ${f.marks.changed_input} changed`;
      if (step === "unknown") return f.unverified_inputs?.length ? `Freshness unknown for ${f.unverified_inputs.join(", ")}` : "Freshness unknown: no package input revisions were pinned";
      return `Inputs current as pinned (${f.current_inputs!.join(", ")})`;
    },
  },
  {
    id: "spend",
    label: "Spend",
    // From the agent's tightest budget this window (plan task 5.2). Brighter is closer to the limit;
    // near only where the approved policy draws the line. A budget whose use is not, or not fully,
    // reported, or none at all, is the dimmest and says so in words.
    scale: [
      { key: "over", label: "Over its budget", color: GREY.brightest },
      { key: "near", label: "Near its budget", color: GREY.bright },
      { key: "within", label: "Within its budget", color: GREY.mid },
      { key: "none", label: "No budget, or use not fully reported", color: GREY.dim },
    ],
    tint: (f) => GREY[spendStep(f) === "over" ? "brightest" : spendStep(f) === "near" ? "bright" : spendStep(f) === "within" ? "mid" : "dim"],
    value: (f) => {
      const s = f.spend;
      if (!s) return "No budget applies";
      const unit = s.unit === "minute" ? "minutes of run time" : s.unit === "token" ? "tokens" : "USD";
      if (s.used === undefined) return `Budget ${s.budget_id}: ${unit} are not reported, so use is unknown`;
      if (s.state === "partial") return `Budget ${s.budget_id}: at least ${s.used} of ${s.limit} ${unit} in ${s.period}; ${s.unreported_runs ?? 0} runs reported none`;
      const where = s.state === "over" ? "Over" : s.state === "near" ? "Near" : "Within";
      return `${where} budget ${s.budget_id}: ${s.used} of ${s.limit} ${unit} in ${s.period}`;
    },
  },
];

export const lensById = (id: LensId) => LENSES.find((l) => l.id === id) ?? LENSES[0]!;

/** Every colour a lens can paint, for the harness to measure. */
export const LENS_COLORS: readonly string[] = [...new Set(LENSES.flatMap((l) => l.scale.map((s) => s.color)))];
