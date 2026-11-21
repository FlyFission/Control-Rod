import type { WorkPackage } from "../api/types.js";

export type ContextProfile = "light" | "nuclear";

/** Which context a package's brief carries, and whether a person may change it. */
export interface ContextResolution {
  profile: ContextProfile;
  locked: boolean;
  reason?: string;
}

const label = (p: ContextProfile) => (p === "nuclear" ? "Nuclear" : "Light");

type Grade = NonNullable<WorkPackage["grade"]>;
const LOCK_REASON: Partial<Record<Grade, string>> = {
  safety: "Safety grade work is always Nuclear",
  material: "Material grade work is always Nuclear",
};

/**
 * For display only; the server decides (services/api/src/context-profile.ts, resolveContextProfile)
 * and this mirrors it rule for rule and reason for reason: Safety and Material grades are locked
 * Nuclear; otherwise the card's own value, else the project default, else Light. A resolution the
 * server sent wins over this mirror. Keep the two in step.
 */
export function resolveContextProfile(
  pkg: Pick<WorkPackage, "grade" | "context_profile">,
  projectDefault?: ContextProfile,
  server?: ContextResolution,
): ContextResolution {
  if (server) return server;
  const reason = pkg.grade ? LOCK_REASON[pkg.grade] : undefined;
  if (reason) return { profile: "nuclear", locked: true, reason };
  if (pkg.context_profile) return { profile: pkg.context_profile, locked: false, reason: `The card is set to ${label(pkg.context_profile)}` };
  if (projectDefault) return { profile: projectDefault, locked: false, reason: `The project default is ${label(projectDefault)}` };
  return { profile: "light", locked: false };
}

/** The default context profile of the project a package names, if one is set. Matched by id, as the server does. */
export function projectContextDefault(
  projects: readonly { id: string; name: string; default_context_profile?: ContextProfile }[] | undefined,
  project: string,
): ContextProfile | undefined {
  return projects?.find((p) => p.id === project)?.default_context_profile;
}
