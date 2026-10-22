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
