const KEY = "cr.run-workspace";

export type RecentRun = { packageId: string; runId: string; scroll?: number; anchorSeq?: number | undefined; outputIndex?: number };
type Preferences = { viewer: string; runs: RecentRun[] };

function read(viewer: string): RecentRun[] {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null");
    if (typeof stored !== "object" || stored === null || !("viewer" in stored) || stored.viewer !== viewer ||
      !("runs" in stored) || !Array.isArray(stored.runs)) return [];
    return stored.runs.filter((run): run is RecentRun =>
      typeof run?.packageId === "string" && run.packageId.length > 0 &&
      typeof run?.runId === "string" && run.runId.length > 0,
    );
  } catch {
    return [];
  }
}

export function recentRuns(viewer: string | undefined): RecentRun[] {
  return viewer?.startsWith("signed-in:") ? read(viewer) : [];
}

export function rememberRun(viewer: string | undefined, packageId: string, runId: string, view?: Pick<RecentRun, "scroll" | "anchorSeq" | "outputIndex">) {
  if (!viewer?.startsWith("signed-in:")) return;
  const runs = read(viewer);
  const existing = runs.find((run) => run.packageId === packageId && run.runId === runId);
  const next: Preferences = {
    viewer,
    runs: [
      { ...existing, packageId, runId, ...view },
      ...runs.filter((run) => run.packageId !== packageId || run.runId !== runId),
    ].slice(0, 5),
  };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Preferences are optional, including when browser storage is unavailable.
  }
}

export function clearRunPreferences() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // The current viewer is still required to read preferences.
  }
}
