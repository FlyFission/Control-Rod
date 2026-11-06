import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** The board at "/" in each look has no WCAG 2.2 A or AA violations (redesign task 4). */
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
  await page.route("**/events/stream", (r) => r.fulfill({ contentType: "text/event-stream", body: ": connected\n\n" }));
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

for (const look of ["a", "b", "c"]) {
  test(`the board has no axe violations in look ${look}`, async ({ page }) => {
    await mockBoardApi(page, look);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Relief valve sizing" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-look", look);
    await expect(page.getByText("Independent check")).toBeVisible();
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
