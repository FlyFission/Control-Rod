import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, view } from "../../test/fixtures.js";
import type { CaptureView, DataLane, WorkPackage } from "../../api/types.js";
import { resetLiveStatus, useLiveEvents } from "../../lib/live.js";
import { hydrateServerProjects, selectProject, WorkspaceProjectUser } from "../../lib/projects.js";
import { saveMode } from "../../lib/mode.js";
import { BoardView } from "./BoardView.js";
import { NewWorkContext } from "../../lib/newWork.js";
import { CAPTURE_LIMIT } from "../../components/CaptureBox.js";
import { inTypingContext, splitPaste } from "./QuickAdd.js";
import { captureLine } from "./CaptureCard.js";
import { CaptureDrawer } from "./CaptureDrawer.js";
import { pendingCaptures } from "./useBoardData.js";

/** Quick add from the board and the capture card (redesign task 8; spec 6.2, 6.3). */

class FakeSource {
  static last: FakeSource | undefined;
  private listeners = new Map<string, ((m: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  addEventListener(type: string, fn: (m: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data: unknown = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
  close() {}
}

function Page() {
  useLiveEvents(true);
  useEffect(() => {
    FakeSource.last?.emit("open");
  }, []);
  return <BoardView />;
}

function capture(over: Partial<CaptureView> = {}): CaptureView {
  return { schema_version: "0.1.0", id: "C-1", text: "Fix the login redirect", source: "web", created_at: "2026-11-08T10:00:00Z", ...over };
}

/** The reads the board makes; captures and packages are mutable so a test can watch them change. */
function api(s: { packages?: WorkPackage[]; captures?: CaptureView[] } = {}) {
  const state = { packages: s.packages ?? [], captures: s.captures ?? [] };
  const posted: unknown[] = [];
  server.use(
    http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: "ben" })),
    http.get("*/packages", () => HttpResponse.json(state.packages)),
    http.get("*/office", () => HttpResponse.json([])),
    http.get("*/admin", () => HttpResponse.json({ members: [], registry: { qualifications: [] } })),
    http.get("*/captures", () => HttpResponse.json(state.captures)),
    http.post("*/captures", async ({ request }) => {
      const body = (await request.json()) as { text: string; lane?: DataLane };
      posted.push(body);
      // The server classifies at capture for a sender with lane authority, as ben has here.
      const c = capture({ id: `C-${posted.length}`, text: body.text, ...(body.lane ? { lane: body.lane, effective_lane: body.lane } : {}) });
      state.captures = [...state.captures, c];
      return HttpResponse.json(c, { status: 201 });
    }),
    http.get("*/packages/:id/actions", () => HttpResponse.json([])),
    http.get("*/packages/:id/person-verifications", () => HttpResponse.json([])),
    http.get("*/packages/:id", ({ params }) => {
      const p = state.packages.find((x) => x.id === String(params["id"]))!;
      return HttpResponse.json({ ...view({}, p), originators: ["ben"], runs: [] });
    }),
  );
  return { state, posted };
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeSource);
  resetLiveStatus();
  saveMode("capital-projects");
});
afterEach(() => vi.unstubAllGlobals());

describe("splitPaste", () => {
  it("gives one trimmed title per non-empty line", () => {
    expect(splitPaste("  Fix login \r\n\n Draft SOW\n")).toEqual(["Fix login", "Draft SOW"]);
  });
});

describe("inTypingContext", () => {
  it("is true inside fields and editable regions only", () => {
    expect(inTypingContext(document.createElement("input"))).toBe(true);
    expect(inTypingContext(document.createElement("textarea"))).toBe(true);
    expect(inTypingContext(document.createElement("select"))).toBe(true);
    expect(inTypingContext(document.createElement("button"))).toBe(false);
    expect(inTypingContext(null)).toBe(false);
  });
});

