import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, view } from "../../test/fixtures.js";
import type { ActionDescriptor, WorkPackage, WorkspaceProject } from "../../api/types.js";
import { browserPasskeys } from "../../lib/decide.js";
import { resetLiveStatus, useLiveEvents, useLiveStatus } from "../../lib/live.js";
import { saveMode } from "../../lib/mode.js";
import { hydrateServerProjects, selectProject, WorkspaceProjectUser } from "../../lib/projects.js";
import { BoardView } from "./BoardView.js";

/** The board as home (redesign task 4; spec 6.2). */

class FakeSource {
  static last: FakeSource | undefined;
  static count = 0;
  private listeners = new Map<string, ((m: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeSource.last = this;
    FakeSource.count++;
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

const accept: ActionDescriptor = { command: "accept", label: "Accept", allowed: true, signature: "direct" };

type Setup = { packages: WorkPackage[]; actions?: Record<string, ActionDescriptor[]>; originators?: Record<string, string[]>; runs?: Record<string, "running" | "succeeded" | "stopping" | "queued" | "held"> };
function api(s: Setup) {
  const pkgs = s.packages.map((p) => ({ ...p, mode: "software" as const }));
  server.use(
    http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: "ben" })),
    http.get("*/packages", () => HttpResponse.json(pkgs)),
    http.get("*/office", () => HttpResponse.json([])),
    http.get("*/captures", () => HttpResponse.json([])),
    http.get("*/admin", () => HttpResponse.json({ members: [{ id: "mem_ben", org_id: "o", user_name: "ben", display_name: "Ben", status: "active" }], registry: { qualifications: [] } })),
    http.get("*/packages/:id/actions", ({ params }) => HttpResponse.json(s.actions?.[String(params["id"])] ?? [])),
    http.get("*/packages/:id/person-verifications", () => HttpResponse.json([])),
    http.get("*/packages/:id", ({ params }) => {
      const id = String(params["id"]);
      const p = pkgs.find((x) => x.id === id)!;
      const run = s.runs?.[id];
      return HttpResponse.json({
        ...view({}, p),
        originators: s.originators?.[id] ?? ["ben"],
        runs: run
          ? [
              run === "held"
                ? { id: "R-1", package_id: id, package_revision: 0, role: "pre-check", status: "queued", waiting_reason: "Waiting for an independent runtime" }
                : { id: "R-1", package_id: id, package_revision: 0, role: "author", status: run === "stopping" ? "running" : run, ...(run === "stopping" ? { stop_requested_at: "2026-11-21T10:00:00Z" } : {}) },
            ]
          : [],
      });
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeSource);
  FakeSource.count = 0;
  resetLiveStatus();
  saveMode("software");
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

describe("BoardView", () => {
  it.each([
    { action: "repository", command: "project.workspace-update", patch: { repo: "RepoA" } },
    { action: "lane agent", command: "project.workspace-update", patch: { laneAgents: { drafting: "codex", "agent-check": "claude" } } },
    { action: "archive", command: "project.workspace-archive", patch: undefined },
  ])("applies the $action change only after a bound passkey assertion succeeds", async ({ action, command, patch }) => {
    api({ packages: [] });
    const project: WorkspaceProject = {
      id: "prj_test", name: "Project", mode: "software", status: "active", repo: "",
      repoStrategy: "worktree", workspaceRoot: "", lane: "internal",
      author: { ecosystem: "claude", model: "default", reasoning: "default" },
      checker: { ecosystem: "codex", model: "default", reasoning: "default" },
      createdAt: "2026-11-22T00:00:00Z",
    };
    hydrateServerProjects("ben", [project]);
    selectProject("ben", project.id);
    const payload = patch ? { project_id: project.id, patch } : { project_id: project.id };
    const signed = { id: "signed-assertion" };
    const optionBodies: unknown[] = [];
    const writeBodies: unknown[] = [];
    let finishPasskey!: (assertion: Record<string, unknown>) => void;
    let finishWrite!: () => void;
    const passkey = vi.spyOn(browserPasskeys, "get").mockImplementation(
      () => new Promise((resolve) => { finishPasskey = resolve; }),
    );
    const write = async ({ request }: { request: Request }) => {
      writeBodies.push(await request.json());
      await new Promise<void>((resolve) => { finishWrite = resolve; });
      return HttpResponse.json(patch ? { ...project, ...patch } : { id: project.id, status: "archived" });
    };
    server.use(
      http.get("*/repos", () => HttpResponse.json({
        workspace_root: "", local: [{ name: "RepoA", branch: "main" }], github: [], github_error: null,
      })),
      http.post(`*/admin/commands/${command}/options`, async ({ request }) => {
        optionBodies.push(await request.json());
        return HttpResponse.json({ options: { challenge: "project-change" } });
      }),
      patch ? http.patch("*/workspace/projects/prj_test", write) : http.post("*/workspace/projects/prj_test/archive", write),
    );
    try {
      await renderPage(<WorkspaceProjectUser value="ben"><Page /></WorkspaceProjectUser>);
      const user = userEvent.setup();
      const region = screen.getByRole("region", { name: "Active project settings" });
      const repo = within(region).getByLabelText("Project default repository") as HTMLSelectElement;
      const author = screen.getByLabelText("Agent oversight for Implementing") as HTMLSelectElement;
      if (action === "repository") {
        await within(repo).findByRole("option", { name: "RepoA (main)" });
        await user.selectOptions(repo, "RepoA");
      } else if (action === "lane agent") {
        await user.selectOptions(author, "codex");
      } else {
        await user.click(within(region).getByRole("button", { name: "Archive project" }));
      }

      await waitFor(() => expect(passkey).toHaveBeenCalledWith({ challenge: "project-change" }));
      expect(optionBodies).toEqual([{ payload }]);
      expect(writeBodies).toEqual([]);
      act(() => finishPasskey(signed));
      await waitFor(() => expect(writeBodies).toEqual([{ payload, assertion: signed }]));
      expect(repo.value).toBe("");
      expect(author.value).toBe("claude");
      expect(screen.getByRole("region", { name: "Active project settings" })).toBe(region);
      act(() => finishWrite());
      if (action === "repository") {
        await waitFor(() => expect(repo.value).toBe("RepoA"));
      } else if (action === "lane agent") {
        await waitFor(() => expect(author.value).toBe("codex"));
      } else {
        await waitFor(() => expect(screen.queryByRole("region", { name: "Active project settings" })).toBeNull());
      }
    } finally {
      passkey.mockRestore();
    }
  });

  it("renders the six column headings in order", async () => {
    api({ packages: [pkg({ id: "WP-1" })] });
    await renderPage(<Page />);
    const regions = await within(screen.getByRole("region", { name: "Work stages" })).findAllByRole("region");
    expect(regions.map((r) => document.getElementById(r.getAttribute("aria-labelledby")!)!.textContent)).toEqual(["Ready", "Implementing", "CI / Agent check", "Peer review", "Needs signature", "Accepted"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Ready", "Implementing", "CI / Agent check", "Peer review", "Needs signature", "Accepted"]);
  });

  it("labels each card by its title and keeps the counts out of a live region", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "Lighting layout" })] });
    await renderPage(<Page />);
    const card = (await screen.findByText("Lighting layout")).closest("article")!;
    expect(document.getElementById(card.getAttribute("aria-labelledby")!)!.textContent).toBe("Lighting layout");
    expect(document.querySelector(".bd-counts")!.getAttribute("aria-live")).toBeNull();
  });

