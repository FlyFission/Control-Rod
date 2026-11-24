import type { CSSProperties } from "react";
import { markOf } from "../lib/agentMarks.js";

/**
 * An agent's own mark on a square tile. Decorative: the agent's name is always written beside it, so
 * the mark carries no text of its own. An agent with no mark shows its initial.
 */
export function AgentMark({ id, name, size = 40 }: { id: string; name: string; size?: number }) {
  const mark = markOf(id);
  const style = { "--mark-size": `${size}px` } as CSSProperties;
  if (!mark)
    return (
      <span className="agent-mark agent-mark-initial" style={style} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
    );
  if (mark.mono)
    return (
      <span className="agent-mark" style={style} aria-hidden="true">
        <span className="agent-mark-mono" style={{ maskImage: `url(${mark.src})`, WebkitMaskImage: `url(${mark.src})` }} />
      </span>
    );
  return (
    <span className="agent-mark" style={style} aria-hidden="true">
      <img src={mark.src} alt="" draggable={false} />
    </span>
  );
}
