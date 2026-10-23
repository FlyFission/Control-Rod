import { validateRawJson } from "../kernel.js";
import type { WorkConfig } from "../work.js";
/** Owner-managed source allowlist. It grants provenance reads, never agent repository access. */
export function preparationConfig(
  raw: string,
): Pick<WorkConfig, "preparationSources" | "preparationRepositories"> {
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
    "preparationSources" | "preparationRepositories"
  > = {};
  if (value.repositories !== undefined) {
    if (!object(value.repositories))
      throw new Error(
        "repositories must map references to repository directories",
      );
    const repositories: Record<string, string> = Object.create(null);
    for (const [key, path] of Object.entries(value.repositories)) {
      if (
        !key.startsWith("repository:") ||
        typeof path !== "string" ||
        !path.trim()
      )
        throw new Error("Repository references need a nonempty directory");
      repositories[key] = path;
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
        Object.keys(s).some((k) => !["kind", "revision", "path"].includes(k)) ||
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
    }
    result.preparationSources = sources;
  }
  return result;
}
