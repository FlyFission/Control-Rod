// Native OS notification bridge for "a card needs you" arrivals.
// Replaces any prior inbox notification so rapid arrivals never flood Notification Center, and
// focuses the Control Rod window on click.

export interface DesktopNotificationPayload {
  title: string;
  body: string;
  route?: string;
}

export interface NativeNotificationHandle {
  show(): void;
  close(): void;
  on(event: "click", listener: () => void): void;
}

export interface NotificationFactory {
  isSupported(): boolean;
  create(options: { title: string; body: string; silent?: boolean }): NativeNotificationHandle;
}

export class DesktopNotifier {
  private active: NativeNotificationHandle | null = null;
  private readonly factory: NotificationFactory;
  private readonly onActivate: (route: string) => void;

  constructor(factory: NotificationFactory, onActivate: (route: string) => void) {
    this.factory = factory;
    this.onActivate = onActivate;
  }

  notify(payload: DesktopNotificationPayload): boolean {
    if (!this.factory.isSupported()) return false;
    const title = payload.title.trim();
    const body = payload.body.trim();
    if (!title) return false;

    this.close();
    const route = payload.route && payload.route.startsWith("/") ? payload.route : "/inbox";
    const handle = this.factory.create({ title, body });
    this.active = handle;
    handle.on("click", () => {
      this.onActivate(route);
      this.close();
    });
    handle.show();
    return true;
  }

  close(): void {
    if (!this.active) return;
    try {
      this.active.close();
    } catch {
      // Ignore OS notification close errors.
    }
    this.active = null;
  }
}
