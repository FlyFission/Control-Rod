import type { Page } from "@playwright/test";
import { showcaseInput } from "../src/features/floor/showcase-data.js";
export async function mockFloorApi(page: Page) {
  const fixture = showcaseInput();
  let offline = false;
  const mutations: string[] = [];
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
  };
}
