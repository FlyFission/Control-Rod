import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { CrEvent } from "../api/types.js";
export const LIVE_GAP_EVENT = "cr:live-gap";

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
      for (const s of subjects) {
        void qc.invalidateQueries({ queryKey: ["package", s] });
        // Preparation is edited and confirmed on its own key; nothing else refreshes it.
        void qc.invalidateQueries({ queryKey: ["preparation", s] });
      }
      subjects.clear();
      for (const key of [
        "packages",
        "office",
        "inbox",
        "metrics",
        "events",
        "captures",
        "views",
        // What the viewer may do changes with decisions, qualifications and pins.
        "actions",
        "admin",
        "runtimes",
        "run-events",
        "office-figures",
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    };

    const onMessage = (msg: MessageEvent<string>) => {
      try {
        const ev = JSON.parse(msg.data) as CrEvent;
        if (typeof ev.subject === "string")
          subjects.add(ev.subject.split("/")[0] ?? ev.subject);
        // Run events name the run as their subject and carry the package in their data.
        const pkg = (ev.data as { package?: unknown } | undefined)?.package;
        if (typeof pkg === "string") subjects.add(pkg);
      } catch {
        // A message that is not an event still means something changed.
      }
      if (timer === undefined) timer = setTimeout(flush, 300);
    };

    // The browser reconnects with the last event id and the stream replays what was missed. The
    // stream opens with a checkpoint frame carrying the head id, so a reconnect before any event
    // still resumes from a known place. Only when replay is impossible (a loss frame) is everything
    // refreshed.
    const onLoss = () => {
      window.dispatchEvent(new Event(LIVE_GAP_EVENT));
      void qc.invalidateQueries();
    };
    const onError = () => window.dispatchEvent(new Event(LIVE_GAP_EVENT));
    source.addEventListener("loss", onLoss);
    source.addEventListener("error", onError);
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
  return (
    typeof document === "undefined" || document.visibilityState !== "hidden"
  );
}
