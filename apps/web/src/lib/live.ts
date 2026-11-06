import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { CrEvent } from "../api/types.js";
export const LIVE_GAP_EVENT = "cr:live-gap";

/**
 * What the page knows about the event stream. "connecting" is before the first open: nothing is claimed
 * either way. "unknown" means the stream dropped and has not come
 * back, so nothing on screen can be called current; `unknownSince` is when it dropped. `generation`
 * changes when someone asks to reconnect, which opens a fresh stream.
 */
export type LiveStatus = { status: "connecting" | "live" | "unknown"; unknownSince?: string; generation: number };

let liveState: LiveStatus = { status: "connecting", generation: 0 };
const liveListeners = new Set<() => void>();

/**
 * The id of the last frame the stream gave (an event, the opening checkpoint or a loss frame), so a
 * reconnect resumes after it with ?after= instead of starting at the head and skipping the outage.
 */
let lastEventId: string | undefined;

/** The reads the board's work rests on; after a drop the stream reads live again only once these succeed. */
const REQUIRED_READS: readonly string[] = ["packages", "office"];

/** A stream that sends nothing for this long is treated as dropped. The server sends a heartbeat about every 15 s. */
export const STALL_MS = 45_000;

/** Back to the state before any stream has opened. Called by tests and by the identity transition (lib/session.ts), so signing out or in as someone else starts clean. */
export function resetLiveStatus() {
  lastEventId = undefined;
  setLive({ status: "connecting", generation: 0 });
}
function setLive(next: LiveStatus) {
  liveState = next;
  for (const fn of liveListeners) fn();
}
function markUnknown() {
  if (liveState.status === "unknown") return;
  setLive({ ...liveState, status: "unknown", unknownSince: new Date().toISOString() });
}
function markLive() {
  if (liveState.status === "live") return;
  setLive({ status: "live", generation: liveState.generation });
}
function subscribeLive(fn: () => void) {
  liveListeners.add(fn);
  return () => void liveListeners.delete(fn);
}
const readLive = () => liveState;

/** The stream state for screens that must not present stale state as current, and a way to reconnect. */
export function useLiveStatus(): { status: "connecting" | "live" | "unknown"; unknownSince?: string; reconnect: () => void } {
  const st = useSyncExternalStore(subscribeLive, readLive, readLive);
  const reconnect = useCallback(() => setLive({ ...liveState, generation: liveState.generation + 1 }), []);
  return { status: st.status, ...(st.unknownSince ? { unknownSince: st.unknownSince } : {}), reconnect };
}

/**
 * Subscribes to the event stream and refreshes whatever the new event touches. Batches bursts
 * so a busy run does not redraw the screen on every log line.
 */
export function useLiveEvents(enabled: boolean): void {
  const qc = useQueryClient();
  const generation = useSyncExternalStore(subscribeLive, readLive, readLive).generation;
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const source = new EventSource(api.streamUrl(lastEventId));
    const subjects = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stall: ReturnType<typeof setTimeout> | undefined;
    let recovering = false;
    let closed = false;
    let epoch = 0;

    // Any frame means the stream is alive. A frame that ends a drop also refreshes everything on
    // screen: replay covers missed events, but a reconnect that could not resume (or a native retry
    // that started at the head) must not leave the outage's changes unseen.
    // A stream that never opens, or goes quiet, is closed and read as unknown; Reconnect opens another.
    const armStall = () => {
      if (stall !== undefined) clearTimeout(stall);
      stall = setTimeout(() => {
        stall = undefined;
        epoch++;
        markUnknown();
        window.dispatchEvent(new Event(LIVE_GAP_EVENT));
        source.close();
      }, STALL_MS);
    };
    armStall();
    // After a drop the stream stays unknown until everything on screen has been read again and the
    // reads the work rests on (REQUIRED_READS) succeeded. A failed refresh leaves it unknown, with the
    // Reconnect control still offered; a drop during the refresh starts over.
    const recover = async () => {
      recovering = true;
      const mine = epoch;
      try {
        await qc.invalidateQueries();
      } finally {
        recovering = false;
      }
      if (closed || mine !== epoch) return;
      const failed = qc
        .getQueryCache()
        .findAll({ type: "active" })
        .some((q) => REQUIRED_READS.includes(String(q.queryKey[0])) && q.state.status === "error");
      if (!failed) markLive();
    };
    const alive = (msg?: { lastEventId?: string }) => {
      if (msg?.lastEventId) lastEventId = msg.lastEventId;
      armStall();
      if (liveState.status !== "unknown") return markLive();
      if (!recovering) void recover();
    };

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
        "roster",
        "usage",
        "run-events",
        "office-figures",
        "scrams",
        "scram",
        "person-verifications",
        "records-head",
        "scram-preview",
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    };

    const onMessage = (msg: MessageEvent<string>) => {
      alive(msg);
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

    // The browser's own retry sends the last event id, and a Reconnect opens a new stream with
    // ?after= the last id seen; either way the stream replays what was missed. The stream opens with
    // a checkpoint frame carrying the head id, so a reconnect before any event still resumes from a
    // known place. A loss frame (replay impossible) refreshes everything, as does the first frame
    // after a drop.
    const onLoss = (msg: MessageEvent<string>) => {
      alive(msg);
      window.dispatchEvent(new Event(LIVE_GAP_EVENT));
      void qc.invalidateQueries();
    };
    const onError = () => {
      epoch++;
      if (stall !== undefined) clearTimeout(stall);
      stall = undefined;
      markUnknown();
      window.dispatchEvent(new Event(LIVE_GAP_EVENT));
    };
    const onFrame = (msg: MessageEvent<string>) => alive(msg);
    source.addEventListener("open", () => alive());
    source.addEventListener("checkpoint", onFrame as EventListener);
    source.addEventListener("heartbeat", onFrame as EventListener);
    source.addEventListener("loss", onLoss as EventListener);
    source.addEventListener("error", onError);
    source.addEventListener("message", onMessage);
    source.addEventListener("event", onMessage as EventListener);
    return () => {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      if (stall !== undefined) clearTimeout(stall);
      source.close();
    };
  }, [enabled, qc, generation]);
}

/** True while the tab is visible, so animations and polling can rest when it is not. */
export function isVisible(): boolean {
  return (
    typeof document === "undefined" || document.visibilityState !== "hidden"
  );
}
