import type { AttentionItem } from "../api/types.js";

/**
 * Attention signals (pattern AW1 to AW3, docs/patterns/agent-workbenches.md): the tab title count and
 * the opt-in browser notification. Both read only the viewer's own Inbox items (OV-01), and both say
 * only what a successful read of those records says; neither claims an outcome.
 */

/** One word per kind, shared by the Inbox list and notifications. */
export const ATTENTION_LABEL: Record<AttentionItem["kind"], string> = {
  scram: "SCRAM",
  confirm: "Confirm requirements",
  permission: "Waiting agent",
  lost: "Lost run",
  dispute: "Dispute",
  accept: "Accept",
  release: "Release",
};

/** The identity of one waiting item: the same thing on a new revision is a new item. */
export const attentionKey = (i: AttentionItem): string =>
  `${i.kind}-${i.package_id ?? i.scram_id ?? i.capture_id}-${i.package_revision ?? ""}`;

/** The tab title: a count in front only when it is known and above zero. */
export function titleWithCount(base: string, count: number | undefined): string {
  return count !== undefined && count > 0 ? `(${count}) ${base}` : base;
}

/** Items in `items` not present in the earlier read. */
export function newArrivals(before: ReadonlySet<string>, items: readonly AttentionItem[]): AttentionItem[] {
  return items.filter((i) => !before.has(attentionKey(i)));
}

/** What a notification says: the record's own title for one item, a count for several. */
export function notificationText(arrived: readonly AttentionItem[]): { title: string; body: string } | null {
  const first = arrived[0];
  if (first === undefined) return null;
  if (arrived.length === 1) return { title: `Needs you: ${ATTENTION_LABEL[first.kind]}`, body: first.title };
  return { title: `${arrived.length} new items need you`, body: arrived.map((i) => i.title).slice(0, 3).join("\n") };
}

/** Notifications are each person's own choice on this browser, off until they turn them on. */
export const notifyKey = (user: string | undefined) => `cr.notify:${user ?? ""}`;

export function readNotifyChoice(user: string | undefined): boolean {
  try {
    return window.localStorage.getItem(notifyKey(user)) === "on";
  } catch {
    return false;
  }
}

export function writeNotifyChoice(user: string | undefined, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(notifyKey(user), "on");
    else window.localStorage.removeItem(notifyKey(user));
  } catch {
    // Ignored: private windows and blocked storage.
  }
  window.dispatchEvent(new Event(NOTIFY_CHOICE_EVENT));
}

/** Fired on this window when a notify choice changes, so the shell picks it up without a reload. */
export const NOTIFY_CHOICE_EVENT = "cr:notify-choice";

export type NotifySupport = "unsupported" | "default" | "granted" | "denied";

export function notifySupport(): NotifySupport {
  if (typeof window === "undefined" || typeof window.Notification === "undefined") return "unsupported";
  return window.Notification.permission;
}
