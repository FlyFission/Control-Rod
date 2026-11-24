import type { CSSProperties, ReactNode } from "react";
import { markOf } from "../lib/agentMarks.js";
import "./AgentMark.css";

/**
 * An agent's own mark on a square tile: the one shared way every screen shows who an agent is. Without
 * `label` it is decoration, because the agent's name is written beside it. With `label` (the agent's
 * name) it is an image whose text alternative is that name. An agent with no mark shows `fallback` if
 * given, else its initial: user-named and unknown models never borrow another vendor's logo.
 */
export function AgentMark({ id, name, size = 40, label, fallback }: { id: string; name: string; size?: number; label?: string | undefined; fallback?: ReactNode }) {
  const mark = markOf(id);
  const style = { "--mark-size": `${size}px` } as CSSProperties;
  const common = {
    style,
    "data-small": size <= 24 ? "" : undefined,
    ...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const }),
  };
  if (!mark)
    return (
      <span className="agent-mark agent-mark-initial" {...common}>
        {fallback ?? name.charAt(0).toUpperCase()}
      </span>
    );
  if (mark.mono)
    return (
      <span className="agent-mark" {...common}>
        <span className="agent-mark-mono" style={{ maskImage: `url(${mark.src})`, WebkitMaskImage: `url(${mark.src})` }} />
      </span>
    );
  return (
    <span className="agent-mark" {...common}>
      <img src={mark.src} alt="" draggable={false} />
    </span>
  );
}
