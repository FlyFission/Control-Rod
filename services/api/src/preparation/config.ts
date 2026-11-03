import { isLane } from "../disclosure.js";
import { validateRawJson } from "../kernel.js";
import type { WorkConfig } from "../work.js";
/**
 * Owner-managed source allowlist. It grants provenance reads, never agent repository access. Each
 * source may carry a data `lane`; a source without one is unclassified, so no preparation may pin it.
 * A repository is either a directory or `{ "path": ..., "lane": ... }`.
 */
export function preparationConfig(
  raw: string,
): Pick<WorkConfig, "preparationSources" | "preparationRepositories" | "preparationLanes"> {
  validateRawJson(raw);
  const value: unknown = JSON.parse(raw);
  const object = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === "object" && !Array.isArray(v);
  if (
    !object(value) ||
    Object.keys(value).some((k) => !["sources", "repositories"].includes(k))
  )
    throw new Error("Preparation config allows only sources and repositories");
  const result: Pick<
    WorkConfig,
    "preparationSources" | "preparationRepositories" | "preparationLanes"
  > = {};
  const lanes: NonNullable<WorkConfig["preparationLanes"]> = Object.create(null);
  const laneOf = (key: string, lane: unknown) => {
    if (lane === undefined) return;
    if (!isLane(lane)) throw new Error(`${key}: lane must be one of the data lanes`);
    lanes[key] = lane;
  };
  if (value.repositories !== undefined) {
    if (!object(value.repositories))
      throw new Error(
        "repositories must map references to repository directories",
      );
    const repositories: Record<string, string> = Object.create(null);
    for (const [key, entry] of Object.entries(value.repositories)) {
      const path = object(entry) ? entry.path : entry;
      if (
        !key.startsWith("repository:") ||
        typeof path !== "string" ||
        !path.trim() ||
        (object(entry) && Object.keys(entry).some((k) => !["path", "lane"].includes(k)))
      )
        throw new Error("Repository references need a nonempty directory");
      repositories[key] = path;
      if (object(entry)) laneOf(key, entry.lane);
    }
    result.preparationRepositories = repositories;
  }
  if (value.sources !== undefined) {
    if (!object(value.sources))
      throw new Error(
        "sources must map references to controlled document/policy files",
      );
    const sources: NonNullable<WorkConfig["preparationSources"]> =
      Object.create(null);
    for (const [key, s] of Object.entries(value.sources)) {
      if (
        !object(s) ||
        Object.keys(s).some((k) => !["kind", "revision", "path", "lane"].includes(k)) ||
        !["document", "policy"].includes(String(s.kind)) ||
        typeof s.revision !== "string" ||
        !s.revision.trim() ||
        typeof s.path !== "string" ||
        !s.path.trim() ||
        !key.startsWith(`${s.kind}:`)
      )
        throw new Error(
          "Each source needs a matching reference, kind, revision and path",
        );
      sources[key] = {
        kind: s.kind as "document" | "policy",
        revision: s.revision,
        path: s.path,
      };
      laneOf(key, s.lane);
    }
    result.preparationSources = sources;
  }
  if (Object.keys(lanes).length) result.preparationLanes = lanes;
  return result;
}
