/**
 * Front-page screenshots (README and landing-page tour): the board at home, the live council workflow
 * diagram, the control room with subscription usage-limit gauges, the inbox with a software sign-off
 * drawer open, the Plant view, and the packages list, taken from a release build against recorded
 * sample fixtures. Skipped unless SHOTS_DIR is set. The readme-shots workflow runs it and keeps the
 * pictures as a build artifact:
 *   THEME_TEST_RELEASE=true SHOTS_DIR=/tmp/shots pnpm exec playwright test e2e/readme-shots.spec.ts --project=chromium
 */
import { test } from "@playwright/test";

const json = (b: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });

const nowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const inboxPkg = {
  schema_version: "0.1.0",
  id: "WP-0042",
  revision: 1,
  title: "Fix OAuth PKCE state validation",
  project: "web-app",
  mode: "software",
  status: "in-verification",
  grade: "general-service",
  rigor_mode: "standard",
  workflow: "superpowers",
  data_lane: "internal",
  objective: "Enforce constant-time PKCE state verification and reject expired state cookies on callback.",
  deliverables: [{ id: "D1", type: "patch", format: ["diff"] }],
  design_inputs: [],
  agent_assignment: [{ role: "author", agent_baseline: "software-author", baseline_revision: 1 }],
  acceptance_criteria: [
    "Callback rejects missing or mismatched state before token exchange",
    "Expired PKCE cookies return 401 and clear session state",
    "Unit and integration auth suites pass",
  ],
  verification: {
    method: "agent-pre-check",
    verifier: "checker-codex",
    verifier_receives: ["deliverable"],
    required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
  },
};

const pkgs = [
  inboxPkg,
  {
    schema_version: "0.1.0",
    id: "WP-0007",
    revision: 1,
    title: "Pump skid P-101 datasheet",
    project: "plant-a",
    mode: "capital-projects",
    status: "in-verification",
    rigor_mode: "standard",
    data_lane: "internal",
    objective: "Prepare the datasheet for pump skid P-101.",
    deliverables: [{ id: "D1", type: "pump datasheet", format: ["pdf"] }],
    design_inputs: [],
    agent_assignment: [],
    acceptance_criteria: ["Rated flow 220 gpm at 140 ft TDH"],
    discipline: "mechanical",
  },
  {
    schema_version: "0.1.0",
    id: "WP-0008",
    revision: 0,
    title: "Cable tray routing, Area 2",
    project: "plant-a",
    mode: "capital-projects",
    status: "draft",
    rigor_mode: "quick",
    data_lane: "internal",
    objective: "Prepare the routing plan for Area 2.",
    deliverables: [{ id: "D1", type: "routing plan" }],
    design_inputs: [],
    agent_assignment: [],
    acceptance_criteria: ["Clearance meets tray schedule"],
    discipline: "electrical",
  },
];

const admin = {
  me: { userName: "ben", memberId: "m", orgId: "o" },
  bootstrap: false,
  qualification: null,
  members: [{ id: "m", org_id: "o", user_name: "ben", display_name: "Ben Huffer", status: "active" }],
  projects: [],
  policy: null,
  hardware_formats_in_force: ["packed", "fido-u2f", "tpm"],
  themes: [],
  commands: [],
  floors: [{ code: "not-human", sentence: "Only a person may take this action; an agent or a daemon never decides.", change: "Nothing changes this." }],
  actions: [
    { command: "scram.pull", label: "Pull SCRAM", allowed: true, signature: "direct" },
    { command: "setup.record", label: "Save setup", allowed: true, signature: "none" },
    { command: "member.invite", label: "Invite a member", allowed: true, signature: "direct" },
    { command: "policy.propose", label: "Propose a policy change", allowed: true, signature: "none" },
  ],
  registry: {
    qualifications: [],
    delegations: [],
    bindings: [],
    change_requests: [],
    budgets: [],
    credentials: [{ id: "c", org_id: "o", member_id: "m", credential_id: "k", version: 1, registered_at: nowIso(-86400e3), hardware: true }],
  },
};

const probe = (id: string, name: string, family: string, version: string) => ({
  id,
  display_name: name,
  vendor_family: family,
  installed: true,
  path: `/usr/local/bin/${id}`,
  observed_version: version,
  auth: "signed-in",
  roles: [],
});

