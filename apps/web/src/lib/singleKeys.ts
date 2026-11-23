import { readString, writeString } from "./storage.js";

/**
 * Single-character shortcuts (C, J, K, N, ?) can be turned off on this browser, so a stray key or
 * speech input never moves focus or opens a dialog (WCAG 2.2, 2.1.4 Character Key Shortcuts).
 * On by default; Ctrl/Cmd K and Escape are not single-character shortcuts and always work.
 */
const KEY = "cr.single-key-shortcuts";
export const SINGLE_KEYS_EVENT = "cr:single-keys";

export function singleKeysOn(): boolean {
  return readString(KEY) !== "off";
}

export function setSingleKeys(on: boolean): void {
  writeString(KEY, on ? "on" : "off");
  window.dispatchEvent(new Event(SINGLE_KEYS_EVENT));
}
