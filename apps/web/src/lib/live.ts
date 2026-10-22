import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { CrEvent } from "../api/types.js";

/**
 * Subscribes to the event stream and refreshes whatever the new event touches. Batches bursts
 * so a busy run does not redraw the screen on every log line.
 */
export function useLiveEvents(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const source = new EventSource(api.streamUrl());
    const subjects = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      for (const s of subjects) void qc.invalidateQueries({ queryKey: ["package", s] });
      subjects.clear();
      for (const key of ["packages", "office", "metrics", "events", "captures", "views"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    };

    const onMessage = (msg: MessageEvent<string>) => {
      try {
        const ev = JSON.parse(msg.data) as CrEvent;
        if (typeof ev.subject === "string") subjects.add(ev.subject.split("/")[0] ?? ev.subject);
      } catch {
        // A message that is not an event still means something changed.
      }
      if (timer === undefined) timer = setTimeout(flush, 300);
    };

    source.addEventListener("message", onMessage);
    source.addEventListener("event", onMessage as EventListener);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      source.close();
    };
  }, [enabled, qc]);
}

/** True while the tab is visible, so animations and polling can rest when it is not. */
export function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}
