import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Shell } from "./Shell.js";
import { PLACES } from "../places/places.js";
import { server } from "../test/server.js";
import { lockedFor, lockFrom, NO_LOCK } from "../lib/scramLock.js";
import { markScram, resetScramTimings, scramTimings } from "../lib/scramTiming.js";
import { ScramBanner } from "../features/office/Scram.js";
import { setPresenting } from "../lib/presenting.js";

/** SCRAM across the app (control room redesign, section 6.6): the banner on every route, the scope in words, a drill that is never a trip, and locks by scope. */

const org = { id: "scr_1", org_id: "org", scope: "organization", reason: "Bad prompt shipped", pulled_by: "m", drill: false };
const proj = { id: "scr_2", org_id: "org", scope: "project", project_id: "p1", reason: "Wrong plant", pulled_by: "m", drill: false };
const summary = (scram: object) => ({ scram, run_count: 2, pulled_at: new Date().toISOString() });

function scrams(...list: object[]) {
  server.use(http.get("*/scrams", () => HttpResponse.json({ scrams: list.map(summary) })));
}

async function renderShell(path = "/board") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <Shell session={{ registered: true, signed_in: true, user: "ben" }}>
        <Outlet />
      </Shell>
    ),
  });
  const children = [...PLACES.map((p) => p.to), "/packages/$id"].map((to) => createRoute({ getParentRoute: () => root, path: to, component: () => <p>at {to}</p> }));
  const router = createRouter({ routeTree: root.addChildren(children), history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  const utils = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, qc, ...utils };
}

function baseApi(projects: object[] = []) {
  server.use(
    http.get("*/workspace/projects", () => HttpResponse.json(projects)),
    http.get("*/inbox", () => HttpResponse.json({ items: [] })),
    http.get("*/scrams/:id", () => HttpResponse.json({ scram: org, restarts: [], packages: [], runs: [] })),
  );
}

