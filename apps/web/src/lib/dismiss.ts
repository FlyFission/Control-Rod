import { type RefObject, useEffect } from "react";

/**
 * Clicking outside a drawer closes it, the way Esc does. Not while a dialog or the palette is open
 * over it (that click belongs to them), and not when the click lands on a board card, which opens
 * that card in the drawer instead. `keep` returns false to hold the drawer open (unsaved input).
 */
export function useOutsideClose(ref: RefObject<HTMLElement | null>, onClose: () => void, keep?: () => boolean): void {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      const target = e.target;
      if (!el || !(target instanceof Element) || el.contains(target)) return;
      if (document.querySelector("dialog[open], .palette, .palette-backdrop")) return;
      if (target.closest(".bd-card, .bd-list-row, [data-opens-drawer], [role='menu']")) return;
      if (hasUnsavedText(el) || keep?.()) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [ref, onClose, keep]);
}

/**
 * A click on a native modal's backdrop closes it. The backdrop is part of the <dialog> element for
 * events, so a click whose point falls outside the dialog's box is a backdrop click. `keep` returns
 * true to hold it open (unsaved input, or a signature in flight).
 */
export function backdropClose(onClose: () => void, keep?: () => boolean) {
  return (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside || hasUnsavedText(e.currentTarget) || keep?.()) return;
    onClose();
  };
}

/**
 * Typed text not yet sent: a non-empty textarea, or a field marked data-guard (a name being typed).
 * Fields the app fills in for the person (defaults, data-prefilled) do not count.
 */
export function hasUnsavedText(root: HTMLElement): boolean {
  return [...root.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("textarea, input[data-guard]")].some(
    (x) => !x.disabled && !x.hasAttribute("data-prefilled") && x.value.trim() !== "",
  );
}
