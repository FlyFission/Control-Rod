import { useMemo } from "react";
import { type Api, api } from "../api/client.js";
import type { PracticeCard, WorkspaceProject } from "../api/types.js";
import { type Passkeys, browserPasskeys } from "./decide.js";
import { useProjects } from "./projects.js";

/**
 * The practice run (change record practice-agent): a project made by Control Rod with a small
 * bundled sample, worked by two fixed scripts built into the daemon. No model runs and nothing
 * leaves the computer. The passkey still releases and accepts, as on real work.
 */

/** The two practice runtimes, as the daemon names them. Neither is a real agent. */
export const PRACTICE_RUNTIMES = ["practice", "practice-check"] as const;

export const PRACTICE_NAMES: Record<string, string> = {
  practice: "Practice agent",
  "practice-check": "Practice checker",
};

export const isPracticeRuntime = (runtime: string | undefined): boolean =>
  runtime !== undefined && (PRACTICE_RUNTIMES as readonly string[]).includes(runtime);

/** The words that go with every practice card, run and record. */
export const PRACTICE_NOTE =
  "This is the practice project. A fixed script built into Control Rod does the agents' steps, so no model runs and nothing here is real work. Your passkey still releases and accepts, as on real work.";

/** The ids of the practice projects this person can see (there is one at most). */
export function usePracticeProjectIds(): ReadonlySet<string> {
  const projects = useProjects();
  return useMemo(() => new Set(projects.filter((p) => p.practice === true).map((p) => p.id)), [projects]);
}

/**
 * Starts the practice run: makes the practice project if there is none yet (the passkey signs it, as
 * it signs any new project), then adds one practice card to it.
 */
export async function startPractice(
  passkeys: Passkeys = browserPasskeys,
  client: Api = api,
): Promise<{ project: WorkspaceProject; card: PracticeCard }> {
  const opts = await client.adminCommandOptions("project.practice-start", {});
  const assertion = await passkeys.get(opts.options);
  const project = await client.adminCommand<WorkspaceProject>("project.practice-start", {}, assertion);
  const card = await client.practiceCard();
  return { project, card };
}
