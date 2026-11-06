import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, view } from "../../test/fixtures.js";
import type { ActionDescriptor, WorkPackage } from "../../api/types.js";
import { useLiveEvents } from "../../lib/live.js";
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
});
afterEach(() => vi.unstubAllGlobals());

describe("BoardView", () => {
  it("renders the six column headings in order", async () => {
    api({ packages: [pkg({ id: "WP-1" })] });
    await renderPage(<Page />);
    const regions = await screen.findAllByRole("region");
    expect(regions.map((r) => r.getAttribute("aria-label"))).toEqual(["Ready", "Drafting", "Agent check", "Person verifies", "Needs signature", "Accepted"]);
  });

  it("tags a Safety package as an independent check and shows its next line", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], actions: { "WP-S": [accept] } });
    await renderPage(<Page />);
    const card = (await screen.findByText("Relief valve sizing")).closest("article")!;
    expect(within(card).getByText("Independent check")).toBeTruthy();
    await waitFor(() => expect(within(card).getByText("Accept")).toBeTruthy());
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
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], actions: { "WP-S": [accept] } });
    await renderPage(<Page />);
    const card = (await screen.findByText("Relief valve sizing")).closest("article")!;
    await waitFor(() => expect(within(card).getByText(/Accept/)).toBeTruthy());
    act(() => FakeSource.last!.emit("error"));
    expect(await screen.findByText(/status unknown since/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
    expect(card.textContent).not.toMatch(/[▲✕✓]/);
    const before = FakeSource.count;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(FakeSource.count).toBe(before + 1));
    act(() => FakeSource.last!.emit("open"));
    await waitFor(() => expect(screen.queryByText(/status unknown since/i)).toBeNull());
  });

  it("guides the first card on an empty board", async () => {
    api({ packages: [] });
    await renderPage(<Page />);
    expect(await screen.findByText(/Add your first card/)).toBeTruthy();
  });

  it("counts what needs you and the agents running", async () => {
    api({
      packages: [pkg({ id: "WP-1", title: "One", status: "in-verification" }), pkg({ id: "WP-2", title: "Two", status: "in-work" }), pkg({ id: "WP-3", title: "Three", status: "in-work" })],
      actions: { "WP-1": [accept] },
      runs: { "WP-2": "running", "WP-3": "running" },
    });
    await renderPage(<Page />);
    await waitFor(() => expect(screen.getByText("1 needs you")).toBeTruthy());
    expect(screen.getByText("2 agents running")).toBeTruthy();
    expect(screen.queryByText(/limit/i)).toBeNull();
  });

  it("says a viewer who originated the work needs a second qualified person", async () => {
    api({ packages: [pkg({ id: "WP-S", title: "Relief valve sizing", grade: "safety", status: "in-verification" })], originators: { "WP-S": ["ben"] } });
    server.use(http.get("*/office", () => HttpResponse.json([{ id: "o1", kind: "accept", package_id: "WP-S", package_revision: 0 }])));
    await renderPage(<Page />);
    expect(await screen.findByText("Needs a second qualified person")).toBeTruthy();
  });
});
