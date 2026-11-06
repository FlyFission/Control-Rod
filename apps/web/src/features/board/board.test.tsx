import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, view } from "../../test/fixtures.js";
import type { ActionDescriptor, WorkPackage } from "../../api/types.js";
import { resetLiveStatus, useLiveEvents, useLiveStatus } from "../../lib/live.js";
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

type Setup = { packages: WorkPackage[]; actions?: Record<string, ActionDescriptor[]>; originators?: Record<string, string[]>; runs?: Record<string, "running" | "succeeded"> };
function api(s: Setup) {
  server.use(
    http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: "ben" })),
    http.get("*/packages", () => HttpResponse.json(s.packages)),
    http.get("*/office", () => HttpResponse.json([])),
    http.get("*/admin", () => HttpResponse.json({ members: [{ id: "mem_ben", org_id: "o", user_name: "ben", display_name: "Ben", status: "active" }], registry: { qualifications: [] } })),
    http.get("*/packages/:id/actions", ({ params }) => HttpResponse.json(s.actions?.[String(params["id"])] ?? [])),
    http.get("*/packages/:id/person-verifications", () => HttpResponse.json([])),
    http.get("*/packages/:id", ({ params }) => {
      const id = String(params["id"]);
      const p = s.packages.find((x) => x.id === id)!;
      const run = s.runs?.[id];
      return HttpResponse.json({
        ...view({}, p),
        originators: s.originators?.[id] ?? ["ben"],
        runs: run ? [{ id: "R-1", package_id: id, package_revision: 0, role: "author", status: run }] : [],
      });
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeSource);
  FakeSource.count = 0;
  resetLiveStatus();
});
afterEach(() => vi.unstubAllGlobals());

describe("BoardView", () => {
  it("renders the six column headings in order", async () => {
    api({ packages: [pkg({ id: "WP-1" })] });
    await renderPage(<Page />);
    const regions = await screen.findAllByRole("region");
    expect(regions.map((r) => document.getElementById(r.getAttribute("aria-labelledby")!)!.textContent)).toEqual(["Ready", "Drafting", "Agent check", "Person verifies", "Needs signature", "Accepted"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Ready", "Drafting", "Agent check", "Person verifies", "Needs signature", "Accepted"]);
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

  it("does not tag a General service package", async () => {
    api({ packages: [pkg({ id: "WP-G", title: "Lighting layout", grade: "general-service" })] });
    await renderPage(<Page />);
    const card = (await screen.findByText("Lighting layout")).closest("article")!;
    expect(within(card).queryByText("Independent check")).toBeNull();
  });

  it("opens the package from the title button", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "Open me" })] });
    const { router } = await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open me" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/packages/WP-1"));
  });

  it("says status is unknown after the stream errors, with a Reconnect button and no live symbol", async () => {
    api({ packages: [pkg({ id: "WP-G", title: "Lighting layout", status: "in-verification" })], actions: { "WP-G": [accept] } });
    await renderPage(<Page />);
    const card = (await screen.findByText("Lighting layout")).closest("article")!;
    await waitFor(() => expect(within(card).getByText(/Accept/)).toBeTruthy());
    act(() => FakeSource.last!.emit("error"));
    expect(await screen.findByText(/What you see may be out of date/)).toBeTruthy();
    // The card no longer shows its last state as if it were current (spec 8, ruling 13).
    expect(card.querySelector(".bd-next")!.textContent).toMatch(/^Status unknown since /);
    expect(card.querySelector(".bd-next")!.textContent).not.toContain("Accept");
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
    expect(card.textContent).not.toMatch(/[▲✕✓]/);
    const before = FakeSource.count;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(FakeSource.count).toBe(before + 1));
    act(() => FakeSource.last!.emit("open"));
    await waitFor(() => expect(screen.queryByText(/What you see may be out of date/)).toBeNull());
    await waitFor(() => expect(within(card).getByText(/Accept/)).toBeTruthy());
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
    server.use(http.get("*/packages", () => (++calls === 1 ? HttpResponse.json({ code: "boom" }, { status: 500 }) : HttpResponse.json([pkg({ id: "WP-1", title: "One" })]))));
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
      return HttpResponse.json([pkg({ id: "WP-1", title: "One", status: "in-verification" })]);
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
    expect(await screen.findByText(/Add your first card/)).toBeTruthy();
    expect(screen.getByText(/When its intake drafts a package, the package appears here in Ready\./)).toBeTruthy();
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
    // Ruling 11: the card sits in Person verifies, never in Needs signature, while the step is unknown.
    const region = screen.getByText("Relief valve sizing").closest("section")!;
    expect(document.getElementById(region.getAttribute("aria-labelledby")!)!.textContent).toBe("Person verifies");
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
    expect(document.getElementById(region.getAttribute("aria-labelledby")!)!.textContent).toBe("Person verifies");
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
});
