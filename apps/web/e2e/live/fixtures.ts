/**
 * Playwright fixtures for the live suites.
 *
 * - `stack`: one real stack per worker (control plane, embedded database, fake-runtime daemon).
 * - `owner`: the software passkey of the person who set up that stack's machine.
 * - `page`: a page with the passkey shim installed and the owner signed in, landing on the board.
 * - `journal`: what the page did that a person would notice: console errors, uncaught exceptions,
 *   failed or 5xx requests, slow responses. `journal.step(name)` takes a screenshot and an axe scan
 *   at that point; every scan violation and every journal problem is written as a finding.
 * - `api`: the HTTP API as the signed-in owner (same cookies as the page), for arranging state.
 *
 * Findings go to LIVE_FINDINGS_DIR (default apps/web/test-results/live-findings), one JSON file per
 * test, read by tools/break-loop/findings.mjs. A finding is a candidate; the loop decides.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { installPasskey, SoftPasskey } from "./passkey.js";
import { startStack, type Stack } from "./stack.js";

export const findingsDir = resolve(process.env.LIVE_FINDINGS_DIR ?? join(import.meta.dirname, "../../test-results/live-findings"));

export type Severity = "critical" | "major" | "minor";
export interface Finding {
  /** Stable key: the same problem found twice has the same key, so the ledger can tell new from known. */
  key: string;
  severity: Severity;
  pass: "functional" | "break" | "persona" | "a11y";
  title: string;
  detail: string;
  test: string;
  browser: string;
  evidence?: string[];
}

export interface Journal {
  consoleErrors: string[];
  pageErrors: string[];
  badResponses: { url: string; status: number; method: string }[];
  slow: { url: string; ms: number }[];
  shots: string[];
  /** Screenshot plus axe scan, named; returns the axe violations for the caller to assert on. */
  step(name: string, opts?: { axe?: boolean }): Promise<{ id: string; impact: string | null | undefined; help: string; nodes: number }[]>;
  /** Records a finding directly (break and persona passes use this for soft failures). */
  find(f: Omit<Finding, "test" | "browser">): void;
  findings: Finding[];
  /** Expected bad responses (a test that kills the daemon expects some); matched by URL substring. */
  allow(fragment: string | RegExp): void;
}

/** Normalizes ids and numbers out of a string, so the same problem in two runs keys the same. */
export const keyOf = (...parts: string[]) =>
  parts.join("|").replace(/[0-9a-f]{8,}/gi, "#").replace(/\d+/g, "N").replace(/\s+/g, " ").trim().slice(0, 200);

type Fixtures = { journal: Journal; api: APIRequestContext; failures: void };
type WorkerFixtures = { stack: Stack; owner: SoftPasskey };

/** Registers the machine's owner through the real sign-in page. */
export async function setUpMachine(page: Page, stack: Stack, name = "Owner"): Promise<void> {
  await page.goto(stack.url + "/");
  await expect(page.getByRole("heading", { name: "Set up this machine" })).toBeVisible({ timeout: 30000 });
  const field = page.getByRole("textbox").first();
  await field.fill(name);
  await page.getByRole("button", { name: /set up|register|create/i }).first().click();
  await expect(page.getByRole("heading", { name: "Set up this machine" })).toBeHidden({ timeout: 30000 });
}

