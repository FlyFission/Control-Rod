import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Session } from "../api/types.js";

/**
 * Takes a new session after sign-in, registration or sign-out. Nothing an earlier session loaded
 * survives, but the session query itself is updated in place, never removed: removing it (as
 * QueryClient.clear does) detaches the observer in Root, so the app does not redraw and the old page
 * stays on screen. That was the 2026-11-05 pilot report: after registering, the setup page stayed up,
 * and pressing Register again was refused as adding a passkey to someone else's account.
 *
 * Every query in flight is cancelled first and the session generation moves on, so no answer about
 * the earlier session can arrive afterwards and put it back (see setIfSameSession). Mutations are cleared too: their variables can hold what
 * the earlier person submitted.
 */
let generation = 0;

/** Which session is current. Work that writes to the cache after awaiting takes this before it starts. */
export function sessionGeneration(): number {
  return generation;
}

/**
 * Writes a result to the cache only if the session it was fetched under is still current. A save or
 * reload that finishes after a sign-out would otherwise put the earlier person's data back.
 */
export function setIfSameSession<T>(qc: QueryClient, startedUnder: number, key: QueryKey, value: T): void {
  if (startedUnder === generation) qc.setQueryData(key, value);
}

export async function adoptSession(qc: QueryClient, s: Session): Promise<void> {
  generation += 1;
  await qc.cancelQueries();
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
  qc.getMutationCache().clear();
  qc.setQueryData(["session"], s);
}
