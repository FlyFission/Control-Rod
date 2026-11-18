/**
 * Front-page screenshots (README tour): the office under a released world, the case view with its
 * sign-off, the inbox and the packages list, from a release build against the same recorded sample
 * fixtures as phase3-exit.spec.ts. Skipped unless SHOTS_DIR is set. The readme-shots workflow runs it
 * and keeps the pictures as a build artifact:
 *   THEME_TEST_RELEASE=true SHOTS_DIR=/tmp/shots pnpm exec playwright test e2e/readme-shots.spec.ts --project=chromium
 */
import { test } from "@playwright/test";
const json = (b: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
const pkgs = [
  { schema_version: "0.1.0", id: "WP-0007", revision: 1, title: "Pump skid P-101 datasheet", project: "plant-a", mode: "capital-projects", status: "in-verification", rigor_mode: "standard", data_lane: "internal", objective: "x", deliverables: [{ id: "D1", type: "pump datasheet", format: ["pdf"] }], design_inputs: [], agent_assignment: [], acceptance_criteria: ["a"], discipline: "mechanical" },
  { schema_version: "0.1.0", id: "WP-0008", revision: 0, title: "Cable tray routing, Area 2", project: "plant-a", mode: "capital-projects", status: "draft", rigor_mode: "quick", data_lane: "internal", objective: "x", deliverables: [{ id: "D1", type: "routing plan" }], design_inputs: [], agent_assignment: [], acceptance_criteria: ["a"], discipline: "electrical" },
];
const admin = { me: { userName: "ben", memberId: "m", orgId: "o" }, bootstrap: false, qualification: null, members: [{ id: "m", org_id: "o", user_name: "ben", display_name: "Ben Huffer", status: "active" }], projects: [], policy: null, hardware_formats_in_force: ["packed", "fido-u2f", "tpm"], themes: [], commands: [],
  floors: [{ code: "not-human", sentence: "Only a person may take this action; an agent or a daemon never decides.", change: "Nothing changes this." }],
  actions: [{ command: "scram.pull", label: "Pull SCRAM", allowed: true, signature: "direct" }, { command: "runtime.pin", label: "Pin a runtime version", allowed: false, signature: "direct", reason: "This needs administrator authority, which your qualification does not include", change: "An administrator issues you a qualification with that authority.", missing: ["administrator authority"] },
    { command: "member.invite", label: "Invite a member", allowed: true, signature: "direct" }, { command: "policy.propose", label: "Propose a policy change", allowed: true, signature: "none" },
    { command: "budget.set", label: "Set a budget", allowed: false, signature: "direct", reason: "This needs policy authority, which your qualification does not include", change: "An administrator issues you a qualification with that authority." }],
  registry: { qualifications: [], delegations: [], bindings: [], change_requests: [], budgets: [],
    credentials: [{ id: "c", org_id: "o", member_id: "m", credential_id: "k", version: 1, registered_at: new Date(Date.now() - 86400e3).toISOString(), hardware: true }] } };
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

const OUT = process.env.SHOTS_DIR ?? "";
const figs = () => {
  const t = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
  const f = (id: string, pkg: string, title: string, role: string, state: string, place: string, cause: string, extra: Record<string, unknown> = {}) => ({
    id, package_id: pkg, package_revision: 1, title, role, state, cause, since: t(1), place,
    marks: { gate: false, safety: false }, gate_stage: "in-work", data_lane: "internal", run_status: "running", href: { to: "/packages/$id", id: pkg, hash: "runs" }, ...extra });
  return { figures: [
    f("R-1", "WP-0007", "Pump skid P-101 datasheet", "author", "needs", "your-office", "Pre-check passed. Review and accept.", { gate_stage: "accept", marks: { gate: true, safety: false } }),
    f("R-2", "WP-0008", "Cable tray routing, Area 2", "author", "working", "electrical", "Routing cable tray in Area 2"),
    f("R-4", "WP-0013", "Line sizing, cooling water", "author", "working", "process", "Sizing the cooling water header"),
    f("R-5", "WP-0014", "Pipe rack loads", "author", "working", "civil", "Checking pipe rack loads"),
    f("R-6", "WP-0015", "Valve list, Unit 2", "author", "working", "mechanical", "Building the valve list"),
    f("R-7", "WP-0016", "Schedule update, week 47", "author", "working", "project-controls", "Updating the schedule"),
    f("R-8", "WP-0017", "Motor list", "checker", "working", "verification", "Independent check of the motor list"),
    f("R-9", "WP-0018", "Instrument index", "checker", "working", "review", "Checking the instrument index"),
    f("R-10", "WP-0019", "Drawing register", "author", "working", "document-control", "Filing the drawing register"),
    f("R-11", "WP-0020", "Quality plan", "author", "working", "assurance", "Drafting the quality plan"),
  ], needs_me: 1, inbox_items: 2, hidden: 0, generated_at: new Date().toISOString() };
};

test("readme shots", async ({ page, browserName }) => {
  test.skip(!OUT || browserName !== "chromium");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem("cr.lastSeenSeq:ben", "100");
    window.localStorage.setItem("controlrod.office.theme.ben", "corner-cafe");
  });
  await page.route("**/office/figures*", (r) => r.fulfill(json(figs())));
  await page.goto("/office");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/office.png` });
  await page.goto("/packages/WP-0007/case");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/case-top.png` });
  await page.screenshot({ path: `${OUT}/case-full.png`, fullPage: true });
  await page.goto("/inbox");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/inbox.png` });
  await page.goto("/packages");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/packages.png` });
});
