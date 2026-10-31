import type { Db, Tx } from "./db/index.js";
import { currentQualification, memberIdFor } from "./tenancy.js";

/**
 * The disclosure gate (specification 11.3 M-0; workbench plan task 1.7). Nothing from a capture, an
 * attachment, an exploration message or a run input goes to a runtime or provider until its subject
 * has a classified lane and the lane admits that runtime. "Provider" includes the subscription model
 * services that local CLIs use: Claude Code reaches Anthropic and Codex reaches OpenAI.
 */
export type DataLane = "public" | "internal" | "proprietary" | "client-confidential" | "restricted";

/** Lanes from least to most sensitive. A lane may be raised; lowering is a change request (11.3 M-2). */
export const LANE_ORDER: readonly DataLane[] = ["public", "internal", "proprietary", "client-confidential", "restricted"];

/** Runtimes that keep everything on this machine: the test runtime, and local model runtimes when they arrive. */
const LOCAL_RUNTIMES = ["fake"];

/**
 * Which runtimes each lane admits. Public and internal work may use the subscription CLIs. The
 * sensitive lanes stay local until the owner answers which providers may receive them (specification
 * section 34, question Q-C); restricted lanes are local only by the plan's floor.
 */
export const LANE_RUNTIMES: Record<DataLane, readonly string[]> = {
  public: ["claude", "codex", ...LOCAL_RUNTIMES],
  internal: ["claude", "codex", ...LOCAL_RUNTIMES],
  proprietary: LOCAL_RUNTIMES,
  "client-confidential": LOCAL_RUNTIMES,
  restricted: LOCAL_RUNTIMES,
};

export function isLane(v: unknown): v is DataLane {
  return typeof v === "string" && (LANE_ORDER as readonly string[]).includes(v);
}

/** Whether a lane admits a runtime. An unclassified subject admits nothing. */
export function admits(lane: unknown, runtime: string): boolean {
  return isLane(lane) && LANE_RUNTIMES[lane].includes(runtime);
}

/** The runtimes a daemon offers that a lane admits, in the daemon's order. */
export function admitted(lane: unknown, have: string[]): string[] {
  return have.filter((r) => admits(lane, r));
}

/** Whether moving from one lane to another raises (or keeps) sensitivity. */
export function raises(from: DataLane, to: DataLane): boolean {
  return LANE_ORDER.indexOf(to) >= LANE_ORDER.indexOf(from);
}

/** Whether a person holds lane authority now: an active Member whose qualification includes it. */
export async function hasLaneAuthority(q: Db | Tx, userName: string): Promise<boolean> {
  const id = memberIdFor(userName);
  const m = await q.query<{ status: string }>("select body->>'status' as status from members where id = $1", [id]);
  if (m.rows[0]?.status !== "active") return false;
  return (await currentQualification(q, id))?.authorities.includes("lane") ?? false;
}

/** Why a run waits when its lane admits none of the runtimes on offer. */
export function laneHoldReason(lane: unknown): string {
  return isLane(lane)
    ? `The ${lane} lane admits none of the runtimes available here; it needs a runtime approved for that lane.`
    : "This work has no classified data lane yet; a person with lane authority must classify it before any runtime sees it.";
}
