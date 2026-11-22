import { useEffect, useRef } from "react";
import type { InboxView } from "../api/types.js";
import { attentionKey, newArrivals, notificationText, notifySupport, readNotifyChoice, titleWithCount } from "./attention.js";

/** The parts of the shell's Inbox read the signals use. */
export type InboxRead = { data: InboxView | undefined; isSuccess: boolean; isError: boolean; dataUpdatedAt: number };

const COUNT_PREFIX = /^\(\d+\)\s+/;

/**
 * Keeps the tab title's count in step with what waits on the viewer, and, when they turned it on,
 * shows one browser notification for items that arrive while the tab is hidden (pattern AW1, AW2).
 *
 * The count shows only after a successful read; after a failed refresh the title drops it rather
 * than show a number that may be stale. The first successful read for a person is the baseline, so
 * opening the app never notifies about work that was already waiting.
 */
export function useAttentionSignals(user: string | undefined, inbox: InboxRead, onOpenInbox: () => void): void {
  const base = useRef<string | null>(null);
  const seen = useRef<{ user: string | undefined; keys: Set<string> } | null>(null);
  const open = useRef(onOpenInbox);
  open.current = onOpenInbox;

  if (base.current === null && typeof document !== "undefined") base.current = document.title.replace(COUNT_PREFIX, "");

  const fresh = inbox.isSuccess && !inbox.isError && inbox.data !== undefined;
  const count = fresh ? inbox.data!.items.length : undefined;

  useEffect(() => {
    document.title = titleWithCount(base.current ?? "", count);
  }, [count]);

  useEffect(
    () => () => {
      if (base.current !== null) document.title = base.current;
    },
    [],
  );

  useEffect(() => {
    if (!fresh) return;
    const items = inbox.data!.items;
    const keys = new Set(items.map(attentionKey));
    const before = seen.current;
    seen.current = { user, keys };
    if (before === null || before.user !== user) return;
    const arrived = newArrivals(before.keys, items);
    if (arrived.length === 0) return;
    if (!readNotifyChoice(user) || notifySupport() !== "granted") return;
    if (document.visibilityState !== "hidden") return;
    const text = notificationText(arrived);
    if (text === null) return;
    try {
      const n = new window.Notification(text.title, { body: text.body, tag: "cr-inbox" });
      n.onclick = () => {
        window.focus();
        open.current();
        n.close();
      };
    } catch {
      // Some browsers only allow notifications from a service worker; the title count still shows.
    }
    // dataUpdatedAt marks each successful read, so every new read is compared with the one before.
  }, [fresh, inbox.dataUpdatedAt, user]);
}