  it("tags a Safety package as an independent check and shows its next line", async () => {
    const ret: ActionDescriptor = { command: "return", label: "Return", allowed: true, signature: "direct" };
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], actions: { "WP-S": [ret] } });
    await renderPage(<Page />);
    const card = (await screen.findByText("Relief valve sizing")).closest("article")!;
    expect(within(card).getByText("Independent check")).toBeTruthy();
    await waitFor(() => expect(within(card).getByText("Return")).toBeTruthy());
  });

  it("offers no Accept on Safety work that no person has verified, even when the server allows it", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], actions: { "WP-S": [accept] }, originators: { "WP-S": ["ana"] } });
    server.use(
      http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])),
      http.get("*/admin", () => HttpResponse.json({ members: [{ id: "mem_ben", org_id: "o", user_name: "ben", display_name: "Ben", status: "active" }], registry: { qualifications: [{ org_id: "o", member_id: "mem_ben", version: 1, roles: ["checker"], authorities: [], grades: ["safety"], disciplines: [], revoked: false }] } })),
    );
    await renderPage(<Page />);
    const card = (await screen.findByText("Relief valve sizing")).closest("article")!;
    await waitFor(() => expect(card.querySelector(".bd-next")!.textContent).toContain("Waiting on a person verification"));
    expect(card.textContent).not.toMatch(/Accept/);
  });

  it("acts from the card: Accept on the face and Move to beside it (M3)", async () => {
    api({ packages: [pkg({ id: "WP-A", title: "Cable schedule", status: "in-verification" })], actions: { "WP-A": [accept] } });
    server.use(http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-A", package_revision: 0 }])));
    await renderPage(<Page />);
    const card = (await screen.findByText("Cable schedule")).closest("article")!;
    expect(await within(card).findByRole("button", { name: "Accept" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Move to, Cable schedule/ })).toBeTruthy();
  });

  it("puts no Accept button on Safety work that no person has verified", async () => {
    api({ packages: [pkg({ id: "WP-S2", title: "Vent stack", grade: "safety", status: "in-verification" })], actions: { "WP-S2": [accept] }, originators: { "WP-S2": ["ana"] } });
    server.use(http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S2", package_revision: 0 }])));
    await renderPage(<Page />);
    const card = (await screen.findByText("Vent stack")).closest("article")!;
    const user = userEvent.setup();
    await user.click(await within(card).findByRole("button", { name: /Move to/ }));
    expect(within(card).queryByRole("button", { name: "Accept" })).toBeNull();
    const menu = screen.getByRole("menu", { name: "Move to, Vent stack" });
    await user.click(within(menu).getByRole("menuitem", { name: /Unavailable \(1\)/ }));
    expect(within(menu).getByRole("menuitem", { name: /Accept/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("offers Stop run while a run is going, and not again once a stop was requested", async () => {
    api({ packages: [pkg({ id: "WP-R", title: "Running one", status: "in-work" }), pkg({ id: "WP-T", title: "Stopping one", status: "in-work" })], actions: { "WP-R": [], "WP-T": [] }, runs: { "WP-R": "running", "WP-T": "stopping" } });
    await renderPage(<Page />);
    const user = userEvent.setup();
    const running = (await screen.findByText("Running one")).closest("article")!;
    await user.click(await within(running).findByRole("button", { name: /Move to/ }));
    expect(within(screen.getByRole("menu", { name: "Move to, Running one" })).getByRole("menuitem", { name: "Stop run" })).toBeTruthy();
    const stopping = screen.getByText("Stopping one").closest("article")!;
    expect(within(stopping).queryByRole("button", { name: /Move to/ })).toBeNull();
  });

  it("turns the run spinner only for a run that is running, never for a queued or held one", async () => {
    api({
      packages: [
        pkg({ id: "WP-R", title: "Running one", status: "in-work" }),
        pkg({ id: "WP-Q", title: "Queued one", status: "in-work" }),
        pkg({ id: "WP-H", title: "Held one", status: "in-work" }),
      ],
      actions: { "WP-R": [], "WP-Q": [], "WP-H": [] },
      runs: { "WP-R": "running", "WP-Q": "queued", "WP-H": "held" },
    });
    await renderPage(<Page />);
    const running = (await screen.findByText("Running one")).closest("article")!;
    await waitFor(() => expect(within(running).getByRole("img", { name: "Agent running" })).toBeTruthy());
    const queued = screen.getByText("Queued one").closest("article")!;
    const held = screen.getByText("Held one").closest("article")!;
    // Wait until both cards are drawn from their own reads, so a spinner could have shown.
    await waitFor(() => {
      expect(queued.dataset["tone"]).not.toBe("unknown");
      expect(held.dataset["tone"]).not.toBe("unknown");
    });
    expect(within(queued).queryByRole("img", { name: "Agent running" })).toBeNull();
    expect(within(held).queryByRole("img", { name: "Agent running" })).toBeNull();
  });

  it("puts cards that need you at the top of their column, keeping order otherwise", async () => {
    api({
      packages: [
        pkg({ id: "WP-1", title: "First quiet", status: "in-verification" }),
        pkg({ id: "WP-2", title: "Needs a yes", status: "in-verification" }),
        pkg({ id: "WP-3", title: "Second quiet", status: "in-verification" }),
      ],
      actions: { "WP-1": [], "WP-2": [accept], "WP-3": [] },
    });
    await renderPage(<Page />);
    const needs = (await screen.findByText("Needs a yes")).closest("article")!;
    await waitFor(() => expect(needs.dataset["tone"]).toBe("needs"));
    const col = needs.closest("section")!;
    const titles = within(col).getAllByRole("button").filter((b) => b.classList.contains("bd-title")).map((b) => b.textContent);
    expect(titles.indexOf("Needs a yes")).toBeLessThan(titles.indexOf("First quiet"));
    expect(titles.indexOf("First quiet")).toBeLessThan(titles.indexOf("Second quiet"));
  });

  it("does not tag a General service package", async () => {
    api({ packages: [pkg({ id: "WP-G", title: "Lighting layout", grade: "general-service" })] });
    await renderPage(<Page />);
    const card = (await screen.findByText("Lighting layout")).closest("article")!;
    expect(within(card).queryByText("Independent check")).toBeNull();
  });

  it("opens the non-obscuring review drawer from the title button and links to the full case", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "Open me" })] });
    const { router } = await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open me" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-1" });
    expect(drawer).toBeTruthy();
    await user.click(within(drawer).getByRole("link", { name: /Full case/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/packages/WP-1"));
  });

  it("says status is unknown after the stream errors, with a Reconnect button and no live symbol", async () => {
    api({ packages: [pkg({ id: "WP-G", title: "Lighting layout", status: "in-verification" })], actions: { "WP-G": [accept] } });
    await renderPage(<Page />);
    const card = (await screen.findByText("Lighting layout")).closest("article")!;
    await waitFor(() => expect(card.querySelector(".bd-next")!.textContent).toContain("Accept"));
    act(() => FakeSource.last!.emit("error"));
    expect(await screen.findByText(/What you see may be out of date/)).toBeTruthy();
    // The card no longer shows its last state as if it were current (spec 8, ruling 13).
    expect(card.querySelector(".bd-next")!.textContent).toMatch(/^Status unknown since /);
    expect(card.querySelector(".bd-next")!.textContent).not.toContain("Accept");
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
    expect(card.textContent).not.toMatch(/[▲✕✓]/);
    // Nothing is offered from a state that may be out of date (M3).
    expect(within(card).queryByRole("button", { name: "Accept" })).toBeNull();
    const before = FakeSource.count;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(FakeSource.count).toBe(before + 1));
    act(() => FakeSource.last!.emit("open"));
    await waitFor(() => expect(screen.queryByText(/What you see may be out of date/)).toBeNull());
    await waitFor(() => expect(card.querySelector(".bd-next")!.textContent).toContain("Accept"));
  });

  it("shows the counts as last known while the stream is unknown", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "One", status: "in-verification" })], actions: { "WP-1": [accept] } });
    await renderPage(<Page />);
    await waitFor(() => expect(screen.getByText("1 needs you")).toBeTruthy());
    act(() => FakeSource.last!.emit("error"));
    expect(await screen.findByText("Last known: 1 needs you")).toBeTruthy();
    expect(screen.getByText("Last known: 0 agents running or queued")).toBeTruthy();
    expect(screen.queryByText("1 needs you")).toBeNull();
  });

  it("says the work could not be loaded, not that the board is empty, and retries", async () => {
    api({ packages: [] });
    let calls = 0;
    server.use(http.get("*/packages", () => (++calls === 1 ? HttpResponse.json({ code: "boom" }, { status: 500 }) : HttpResponse.json([pkg({ id: "WP-1", title: "One", mode: "software" })]))));
    await renderPage(<Page />);
    expect(await screen.findByText(/Could not load the work on this board/)).toBeTruthy();
    expect(screen.queryByText(/Add your first card/)).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("One")).toBeTruthy();
    expect(screen.queryByText(/Could not load the work on this board/)).toBeNull();
  });

  it("shows no card for a listed package whose view says it does not exist for this viewer", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "Ours" }), pkg({ id: "WP-X", title: "Another organization's" })] });
    server.use(http.get("*/packages/WP-X", () => HttpResponse.json({ code: "not-found", message: "No such package" }, { status: 404 })));
    await renderPage(<Page />);
    expect(await screen.findByText("Ours")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Another organization's")).toBeNull());
  });

  it("says the counts are unknown, not zero, when the work could not be read", async () => {
    api({ packages: [] });
    server.use(http.get("*/packages", () => HttpResponse.json({ code: "boom" }, { status: 500 })));
    await renderPage(<Page />);
    expect(await screen.findByText(/Could not load the work on this board/)).toBeTruthy();
    expect(screen.getByText("Counts unknown until the work is read")).toBeTruthy();
    expect(screen.queryByText(/0 needs you/)).toBeNull();
    expect(screen.queryByText(/0 agents running/)).toBeNull();
    for (const region of screen.getAllByRole("region")) expect(region.querySelector(".bd-col-head .mono")!.textContent).not.toBe("0");
  });

  it("reads cards and counts as last known after a drop until each read has succeeded again, even reads made inactive by leaving the board", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "One", status: "in-verification" })], actions: { "WP-1": [accept] } });
    function Away() {
      useLiveEvents(true);
      const live = useLiveStatus();
      const [show, setShow] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShow((v) => !v)}>Toggle board</button>
          <button type="button" onClick={live.reconnect}>Reconnect stream</button>
          {show && <BoardView />}
        </>
      );
    }
    await renderPage(<Away />);
    const user = userEvent.setup();
    act(() => FakeSource.last!.emit("open"));
    await waitFor(() => expect(screen.getByText("1 needs you")).toBeTruthy());
    // Leave the board: its reads become inactive and are not refreshed when the stream recovers.
    await user.click(screen.getByRole("button", { name: "Toggle board" }));
    act(() => FakeSource.last!.emit("error"));
    await user.click(screen.getByRole("button", { name: "Reconnect stream" }));
    act(() => FakeSource.last!.emit("open"));
    let release: (() => void) | undefined;
    server.use(http.get("*/packages", async () => {
      await new Promise<void>((r) => (release = r));
      return HttpResponse.json([pkg({ id: "WP-1", title: "One", status: "in-verification", mode: "software" })]);
    }));
    // Return: the cached work shows, but as last known until its reads succeed after the drop.
    await user.click(screen.getByRole("button", { name: "Toggle board" }));
    expect(await screen.findByText("Last known: 1 needs you")).toBeTruthy();
    const next = () => screen.getByText("One").closest("article")!.querySelector(".bd-next")!.textContent;
    expect(next()).toMatch(/^Last known: /);
    await waitFor(() => expect(release).toBeDefined());
    await act(async () => release!());
    await waitFor(() => expect(screen.getByText("1 needs you")).toBeTruthy());
    await waitFor(() => expect(next()).not.toMatch(/^Last known: /));
  });

  it("says the agent count is unknown when a package view cannot be read", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "One", status: "in-work" }), pkg({ id: "WP-2", title: "Two", status: "in-work" })], runs: { "WP-1": "running" } });
    server.use(http.get("*/packages/WP-2", () => HttpResponse.json({ code: "boom" }, { status: 500 })));
    await renderPage(<Page />);
    await waitFor(() => expect(screen.getByText("Two").closest("article")!.textContent).toContain("Could not read what is next"));
    expect(screen.getByText("Agents running or queued: unknown")).toBeTruthy();
    expect(screen.getByText("Needs you: unknown")).toBeTruthy();
    expect(screen.queryByText(/1 agent running/)).toBeNull();
  });

  it("keeps the current display through a short refetch and shows last known only after one second", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api({ packages: [pkg({ id: "WP-1", title: "One", status: "in-verification" })], actions: { "WP-1": [accept] } });
      const { qc } = await renderPage(<Page />);
      const next = () => screen.getByText("One").closest("article")!.querySelector(".bd-next")!.textContent;
      await waitFor(() => expect(next()).toContain("▲ Needs you: Accept"));
      let release!: () => void;
      server.use(http.get("*/packages/WP-1/actions", async () => {
        await new Promise<void>((r) => (release = r));
        return HttpResponse.json([accept]);
      }));

      // A 300 ms refetch: the card never leaves its current display.
      act(() => void qc.invalidateQueries({ queryKey: ["actions"] }));
      await waitFor(() => expect(release).toBeDefined());
      await act(async () => void vi.advanceTimersByTime(300));
      expect(next()).toContain("▲ Needs you: Accept");
      expect(screen.getByText("1 needs you")).toBeTruthy();
      await act(async () => release());
      await act(async () => void vi.advanceTimersByTime(1500));
      expect(next()).toContain("▲ Needs you: Accept");

      // A 1.5 s refetch: after one second the card and the count read last known.
      release = undefined as unknown as () => void;
      act(() => void qc.invalidateQueries({ queryKey: ["actions"] }));
      await waitFor(() => expect(release).toBeDefined());
      await act(async () => void vi.advanceTimersByTime(1500));
      await waitFor(() => expect(next()).toBe("Last known: Accept"));
      expect(screen.getByText("Last known: 1 needs you")).toBeTruthy();
      await act(async () => release());
      await waitFor(() => expect(next()).toContain("▲ Needs you: Accept"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows last known at once when a refetch fails", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "One", status: "in-verification" })], actions: { "WP-1": [accept] } });
    const { qc } = await renderPage(<Page />);
    const next = () => screen.getByText("One").closest("article")!.querySelector(".bd-next")!.textContent;
    await waitFor(() => expect(next()).toContain("▲ Needs you: Accept"));
    server.use(http.get("*/packages/WP-1/actions", () => HttpResponse.json({ code: "boom" }, { status: 500 })));
    await act(async () => void (await qc.refetchQueries({ queryKey: ["actions"] })));
    await waitFor(() => expect(next()).toContain("Could not read what is next"));
    expect(next()).not.toContain("▲");
  });

  it("keeps both counts unknown on a cold load until every package view and actions read has completed", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "One", status: "in-work" }), pkg({ id: "WP-2", title: "Two", status: "in-verification" })], actions: { "WP-2": [accept] }, runs: { "WP-1": "running" } });
    let releaseView!: () => void;
    let releaseActions!: () => void;
    const viewGate = new Promise<void>((r) => (releaseView = r));
    const actionsGate = new Promise<void>((r) => (releaseActions = r));
    server.use(
      http.get("*/packages/WP-1", async () => {
        await viewGate;
        return HttpResponse.json({ ...view({}, pkg({ id: "WP-1", title: "One", status: "in-work" })), originators: ["ben"], runs: [{ id: "R-1", package_id: "WP-1", package_revision: 0, role: "author", status: "running" }] });
      }),
      http.get("*/packages/WP-2/actions", async () => {
        await actionsGate;
        return HttpResponse.json([accept]);
      }),
    );
    await renderPage(<Page />);
    await screen.findByText("Two");
    await waitFor(() => expect(screen.getByText("Agents running or queued: unknown")).toBeTruthy());
    expect(screen.getByText("Needs you: unknown")).toBeTruthy();
    await act(async () => releaseView());
    await waitFor(() => expect(screen.getByText("1 agent running or queued")).toBeTruthy());
    expect(screen.getByText("Needs you: unknown")).toBeTruthy();
    await act(async () => releaseActions());
    await waitFor(() => expect(screen.getByText("1 needs you")).toBeTruthy());
  });

  it("never offers Accept on a card while a refresh of its cached covering pass is in flight", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], actions: { "WP-S": [accept] }, originators: { "WP-S": ["ana"] } });
    let hold: Promise<void> | undefined;
    server.use(
      http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])),
      http.get("*/packages/:id/person-verifications", async () => {
        if (hold) await hold;
        return HttpResponse.json([{ id: "pv1", package_revision: 0, outcome: "pass", covers_current_subject: true }]);
      }),
    );
    const { qc } = await renderPage(<Page />);
    const next = () => screen.getByText("Relief valve sizing").closest("article")!.querySelector(".bd-next")!.textContent;
    await waitFor(() => expect(next()).toContain("Needs you: Accept"));
    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    act(() => void qc.invalidateQueries({ queryKey: ["person-verifications"] }));
    await waitFor(() => expect(next()).not.toContain("Needs you: Accept"));
    await act(async () => release());
    await waitFor(() => expect(next()).toContain("Needs you: Accept"));
  });

  it("says it could not read what is next when the package view or actions fail, with a retry", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "One", status: "in-verification" }), pkg({ id: "WP-2", title: "Two", status: "in-verification" })], actions: { "WP-1": [accept], "WP-2": [accept] } });
    let actionCalls = 0;
    server.use(
      http.get("*/packages/WP-1/actions", () => (++actionCalls === 1 ? HttpResponse.json({ code: "boom" }, { status: 500 }) : HttpResponse.json([accept]))),
      http.get("*/packages/WP-2", () => HttpResponse.json({ code: "boom" }, { status: 500 })),
    );
    await renderPage(<Page />);
    const one = (await screen.findByText("One")).closest("article")!;
    const two = screen.getByText("Two").closest("article")!;
    await waitFor(() => expect(one.querySelector(".bd-next")!.textContent).toContain("Could not read what is next"));
    await waitFor(() => expect(two.querySelector(".bd-next")!.textContent).toContain("Could not read what is next"));
    expect(screen.queryByText("Checking what is next")).toBeNull();
    await userEvent.setup().click(within(one).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(one.querySelector(".bd-next")!.textContent).toContain("Accept"));
  });

  it("carries the chosen look on the board container only", async () => {
    window.localStorage.setItem("cr.look", "c");
    try {
      api({ packages: [pkg({ id: "WP-1", title: "One" })] });
      await renderPage(<Page />);
      await screen.findByText("One");
      expect(document.querySelector(".bd")!.getAttribute("data-look")).toBe("c");
      expect(document.documentElement.dataset["look"]).toBeUndefined();
    } finally {
      window.localStorage.removeItem("cr.look");
    }
  });

  it("guides the first card on an empty board", async () => {
    api({ packages: [] });
    await renderPage(<Page />);
    expect(await screen.findByText(/Add a card to capture a task/)).toBeTruthy();
    expect(screen.getByText(/Choose its data lane before an agent starts drafting/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Add a card" })).toBeTruthy();
  });

  it("counts what needs you and the agents running", async () => {
    api({
      packages: [pkg({ id: "WP-1", title: "One", status: "in-verification" }), pkg({ id: "WP-2", title: "Two", status: "in-work" }), pkg({ id: "WP-3", title: "Three", status: "in-work" })],
      actions: { "WP-1": [accept] },
      runs: { "WP-2": "running", "WP-3": "running" },
    });
    await renderPage(<Page />);
    await waitFor(() => expect(screen.getByText("1 needs you")).toBeTruthy());
    expect(screen.getByText("2 agents running or queued")).toBeTruthy();
    expect(screen.queryByText(/limit/i)).toBeNull();
  });

  it("says a viewer who originated the work needs a second qualified person", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], originators: { "WP-S": ["ben"] } });
    server.use(http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])));
    await renderPage(<Page />);
    expect(await screen.findByText(/^Needs a second qualified person/)).toBeTruthy();
  });

  it("tells a viewer who did not originate the work that nobody can verify it, naming the excluded originators", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], originators: { "WP-S": ["ana"] } });
    server.use(
      http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])),
      http.get("*/admin", () =>
        HttpResponse.json({
          members: [{ id: "mem_ben", org_id: "o", user_name: "ben", display_name: "Ben", status: "active" }, { id: "mem_ana", org_id: "o", user_name: "ana", display_name: "Ana", status: "active" }],
          // The only checker is the originator, who is excluded.
          registry: { qualifications: [{ org_id: "o", member_id: "mem_ana", version: 1, roles: ["checker"], authorities: [], grades: ["safety"], disciplines: [], revoked: false }] },
        }),
      ),
    );
    await renderPage(<Page />);
    expect(await screen.findByText("Needs a second qualified person. Originators cannot verify their own work: ana")).toBeTruthy();
  });

  it("says nothing definite when person verifications cannot be read", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], originators: { "WP-S": ["ben"] } });
    server.use(
      http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])),
      http.get("*/packages/:id/person-verifications", () => HttpResponse.json({ code: "boom" }, { status: 500 })),
    );
    await renderPage(<Page />);
    expect(await screen.findByText(/Could not read person verifications/)).toBeTruthy();
    expect(screen.queryByText(/Needs a second qualified person/)).toBeNull();
    expect(screen.queryByText("Waiting on a person verification")).toBeNull();
    // Ruling 11: the card sits in Person verifies (Peer review in Software mode), never in Needs signature, while the step is unknown.
    const region = screen.getByText("Relief valve sizing").closest("section")!;
    expect(document.getElementById(region.getAttribute("aria-labelledby")!)!.textContent).toBe("Peer review");
  });

  it("moves a card back to Person verifies and offers no Accept when a refresh of its covering pass fails", async () => {
    let fail = false;
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], actions: { "WP-S": [accept] }, originators: { "WP-S": ["ana"] } });
    server.use(
      http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])),
      http.get("*/packages/:id/person-verifications", () =>
        fail ? HttpResponse.json({ code: "boom" }, { status: 500 }) : HttpResponse.json([{ id: "pv1", package_revision: 0, outcome: "pass", covers_current_subject: true }])),
    );
    const { qc } = await renderPage(<Page />);
    // The card moves between columns as its reads arrive, so it is found afresh each time.
    const next = () => screen.getByText("Relief valve sizing").closest("article")!.querySelector(".bd-next")!.textContent;
    await screen.findByText("Relief valve sizing");
    await waitFor(() => expect(next()).toContain("Accept"));
    fail = true;
    await act(async () => void (await qc.refetchQueries({ queryKey: ["person-verifications"] })));
    await waitFor(() => expect(next()).toContain("Could not read person verifications"));
    const region = screen.getByText("Relief valve sizing").closest("section")!;
    expect(document.getElementById(region.getAttribute("aria-labelledby")!)!.textContent).toBe("Peer review");
  });

  it("says it cannot tell who can verify when the session cannot be read", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], originators: { "WP-S": ["ben"] } });
    server.use(
      http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])),
      http.get("*/auth/session", () => HttpResponse.json({ code: "boom" }, { status: 500 })),
    );
    await renderPage(<Page />);
    expect(await screen.findByText(/Cannot tell who can verify/)).toBeTruthy();
  });

  it("makes no second-person claim while /admin is still loading", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], originators: { "WP-S": ["ben"] } });
    server.use(
      http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])),
      http.get("*/admin", async () => {
        await new Promise((r) => setTimeout(r, 400));
        return HttpResponse.json({ members: [{ id: "mem_ben", org_id: "o", user_name: "ben", display_name: "Ben", status: "active" }], registry: { qualifications: [] } });
      }),
    );
    await renderPage(<Page />);
    expect(await screen.findByText("Checking what is next")).toBeTruthy();
    expect(screen.queryByText(/Needs a second qualified person/)).toBeNull();
    expect(await screen.findByText(/^Needs a second qualified person/)).toBeTruthy();
  });

  it("says it cannot tell who can verify when /admin fails", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], originators: { "WP-S": ["ben"] } });
    server.use(
      http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])),
      http.get("*/admin", () => HttpResponse.json({ code: "forbidden" }, { status: 403 })),
    );
    await renderPage(<Page />);
    expect(await screen.findByText(/Cannot tell who can verify/)).toBeTruthy();
    expect(screen.queryByText(/Needs a second qualified person/)).toBeNull();
  });

  it("shows the meaning word beside its symbol", async () => {
    api({ packages: [pkg({ id: "WP-G", title: "Lighting layout", status: "in-verification" }), pkg({ id: "WP-A", title: "Done work", status: "accepted" })], actions: { "WP-G": [accept] } });
    await renderPage(<Page />);
    const card = (await screen.findByText("Lighting layout")).closest("article")!;
    await waitFor(() => expect(card.querySelector(".bd-next")!.textContent).toContain("▲ Needs you: Accept"));
    const done = screen.getByText("Done work").closest("article")!;
    await waitFor(() => expect(done.querySelector(".bd-next")!.textContent).toContain("✓ Accepted"));
  });

  it("is neutral while connecting: no banner and no live symbol", async () => {
    api({ packages: [pkg({ id: "WP-G", title: "Lighting layout", status: "in-verification" })], actions: { "WP-G": [accept] } });
    function Quiet() {
      useLiveEvents(true);
      return <BoardView />;
    }
    await renderPage(<Quiet />);
    const card = (await screen.findByText("Lighting layout")).closest("article")!;
    await waitFor(() => expect(within(card).getByText(/Accept/)).toBeTruthy());
    expect(screen.queryByText(/status unknown since/i)).toBeNull();
    expect(card.textContent).not.toMatch(/[▲✕✓]/);
  });

  it("resets DecisionBar state in BoardReviewDrawer when switching packages", async () => {
    const ret: ActionDescriptor = { command: "return", label: "Return", allowed: true, signature: "direct" };
    api({
      packages: [
        pkg({ id: "WP-1", title: "First card", status: "in-verification" }),
        pkg({ id: "WP-2", title: "Second card", status: "in-verification" }),
      ],
      actions: { "WP-1": [ret], "WP-2": [ret] },
    });
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "First card" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-1" });
    await user.click(await within(drawer).findByRole("button", { name: "Return with direction" }));
    const textarea = within(drawer).getByLabelText(/Direction for the next revision/);
    await user.type(textarea, "Fix valve");
    expect((textarea as HTMLTextAreaElement).value).toBe("Fix valve");

    await user.click(screen.getByRole("button", { name: "Second card" }));
    const drawer2 = await screen.findByRole("complementary", { name: "Review WP-2" });
    await within(drawer2).findByRole("button", { name: "Return with direction" });
    expect(within(drawer2).queryByLabelText(/Direction for the next revision/)).toBeNull();
  });

  it("navigates capture and package card title buttons with J and K", async () => {
    api({
      packages: [
        pkg({ id: "WP-1", title: "Package One" }),
        pkg({ id: "WP-2", title: "Package Two" }),
      ],
    });
    server.use(
      http.get("*/captures", () =>
        HttpResponse.json([
          { schema_version: "0.1.0", id: "C-1", text: "Unclassified capture", source: "web", created_at: "2026-11-08T10:00:00Z" },
        ]),
      ),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    const captureBtn = await screen.findByRole("button", { name: "Unclassified capture" });
    const firstBtn = await screen.findByRole("button", { name: "Package One" });
    const secondBtn = await screen.findByRole("button", { name: "Package Two" });

    await user.keyboard("j");
    expect(document.activeElement).toBe(captureBtn);
    await user.keyboard("j");
    expect(document.activeElement).toBe(firstBtn);
    await user.keyboard("j");
    expect(document.activeElement).toBe(secondBtn);
    await user.keyboard("k");
    expect(document.activeElement).toBe(firstBtn);
    await user.keyboard("k");
    expect(document.activeElement).toBe(captureBtn);
  });

  it("N skips a capture whose latest read failed, though the stream stays live", async () => {
    api({ packages: [] });
    server.use(
      http.get("*/captures", () =>
        HttpResponse.json([
          { schema_version: "0.1.0", id: "C-1", text: "Unclassified capture", source: "web", created_at: "2026-11-08T10:00:00Z" },
        ]),
      ),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    const captureBtn = await screen.findByRole("button", { name: "Unclassified capture" });
    const tone = captureBtn.closest("article")?.getAttribute("data-tone");
    expect(tone === "needs" || tone === "block").toBe(true);
    await user.keyboard("n");
    expect(document.activeElement).toBe(captureBtn);
    captureBtn.blur();

    // Someone resolves it elsewhere; the event refreshes captures, and that read fails.
    server.use(http.get("*/captures", () => HttpResponse.json({ code: "unavailable" }, { status: 503 })));
    act(() => FakeSource.last!.emit("event", { subject: "C-1" }));
    await screen.findByText(/Could not read the captures/);
    await user.keyboard("n");
    expect(document.activeElement).not.toBe(captureBtn);
  });

  it("N jumps to the next card marked Needs you, in board order, and wraps", async () => {
    const release: ActionDescriptor = { command: "release", label: "Release", allowed: true, signature: "direct" };
    api({
      packages: [
        pkg({ id: "WP-1", title: "Quiet one" }),
        pkg({ id: "WP-2", title: "Wants a release" }),
        pkg({ id: "WP-3", title: "Quiet two" }),
        pkg({ id: "WP-4", title: "Wants another release" }),
      ],
      actions: { "WP-2": [release], "WP-4": [release] },
    });
    await renderPage(<Page />);
    const user = userEvent.setup();
    const two = await screen.findByRole("button", { name: "Wants a release" });
    const four = await screen.findByRole("button", { name: "Wants another release" });
    await waitFor(() => {
      expect(two.closest("article")?.getAttribute("data-tone")).toBe("needs");
      expect(four.closest("article")?.getAttribute("data-tone")).toBe("needs");
    });

    await user.keyboard("n");
    expect(document.activeElement).toBe(two);
    await user.keyboard("n");
    expect(document.activeElement).toBe(four);
    await user.keyboard("n");
    expect(document.activeElement).toBe(two);
  });

  it("N continues from the card that holds focus, even when a button other than its title has it", async () => {
    const release: ActionDescriptor = { command: "release", label: "Release", allowed: true, signature: "direct" };
    api({
      packages: [pkg({ id: "WP-2", title: "Wants a release" }), pkg({ id: "WP-4", title: "Wants another release" })],
      actions: { "WP-2": [release], "WP-4": [release] },
    });
    await renderPage(<Page />);
    const user = userEvent.setup();
    const two = await screen.findByRole("button", { name: "Wants a release" });
    const four = await screen.findByRole("button", { name: "Wants another release" });
    await waitFor(() => {
      expect(two.closest("article")?.getAttribute("data-tone")).toBe("needs");
      expect(four.closest("article")?.getAttribute("data-tone")).toBe("needs");
    });
    const other = Array.from(two.closest("article")!.querySelectorAll("button")).find((b) => b !== two);
    expect(other).toBeTruthy();
    other!.focus();
    await user.keyboard("n");
    expect(document.activeElement).toBe(four);
  });

  it("N does not jump while the stream is down, since no tone on screen is current", async () => {
    const release: ActionDescriptor = { command: "release", label: "Release", allowed: true, signature: "direct" };
    api({ packages: [pkg({ id: "WP-2", title: "Wants a release" })], actions: { "WP-2": [release] } });
    await renderPage(<Page />);
    const user = userEvent.setup();
    const two = await screen.findByRole("button", { name: "Wants a release" });
    await waitFor(() => expect(two.closest("article")?.getAttribute("data-tone")).toBe("needs"));
    act(() => FakeSource.last!.emit("error"));
    await screen.findByText(/What you see may be out of date/);
    await user.keyboard("n");
    expect(document.activeElement).not.toBe(two);
    expect(screen.getAllByRole("status").some((s) => s.textContent?.startsWith("N works while the board is live"))).toBe(true);
  });

  it("N says so when no card on the view is marked Needs you or Blocked", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "Quiet one" })] });
    await renderPage(<Page />);
    const user = userEvent.setup();
    const quiet = await screen.findByRole("button", { name: "Quiet one" });
    await waitFor(() => expect(quiet.closest("article")?.getAttribute("data-tone")).toBe("wait"));
    await user.keyboard("n");
    // Screen readers hear it from a status region; everyone else sees the same words under the header.
    expect(screen.getAllByRole("status").some((s) => s.textContent === "No card on this view is currently marked Needs you or Blocked.")).toBe(true);
    expect(document.activeElement).not.toBe(quiet);
    await user.keyboard("j");
    expect(screen.queryAllByText("No card on this view is currently marked Needs you or Blocked.")).toHaveLength(0);
  });

  it("stays loading while captures are pending even after packages arrive", async () => {
    api({ packages: [] });
    let releasePackages!: () => void;
    let releaseCaptures!: () => void;
    const packagesGate = new Promise<void>((r) => (releasePackages = r));
    const capturesGate = new Promise<void>((r) => (releaseCaptures = r));
    let packagesResolved = false;
    server.use(
      http.get("*/packages", async () => {
        await packagesGate;
        packagesResolved = true;
        return HttpResponse.json([]);
      }),
      http.get("*/captures", async () => {
        await capturesGate;
        return HttpResponse.json([
          { schema_version: "0.1.0", id: "C-1", text: "Pending capture", source: "web", created_at: "2026-11-08T10:00:00Z" },
        ]);
      }),
    );
    await renderPage(<Page />);
    await act(async () => releasePackages());
    await waitFor(() => expect(packagesResolved).toBe(true));
    // Packages finished with [], captures is still pending: Loading must stay and empty state must not flash.
    expect(screen.getByText("Loading")).toBeTruthy();
    expect(screen.queryByText(/Add your first card/)).toBeNull();

    await act(async () => releaseCaptures());
    expect(await screen.findByText("Pending capture")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Loading")).toBeNull());
  });

  it("shows package error alerts even while captures are still pending", async () => {
    api({ packages: [] });
    let releaseCaptures!: () => void;
    const capturesGate = new Promise<void>((r) => (releaseCaptures = r));
    server.use(
      http.get("*/packages", () => HttpResponse.json({ code: "boom" }, { status: 500 })),
      http.get("*/captures", async () => {
        await capturesGate;
        return HttpResponse.json([]);
      }),
    );
    await renderPage(<Page />);
    expect(await screen.findByText(/Could not load the work on this board/)).toBeTruthy();
    expect(screen.getByText("Loading")).toBeTruthy();
    await act(async () => releaseCaptures());
    await waitFor(() => expect(screen.queryByText("Loading")).toBeNull());
  });
});

