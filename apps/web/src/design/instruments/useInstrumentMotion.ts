import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether an instrument may animate: not under reduced motion, and not in a hidden tab. Reads both
 * at mount and follows changes, so a tab that goes to the background pauses its animation.
 */
export function useInstrumentMotion(): "full" | "still" {
  const [reduced, setReduced] = useState(() => window.matchMedia?.(QUERY).matches ?? false);
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const q = window.matchMedia?.(QUERY);
    const onMedia = () => setReduced(q?.matches ?? false);
    const onVisible = () => setHidden(document.hidden);
    q?.addEventListener?.("change", onMedia);
    document.addEventListener("visibilitychange", onVisible);
    onMedia();
    onVisible();
    return () => {
      q?.removeEventListener?.("change", onMedia);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return reduced || hidden ? "still" : "full";
}
