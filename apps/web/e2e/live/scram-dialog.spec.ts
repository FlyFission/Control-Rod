/**
 * The SCRAM dialog can always be fired (@functional). The owner, 2026-11-25: "I can't even scram my
 * project. I can't even click Sign with your passkey and stop." The button sat grey with nothing
 * saying why. This stops short of signing, since a real SCRAM would lock the shared stack.
 */
import { expect, test } from "./fixtures.js";

test.describe("@functional SCRAM dialog", () => {
  test("is ready to sign at once, says what is missing when it is not, and fits the window", async ({ page, journal }) => {
    await page.getByRole("link", { name: "SCRAM" }).first().click();
    await page.locator(".scram-trigger").first().click();
    const dlg = page.getByRole("dialog", { name: "Pull SCRAM" });
    await expect(dlg).toBeVisible();
    const sign = dlg.getByRole("button", { name: "Sign with your passkey and stop" });
    // Reason prefilled, organization counted: one press away.
    await expect(dlg.getByRole("textbox", { name: "Why (required)" })).toHaveValue("Emergency stop.");
    await expect(sign).toBeEnabled({ timeout: 15000 });
    await expect(sign).toBeInViewport();
    await journal.step("scram-ready");
    // A missing choice is named next to the button.
    await dlg.getByRole("radio", { name: "One project" }).check();
    await expect(sign).toBeDisabled();
    await expect(dlg.getByText("Choose the project to stop, or choose the whole organization.")).toBeVisible();
    // A short window: the dialog scrolls, so Sign is still reachable.
    await dlg.getByRole("radio", { name: "The whole organization" }).check();
    await page.setViewportSize({ width: 1280, height: 520 });
    await sign.scrollIntoViewIfNeeded();
    await expect(sign).toBeInViewport();
    await expect(sign).toBeEnabled();
    await journal.step("scram-short-window");
    expect(journal.pageErrors).toEqual([]);
  });
});
