import { useSyncExternalStore } from "react";

/** Whether a media query matches now, kept current. False where `matchMedia` does not exist (tests, old engines). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

/** The phone layout: the bottom bar replaces the rail. Matches the stylesheet's 820 px break. */
export const PHONE_QUERY = "(max-width: 820px)";