const subscriptions = {
  reported: true,
  reported_at: nowIso(-2 * MIN),
  platform: "linux",
  probes: [
    probe("claude", "Claude Code", "Anthropic", "2.1.330"),
    probe("codex", "Codex", "OpenAI", "0.171.0"),
    probe("agy", "Antigravity", "Google", "0.9.4"),
    probe("grok", "Grok CLI", "xAI", "0.4.2"),
    probe("opencode", "OpenCode", "OpenCode", "0.8.1"),
    probe("ollama", "Ollama", "Ollama", "0.6.2"),
  ],
  checkers: [],
  tiers: [],
  local_rule: "",
  pins: [],
};

const confirmedSetup = {
  confirmed: true,
  confirmed_at: nowIso(-3600e3),
  seats: [
    { runtime: "claude", seated: true },
    { runtime: "codex", seated: true },
  ],
  check_in: "start-and-merge",
};

const usageLimits = {
  reported: true,
  read_at: nowIso(-1 * MIN),
  providers: [
    {
      id: "claude",
      source: "cli-stream",
      observed_at: nowIso(-3 * MIN),
      plan: "max",
      windows: [
        { id: "five_hour", window_minutes: 300, used_percent: 28, resets_at: nowIso(3 * HOUR + 18 * MIN), status: "allowed" },
        { id: "seven_day", window_minutes: 10080, used_percent: 44, resets_at: nowIso(4 * 24 * HOUR + 6 * HOUR), status: "allowed" },
      ],
    },
    {
      id: "codex",
      source: "cli-log",
      observed_at: nowIso(-6 * MIN),
      plan: "plus",
      windows: [
        { id: "five_hour", window_minutes: 300, used_percent: 16, resets_at: nowIso(3 * HOUR + 52 * MIN), status: "allowed" },
        { id: "seven_day", window_minutes: 10080, used_percent: 31, resets_at: nowIso(5 * 24 * HOUR + 2 * HOUR), status: "allowed" },
      ],
    },
    { id: "agy", source: "none", windows: [] },
    { id: "grok", source: "none", windows: [] },
    { id: "opencode", source: "none", windows: [] },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    const accept = r.request().headers()["accept"] ?? "";
    if (accept.includes("text/html") || (/\.(js|css|svg|png|woff2|webp|json)$/.test(u.pathname) && !u.pathname.startsWith("/packages"))) {
      return r.fallback();
    }
    const p = u.pathname;
    if (p === "/auth/session") return r.fulfill(json({ registered: true, signed_in: true, user: "ben" }));
    if (p === "/setup") return r.fulfill(json(confirmedSetup));
    if (p === "/subscriptions") return r.fulfill(json(subscriptions));
    if (p === "/usage/limits") return r.fulfill(json(usageLimits));
    if (p === "/workspace/projects") return r.fulfill(json([]));
    if (p === "/runs/active") return r.fulfill(json([]));
    if (p === "/packages") return r.fulfill(json(pkgs));
    if (p === "/packages/WP-0042") {
      return r.fulfill(
        json({
          package: inboxPkg,
          runs: [
            {
              schema_version: "0.1.0",
              id: "R-42A",
              package_id: "WP-0042",
              package_revision: 1,
              role: "author",
              agent_baseline: "software-author",
              runtime: { kind: "local", provider: "claude", model: "any" },
              round: 1,
              status: "succeeded",
              queued_at: nowIso(-2400e3),
              finished_at: nowIso(-1900e3),
              trace: {
                schema_version: "0.1.0",
                run_id: "R-42A",
                package_id: "WP-0042",
                package_revision: 1,
                agent_baseline: "software-author",
                baseline_revision: 1,
                tool: {
                  name: "claude",
                  version: "2.1.330 (Claude Code)",
                  digest: { algorithm: "sha256", value: "fd13c70000fec3f2116dfbcbb6121210b4a29328bf0e46210a59dd594a67d824" },
                },
                inputs: [],
                outputs: [],
                started_at: nowIso(-2400e3),
                finished_at: nowIso(-1900e3),
                requested_model: "default",
                reported_model: "claude-opus-4-6",
                permission_mode: "acceptEdits",
                allowed_tools: ["Read", "Write", "Edit", "Bash"],
                sandbox: "workspace-write",
              },
            },
          ],
          outputs: [{ path: "out/oauth-pkce.patch", digest: { algorithm: "sha256", value: "8f4c2e91b07d4a62".repeat(4) } }],
          pre_check: {
            schema_version: "0.1.0",
            package_id: "WP-0042",
            package_revision: 1,
            output: { path: "out/oauth-pkce.patch", digest: { algorithm: "sha256", value: "8f4c2e91b07d4a62".repeat(4) } },
            method: "agent-pre-check",
            verifier: "checker-codex",
            evidence: [],
            findings: [{ id: "F-1", severity: "minor", text: "Add explicit clock-skew comment on 5-minute cookie TTL." }],
            outcome: "pass",
            independence: {
              runtime: "independent",
              author_runtime: { kind: "local", provider: "claude", model: "any" },
              checker_runtime: { kind: "local", provider: "codex", model: "any" },
            },
          },
          decisions: [],
          subject_digest: { algorithm: "sha256", value: "8f4c2e91b07d4a62c1e8903f55b12d99a74e60c2184f9e3ad307a41b7c68e502" },
          binds: "Signing binds revision 1 of WP-0042: 1 patch output and blind pre-check by codex (pass, 1 minor finding) (sha256:8f4c2e91b07d).",
        }),
      );
    }
    if (p === "/packages/WP-0042/actions") {
      return r.fulfill(
        json([
          { command: "release", label: "Release", allowed: false, signature: "direct", reason: "Only a draft can be released.", change: "Return the package to make a new draft." },
          { command: "accept", label: "Accept", allowed: true, signature: "direct" },
          { command: "accept-with-findings", label: "Accept with findings", allowed: true, signature: "direct" },
          { command: "return", label: "Return for revision", allowed: true, signature: "direct" },
          { command: "reject", label: "Reject", allowed: true, signature: "direct" },
        ]),
      );
    }
    if (p === "/packages/WP-0042/runs/R-42A/events") {
      return r.fulfill(
        json({
          events: [
            { seq: 1, event: { kind: "message", at: "t", text: "Inspecting OAuth callback handler and PKCE cookie verification." } },
            { seq: 2, event: { kind: "tool_start", at: "t", tool: "Read", summary: "Read: src/auth/oauth-callback.ts", call_id: "a" } },
            { seq: 3, event: { kind: "tool_end", at: "t", call_id: "a", ok: true } },
            { seq: 4, event: { kind: "tool_start", at: "t", tool: "Edit", summary: "Edit: src/auth/oauth-callback.ts (+28 -6)", call_id: "b" } },
            { seq: 5, event: { kind: "tool_end", at: "t", call_id: "b", ok: true } },
            { seq: 6, event: { kind: "tool_start", at: "t", tool: "Bash", summary: "Run: pnpm test src/auth/oauth-callback.test.ts (14 passed)", call_id: "c" } },
            { seq: 7, event: { kind: "tool_end", at: "t", call_id: "c", ok: true } },
            { seq: 8, event: { kind: "usage", at: "t", input_tokens: 14820, output_tokens: 1940 } },
            { seq: 9, event: { kind: "exit", at: "t", text: "exited 0" } },
          ],
        }),
      );
    }
    if (p === "/admin") return r.fulfill(json(admin));
    if (p === "/captures") return r.fulfill(json([]));
    if (p.startsWith("/events")) return r.fulfill(json([]));
    if (p === "/runtimes") {
      return r.fulfill(
        json({
          reported_at: nowIso(-30_000),
          runtimes: [
            {
              runtime: "claude",
              ready: true,
              version: "2.1.330 (Claude Code)",
              login_checked: true,
              artifact: {
                path: "/usr/local/bin/claude",
                digest: { algorithm: "sha256", value: "fd13c70000fec3f2116dfbcbb6121210b4a29328bf0e46210a59dd594a67d824" },
              },
            },
            { runtime: "codex", ready: true, version: "0.171.0", login_checked: true },
          ],
          pins: [],
        }),
      );
    }
    if (p === "/metrics") {
      return r.fulfill(
        json({
          packages_accepted: 18,
          first_pass_accepted: 13,
          findings_caught_before_review: 11,
          quick_answers: 9,
        }),
      );
    }
    return r.fulfill(json([]));
  });
});

