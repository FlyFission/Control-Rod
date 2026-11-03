/**
 * Phase 3 exit checks (plan Phase 3; specification Q-8 and Q-10). Every place, the case view and the
 * open command palette, against recorded fixtures standing in for the control plane: axe WCAG 2.2 AA,
 * a keyboard journey, reflow at 320 CSS pixels, and the case view with 1,000 run events (set
 * PHASE3_BIG=1). Results are printed and recorded in
 * .nuclear/changes/workbench-ontology/evidence/phase3/exit-checks.md.
 * Run: pnpm exec playwright test e2e/phase3-exit.spec.ts --project=chromium
 */
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const json = (b: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
const pkgs = [
  { schema_version: "0.1.0", id: "WP-0007", revision: 1, title: "Pump skid P-101 datasheet", project: "plant-a", mode: "capital-projects", status: "in-verification", rigor_mode: "standard", data_lane: "internal", objective: "x", deliverables: [{ id: "D1", type: "pump datasheet", format: ["pdf"] }], design_inputs: [], agent_assignment: [], acceptance_criteria: ["a"], discipline: "mechanical" },
  { schema_version: "0.1.0", id: "WP-0008", revision: 0, title: "Cable tray routing, Area 2", project: "plant-a", mode: "capital-projects", status: "draft", rigor_mode: "quick", data_lane: "internal", objective: "x", deliverables: [{ id: "D1", type: "routing plan" }], design_inputs: [], agent_assignment: [], acceptance_criteria: ["a"], discipline: "electrical" },
];
const admin = { me: { userName: "ben", memberId: "m", orgId: "o" }, bootstrap: false, qualification: null, members: [{ id: "m", org_id: "o", user_name: "ben", display_name: "Ben Huffer", status: "active" }], projects: [], policy: null, themes: [], commands: [],
  floors: [{ code: "not-human", sentence: "Only a person may take this action; an agent or a daemon never decides.", change: "Nothing changes this." }],
  actions: [{ command: "scram.pull", label: "Pull SCRAM", allowed: true, signature: "direct" }, { command: "runtime.pin", label: "Pin a runtime version", allowed: false, signature: "direct", reason: "This needs administrator authority, which your qualification does not include", change: "An administrator issues you a qualification with that authority.", missing: ["administrator authority"] }] };
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    const accept = r.request().headers()["accept"] ?? "";
    if (accept.includes("text/html") || /\.(js|css|svg|png|woff2|webp|json)$/.test(u.pathname) && !u.pathname.startsWith("/packages")) return r.fallback();
    const p = u.pathname;
    if (p === "/auth/session") return r.fulfill(json({ registered: true, signed_in: true, user: "ben" }));
    if (p === "/office/figures") {
      const fig = (id: string, packageId: string, state: string, place: string, cause: string, extra: Record<string, unknown> = {}) => ({
        id, package_id: packageId, package_revision: 1, title: packageId, role: "author", state, cause, since: new Date(Date.now() - 3600e3).toISOString(), place,
        marks: { gate: false, safety: false }, gate_stage: "in-work", data_lane: "internal", run_status: "running", href: { to: "/packages/$id", id: packageId, hash: "runs" }, ...extra });
      return r.fulfill(json({ figures: [
        fig("R-1", "WP-0007", "needs", "your-office", "Pre-check passed. Review and accept.", { gate_stage: "accept", marks: { gate: true, safety: false } }),
        fig("R-2", "WP-0008", "working", "electrical", "Routing cable tray in Area 2"),
        fig("R-3", "WP-0011", "stuck", "review", "Author run lost: its outcome is unknown."),
      ], needs_me: 1, inbox_items: 3, hidden: 0, generated_at: new Date().toISOString() }));
    }
    if (p === "/office") return r.fulfill(json([{ kind: "accept", package_id: "WP-0007", package_revision: 1, title: "Pump skid P-101 datasheet", detail: "Pre-check passed with two minor findings.", since: new Date(Date.now() - 3600e3).toISOString() }]));
    if (p === "/packages") return r.fulfill(json(pkgs));
    if (p === "/packages/WP-0007") return r.fulfill(json({
      package: { ...pkgs[0], status: "in-verification", rigor_mode: "standard", acceptance_criteria: ["Rated flow 220 gpm at 140 ft TDH", "NPSHr below NPSHa by 3 ft margin", "Datasheet follows API 610 format"], deliverables: [{ id: "D1", type: "pump datasheet", format: ["pdf"] }], assumptions: [{ id: "A1", statement: "Water at 60 °F", requires_confirmation: true }], verification: { method: "agent-pre-check", verifier: "checker-codex", verifier_receives: ["deliverable"], required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false } } },
      runs: [{ schema_version: "0.1.0", id: "R-1", package_id: "WP-0007", package_revision: 1, role: "author", agent_baseline: "author-claude", runtime: { kind: "local", provider: "claude", model: "any" }, round: 1, status: "succeeded", queued_at: new Date(Date.now() - 7200e3).toISOString(), finished_at: new Date(Date.now() - 6600e3).toISOString(),
        trace: { schema_version: "0.1.0", run_id: "R-1", package_id: "WP-0007", package_revision: 1, agent_baseline: "author-claude", baseline_revision: 1, tool: { name: "claude", version: "2.1.316 (Claude Code)", digest: { algorithm: "sha256", value: "fd13c70000fec3f2116dfbcbb6121210b4a29328bf0e46210a59dd594a67d824" } }, inputs: [], outputs: [], started_at: new Date(Date.now() - 7200e3).toISOString(), finished_at: new Date(Date.now() - 6600e3).toISOString(), requested_model: "default", reported_model: "claude-opus-5-5", permission_mode: "acceptEdits", allowed_tools: ["Read", "Write", "Edit"], sandbox: "workspace-write" } }],
      outputs: [{ path: "out/datasheet.pdf", digest: { algorithm: "sha256", value: "ab".repeat(32) } }],
      pre_check: { schema_version: "0.1.0", package_id: "WP-0007", package_revision: 1, output: { path: "out/datasheet.pdf", digest: { algorithm: "sha256", value: "ab".repeat(32) } }, method: "agent-pre-check", verifier: "checker-codex", evidence: [], findings: [{ id: "F-1", severity: "minor", text: "Motor frame size not stated" }], outcome: "pass", independence: { runtime: "independent", author_runtime: { kind: "local", provider: "claude", model: "any" }, checker_runtime: { kind: "local", provider: "codex", model: "any" } } },
      decisions: [], subject_digest: { algorithm: "sha256", value: "ab12cd34ef56".padEnd(64, "0") },
      binds: "Signing binds revision 1 of WP-0007: 1 output and its pre-check (pass, 1 finding) (sha256:ab12cd34ef56).",
    }));
    if (p === "/packages/WP-0007/actions") return r.fulfill(json([
      { command: "release", label: "Release", allowed: false, signature: "direct", reason: "Only a draft can be released.", change: "Return the package to make a new draft." },
      { command: "accept", label: "Accept", allowed: true, signature: "direct" },
      { command: "accept-with-findings", label: "Accept with findings", allowed: true, signature: "direct" },
      { command: "return", label: "Return for revision", allowed: true, signature: "direct" },
      { command: "reject", label: "Reject", allowed: true, signature: "direct" },
    ]));
    if (p === "/packages/WP-0007/runs/R-1/events") return r.fulfill(json({ events: (process.env.PHASE3_BIG ? Array.from({ length: 1000 }, (_, i) => i % 2 === 0
      ? { seq: i + 1, event: { kind: "tool_start", at: "t", tool: "Read", summary: `Read: src/file-${i}.ts`, call_id: `c${i}` } }
      : { seq: i + 1, event: { kind: "tool_end", at: "t", call_id: `c${i - 1}`, ok: true } }) : null) ?? [
      { seq: 1, event: { kind: "message", at: "t", text: "Reading the brief and the design basis." } },
      { seq: 2, event: { kind: "tool_start", at: "t", tool: "Read", summary: "Read: inputs/BRIEF.md", call_id: "a" } },
      { seq: 3, event: { kind: "tool_end", at: "t", call_id: "a", ok: true } },
      { seq: 4, event: { kind: "tool_start", at: "t", tool: "Write", summary: "Write: out/datasheet.md", call_id: "b" } },
      { seq: 5, event: { kind: "tool_end", at: "t", call_id: "b", ok: true } },
      { seq: 6, event: { kind: "permission_request", at: "t", tool: "Bash", summary: "Run: pandoc" } },
      { seq: 7, event: { kind: "usage", at: "t", input_tokens: 18240, output_tokens: 2210 } },
      { seq: 8, event: { kind: "exit", at: "t", text: "exited" } },
    ] }));
    if (p === "/inbox") return r.fulfill(json({
      items: [
        { kind: "scram", scram_id: "scr_1", title: "SCRAM: Bad prompt shipped to mechanical", detail: "Before a restart: 1 stopped run to review. Nothing in scope runs until then.", since: new Date(Date.now() - 1800e3).toISOString(), risk: { rank: 0, label: "Security hold" }, href: { to: "/policies", hash: "command-scram.review" } },
        { kind: "lost", package_id: "WP-0011", package_revision: 0, title: "Heat exchanger E-201 rating", detail: "Author run lost: the daemon stopped answering and its outcome is unknown. Restart the daemon so it can report, or reconcile the run; then requeue it.", since: new Date(Date.now() - 7200e3).toISOString(), risk: { rank: 20, label: "Outcome unknown" }, href: { to: "/packages/$id", id: "WP-0011", hash: "runs" } },
        { kind: "accept", package_id: "WP-0007", package_revision: 1, title: "Pump skid P-101 datasheet", detail: "Pre-check passed. Review and accept.", since: new Date(Date.now() - 3600e3 * 26).toISOString(), risk: { rank: 41, label: "Standard gate" }, binds: "Signing binds revision 1 of WP-0007, 2 outputs and its pre-check (pass, 2 findings) (sha256:ab12cd34ef56).", subject_digest: { algorithm: "sha256", value: "ab12cd34ef56".padEnd(64, "0") }, decisions: ["accept", "accept-with-findings", "return", "reject"], href: { to: "/packages/$id", id: "WP-0007", hash: "decide" } },
      ],
      waiting_on_others: [
        { kind: "release", package_id: "WP-0012", package_revision: 0, title: "Relief valve sizing, PSV-301", detail: "Draft ready to review and release", since: new Date(Date.now() - 3600e3).toISOString(), risk: { rank: 40, label: "High consequence gate" }, binds: "Signing releases revision 0 of WP-0012 as drafted: 4 acceptance criteria and 1 deliverable (sha256:9f2e11aa03bc).", decisions: [], waiting_on: "someone who is an approver", reason: "This needs the Material grade and the mechanical discipline, which your qualification does not include", href: { to: "/packages/$id", id: "WP-0012", hash: "decide" } },
      ],
      digest: { head: 120, lines: [
        { topic: "changes", text: "3 packages changed: 2 drafted, 1 with new output.", count: 3 },
        { topic: "signatures", text: "1 decision signed: 1 released.", count: 1 },
        { topic: "lateness", text: "1 item has waited on you more than a day.", count: 1 },
        { topic: "disputes", text: "No disputes are open.", count: 0 },
        { topic: "gates", text: "2 gate criteria not yet met across 1 package.", count: 2 },
        { topic: "spend", text: "No spend recorded.", count: 0 },
      ] } }));
    if (p === "/admin") return r.fulfill(json(admin));
    if (p === "/captures") return r.fulfill(json([]));
    if (p.startsWith("/events")) return r.fulfill(json([]));
    if (p === "/runtimes") return r.fulfill(json({ runtimes: [{ runtime: "claude", ready: true, version: "2.1.316 (Claude Code)", login_checked: false, artifact: { path: "/home/ben/.npm-global/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe", digest: { algorithm: "sha256", value: "fd13c70000fec3f2116dfbcbb6121210b4a29328bf0e46210a59dd594a67d824" } } }, { runtime: "codex", ready: false, login_checked: true, reason: "codex is installed but not signed in" }], pins: [] }));
    if (p === "/metrics") return r.fulfill(json({ packages_accepted: 3, first_pass_accepted: 2, findings_caught_before_review: 5, quick_answers: 4 }));
    return r.fulfill(json([]));
  });
});

