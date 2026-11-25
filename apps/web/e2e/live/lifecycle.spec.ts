/**
 * Functional pass (@functional): one card's whole life on the real stack, in each browser, with a
 * screenshot and an axe WCAG 2.2 AA scan at every step a person stops at.
 *
 * capture (in the project's data lane) -> intake drafts two packages -> release (passkey) -> author run ->
 * pre-check held for an independent runtime -> owner override (passkey) -> pre-check passes ->
 * accept (passkey) -> Accepted. Then the dependent package becomes releasable.
 */
import { expect, test } from "./fixtures.js";
import { addCard, card, column, decisionsOf, drawer, openCase, SCOPE_REQUEST, signOverride, waitForText, packages } from "./flows.js";

test.describe("@functional card lifecycle", () => {
  test("a request goes from a typed line to an accepted package", async ({ page, journal, stack, owner }) => {
    await journal.step("board");
    const before = new Set((await packages(page, stack)).map((p) => p.id));

    const request = `${SCOPE_REQUEST} (lifecycle)`;
    await addCard(page, request);
    await journal.step("capture-added");

    await expect.poll(async () => (await packages(page, stack)).filter((p) => !before.has(p.id)).length, { timeout: 60000 }).toBe(2);
    const fresh = (await packages(page, stack)).filter((p) => !before.has(p.id));
    const survey = fresh.find((p) => p.id.endsWith("-SURVEY"))!.id;
    const sow = fresh.find((p) => p.id.endsWith("-SOW"))!.id;
    await expect(column(page, "Ready").locator(".bd-card", { hasText: survey })).toBeVisible({ timeout: 30000 });
    await journal.step("intake-drafted");

    await card(page, survey).locator(".bd-title").click();
    const release = drawer(page).getByRole("button", { name: "Release", exact: true });
    await expect(release).toBeVisible();
    await journal.step("review-drawer-draft");
    const asked = owner.ceremonies.length;
    await release.click();
    await expect.poll(() => owner.ceremonies.length).toBe(asked + 1);
    await expect.poll(async () => (await decisionsOf(page, stack, survey)).map((d) => d.kind)).toEqual(["release"]);
    await page.keyboard.press("Escape");

    await openCase(page, stack, survey);
    await waitForText(page, "Held: waiting for an independent runtime");
    await journal.step("precheck-held");
    // The board's next step for a held pre-check is the hold, not "Return for revision".
    await page.goto(stack.url + "/board");
    await expect(card(page, survey), "the board says the pre-check is held").toContainText(/Pre-check held/, { timeout: 30000 });
    await openCase(page, stack, survey);
    await signOverride(page);
    await waitForText(page, /Pre-check[\s\S]*pass/i);
    await journal.step("precheck-passed");

    const accept = page.getByRole("button", { name: "Accept", exact: true });
    await expect(accept).toBeVisible({ timeout: 30000 });
    await accept.click();
    await expect.poll(async () => (await decisionsOf(page, stack, survey)).map((d) => d.kind)).toEqual(["release", "accept"]);
    await expect(page.getByText(/Accept rev 0 by/)).toBeVisible({ timeout: 30000 });
    await journal.step("accepted-case");

    await page.goto(stack.url + "/");
    await expect(column(page, "Accepted").locator(".bd-card", { hasText: survey })).toBeVisible({ timeout: 30000 });
    await journal.step("board-accepted");

    // The dependent package now has its input accepted: releasing it must be open.
    await card(page, sow).locator(".bd-title").click();
    await expect(drawer(page).getByRole("button", { name: "Release", exact: true })).toBeEnabled();
    expect(journal.pageErrors).toEqual([]);
  });
});
