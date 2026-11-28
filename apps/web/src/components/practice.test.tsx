import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceProject } from "../api/types.js";
import { Card } from "../features/board/Card.js";
import { CaptureCard } from "../features/board/CaptureCard.js";
import { FirstRunGuide, type GuideState } from "../features/board/FirstRunGuide.js";
import { deleteProject, hydrateServerProjects, useActiveProject, WorkspaceProjectUser } from "../lib/projects.js";
import { pkg } from "../test/fixtures.js";
import { renderPage } from "../test/render.js";
import { server } from "../test/server.js";
import { PracticeStart } from "./PracticeStart.js";

/** The practice run's entry points and labels (change record practice-agent). */
const practiceProject = {
  id: "prj_practice1",
  name: "Practice project",
  mode: "software",
  status: "active",
  repo: "",
  repoStrategy: "worktree",
  workspaceRoot: "",
  lane: "public",
  author: { ecosystem: "practice", model: "default", reasoning: "default" },
  checker: { ecosystem: "practice-check", model: "default", reasoning: "default" },
  work_lanes: { preset: "software", lanes: [] },
  practice: true,
  createdAt: "2026-11-28T09:00:00Z",
} as unknown as WorkspaceProject;

const passkeys = {
  get: async () => ({ id: "cred", response: {} }),
  create: async () => ({}),
};

function Active() {
  const p = useActiveProject();
  return <p>Open project: {p?.name ?? "none"}</p>;
}

afterEach(() => deleteProject("ben", practiceProject.id));

describe("Try a practice run", () => {
  it("signs the practice project with the passkey, adds the practice card, and opens the practice project", async () => {
    const calls: string[] = [];
    server.use(
      http.post("*/admin/commands/project.practice-start/options", async ({ request }) => {
        calls.push(`options ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "0".repeat(64) }, options: { challenge: "c" } });
      }),
      http.post("*/admin/commands/project.practice-start", async ({ request }) => {
        const body = (await request.json()) as { assertion?: unknown };
        calls.push(`start ${body.assertion ? "signed" : "unsigned"}`);
        return HttpResponse.json({ ...practiceProject, sample_dir: "/home/someone/.controlrod/practice/sample-project" });
      }),
      http.post("*/practice/cards", () => {
        calls.push("card");
        return HttpResponse.json({ project_id: practiceProject.id, sample_dir: "/x", capture: { id: "C-1", text: "t" } }, { status: 201 });
      }),
      http.get("*/workspace/projects", () => HttpResponse.json([practiceProject])),
    );
    await renderPage(
      <WorkspaceProjectUser.Provider value="ben">
        <PracticeStart passkeys={passkeys} />
        <Active />
      </WorkspaceProjectUser.Provider>,
    );
    expect(screen.getByText("Open project: none")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try a practice run" }));
    await waitFor(() => expect(screen.getByText("Open project: Practice project")).toBeTruthy());
    expect(calls).toEqual(["options {\"payload\":{}}", "start signed", "card"]);
  });

  it("says why when the practice run cannot start", async () => {
    server.use(
      http.post("*/admin/commands/project.practice-start/options", () => HttpResponse.json({ code: "signed-out", message: "Sign in with your passkey" }, { status: 401 })),
    );
    await renderPage(<PracticeStart passkeys={passkeys} />);
    await userEvent.click(screen.getByRole("button", { name: "Try a practice run" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/passkey|practice run/i);
  });
});

describe("the first-run guide", () => {
  const none: GuideState = { agentReady: false, hasRepoProject: false, hasCard: false, released: false, accepted: false };

  it("offers the practice run beside the next step until the first card exists", async () => {
    const { unmount } = await renderPage(<FirstRunGuide state={none} mode="software" onNewChange={() => {}} onHide={() => {}} />);
    expect(screen.getByRole("button", { name: "Try a practice run" })).toBeTruthy();
    expect(screen.getByText(/watch the whole loop first, with no agent account/)).toBeTruthy();
    // Still one primary button, for the next step.
    expect(screen.getByRole("link", { name: "Choose agents" }).className).toContain("primary");
    expect(screen.getByRole("button", { name: "Try a practice run" }).className).not.toContain("primary");
    unmount();
    await renderPage(<FirstRunGuide state={{ ...none, agentReady: true, hasRepoProject: true, hasCard: true }} mode="software" onNewChange={() => {}} onHide={() => {}} />);
    expect(screen.queryByRole("button", { name: "Try a practice run" })).toBeNull();
  });
});

describe("practice labels", () => {
  it("labels a practice card, and names its agents in plain words", async () => {
    await renderPage(
      <Card pkg={pkg({ id: "C1-README", title: "Add a Getting started section" })} kinds={["doc"]} column="drafting" next={{ tone: "wait", text: "Being checked" }} practice author="practice" checker="practice-check" onOpen={() => {}} />,
    );
    const card = screen.getByRole("article");
    expect(within(card).getByText("Practice")).toBeTruthy();
    expect(within(card).getByText("Author agent Practice agent")).toBeTruthy();
    expect(within(card).getByText("Checker agent Practice checker")).toBeTruthy();
    expect(within(card).getByTitle("The practice agent does the work")).toBeTruthy();
  });

  it("puts no practice label on real work", async () => {
    await renderPage(<Card pkg={pkg({ id: "WP-2", title: "Real" })} kinds={["doc"]} column="drafting" next={{ tone: "wait", text: "Writing" }} author="claude" onOpen={() => {}} />);
    expect(within(screen.getByRole("article")).queryByText("Practice")).toBeNull();
  });

  it("labels a practice capture by its project", async () => {
    hydrateServerProjects("ben", [practiceProject]);
    await renderPage(
      <WorkspaceProjectUser.Provider value="ben">
        <CaptureCard capture={{ schema_version: "0.1.0", id: "C-1", text: `[project-id:${practiceProject.id}] [mode:software]\nPractice card`, source: "web", created_at: "2026-11-28T09:00:00Z", disposition: "pending", lane: "public" } as never} />
      </WorkspaceProjectUser.Provider>,
    );
    expect(screen.getByText("Practice")).toBeTruthy();
  });
});
