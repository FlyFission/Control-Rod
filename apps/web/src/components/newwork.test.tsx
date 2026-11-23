import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import type { Session } from "../api/types.js";
import { CAPTURE_LIMIT } from "./CaptureBox.js";
import { Shell } from "./Shell.js";
import { saveMode } from "../lib/mode.js";
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

describe("engineering mode toggle and NewWorkModal", () => {
  it("switches between Software and Capital Projects mode in the shell", async () => {
    saveMode("software");
    server.use(http.get("*/inbox", () => HttpResponse.json({ items: [] })));
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: /\+ New change/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Software" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Capital Projects" }));
    expect(screen.getByRole("button", { name: /\+ New deliverable/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capital Projects" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("supports Simple vs Advanced mode, auto-inference, runnable-only CLIs, and saved defaults", async () => {
    saveMode("capital-projects");
    resetWorkDefaults("capital-projects");
    mockDialogMethods();

    let capturedBody: { text?: string; lane?: string } | null = null;
    const materializeRequests: Array<{ mode?: string }> = [];
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
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
        capturedBody = (await request.json()) as { text?: string; lane?: string };
        return HttpResponse.json({ id: "cap-1", received_at: "2026-11-15T12:00:00Z", lane: capturedBody.lane ?? "internal", source: "web", text: capturedBody.text ?? "" });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New deliverable/i }));
    expect(screen.getByRole("heading", { name: "New engineering deliverable" })).toBeTruthy();
    expect(screen.queryByText(/4-choice clarifications/i)).toBeNull();

    // Starts in Simple mode: bare minimum viable controls are visible, advanced-only fields are hidden
    expect(screen.getByRole("button", { name: "Simple" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Repository")).toBeTruthy();
    expect(screen.getByLabelText("Discipline / Area")).toBeTruthy();
    expect(screen.getByLabelText("Project Stage / Gate")).toBeTruthy();
    expect(screen.getByLabelText("Data lane")).toBeTruthy();
    expect(screen.getByLabelText("Grade")).toBeTruthy();
    expect(screen.queryByLabelText("Issue Purpose")).toBeNull();
    expect(screen.queryByLabelText("Default working location")).toBeNull();

    // Typing a safety-critical process scope auto-infers discipline, stage, and grade
    await user.type(screen.getByLabelText("Design basis & acceptance criteria"), "Verify ASME relief valve orifice sizing.");
    expect(screen.getByText(/Auto-matched: Safety-critical process scope detected/i)).toBeTruthy();

    // Pick repository and prepare local workspace right from Simple or Advanced mode
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "FlyFission/Control-Rod");
    expect(screen.getByText(/Cycle 2/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod/i)).toBeTruthy();
    expect(materializeRequests.at(-1)?.mode).toBe("capital-projects");

    // Switch to Advanced mode and inspect Issue Purpose, CLI ecosystems, and Save defaults
    await user.click(screen.getByRole("button", { name: "Advanced" }));

    const stageSelect = screen.getByLabelText("Project Stage / Gate") as HTMLSelectElement;
    expect(stageSelect.value).toBe("Detailed Design (60%)");

    const purposeSelect = screen.getByLabelText("Issue Purpose") as HTMLSelectElement;
    await user.selectOptions(purposeSelect, "Issue for Permit (IFP)");

    const cliSelects = screen.getAllByLabelText("CLI Ecosystem");
    const authorCli = cliSelects[0] as HTMLSelectElement;
    for (const id of ["agy", "opencode", "grok", "cursor", "copilot", "aider", "cline", "ollama"]) {
      const opt = Array.from(authorCli.options).find((o) => o.value === id);
      expect(opt, id).toBeTruthy();
      expect(opt!.disabled, `${id} disabled`).toBe(true);
      expect(opt!.textContent).toContain("Not yet runnable");
    }

    await user.selectOptions(cliSelects[0]!, "codex");
    const modelSelects = screen.getAllByLabelText("Model");
    expect((modelSelects[0] as HTMLSelectElement).value).toBe("sol-6.1");
    expect((modelSelects[1] as HTMLSelectElement).value).toBe("sol-6.1");

    // Same ecosystem triggers O6 Notice, switching back restores Distinct ecosystems message
    expect(screen.getByText(/O6 Notice:/i)).toBeTruthy();
    await user.selectOptions(cliSelects[0]!, "claude");
    expect(screen.getByText(/Distinct ecosystems \(baselines checked at run time\):/i)).toBeTruthy();

    // Save defaults
    await user.click(screen.getByRole("button", { name: "Save as my defaults" }));
    expect(screen.getByText(/Saved defaults for Capital Projects mode/i)).toBeTruthy();

    // Submit and verify metadata
    await user.click(screen.getByRole("button", { name: "Capture deliverable" }));
    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.text).toContain("[mode:capital-projects]");
    expect(capturedBody!.text).toContain("[repo:FlyFission/Control-Rod]");
    expect(capturedBody!.text).toContain("[outfall:worktree]");
    expect(capturedBody!.text).toContain("[workspace:/home/flyfission/projects/.worktrees/Control-Rod/");
    expect(capturedBody!.text).toContain("[stage:Detailed Design (60%)]");
    expect(capturedBody!.text).toContain("[purpose:Issue for Permit (IFP)]");
    expect(capturedBody!.text).toContain("[author:claude/claude-sonnet-4-5@medium]");
    expect(capturedBody!.text).toContain("[checker:codex/sol-6.1@medium]");
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
    const select = screen.getByLabelText("Workflow") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Project default", "Playbook", "Superpowers", "Pocock", "Pocock Superpowers"]);
    await user.type(screen.getByLabelText(/Acceptance criteria|Design basis/i), "Add a retry to the sync job.");
    await user.click(screen.getByRole("button", { name: /^Capture/ }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toContain("[workflow:");

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.selectOptions(screen.getByLabelText("Workflow"), "pocock");
    await user.type(screen.getByLabelText(/Acceptance criteria|Design basis/i), "Add a retry to the sync job.");
    await user.click(screen.getByRole("button", { name: /^Capture/ }));
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
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.type(screen.getByLabelText("Project / Workstream"), "Plant] [[workflow:pocock");
    await user.type(screen.getByLabelText(/Acceptance criteria|Design basis/i), "Add a retry.");
    await user.click(screen.getByRole("button", { name: /^Capture (change|deliverable|packet)$/ }));
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
    await user.type(screen.getByLabelText("Scope & acceptance criteria"), "Add a retry.");
    await user.selectOptions(await screen.findByLabelText("Repository"), "Control-Rod");
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.type(screen.getByLabelText("Branch name"), "cr/x] [[workflow:pocock");
    await user.click(screen.getByRole("button", { name: /^Capture (change|deliverable|packet)$/ }));
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
    await user.type(screen.getByLabelText("Scope & acceptance criteria"), "Add a retry.");
    await user.selectOptions(await screen.findByLabelText("Repository"), name);
    await user.click(screen.getByRole("button", { name: /^Capture (change|deliverable|packet)$/ }));
    expect(await screen.findByText(/This repository's name contains \[ or \]/)).toBeTruthy();
    expect(bodies).toEqual([]);
  });

  it("pairs reasoning effort levels to runnable CLI ecosystems and models", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/repos", () =>
        HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null }),
      ),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.click(screen.getByRole("button", { name: "Advanced" }));

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
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("gh auth status failed: not logged in");
  });

  it("falls back in loadWorkDefaults when stored runtime is non-runnable or model/reasoning is invalid", () => {
    localStorage.setItem(
      "cr.work-defaults.software",
      JSON.stringify({
        author: { ecosystem: "agy", model: "argon", reasoning: "high" },
        checker: { ecosystem: "codex", model: "removed-model", reasoning: "xhigh" },
      }),
    );

    const loaded = loadWorkDefaults("software");
    expect(loaded.author).toEqual({ ecosystem: "claude", model: "claude-sonnet-4-5", reasoning: "medium" });
    expect(loaded.checker).toEqual({ ecosystem: "codex", model: "sol-6.1", reasoning: "xhigh" });

    localStorage.setItem(
      "cr.work-defaults.software",
      JSON.stringify({
        author: { ecosystem: "claude", model: "claude-haiku-4-5", reasoning: "max" },
      }),
    );
    const loaded2 = loadWorkDefaults("software");
    expect(loaded2.author).toEqual({ ecosystem: "claude", model: "claude-haiku-4-5", reasoning: "low" });
  });

  it("keeps preparedBranch pinned across Simple-mode objective edits and invalidates on branch edit", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let capturedBody: { text?: string } | null = null;
    const materializeRequests: Array<{ mode?: string }> = [];
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
        capturedBody = (await request.json()) as { text?: string };
        return HttpResponse.json({ id: "cap-2", received_at: "2026-11-15T12:00:00Z", lane: "internal", source: "web", text: capturedBody.text ?? "" });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    const objectiveBox = screen.getByLabelText("Scope & acceptance criteria");
    await user.type(objectiveBox, "Initial task");

    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "Control-Rod");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-initial-task/i)).toBeTruthy();
    expect(materializeRequests.at(-1)?.mode).toBe("software");

    // Editing objective in Simple mode preserves preparedPath and pinned branch
    await user.type(objectiveBox, " with extra details");
    expect(screen.getByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-initial-task/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Capture change" }));
    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.text).toContain("[branch:cr/initial-task]");
    expect(capturedBody!.text).toContain("[workspace:/home/flyfission/projects/.worktrees/Control-Rod/cr-initial-task]");

    // Re-open, prepare again, then change explicit branch in Advanced mode -> clears preparedPath
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.type(screen.getByLabelText("Scope & acceptance criteria"), "Second task");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-second-task/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.type(screen.getByLabelText("Branch name"), "cr/custom-branch");
    expect(screen.queryByText(/Ready:/i)).toBeNull();
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
    expect(screen.queryByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Repo-A/i)).toBeNull();
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
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "Repo-A");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));

    // Switching to Repo-B immediately enables Prepare so user doesn't have to wait for Repo-A
    await user.selectOptions(repoSelect, "Repo-B");
    const prepareBtn = screen.getByRole("button", { name: "Prepare local workspace" }) as HTMLButtonElement;
    expect(prepareBtn.disabled).toBe(false);

    await user.click(prepareBtn);
    expect(await screen.findByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Repo-B/i)).toBeTruthy();

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
    await waitFor(() => expect(screen.getByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Repo-B/i)).toBeTruthy());
    expect(screen.queryByText(/Ready:.*Repo-A/i)).toBeNull();
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
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "Control-Rod");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(screen.getByRole("button", { name: "Save as my defaults" }));
    expect(screen.getByText(/Saved defaults for Software mode/i)).toBeTruthy();

    // Trigger validation error
    await user.click(screen.getByRole("button", { name: "Capture change" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter an objective or scope before capturing.");

    // Close via Cancel and reopen -> stale preparedPath, defaultsNotice, and error are cleared
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    expect(screen.queryByText(/Ready:/i)).toBeNull();
    expect(screen.queryByText(/Saved defaults for Software mode/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    // Start a second materialize, close via Esc while pending, resolve it, then reopen
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(screen.getByRole("button", { name: "Preparing workspace…" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Esc" }));

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
    const btnAfterReopen = screen.getByRole("button", { name: "Prepare local workspace" }) as HTMLButtonElement;
    expect(btnAfterReopen.disabled).toBe(false);
    expect(screen.queryByText(/Ready:/i)).toBeNull();
  });

  it("clears previously succeeded preparedPath and preparedBranch when re-prepare fails", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let attempt = 0;
    let capturedBody: { text?: string } | null = null;
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
        capturedBody = (await request.json()) as { text?: string };
        return HttpResponse.json({ id: "cap-3", received_at: "2026-11-15T12:00:00Z", lane: "internal", source: "web", text: capturedBody.text ?? "" });
      }),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.type(screen.getByLabelText("Scope & acceptance criteria"), "Fix bug");
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "Control-Rod");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-server-assigned-branch/i)).toBeTruthy();

    // Re-prepare fails -> prior Ready path and preparedBranch must be cleared
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect((await screen.findByRole("alert")).textContent).toContain("git worktree add failed");
    expect(screen.queryByText(/Ready:/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Capture change" }));
    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.text).not.toContain("[workspace:");
    expect(capturedBody!.text).toContain("[branch:cr/fix-bug]");
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
      http.get("*/repos", () => HttpResponse.json({ code: "repo_err", message: "Repository scan failed" }, { status: 500 })),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
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

    let resolveRepos!: (val: Response) => void;
    const reposPromise = new Promise<Response>((res) => {
      resolveRepos = res;
    });

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/repos", async () => reposPromise),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch" };
        // Resolve /repos with a server workspace_root right as materialize completes
        resolveRepos(
          HttpResponse.json({
            workspace_root: "/home/flyfission/projects",
            local: [{ name: "Control-Rod", path: "/home/flyfission/projects/Control-Rod", branch: "main", remote_url: null, dirty: false }],
            github: [],
            github_error: null,
          }),
        );
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
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod\/cr-work-package/i)).toBeTruthy();
  });

  it("isolates in-flight /captures success when modal is closed and reopened", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let resolveCapture!: (val: Response) => void;
    const capturePromise = new Promise<Response>((res) => {
      resolveCapture = res;
    });
    const capturedPayload: { text?: string; lane?: string } = {};

    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
      http.get("*/repos", () =>
        HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null }),
      ),
      http.post("*/captures", async ({ request }) => {
        Object.assign(capturedPayload, (await request.json()) as { text?: string; lane?: string });
        return capturePromise;
      }),
    );

    const { qc } = await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    const objectiveBox = screen.getByLabelText("Scope & acceptance criteria") as HTMLTextAreaElement;
    await user.type(objectiveBox, "First pending objective");
    await user.click(screen.getByRole("button", { name: "Capture change" }));

    expect(screen.getByRole("button", { name: "Capturing…" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Capturing…" }) as HTMLButtonElement).disabled).toBe(true);

    // Close modal while capture is in flight, then reopen and start typing a new objective
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));

    // Reopened modal's submit button must NOT be stuck disabled
    const submitBtn = screen.getByRole("button", { name: "Capture change" }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    const reopenedBox = screen.getByLabelText("Scope & acceptance criteria") as HTMLTextAreaElement;
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
    expect((screen.getByLabelText("Scope & acceptance criteria") as HTMLTextAreaElement).value).toBe("Brand new objective");
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
      http.get("*/repos", () =>
        HttpResponse.json({ workspace_root: "/home/flyfission/projects", local: [], github: [], github_error: null }),
      ),
      http.post("*/captures", async () => capturePromise),
    );

    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ New change/i }));
    await user.type(screen.getByLabelText("Scope & acceptance criteria"), "Failing objective");
    await user.click(screen.getByRole("button", { name: "Capture change" }));
    expect(screen.getByRole("button", { name: "Capturing…" })).toBeTruthy();

    // Close via Esc while capture is in flight, then reopen and enter a fresh objective
    await user.click(screen.getByRole("button", { name: "Esc" }));
    await user.click(screen.getByRole("button", { name: /\+ New change/i }));

    const submitBtn = screen.getByRole("button", { name: "Capture change" }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    const reopenedBox = screen.getByLabelText("Scope & acceptance criteria") as HTMLTextAreaElement;
    await user.clear(reopenedBox);
    await user.type(reopenedBox, "Recovered objective");

    // First capture fails now
    resolveCapture(HttpResponse.json({ code: "capture_err", message: "Capture failed on server" }, { status: 500 }));

    // Give React Query a tick to settle the mutation error
    await new Promise((r) => setTimeout(r, 20));

    // Reopened modal stays open, objective preserved, and no stale error alert appears
    const dialog = document.querySelector("dialog.cr-modal");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect((screen.getByLabelText("Scope & acceptance criteria") as HTMLTextAreaElement).value).toBe("Recovered objective");
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Capture change" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("refuses submission and retains draft when composed header + objective exceeds CAPTURE_LIMIT", async () => {
    saveMode("software");
    resetWorkDefaults("software");
    mockDialogMethods();

    let captureCalled = false;
    server.use(
      http.get("*/inbox", () => HttpResponse.json({ items: [] })),
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
    const objectiveBox = screen.getByLabelText("Scope & acceptance criteria") as HTMLTextAreaElement;
    // Objective itself is under CAPTURE_LIMIT, but the composed metadata header pushes body.length over CAPTURE_LIMIT.
    const longObjective = "a".repeat(CAPTURE_LIMIT - 20);
    fireEvent.change(objectiveBox, { target: { value: longObjective } });

    await user.click(screen.getByRole("button", { name: "Capture change" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(CAPTURE_LIMIT.toLocaleString());
    expect(alert.textContent).toMatch(/too long/i);
    expect(captureCalled).toBe(false);
    expect((screen.getByLabelText("Scope & acceptance criteria") as HTMLTextAreaElement).value).toBe(longObjective);
  });
});
