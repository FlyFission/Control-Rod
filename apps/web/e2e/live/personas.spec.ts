/**
 * Persona pass (@persona): people with plain goals, working only from what the screen shows.
 *
 * Each persona writes a journey (test-results/live-journeys/<persona>.json plus screenshots): every
 * step's goal, what the screen said, how long it took, and where the person got stuck. The scripted
 * checks below catch the objective problems; the judge (tools/break-loop/JUDGE.md, run by the loop's
 * agent) reads the journeys and screenshots for the subjective ones: confusing, slow, noisy.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, setUpMachine, signIn, test } from "./fixtures.js";
import { addCard, classify, column, draftPair, releaseFromBoard } from "./flows.js";
import { installPasskey, SoftPasskey } from "./passkey.js";
import { startStack } from "./stack.js";

const journeysDir = resolve(process.env.LIVE_JOURNEYS_DIR ?? join(import.meta.dirname, "../../test-results/live-journeys"));

interface Step { goal: string; ms: number; screen: string; shot: string; stuck?: string }
class Journey {
  steps: Step[] = [];
  private t = Date.now();
  constructor(private page: Page, readonly persona: string, readonly brief: string, private dir = join(journeysDir, persona)) {
    mkdirSync(this.dir, { recursive: true });
  }
  async note(goal: string, stuck?: string) {
    const shot = join(this.dir, `${String(this.steps.length + 1).padStart(2, "0")}.png`);
    await this.page.screenshot({ path: shot, fullPage: true });
    const screen = (await this.page.locator("main").innerText().catch(() => "")).replace(/\n{2,}/g, "\n").slice(0, 2500);
    this.steps.push({ goal, ms: Date.now() - this.t, screen, shot, ...(stuck ? { stuck } : {}) });
    this.t = Date.now();
  }
  save(browser: string) {
    writeFileSync(join(this.dir, `journey-${browser}.json`), JSON.stringify({ persona: this.persona, brief: this.brief, browser, steps: this.steps }, null, 2));
  }
}

test.describe("@persona", () => {
  test("new user with no agents set up tries to get one thing done", async ({ browser, browserName }) => {
    test.setTimeout(180000);
    const stack = await startStack({ name: `persona-new-${browserName}`, daemon: false });
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();
    const j = new Journey(page, "new-user-no-agents", "First visit. Installed Control Rod, has no agent CLI and no daemon running. Wants one piece of work done.");
    try {
      await installPasskey(context, new SoftPasskey(stack.attestation));
      await page.goto(stack.url);
      await j.note("Open the app for the first time");
      await setUpMachine(page, stack, "New Person");
      await j.note("Finish setting up the machine");
      const request = "Write the scope of work for replacing the lobby lights";
      await addCard(page, request);
      await classify(page, request);
      await page.waitForTimeout(20000);
      await j.note("Wait for something to happen after classifying");
      // Objective check: with no daemon, the person must be told why nothing happens and what to do.
      const told = page.getByText(/daemon|no agent|install (claude|codex)|runtime|pnpm cr start|not running|waiting for/i).first();
      const ok = await told.isVisible().catch(() => false);
      if (!ok) await j.note("Find out why nothing happened", "Nothing on the board says no agent or daemon is available, or what to start.");
      expect.soft(ok, "the board explains that nothing can run until an agent and the daemon are set up").toBe(true);
    } finally {
      j.save(browserName);
      await context.close();
      await stack.stop();
    }
  });

  test("someone juggling eight runs keeps track of what needs them", async ({ page, stack, browserName }) => {
    test.setTimeout(240000);
    const j = new Journey(page, "juggling-eight-runs", "Has many jobs going at once. Needs to see at a glance what is running, what is stuck and what needs them.");
    stack.setFake("author", "sleep 25; mkdir -p out; echo '# Report' > out/report.md");
    try {
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const { survey, sow } = await draftPair(page, stack, `juggle-${i}`);
        ids.push(survey, sow);
      }
      await j.note("Eight drafts are on the board");
      for (const id of ids.filter((x) => x.endsWith("SURVEY"))) {
        await releaseFromBoard(page, stack, id);
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(3000);
      await j.note("Four released, four waiting on their inputs");
      const header = await page.getByText(/agents? running or queued/).first().innerText();
      const running = Number(/(\d+)/.exec(header)?.[1] ?? -1);
      expect.soft(running, "the header counts the four author runs").toBe(4);
      await page.getByRole("button", { name: "Needs you", exact: true }).click();
      await j.note("Filter to what needs me");
      const needs = await page.locator(".bd-card").count();
      expect.soft(needs, "Needs you shows at least the four unreleased drafts").toBeGreaterThanOrEqual(4);
      await page.getByRole("button", { name: "All", exact: true }).click();
      await page.waitForTimeout(30000);
      await j.note("Half a minute later: the author runs have finished");
      for (const id of ids.filter((x) => x.endsWith("SURVEY"))) {
        await expect.soft(column(page, "Ready").locator(".bd-card", { hasText: id }), `${id} left Ready once released`).toHaveCount(0);
      }
    } finally {
      stack.setFake("author", null);
      j.save(browserName);
    }
  });

  test("a keyboard-only person adds and classifies a card", async ({ page, stack, browserName }) => {
    const j = new Journey(page, "keyboard-only", "Uses no mouse (motor impairment or preference). Tab, Enter, Escape and shortcuts only.");
    try {
      await page.locator("body").press("c");
      const field = page.getByPlaceholder("What needs doing? Enter adds it");
      await expect(field, "the c shortcut opens the add field").toBeFocused();
      const request = `Write the scope of work by keyboard ${Date.now()}`;
      await page.keyboard.type(request);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      await j.note("Added a card with c, typing and Enter");
      // Tab to the lane picker of the new card: count the presses a person would need.
      let presses = 0;
      const lane = page.getByRole("article", { name: new RegExp(request.slice(0, 40)) }).getByLabel("Data lane");
      while (presses < 60 && !(await lane.evaluate((el) => el === document.activeElement).catch(() => false))) {
        await page.keyboard.press("Tab");
        presses++;
      }
      await j.note(`Reached the card's lane picker after ${presses} Tab presses`, presses >= 60 ? "Could not reach the lane picker by Tab." : undefined);
      expect.soft(presses, "the new card's lane picker is reachable in under 15 Tab presses from the add field").toBeLessThan(15);
      if (presses < 60) {
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        await j.note("Classified by keyboard");
      }
      const focusVisible = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return false;
        const s = getComputedStyle(el);
        return s.outlineStyle !== "none" || s.boxShadow !== "none";
      });
      expect.soft(focusVisible, "focus stays on something visible after classifying").toBe(true);
      void stack;
    } finally {
      j.save(browserName);
    }
  });

  test("a person on a phone reads the board and adds a card", async ({ browser, stack, owner, browserName }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: browserName !== "firefox", hasTouch: true });
    await installPasskey(context, owner);
    const page = await context.newPage();
    const j = new Journey(page, "phone", "Checks the board from a phone between meetings and jots down one new task.");
    try {
      await signIn(page, stack);
      await expect(page.getByRole("button", { name: "+ Add a card" })).toBeVisible({ timeout: 30000 });
      await j.note("Open the board on a phone");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) {
        // Name what sticks out past the screen, outside a sideways scroller (or placed against the page).
        const wide = await page.evaluate(() => [...document.querySelectorAll("body *")]
          .filter((x) => x.getBoundingClientRect().right > document.documentElement.clientWidth + 1
            && (!x.closest(".bd-board") || /absolute|fixed/.test(getComputedStyle(x).position)))
          .slice(0, 8).map((x) => `${x.tagName.toLowerCase()}.${(x as HTMLElement).className}`));
        test.info().annotations.push({ type: "wider than the screen", description: wide.join(", ") });
      }
      expect.soft(overflow, "the board does not scroll sideways at 390 px").toBeLessThanOrEqual(1);
      await addCard(page, `Phone note ${Date.now()}`);
      await j.note("Add one card from the phone");
      const small = await page.evaluate(() => [...document.querySelectorAll("main button, main a, main select")]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); }).length);
      const tiny = await page.evaluate(() => [...document.querySelectorAll("main button, main a, main select")]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); })
        .map((e) => `${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 40)}"`));
      if (tiny.length > 0) test.info().annotations.push({ type: "small tap targets", description: tiny.join(", ") });
      expect.soft(small, "tap targets in the board are at least 24 px (WCAG 2.5.8)").toBe(0);
    } finally {
      j.save(browserName);
      await context.close();
    }
  });
});
