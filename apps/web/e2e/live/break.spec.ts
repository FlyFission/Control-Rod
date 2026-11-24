/**
 * Break-it pass (@break): things people and machines actually do that the happy path never does.
 * Each test states what must hold. A failure here is a finding; once fixed, the test stays as the
 * regression guard. Tests share one stack per worker, so each makes its own packages.
 */
import { expect, signIn, test } from "./fixtures.js";
import { addCard, captureCard, card, decisionsOf, drawer, draftPair, openCase, packages, releaseFromBoard } from "./flows.js";

const PWNED = "window.__pwned";
/** Captures whose text contains `needle` (GET /captures lists the newest 200, so count by a unique tag). */
async function capturesWith(page: import("@playwright/test").Page, url: string, needle: string): Promise<number> {
  const r = await page.context().request.get(`${url}/captures`);
  expect(r.status(), await r.text()).toBe(200);
  return ((await r.json()) as { text?: string }[]).filter((c) => (c.text ?? "").includes(needle)).length;
}

const pwned = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned ?? 0);

test.describe("@break inputs", () => {
  const nasty: [string, string][] = [
    ["html", `<img src=x onerror="${PWNED}=1">Pump <b>bold</b>`],
    ["script", `</textarea><script>${PWNED}=1</script>`],
    ["markdown-js-link", "[click me](javascript:window.__pwned=1) and ![x](x onerror=alert(1))"],
    ["rtl-and-emoji", "ضخ المياه ‮evil.exe‬ 🔥🧯 ñ ü 漢字"],
    ["control-chars", "tab\there\u0000null\u0007bell\u001b[31mred"],
    ["long-word", "x".repeat(4000)],
    ["sql-ish", "'; drop table captures; --"],
  ];
  for (const [name, text] of nasty) {
    test(`quick add takes ${name} text literally`, async ({ page, journal, stack }) => {
      const tag = `fz${Date.now().toString(36)}`;
      await page.getByRole("button", { name: "+ Add a card" }).click();
      const field = page.getByPlaceholder("What needs doing? Enter adds it");
      await field.fill(`${tag} ${text}`);
      await field.press("Enter");
      // Either the card is added or a refusal is shown in place; never silence.
      const refusal = page.locator(".bd-add [role=alert], form [role=alert]").first();
      await expect.poll(async () => (await capturesWith(page, stack.url, tag)) === 1 || (await refusal.isVisible()), { timeout: 15000 }).toBe(true);
      await page.keyboard.press("Escape");
      await journal.step(`fuzz-${name}`, { axe: false });
      expect(await pwned(page)).toBe(0);
      // Nothing the person typed may become markup.
      expect(await page.locator("main img[src='x']").count()).toBe(0);
      expect(await page.locator("main a[href^='javascript:']").count()).toBe(0);
      expect(journal.badResponses, "no input makes the server fail").toEqual([]);
      // The page must still fit: one long word must not push the board sideways.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect.soft(overflow, "the page scrolls sideways after this input").toBeLessThanOrEqual(1);
    });
  }

  test("an empty or blank line adds nothing", async ({ page, stack }) => {
    const before = (await page.context().request.get(`${stack.url}/captures`).then((r) => r.json()) as { text?: string }[]).filter((c) => (c.text ?? "").trim() === "").length;
    await page.getByRole("button", { name: "+ Add a card" }).click();
    const field = page.getByPlaceholder("What needs doing? Enter adds it");
    for (const t of ["", "   ", "\n\n"]) {
      await field.fill(t);
      await field.press("Enter");
    }
    await page.waitForTimeout(1000);
    const after = (await page.context().request.get(`${stack.url}/captures`).then((r) => r.json()) as { text?: string }[]).filter((c) => (c.text ?? "").trim() === "").length;
    expect(after).toBe(before);
  });

  test("a pasted list of 40 lines offers one card per line and adds exactly 40", async ({ page, stack }) => {
    const tag = `paste${Date.now().toString(36)}`;
    const count = () => capturesWith(page, stack.url, tag);
    const before = 0;
    await page.getByRole("button", { name: "+ Add a card" }).click();
    const field = page.getByPlaceholder("What needs doing? Enter adds it");
    const lines = Array.from({ length: 40 }, (_, i) => `${tag} line ${i + 1}`).join("\n");
    await field.focus();
    await page.evaluate((t) => {
      const el = document.activeElement as HTMLElement;
      const dt = new DataTransfer();
      dt.setData("text/plain", t);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, lines);
    const addN = page.getByRole("button", { name: /Add 40 cards/ });
    await expect(addN).toBeVisible();
    await addN.dblclick();
    await expect.poll(count, { timeout: 30000 }).toBe(before + 40);
    await page.waitForTimeout(1500);
    expect(await count(), "a double click on Add 40 cards must not add 80").toBe(before + 40);
  });
});

test.describe("@break double actions", () => {
  test("double clicking Classify starts one intake", async ({ page, stack }) => {
    const before = new Set((await packages(page, stack)).map((p) => p.id));
    const request = `Write the scope of work for a double classify ${Date.now()}`;
    await addCard(page, request);
    const cap = captureCard(page, request);
    await cap.getByLabel("Data lane").selectOption("internal");
    await cap.getByRole("button", { name: "Classify" }).dblclick();
    await expect.poll(async () => (await packages(page, stack)).filter((p) => !before.has(p.id)).length, { timeout: 60000 }).toBe(2);
    await page.waitForTimeout(3000);
    expect((await packages(page, stack)).filter((p) => !before.has(p.id)).length).toBe(2);
  });

  test("double clicking Release signs once and records one release", async ({ page, journal, stack, owner }) => {
    const { survey } = await draftPair(page, stack, "dbl-release");
    stack.setFake("author", "sleep 20; mkdir -p out; echo '# Report' > out/report.md");
    try {
      const asked = owner.ceremonies.length;
      await card(page, survey).locator(".bd-title").click();
      await drawer(page).getByRole("button", { name: "Release", exact: true }).dblclick();
      await expect.poll(async () => (await decisionsOf(page, stack, survey)).length, { timeout: 15000 }).toBeGreaterThan(0);
      await page.waitForTimeout(2000);
      expect((await decisionsOf(page, stack, survey)).map((d) => d.kind)).toEqual(["release"]);
      expect.soft(owner.ceremonies.length - asked, "one click, one passkey prompt").toBe(1);
      await journal.step("after-double-release", { axe: false });
    } finally {
      stack.setFake("author", null);
    }
  });
});

test.describe("@break two tabs", () => {
  test("a stale tab cannot release twice and learns what happened", async ({ page, journal, stack, context }) => {
    const { survey } = await draftPair(page, stack, "stale");
    const stale = await context.newPage();
    await stale.goto(stack.url + "/");
    await card(stale, survey).locator(".bd-title").click();
    await expect(drawer(stale).getByRole("button", { name: "Release", exact: true })).toBeVisible();

    await releaseFromBoard(page, stack, survey);
    await expect.poll(async () => (await decisionsOf(page, stack, survey)).length).toBe(1);

    // The stale tab still shows the draft's Release button (or has updated live). Pressing it must not
    // record a second release, and must say why.
    const btn = drawer(stale).getByRole("button", { name: "Release", exact: true });
    if (await btn.isVisible()) {
      await btn.click();
      await stale.waitForTimeout(2000);
      await expect.soft(stale.getByRole("alert").first(), "the stale tab explains the refusal").toBeVisible();
    }
    expect((await decisionsOf(page, stack, survey)).map((d) => d.kind)).toEqual(["release"]);
    await journal.step("stale-tab-main", { axe: false });
    await stale.screenshot({ path: test.info().outputPath("stale-tab.png"), fullPage: true });
    await stale.close();
  });
});

test.describe("@break outages", () => {
  test("the network drops while adding a card: the line is kept and nothing is lost or doubled", async ({ page, stack, context }) => {
    const text = `Offline line ${Date.now()}`;
    const count = () => capturesWith(page, stack.url, text);
    await page.getByRole("button", { name: "+ Add a card" }).click();
    const field = page.getByPlaceholder("What needs doing? Enter adds it");
    await field.fill(text);
    await context.setOffline(true);
    await field.press("Enter");
    await page.waitForTimeout(1500);
    await expect(page.getByRole("alert").first(), "the person is told the card was not added").toBeVisible();
    await expect(field, "the typed line survives a failed send").toHaveValue(text);
    await context.setOffline(false);
    await field.press("Enter");
    await expect.poll(count, { timeout: 15000 }).toBe(1);
    await page.waitForTimeout(1500);
    expect(await count()).toBe(1);
  });

  test("the control plane restarts: the board says so, recovers without a reload, and work still runs", async ({ page, journal, stack }) => {
    journal.allow(/./); // requests fail while it is down; that is the point
    await expect(page.getByRole("region", { name: "Ready", exact: true })).toBeVisible();
    try {
      await stack.stopApi();
      const told = page.locator(".bd-unknown, [role=alert], [role=status]").filter({ hasText: /unknown|out of date|could not|can't|cannot|offline|reconnect/i }).first();
      await expect.soft(told, "within 30 s the board says it lost the server").toBeVisible({ timeout: 30000 });
      await journal.step("api-down", { axe: false });
      await stack.startApi();
      await expect(told, "within 45 s of the server returning, the warning clears on its own").toBeHidden({ timeout: 45000 });
      await journal.step("api-back", { axe: false });
      // The daemon kept running through the restart; new work must still reach it.
      await draftPair(page, stack, "after-restart");
    } finally {
      // Leave a working daemon for the next test whatever happened here.
      await stack.killDaemon("SIGTERM");
      await stack.startDaemon();
    }
  });

  test("the daemon dies mid-run: the run is shown lost, and can be retried to success", async ({ page, journal, stack }) => {
    test.setTimeout(300000);
    journal.allow("/runner/");
    stack.setFake("author", "sleep 600");
    const { survey } = await draftPair(page, stack, "daemon-kill");
    try {
      await releaseFromBoard(page, stack, survey);
      await expect.poll(() => /role=author/.test(stack.log("daemon")) && stack.log("daemon").includes(survey), { timeout: 30000 }).toBe(true);
      await stack.killDaemon("SIGKILL");
      await openCase(page, stack, survey);
      // Soft: a person should learn soon that no daemon is answering, not only after the lease lapses.
      await expect.soft(page.getByText(/daemon (is )?(not|isn't) (running|answering|connected)|no daemon|stopped answering|daemon has not answered/i).first(),
        "within 30 s the case says the daemon is gone").toBeVisible({ timeout: 30000 });
      await journal.step("daemon-dead", { axe: false });
      // Hard: after the lease (90 s) and a sweep, the run is lost and says what to do.
      await expect(page.getByRole("region", { name: "Runs" }).getByText(/^Lost/).first()).toBeVisible({ timeout: 180000 });
      await journal.step("run-lost");
      stack.setFake("author", null);
      await stack.startDaemon();
      const retry = page.getByRole("button", { name: /requeue|retry|run again/i }).first();
      const reconcile = page.getByRole("button", { name: "Sign with passkey and reconcile" }).first();
      // The killed author's process may still be running, so the outcome can stay unknown and the page
      // must offer the signed reconcile first; either way the person has a way to run it again.
      await expect(retry.or(reconcile).first(), "a lost run offers a way to run again").toBeVisible({ timeout: 30000 });
      if (!(await retry.isVisible())) {
        await page.getByLabel(/why|reason|what happened/i).last().fill("The daemon was killed in a live break test; the author never finished.");
        await reconcile.click();
        await expect(retry, "after reconciling, the lost run can be requeued").toBeVisible({ timeout: 30000 });
      }
      await retry.click();
      await expect(page.getByText(/Held: waiting for an independent runtime|Pre-check/).first()).toBeVisible({ timeout: 60000 });
    } finally {
      stack.setFake("author", null);
      if (!stack.daemonRunning()) await stack.startDaemon();
    }
  });
});

test.describe("@break hostile agent output", () => {
  test("an author that writes markup, escapes and a symlink cannot run script or leak files", async ({ page, journal, stack }) => {
    stack.setFake("author", [
      "mkdir -p out",
      `printf '# Report\\n\\n<script>${PWNED}=1</script>\\n<img src=x onerror="${PWNED}=1">\\n[x](javascript:${PWNED}=1)\\n' > out/report.md`,
      `echo '<img src=x onerror="${PWNED}=1"> \\033[31mred\\033[0m'`,
      "ln -s /etc/passwd out/passwd.md || true",
    ].join("\n"));
    try {
      const { survey } = await draftPair(page, stack, "hostile");
      await releaseFromBoard(page, stack, survey);
      await openCase(page, stack, survey);
      // The symlink makes the run fail its output custody check, which is the right outcome; anything
      // that finishes the run will do here. What matters is what the page then shows.
      await expect(page.getByText(/Held: waiting for an independent runtime|Done|Failed/).first()).toBeVisible({ timeout: 60000 });
      if (await page.getByText(/Author round \d+ Failed/).first().isVisible()) {
        await expect.soft(page.getByRole("region", { name: "Runs" }).getByText(/because|symlink|refused|not allowed|error:/i).first(),
          "a failed run says why it failed").toBeVisible({ timeout: 5000 });
      }
      const preview = page.getByRole("button", { name: "Preview" }).first();
      if (await preview.isVisible()) await preview.click();
      await page.waitForTimeout(1500);
      await journal.step("hostile-output", { axe: false });
      expect(await pwned(page)).toBe(0);
      expect(await page.locator("main img[src='x']").count()).toBe(0);
      expect(await page.locator("main a[href^='javascript:']").count()).toBe(0);
      await expect(page.getByText(/root:x:0:0/)).toHaveCount(0);
    } finally {
      stack.setFake("author", null);
    }
  });
});

test.describe("@break sessions and links", () => {
  test("a lost session sends the person to sign in instead of failing silently", async ({ page, journal, stack, context }) => {
    journal.allow(/./);
    await context.clearCookies();
    await page.getByRole("button", { name: "+ Add a card" }).click();
    const field = page.getByPlaceholder("What needs doing? Enter adds it");
    await field.fill(`After the session ended ${Date.now()}`);
    await field.press("Enter");
    const signInShown = page.getByRole("button", { name: /sign in with passkey/i });
    const explained = page.getByRole("alert").filter({ hasText: /sign in|session/i });
    await expect(signInShown.or(explained).first()).toBeVisible({ timeout: 15000 });
    await journal.step("session-lost", { axe: false });
    await signIn(page, stack);
  });

  test("a link to a package that does not exist says so", async ({ page, journal, stack }) => {
    journal.allow("/packages/NO-SUCH");
    await page.goto(`${stack.url}/packages/NO-SUCH-PACKAGE`);
    await expect(page.getByText(/not found|no package|does not exist|doesn't exist|could not (find|load)/i).first()).toBeVisible({ timeout: 15000 });
    await journal.step("missing-package");
    // Soft: "could not load" reads like an outage. A person should learn there is no such package.
    await expect(page.getByText(/not found|no package|does not exist|doesn't exist|could not find/i).first(), "the page says the package does not exist, not that loading failed").toBeVisible({ timeout: 5000 });
  });
});
