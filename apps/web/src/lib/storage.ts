// Per-viewer conveniences only. Storage can be missing or throw; the app works without it.

export function readNumber(key: string): number | undefined {
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

export function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignored: private windows and blocked storage.
  }
}

export const LAST_SEEN_KEY = "cr.lastSeenSeq";

/** The "since you last looked" cursor is each person's own, even on a shared browser. */
export const lastSeenKey = (user: string | undefined) => `${LAST_SEEN_KEY}:${user ?? ""}`;

/** A remembered string for this browser session (filters, open tabs), or the fallback. */
export function readSession(key: string, fallback = ""): string {
  try {
    return window.sessionStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignored: private windows and blocked storage.
  }
}

/** A remembered string that outlasts the session (a per-viewer preference), or undefined. */
export function readString(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignored: private windows and blocked storage.
  }
}
