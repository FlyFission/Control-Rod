import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { pkg } from "../test/fixtures.js";
import { renderPage } from "../test/render.js";
import type { NewCapture, Session, WorkspaceProject } from "../api/types.js";
import { CAPTURE_LIMIT } from "./CaptureBox.js";
import { Shell } from "./Shell.js";
import { MODE_COPY, PRO_LANE_SKILLS, saveMode } from "../lib/mode.js";
import { captureMatchesScope, hydrateServerProjects, loadProjects, packageMatchesScope, selectProject } from "../lib/projects.js";
import { browserPasskeys } from "../lib/decide.js";
import { loadWorkDefaults, resetWorkDefaults, factoryDefaults } from "../lib/workDefaults.js";

const ben = { registered: true, signed_in: true, user: "ben" } as Session;

function mockDialogMethods() {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  }
}
async function openCaptureSettings(user: ReturnType<typeof userEvent.setup>) {
  const disclosure = screen.getByRole("button", { name: "More settings" });
  if (disclosure.getAttribute("aria-expanded") !== "true") await user.click(disclosure);
}

describe("engineering mode toggle and NewWorkModal", () => {
  // The shell always reads which SCRAMs are in force and alerts when it cannot; these tests are about the modal.
  beforeEach(() => server.use(http.get("*/scrams", () => HttpResponse.json({ scrams: [] }))));
  afterEach(() => {
    localStorage.removeItem("cr.projects.v1");
    localStorage.removeItem("cr.active-project");
    localStorage.removeItem("cr.projects.v1:ben");
    localStorage.removeItem("cr.active-project:ben");
  });

  it("switches between Software, Capital Projects, and Nuclear-Grade modes in the shell", async () => {
    saveMode("software");
    server.use(http.get("*/inbox", () => HttpResponse.json({ items: [] })));
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: /\+ New change/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Software" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByLabelText("Software workspace options"));
    await user.click(screen.getByRole("button", { name: "Capital Projects" }));
    expect(screen.getByRole("button", { name: /\+ New deliverable/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capital Projects" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Nuclear-Grade" }));
    expect(screen.getByRole("button", { name: /\+ New packet/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nuclear-Grade" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("maps all 20 Nuclear-Grade PRO skills and supports nuclear-grade scope + ProjectModal", async () => {
    const ng = MODE_COPY["nuclear-grade"];
    expect(ng.boardColumns).toEqual({
      ready: "P · Question & Plan",
      drafting: "R · Execute",
      "agent-check": "R · Verify & Probe",
      "person-verifies": "R · Independent Review",
      "needs-signature": "R · Decide (Ship/Block)",
      reached: "O · Baseline & OPEX",
    });
    expect(ng.custodyRoles.slice(0, 2)).toEqual(["Executor (Author)", "Independent Verifier"]);

    const uniqueSkills = new Set(Object.values(PRO_LANE_SKILLS).flat().map((s) => s.name));
    expect(uniqueSkills.size).toBe(20);
    expect(PRO_LANE_SKILLS["person-verifies"].map((s) => s.name)).toEqual(["proving-claims", "reviewing-code-quality"]);

    hydrateServerProjects(
      "ben",
      [
        {
          id: "proj-ng",
          name: "Core Auth",
          mode: "nuclear-grade",
          status: "active",
          repo: "Control-Rod",
          repoStrategy: "worktree",
          workspaceRoot: "",
          lane: "internal",
          author: { ecosystem: "claude", model: "default", reasoning: "default" },
          checker: { ecosystem: "codex", model: "default", reasoning: "default" },
          laneAgents: { drafting: "claude", "agent-check": "codex" },
          createdAt: "2026-11-22T00:00:00Z",
        },
      ],
    );
    const loaded = loadProjects("ben");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.mode).toBe("nuclear-grade");
    expect(loaded[0]?.laneAgents).toEqual({ drafting: "claude", "agent-check": "codex" });

    expect(
      captureMatchesScope(
        { schema_version: "0.1.0", id: "c1", created_at: "2026-11-22T00:00:00Z", lane: "internal", source: "web", text: "[mode:nuclear-grade] [project:Core Auth] Verify" },
        "nuclear-grade",
        loaded[0]!,
      ),
    ).toBe(true);
    expect(
      captureMatchesScope(
        { schema_version: "0.1.0", id: "c2", created_at: "2026-11-22T00:00:00Z", lane: "internal", source: "web", text: "[mode:software] [project:Core Auth] Verify" },
        "nuclear-grade",
        loaded[0]!,
      ),
    ).toBe(false);
    expect(
      packageMatchesScope(
        pkg({
          id: "pkg-1",
          revision: 1,
          mode: "software",
          title: "[mode:nuclear-grade] Check boundary",
          objective: "Verify boundary",
          status: "draft",
          data_lane: "internal",
          project: "Core Auth",
        }),
        "nuclear-grade",
        loaded[0]!,
      ),
    ).toBe(true);

    saveMode("nuclear-grade");
    mockDialogMethods();
    const challengedPayloads: unknown[] = [];
    const createdBodies: Array<{
      payload: { name?: string; mode?: string; author?: unknown; checker?: unknown };
      assertion: unknown;
    }> = [];
    const createdProjects: unknown[] = [];
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/workspace/projects", () => HttpResponse.json(createdProjects)),
      http.get("*/repos", () =>
        HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null }),
      ),
      http.post("*/admin/commands/project.workspace-create/options", async ({ request }) => {
        const body = (await request.json()) as { payload: unknown };
        challengedPayloads.push(body.payload);
        return HttpResponse.json({ options: { challenge: "project-challenge" } });
      }),
      http.post("*/workspace/projects", async ({ request }) => {
        const body = (await request.json()) as (typeof createdBodies)[number];
        createdBodies.push(body);
        const { payload } = body;
        const project = {
          id: "prj_ng1",
          name: payload.name,
          mode: payload.mode,
          status: "active",
          repo: "",
          repoStrategy: "worktree",
          workspaceRoot: "",
          lane: "internal",
          author: payload.author,
          checker: payload.checker,
          createdAt: "2026-11-22T00:00:00Z",
        };
        createdProjects.push(project);
        return HttpResponse.json(project, { status: 201 });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "New project" }));
    expect(screen.getByRole("heading", { name: "New project" })).toBeTruthy();

    // Global `c` shortcut is ignored while a dialog[open] is shown
    fireEvent.keyDown(window, { key: "c" });
    expect(screen.queryByRole("heading", { name: "New change packet" })).toBeNull();

    const modeSelect = screen.getByLabelText("Board mode") as HTMLSelectElement;
    expect(modeSelect.value).toBe("nuclear-grade");
    await user.type(screen.getByLabelText("Project name"), "Safety Boundary");
    const passkey = vi.spyOn(browserPasskeys, "get").mockImplementation(async (options) =>
      ({ id: "credential", challenge: options.challenge }),
    );
    try {
      await user.click(screen.getByRole("button", { name: "Create project" }));
      await waitFor(() => expect(createdBodies).toHaveLength(1));
      expect(createdBodies[0]?.payload).toMatchObject({ name: "Safety Boundary", mode: "nuclear-grade" });
      expect(challengedPayloads).toEqual([createdBodies[0]?.payload]);
      expect(createdBodies[0]?.assertion).toEqual({ id: "credential", challenge: "project-challenge" });
      const created = await screen.findByRole("button", { name: "Safety Boundary", pressed: true });
      expect(created.getAttribute("aria-pressed")).toBe("true");
      await user.click(screen.getByRole("button", { name: "All Nuclear-Grade" }));
    } finally {
      passkey.mockRestore();
    }
  });

  it("captures with resolved project preferences and keeps overrides behind one keyboard-accessible disclosure", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    const defaults = factoryDefaults("software");
    const project: WorkspaceProject = {
      id: "proj-launcher",
      name: "Release tools",
      mode: "software",
      repo: "FlyFission/Release",
      repoStrategy: "worktree",
      workspaceRoot: "/home/flyfission/projects",
      lane: "client-confidential",
      status: "active",
      author: defaults.author,
      checker: defaults.checker,
      laneAgents: { drafting: "codex", "agent-check": "claude" },
      createdAt: "2026-11-15T12:00:00Z",
    };
    hydrateServerProjects("ben", [project]);
    selectProject("ben", project.id);
    const captures: { text: string; lane: string }[] = [];
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/workspace/projects", () => HttpResponse.json([project])),
      http.get("*/runtimes", () => HttpResponse.json({ runtimes: [], pins: [] })),
      http.get("*/repos", () => HttpResponse.json({
        workspace_root: project.workspaceRoot,
        local: [],
        github: [],
      })),
      http.post("*/captures", async ({ request }) => {
        const capture = (await request.json()) as { text: string; lane: string };
        captures.push(capture);
        return HttpResponse.json({ id: "cap-launcher", ...capture });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));

    const summary = screen.getByRole("region", { name: "Capture defaults" });
    expect(summary.textContent).toContain(project.name);
    expect(summary.textContent).toContain(project.repo);
    expect(summary.textContent).toContain("Author · Codex CLI");
    expect(summary.textContent).toContain("Checker · Claude Code");
    expect((screen.getByLabelText("Data lane") as HTMLSelectElement).value).toBe("client-confidential");
    expect(screen.queryByLabelText("CLI Ecosystem")).toBeNull();
    expect(screen.queryByLabelText("Repository")).toBeNull();

    const disclosure = screen.getByRole("button", { name: "More settings" });
    disclosure.focus();
    await user.keyboard("[Space]");
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect((screen.getByLabelText("Repository") as HTMLSelectElement).value).toBe(project.repo);
    expect(screen.getAllByLabelText("CLI Ecosystem")).toHaveLength(2);
    await user.clear(screen.getByLabelText("Project / Workstream"));
    await user.type(screen.getByLabelText("Project / Workstream"), "One request");
    expect(summary.textContent).toContain("One request");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(summary.textContent).toContain(project.name);
    expect((screen.getByLabelText("Data lane") as HTMLSelectElement).value).toBe("client-confidential");
    disclosure.focus();
    await user.keyboard("[Enter]");
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(disclosure);

    await user.type(screen.getByLabelText("What do you want done?"), "Write release notes");
    expect(summary.textContent).toContain("cr/write-release-notes");
    await user.click(screen.getByRole("button", { name: "Add change" }));
    await waitFor(() => expect(captures).toHaveLength(1));
    expect(captures[0]!.lane).toBe("client-confidential");
    expect(captures[0]!.text).toContain("[project-id:proj-launcher]");
    expect(captures[0]!.text).toContain("[repo:FlyFission/Release]");
    expect(captures[0]!.text).toContain("[author:codex/default@default]");
    expect(captures[0]!.text).not.toContain("[workspace:");

  });

  it("supports capture settings, auto-inference, runnable-only CLIs, and saved defaults", async () => {
    saveMode("capital-projects");
    resetWorkDefaults("capital-projects");
    mockDialogMethods();

    let capturedBody: NewCapture | null = null;
    const materializeRequests: Array<{ mode?: string; branch: string }> = [];
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [{ name: "Control-Rod", path: "/home/flyfission/projects/Control-Rod", branch: "main", remote_url: null, dirty: false }],
          github: [{ name_with_owner: "FlyFission/Control-Rod", default_branch: "main", is_private: true, url: "https://github.com/FlyFission/Control-Rod", updated_at: "2026-11-15T10:00:00Z" }],
          github_error: null,
        }),
      ),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch"; mode?: string };
        materializeRequests.push(body);
        return HttpResponse.json({
          ok: true,
          strategy: body.strategy,
          mode: body.mode,
          repo: body.repo,
          branch: body.branch,
          local_path: `/home/flyfission/projects/.worktrees/Control-Rod/${body.branch.replace(/\//g, "-")}`,
        });
      }),
      http.post("*/captures", async ({ request }) => {
        capturedBody = (await request.json()) as NewCapture;
        return HttpResponse.json({ id: "cap-1", received_at: "2026-11-15T12:00:00Z", lane: capturedBody.lane ?? "internal", source: "web", text: capturedBody.text ?? "" });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New deliverable/i }));
    expect(screen.getByRole("heading", { name: "New engineering deliverable" })).toBeTruthy();
    expect(screen.queryByText(/4-choice clarifications/i)).toBeNull();

    expect(screen.getByRole("button", { name: "More settings" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByLabelText("Data lane")).toBeTruthy();
    expect(screen.queryByLabelText("Repository")).toBeNull();
    expect(screen.queryByLabelText("Grade")).toBeNull();
    expect(screen.queryByLabelText("CLI Ecosystem")).toBeNull();

    // Typing a safety-critical process scope auto-infers discipline, stage, and grade
    await user.type(screen.getByLabelText("Design basis & acceptance criteria"), "Verify ASME relief valve orifice sizing.");
    expect(screen.getByText(/Auto-matched: Safety-critical process scope detected/i)).toBeTruthy();

    // Repository preparation is an optional operation within capture settings
    await openCaptureSettings(user);
    const repoSelect = screen.getByLabelText("Repository");
    await within(repoSelect).findByRole("option", { name: /FlyFission\/Control-Rod/i });
    await user.selectOptions(repoSelect, "FlyFission/Control-Rod");
    expect(screen.getByText(/prepares an isolated checkout for author runs/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod/i)).toBeTruthy();
    expect(materializeRequests.at(-1)?.mode).toBe("capital-projects");

    // The same disclosure exposes issue metadata and the CLI controls

    const stageSelect = screen.getByLabelText("Project Stage / Gate") as HTMLSelectElement;
    expect(stageSelect.value).toBe("Detailed Design (60%)");

    const purposeSelect = screen.getByLabelText("Issue Purpose") as HTMLSelectElement;
    await user.selectOptions(purposeSelect, "Issue for Permit (IFP)");

    const cliSelects = screen.getAllByLabelText("CLI Ecosystem");
    const authorCli = cliSelects[0] as HTMLSelectElement;
    // A checkout is prepared above, and Antigravity and Grok cannot author in one: they are offered
    // as checkers only.
    const checkerCli = cliSelects[1] as HTMLSelectElement;
    for (const id of ["agy", "grok"]) {
      const opt = Array.from(authorCli.options).find((o) => o.value === id);
      expect(opt!.disabled, `${id} author in a checkout`).toBe(true);
      expect(opt!.textContent).toContain("Can't work in a checkout yet");
      expect(Array.from(checkerCli.options).find((o) => o.value === id)!.disabled, `${id} checker`).toBe(false);
    }
    for (const id of ["opencode", "cursor", "copilot", "aider", "cline", "ollama"]) {
      const opt = Array.from(authorCli.options).find((o) => o.value === id);
      expect(opt, id).toBeTruthy();
      expect(opt!.disabled, `${id} disabled`).toBe(true);
      expect(opt!.textContent).toContain("Not yet runnable");
    }

    await user.selectOptions(cliSelects[0]!, "codex");
    const modelSelects = screen.getAllByLabelText("Model");
    expect((modelSelects[0] as HTMLSelectElement).value).toBe("default");
    expect((modelSelects[1] as HTMLSelectElement).value).toBe("default");
    // Live CLI-discovered Codex model from /runtimes is selectable
    expect(Array.from((modelSelects[0] as HTMLSelectElement).options).map((o) => o.value)).toContain("gpt-6.2-sol");

    // Same ecosystem triggers O6 Notice, switching back restores Distinct ecosystems message
    expect(screen.getByText(/O6 Notice:/i)).toBeTruthy();
    await user.selectOptions(cliSelects[0]!, "claude");
    expect(screen.getByText(/Distinct ecosystems \(baselines checked at run time\)/i)).toBeTruthy();

    // Save defaults
    await user.click(screen.getByRole("button", { name: "Save as my defaults" }));
    expect(screen.getByText(/Saved defaults for Capital Projects mode/i)).toBeTruthy();

    // Closing settings preserves the capture fields and the prepared branch
    await user.click(screen.getByRole("button", { name: "More settings" }));
    expect(screen.queryByLabelText("CLI Ecosystem")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add deliverable" }));
    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.text).toContain("[mode:capital-projects]");
    expect(capturedBody!.text).toContain("[repo:FlyFission/Control-Rod]");
    expect(capturedBody!.text).toContain("[outfall:worktree]");
    const branch = materializeRequests.at(-1)!.branch;
    expect(capturedBody!.checkout).toEqual({
      repo: "FlyFission/Control-Rod",
      local_path: `/home/flyfission/projects/.worktrees/Control-Rod/${branch.replace(/\//g, "-")}`,
      workspace_root: "/home/flyfission/projects",
      branch,
    });
    expect(capturedBody!.text).not.toContain("[workspace:");
    expect(capturedBody!.text).toContain("[stage:Detailed Design (60%)]");
    expect(capturedBody!.text).toContain("[purpose:Issue for Permit (IFP)]");
    expect(capturedBody!.text).toContain("[author:claude/default@default]");
    expect(capturedBody!.text).toContain("[checker:codex/default@default]");
  });

  it("adds a [workflow:<id>] tag only when a workflow is chosen", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();
    const bodies: string[] = [];
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/repos", () => HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null })),
      http.post("*/captures", async ({ request }) => {
        const b = (await request.json()) as { text?: string; lane?: string };
        bodies.push(b.text ?? "");
        return HttpResponse.json({ id: "cap-w", received_at: "2026-11-15T12:00:00Z", lane: b.lane ?? "internal", source: "web", text: b.text ?? "" });
      }),
    );
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.click(screen.getByRole("button", { name: "More settings" }));
    const select = screen.getByLabelText("Workflow") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Project default", "Playbook", "Superpowers", "Pocock", "Pocock Superpowers"]);
    await user.type(screen.getByLabelText(/What do you want done|Design basis/i), "Add a retry to the sync job.");
    await user.click(screen.getByRole("button", { name: /^Add (change|deliverable|packet)$/ }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toContain("[workflow:");

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.click(screen.getByRole("button", { name: "More settings" }));
    await user.selectOptions(screen.getByLabelText("Workflow"), "pocock");
    await user.type(screen.getByLabelText(/What do you want done|Design basis/i), "Add a retry to the sync job.");
    await user.click(screen.getByRole("button", { name: /^Add (change|deliverable|packet)$/ }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toContain("[workflow:pocock]");
  });

  it("refuses a project name with brackets, so a name can never carry a tag", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();
    const bodies: string[] = [];
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/repos", () => HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null })),
      http.post("*/captures", async ({ request }) => {
        const b = (await request.json()) as { text?: string };
        bodies.push(b.text ?? "");
        return HttpResponse.json({ id: "cap-b", received_at: "2026-11-15T12:00:00Z", lane: "internal", source: "web", text: b.text ?? "" });
      }),
    );
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.click(screen.getByRole("button", { name: "More settings" }));
    await user.type(screen.getByLabelText("Project / Workstream"), "Plant] [[workflow:pocock");
    await user.type(screen.getByLabelText(/What do you want done|Design basis/i), "Add a retry.");
    await user.click(screen.getByRole("button", { name: /^Add (change|deliverable|packet)$/ }));
    expect(await screen.findByText("A project name can't contain [ or ].")).toBeTruthy();
    expect(bodies).toEqual([]);
  });

  it("refuses a branch name with brackets before any workspace is prepared, so a branch can never carry a tag", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();
    const bodies: string[] = [];
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [{ name: "Control-Rod", path: "/home/flyfission/projects/Control-Rod", branch: "main", remote_url: null, dirty: false }],
          github: [],
          github_error: null,
        }),
      ),
      http.post("*/captures", async ({ request }) => {
        const b = (await request.json()) as { text?: string };
        bodies.push(b.text ?? "");
        return HttpResponse.json({ id: "cap-c", received_at: "2026-11-15T12:00:00Z", lane: "internal", source: "web", text: b.text ?? "" });
      }),
    );
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.type(screen.getByLabelText("What do you want done?"), "Add a retry.");
    await user.click(screen.getByRole("button", { name: "More settings" }));
    await user.selectOptions(await screen.findByLabelText("Repository"), "Control-Rod");
    await user.type(screen.getByLabelText("Branch name"), "cr/x] [[workflow:pocock");
    await user.click(screen.getByRole("button", { name: /^Add (change|deliverable|packet)$/ }));
    expect(await screen.findByText("A branch name can't contain [ or ].")).toBeTruthy();
    expect(bodies).toEqual([]);
  });

  it("refuses a local clone whose folder name has brackets, so a folder name can never carry a tag", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();
    const bodies: string[] = [];
    const name = "CR] [workflow:pocock";
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [{ name, path: `/home/flyfission/projects/${name}`, branch: "main", remote_url: null, dirty: false }],
          github: [],
          github_error: null,
        }),
      ),
      http.post("*/captures", async ({ request }) => {
        const b = (await request.json()) as { text?: string };
        bodies.push(b.text ?? "");
        return HttpResponse.json({ id: "cap-d", received_at: "2026-11-15T12:00:00Z", lane: "internal", source: "web", text: b.text ?? "" });
      }),
    );
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.type(screen.getByLabelText("What do you want done?"), "Add a retry.");
    await user.click(screen.getByRole("button", { name: "More settings" }));
    await user.selectOptions(await screen.findByLabelText("Repository"), name);
    await user.click(screen.getByRole("button", { name: /^Add (change|deliverable|packet)$/ }));
    expect(await screen.findByText(/This repository's name contains \[ or \]/)).toBeTruthy();
    expect(bodies).toEqual([]);
  });

  it("refuses a prepared workspace whose path has brackets, so a path can never carry a tag", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();
    const bodies: string[] = [];
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [{ name: "Control-Rod", path: "/home/flyfission/projects/Control-Rod", branch: "main", remote_url: null, dirty: false }],
          github: [],
          github_error: null,
        }),
      ),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch"; mode?: string };
        return HttpResponse.json({
          ok: true,
          strategy: body.strategy,
          mode: body.mode,
          repo: body.repo,
          branch: body.branch,
          local_path: "/home/flyfission/x] [workflow:pocock/w",
        });
      }),
      http.post("*/captures", async ({ request }) => {
        const b = (await request.json()) as { text?: string };
        bodies.push(b.text ?? "");
        return HttpResponse.json({ id: "cap-e", received_at: "2026-11-15T12:00:00Z", lane: "internal", source: "web", text: b.text ?? "" });
      }),
    );
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.type(screen.getByLabelText("What do you want done?"), "Add a retry.");
    await user.click(screen.getByRole("button", { name: "More settings" }));
    await user.selectOptions(await screen.findByLabelText("Repository"), "Control-Rod");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Local checkout prepared:/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Add (change|deliverable|packet)$/ }));
    expect(await screen.findByText(/This workspace's path contains \[ or \]/)).toBeTruthy();
    expect(bodies).toEqual([]);
  });

  it("pairs reasoning effort levels to runnable CLI ecosystems and models", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null }),
      ),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);

    const cliSelects = screen.getAllByLabelText("CLI Ecosystem");
    const authorCli = cliSelects[0] as HTMLSelectElement;
    const optionValues = Array.from(authorCli.options).map((o) => o.value);
    expect(optionValues).not.toContain("gemini");
    expect(optionValues).toContain("claude");
    expect(optionValues).toContain("codex");

    const authorReasonGroup = screen.getByRole("group", { name: /1\. Author \(Agent\) reasoning level/i });
    const modelSelects = screen.getAllByLabelText("Model");

    // Codex sol-6.1 supports xhigh, whereas Codex o3 drops xhigh and falls back to medium
    await user.selectOptions(authorCli, "codex");
    const xhighBtn = within(authorReasonGroup).getByRole("button", { name: "xhigh" });
    await user.click(xhighBtn);
    expect(xhighBtn.getAttribute("aria-pressed")).toBe("true");

    await user.selectOptions(modelSelects[0]!, "o3");
    expect(within(authorReasonGroup).queryByRole("button", { name: "xhigh" })).toBeNull();
    const authorMed = within(authorReasonGroup).getByRole("button", { name: "medium" });
    expect(authorMed.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders github_error inline when GitHub repository listing fails", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [],
          github: [],
          github_error: "gh auth status failed: not logged in",
        }),
      ),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("gh auth status failed: not logged in");
  });

  it("falls back in loadWorkDefaults when stored runtime is non-runnable or model/reasoning is invalid", () => {
    localStorage.setItem(
      "cr.work-defaults.software",
      JSON.stringify({
        author: { ecosystem: "opencode", model: "default", reasoning: "default" },
        checker: { ecosystem: "codex", model: "bad model with spaces", reasoning: "xhigh" },
      }),
    );

    const loaded = loadWorkDefaults("software");
    expect(loaded.author).toEqual({ ecosystem: "claude", model: "default", reasoning: "default" });
    expect(loaded.checker).toEqual({ ecosystem: "codex", model: "default", reasoning: "xhigh" });

    localStorage.setItem(
      "cr.work-defaults.software",
      JSON.stringify({
        author: { ecosystem: "claude", model: "haiku", reasoning: "max" },
      }),
    );
    const loaded2 = loadWorkDefaults("software");
    expect(loaded2.author).toEqual({ ecosystem: "claude", model: "haiku", reasoning: "low" });
  });

  it("keeps the prepared branch pinned across objective edits and invalidates on branch edit", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let capturedBody: NewCapture | null = null;
    const materializeRequests: Array<{ mode?: string; branch: string }> = [];
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [{ name: "Control-Rod", path: "/home/flyfission/projects/Control-Rod", branch: "main", remote_url: null, dirty: false }],
          github: [],
          github_error: null,
        }),
      ),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch"; mode?: string };
        materializeRequests.push(body);
        return HttpResponse.json({
          ok: true,
          strategy: body.strategy,
          mode: body.mode,
          repo: body.repo,
          branch: body.branch,
          local_path: `/home/flyfission/projects/.worktrees/Control-Rod/${body.branch.replace(/\//g, "-")}`,
        });
      }),
      http.post("*/captures", async ({ request }) => {
        capturedBody = (await request.json()) as NewCapture;
        return HttpResponse.json({ id: "cap-2", received_at: "2026-11-15T12:00:00Z", lane: "internal", source: "web", text: capturedBody.text ?? "" });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    const objectiveBox = screen.getByLabelText("What do you want done?");
    await user.type(objectiveBox, "Initial task");

    await openCaptureSettings(user);
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "Control-Rod");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-initial-task/i)).toBeTruthy();
    expect(materializeRequests.at(-1)?.mode).toBe("software");

    // Editing the objective preserves preparedPath and pinned branch
    await user.type(objectiveBox, " with extra details");
    expect(screen.getByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-initial-task/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add change" }));
    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.text).toContain("[branch:cr/initial-task]");
    expect(capturedBody!.checkout).toEqual({
      repo: "Control-Rod",
      local_path: "/home/flyfission/projects/.worktrees/Control-Rod/cr-initial-task",
      workspace_root: "/home/flyfission/projects",
      branch: "cr/initial-task",
    });

    // Re-open, prepare again, then change explicit branch in capture settings -> clears preparedPath
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.type(screen.getByLabelText("What do you want done?"), "Second task");
    await openCaptureSettings(user);
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-second-task/i)).toBeTruthy();

    await openCaptureSettings(user);
    await user.type(screen.getByLabelText("Branch name"), "cr/custom-branch");
    expect(screen.queryByText(/Local checkout prepared:/i)).toBeNull();
  });

  it("discards a delayed /repos/materialize response when repo changes mid-flight", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let resolveSlow!: (val: Response) => void;
    const slowPromise = new Promise<Response>((res) => {
      resolveSlow = res;
    });

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [
            { name: "Repo-A", path: "/home/flyfission/projects/Repo-A", branch: "main", remote_url: null, dirty: false },
            { name: "Repo-B", path: "/home/flyfission/projects/Repo-B", branch: "main", remote_url: null, dirty: false },
          ],
          github: [],
          github_error: null,
        }),
      ),
      http.post("*/repos/materialize", async () => slowPromise),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "Repo-A");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(screen.getByRole("button", { name: "Preparing workspace…" })).toBeTruthy();

    // Switch repo while first materialize request is still pending: Prepare re-enables immediately
    await user.selectOptions(repoSelect, "Repo-B");
    const prepareBtnAfterSwitch = screen.getByRole("button", { name: "Prepare local workspace" }) as HTMLButtonElement;
    expect(prepareBtnAfterSwitch.disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /Preparing workspace/i })).toBeNull();

    resolveSlow(
      HttpResponse.json({
        ok: true,
        strategy: "worktree",
        repo: "Repo-A",
        branch: "cr/work-package",
        local_path: "/home/flyfission/projects/.worktrees/Repo-A/cr-work-package",
      }),
    );

    await waitFor(() => expect((screen.getByRole("button", { name: "Prepare local workspace" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Repo-A/i)).toBeNull();
  });

  it("allows preparing Repo-B while delayed Repo-A request is still in flight", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let resolveRepoA!: (val: Response) => void;
    const repoAPromise = new Promise<Response>((res) => {
      resolveRepoA = res;
    });

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [
            { name: "Repo-A", path: "/home/flyfission/projects/Repo-A", branch: "main", remote_url: null, dirty: false },
            { name: "Repo-B", path: "/home/flyfission/projects/Repo-B", branch: "main", remote_url: null, dirty: false },
          ],
          github: [],
          github_error: null,
        }),
      ),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch" };
        if (body.repo === "Repo-A") return repoAPromise;
        return HttpResponse.json({
          ok: true,
          strategy: body.strategy,
          repo: body.repo,
          branch: body.branch,
          local_path: `/home/flyfission/projects/.worktrees/Repo-B/${body.branch.replace(/\//g, "-")}`,
        });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "Repo-A");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));

    // Switching to Repo-B immediately enables Prepare so user doesn't have to wait for Repo-A
    await user.selectOptions(repoSelect, "Repo-B");
    const prepareBtn = screen.getByRole("button", { name: "Prepare local workspace" }) as HTMLButtonElement;
    expect(prepareBtn.disabled).toBe(false);

    await user.click(prepareBtn);
    expect(await screen.findByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Repo-B/i)).toBeTruthy();

    // Delayed Repo-A settles afterwards and does not clobber Repo-B's ready state
    resolveRepoA(
      HttpResponse.json({
        ok: true,
        strategy: "worktree",
        repo: "Repo-A",
        branch: "cr/work-package",
        local_path: "/home/flyfission/projects/.worktrees/Repo-A/cr-work-package",
      }),
    );
    await waitFor(() => expect(screen.getByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Repo-B/i)).toBeTruthy());
    expect(screen.queryByText(/Local checkout prepared:.*Repo-A/i)).toBeNull();
  });

  it("clears error, defaultsNotice, and prepared state on close and ignores in-flight materialize", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let callCount = 0;
    let resolveSecond!: (val: Response) => void;
    const secondPromise = new Promise<Response>((res) => {
      resolveSecond = res;
    });

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [{ name: "Control-Rod", path: "/home/flyfission/projects/Control-Rod", branch: "main", remote_url: null, dirty: false }],
          github: [],
          github_error: null,
        }),
      ),
      http.post("*/repos/materialize", async ({ request }) => {
        callCount += 1;
        if (callCount === 2) return secondPromise;
        const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch" };
        return HttpResponse.json({
          ok: true,
          strategy: body.strategy,
          repo: body.repo,
          branch: body.branch,
          local_path: `/home/flyfission/projects/.worktrees/Control-Rod/${body.branch.replace(/\//g, "-")}`,
        });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "Control-Rod");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod/i)).toBeTruthy();

    await openCaptureSettings(user);
    await user.click(screen.getByRole("button", { name: "Save as my defaults" }));
    expect(screen.getByText(/Saved defaults for Software mode/i)).toBeTruthy();

    // Trigger validation error
    await user.click(screen.getByRole("button", { name: "Add change" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter an objective or scope before capturing.");

    // Close via Cancel and reopen -> stale preparedPath, defaultsNotice, and error are cleared
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    expect(screen.queryByText(/Local checkout prepared:/i)).toBeNull();
    expect(screen.queryByText(/Saved defaults for Software mode/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    // Start a second materialize, close via Esc while pending, resolve it, then reopen
    await openCaptureSettings(user);
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(screen.getByRole("button", { name: "Preparing workspace…" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close" }));

    resolveSecond(
      HttpResponse.json({
        ok: true,
        strategy: "worktree",
        repo: "Control-Rod",
        branch: "cr/work-package",
        local_path: "/home/flyfission/projects/.worktrees/Control-Rod/stale-close",
      }),
    );

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);
    const btnAfterReopen = screen.getByRole("button", { name: "Prepare local workspace" }) as HTMLButtonElement;
    expect(btnAfterReopen.disabled).toBe(false);
    expect(screen.queryByText(/Local checkout prepared:/i)).toBeNull();
  });

  it("clears previously succeeded preparedPath and preparedBranch when re-prepare fails", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let attempt = 0;
    let capturedBody: NewCapture | null = null;
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [{ name: "Control-Rod", path: "/home/flyfission/projects/Control-Rod", branch: "main", remote_url: null, dirty: false }],
          github: [],
          github_error: null,
        }),
      ),
      http.post("*/repos/materialize", async ({ request }) => {
        attempt += 1;
        if (attempt === 1) {
          const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch" };
          return HttpResponse.json({
            ok: true,
            strategy: body.strategy,
            repo: body.repo,
            branch: "cr/server-assigned-branch",
            local_path: "/home/flyfission/projects/.worktrees/Control-Rod/cr-server-assigned-branch",
          });
        }
        return HttpResponse.json({ code: "git_error", message: "git worktree add failed" }, { status: 500 });
      }),
      http.post("*/captures", async ({ request }) => {
        capturedBody = (await request.json()) as NewCapture;
        return HttpResponse.json({ id: "cap-3", received_at: "2026-11-15T12:00:00Z", lane: "internal", source: "web", text: capturedBody.text ?? "" });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.type(screen.getByLabelText("What do you want done?"), "Fix bug");
    await openCaptureSettings(user);
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "Control-Rod");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-server-assigned-branch/i)).toBeTruthy();

    // Re-prepare fails -> prior Ready path and preparedBranch must be cleared
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect((await screen.findByRole("alert")).textContent).toContain("git worktree add failed");
    expect(screen.queryByText(/Local checkout prepared:/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add change" }));
    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.text).not.toContain("[workspace:");
    expect(capturedBody!.text).toContain("[branch:cr/fix-bug]");
    expect(capturedBody!.checkout).toBeUndefined();
  });

  it("defensively validates corrupt localStorage values in loadWorkDefaults and renders NewWorkModal safely", async () => {
    const base = factoryDefaults("software");
    for (const bad of ["null", '"bad"', "[1,2]", "{not-json"]) {
      localStorage.setItem("cr.work-defaults.software", bad);
      expect(loadWorkDefaults("software")).toEqual(base);
    }

    localStorage.setItem(
      "cr.work-defaults.software",
      JSON.stringify({
        project: 123,
        repoStrategy: "bogus",
        lane: "not-a-lane",
        grade: "invalid-grade",
        detailLevel: 42,
        workspaceRoot: false,
        repo: {},
        stage: null,
        purpose: 99,
        discipline: [],
        author: { ecosystem: "claude", model: 42, reasoning: [] },
        checker: "corrupt",
      }),
    );

    const sanitized = loadWorkDefaults("software");
    expect(sanitized).toEqual(base);

    saveMode("software");
    mockDialogMethods();
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null }),
      ),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    expect(screen.getByRole("heading", { name: "New change request" })).toBeTruthy();
  });

  it("renders an error alert when /repos fails", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () => HttpResponse.json({ code: "repo_err", message: "Repository scan failed" }, { status: 500 })),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Repository scan failed");
  });

  it("does not invalidate prepare when /repos hydrates after empty workspaceRoot", async () => {
    saveMode("software");
    localStorage.setItem(
      "cr.work-defaults.software",
      JSON.stringify({ ...factoryDefaults("software"), repo: "Control-Rod" }),
    );
    mockDialogMethods();

    let resolveRepos!: () => void;
    const reposPromise = new Promise<void>((res) => {
      resolveRepos = res;
    });

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/repos", async () => {
        await reposPromise;
        return HttpResponse.json({
          workspace_root: "/home/flyfission/projects",
          local: [{ name: "Control-Rod", path: "/home/flyfission/projects/Control-Rod", branch: "main", remote_url: null, dirty: false }],
          github: [],
          github_error: null,
        });
      }),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch" };
        // Resolve /repos with a server workspace_root right as materialize completes
        resolveRepos();
        return HttpResponse.json({
          ok: true,
          strategy: body.strategy,
          repo: body.repo,
          branch: body.branch,
          local_path: "/home/flyfission/projects/.worktrees/Control-Rod/cr-work-package",
        });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Local checkout prepared: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-work-package/i)).toBeTruthy();
  });

  it("isolates in-flight /captures success when modal is closed and reopened", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let resolveCapture!: (val: Response) => void;
    const capturePromise = new Promise<Response>((res) => {
      resolveCapture = res;
    });
    const capturedPayload: Partial<NewCapture> = {};

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null }),
      ),
      http.post("*/captures", async ({ request }) => {
        Object.assign(capturedPayload, (await request.json()) as NewCapture);
        return capturePromise;
      }),
    );

    const { qc } = await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    const objectiveBox = screen.getByLabelText("What do you want done?") as HTMLTextAreaElement;
    await user.type(objectiveBox, "First pending objective");
    await user.click(screen.getByRole("button", { name: "Add change" }));

    expect(screen.getByRole("button", { name: "Adding…" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Adding…" }) as HTMLButtonElement).disabled).toBe(true);

    // Close modal while capture is in flight, then reopen and start typing a new objective
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));

    // Reopened modal's submit button must NOT be stuck disabled
    const submitBtn = screen.getByRole("button", { name: "Add change" }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    const reopenedBox = screen.getByLabelText("What do you want done?") as HTMLTextAreaElement;
    await user.clear(reopenedBox);
    await user.type(reopenedBox, "Brand new objective");

    // First capture succeeds now
    resolveCapture(
      HttpResponse.json({
        id: "cap-slow-ok",
        received_at: "2026-11-15T12:00:00Z",
        lane: capturedPayload.lane ?? "internal",
        source: "web",
        text: capturedPayload.text ?? "",
      }),
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["captures"] });
    });

    // Reopened modal stays open, new objective is preserved, and no stale error is shown
    const dialog = document.querySelector("dialog.cr-modal");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect((screen.getByLabelText("What do you want done?") as HTMLTextAreaElement).value).toBe("Brand new objective");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("isolates in-flight /captures error when modal is closed and reopened", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let resolveCapture!: (val: Response) => void;
    const capturePromise = new Promise<Response>((res) => {
      resolveCapture = res;
    });

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null }),
      ),
      http.post("*/captures", async () => capturePromise),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.type(screen.getByLabelText("What do you want done?"), "Failing objective");
    await user.click(screen.getByRole("button", { name: "Add change" }));
    expect(screen.getByRole("button", { name: "Adding…" })).toBeTruthy();

    // Close via Esc while capture is in flight, then reopen and enter a fresh objective
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));

    const submitBtn = screen.getByRole("button", { name: "Add change" }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    const reopenedBox = screen.getByLabelText("What do you want done?") as HTMLTextAreaElement;
    await user.clear(reopenedBox);
    await user.type(reopenedBox, "Recovered objective");

    // First capture fails now
    resolveCapture(HttpResponse.json({ code: "capture_err", message: "Capture failed on server" }, { status: 500 }));

    // Give React Query a tick to settle the mutation error
    await new Promise((r) => setTimeout(r, 20));

    // Reopened modal stays open, objective preserved, and no stale error alert appears
    const dialog = document.querySelector("dialog.cr-modal");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect((screen.getByLabelText("What do you want done?") as HTMLTextAreaElement).value).toBe("Recovered objective");
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Add change" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("refuses submission and retains draft when composed header + objective exceeds CAPTURE_LIMIT", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let captureCalled = false;
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          runtimes: [
            { runtime: "claude", ready: true, login_checked: false, models: ["default", "sonnet", "opus", "haiku"] },
            { runtime: "codex", ready: true, login_checked: true, models: ["default", "gpt-6.2-sol", "o3"] },
          ],
          pins: [],
        }),
      ),
      http.get("*/repos", () =>
        HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null }),
      ),
      http.post("*/captures", () => {
        captureCalled = true;
        return HttpResponse.json({ id: "cap-overflow", received_at: "2026-11-15T12:00:00Z", lane: "internal", source: "web", text: "" });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    const objectiveBox = screen.getByLabelText("What do you want done?") as HTMLTextAreaElement;
    // Objective itself is under CAPTURE_LIMIT, but the composed metadata header pushes body.length over CAPTURE_LIMIT.
    const longObjective = "a".repeat(CAPTURE_LIMIT - 20);
    fireEvent.change(objectiveBox, { target: { value: longObjective } });

    await user.click(screen.getByRole("button", { name: "Add change" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(CAPTURE_LIMIT.toLocaleString());
    expect(alert.textContent).toMatch(/too long/i);
    expect(captureCalled).toBe(false);
    expect((screen.getByLabelText("What do you want done?") as HTMLTextAreaElement).value).toBe(longObjective);
  });

  it("resets stale project defaults when switching from an active project back to All Software", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    const proj: WorkspaceProject = {
      id: "proj-alpha",
      name: "Alpha Project",
      mode: "software",
      status: "active",
      repo: "alpha-repo",
      repoStrategy: "fresh-clone",
      workspaceRoot: "/tmp/alpha-root",
      lane: "internal",
      author: { ecosystem: "claude", model: "default", reasoning: "default" },
      checker: { ecosystem: "codex", model: "default", reasoning: "default" },
      createdAt: "2026-11-22T00:00:00Z",
    };
    hydrateServerProjects("ben", [proj]);
    selectProject("ben", "proj-alpha");

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/workspace/projects", () => HttpResponse.json([proj])),
      http.get("*/runtimes", () => HttpResponse.json({ runtimes: [], pins: [] })),
      http.get("*/repos", () => HttpResponse.json({ workspace_root: "/tmp/alpha-root", local: [], github: [], github_error: null })),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);
    expect((screen.getByLabelText("Repository") as HTMLSelectElement).value).toBe("alpha-repo");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: /All Software/i }));

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await openCaptureSettings(user);
    expect((screen.getByLabelText("Repository") as HTMLSelectElement).value).toBe("");
  });
});
