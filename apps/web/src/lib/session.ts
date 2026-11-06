import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "../api/types.js";
import { resetLiveStatus } from "./live.js";

/**
 * One identity transition. Whenever the signed-in identity (the user, or whether anyone is signed
 * in) changes, however this tab learns of it, the session generation moves on and nothing the
 * earlier identity loaded or submitted survives: queries in flight are cancelled, every other query
 * is removed, and mutations are cleared (their variables can hold what the earlier person
 * submitted). This tab learns of a change in two ways:
 *
 * - it takes a new session itself after sign-in, registration or sign-out (adoptSession), or
 * - the session query refetches (on focus, an invalidation, or after another tab signed someone
 *   else in) and answers with a different identity (watchSessionIdentity).
 *
 * The session query itself is updated in place, never removed: removing it (as QueryClient.clear
 * does) detaches the observer in the session gate, so the app does not redraw and the old page stays
 * on screen. That was the 2026-11-05 pilot report: after registering, the setup page stayed up, and
 * pressing Register again was refused as adding a passkey to someone else's account.
 *
 * Work that awaits a request takes sessionGeneration() before it starts and checks stillCurrent()
 * after each await, before it writes to the cache or changes component state. The session gate also
 * keys the app by identity, so a change remounts it and drops editor drafts and ETags.
 */
let generation = 0;

/** The identity the session gate keys the app by: who is signed in, or that nobody is. */
export function sessionIdentity(s: Session | undefined): string | undefined {
  if (s === undefined) return undefined;
  return s.signed_in ? `signed-in:${s.user ?? ""}` : "signed-out";
}

/** The identity each query client last saw in its session query. */
const seen = new WeakMap<QueryClient, string>();

/** Which session is current. Work that writes to the cache or its own state after awaiting takes this before it starts. */
export function sessionGeneration(): number {
  return generation;
}

/** Whether the session that work started under is still current; if not, its answer is about an earlier person. */
export function stillCurrent(startedUnder: number): boolean {
  return startedUnder === generation;
}

const notSession = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] !== "session" };

/** The transition itself. Synchronous, so nothing can observe the new identity alongside the earlier one's data. */
function beginNewIdentity(qc: QueryClient): void {
  generation += 1;
  // The event stream's state (status and last event id) belonged to the earlier identity too.
  resetLiveStatus();
  void qc.cancelQueries(notSession);
  qc.removeQueries(notSession);
  qc.getMutationCache().clear();
}

/** Takes a new session this tab obtained itself (sign-in, registration, sign-out). Always a transition. */
export async function adoptSession(qc: QueryClient, s: Session): Promise<void> {
  // Recorded first, so the watcher does not run a second transition when the new session lands.
  const identity = sessionIdentity(s);
  if (identity !== undefined) seen.set(qc, identity);
  beginNewIdentity(qc);
  // A session request that started before this one must not put the earlier session back.
  await qc.cancelQueries({ queryKey: ["session"] });
  qc.setQueryData(["session"], s);
}

/**
 * Watches the session query and runs the identity transition when it answers with a different
 * identity than the one last seen. The first identity seen is only recorded. The listener runs
 * synchronously as the answer lands, before anything renders with it. Returns the unsubscribe.
 */
export function watchSessionIdentity(qc: QueryClient): () => void {
  const now = sessionIdentity(qc.getQueryData<Session>(["session"]));
  if (!seen.has(qc) && now !== undefined) seen.set(qc, now);
  return qc.getQueryCache().subscribe((event) => {
    const key = event.query.queryKey;
    if (event.type !== "updated" || key.length !== 1 || key[0] !== "session") return;
    const identity = sessionIdentity(event.query.state.data as Session | undefined);
    if (identity === undefined) return;
    const before = seen.get(qc);
    seen.set(qc, identity);
    if (before !== undefined && before !== identity) beginNewIdentity(qc);
  });
}