const OUT = process.env.SHOTS_DIR ?? "";

const figs = () => {
  const t = (h: number) => nowIso(-h * 3600e3);
  const f = (id: string, pkg: string, title: string, role: string, state: string, place: string, cause: string, extra: Record<string, unknown> = {}) => ({
    id,
    package_id: pkg,
    package_revision: 1,
    title,
    role,
    state,
    cause,
    since: t(1),
    place,
    marks: { gate: false, safety: false },
    gate_stage: "in-work",
    data_lane: "internal",
    run_status: "running",
    href: { to: "/packages/$id", id: pkg, hash: "runs" },
    cause_key: `run:${id}`,
    ...extra,
  });
  return {
    figures: [
      f("R-1", "WP-0042", "Fix OAuth PKCE state validation", "author", "needs", "your-office", "Blind check passed (Codex). Waiting on your passkey.", { gate_stage: "accept", marks: { gate: true, safety: false } }),
      f("R-2", "WP-0033", "Fix login redirect loop", "author", "working", "electrical", "Authoring patch in isolated worktree"),
      f("R-4", "WP-0034", "Upgrade runtime to Node 22", "author", "working", "process", "Running test suite in sandbox"),
      f("R-5", "WP-0014", "Pipe rack loads", "author", "working", "civil", "Checking pipe rack loads"),
      f("R-6", "WP-0015", "Valve list, Unit 2", "author", "working", "mechanical", "Building the valve list"),
      f("R-7", "WP-0016", "Schedule update, week 47", "author", "working", "project-controls", "Updating the schedule"),
      f("R-8", "WP-0035", "Flaky checkout test", "checker", "working", "verification", "Blind cross-vendor check (Codex)"),
      f("R-9", "WP-0018", "Instrument index", "checker", "working", "review", "Checking the instrument index"),
      f("R-10", "WP-0019", "Drawing register", "author", "working", "document-control", "Filing the drawing register"),
      f("R-11", "WP-0020", "Quality plan", "author", "working", "assurance", "Drafting the quality plan"),
    ],
    needs_me: 1,
    inbox_items: 1,
    hidden: 0,
    generated_at: nowIso(),
  };
};

