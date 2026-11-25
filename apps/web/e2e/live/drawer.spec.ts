/**
 * The review drawer, calm (@functional): it leads with the title, one plain sentence and one primary
 * step; everything else waits under Details. Its decision buttons must visibly do something: the
 * owner found Return and Reject "don't even work" because their note box opened below the screen
 * edge, unfocused, with the Sign button out of sight.
 *
 * Path: draft a pair -> release -> the pre-check is held (only one runtime on this machine) -> the
 * held check is stopped -> the drawer says so and offers Run again -> run again -> held again ->
 * Other choices -> Send back with a note: the note box is in view and focused -> sign -> recorded.
 */
import { expect, test } from "./fixtures.js";
import { card, decisionsOf, draftPair, drawer, releaseFromBoard } from "./flows.js";

interface ViewRun { id: string; role: string; status: string }

test.describe("@functional review drawer", () => {
  test("leads with one step, Run again works, and Send back opens its note box in view", async ({ page, journal, stack, api }) => {
    const { survey } = await draftPair(page, stack, "drawer");
    await releaseFromBoard(page, stack, survey);
    const d = drawer(page);

    const runs = async () => ((await (await api.get(`${stack.url}/packages/${survey}`)).json()) as { runs: ViewRun[] }).runs;
    let held: ViewRun | undefined;
    await expect.poll(async () => (held = (await runs()).find((r) => r.role === "pre-check" && r.status === "queued")) !== undefined, { timeout: 60000 }).toBe(true);

    // Held: one sentence, one step, and nothing else on the first screen.
    await expect(d.getByText(/The check is waiting for a second agent/)).toBeVisible({ timeout: 30000 });
    await expect(d.getByRole("link", { name: "Allow it" })).toBeVisible();
    await expect(d.getByRole("group", { name: "Custody chain" })).toBeHidden();
    await expect(d.getByText(/sha256:/)).toBeHidden();
    await journal.step("drawer-held");

    // Stopped: said in plain words, with Run again as the one step.
    // (Stopped from the run history under Details, the way a person would.)
    await d.getByRole("button", { name: /Agent runs/ }).click();
    await d.getByRole("button", { name: "Stop this run" }).first().click();
    await expect.poll(async () => (await runs()).find((r) => r.id === held!.id)?.status, { timeout: 30000 }).toBe("stopped");
    await d.getByRole("button", { name: /Agent runs/ }).click();
    await expect(d.getByText("The check was stopped. Run it again.")).toBeVisible({ timeout: 30000 });
    await journal.step("drawer-stopped");
    await d.getByRole("button", { name: "Run again" }).click();
    await expect.poll(async () => (await runs()).filter((r) => r.role === "pre-check").length, { timeout: 20000 }).toBe(2);
    await expect(d.getByText(/The check is waiting for a second agent/)).toBeVisible({ timeout: 30000 });

    // Send back: the note box opens in view, focused, with its Sign button in view too.
    await d.getByRole("button", { name: "Other choices" }).click();
    await d.getByRole("button", { name: "Send back with a note" }).click();
    const box = d.getByRole("textbox", { name: "What should change in the next revision?" });
    await expect(box).toBeInViewport();
    await expect(box).toBeFocused();
    const sign = d.getByRole("button", { name: /^Sign: / });
    await expect(sign).toBeInViewport();
    await journal.step("drawer-send-back");
    await box.fill("Live test: add the pump nameplate data.");
    await sign.click();
    await expect.poll(async () => (await decisionsOf(page, stack, survey)).map((x) => x.kind), { timeout: 20000 }).toContain("return");
    await expect(d.getByRole("status").filter({ hasText: /recorded/ })).toBeVisible();

    // A phone gets the same calm drawer, with no sideways scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(stack.url + "/board");
    await card(page, survey).locator(".bd-title").click();
    await expect(d).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await journal.step("drawer-phone");
    expect(journal.pageErrors).toEqual([]);
  });
});
