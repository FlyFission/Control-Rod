import type { AttentionItem } from "../api/types.js";

/**
 * Attention signals (AW1 to AW3, .nuclear/changes/board-attention): the tab title count and
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
  // Every id the item carries is part of it, so two captures held by one SCRAM are two items.
  `${i.kind}-${i.package_id ?? ""}-${i.scram_id ?? ""}-${i.capture_id ?? ""}-${i.package_revision ?? ""}${RUN_KINDS.has(i.kind) ? `-${i.since}` : ""}`;

// Kinds that stand for one run (or one check of it): a requeued run that ends the same way again on
// the same revision is a new item. The Inbox item carries no run id, so the time it began is the
// run's identity here.
const RUN_KINDS: ReadonlySet<string> = new Set(["lost", "dispute"]);

/** The tab title: a count in front only when it is known and above zero. */
export function titleWithCount(base: string, count: number | undefined): string {
  return count !== undefined && count > 0 ? `(${count}) ${base}` : base;
}

/** Items in `items` not present in the earlier read. */
export function newArrivals(before: ReadonlySet<string>, items: readonly AttentionItem[]): AttentionItem[] {
  return items.filter((i) => !before.has(attentionKey(i)));
}

/**
 * What a notification says: the kind and a count, never the record's own title or reason. A desktop
 * notification can stay on screen, or in the system's notification list, after the person signs out
 * or walks away from a shared machine, so it carries nothing the Inbox would only show after sign-in.
 */
export function notificationText(arrived: readonly AttentionItem[]): { title: string; body: string } | null {
  const first = arrived[0];
  if (first === undefined) return null;
  const body = "Open Control Rod to see it.";
  if (arrived.length === 1) return { title: `Needs you: ${ATTENTION_LABEL[first.kind]}`, body };
  return { title: `${arrived.length} new items need you`, body: "Open Control Rod to see them." };
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

export interface ControlRodDesktopBridge {
  readonly isDesktop: true;
  notify?: (input: { title: string; body: string; route?: string }) => Promise<boolean>;
  closeNotification?: () => Promise<void>;
  onOpenInbox?: (listener: (route: string) => void) => () => void;
}

export function desktopBridge(): ControlRodDesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as Window & { controlrodDesktop?: ControlRodDesktopBridge }).controlrodDesktop;
  return candidate?.isDesktop ? candidate : undefined;
}

export function notifySupport(): NotifySupport {
  if (desktopBridge()?.notify) return "granted";
  if (typeof window === "undefined" || typeof window.Notification === "undefined") return "unsupported";
  return window.Notification.permission;
}
