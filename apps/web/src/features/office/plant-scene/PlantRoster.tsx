import type { CSSProperties } from "react";
import { AgentBadge } from "../../../components/AgentBadge.js";
import type { StageFigure } from "../OfficeStage.js";
import type { Rect, RoomPlan } from "./figure-layout.js";
import { Marks, StateChip } from "./PlantFigure.js";

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const rectStyle = (r: Rect): CSSProperties => ({ left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });

/**
 * One room's roster plate: its name, up to three rows (the agent's badge, a short title, a state chip
 * with its shape and word) and "+N more". The rows are a picture of what the focusable figure buttons
 * already say, so they are hidden from assistive technology; hovering or clicking a row is the same as
 * doing it to its figure, and the figure's focus lights the row. "+N more" is a real button: it opens
 * the room's panel with every agent in it.
 */
export function PlantRoster({
  room: r,
  figures,
  titles,
  hot,
  onHot,
  onSelect,
  onOpenRoom,
  open,
}: {
  room: RoomPlan;
  figures: ReadonlyMap<string, StageFigure>;
  titles: ReadonlyMap<string, string>;
  hot: string | undefined;
  onHot: (id: string | undefined) => void;
  onSelect: ((id: string) => void) | undefined;
  onOpenRoom: ((room: string) => void) | undefined;
  open: boolean;
}) {
  if (!r.roster) return null;
  return (
    <div className="plant-roster" data-label="roster" data-overlay="label" data-room={r.id} data-empty={r.total === 0 ? "" : undefined} style={rectStyle(r.roster)}>
      <div className="plant-roster-head" aria-hidden="true">
        <span className="plant-roster-name">{r.name}</span>
        {r.mode === "figures" && <span className="plant-roster-total">{r.total}</span>}
      </div>
      {r.rows.map((id) => {
        const f = figures.get(id);
        if (!f) return null;
        return (
          <div
            key={id}
            className="plant-row"
            data-row={id}
            data-state={f.state}
            data-hot={hot === id ? "" : undefined}
            data-safety={f.marks?.safety ? "" : undefined}
            aria-hidden="true"
            onMouseEnter={() => onHot(id)}
            onMouseLeave={() => onHot(undefined)}
            onClick={() => onSelect?.(id)}
          >
            <AgentBadge runtime={f.runtime} role={f.role} />
            <span className="plant-row-title">{titles.get(id) ?? f.code}</span>
            <Marks figure={f} />
            <StateChip state={f.state} tint={f.tint} />
          </div>
        );
      })}
      {r.more > 0 && (
        <button type="button" className="plant-more" data-label="more" data-room={r.id} aria-expanded={open} aria-label={`${r.name}: ${r.more} more ${r.more === 1 ? "agent" : "agents"}. Show them.`} onClick={() => onOpenRoom?.(r.id)}>
          {r.rows.length === 0 ? `${r.more} ${r.more === 1 ? "agent" : "agents"}` : `+${r.more} more`}
        </button>
      )}
    </div>
  );
}
