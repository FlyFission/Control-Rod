import { useSyncExternalStore } from "react";
import type { WorkPackage } from "../api/types.js";
import { readString, writeString } from "./storage.js";

/** What a card is made of. Inferred from deliverables; no contract field. */
export type Kind = "code" | "doc";

/** Deliverable types that mean code. Everything else is a document. Grow here, not in the contract. */
export const CODE_DELIVERABLE_TYPES: readonly string[] = ["code", "patch", "pull-request", "change"];

/** One or both kinds, code first, never empty. A package with no deliverables reads as a document. */
export function kindsOf(pkg: WorkPackage): Kind[] {
  const types = pkg.deliverables.map((d) => d.type.trim().toLowerCase());
  const kinds: Kind[] = [];
  if (types.some((t) => CODE_DELIVERABLE_TYPES.includes(t))) kinds.push("code");
  if (types.length === 0 || types.some((t) => !CODE_DELIVERABLE_TYPES.includes(t))) kinds.push("doc");
  return kinds;
}

/** The looks in force: a, the dark control room. Warm paper (b) and bright (c) are retired. To add one, extend this list and tokens.css. */
export const LOOKS = ["a"] as const;
export type Look = (typeof LOOKS)[number];

const LOOK_KEY = "cr.look";

export function loadLook(): Look {
  const v = readString(LOOK_KEY);
  return LOOKS.find((l) => l === v) ?? "a";
}

const lookListeners = new Set<() => void>();

/** Keeps the viewer's look and tells every screen that shows it. */
export function saveLook(look: Look): void {
  // A look that is not in force (a retired one a caller still names) is never stored.
  if (!LOOKS.includes(look)) return;
  writeString(LOOK_KEY, look);
  for (const fn of lookListeners) fn();
}

/**
 * The viewer's look, kept in browser storage. In M1 only the board container carries it (data-look on
 * the board root); the rest of the app stays look A until its styles use the tokens throughout.
 */
export function useLook(): Look {
  return useSyncExternalStore(
    (fn) => {
      lookListeners.add(fn);
      return () => void lookListeners.delete(fn);
    },
    loadLook,
    () => "a" as Look,
  );
}
