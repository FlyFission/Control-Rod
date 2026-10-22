// The five states plus idle, each with its own shape so color is never the only signal.

export type StateKind = "working" | "needs" | "waiting" | "stuck" | "changed" | "idle" | "done";

export const STATE_INFO: Record<StateKind, { label: string; color: string }> = {
  working: { label: "Working", color: "#5CC8FF" },
  needs: { label: "Needs you", color: "#F2B33D" },
  waiting: { label: "Waiting on someone", color: "#B89CFF" },
  stuck: { label: "Stuck", color: "#FF7A59" },
  changed: { label: "Input changed", color: "#FFB347" },
  idle: { label: "Idle", color: "#7D8A9A" },
  done: { label: "Done", color: "#3DD68C" },
};

export function StateMark({ kind, size = 10, title }: { kind: StateKind; size?: number; title?: string }) {
  const { color, label } = STATE_INFO[kind];
  const s = size;
  const shape = (() => {
    switch (kind) {
      case "working":
      case "done":
        return <circle cx={s / 2} cy={s / 2} r={s / 2} fill={color} />;
      case "needs":
        return <rect x={s * 0.15} y={s * 0.15} width={s * 0.7} height={s * 0.7} fill={color} transform={`rotate(45 ${s / 2} ${s / 2})`} />;
      case "waiting":
      case "idle":
        return <circle cx={s / 2} cy={s / 2} r={s / 2 - 1} fill="none" stroke={color} strokeWidth={2} />;
      case "stuck":
        return <rect x={0.5} y={0.5} width={s - 1} height={s - 1} rx={1} fill={color} />;
      case "changed":
        return <path d={`M${s / 2} 0.5L${s - 0.5} ${s - 0.5}H0.5z`} fill={color} />;
    }
  })();
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} role="img" aria-label={title ?? label} className="state-mark">
      {shape}
    </svg>
  );
}
