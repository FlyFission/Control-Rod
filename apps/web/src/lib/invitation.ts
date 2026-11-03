/**
 * The invitation an administrator's link carries (plan task 5.4). It travels in the address's
 * fragment, which a browser never sends to a server, and is taken out of the address the moment the
 * page loads, before routing could drop it and before anything could keep it in history. From then
 * on it lives only in memory, for retries, until the passkey is registered.
 */
let held: string | undefined;

/** Moves an invitation in the address into memory and clears it from the address and its history entry. */
export function captureInvitation(): void {
  const m = /(?:^|[#&])invitation=([A-Za-z0-9_-]+)/.exec(window.location.hash);
  if (!m) return;
  held = m[1];
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
}

/** The invitation waiting to be accepted, if any. */
export const heldInvitation = (): string | undefined => held;

/** Forgets the invitation once it has been used. */
export function forgetInvitation(): void {
  held = undefined;
}
