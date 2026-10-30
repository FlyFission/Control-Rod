import type { FloorEntity, StationId } from "./types.js";
import { STATIONS } from "./themes/plain.js";
export function layoutEntities(entities: readonly FloorEntity[]) {
  const overflow = Object.fromEntries(
    Object.keys(STATIONS).map((k) => [k, []]),
  ) as unknown as Record<StationId, FloorEntity[]>;
  const placed: { entity: FloorEntity; x: number; y: number }[] = [];
  for (const station of Object.keys(STATIONS) as StationId[]) {
    const r = STATIONS[station];
    const rows = entities
      .filter((e) => e.station === station)
      .slice()
      .sort(
        (a, b) =>
          a.attentionRank - b.attentionRank ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    rows.forEach((entity, i) => {
      if (i >= 6) {
        overflow[station].push(entity);
        return;
      }
      placed.push({
        entity,
        x: r.x + (r.w * ((i % 3) + 0.5)) / 3,
        y: r.y + 95 + Math.floor(i / 3) * 86,
      });
    });
  }
  return { placed, overflow };
}
