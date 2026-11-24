import { type RefObject, useLayoutEffect } from "react";

/**
 * The drawer is docked below whatever sits above the workspace (the top bar and a SCRAM banner), so
 * neither is ever covered. It reads the top of `#main` and keeps it in `--dock-top` on the drawer.
 */
export function useDockTop(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    const main = document.getElementById("main");
    if (!el || !main) return;
    const set = () => el.style.setProperty("--dock-top", `${Math.max(0, Math.round(main.getBoundingClientRect().top))}px`);
    set();
    window.addEventListener("resize", set);
    const ro = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(set);
    ro?.observe(document.body);
    ro?.observe(main);
    return () => {
      window.removeEventListener("resize", set);
      ro?.disconnect();
    };
  }, [ref]);
}
