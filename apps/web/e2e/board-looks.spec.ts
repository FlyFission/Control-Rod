import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Run with: playwright test -c playwright.board.config.ts (keeps the JSON evidence file untouched).
 * The board at "/" in each look has no WCAG 2.2 A or AA violations (redesign task 4): live, with a
 * blocked O6 card, and with the stream unknown (banner and unknown cards). */
test.skip(process.env["THEME_TEST_LEGACY"] === "true", "Dedicated legacy rollback run");
test.skip(process.env["THEME_TEST_RELEASE"] === "true", "Dedicated release artifact run");

const base = {
  schema_version: "0.1.0",
  revision: 0,
  project: "general",
  mode: "capital-projects",
  rigor_mode: "quick",
  data_lane: "internal",
  objective: "Do the work.",
  design_inputs: [],
  agent_assignment: [{ role: "author", agent_baseline: "site-author", baseline_revision: 1 }],
  acceptance_criteria: ["It is right."],
  verification: { method: "agent-pre-check", verifier: "site-checker", verifier_receives: ["deliverable"], required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false } },
};
const packages = [
  { ...base, id: "WP-1", title: "Relief valve sizing", status: "in-verification", grade: "safety", deliverables: [{ id: "D1", type: "calculation", format: ["pdf"] }] },
  { ...base, id: "WP-2", title: "Lighting layout", status: "draft", grade: "general-service", deliverables: [{ id: "D1", type: "drawing", format: ["pdf"] }] },
  { ...base, id: "WP-3", title: "Controller patch", status: "in-work", grade: "general-service", deliverables: [{ id: "D1", type: "patch", format: ["diff"] }] },
];

async function mockBoardApi(page: Page, look: string) {
  await page.addInitScript((l) => window.localStorage.setItem("cr.look", l), look);
  await page.route("**/auth/session", (r) => r.fulfill({ json: { registered: true, signed_in: true, user: "ben" } }));
  // A stream that opens and stays open, so the board reads live.
  await page.addInitScript(() => {
    class OpenSource {
      listeners = new Map<string, ((e: Event) => void)[]>();
      constructor() {
        (window as unknown as { __stream: OpenSource }).__stream = this;
        queueMicrotask(() => setTimeout(() => this.emit("open"), 0));
      }
      emit(type: string) {
        (this.listeners.get(type) ?? []).forEach((fn) => fn(new Event(type)));
      }
      addEventListener(type: string, fn: (e: Event) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }
      close() {}
    }
    Object.defineProperty(window, "EventSource", { value: OpenSource, configurable: true });
  });
  await page.route("**/inbox**", (r) => r.fulfill({ json: { items: [], since: [] } }));
  await page.route("**/office", (r) => r.fulfill({ json: [{ id: "o1", kind: "accept", package_id: "WP-1", package_revision: 0 }] }));
  await page.route("**/admin", (r) => r.fulfill({ json: { members: [{ id: "mem_ben", org_id: "o", user_name: "ben", display_name: "Ben", status: "active" }], registry: { qualifications: [] } } }));
  await page.route("**/packages", (r) => r.fulfill({ json: packages }));
  await page.route("**/packages/*", (r) => {
    const id = new URL(r.request().url()).pathname.split("/")[2];
    const p = packages.find((x) => x.id === id);
    return r.fulfill({ json: { package: p, runs: id === "WP-3" ? [{ id: "R-1", package_id: id, package_revision: 0, role: "author", status: "running" }] : [], outputs: [], decisions: [], subject_digest: { algorithm: "sha256", value: "0".repeat(64) }, originators: ["ben"] } });
  });
  await page.route("**/packages/*/actions", (r) => r.fulfill({ json: [{ command: "accept", label: "Accept", allowed: true, signature: "direct" }] }));
  await page.route("**/packages/*/person-verifications", (r) => r.fulfill({ json: [] }));
}

const scan = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

for (const look of ["a", "b", "c"]) {
  test(`the board has no axe violations in look ${look}, live, with a blocked O6 card, and with the stream unknown`, async ({ page }) => {
    await mockBoardApi(page, look);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Relief valve sizing" })).toBeVisible();
    // Ruling 10: the look sits on the board container only; the rest of the app stays look A.
    await expect(page.locator(".bd")).toHaveAttribute("data-look", look);
    await expect(page.locator("html")).not.toHaveAttribute("data-look", /./);
    await expect(page.getByText("Independent check")).toBeVisible();
    // Settled: every card has read its actions, so no card still says it is checking.
    await expect(page.getByText("Checking what is next")).toHaveCount(0);
    await expect(page.getByText("Needs you: Accept").first()).toBeVisible();
    // The Safety card's only qualified verifier would be its originator: the O6 line is blocked.
    await expect(page.getByText("Blocked: Needs a second qualified person. Originators cannot verify their own work: ben")).toBeVisible();
    expect(await scan(page)).toEqual([]);

    await page.evaluate(() => (window as unknown as { __stream: { emit(t: string): void } }).__stream.emit("error"));
    await expect(page.getByText(/What you see may be out of date/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
    await expect(page.getByText(/^Status unknown since /).first()).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
}
