import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import type { WorkspaceProject } from "../api/types.js";
import { browserPasskeys } from "../lib/decide.js";
import { WorkspaceProjectUser, hydrateServerProjects, selectProject } from "../lib/projects.js";
import { saveMode } from "../lib/mode.js";
import { ALL_SIGNED, signingPreset } from "../lib/signing.js";
import { buildCouncilFlow } from "../lib/councilFlow.js";
import { CHECK_IN_CHOICES, type AgentRow } from "../lib/agents.js";
import { guideSteps, type GuideState } from "../features/board/FirstRunGuide.js";
import { NewWorkModal } from "./NewWorkModal.js";
import { ProjectModal } from "./ProjectModal.js";

/**
 * Balanced is the default for new projects (WEB-1): the person signs each accept. These tests hold
 * the create payload to that default and the words on New Work, the guide and the workflow view to
 * the steps the project's settings really take.
 */

function mockDialogMethods() {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

const base: WorkspaceProject = {
  id: "prj_sign", name: "Signing", mode: "software", status: "active", repo: "",
  repoStrategy: "worktree", workspaceRoot: "", lane: "internal",
  author: { ecosystem: "claude", model: "default", reasoning: "default" },
  checker: { ecosystem: "codex", model: "default", reasoning: "default" },
  createdAt: "2026-11-28T00:00:00Z",
};
const withPreset = (id: "light" | "balanced" | "everything"): WorkspaceProject => ({
  ...base,
  signing: { preset: id, steps: signingPreset(id).steps, version: 1, signed_by: "ben", signed_at: "2026-11-28T00:00:00Z" },
});

beforeEach(() => {
  localStorage.clear();
  mockDialogMethods();
  saveMode("software");
  server.use(
    http.get("*/workspace/projects", () => HttpResponse.json([])),
    http.get("*/repos", () => HttpResponse.json({ workspace_root: "/home/u/projects", local: [], github: [], github_error: null })),
    http.get("*/runtimes", () => HttpResponse.json({ runtimes: [], pins: [] })),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("a new project", () => {
  it("is created at Balanced, and the form says what Balanced does", async () => {
    const bodies: { payload: Record<string, unknown> }[] = [];
    server.use(
      http.post("*/admin/commands/project.workspace-create/options", () => HttpResponse.json({ options: { challenge: "c" } })),
      http.post("*/workspace/projects", async ({ request }) => {
        const body = (await request.json()) as { payload: Record<string, unknown> };
        bodies.push(body);
        return HttpResponse.json({ ...base, name: String(body.payload.name) }, { status: 201 });
      }),
    );
    vi.spyOn(browserPasskeys, "get").mockResolvedValue({ id: "credential" });
    await renderPage(<ProjectModal open defaultMode="software" onClose={() => {}} />);
    expect(screen.getByText(/Cards start on their own\. You sign each accept with your passkey before the work is handed over\./)).toBeTruthy();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Project name"), "Signing");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]!.payload.signing_preset).toBe("balanced");
  });
});

describe("New Work", () => {
  async function header(project: WorkspaceProject | null, expected: RegExp) {
    if (project) {
      hydrateServerProjects("ben", [project]);
      selectProject("ben", project.id);
    }
    await renderPage(
      <WorkspaceProjectUser.Provider value="ben">
        <NewWorkModal open mode="software" onClose={() => {}} />
      </WorkspaceProjectUser.Provider>,
    );
    await waitFor(() => expect(screen.getByText(/^An agent turns this into a plan\./).textContent).toMatch(expected));
  }

  it("says the card starts on its own and the accept is signed, under Balanced", async () => {
    await header(
      withPreset("balanced"),
      /^An agent turns this into a plan\. It starts on its own once the plan is drafted, and you sign each accept with your passkey before the work is handed over\.$/,
    );
  });

  it("says plainly that Light accepts on its own", async () => {
    await header(withPreset("light"), /accepted and handed over on its own\.$/);
  });

  it("says nothing starts unsigned when no project covers the card", async () => {
    await header(null, /Nothing starts until you sign its release with your passkey/);
  });

  it("says nothing starts unsigned for a project with no saved settings", async () => {
    await header(base, /Nothing starts until you sign its release with your passkey/);
  });
});

describe("the first-run guide", () => {
  const state: GuideState = { agentReady: true, hasRepoProject: true, hasCard: true, released: false, accepted: false };
  const step = (signing: GuideState["signing"], id: "release" | "accept") => guideSteps({ ...state, ...(signing ? { signing } : {}) }).find((s) => s.id === id)!;

  it("follows Balanced: the plan starts on its own, and the accept is signed", () => {
    expect(step(signingPreset("balanced").steps, "release").why).toMatch(/starts on its own/);
    expect(step(signingPreset("balanced").steps, "accept").why).toMatch(/sign Accept with your passkey/);
  });

  it("follows Light and Everything", () => {
    expect(step(signingPreset("light").steps, "accept").why).toMatch(/accepted on its own/);
    expect(step(ALL_SIGNED, "release").why).toMatch(/sign Release with your passkey\. The agents start then, not before\./);
  });

  it("claims neither when the board does not know the project", () => {
    expect(step(undefined, "release").why).toMatch(/as the project's settings say/);
    expect(step(undefined, "accept").why).toMatch(/The project's settings say/);
  });
});

describe("the workflow view and check-ins", () => {
  const rows = [] as AgentRow[];

  it("draws Balanced as a plan that starts on its own and an accept that stops for you", () => {
    const f = buildCouncilFlow(rows, "start-and-merge", undefined, signingPreset("balanced").steps);
    expect(f.steps.find((s) => s.id === "approve")).toMatchObject({ title: "The plan starts on its own" });
    expect(f.steps.find((s) => s.id === "approve")?.stop).toBeUndefined();
    expect(f.steps.find((s) => s.id === "merge")).toMatchObject({ stop: "on", title: "You accept the work" });
    expect(f.matrix.find((r) => r.step === "Approve the plan")?.stopsForYou).toBe("no");
  });

  it("draws Light's accept as on its own, and keeps every step signed when no settings apply", () => {
    const light = buildCouncilFlow(rows, "start-and-merge", undefined, signingPreset("light").steps);
    expect(light.steps.find((s) => s.id === "merge")?.stop).toBeUndefined();
    expect(light.matrix.find((r) => r.step === "Accept the work")?.stopsForYou).toBe("no");
    const none = buildCouncilFlow(rows, "start-and-merge");
    expect(none.steps.find((s) => s.id === "approve")?.detail).toBe("Signed with your passkey, then released");
  });

  it("no longer says the check-in in force signs the plan's release", () => {
    const today = CHECK_IN_CHOICES.find((c) => c.id === "start-and-merge")!;
    expect(today.detail).not.toMatch(/sign the plan's release/);
    expect(today.detail).toMatch(/What needs your passkey/);
  });
});
