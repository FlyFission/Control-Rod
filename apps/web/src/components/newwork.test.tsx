import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import type { Session } from "../api/types.js";
import { Shell } from "./Shell.js";
import { saveMode } from "../lib/mode.js";
import { resetWorkDefaults } from "../lib/workDefaults.js";

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

  it("supports Simple vs Advanced mode, auto-inference, 4-choice clarifying questions, and saved defaults", async () => {
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

    // Starts in Simple mode: advanced fields are hidden
    expect(screen.getByRole("button", { name: "Simple" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("Project Stage / Gate")).toBeNull();

    // Typing a safety-critical process scope auto-infers discipline, stage, and grade
    await user.type(screen.getByLabelText("Design basis & acceptance criteria"), "Verify ASME relief valve orifice sizing.");
    expect(screen.getByText(/Auto-matched: Safety-critical process scope detected/i)).toBeTruthy();

    // Open 4-choice clarifying questions and pick an option
    await user.click(screen.getByRole("button", { name: /Clarify scope/i }));
    const opt = screen.getByRole("button", { name: /Applicable ASME \/ API \/ NFPA \/ NEC code/i });
    await user.click(opt);
    expect(opt.getAttribute("aria-pressed")).toBe("true");

    // Switch to Advanced mode and inspect Project Stage, Issue Purpose, CLI ecosystems
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    const repoSelect = await screen.findByLabelText("Repository");
    await user.selectOptions(repoSelect, "FlyFission/Control-Rod");
    await user.click(screen.getByRole("button", { name: "Prepare local workspace" }));
    expect(await screen.findByText(/Ready: \/home\/flyfission\/projects\/\.worktrees\/Control-Rod/i)).toBeTruthy();

    const stageSelect = screen.getByLabelText("Project Stage / Gate") as HTMLSelectElement;
    expect(stageSelect.value).toBe("Detailed Design (60%)");

    const purposeSelect = screen.getByLabelText("Issue Purpose") as HTMLSelectElement;
    await user.selectOptions(purposeSelect, "Issue for Permit (IFP)");

    const cliSelects = screen.getAllByLabelText("CLI Ecosystem");
    await user.selectOptions(cliSelects[0]!, "agy");
    const modelSelects = screen.getAllByLabelText("Model");
    expect((modelSelects[0] as HTMLSelectElement).value).toBe("argon");
    expect((modelSelects[1] as HTMLSelectElement).value).toBe("sol-6.1");

    // Same ecosystem triggers O6 Notice, switching back restores O6 Custody OK
    await user.selectOptions(cliSelects[1]!, "agy");
    expect(screen.getByText(/O6 Notice:/i)).toBeTruthy();
    await user.selectOptions(cliSelects[1]!, "codex");
    expect(screen.getByText(/O6 Custody OK:/i)).toBeTruthy();

    // Save defaults
    await user.click(screen.getByRole("button", { name: "Save as my defaults" }));
    expect(screen.getByText(/Saved defaults for Capital Projects mode/i)).toBeTruthy();

    // Submit and verify metadata + clarifications
    await user.click(screen.getByRole("button", { name: "Capture deliverable" }));
    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.text).toContain("[mode:capital-projects]");
    expect(capturedBody!.text).toContain("[repo:FlyFission/Control-Rod]");
    expect(capturedBody!.text).toContain("[outfall:worktree]");
    expect(capturedBody!.text).toContain("[workspace:/home/flyfission/projects/.worktrees/Control-Rod/");
    expect(capturedBody!.text).toContain("[stage:Detailed Design (60%)]");
    expect(capturedBody!.text).toContain("[purpose:Issue for Permit (IFP)]");
    expect(capturedBody!.text).toContain("[author:agy/argon@high]");
    expect(capturedBody!.text).toContain("[checker:codex/sol-6.1@medium]");
    expect(capturedBody!.text).toContain("Clarifications:");
    expect(capturedBody!.text).toContain("Applicable ASME / API / NFPA / NEC code");
  });
});
