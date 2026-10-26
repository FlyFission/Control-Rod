import type { Page } from "@playwright/test";
import { showcaseInput } from "../src/features/floor/showcase-data.js";
export async function mockFloorApi(
  page: Page,
  options: { finishOnReconnect?: boolean } = {},
) {
  const fixture = showcaseInput();
  let offline = false;
  const mutations: string[] = [];
  if (options.finishOnReconnect)
    await page.addInitScript(() => {
      class DemoSource {
        listeners = new Map<string, ((e: Event) => void)[]>();
        constructor() {
          (window as unknown as { themeStream: DemoSource }).themeStream = this;
          queueMicrotask(() => this.emit("open"));
        }
        addEventListener(type: string, fn: (e: Event) => void) {
          this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
        }
        emit(type: string) {
          for (const fn of this.listeners.get(type) ?? []) fn(new Event(type));
        }
        close() {}
      }
      Object.defineProperty(window, "EventSource", {
        value: DemoSource,
        configurable: true,
      });
    });
  await page.route("**/auth/session", (r) =>
    r.fulfill({
      json: { registered: true, signed_in: true, user: "Preview owner" },
    }),
  );
  await page.route("**/events/stream", (r) =>
    r.fulfill({ contentType: "text/event-stream", body: ": connected\n\n" }),
  );
  await page.route("**/office", (r) =>
    offline
      ? r.fulfill({ status: 503, json: { code: "offline" } })
      : r.fulfill({ json: fixture.office }),
  );
  await page.route("**/packages**", (r) => {
    if (r.request().method() !== "GET") {
      mutations.push(r.request().method());
      return r.abort();
    }
    if (offline) return r.fulfill({ status: 503, json: { code: "offline" } });
    const id = new URL(r.request().url()).pathname.split("/")[2];
    return r.fulfill({ json: id ? fixture.views.get(id) : fixture.packages });
  });
  return {
    setOffline: (value: boolean) => {
      offline = value;
    },
    mutations,
    finishAuthor: () => {
      fixture.views.get("WP-101")!.runs[0]!.status = "succeeded";
    },
  };
}
