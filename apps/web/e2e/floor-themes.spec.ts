import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockFloorApi } from "./floor-fixtures.js";
test.skip(
  process.env.THEME_TEST_LEGACY === "true",
  "Dedicated legacy rollback run",
);
test.skip(
  process.env.THEME_TEST_RELEASE === "true",
  "Dedicated release artifact run",
);
test("standalone scenes pause when the document is hidden and resume without replay", async ({
  page,
}) => {
  await page.goto("/themes.html");
  await expect(page.locator(".floor-stage")).toHaveClass(/motion-full/);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".floor-stage")).toHaveClass(/motion-still/);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".floor-stage")).toHaveClass(/motion-full/);
  await expect(page.locator(".floor-signature")).toHaveCount(0);
});
test("Quiet submission emphasis uses opacity without translation or scale", async ({
  page,
}) => {
  const api = await mockFloorApi(page, { finishOnReconnect: true });
  await page.goto("/floor");
  await expect(
    page.getByRole("button", { name: /WP-101.*Working/ }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: /Motion/ }).selectOption("quiet");
  api.finishAuthor();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const effect = page.locator(".floor-signature").first();
  await effect.waitFor();
  expect(
    await effect.evaluate((el) =>
      el
        .getAnimations()
        .flatMap((a) => a.effect?.getKeyframes() ?? [])
        .every((frame) => !frame.transform || frame.transform === "none"),
    ),
  ).toBe(true);
});

test("short reconnect rebaselines without a submission effect", async ({
  page,
}) => {
  const api = await mockFloorApi(page, { finishOnReconnect: true });
  await page.goto("/floor");
  await expect(
    page.getByRole("button", { name: /WP-101.*Working/ }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { seenEffects: number }).seenEffects = 0;
    new MutationObserver(() => {
      if (document.querySelector(".floor-signature"))
        (window as unknown as { seenEffects: number }).seenEffects++;
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    (
      window as unknown as { themeStream: { emit: (s: string) => void } }
    ).themeStream.emit("error");
  });
  api.finishAuthor();
  await page.evaluate(() =>
    (
      window as unknown as { themeStream: { emit: (s: string) => void } }
    ).themeStream.emit("open"),
  );
  await expect(
    page.getByRole("button", { name: /WP-101.*Run finished/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { seenEffects: number }).seenEffects,
    ),
  ).toBe(0);
});

test("a newer cross-tab decision cancels a pending choice even when it selects the current pack", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  await page.route(
    "**/floor-themes/creature-dispatch/scene.*.svg",
    async (r) => {
      await held;
      await r.continue();
      complete();
    },
  );
  await page.goto("/themes.html");
  await page.locator(".floor-theme-trigger").click();
  await page
    .getByRole("button", { name: "Use The Monster Mailroom theme", exact: true })
    .click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "cr.floor.preferences.v1",
        newValue: JSON.stringify({
          schemaVersion: 1,
          themeId: "plain",
          motion: "full",
          view: "scene",
        }),
      }),
    ),
  );
  release();
  await done;
  await page
    .getByRole("dialog")
    .waitFor({ state: "hidden", timeout: 1200 })
    .catch(() => {});
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("group", { name: "Plain Floor activity scene" }),
  ).toBeVisible();
});

test("mobile list keeps complete run identifiers and distinguishes active rounds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/themes.html");
  await expect(page.getByRole("button", { name: /WP-101.*R-1/ })).toBeVisible();
  await expect(
    page.locator(".floor-list-id").filter({ hasText: "R-1" }).first(),
  ).toBeVisible();
});

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
      "Preview: sample activity. This is a demonstration, not live work.",
    ),
  ).toBeVisible();
  for (const name of [
    "The Monster Mailroom",
    "Little Helpers Laboratory",
    "Heist Night",
    "The Chocolate Factory",
    "The Lantern Woods Guild",
    "The Coffee House Crew",
    "Tumbletown Rhyme Works",
    "Starport Shipyard",
    "Critter Expedition Camp",
    "Blockworks Foundry",
    "The Cloudspring Baths",
    "Thimble Town",
    "Clockwork Stargazers",
    "Reef Town",
    "Cozy Critter Village",
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
    .getByRole("button", { name: "Use The Monster Mailroom theme", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Could not load The Monster Mailroom",
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
    .getByRole("button", { name: "Use The Monster Mailroom theme", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use Little Helpers Laboratory theme", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Little Helpers Laboratory activity scene" }),
  ).toBeVisible();
  release();
  await expect(page.locator(".floor-theme-trigger")).toContainText(
    "Little Helpers Laboratory",
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
    page.getByText("Updates unavailable, showing last known activity"),
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
    .getByRole("button", { name: "Use Little Helpers Laboratory theme", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Little Helpers Laboratory activity scene" }),
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
  await expect(page.getByText("Packages 1 to 30 of 31")).toBeVisible();
  await expect(
    page.getByText("Could not load: WP-005.", { exact: false }),
  ).toBeVisible();
  expect(requested.size).toBe(30);
  await page.getByRole("button", { name: "Next packages" }).click();
  await expect(page.getByText("Packages 31 to 31 of 31")).toBeVisible();
  expect(mutations).toBe(0);
});
