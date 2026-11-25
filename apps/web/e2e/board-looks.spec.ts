import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Run with: playwright test -c playwright.board.config.ts (keeps the JSON evidence file untouched).
 * The board at "/" in each look has no WCAG 2.2 A or AA violations (redesign task 4): live, with a
 * blocked O6 card, with the Move to menu open (M3), and with the stream unknown (banner and unknown cards). */
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
  await page.addInitScript((l) => {
    window.localStorage.setItem("cr.look", l);
    window.localStorage.setItem("cr.mode", "capital-projects");
  }, look);
  await page.route("**/workspace/projects", (r) => r.fulfill({ json: [] }));
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
  await page.route("**/admin", (r) => r.fulfill({ json: { bootstrap: false, actions: [], members: [{ id: "mem_ben", org_id: "o", user_name: "ben", display_name: "Ben", status: "active" }], registry: { qualifications: [] } } }));
  await page.route("**/packages", (r) => r.fulfill({ json: packages }));
  await page.route("**/packages/*", (r) => {
    const id = new URL(r.request().url()).pathname.split("/")[2];
    const p = packages.find((x) => x.id === id);
    return r.fulfill({ json: { package: p, runs: id === "WP-3" ? [{ id: "R-1", package_id: id, package_revision: 0, role: "author", status: "running", round: 1, agent_baseline: "site-author", runtime: { kind: "local", provider: "claude", model: "any" }, queued_at: "2026-11-21T10:00:00Z", started_at: "2026-11-21T10:00:05Z" }] : [], outputs: [], decisions: [], subject_digest: { algorithm: "sha256", value: "0".repeat(64) }, originators: ["ben"] } });
  });
  // The agent panel's transcript for the running author (click-to-talk slice S1).
  await page.route("**/packages/*/runs/*/events**", (r) =>
    r.fulfill({ json: { events: [
      { seq: 1, event: { kind: "message", at: "2026-11-21T10:00:06Z", text: "Reading the brief" } },
      { seq: 2, event: { kind: "tool_start", at: "2026-11-21T10:00:07Z", tool: "Edit", summary: "Edit src/controller.ts", call_id: "c1" } },
      { seq: 3, event: { kind: "tool_end", at: "2026-11-21T10:00:08Z", call_id: "c1", ok: true } },
    ] } }),
  );
  await page.route("**/packages/*/actions", (r) => r.fulfill({ json: [{ command: "accept", label: "Accept", allowed: true, signature: "direct" }] }));
  await page.route("**/packages/*/person-verifications", (r) => r.fulfill({ json: [] }));
  // One unclassified capture at the top of Ready (slice M4): its lane choices are inline.
  await page.route("**/captures", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: [{ schema_version: "0.1.0", id: "C-1", text: "Fix the login redirect", source: "web", created_at: "2026-11-08T10:00:00Z" }] })
      : r.fulfill({ status: 201, json: { schema_version: "0.1.0", id: "C-2", text: "x", source: "web", created_at: "2026-11-08T10:01:00Z" } }),
  );
}

const scan = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

