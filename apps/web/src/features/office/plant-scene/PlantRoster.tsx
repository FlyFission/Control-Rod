import type { CSSProperties } from "react";
import { AgentBadge } from "../../../components/AgentBadge.js";
import type { StageFigure } from "../OfficeStage.js";
import type { Rect, RoomPlan } from "./figure-layout.js";
import { STATE_INFO, StateMark } from "../../../components/StateMark.js";
import { Marks, StateChip } from "./PlantFigure.js";

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const rectStyle = (r: Rect): CSSProperties => ({ left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });

/**
 * One room's roster plate. Collapsed (the default) it is one line: the room's name and a shape and number per
 * state ("Process ◆1 ■1 ●2"). Expanded, it is the name, up to three rows (the agent's badge, a short title, a
 * state chip with its shape and word) and "+N more". It starts expanded when the room holds a needs-you or stuck
 * figure, and opens while the room, one of its figures or the plate is hovered or focused. The rows are a picture of what the focusable figure buttons
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
  peeked,
  onPeek,
}: {
  room: RoomPlan;
  figures: ReadonlyMap<string, StageFigure>;
  titles: ReadonlyMap<string, string>;
  hot: string | undefined;
  onHot: (id: string | undefined) => void;
  onSelect: ((id: string) => void) | undefined;
  onOpenRoom: ((room: string) => void) | undefined;
  open: boolean;
  peeked: boolean;
  onPeek: (room: string | undefined) => void;
}) {
  if (!r.roster) return null;
  const isOpen = r.mode === "figures" && (r.expanded || peeked);
  const rect = isOpen && r.open ? r.open : r.roster;
  return (
    <div
      className="plant-roster"
      data-label="roster"
      data-overlay="label"
      data-room={r.id}
      data-empty={r.total === 0 ? "" : undefined}
      data-open={isOpen ? "" : undefined}
      data-collapsed={isOpen ? undefined : ""}
      data-compact={r.compact ? "" : undefined}
      style={rectStyle(rect)}
      onMouseEnter={() => onPeek(r.id)}
      onMouseLeave={() => onPeek(undefined)}
      onFocus={() => onPeek(r.id)}
      onBlur={() => onPeek(undefined)}
    >
      <div className="plant-roster-head" aria-hidden="true">
        <span className="plant-roster-name">{r.name}</span>
        {isOpen ? (
          <span className="plant-roster-total">{r.total}</span>
        ) : (
          r.mode === "figures" && (
            <span className="plant-roster-counts">
              {r.byState.map(([st, n]) => (
                <span key={st} className="plant-roster-count" data-state={st}>
                  <StateMark kind={st} size={9} title={STATE_INFO[st].label} />
                  <b>{n}</b>
                </span>
              ))}
            </span>
          )
        )}
      </div>
      {isOpen && r.rows.map((id) => {
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
