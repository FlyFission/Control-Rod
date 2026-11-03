import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mockFloorApi } from "./floor-fixtures.js";
test("release build excludes the draft demo and unapproved public artwork", async ({
  page,
}) => {
  test.skip(
    process.env.THEME_TEST_RELEASE !== "true",
    "Run with THEME_TEST_RELEASE=true",
  );
  expect(existsSync("dist/themes.html")).toBe(false);
  expect(existsSync("dist/floor-themes/creature-dispatch")).toBe(false);
  await mockFloorApi(page);
  await page.goto("/floor");
  await page.locator(".floor-theme-trigger").click();
  await expect(
    page.getByRole("button", {
      name: "Use The Monster Mailroom theme",
      exact: true,
    }),
  ).toBeDisabled();
});