// Looks b and c are retired; a stored one reads as a. Add a look here when one is added to tokens.css.
for (const look of ["a"]) {
  test(`the board has no axe violations in look ${look}, live, with a blocked O6 card, and with the stream unknown`, async ({ page }) => {
    await mockBoardApi(page, look);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Relief valve sizing", exact: true })).toBeVisible();
    // Ruling 10: the look sits on the board container only; the rest of the app stays look A.
    await expect(page.locator(".bd")).toHaveAttribute("data-look", look);
    await expect(page.locator("html")).not.toHaveAttribute("data-look", /./);
    await expect(page.getByText("Independent check")).toBeVisible();
    // Settled: every card has read its actions, so no card still says it is checking.
    await expect(page.getByText("Checking what is next")).toHaveCount(0);
    await expect(page.getByText("Needs you: Accept").first()).toBeVisible();
    // The Safety card's only qualified verifier would be its originator: the O6 line is blocked.
    await expect(page.getByText("Blocked: Needs a second qualified person. Originators cannot verify their own work: ben")).toBeVisible();
    // The capture card asks for its lane; the quick add field is open while the scan runs (slice M4).
    await expect(page.getByText("Needs you: Classify the data lane")).toBeVisible();
    await page.getByRole("button", { name: "+ Quick add" }).click();
    await expect(page.getByLabel("Card title")).toBeFocused();
    expect(await scan(page)).toEqual([]);

    // Slice M3: the Safety card offers no Accept button (ruling 16), and a card's Move to menu is
    // clean while open, with a refused item and Stop listed.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(2);
    const moveTo = page.getByRole("button", { name: "Move to, Relief valve sizing" });
    await moveTo.click();
    await page.getByRole("menuitem", { name: /^Unavailable/ }).click();
    await expect(page.getByRole("menuitem", { name: /Accept/ })).toHaveAttribute("aria-disabled", "true");
    expect(await scan(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(moveTo).toBeFocused();
    await page.getByRole("button", { name: "Move to, Controller patch" }).click();
    await expect(page.getByRole("menuitem", { name: "Stop run" })).toBeVisible();
    expect(await scan(page)).toEqual([]);
    await page.keyboard.press("Escape");

    // Slice M2: lenses (group by person, color by person, compact density, and default-view guard).
    await page.getByText("View options", { exact: true }).click();
    await page.getByLabel("Group by").selectOption("person");
    await page.getByLabel("Color by").selectOption("person");
    await page.getByRole("button", { name: "Compact" }).click();
    await page.getByRole("button", { name: /^Code\s*1$/ }).click();
    await expect(page.getByText("1 card waiting on verification or signature hidden by this view")).toBeVisible();
    expect(await scan(page)).toEqual([]);
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page.getByText(/hidden by this view/)).toHaveCount(0);
    await page.getByRole("button", { name: "Comfortable" }).click();
    await page.getByLabel("Group by").selectOption("none");
    await page.getByLabel("Color by").selectOption("kind");

    await page.evaluate(() => (window as unknown as { __stream: { emit(t: string): void } }).__stream.emit("error"));
    await expect(page.getByText(/What you see may be out of date/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
    await expect(page.getByText(/^Status unknown since /).first()).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
}

// Looks b and c are retired; a stored one reads as a. Add a look here when one is added to tokens.css.
for (const look of ["a"]) {
  test(`the review drawer's agent panel has no axe violations in look ${look}`, async ({ page }) => {
    await mockBoardApi(page, look);
    await page.goto("/");
    await page.getByRole("button", { name: "Controller patch", exact: true }).click();
    await page.getByRole("tab", { name: "Runs (1)" }).click();
    const panel = page.getByRole("region", { name: "Author agent" });
    await expect(panel.getByRole("log", { name: "Author transcript" })).toBeVisible();
    await expect(panel.getByText("Edit src/controller.ts")).toBeVisible();
    await expect(panel.getByText(/cannot be steered/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Stop/ })).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
}


test("keeps desktop triage and card review on the board", async ({ page }) => {
  await mockBoardApi(page, "a");
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search board" });
  const stages = page.getByRole("region", { name: "Work stages" });
  await expect(stages.getByRole("button", { name: "Relief valve sizing", exact: true })).toBeVisible();
  expect(await stages.evaluate((el) => el.scrollWidth)).toBe(await stages.evaluate((el) => el.clientWidth));
  await expect(page.getByLabel("Group by")).toBeHidden();

  await search.fill("no matching title");
  await expect(page.getByText("No cards match this view.")).toBeVisible();
  await expect(page.getByText(/hidden by this view/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");

  await page.getByRole("button", { name: "List", exact: true }).click();
  const card = page.getByRole("region", { name: "Work list" }).getByRole("button", { name: "Controller patch", exact: true });
  await card.focus();
  await card.press("Enter");
  await expect(page.getByRole("complementary", { name: "Review WP-3" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toBeFocused();

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.getByLabel("Jump to stage").selectOption("person-verifies");
  await expect(stages.getByRole("region", { name: "Checker review" })).toBeFocused();
  await expect.poll(() => stages.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

  const moveTo = page.getByRole("button", { name: "Move to, Relief valve sizing" });
  await moveTo.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Move to, Relief valve sizing" });
  await expect(menu.getByRole("menuitem", { name: /^Unavailable/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu.getByRole("menuitem", { name: /Accept/ })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await expect(moveTo).toBeFocused();
});


test("switches directly between active attempts and keeps finished history addressable", async ({ page }) => {
  await mockBoardApi(page, "a");
  const makeRun = (id: string, provider: string, status: string) => ({
    id,
    package_id: "WP-3",
    package_revision: 0,
    role: "author",
    round: id === "R-first" ? 1 : 2,
    agent_baseline: "site-author",
    status,
    runtime: { kind: "local", provider, model: "any" },
    queued_at: "2026-11-21T10:00:00Z",
    started_at: "2026-11-21T10:00:05Z",
  });
  const first = makeRun("R-first", "claude", "running");
  const second = makeRun("R-second", "codex", "queued");
  const third = { ...makeRun("R-third", "claude", "queued"), package_id: "WP-2" };
  const fourth = { ...makeRun("R-fourth", "codex", "running"), package_id: "WP-1" };
  let running = [first, second, third, fourth];
  let currentRevision = 0;
  let failRefresh = false;
  let runReads = 0;
  const exactReads: string[] = [];
  let packageReads = 0;
  await page.route("**/packages", (r) => {
    packageReads++;
    return r.fulfill({ json: packages });
  });
  await page.route("**/runs/active", (r) => {
    runReads++;
    return failRefresh ? r.fulfill({ status: 500, json: { message: "Offline" } }) : r.fulfill({ json: running.map((run) => ({ ...run, title: run.package_id === "WP-3" || run.package_id === "WP-2" ? "Same title" : "Relief valve sizing" })) });
  });
  await page.route("**/runtimes", (r) => r.fulfill({ json: { runtimes: [], reported_at: "2026-11-21T10:00:00Z" } }));
  await page.route("**/packages/WP-3", (r) => r.request().isNavigationRequest() ? r.continue() : r.fulfill({ json: {
    package: { ...packages.find((pkg) => pkg.id === "WP-3"), revision: currentRevision },
    runs: currentRevision === 0 ? [{ ...first, status: running.includes(first) ? "running" : "succeeded" }, second] : [],
    outputs: [],
    decisions: [],
    subject_digest: { algorithm: "sha256", value: "0".repeat(64) },
    originators: ["ben"],
  } }));
  await page.route(/\/packages\/WP-3\/runs\/[^/?]+$/, (r) => {
    const id = new URL(r.request().url()).pathname.split("/").at(-1)!;
    exactReads.push(id);
    const run = id === first.id ? { ...first, status: running.includes(first) ? "running" : "succeeded" } : id === second.id ? second : undefined;
    return r.fulfill(run ? { json: run } : { status: 404, json: { message: "No such run" } });
  });
  await page.route("**/packages/WP-3/runs/*/events**", (r) => {
    const id = new URL(r.request().url()).pathname.split("/")[4];
    return r.fulfill({ json: { events: [{ seq: 1, event: { kind: "message", at: first.started_at, text: `Transcript for ${id}` } }] } });
  });
  let rawLogReads = 0;
  await page.route("**/packages/WP-3/runs/*/log", (r) => {
    rawLogReads++;
    return r.fulfill({ json: { lines: [] } });
  });

  let outputLists = 0;
  let outputPreviews = 0;
  const output = { path: "review.patch", digest: { algorithm: "sha256", value: "a".repeat(64) }, size_bytes: 22 };
  await page.route("**/packages/WP-3/runs/*/outputs", (r) => {
    outputLists++;
    return r.fulfill({ json: [output] });
  });
  await page.route("**/packages/WP-3/runs/*/outputs/preview?*", (r) => {
    outputPreviews++;
    return r.fulfill({ json: { ...output, content: "<script>saved as text</script>" } });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
  expect(runReads).toBe(0);
  const readsBeforeOpening = packageReads;
  const trigger = page.locator(".active-runs summary");
  await trigger.press("Enter");
  const list = page.getByRole("region", { name: "Active runs" });
  await expect(list.getByRole("link")).toHaveCount(4);
  await expect(list.getByText("Claude Code")).toHaveCount(2);
  await expect(list.getByText("Codex CLI")).toHaveCount(2);
  expect(exactReads).toEqual([]);
  expect(runReads).toBe(1);
  expect(packageReads).toBe(readsBeforeOpening);
  await expect(list.getByRole("link", { name: /R-second/ })).toHaveAttribute("href", "/packages/WP-3#run-R-second");
  await list.getByRole("link", { name: /R-first/ }).click();
  await expect(page.getByRole("log", { name: "Author transcript" })).toContainText("Transcript for R-first");

  await expect(page.getByRole("button", { name: "Stop this run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause updates" })).toHaveCount(1);
  expect(rawLogReads).toBe(0);
  expect(outputLists).toBe(0);
  expect(outputPreviews).toBe(0);
  await page.getByText("Recorded outputs", { exact: true }).click();
  await expect(page.getByText("Outputs appear after a successful run.")).toBeVisible();
  expect(outputLists).toBe(0);
  running = [second];
  await expect(page.getByRole("combobox", { name: "File", exact: true })).toBeVisible({ timeout: 11000 });
  expect(outputLists).toBe(1);
  expect(outputPreviews).toBe(0);
  await page.getByRole("combobox", { name: "File", exact: true }).selectOption("0");
  await expect(page.getByLabel("Preview of review.patch")).toHaveText("<script>saved as text</script>");

  await trigger.click();
  await list.getByRole("link", { name: /R-second/ }).click();
  await expect(page.getByRole("log", { name: "Author transcript" })).toContainText("Transcript for R-second");
  await expect(page.getByText("Transcript for R-first")).toHaveCount(0);

  running = [second];
  currentRevision = 1;
  await page.reload();
  await page.goto("/packages/WP-3#run-R-first");
  await expect(page.getByRole("log", { name: "Author transcript" })).toContainText("Transcript for R-first");
  await page.getByText("Recorded outputs", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "File", exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Preview of review.patch")).toBeVisible();
  await expect(page.getByText("A verified repository comparison is unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByText("Run revision 0")).toBeVisible();
  expect(rawLogReads).toBe(0);
  await page.getByText("Run details and raw log", { exact: true }).click();
  await expect(page.getByLabel("Author log", { exact: true })).toBeVisible();
  await expect.poll(() => rawLogReads).toBe(1);
  await expect(page.getByRole("link", { name: "Review current revision" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop this run" })).toHaveCount(0);
  await page.goto("/packages/WP-3#run-missing");
  await expect(page.getByText("This run is unavailable for this package.")).toBeVisible();
  await expect(page.getByRole("log", { name: "Author transcript" })).toHaveCount(0);

  await trigger.click();
  await expect(list.getByRole("link", { name: /R-second/ })).toBeVisible();
  await expect(list.getByText("Codex CLI", { exact: true })).toBeVisible();
  failRefresh = true;
  await expect(list.getByText("Last known")).toBeVisible({ timeout: 12000 });
  await list.getByRole("button", { name: "Retry" }).focus();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(trigger).toBeFocused();
});
