import type { FloorModel, StationId, FloorEntity } from "./types.js";
import { StateMark } from "../../components/StateMark.js";
export function FloorList({
  model,
  stationFilter,
  selectedId,
  onSelect,
  onOpen,
}: {
  model: FloorModel;
  stationFilter: StationId | undefined;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onOpen: (e: FloorEntity) => void;
}) {
  const entities = model.entities.filter(
    (e) => !stationFilter || e.station === stationFilter,
  );
  return (
    <ul className="floor-list" aria-label="Work package activity">
      {entities.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            className={selectedId === e.id ? "is-selected" : ""}
            onFocus={() => onSelect(e.id)}
            onClick={() => onOpen(e)}
          >
            <StateMark kind={e.mark} />
            <span className="floor-list-main">
              <strong>
                {e.packageId}{" "}
                <small>
                  rev {e.revision} · {e.role ?? e.kind}
                </small>
              </strong>
              <span>{e.label}</span>
              <small>{e.detail}</small>
            </span>
            <span className="floor-list-id">{e.runId ?? e.kind}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
