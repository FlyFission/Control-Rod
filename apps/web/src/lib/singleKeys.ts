import { readString, writeString } from "./storage.js";

/**
 * Single-character shortcuts (C, J, K, N, ?) can be turned off on this browser, so a stray key or
 * speech input never moves focus or opens a dialog (WCAG 2.2, 2.1.4 Character Key Shortcuts).
 * On by default; Ctrl/Cmd K and Escape are not single-character shortcuts and always work.
 *
 * The choice is kept in this page as well as in browser storage, so turning them off works for this
 * tab even when storage refuses the write (a private window, blocked site data).
 */
const KEY = "cr.single-key-shortcuts";
export const SINGLE_KEYS_EVENT = "cr:single-keys";

let inPage: boolean | undefined;

// A choice made in another tab of this browser wins over this page's copy, so turning shortcuts off
// anywhere turns them off everywhere without a reload.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    inPage = e.key === null ? undefined : e.newValue !== "off";
    window.dispatchEvent(new Event(SINGLE_KEYS_EVENT));
  });
}

export function singleKeysOn(): boolean {
  if (inPage !== undefined) return inPage;
  return readString(KEY) !== "off";
}

export function setSingleKeys(on: boolean): void {
  inPage = on;
  writeString(KEY, on ? "on" : "off");
  window.dispatchEvent(new Event(SINGLE_KEYS_EVENT));
}

/** Tests only: forget the in-page choice. */
export function resetSingleKeysForTest(): void {
  inPage = undefined;
}

/** Any open modal, native or ARIA, that single-key shortcuts must not open things behind. */
export const OPEN_MODAL = 'dialog[open], .palette, [role="dialog"][aria-modal="true"]';