const boardBase = {
  schema_version: "0.1.0",
  revision: 1,
  project: "web-app",
  mode: "software",
  rigor_mode: "standard",
  data_lane: "internal",
  objective: "Complete the scoped change and pass all acceptance checks.",
  design_inputs: [],
  acceptance_criteria: ["Tests pass"],
  agent_assignment: [{ role: "author", agent_baseline: "software-author", baseline_revision: 1 }],
  verification: {
    method: "agent-pre-check",
    verifier: "checker-codex",
    verifier_receives: ["deliverable"],
    required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
  },
};
const patch = [{ id: "D1", type: "patch", format: ["diff"] }];
const boardCards = [
  { ...boardBase, id: "WP-0031", title: "Add PKCE session rotation", status: "draft", grade: "general-service", workflow: "superpowers", deliverables: patch },
  { ...boardBase, id: "WP-0032", title: "Rate-limit public webhook ingest", status: "draft", grade: "general-service", deliverables: patch },
  { ...boardBase, id: "WP-0033", title: "Fix login redirect loop", status: "in-work", grade: "general-service", workflow: "pocock", deliverables: patch },
  { ...boardBase, id: "WP-0034", title: "Upgrade worker pool to Node 22", status: "in-work", grade: "general-service", deliverables: patch },
  { ...boardBase, id: "WP-0035", title: "Eliminate flaky checkout race", status: "in-verification", grade: "general-service", deliverables: patch },
  { ...boardBase, id: "WP-0036", title: "Fix OAuth PKCE state validation", status: "in-verification", grade: "general-service", workflow: "superpowers", deliverables: patch },
  { ...boardBase, id: "WP-0037", title: "Rotate hardware signing keys", status: "in-verification", grade: "safety", deliverables: patch },
  { ...boardBase, id: "WP-0030", title: "Cache symbol search index", status: "accepted", grade: "general-service", deliverables: patch },
];
const running = new Set(["WP-0033", "WP-0034", "WP-0035"]);

