import { useState, type CSSProperties } from "react";
import type {
  FloorModel,
  FloorEntity,
  StationId,
  MotionMode,
} from "./types.js";
import type { ThemePackV1 } from "./themes/types.js";
import { FloorActor } from "./FloorActor.js";
import { layoutEntities } from "./layout.js";
export function FloorScene({
  model,
  pack,
  selectedId,
  onSelect,
  onOpen,
  onShowStation,
  mode,
  submittingIds,
}: {
  model: FloorModel;
  pack: ThemePackV1;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onOpen: (e: FloorEntity) => void;
  onShowStation: (s: StationId) => void;
  mode: MotionMode;
  submittingIds: ReadonlySet<string>;
}) {
  const [brokenScene, setBrokenScene] = useState(false);
  const { placed, overflow } = layoutEntities(model.entities);
  return (
    <div
      className={`floor-stage motion-${mode} signature-${pack.signature}`}
      role="group"
      aria-label={`${pack.title} activity scene`}
      style={
        {
          "--world-accent": pack.tokens.accent,
          "--world-focus": pack.tokens.focus,
          background: pack.tokens.backdrop,
        } as CSSProperties
      }
    >
      {pack.assets.scene && !brokenScene ? (
        <img
          className="floor-scenery"
          src={pack.assets.scene.path}
          alt=""
          aria-hidden="true"
          onError={() => setBrokenScene(true)}
        />
      ) : (
        <svg
          className="floor-scenery"
          viewBox="0 0 1000 600"
          aria-hidden="true"
        >
          {Object.entries(pack.stations).map(([id, s]) => (
            <rect
              key={id}
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx="14"
              fill={pack.tokens.surface}
              stroke="#567184"
            />
          ))}
        </svg>
      )}
      {brokenScene && (
        <p className="floor-art-warning" role="status">
          Scenery unavailable. Activity is still accessible.
        </p>
      )}
      {(
        Object.entries(pack.stations) as [
          StationId,
          ThemePackV1["stations"][StationId],
        ][]
      ).map(([id, s]) => (
        <div
          key={id}
          className="floor-station-label"
          style={{
            left: `${s.x / 10}%`,
            top: `${s.y / 6}%`,
            width: `${s.w / 10}%`,
          }}
        >
          <span>{s.label}</span>
          <small>
            {id === "office"
              ? "Human decisions"
              : id === "verify"
                ? "Independent pre-check"
                : id === "archive"
                  ? "Records"
                  : id === "bench"
                    ? "Queued & waiting"
                    : id === "site"
                      ? "Site & technical"
                      : "General work"}
          </small>
        </div>
      ))}
      {placed.map(({ entity: e, x, y }) => (
        <div
          className="floor-actor-position"
          key={`${pack.id}:${e.id}`}
          style={{ left: `${x / 10}%`, top: `${y / 6}%` }}
        >
          <FloorActor
            entity={e}
            art={
              e.kind === "run"
                ? pack.assets.characters[e.variant ?? 0]?.path
                : undefined
            }
            selected={selectedId === e.id}
            onSelect={onSelect}
            onOpen={onOpen}
            submitting={submittingIds.has(e.id)}
          />
        </div>
      ))}
      {(Object.keys(overflow) as StationId[])
        .filter((s) => overflow[s].length)
        .map((id) => (
          <button
            key={id}
            type="button"
            className="floor-overflow"
            aria-label={`${overflow[id].length} more in ${pack.stations[id].label}`}
            onClick={() => onShowStation(id)}
            style={{
              left: `${(pack.stations[id].x + pack.stations[id].w - 68) / 10}%`,
              top: `${(pack.stations[id].y + pack.stations[id].h - 28) / 6}%`,
            }}
          >
            +{overflow[id].length} more
          </button>
        ))}
    </div>
  );
}
