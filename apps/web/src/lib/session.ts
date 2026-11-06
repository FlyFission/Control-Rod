import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "../api/types.js";

/**
 * Takes a new session after sign-in, registration or sign-out. Nothing an earlier session loaded
 * survives, but the session query itself is updated in place, never removed: removing it (as
 * QueryClient.clear does) detaches the observer in Root, so the app does not redraw and the old page
 * stays on screen. That was the 2026-11-05 pilot report: after registering, the setup page stayed up,
 * and pressing Register again was refused as adding a passkey to someone else's account.
 */
export function adoptSession(qc: QueryClient, s: Session): void {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
  qc.setQueryData(["session"], s);
}
