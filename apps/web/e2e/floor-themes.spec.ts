import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockFloorApi } from "./floor-fixtures.js";
test.skip(process.env.THEME_TEST_LEGACY === "true", "Dedicated legacy rollback run");

test("all fifteen worlds switch without changing work and reduced motion stays still", async ({
  page,
}) => {
  const external: string[] = [],
    mutations: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).hostname !== "127.0.0.1") external.push(r.url());
    if (!["GET", "HEAD"].includes(r.method())) mutations.push(r.method());
  });
  await page.goto("/themes.html");
  await expect(
    page.getByText(
      "Preview — sample activity. This is a demonstration, not live work.",
    ),
  ).toBeVisible();
  for (const name of [
    "Creature Dispatch",
    "Pocket Lab",
    "Midnight Bureau",
    "Confectionery Works",
    "Lanternwood Guild",
    "Corner Café",
    "Tumbletown Workshop",
    "Orbital Shipyard",
    "Wildlight Research Camp",
    "Voxel Foundry",
    "Cloudspring Bathhouse",
    "Button & Spool",
    "Clockwork Observatory",
    "Coral Commons",
    "Meadow Post",
  ]) {
    await page
      .getByRole("button", { name: /Theme Plain Floor|Theme / })
      .first()
      .click();
    await page
      .getByRole("button", { name: `Use ${name} theme`, exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: `${name} activity scene` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /WP-103.*Pre-checking/ }),
    ).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".floor-stage")).toHaveClass(/motion-still/);
  await expect(
    page.getByRole("button", { name: /WP-107 RECORD.*Accepted/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /WP-106.*Run finished/ }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(mutations).toEqual([]);
});

test("gallery keyboard, focus return, list fallback and accessibility", async ({
  page,
}) => {
  await page.goto("/themes.html");
  const trigger = page.getByRole("button", { name: /Theme Plain Floor/ });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".floor-gallery").analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole("list", { name: "Work package activity" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include(".floor-workbench").analyze())
      .violations,
  ).toEqual([]);
});

test("failed artwork keeps the current world and explains the failure inside the gallery", async ({
  page,
}) => {
  await page.goto("/themes.html");
  await page.route("**/floor-themes/creature-dispatch/scene.*.svg", (r) =>
    r.abort(),
  );
  await page.getByRole("button", { name: /Theme Plain Floor/ }).click();
  await page
    .getByRole("button", { name: "Use Creature Dispatch theme", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Could not load Creature Dispatch",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("group", { name: "Plain Floor activity scene" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("cr.floor.preferences.v1")),
  ).toBeNull();
});

test("a slower earlier theme never replaces a newer selection", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/floor-themes/creature-dispatch/scene.*.svg",
    async (route) => {
      await held;
      await route.continue();
    },
  );
  await page.goto("/themes.html");
  await page.getByRole("button", { name: /Theme Plain Floor/ }).click();
  await page
    .getByRole("button", { name: "Use Creature Dispatch theme", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use Pocket Lab theme", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Pocket Lab activity scene" }),
  ).toBeVisible();
  release();
  await expect(page.locator(".floor-theme-trigger")).toContainText(
    "Pocket Lab",
  );
});

test("stale live data pauses activity and recovery never replays submissions", async ({
  page,
}) => {
  const api = await mockFloorApi(page);
  await page.clock.install();
  await page.goto("/floor");
  await expect(
    page.getByText("9 of 9 selected package details loaded"),
  ).toBeVisible();
  api.setOffline(true);
  await page.clock.fastForward(31001);
  await expect(
    page.getByText("Updates unavailable — showing last known activity"),
  ).toBeVisible();
  await expect(page.locator(".floor-stage")).toHaveClass(/motion-still/);
  api.setOffline(false);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("9 of 9 selected package details loaded"),
  ).toBeVisible();
  await expect(page.locator(".floor-signature")).toHaveCount(0);
  expect(api.mutations).toEqual([]);
});

test("late image failure uses a plain actor while retaining task access", async ({
  page,
}) => {
  await page.goto("/themes.html");
  await page.getByRole("button", { name: /Theme Plain Floor/ }).click();
  await page
    .getByRole("button", { name: "Use Pocket Lab theme", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Pocket Lab activity scene" }),
  ).toBeVisible();
  await page
    .locator(".floor-avatar img")
    .first()
    .evaluate((img: HTMLImageElement) => {
      img.src = "/missing-character.svg";
    });
  await expect(page.locator(".floor-neutral-icon").first()).toBeVisible();
  await page.getByRole("button", { name: /WP-101.*Working/ }).click();
  await expect(page.getByText(/Sample detail: WP-101/)).toBeVisible();
});

test("real route limits package queries and marks failed detail coverage", async ({
  page,
}) => {
  let mutations = 0;
  const requested = new Set<string>();
  await page.route("**/auth/session", (r) =>
    r.fulfill({
      json: { registered: true, signed_in: true, user: "Demo owner" },
    }),
  );
  await page.route("**/office", (r) => r.fulfill({ json: [] }));
  await page.route("**/events/stream", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: ": connected\n\n",
    }),
  );
  await page.route("**/packages**", async (r) => {
    if (r.request().method() !== "GET") {
      mutations++;
      await r.abort();
      return;
    }
    const id = new URL(r.request().url()).pathname.split("/")[2];
    const p = (i: number) => ({
      schema_version: "0.1.0",
      id: `WP-${String(i).padStart(3, "0")}`,
      revision: 0,
      title: "Sample work",
      project: "demo",
      mode: "general",
      status: "in-work",
      rigor_mode: "quick",
      data_lane: "internal",
      objective: "Demonstrate the interface",
      deliverables: [],
      design_inputs: [],
      agent_assignment: [],
      acceptance_criteria: [],
      verification: {
        method: "agent-pre-check",
        verifier: "independent",
        verifier_receives: [],
        required_custody: {
          decisive_evidence_generated_by: "verifier",
          preparer_may_present: false,
        },
      },
    });
    if (!id) {
      await r.fulfill({ json: Array.from({ length: 31 }, (_, i) => p(i)) });
      return;
    }
    requested.add(id);
    if (id === "WP-005") {
      await r.fulfill({
        status: 503,
        json: { code: "offline", message: "Not reachable" },
      });
      return;
    }
    await r.fulfill({
      json: {
        package: p(Number(id.slice(3))),
        runs: [],
        outputs: [],
        decisions: [],
        subject_digest: { algorithm: "sha256", value: "0".repeat(64) },
      },
    });
  });
  await page.goto("/floor");
  await expect(page.getByText("Packages 1–30 of 31")).toBeVisible();
  await expect(
    page.getByText("Could not load: WP-005.", { exact: false }),
  ).toBeVisible();
  expect(requested.size).toBe(30);
  await page.getByRole("button", { name: "Next packages" }).click();
  await expect(page.getByText("Packages 31–31 of 31")).toBeVisible();
  expect(mutations).toBe(0);
});
