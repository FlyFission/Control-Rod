import { useSyncExternalStore } from "react";

/**
 * Whether the Plant is in presenting mode. The shell shows the SCRAM banner on every screen, and
 * presenting must still hide a SCRAM's reason and runs there, so the Plant, which owns the toggle,
 * publishes it here and the shell reads it. It resets when the Plant closes.
 */
let on = false;
const listeners = new Set<() => void>();

export function setPresenting(next: boolean): void {
  if (on === next) return;
  on = next;
  for (const fn of listeners) fn();
}

export function usePresenting(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => on,
    () => false,
  );
}