describe("context profile", () => {
  it("locks Safety grade work to Nuclear with the reason, and badges the card", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", context_profile: "light" })] });
    await renderPage(<Page />);
    const user = userEvent.setup();
    const card = (await screen.findByText("Relief valve sizing")).closest("article")!;
    expect(within(card).getByText("Nuclear")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Relief valve sizing" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-S" });
    const group = within(drawer).getByRole("group", { name: "Context" });
    const nuclear = within(group).getByRole("button", { name: "Nuclear" }) as HTMLButtonElement;
    expect(nuclear.getAttribute("aria-pressed")).toBe("true");
    expect(nuclear.disabled).toBe(true);
    expect((within(group).getByRole("button", { name: "Light" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(drawer).getByText("Safety grade work is always Nuclear")).toBeTruthy();
  });

  it("shows no badge for Light work and saves a switch to Nuclear through the draft edit", async () => {
    const p = pkg({ id: "WP-L", title: "Lighting layout", grade: "general-service" });
    api({ packages: [p] });
    let sent: { body: WorkPackage; ifMatch: string | null } | undefined;
    server.use(
      http.get("*/packages/:id", () => HttpResponse.json({ ...view({}, p), originators: ["ben"], draft_etag: '"tag-1"' })),
      http.put("*/packages/:id", async ({ request }) => {
        const body = (await request.json()) as WorkPackage;
        sent = { body, ifMatch: request.headers.get("if-match") };
        return HttpResponse.json(body, { headers: { etag: '"tag-2"' } });
      }),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    const card = (await screen.findByText("Lighting layout")).closest("article")!;
    expect(within(card).queryByText("Nuclear")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Lighting layout" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-L" });
    const group = within(drawer).getByRole("group", { name: "Context" });
    expect(within(group).getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect((within(group).getByRole("button", { name: "Nuclear" }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(within(group).getByRole("button", { name: "Nuclear" }));
    await waitFor(() => expect(sent).toBeDefined());
    expect(sent!.ifMatch).toBe('"tag-1"');
    expect(sent!.body.context_profile).toBe("nuclear");
  });

  it("keeps the switch read-only for a draft in guided preparation, which refuses the draft edit", async () => {
    const p = pkg({ id: "WP-G", title: "Guided pump study", grade: "general-service" });
    api({ packages: [p] });
    let puts = 0;
    server.use(
      http.get("*/packages/:id", () => HttpResponse.json({ ...view({}, p), originators: ["ben"], draft_etag: '"tag-1"', preparation_enrolled: true })),
      http.put("*/packages/:id", () => {
        puts += 1;
        return HttpResponse.json({ code: "preparation-edit-required" }, { status: 409 });
      }),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Guided pump study" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-G" });
    expect((await within(drawer).findAllByText("Not editable during guided preparation")).length).toBeGreaterThan(0);
    const group = within(drawer).getByRole("group", { name: "Context" });
    const nuclear = within(group).getByRole("button", { name: "Nuclear" }) as HTMLButtonElement;
    expect(nuclear.disabled).toBe(true);
    expect((within(group).getByRole("button", { name: "Light" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(nuclear);
    expect(puts).toBe(0);
  });

  it("badges a card whose project defaults to Nuclear", async () => {
    api({ packages: [pkg({ id: "WP-P", title: "Plant work", project: "prj_plant" })] });
    server.use(
      http.get("*/admin", () => HttpResponse.json({
        members: [{ id: "mem_ben", org_id: "o", user_name: "ben", display_name: "Ben", status: "active" }],
        registry: { qualifications: [] },
        projects: [{ id: "prj_plant", org_id: "o", name: "Plant", mode: "capital-projects", default_rigor: "standard", default_context_profile: "nuclear", lanes: ["internal"], qa_overlays: [], autonomy_level: 0, status: "active" }],
      })),
    );
    await renderPage(<Page />);
    const card = (await screen.findByText("Plant work")).closest("article")!;
    await waitFor(() => expect(within(card).getByText("Nuclear")).toBeTruthy());
  });
});

describe("workflow", () => {
  it("shows the resolved workflow and reason, from the project default", async () => {
    api({ packages: [pkg({ id: "WP-P", title: "Plant work", project: "prj_plant" })] });
    server.use(
      http.get("*/admin", () => HttpResponse.json({
        members: [{ id: "mem_ben", org_id: "o", user_name: "ben", display_name: "Ben", status: "active" }],
        registry: { qualifications: [] },
        projects: [{ id: "prj_plant", org_id: "o", name: "Plant", mode: "capital-projects", default_rigor: "standard", default_workflow: "superpowers", lanes: ["internal"], qa_overlays: [], autonomy_level: 0, status: "active" }],
      })),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Plant work" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-P" });
    const select = within(drawer).getByRole("combobox", { name: "Workflow" }) as HTMLSelectElement;
    // An inheriting card shows the inheritance choice, naming what it resolves to.
    await waitFor(() => expect(select.selectedOptions[0]?.textContent).toBe("Project default (Superpowers)"));
    expect(select.value).toBe("");
    expect(within(drawer).getByText(/The project default is Superpowers\./)).toBeTruthy();
  });

  it("saves a change through the draft edit with If-Match, and is not locked by grade", async () => {
    const p = pkg({ id: "WP-W", title: "Relief valve", grade: "safety" });
    api({ packages: [p] });
    let sent: { body: WorkPackage; ifMatch: string | null } | undefined;
    server.use(
      http.get("*/packages/:id", () => HttpResponse.json({ ...view({}, p), originators: ["ben"], draft_etag: '"tag-1"' })),
      http.put("*/packages/:id", async ({ request }) => {
        const body = (await request.json()) as WorkPackage;
        sent = { body, ifMatch: request.headers.get("if-match") };
        return HttpResponse.json(body, { headers: { etag: '"tag-2"' } });
      }),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Relief valve" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-W" });
    const select = within(drawer).getByRole("combobox", { name: "Workflow" }) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.selectedOptions[0]?.textContent).toBe("Project default (Playbook)");
    await waitFor(() => expect(select.disabled).toBe(false));
    await user.selectOptions(select, "pocock");
    await waitFor(() => expect(sent).toBeDefined());
    expect(sent!.ifMatch).toBe('"tag-1"');
    expect(sent!.body.workflow).toBe("pocock");
  });

  it("returns a card to its project's default by clearing its own value", async () => {
    const p = pkg({ id: "WP-C", title: "Cooling loop", workflow: "pocock" });
    api({ packages: [p] });
    let sent: WorkPackage | undefined;
    server.use(
      http.get("*/packages/:id", () => HttpResponse.json({ ...view({}, p), originators: ["ben"], draft_etag: '"tag-1"' })),
      http.put("*/packages/:id", async ({ request }) => {
        sent = (await request.json()) as WorkPackage;
        return HttpResponse.json(sent, { headers: { etag: '"tag-2"' } });
      }),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Cooling loop" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-C" });
    const select = within(drawer).getByRole("combobox", { name: "Workflow" }) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("pocock"));
    await waitFor(() => expect(select.disabled).toBe(false));
    await user.selectOptions(select, "");
    await waitFor(() => expect(sent).toBeDefined());
    expect(Object.hasOwn(sent!, "workflow")).toBe(false);
  });

  it("is read-only for a draft in guided preparation, and for a package that is not a draft", async () => {
    const p = pkg({ id: "WP-G", title: "Guided pump study" });
    api({ packages: [p] });
    server.use(
      http.get("*/packages/:id", () => HttpResponse.json({ ...view({}, p), originators: ["ben"], draft_etag: '"tag-1"', preparation_enrolled: true })),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Guided pump study" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-G" });
    expect(await within(drawer).findAllByText("Not editable during guided preparation")).toBeTruthy();
    expect((within(drawer).getByRole("combobox", { name: "Workflow" }) as HTMLSelectElement).disabled).toBe(true);
  });

  it("is read-only outside a draft", async () => {
    const p = pkg({ id: "WP-A", title: "Approved scope", status: "in-work" });
    api({ packages: [p] });
    server.use(http.get("*/packages/:id", () => HttpResponse.json(view({}, p))));
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Approved scope" }));
    const drawer = await screen.findByRole("complementary", { name: "Review WP-A" });
    expect(await within(drawer).findByText("Only a draft's workflow can change")).toBeTruthy();
    expect((within(drawer).getByRole("combobox", { name: "Workflow" }) as HTMLSelectElement).disabled).toBe(true);
  });
});

describe("board lenses (M2)", () => {
  it("shows kind counts, filters by kind, updates the URL, and restores on reload", async () => {
    api({
      packages: [
        pkg({ id: "WP-C", title: "Controller patch", deliverables: [{ id: "D1", type: "patch" }] }),
        pkg({ id: "WP-D", title: "Valve scope", deliverables: [{ id: "D1", type: "scope of work" }] }),
      ],
    });
    const first = await renderPage(<Page />);
    await screen.findByText("Controller patch");
    await screen.findByText("Valve scope");

    const user = userEvent.setup();
    const allBtn = screen.getByRole("button", { name: /^All\s*2$/ });
    const codeBtn = screen.getByRole("button", { name: /^Code\s*1$/ });
    const docBtn = screen.getByRole("button", { name: /^Documents\s*1$/ });
    expect(allBtn.getAttribute("aria-pressed")).toBe("true");
    expect(codeBtn.getAttribute("aria-pressed")).toBe("false");
    expect(docBtn.getAttribute("aria-pressed")).toBe("false");

    await user.click(codeBtn);
    expect(screen.getByText("Controller patch")).toBeTruthy();
    expect(screen.queryByText("Valve scope")).toBeNull();
    expect(window.location.search).toContain("kind=code");

    // Simulate reload with the same URL.
    first.unmount();
    await renderPage(<Page />);
    expect(await screen.findByText("Controller patch")).toBeTruthy();
    expect(screen.queryByText("Valve scope")).toBeNull();
    expect(screen.getByRole("button", { name: /^Code\s*1$/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles Needs you from the header count button", async () => {
    api({
      packages: [
        pkg({ id: "WP-1", title: "Needs sign", status: "in-verification" }),
        pkg({ id: "WP-2", title: "Waiting draft", status: "in-work" }),
      ],
      actions: { "WP-1": [accept], "WP-2": [] },
      runs: { "WP-2": "running" },
    });
    await renderPage(<Page />);
    const countBtn = await screen.findByRole("button", { name: "1 needs you" });
    const user = userEvent.setup();
    await user.click(countBtn);
    expect(countBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Needs sign")).toBeTruthy();
    expect(screen.queryByText("Waiting draft")).toBeNull();
    expect(window.location.search).toContain("needs=1");
  });

  it("groups by person into swimlanes with counts, and updates the legend for colorBy", async () => {
    api({
      packages: [
        pkg({ id: "WP-1", title: "Alpha work", project: "prj_1", deliverables: [{ id: "D1", type: "patch" }] }),
        pkg({ id: "WP-2", title: "Beta work", project: "prj_2", deliverables: [{ id: "D1", type: "report" }] }),
        pkg({ id: "WP-3", title: "Gamma work", project: "prj_1", deliverables: [{ id: "D1", type: "patch" }] }),
      ],
      originators: { "WP-1": ["ben"], "WP-2": ["ana"], "WP-3": ["ben"] },
    });
    await renderPage(<Page />);
    await screen.findByText("Alpha work");

    const user = userEvent.setup();
    await user.click(screen.getByText("View options", { exact: false }));
    await user.selectOptions(screen.getByLabelText("Group by"), "person");
    expect(window.location.search).toContain("groupBy=person");
    const laneEls = Array.from(document.querySelectorAll(".bd-lane"));
    expect(laneEls.map((el) => el.querySelector(".bd-lane-head")!.textContent)).toEqual(["ana1", "ben2"]);
    expect(within(laneEls[0] as HTMLElement).getByText("Beta work")).toBeTruthy();
    expect(within(laneEls[1] as HTMLElement).getByText("Alpha work")).toBeTruthy();
    expect(within(laneEls[1] as HTMLElement).getByText("Gamma work")).toBeTruthy();

    const legend = document.querySelector(".bd-legend")!;
    expect(legend.textContent).toContain("Color: Kind");
    await user.selectOptions(screen.getByLabelText("Color by"), "person");
    expect(legend.textContent).toContain("Color: Person");
    expect(legend.textContent).toContain("ana");
    expect(legend.textContent).toContain("ben");
  });

  it("enforces the default-view guard for kind, Needs you, Mine, all three together, and a saved view, keeping color/group/density on Show", async () => {
    const packages = [
      pkg({ id: "WP-CODE", title: "Code draft", status: "draft", deliverables: [{ id: "D1", type: "patch" }] }),
      pkg({
        id: "WP-SIG",
        title: "Protected doc",
        status: "in-verification",
        grade: "general-service",
        deliverables: [{ id: "D1", type: "scope of work" }],
      }),
    ];
    api({
      packages,
      actions: { "WP-CODE": [{ command: "release", label: "Release", allowed: true, signature: "direct" }], "WP-SIG": [] },
      originators: { "WP-CODE": ["ben"], "WP-SIG": ["ana"] },
    });
    server.use(
      http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-SIG", package_revision: 0 }])),
    );
    await renderPage(<Page />);
    await screen.findByText("Protected doc");
    const user = userEvent.setup();

    await user.click(screen.getByText("View options", { exact: false }));
    // Set non-filter presentation lenses that Show must preserve.
    await user.selectOptions(screen.getByLabelText("Color by"), "state");
    await user.selectOptions(screen.getByLabelText("Group by"), "kind");
    await user.click(screen.getByRole("button", { name: "Compact" }));

    // 1. Kind filter hides protected doc
    await user.click(screen.getByRole("button", { name: /^Code\s*1$/ }));
    expect(await screen.findByText("1 card waiting on verification or signature hidden by this view")).toBeTruthy();
    expect(screen.queryByText("Protected doc")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.queryByText(/hidden by this view/)).toBeNull();
    expect(screen.getByText("Protected doc")).toBeTruthy();
    expect((screen.getByLabelText("Color by") as HTMLSelectElement).value).toBe("state");
    expect((screen.getByLabelText("Group by") as HTMLSelectElement).value).toBe("kind");
    expect(screen.getByRole("button", { name: "Compact" }).getAttribute("aria-pressed")).toBe("true");

    // 2. Needs you filter hides protected doc (which has tone "wait")
    await user.click(screen.getByRole("button", { name: /^\d+ needs you$/ }));
    expect(await screen.findByText("1 card waiting on verification or signature hidden by this view")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.queryByText(/hidden by this view/)).toBeNull();
    expect(screen.getByText("Protected doc")).toBeTruthy();

    // 3. Mine filter hides protected doc (originated by ana, viewer is ben)
    await user.click(screen.getByRole("button", { name: "Mine" }));
    expect(await screen.findByText("1 card waiting on verification or signature hidden by this view")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.queryByText(/hidden by this view/)).toBeNull();
    expect(screen.getByText("Protected doc")).toBeTruthy();

    // 4. All three active together -> save as a view, reset, apply saved view, then Show
    await user.click(screen.getByRole("button", { name: /^Code\s*1$/ }));
    await user.click(screen.getByRole("button", { name: /^\d+ needs you$/ }));
    await user.click(screen.getByRole("button", { name: "Mine" }));
    expect(await screen.findByText("1 card waiting on verification or signature hidden by this view")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save view" }));
    await user.type(screen.getByLabelText("View name"), "My code");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.queryByText(/hidden by this view/)).toBeNull();
    expect(screen.getByText("Protected doc")).toBeTruthy();

    // Selecting the saved view reapplies its filters and triggers the guard; Show clears its filters.
    await user.selectOptions(screen.getByLabelText("Saved view"), "My code");
    expect(await screen.findByText("1 card waiting on verification or signature hidden by this view")).toBeTruthy();
    expect(screen.queryByText("Protected doc")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.queryByText(/hidden by this view/)).toBeNull();
    expect(screen.getByText("Protected doc")).toBeTruthy();
  });

  it("hides avatars in compact density while keeping the next line", async () => {
    api({
      packages: [pkg({ id: "WP-1", title: "Compact card", grade: "general-service", status: "in-verification" })],
      actions: { "WP-1": [accept] },
      originators: { "WP-1": ["ben"] },
    });
    await renderPage(<Page />);
    const card = (await screen.findByText("Compact card")).closest("article")!;
    await waitFor(() => expect(card.querySelector(".bd-next")!.textContent).toContain("Accept"));
    expect(card.querySelectorAll(".bd-avatar").length).toBeGreaterThan(0);
    expect(card.querySelector(".bd-chip")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByText("View options", { exact: false }));
    await user.click(screen.getByRole("button", { name: "Compact" }));
    expect(document.querySelector(".bd")!.getAttribute("data-density")).toBe("compact");
    expect(card.querySelectorAll(".bd-avatar").length).toBe(0);
    expect(card.querySelector(".bd-next")!.textContent).toContain("Accept");
  });

  it("pluralizes the default-view guard notice when multiple protected cards are hidden", async () => {
    const packages = [
      pkg({ id: "WP-CODE", title: "Code draft", status: "draft", deliverables: [{ id: "D1", type: "patch" }] }),
      pkg({ id: "WP-SIG", title: "Doc signature", status: "in-verification", grade: "general-service", deliverables: [{ id: "D1", type: "scope of work" }] }),
      pkg({ id: "WP-PV", title: "Doc verify", status: "in-verification", grade: "safety", deliverables: [{ id: "D1", type: "calculation" }] }),
    ];
    api({ packages });
    server.use(
      http.get("*/office", () =>
        HttpResponse.json([
          { id: "o1", kind: "accept", package_id: "WP-SIG", package_revision: 0 },
          { id: "o2", kind: "accept", package_id: "WP-PV", package_revision: 0 },
        ]),
      ),
    );
    await renderPage(<Page />);
    await screen.findByText("Doc signature");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Code\s*1$/ }));
    expect(await screen.findByText("2 cards waiting on verification or signature hidden by this view")).toBeTruthy();
  });

  it("selects Custom view when lenses are modified so Default view can be chosen to reset", async () => {
    api({
      packages: [
        pkg({ id: "WP-1", title: "Code one", deliverables: [{ id: "D1", type: "patch" }] }),
        pkg({ id: "WP-2", title: "Doc one", deliverables: [{ id: "D1", type: "report" }] }),
      ],
    });
    await renderPage(<Page />);
    await screen.findByText("Code one");

    const user = userEvent.setup();
    const select = screen.getByLabelText("Saved view") as HTMLSelectElement;
    expect(select.value).toBe("");

    await user.click(screen.getByRole("button", { name: /^Code\s*1$/ }));
    expect(select.value).toBe("__custom__");
    expect(screen.queryByText("Doc one")).toBeNull();
    expect(window.location.search).toContain("kind=code");

    await user.selectOptions(select, "");
    expect(select.value).toBe("");
    expect(screen.getByText("Doc one")).toBeTruthy();
    expect(window.location.search).toBe("");
  });

  it("respects counts confidence in the lens bar and legend for unknown and last-known reads", async () => {
    api({ packages: [] });
    let failPackages = true;
    server.use(
      http.get("*/packages", () =>
        failPackages
          ? HttpResponse.json({ code: "boom" }, { status: 500 })
          : HttpResponse.json([pkg({ id: "WP-1", title: "One", mode: "software", deliverables: [{ id: "D1", type: "patch" }] })]),
      ),
    );
    await renderPage(<Page />);
    expect(await screen.findByText(/Could not load the work on this board/)).toBeTruthy();
    expect(screen.getByText("Counts unknown until the work is read")).toBeTruthy();
    const kinds = screen.getByRole("group", { name: "Kind" });
    expect(kinds.textContent).not.toContain("0");
    expect(kinds.textContent).toContain("—");
    const legend = document.querySelector(".bd-legend")!;
    expect(legend.textContent).toContain("Counts unknown");
    expect(legend.textContent).not.toContain("0 of 0");

    failPackages = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("One")).toBeTruthy();
    expect(legend.textContent).toContain("1 of 1");

    act(() => FakeSource.last!.emit("error"));
    expect(await screen.findByText("Last known counts")).toBeTruthy();
    expect(legend.textContent).toContain("Last known: 1 of 1");
  });
});