describe("the SCRAM banner is app-wide", () => {
  it("shows on a route that is not the Plant, naming the organization, and rims the frame in the trip colour", async () => {
    baseApi();
    scrams(org);
    await renderShell("/board");
    const banner = await screen.findByRole("region", { name: "SCRAM in force" });
    expect(within(banner).getByText("SCRAM: organization")).toBeTruthy();
    expect(within(banner).getByText(/Bad prompt shipped/)).toBeTruthy();
    expect(document.querySelector(".shell")!.getAttribute("data-scram")).toBe("trip");
    expect(banner.querySelector('[data-kind="trip"]')).not.toBeNull();
    // The top bar's SCRAM lamp is lit and says so in words, and Restart sits beside SCRAM.
    expect(screen.getByRole("img", { name: /SCRAM lamp lit: agent work stopped\. SCRAM in force: organization/ })).toBeTruthy();
    expect(document.querySelector(".scram-switch")!.getAttribute("data-lamp")).toBe("trip");
    expect(screen.getByRole("tooltip").textContent).toMatch(/Agent work is stopped/);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Restart" }));
    const review = within(banner).getByRole("button", { name: "Review and restart" });
    expect(review.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(review);
  });

  it("names the project by its workspace name for a project SCRAM", async () => {
    baseApi([{ id: "p1", name: "Plant A", mode: "software" }]);
    scrams(proj);
    await renderShell("/inbox");
    const banner = await screen.findByRole("region", { name: "SCRAM in force" });
    await waitFor(() => expect(within(banner).getByText("SCRAM: project Plant A")).toBeTruthy());
    expect(document.querySelector(".shell")!.getAttribute("data-scram")).toBe("trip");
  });

  it("shows nothing, a withdrawn gauge and no rim when no SCRAM is in force", async () => {
    baseApi();
    scrams();
    await renderShell("/board");
    await waitFor(() => expect(document.querySelector(".scram-switch")!.getAttribute("data-lamp")).toBe("off"));
    // One SCRAM button, a dark lamp, no "No SCRAM" label and no Restart.
    expect(screen.getAllByRole("link", { name: "SCRAM" })).toHaveLength(1);
    expect(screen.queryByText("No SCRAM")).toBeNull();
    expect(screen.queryByRole("button", { name: "Restart" })).toBeNull();
    expect(screen.getByRole("img", { name: /SCRAM lamp off/ })).toBeTruthy();
    // What SCRAM does, on hover or focus: it stops all agent activity, and the way back is a restart.
    const tip = screen.getByRole("tooltip");
    expect(screen.getByRole("link", { name: "SCRAM" }).getAttribute("aria-describedby")).toBe(tip.id);
    expect(tip.textContent).toMatch(/Stops all agent activity at once/);
    expect(tip.textContent).toMatch(/Restart/);
    expect(screen.queryByRole("region", { name: "SCRAM in force" })).toBeNull();
    expect(document.querySelector(".shell")!.getAttribute("data-scram")).toBe("clear");
  });

  it("shows a drill as a striped DRILL plate, never the trip palette, and locks like a trip", async () => {
    baseApi();
    scrams({ ...org, id: "scr_d", drill: true });
    await renderShell("/board");
    const banner = await screen.findByRole("region", { name: "SCRAM in force" });
    expect(within(banner).getByText("DRILL")).toBeTruthy();
    expect(within(banner).getByText("SCRAM drill: organization")).toBeTruthy();
    expect(banner.querySelector('[data-kind="drill"]')).not.toBeNull();
    expect(banner.querySelector('[data-kind="trip"]')).toBeNull();
    expect(document.querySelector(".shell")!.getAttribute("data-scram")).toBe("drill");
    expect(document.querySelector(".scram-switch")!.getAttribute("data-lamp")).toBe("drill");
    await waitFor(() => expect((screen.getByRole("button", { name: /New change/ }) as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByRole("button", { name: /New change/ }).title).toMatch(/SCRAM drill/);
  });

  it("hides a SCRAM's reason while the Plant is presenting", async () => {
    baseApi();
    scrams(org);
    act(() => setPresenting(true));
    try {
      await renderShell("/board");
      await screen.findByRole("region", { name: "SCRAM in force" });
      expect(screen.getByText("Its reason, the runs it stopped and the way back are not shown while presenting.")).toBeTruthy();
      // Restart is not offered while presenting; SCRAM itself stays.
      expect(screen.queryByRole("button", { name: "Restart" })).toBeNull();
      expect(screen.getByRole("link", { name: "SCRAM" })).toBeTruthy();
    } finally {
      act(() => setPresenting(false));
    }
  });
});

describe("what a SCRAM locks", () => {
  it("locks New change app-wide for an organization SCRAM, button and the C key", async () => {
    baseApi([{ id: "p1", name: "Plant A", mode: "software" }]);
    scrams(org);
    await renderShell("/board");
    const user = userEvent.setup();
    const cta = (await screen.findByRole("button", { name: /New change/ })) as HTMLButtonElement;
    await waitFor(() => expect(cta.disabled).toBe(true));
    expect(cta.title).toMatch(/whole organization/);
    await user.keyboard("c");
    expect(screen.queryByRole("dialog")).toBeNull();
    // SCRAM itself is never locked.
    expect(screen.getByRole("link", { name: "SCRAM" })).toBeTruthy();
  });

  it("locks a project SCRAM for that project only", async () => {
    baseApi([
      { id: "p1", name: "Plant A", mode: "software" },
      { id: "p2", name: "Plant B", mode: "software" },
    ]);
    scrams(proj);
    await renderShell("/board");
    const user = userEvent.setup();
    const cta = (await screen.findByRole("button", { name: /New change/ })) as HTMLButtonElement;
    await user.click(await screen.findByRole("button", { name: "Plant A" }));
    await waitFor(() => expect(cta.disabled).toBe(true));
    expect(cta.title).toMatch(/this project/);
    await user.click(screen.getByRole("button", { name: "Plant B" }));
    await waitFor(() => expect(cta.disabled).toBe(false));
  });

  it("locks the modal by the project it targets, even from the all-projects view or after editing the field", async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    baseApi([
      { id: "p1", name: "Plant A", mode: "software" },
      { id: "p2", name: "Plant B", mode: "software" },
    ]);
    scrams(proj);
    await renderShell("/board");
    const user = userEvent.setup();
    // All projects: the sidebar's lock is off, so the button opens the modal.
    await user.click(await screen.findByRole("button", { name: /New change/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Capture settings" }));
    const field = within(dialog).getByLabelText("Project / Workstream");
    const capture = () => within(dialog).getByRole("button", { name: /^Capture (change|packet|deliverable)$/ }) as HTMLButtonElement;
    await user.clear(field);
    await user.type(field, "Plant B");
    expect(capture().disabled).toBe(false);
    await user.clear(field);
    await user.type(field, "Plant A");
    await waitFor(() => expect(capture().disabled).toBe(true));
    expect(capture().title).toMatch(/this project/);
  });

  it("works out the lock from the SCRAMs in force: drills lock too, project locks match by id or name", () => {
    expect(lockedFor(NO_LOCK, "p1").locked).toBe(false);
    const drill = lockFrom([summary({ ...org, drill: true }) as never]);
    expect(lockedFor(drill, "p1")).toMatchObject({ locked: true, why: expect.stringMatching(/SCRAM drill/) });
    const orgLock = lockFrom([summary(org) as never]);
    expect(lockedFor(orgLock, null).locked).toBe(true);
    const p = lockFrom([summary(proj) as never]);
    expect(lockedFor(p, "P1").locked).toBe(true);
    expect(lockedFor(p, { id: "p9", name: "p1" }).locked).toBe(true);
    expect(lockedFor(p, "p2").locked).toBe(false);
    // An action tied to no project (creating a project) is not locked by a project SCRAM.
    expect(lockedFor(p, null).locked).toBe(false);
  });
});

describe("the 1 second budget is logged in development", () => {
  it("records event received, query refreshed and banner visible, in that order", async () => {
    resetScramTimings();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      markScram("received", 1000);
      scrams(org);
      const { renderPage } = await import("../test/render.js");
      await renderPage(<ScramBanner />);
      await screen.findByRole("region", { name: "SCRAM in force" });
      await waitFor(() => expect(scramTimings.at(-1)?.visible).toBeDefined());
      const t = scramTimings.at(-1)!;
      expect(t.received).toBe(1000);
      expect(t.refreshed!).toBeGreaterThanOrEqual(t.received!);
      expect(t.visible!).toBeGreaterThanOrEqual(t.refreshed!);
      expect(debug.mock.calls.map((c) => String(c[0]).replace(/ \(.*/, ""))).toEqual(["[scram timing] received", "[scram timing] refreshed", "[scram timing] visible"]);
    } finally {
      debug.mockRestore();
      resetScramTimings();
    }
  });
});