describe("captureLine", () => {
  it("asks for a lane first, then reports intake", () => {
    expect(captureLine(capture())).toEqual({ tone: "needs", text: "Classify the data lane" });
    expect(captureLine(capture({ lane: "internal" }))).toEqual({ tone: "wait", text: "Waiting for intake" });
    expect(captureLine(capture({ lane: "internal", intake: { run_id: "R-1", status: "running" } }))).toEqual({ tone: "wait", text: "Intake drafting" });
    expect(captureLine(capture({ lane: "restricted", intake: { run_id: "R-1", status: "queued" } }))).toEqual({ tone: "wait", text: "Intake queued" });
    expect(captureLine(capture({ lane: "internal", intake: { run_id: "R-1", status: "failed", error: "no runtime" } }))).toEqual({ tone: "block", text: "Intake failed: no runtime" });
  });
});

describe("pendingCaptures", () => {
  it("keeps only captures that are not answered and not yet packages, newest first", () => {
    const older = capture({ id: "C-old", created_at: "2026-11-08T09:00:00Z" });
    const newer = capture({ id: "C-new", created_at: "2026-11-08T11:00:00Z" });
    const answered = capture({ id: "C-ans", disposition: "answered", answer: "Yes." });
    const drafted = capture({ id: "C-pkg", disposition: "package", package_ids: ["WP-1"] });
    const legacy = capture({ id: "C-legacy", disposition: "package", package_id: "WP-2" });
    expect(pendingCaptures([older, answered, drafted, newer, legacy]).map((c) => c.id)).toEqual(["C-new", "C-old"]);
  });
});