/** Signs in with an existing passkey (a fresh browser context has no session). */
export async function signIn(page: Page, stack: Stack): Promise<void> {
  await page.goto(stack.url + "/");
  const button = page.getByRole("button", { name: /sign in with passkey/i });
  const signedIn = page.getByRole("link", { name: /packages/i }).first();
  await expect(button.or(signedIn).first()).toBeVisible({ timeout: 30000 });
  if (await button.isVisible()) await button.click();
  // The shell can render before the session cookie lands; wait for the server to agree.
  await expect.poll(async () => {
    const r = await page.context().request.get(`${stack.url}/auth/session`);
    return r.ok() ? ((await r.json()) as { signed_in?: boolean }).signed_in === true : false;
  }, { timeout: 30000 }).toBe(true);
  await expect(signedIn).toBeVisible({ timeout: 30000 });
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  stack: [
    async ({}, use, workerInfo) => {
      const stack = await startStack({ name: `w${workerInfo.workerIndex}-${workerInfo.project.name}` });
      await use(stack);
      await stack.stop();
    },
    { scope: "worker", timeout: 120000 },
  ],
  owner: [
    async ({ stack, browser }, use) => {
      const key = new SoftPasskey(stack.attestation);
      const context = await browser.newContext();
      await installPasskey(context, key);
      const page = await context.newPage();
      await setUpMachine(page, stack);
      await context.close();
      await use(key);
    },
    { scope: "worker", timeout: 120000 },
  ],
  context: async ({ context, owner }, use) => {
    await installPasskey(context, owner);
    await use(context);
  },
  page: async ({ page, stack }, use) => {
    await signIn(page, stack);
    await use(page);
  },
  api: async ({ page, stack }, use) => {
    await use(page.context().request);
    void stack;
  },
  // Every failed expectation (hard or soft) in any live test becomes a finding, keyed by the test and
  // the expectation's own words, so two different failures in one test are two findings.
  failures: [
    async ({ browserName }, use, testInfo) => {
      await use();
      if (testInfo.status === testInfo.expectedStatus && testInfo.errors.length === 0) return;
      const path = testInfo.titlePath.slice(1).join(" > ");
      const pass: Finding["pass"] = /@break/.test(path) ? "break" : /@persona/.test(path) ? "persona" : "functional";
      const shots = testInfo.attachments.filter((a) => a.contentType === "image/png" && a.path).map((a) => a.path!).slice(-2);
      const found: Finding[] = testInfo.errors.map((e) => {
        const msg = (e.message ?? "").replace(/\u001b\[[0-9;]*m/g, "");
        const first = msg.split("\n")[0].replace(/^Error:\s*/, "");
        const head = /^expect\(|^Timed out|^locator\./.test(first) ? `${testInfo.title}: ${first}` : first;
        return {
          key: keyOf("fail", path, head),
          severity: pass === "persona" ? "minor" : "major",
          pass,
          title: head.slice(0, 200),
          detail: msg.slice(0, 3000),
          test: path,
          browser: browserName,
          evidence: shots,
        };
      });
      writeFindings(testInfo, found, "errors");
    },
    { auto: true },
  ],
  journal: async ({ page, browserName }, use, testInfo) => {
    const allowed: (string | RegExp)[] = [];
    const isAllowed = (u: string) => allowed.some((a) => (typeof a === "string" ? u.includes(a) : a.test(u)));
    const started = new Map<object, number>();
    const j: Journal = {
      consoleErrors: [], pageErrors: [], badResponses: [], slow: [], shots: [], findings: [],
      allow: (f) => void allowed.push(f),
      find: (f) => void j.findings.push({ ...f, test: testInfo.titlePath.slice(1).join(" > "), browser: browserName }),
      async step(name, opts = {}) {
        const file = testInfo.outputPath(`${String(j.shots.length + 1).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-")}.png`);
        await page.screenshot({ path: file, fullPage: true });
        j.shots.push(file);
        await testInfo.attach(name, { path: file, contentType: "image/png" });
        if (opts.axe === false) return [];
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length }));
        for (const x of r.violations) {
          j.find({
            key: keyOf("axe", x.id, new URL(page.url()).pathname, x.nodes[0]?.target.join(" ") ?? ""),
            severity: x.impact === "critical" || x.impact === "serious" ? "major" : "minor",
            pass: "a11y",
            title: `${x.help} (${x.id}) at ${name}`,
            detail: x.nodes.slice(0, 3).map((n) => `${n.target.join(" ")}: ${n.failureSummary ?? ""}`).join("\n"),
            evidence: [file],
          });
        }
        return v;
      },
    };
    page.on("console", (m) => { if (m.type() === "error") j.consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => j.pageErrors.push(String(e)));
    page.on("request", (r) => started.set(r, Date.now()));
    page.on("response", (r) => {
      const t = started.get(r.request());
      const u = r.url();
      if (t && Date.now() - t > 3000 && !/\/(events|stream)\b/.test(u)) j.slow.push({ url: u, ms: Date.now() - t });
      if (r.status() >= 500 && !isAllowed(u)) j.badResponses.push({ url: u, status: r.status(), method: r.request().method() });
    });
    await use(j);
    for (const e of j.pageErrors) j.find({ key: keyOf("pageerror", e), severity: "major", pass: "functional", title: "Uncaught error in the page", detail: e });
    for (const e of j.consoleErrors) {
      // A refused request (4xx) logs this line in every browser; whether the page explained the
      // refusal is what the tests check. 5xx responses are their own findings below.
      if (isAllowed(e) || /Failed to load resource: .*status of 4\d\d/.test(e)) continue;
      j.find({ key: keyOf("console", e.slice(0, 120)), severity: "minor", pass: "functional", title: "Console error", detail: e.slice(0, 2000) });
    }
    for (const b of j.badResponses) j.find({ key: keyOf("5xx", b.method, new URL(b.url).pathname), severity: "major", pass: "functional", title: `Server error ${b.status} on ${b.method} ${new URL(b.url).pathname}`, detail: b.url });
    for (const s of j.slow) j.find({ key: keyOf("slow", new URL(s.url).pathname), severity: "minor", pass: "functional", title: `Slow response (${s.ms} ms) from ${new URL(s.url).pathname}`, detail: s.url });
    writeFindings(testInfo, j.findings);
  },
});

function writeFindings(testInfo: TestInfo, findings: Finding[], kind = "journal") {
  if (findings.length === 0) return;
  mkdirSync(findingsDir, { recursive: true });
  const name = `${testInfo.project.name}-${testInfo.titlePath.slice(1).join("-")}`.replace(/[^a-z0-9]+/gi, "-").slice(0, 150);
  writeFileSync(join(findingsDir, `${name}-${kind}-r${testInfo.retry}.json`), JSON.stringify(findings, null, 2));
}

export { expect };
