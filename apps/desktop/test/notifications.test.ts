import { describe, expect, it, vi } from "vitest";
import { DesktopNotifier, type NativeNotificationHandle, type NotificationFactory } from "../src/main/notifications.js";

function makeFakeFactory(supported = true) {
  const created: Array<{
    options: { title: string; body: string; silent?: boolean };
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    click: () => void;
  }> = [];

  const factory: NotificationFactory = {
    isSupported: () => supported,
    create: (options) => {
      let onClick: (() => void) | undefined;
      const show = vi.fn();
      const close = vi.fn();
      const handle: NativeNotificationHandle = {
        show,
        close,
        on: (_event, listener) => {
          onClick = listener;
        },
      };
      created.push({
        options,
        show,
        close,
        click: () => onClick?.(),
      });
      return handle;
    },
  };

  return { factory, created };
}

describe("DesktopNotifier", () => {
  it("shows a native notification, replaces an older one, and focuses /inbox on click", () => {
    const { factory, created } = makeFakeFactory(true);
    const onActivate = vi.fn();
    const notifier = new DesktopNotifier(factory, onActivate);

    expect(notifier.notify({ title: "Needs you: Accept", body: "Open Control Rod to see it.", route: "/inbox" })).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]!.show).toHaveBeenCalledOnce();

    // A second arrival closes the first notification before showing the replacement.
    expect(notifier.notify({ title: "2 new items need you", body: "Open Control Rod to see them." })).toBe(true);
    expect(created).toHaveLength(2);
    expect(created[0]!.close).toHaveBeenCalledOnce();
    expect(created[1]!.show).toHaveBeenCalledOnce();

    // Clicking the notification activates the window on /inbox and closes the notification.
    created[1]!.click();
    expect(onActivate).toHaveBeenCalledWith("/inbox");
    expect(created[1]!.close).toHaveBeenCalledOnce();
  });

  it("returns false when native notifications are unsupported", () => {
    const { factory, created } = makeFakeFactory(false);
    const notifier = new DesktopNotifier(factory, vi.fn());
    expect(notifier.notify({ title: "Needs you: Accept", body: "Open Control Rod to see it." })).toBe(false);
    expect(created).toHaveLength(0);
  });
});