describe("QuickAdd on the board", () => {
  it("posts one capture on Enter in the standard lane, with no second step, and leaves a fresh focused field", async () => {
    const { posted } = api();
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
    const field = screen.getByLabelText("Card title");
    expect(document.activeElement).toBe(field);
    await user.type(field, "Fix the login redirect{Enter}");
    await waitFor(() => expect(posted).toEqual([{ text: "[mode:capital-projects]\n\nFix the login redirect", source: "web", lane: "internal" }]));
    await waitFor(() => expect((screen.getByLabelText("Card title") as HTMLInputElement).value).toBe(""));
    expect(document.activeElement).toBe(screen.getByLabelText("Card title"));
    // The new capture shows at the top of Ready, already classified: nothing more to do on it.
    const card = (await screen.findByText("Fix the login redirect")).closest("article")!;
    expect(within(card).queryByText("Classify the data lane")).toBeNull();
    expect(within(card).queryByRole("button", { name: "Classify" })).toBeNull();
    expect(within(card).getByText("internal")).toBeTruthy();
  });

  it("captures against the selected project ID, in that project's default data lane", async () => {
    const { posted } = api();
    const principal = "project-fixture";
    const project = {
      name: "Same project name", mode: "capital-projects", status: "active", repo: "", repoStrategy: "worktree",
      workspaceRoot: "", lane: "internal", createdAt: "2026-11-22T00:00:00Z",
      author: { ecosystem: "claude", model: "default", reasoning: "default" },
      checker: { ecosystem: "codex", model: "default", reasoning: "default" },
    } as const;
    hydrateServerProjects(principal, [{ ...project, id: "prj_one" }, { ...project, id: "prj_two", lane: "client-confidential" }]);
    selectProject(principal, "prj_two");
    try {
      await renderPage(<WorkspaceProjectUser.Provider value={principal}><Page /></WorkspaceProjectUser.Provider>);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
      await user.type(screen.getByLabelText("Card title"), "Draft the fixture{Enter}");
      await waitFor(() => expect(posted).toEqual([
        { text: "[mode:capital-projects] [project-id:prj_two]\n\nDraft the fixture", source: "web", lane: "client-confidential" },
      ]));
    } finally {
      for (const key of ["cr.projects.v1", "cr.active-project"]) localStorage.removeItem(`${key}:${principal}`);
    }
  });

  it("takes the worktree away again when the card itself is refused", async () => {
    api();
    const removed: unknown[] = [];
    server.use(
      http.get("*/repos", () => HttpResponse.json({ workspace_root: "/home/u/Code", local: [], github: [] })),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, strategy: "worktree", repo: body.repo, branch: body.branch, local_path: "/home/u/Code/.worktrees/app/x", repo_path: "/home/u/Code/app" });
      }),
      http.post("*/captures", () => HttpResponse.json({ code: "invalid", message: "No" }, { status: 400 })),
      http.post("*/repos/remove", async ({ request }) => {
        removed.push(await request.json());
        return HttpResponse.json({ ok: true, removed: "/home/u/Code/.worktrees/app/x" });
      }),
    );
    const principal = "repo-refused";
    hydrateServerProjects(principal, [{
      id: "prj_repo2", name: "App", mode: "capital-projects", status: "active", repo: "acme/app", repoStrategy: "worktree",
      workspaceRoot: "", lane: "public", createdAt: "2026-11-22T00:00:00Z",
      author: { ecosystem: "claude", model: "default", reasoning: "default" },
      checker: { ecosystem: "codex", model: "default", reasoning: "default" },
    }]);
    selectProject(principal, "prj_repo2");
    try {
      await renderPage(<WorkspaceProjectUser.Provider value={principal}><Page /></WorkspaceProjectUser.Provider>);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
      await user.type(screen.getByLabelText("Card title"), "Fix it{Enter}");
      await waitFor(() => expect(removed).toEqual([{ worktree_path: "/home/u/Code/.worktrees/app/x", repo_path: "/home/u/Code/app", workspace_root: "/home/u/Code" }]));
    } finally {
      for (const key of ["cr.projects.v1", "cr.active-project"]) localStorage.removeItem(`${key}:${principal}`);
    }
  });

  it("keeps the worktree when the server failed, since the card may have been saved", async () => {
    api();
    const removed: unknown[] = [];
    server.use(
      http.get("*/repos", () => HttpResponse.json({ workspace_root: "/home/u/Code", local: [], github: [] })),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, strategy: "worktree", repo: body.repo, branch: body.branch, local_path: "/home/u/Code/.worktrees/app/x", repo_path: "/home/u/Code/app" });
      }),
      http.post("*/captures", () => HttpResponse.json({ code: "invalid", message: "No" }, { status: 503 })),
      http.post("*/repos/remove", async ({ request }) => {
        removed.push(await request.json());
        return HttpResponse.json({ ok: true, removed: "/home/u/Code/.worktrees/app/x" });
      }),
    );
    const principal = "repo-lost";
    hydrateServerProjects(principal, [{
      id: "prj_repo3", name: "App", mode: "capital-projects", status: "active", repo: "acme/app", repoStrategy: "worktree",
      workspaceRoot: "", lane: "public", createdAt: "2026-11-22T00:00:00Z",
      author: { ecosystem: "claude", model: "default", reasoning: "default" },
      checker: { ecosystem: "codex", model: "default", reasoning: "default" },
    }]);
    selectProject(principal, "prj_repo3");
    try {
      await renderPage(<WorkspaceProjectUser.Provider value={principal}><Page /></WorkspaceProjectUser.Provider>);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
      await user.type(screen.getByLabelText("Card title"), "Fix it{Enter}");
      await new Promise((r) => setTimeout(r, 300));
      expect(removed).toEqual([]);
    } finally {
      for (const key of ["cr.projects.v1", "cr.active-project"]) localStorage.removeItem(`${key}:${principal}`);
    }
  });

  it("gives a card in a repository project its own worktree and branch, so it can finish as a pull request", async () => {
    const { posted } = api();
    const made: Record<string, unknown>[] = [];
    server.use(
      http.get("*/repos", () => HttpResponse.json({ workspace_root: "/home/u/Code", local: [], github: [] })),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        made.push(body);
        return HttpResponse.json({ ok: true, strategy: "worktree", repo: body.repo, branch: body.branch, local_path: `/home/u/Code/.worktrees/app/${String(body.branch)}` });
      }),
    );
    const principal = "repo-fixture";
    hydrateServerProjects(principal, [{
      id: "prj_repo", name: "App", mode: "capital-projects", status: "active", repo: "acme/app", repoStrategy: "worktree",
      workspaceRoot: "", lane: "public", createdAt: "2026-11-22T00:00:00Z",
      author: { ecosystem: "claude", model: "default", reasoning: "default" },
      checker: { ecosystem: "codex", model: "default", reasoning: "default" },
    }]);
    selectProject(principal, "prj_repo");
    try {
      await renderPage(<WorkspaceProjectUser.Provider value={principal}><Page /></WorkspaceProjectUser.Provider>);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
      expect(screen.getByText(/Public data lane \(project default\), in its own branch of acme\/app\./)).toBeTruthy();
      await user.type(screen.getByLabelText("Card title"), "Fix the login redirect{Enter}");
      await waitFor(() => expect(posted).toHaveLength(1));
      expect(made).toEqual([expect.objectContaining({ repo: "acme/app", strategy: "worktree", workspace_root: "/home/u/Code", branch: expect.stringMatching(/^cr\/fix-the-login-redirect-[0-9a-f]{6}$/) })]);
      expect(posted[0]).toMatchObject({
        lane: "public",
        checkout: { repo: "acme/app", branch: made[0]!.branch, local_path: `/home/u/Code/.worktrees/app/${String(made[0]!.branch)}`, workspace_root: "/home/u/Code" },
      });
    } finally {
      for (const key of ["cr.projects.v1", "cr.active-project"]) localStorage.removeItem(`${key}:${principal}`);
    }
  });

  it("still gives a card its own worktree when the project was saved with an older strategy (WEB-12)", async () => {
    const { posted } = api();
    const made: Record<string, unknown>[] = [];
    server.use(
      http.get("*/repos", () => HttpResponse.json({ workspace_root: "/home/u/Code", local: [], github: [] })),
      http.post("*/repos/materialize", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        made.push(body);
        return HttpResponse.json({ ok: true, strategy: "worktree", repo: body.repo, branch: body.branch, local_path: `/home/u/Code/.worktrees/app/${String(body.branch)}` });
      }),
    );
    const principal = "old-strategy-fixture";
    hydrateServerProjects(principal, [{
      id: "prj_old", name: "App", mode: "software", status: "active", repo: "acme/app", repoStrategy: "fresh-clone",
      workspaceRoot: "", lane: "internal", createdAt: "2026-11-22T00:00:00Z",
      author: { ecosystem: "claude", model: "default", reasoning: "default" },
      checker: { ecosystem: "codex", model: "default", reasoning: "default" },
    }]);
    selectProject(principal, "prj_old");
    try {
      await renderPage(<WorkspaceProjectUser.Provider value={principal}><Page /></WorkspaceProjectUser.Provider>);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
      await user.type(screen.getByLabelText("Card title"), "Fix the login redirect{Enter}");
      await waitFor(() => expect(posted).toHaveLength(1));
      expect(made).toEqual([expect.objectContaining({ repo: "acme/app", strategy: "worktree" })]);
      expect(posted[0]).toMatchObject({ checkout: { repo: "acme/app", branch: made[0]!.branch } });
    } finally {
      for (const key of ["cr.projects.v1", "cr.active-project"]) localStorage.removeItem(`${key}:${principal}`);
    }
  });

  it("opens New Work from the empty board's own button through the shell (WEB-2)", async () => {
    api();
    const open = vi.fn();
    await renderPage(<NewWorkContext.Provider value={open}><Page /></NewWorkContext.Provider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Hide guide" }));
    await user.click(await screen.findByRole("button", { name: /^\+ New deliverable/ }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and returns focus to the opener; a typed draft survives losing focus", async () => {
    api();
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
    await user.type(screen.getByLabelText("Card title"), "Half typed");
    await user.tab();
    expect((screen.getByLabelText("Card title") as HTMLInputElement).value).toBe("Half typed");
    await user.click(screen.getByLabelText("Card title"));
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Card title")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ Quick add" }));
  });

  it("opens from the c key outside a field, and not from c typed inside one or when a dialog/palette is open", async () => {
    api();
    await renderPage(<Page />);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "+ Quick add" });

    // Guarded when an open dialog or .palette is present
    const dlg = document.createElement("dialog");
    dlg.setAttribute("open", "");
    document.body.appendChild(dlg);
    await user.keyboard("c");
    expect(screen.queryByLabelText("Card title")).toBeNull();
    dlg.remove();

    const pal = document.createElement("div");
    pal.className = "palette";
    document.body.appendChild(pal);
    await user.keyboard("c");
    expect(screen.queryByLabelText("Card title")).toBeNull();
    pal.remove();

    await user.keyboard("c");
    const field = await screen.findByLabelText("Card title");
    await user.type(field, "abc");
    expect((field as HTMLInputElement).value).toBe("abc");
    expect(screen.getAllByLabelText("Card title")).toHaveLength(1);
  });

  it("offers one card per pasted line and posts them all", async () => {
    const { posted } = api();
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
    await user.click(screen.getByLabelText("Card title"));
    await user.paste("Fix login\nDraft SOW\n\nSize relief valve");
    await user.click(screen.getByRole("button", { name: "Add 3 cards" }));
    await waitFor(() =>
      expect(posted.map((b) => (b as { text: string }).text)).toEqual([
        "[mode:capital-projects]\n\nFix login",
        "[mode:capital-projects]\n\nDraft SOW",
        "[mode:capital-projects]\n\nSize relief valve",
      ]),
    );
  });

  it("shows the server's refusal in place and keeps the text", async () => {
    api();
    server.use(http.post("*/captures", () => HttpResponse.json({ code: "refused", message: "Captures are paused", change: "Ask the owner to resume intake." }, { status: 409 })));
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
    await user.type(screen.getByLabelText("Card title"), "Fix login{Enter}");
    expect((await screen.findByRole("alert")).textContent).toContain("Captures are paused");
    expect((screen.getByLabelText("Card title") as HTMLInputElement).value).toBe("Fix login");
  });

  it("refuses a multi-line paste exceeding CAPTURE_LIMIT before posting on both Enter and submit", async () => {
    const { posted } = api();
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
    const field = screen.getByLabelText("Card title");
    await user.click(field);
    await user.paste(`Short first line\n${"x".repeat(CAPTURE_LIMIT + 1)}`);

    await user.click(screen.getByRole("button", { name: "Add 2 cards" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Too long for one card");
    expect(posted).toHaveLength(0);

    await user.keyboard("{Enter}");
    expect((await screen.findByRole("alert")).textContent).toContain("Too long for one card");
    expect(posted).toHaveLength(0);
  });

  it("retains only unsent lines on partial batch failure, invalidates captures, and retries without duplicates", async () => {
    const { state, posted } = api();
    let failSecond = true;
    server.use(
      http.post("*/captures", async ({ request }) => {
        const body = (await request.json()) as { text: string; source: string; lane?: DataLane };
        if (failSecond && body.text.endsWith("Line two")) {
          return HttpResponse.json({ code: "boom", message: "Server hiccup" }, { status: 500 });
        }
        posted.push(body);
        // The server classifies at capture for a sender with lane authority, as ben has here.
        const c = capture({ id: `C-${posted.length}`, text: body.text, ...(body.lane ? { lane: body.lane, effective_lane: body.lane } : {}) });
        state.captures = [...state.captures, c];
        return HttpResponse.json(c, { status: 201 });
      }),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Quick add" }));
    await user.click(screen.getByLabelText("Card title"));
    await user.paste("Line one\nLine two\nLine three");
    await user.click(screen.getByRole("button", { name: "Add 3 cards" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Server hiccup");
    expect((screen.getByLabelText("Card title") as HTMLInputElement).value).toBe("Line two / Line three");
    expect(screen.getByRole("button", { name: "Add 2 cards" })).toBeTruthy();
    // Line one succeeded and must already be visible via invalidated captures query.
    await screen.findByText("Line one");
    expect(posted.map((b) => (b as { text: string }).text)).toEqual(["[mode:capital-projects]\n\nLine one"]);

    failSecond = false;
    await user.click(screen.getByRole("button", { name: "Add 2 cards" }));
    await waitFor(() =>
      expect(posted.map((b) => (b as { text: string }).text)).toEqual([
        "[mode:capital-projects]\n\nLine one",
        "[mode:capital-projects]\n\nLine two",
        "[mode:capital-projects]\n\nLine three",
      ]),
    );
    await waitFor(() => expect((screen.getByLabelText("Card title") as HTMLInputElement).value).toBe(""));
  });
});

describe("CaptureDrawer data lane", () => {
  it("says what the card's lane means and offers only raising it", async () => {
    api();
    let raised: unknown;
    server.use(
      http.post("*/captures/C-1/classify", async ({ request }) => {
        raised = await request.json();
        return HttpResponse.json(capture({ lane: "proprietary", effective_lane: "proprietary" }));
      }),
    );
    await renderPage(<CaptureDrawer capture={capture({ lane: "internal", effective_lane: "internal" })} onClose={() => {}} />);
    const user = userEvent.setup();
    expect(screen.getByText(/Cloud agents \(Claude, Codex and the others\) may be sent its work/)).toBeTruthy();
    const picker = screen.getByLabelText("Raise to") as HTMLSelectElement;
    expect([...picker.options].map((o) => o.value)).toEqual(["internal", "proprietary", "client-confidential", "restricted"]);
    const button = screen.getByRole("button", { name: "Raise lane" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.selectOptions(picker, "proprietary");
    await user.click(button);
    await waitFor(() => expect(raised).toEqual({ lane: "proprietary" }));
  });

  it("offers no raise on a restricted card", async () => {
    api();
    await renderPage(<CaptureDrawer capture={capture({ lane: "restricted", effective_lane: "restricted" })} onClose={() => {}} />);
    expect(screen.getByText(/no cloud agent is sent anything new/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Raise lane" })).toBeNull();
  });

  it("says raising does not call back work an agent already has", async () => {
    api();
    await renderPage(<CaptureDrawer capture={capture({ lane: "internal", effective_lane: "internal", intake: { run_id: "R-1", status: "running" } })} onClose={() => {}} />);
    expect(screen.getByText(/Work already sent to an agent is not called back/)).toBeTruthy();
  });

  it("keeps the raise pick at or above the lane after a refresh raises it", async () => {
    api();
    function Refreshing() {
      const [lane, setLane] = useState<DataLane>("internal");
      return (
        <>
          <button type="button" onClick={() => setLane("client-confidential")}>Refresh</button>
          <CaptureDrawer capture={capture({ lane, effective_lane: lane })} onClose={() => {}} />
        </>
      );
    }
    await renderPage(<Refreshing />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Raise to"), "proprietary");
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect((screen.getByLabelText("Raise to") as HTMLSelectElement).value).toBe("client-confidential"));
    expect((screen.getByRole("button", { name: "Raise lane" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers an unclassified capture its own project's lane, not the open project's", async () => {
    api();
    const principal = "capture-lane-fixture";
    const project = {
      name: "P", mode: "software", status: "active", repo: "", repoStrategy: "worktree",
      workspaceRoot: "", lane: "internal", createdAt: "2026-11-22T00:00:00Z",
      author: { ecosystem: "claude", model: "default", reasoning: "default" },
      checker: { ecosystem: "codex", model: "default", reasoning: "default" },
    } as const;
    hydrateServerProjects(principal, [{ ...project, id: "prj_open" }, { ...project, id: "prj_tagged", lane: "restricted" }]);
    selectProject(principal, "prj_open");
    try {
      await renderPage(
        <WorkspaceProjectUser.Provider value={principal}>
          <CaptureDrawer capture={capture({ text: "[mode:software] [project-id:prj_tagged]\n\nTagged work" })} onClose={() => {}} />
        </WorkspaceProjectUser.Provider>,
      );
      expect((screen.getByLabelText("Data lane") as HTMLSelectElement).value).toBe("restricted");
    } finally {
      for (const key of ["cr.projects.v1", "cr.active-project"]) localStorage.removeItem(`${key}:${principal}`);
    }
  });
});

describe("CaptureCard", () => {
  it("classifies the lane inline and then reads Intake drafting", async () => {
    const { state } = api({ captures: [capture()] });
    let classified: unknown;
    server.use(
      http.post("*/captures/C-1/classify", async ({ request }) => {
        classified = await request.json();
        state.captures = [capture({ lane: "proprietary", effective_lane: "proprietary", intake: { run_id: "R-1", status: "running" } })];
        return HttpResponse.json(state.captures[0]);
      }),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    const card = (await screen.findByText("Fix the login redirect")).closest("article")!;
    await user.selectOptions(within(card).getByLabelText("Data lane"), "proprietary");
    await user.click(within(card).getByRole("button", { name: "Classify" }));
    await waitFor(() => expect(classified).toEqual({ lane: "proprietary" }));
    await waitFor(() => expect(card.textContent).toContain("Intake drafting"));
    expect(within(card).queryByRole("button", { name: "Classify" })).toBeNull();
  });

  it("shows a failed intake with its error and offers a retry", async () => {
    api({ captures: [capture({ lane: "internal", intake: { run_id: "R-9", status: "failed", error: "runtime not ready" } })] });
    let requeued = false;
    server.use(http.post("*/packages/C-1/runs/R-9/requeue", () => {
      requeued = true;
      return HttpResponse.json({}, { status: 201 });
    }));
    await renderPage(<Page />);
    const user = userEvent.setup();
    const card = (await screen.findByText("Fix the login redirect")).closest("article")!;
    expect(card.textContent).toContain("Intake failed: runtime not ready");
    await user.click(within(card).getByRole("button", { name: "Retry intake" }));
    await waitFor(() => expect(requeued).toBe(true));
  });

  it("gives way to the package cards once intake lists package ids", async () => {
    api({
      captures: [capture({ disposition: "package", package_ids: ["WP-1", "WP-2"] })],
      packages: [pkg({ id: "WP-1", title: "Login redirect fix" }), pkg({ id: "WP-2", title: "Login redirect tests" })],
    });
    await renderPage(<Page />);
    await screen.findByText("Login redirect fix");
    await screen.findByText("Login redirect tests");
    // The request's own card is gone; each package card says it is one of two from that request.
    expect(screen.queryByRole("button", { name: "Fix the login redirect" })).toBeNull();
    expect(screen.queryByText("Classify the data lane")).toBeNull();
    const first = screen.getByText("Login redirect fix").closest("article")!;
    const second = screen.getByText("Login redirect tests").closest("article")!;
    expect(first.textContent).toContain("Card 1 of 2 from one request: Fix the login redirect");
    expect(second.textContent).toContain("Card 2 of 2 from one request");
  });

  it("says nothing about a split when a request became one card", async () => {
    api({
      captures: [capture({ disposition: "package", package_ids: ["WP-1"] })],
      packages: [pkg({ id: "WP-1", title: "Login redirect fix" })],
    });
    await renderPage(<Page />);
    const card = (await screen.findByText("Login redirect fix")).closest("article")!;
    expect(card.textContent).not.toContain("from one request");
  });

  it("keeps the board usable and says so when captures cannot be read", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "Lighting layout" })] });
    server.use(http.get("*/captures", () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    await renderPage(<Page />);
    await screen.findByText("Lighting layout");
    expect((await screen.findByRole("alert")).textContent).toContain("Could not read the captures");
    expect(screen.queryByText(/Add your first card/)).toBeNull();
  });
});
