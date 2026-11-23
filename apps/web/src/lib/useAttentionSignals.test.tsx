import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { AttentionItem, InboxView } from "../api/types.js";
import { writeNotifyChoice } from "./attention.js";
import { attentionItem as item } from "../test/fixtures.js";
import { type InboxRead, useAttentionSignals } from "./useAttentionSignals.js";

/** A stand-in for the browser's Notification that records what was shown. */
class FakeNotification {
  static permission: NotificationPermission = "granted";
  static shown: { title: string; body?: string; tag?: string }[] = [];
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(title: string, opts?: NotificationOptions) {
    FakeNotification.shown.push({ title, ...(opts?.body !== undefined ? { body: opts.body } : {}), ...(opts?.tag !== undefined ? { tag: opts.tag } : {}) });
    last = this;
  }
}
let last: FakeNotification | undefined;

let hidden = true;
const view = (items: AttentionItem[]): InboxView => ({ items, waiting_on_others: [], digest: { head: 0, lines: [] } });
let at = 1;
const ok = (items: AttentionItem[]): InboxRead => ({ data: view(items), isSuccess: true, isError: false, dataUpdatedAt: at++ });
const failed = (items: AttentionItem[]): InboxRead => ({ data: view(items), isSuccess: false, isError: true, dataUpdatedAt: at });

beforeEach(() => {
  document.title = "Control Rod";
  FakeNotification.shown = [];
  FakeNotification.permission = "granted";
  last = undefined;
  hidden = true;
  vi.stubGlobal("Notification", FakeNotification);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => (hidden ? "hidden" : "visible"));
  writeNotifyChoice("ben", true);
  vi.spyOn(window, "focus").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function mount(user: string, first: InboxRead, open = vi.fn()) {
  const r = renderHook(({ u, read }: { u: string; read: InboxRead }) => useAttentionSignals(u, read, open), {
    initialProps: { u: user, read: first },
  });
  return { ...r, open };
}

describe("tab title", () => {
  it("shows the count after a successful read and drops it after a failed refresh", () => {
    const { rerender } = mount("ben", ok([item(), item({ package_id: "WP-2" })]));
    expect(document.title).toBe("(2) Control Rod");
    rerender({ u: "ben", read: failed([item(), item({ package_id: "WP-2" })]) });
    expect(document.title).toBe("Control Rod");
  });

  it("puts the plain title back when the shell goes away", () => {
    const { unmount } = mount("ben", ok([item()]));
    expect(document.title).toBe("(1) Control Rod");
    unmount();
    expect(document.title).toBe("Control Rod");
  });
});

describe("notifications", () => {
  it("never notifies about what was already waiting when the app opened", () => {
    mount("ben", ok([item()]));
    expect(FakeNotification.shown).toEqual([]);
  });

  it("notifies once, without the record's title, when a new item arrives while the tab is hidden", () => {
    const { rerender, open } = mount("ben", ok([item()]));
    rerender({ u: "ben", read: ok([item(), item({ kind: "dispute", package_id: "WP-7", title: "Pre-check disputes WP-7" })]) });
    expect(FakeNotification.shown).toEqual([{ title: "Needs you: Dispute", body: "Open Control Rod to see it.", tag: "cr-inbox" }]);
    last!.onclick!();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("closes its notification when the person changes or the shell goes away (sign-out)", () => {
    const { rerender, unmount } = mount("ben", ok([]));
    rerender({ u: "ben", read: ok([item()]) });
    const first = last!;
    writeNotifyChoice("dora", true);
    rerender({ u: "dora", read: ok([]) });
    expect(first.close).toHaveBeenCalled();
    rerender({ u: "dora", read: ok([item({ package_id: "WP-9" })]) });
    const second = last!;
    expect(second).not.toBe(first);
    unmount();
    expect(second.close).toHaveBeenCalled();
  });

  it("stays quiet while the tab is in view", () => {
    hidden = false;
    const { rerender } = mount("ben", ok([]));
    rerender({ u: "ben", read: ok([item()]) });
    expect(FakeNotification.shown).toEqual([]);
  });

  it("stays quiet for a person who has not turned notifications on, or when the browser refused", () => {
    const { rerender } = mount("dora", ok([]));
    rerender({ u: "dora", read: ok([item()]) });
    FakeNotification.permission = "denied";
    const ben = mount("ben", ok([]));
    ben.rerender({ u: "ben", read: ok([item()]) });
    expect(FakeNotification.shown).toEqual([]);
  });

  it("does not count a failed read, and never carries one person's list over to the next", () => {
    const { rerender } = mount("ben", ok([]));
    rerender({ u: "ben", read: failed([item()]) });
    expect(FakeNotification.shown).toEqual([]);
    // Dora signs in on the same tab: her first read is her own baseline.
    writeNotifyChoice("dora", true);
    rerender({ u: "dora", read: ok([item({ package_id: "WP-9" })]) });
    expect(FakeNotification.shown).toEqual([]);
  });
});
