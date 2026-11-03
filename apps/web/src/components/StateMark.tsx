// The five states plus idle, each with its own shape so color is never the only signal.
// Colours are design tokens; SVG presentation attributes cannot read CSS variables, so they go in style.

export type StateKind = "working" | "needs" | "waiting" | "stuck" | "changed" | "idle" | "done";

export const STATE_INFO: Record<StateKind, { label: string; color: string }> = {
  working: { label: "Working", color: "var(--accent)" },
  needs: { label: "Needs you", color: "var(--needs)" },
  waiting: { label: "Waiting on someone", color: "var(--waiting)" },
  stuck: { label: "Stuck", color: "var(--stuck)" },
  changed: { label: "Input changed", color: "var(--changed)" },
  idle: { label: "Idle", color: "var(--idle)" },
  done: { label: "Done", color: "var(--done)" },
};

/**
 * `color` recolours the shape (an office lens does, OV-07); the shape itself always follows the
 * state, so state is never shown by colour alone.
 */
export function StateMark({ kind, size = 10, title, color: override }: { kind: StateKind; size?: number; title?: string; color?: string }) {
  const { color: stateColor, label } = STATE_INFO[kind];
  const color = override ?? stateColor;
  const s = size;
  const shape = (() => {
    switch (kind) {
      case "working":
      case "done":
        return <circle cx={s / 2} cy={s / 2} r={s / 2} style={{ fill: color }} />;
      case "needs":
        return <rect x={s * 0.15} y={s * 0.15} width={s * 0.7} height={s * 0.7} style={{ fill: color }} transform={`rotate(45 ${s / 2} ${s / 2})`} />;
      case "waiting":
      case "idle":
        return <circle cx={s / 2} cy={s / 2} r={s / 2 - 1} fill="none" strokeWidth={2} style={{ stroke: color }} />;
      case "stuck":
        return <rect x={0.5} y={0.5} width={s - 1} height={s - 1} rx={1} style={{ fill: color }} />;
      case "changed":
        return <path d={`M${s / 2} 0.5L${s - 0.5} ${s - 0.5}H0.5z`} style={{ fill: color }} />;
    }
  })();
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} role="img" aria-label={title ?? label} className="state-mark">
      {shape}
    </svg>
  );
}