async function mockBoard(page: import("@playwright/test").Page) {
  const html = (r: import("@playwright/test").Route) => (r.request().headers()["accept"] ?? "").includes("text/html");
  await page.route("**/packages", (r) => (html(r) ? r.fallback() : r.fulfill(json(boardCards))));
  await page.route("**/packages/WP-003*", (r) => {
    if (html(r)) return r.fallback();
    const id = new URL(r.request().url()).pathname.split("/")[2];
    const pkg = boardCards.find((x) => x.id === id);
    const runs = running.has(id ?? "")
      ? [
          {
            id: `R-${id}`,
            package_id: id,
            package_revision: 1,
            role: id === "WP-0035" ? "checker" : "author",
            status: "running",
            round: 1,
            agent_baseline: id === "WP-0035" ? "checker-codex" : "software-author",
            runtime: { kind: "local", provider: id === "WP-0034" ? "codex" : id === "WP-0035" ? "codex" : "claude", model: "any" },
            queued_at: nowIso(-900e3),
            started_at: nowIso(-880e3),
          },
        ]
      : [];
    return r.fulfill(json({ package: pkg, runs, outputs: [], decisions: [], subject_digest: { algorithm: "sha256", value: "0".repeat(64) }, originators: ["ben"] }));
  });
  await page.route("**/packages/WP-003*/actions", (r) => {
    const id = new URL(r.request().url()).pathname.split("/")[2];
    const pkg = boardCards.find((x) => x.id === id);
    return r.fulfill(
      json(
        pkg?.status === "in-verification" && id !== "WP-0035"
          ? [
              { command: "accept", label: "Accept", allowed: true, signature: "direct" },
              { command: "return", label: "Return for revision", allowed: true, signature: "direct" },
            ]
          : pkg?.status === "draft"
            ? [{ command: "release", label: "Release", allowed: true, signature: "direct" }]
            : [],
      ),
    );
  });
  await page.route("**/packages/*/person-verifications", (r) => r.fulfill(json([])));
  await page.route("**/office", (r) =>
    html(r)
      ? r.fallback()
      : r.fulfill(
          json(
            ["WP-0036", "WP-0037"].map((id) => ({
              kind: "accept",
              package_id: id,
              package_revision: 1,
              title: id,
              detail: "Blind pre-check passed.",
              since: nowIso(-1200e3),
            })),
          ),
        ),
  );
  await page.route("**/captures", (r) =>
    html(r)
      ? r.fallback()
      : r.fulfill(
          json([
            {
              schema_version: "0.1.0",
              id: "C-1",
              text: "Webhook retry queue drops headers on 429",
              source: "web",
              created_at: nowIso(-600e3),
            },
          ]),
        ),
  );
}

test("readme shots", async ({ page, browserName }) => {
  test.skip(!OUT || browserName !== "chromium");
  test.setTimeout(180_000);

  await page.addInitScript(() => {
    window.localStorage.setItem("cr.lastSeenSeq:ben", "100");
    class OpenSource {
      listeners = new Map<string, ((e: Event) => void)[]>();
      constructor() {
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

  await page.route("**/office/figures*", (r) => r.fulfill(json(figs())));
  await page.route("**/scrams*", (r) => ((r.request().headers()["accept"] ?? "").includes("text/html") ? r.fallback() : r.fulfill(json({ scrams: [] }))));
  await page.route("**/inbox*", (r) =>
    (r.request().headers()["accept"] ?? "").includes("text/html")
      ? r.fallback()
      : r.fulfill(
          json({
            items: [
              {
                kind: "accept",
                package_id: "WP-0042",
                package_revision: 1,
                title: "Fix OAuth PKCE state validation",
                detail: "Blind pre-check passed (Codex). Ready for your passkey sign-off.",
                since: nowIso(-45 * MIN),
                risk: { rank: 41, label: "Standard gate" },
                binds: "Signing binds revision 1 of WP-0042: 1 patch output and blind pre-check by codex (pass, 1 minor finding) (sha256:8f4c2e91b07d).",
                subject_digest: { algorithm: "sha256", value: "8f4c2e91b07d4a62c1e8903f55b12d99a74e60c2184f9e3ad307a41b7c68e502" },
                decisions: ["accept", "accept-with-findings", "return", "reject"],
                href: { to: "/packages/$id", id: "WP-0042", hash: "decide" },
              },
            ],
            waiting_on_others: [],
            digest: {
              head: 120,
              lines: [
                { topic: "changes", text: "4 packages updated: 2 drafted, 2 checked blind by Codex.", count: 4 },
                { topic: "signatures", text: "2 decisions signed with your passkey.", count: 2 },
                { topic: "disputes", text: "No checker disputes are open.", count: 0 },
                { topic: "spend", text: "Subscription sign-ins active ($0 API key spend).", count: 0 },
              ],
            },
          }),
        ),
  );

  // 1. Plant view (/plant)
  await page.setViewportSize({ width: 1680, height: 960 });
  await page.goto("/plant");
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/office.png` });

  // 2. Workflow diagram (/workflow) — wide enough to fit the entire main line and stand-in lane cleanly
  await page.setViewportSize({ width: 1920, height: 960 });
  await page.goto("/workflow");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/workflow.png` });

  // 3. Control room usage limits (/control-room)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/control-room");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/control-room.png` });

  // 4. Inbox with software sign-off drawer open (/inbox)
  await page.goto("/inbox");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/inbox.png` });

  // 5. Packages register (/packages)
  await page.goto("/packages");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/packages.png` });

  // 6. Board at home (/)
  await mockBoard(page);
  await page.goto("/");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/board.png` });
});
