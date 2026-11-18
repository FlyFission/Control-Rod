import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import type { Session } from "../api/types.js";
import { Shell } from "./Shell.js";
import { saveMode } from "../lib/mode.js";
import { loadWorkDefaults, resetWorkDefaults } from "../lib/workDefaults.js";

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
        const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch" };
        return HttpResponse.json({
          ok: true,
          strategy: body.strategy,
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
        const body = (await request.json()) as { repo: string; branch: string; strategy: "worktree" | "fresh-clone" | "branch" };
        return HttpResponse.json({
          ok: true,
          strategy: body.strategy,
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

    // Switch repo while first materialize request is still pending
    await user.selectOptions(repoSelect, "Repo-B");

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
});
