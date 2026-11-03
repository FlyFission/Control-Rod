import { useState, useEffect, useCallback } from "react";
import type { FloorPreferencesV1 } from "./types.js";
import {
  readFloorPreferences,
  writeFloorPreferences,
  parseFloorPreferences,
  PREFERENCES_KEY,
  isFloorPreferenceRecord,
} from "./preferences.js";
export function useFloorPreferences() {
  const [preferences, setPreferences] = useState(readFloorPreferences);
  const [externalDecision, setExternalDecision] = useState(0);
  const update = useCallback(
    (patch: Partial<Omit<FloorPreferencesV1, "schemaVersion">>) =>
      setPreferences((prev) => {
        const next = parseFloorPreferences(
          JSON.stringify({ ...prev, ...patch }),
        );
        writeFloorPreferences(next);
        return next;
      }),
    [],
  );
  useEffect(() => {
    const change = (e: StorageEvent) => {
      if (e.key !== PREFERENCES_KEY || e.newValue === null) return;
      try {
        if (!isFloorPreferenceRecord(JSON.parse(e.newValue))) return;
      } catch {
        return;
      }
      setPreferences(parseFloorPreferences(e.newValue));
      setExternalDecision((n) => n + 1);
    };
    window.addEventListener("storage", change);
    return () => window.removeEventListener("storage", change);
  }, []);
  return { preferences, update, externalDecision };
}