const PLACES = ["inbox", "office", "packages", "registers", "explore", "roster", "usage", "records", "policies", "packages/WP-0007/case"];
test("accessibility: no WCAG 2.2 AA violations on any place, the case view or the open palette", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium");
  await page.addInitScript(() => window.localStorage.setItem("cr.lastSeenSeq:ben", "100"));
  const report: string[] = [];
  for (const place of PLACES) {
    await page.goto(`/${place}`);
    await page.waitForTimeout(700);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude(".floor-scene").analyze();
    for (const v of r.violations) report.push(`${place}: ${v.id} (${v.impact}) ${v.nodes.length} nodes: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  }
  await page.goto("/inbox");
  await page.waitForTimeout(500);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("pin");
  const pal = await new AxeBuilder({ page }).include(".palette").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  for (const v of pal.violations) report.push(`palette: ${v.id} (${v.impact}) ${v.nodes.length}`);
  console.log("AXE " + (report.length ? report.join("\nAXE ") : "no violations"));
  expect(report).toEqual([]);
});

test("keyboard: skip link, every place, palette open, choose and return", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium");
  await page.goto("/inbox");
  await page.waitForTimeout(500);
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
  const stops: string[] = [first ?? ""];
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 30)));
  }
  console.log("TAB " + stops.join(" > "));
  expect(stops[0]).toBe("Skip to content");
  for (const place of ["Inbox", "Office", "Packages", "Registers", "Explore", "Roster", "Usage", "Records", "Policies"])
    expect(stops.some((s) => s.startsWith(place))).toBe(true);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("roster");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/roster");
  console.log("PALETTE navigated to " + new URL(page.url()).pathname);
  expect(new URL(page.url()).pathname).toBe("/roster");
});

test("reflow at 320 CSS px: no horizontal scrolling on any place", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium");
  await page.setViewportSize({ width: 320, height: 720 });
  const bad: string[] = [];
  for (const place of PLACES) {
    await page.goto(`/${place}`);
    await page.waitForTimeout(500);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > 320) bad.push(`${place}=${sw}`);
  }
  console.log("REFLOW " + (bad.length ? bad.join(" ") : "all fit"));
  expect(bad).toEqual([]);
});

test("case view interactive with 1,000 events", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium" || !process.env.PHASE3_BIG);
  const t0 = Date.now();
  await page.goto("/packages/WP-0007/case");
  await page.getByText("Read: src/file-998.ts").waitFor();
  const ms = Date.now() - t0;
  const t1 = Date.now();
  await page.getByRole("button", { name: /Show all 500 steps/ }).click();
  await page.getByText("Read: src/file-0.ts").waitFor();
  const all = Date.now() - t1;
  console.log(`PERF first story view ${ms} ms; show all 500 steps ${all} ms`);
  // Specification Q-10: first meaningful view under 1.5 s.
  expect(ms).toBeLessThan(1500);
  expect(all).toBeLessThan(1500);
});
