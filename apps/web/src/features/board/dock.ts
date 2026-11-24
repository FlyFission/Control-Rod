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
    // The lowest edge of what sits above the workspace: the top bar (sticky on a phone, so it stays put
    // while the page scrolls) and a SCRAM banner while it is on screen.
    const set = () => {
      const edges = [main, document.querySelector(".topbar"), document.querySelector(".scram-banner")].map((n) => (n ? n.getBoundingClientRect().bottom : 0));
      edges[0] = main.getBoundingClientRect().top;
      el.style.setProperty("--dock-top", `${Math.max(0, Math.round(Math.max(...edges)))}px`);
    };
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
