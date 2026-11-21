import type { WorkPackage } from "../api/types.js";

export type ContextProfile = "light" | "nuclear";

/** Which context a package's brief carries, and whether a person may change it. */
export interface ContextResolution {
  profile: ContextProfile;
  locked: boolean;
  reason?: string;
}

type Grade = NonNullable<WorkPackage["grade"]>;
const LOCK_REASON: Partial<Record<Grade, string>> = {
  safety: "Safety grade work is always Nuclear",
  material: "Material grade work is always Nuclear",
};

/**
 * For display only; the server decides (services/api/src/context-profile.ts). Safety and Material
 * grades are locked Nuclear; otherwise the card's own value, else the project default, else Light.
 * A resolution the server sent (it also locks trust-surface scopes) wins over this mirror.
 */
export function resolveContextProfile(
  pkg: Pick<WorkPackage, "grade" | "context_profile">,
  projectDefault?: ContextProfile,
  server?: ContextResolution,
): ContextResolution {
  if (server) return server;
  const reason = pkg.grade ? LOCK_REASON[pkg.grade] : undefined;
  if (reason) return { profile: "nuclear", locked: true, reason };
  return { profile: pkg.context_profile ?? projectDefault ?? "light", locked: false };
}

/** The default context profile of the project a package names (by id or name), if one is set. */
export function projectContextDefault(
  projects: readonly { id: string; name: string; default_context_profile?: ContextProfile }[] | undefined,
  project: string,
): ContextProfile | undefined {
  return projects?.find((p) => p.id === project || p.name === project)?.default_context_profile;
}
