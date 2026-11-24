import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { RuntimeStatus } from "../api/types.js";

/**
 * Whether a run daemon is answering, from what the control plane already records: the daemon reports
 * its runtimes with every claim (`GET /runtimes` `reported_at`), and it claims every few seconds while
 * it has a free slot. Found by the live break and persona passes: with no daemon, or one that died,
 * the board gave no sign that nothing could run.
 */
export type DaemonPresence =
  | { state: "ok" }
  | { state: "unknown" }
  | { state: "never" }
  | { state: "silent"; since: string }
  | { state: "no-agent"; reasons: string[] };

/** A daemon with a free slot claims every 2 s (daemon PollInterval); this long without a report means it is gone. */
export const SILENT_AFTER_MS = 20_000;
/** `pnpm cr start` runs three at once; while that many run, a healthy daemon stops claiming. */
const DEFAULT_PARALLEL = 3;

export function daemonPresence(
  report: { reported_at?: string; runtimes: RuntimeStatus[] } | undefined,
  running: number,
  now: number,
): DaemonPresence {
  if (report === undefined) return { state: "unknown" };
  if (!report.reported_at) return { state: "never" };
  const age = now - Date.parse(report.reported_at);
  if (age > SILENT_AFTER_MS && running < DEFAULT_PARALLEL) return { state: "silent", since: report.reported_at };
  const agents = report.runtimes.filter((r) => r.runtime !== "fake");
  if (!report.runtimes.some((r) => r.ready)) {
    return { state: "no-agent", reasons: agents.map((r) => `${r.runtime}: ${r.reason ?? "not ready"}`) };
  }
  return { state: "ok" };
}

/** Reads `/runtimes` every 5 s and says whether work can run. `running` is how many runs are running now. */
export function useDaemonPresence(running: number): DaemonPresence {
  const q = useQuery({ queryKey: ["runtimes"], queryFn: () => api.runtimes(), refetchInterval: 5_000 });
  // A report that stops changing is the signal, and an unchanged answer does not re-render, so tick.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  return daemonPresence(q.data, running, now);
}
