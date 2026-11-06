import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { ActionDescriptor, AdminView, RuntimePin, RuntimeStatus } from "../api/types.js";
import { Shell } from "../components/Shell.js";
import { Policies } from "../pages/Policies.js";
import { Registers } from "../pages/Registers.js";
import { Roster } from "../pages/Roster.js";
import { filterPackages } from "../pages/Packages.js";
import { PlaceError } from "../router.js";
import { DIGEST, pkg } from "../test/fixtures.js";
import { renderPage } from "../test/render.js";
import { server } from "../test/server.js";
import { buildCommands, filterCommands } from "./commands.js";
import { PLACES } from "./places.js";
import { resetLiveStatus, useLiveEvents, useLiveStatus } from "../lib/live.js";

/** Shell, places and command palette (plan tasks 3.1 and 3.2; specification 12, WB-03). */

const refusedPin: ActionDescriptor = {
  command: "runtime.pin", label: "Pin a runtime version", allowed: false, signature: "direct", authority: ["administrator"],
  missing: ["administrator authority"], reason_code: "authority-missing", reason: "This needs administrator authority, which your qualification does not include",
  change: "An administrator issues you a qualification with that authority.",
};
const allowedScram: ActionDescriptor = { command: "scram.pull", label: "Pull SCRAM", allowed: true, signature: "direct" };

function adminView(over: Partial<AdminView> = {}): AdminView {
  return {
    me: { userName: "ben", memberId: "mem_1", orgId: "org_local" },
    registry: { qualifications: [], credentials: [], delegations: [], bindings: [], change_requests: [], budgets: [] },
    hardware_formats_in_force: ["packed", "fido-u2f", "tpm"],
    bootstrap: false,
    qualification: null,
    members: [{ id: "mem_1", org_id: "org_local", user_name: "ben", display_name: "Ben", status: "active" }],
    projects: [],
    policy: null,
    themes: [],
    commands: [
      { name: "runtime.pin", label: "Pin a runtime version", signature: "direct", need: "administrator" },
      { name: "scram.pull", label: "Pull SCRAM", signature: "direct", need: "member" },
    ],
    actions: [refusedPin, allowedScram],
    floors: [{ code: "not-human", sentence: "Only a person may take this action.", change: "Nothing changes this." }],
    ...over,
  };
}

describe("commands", () => {
  it("lists the viewed package's actions first, then places, administration and packages, keeping refused ones with their reason", () => {
    const cmds = buildCommands({
      places: PLACES,
      packages: [pkg({ id: "WP-7", title: "Pump skid" })],
      packageId: "WP-7",
      packageActions: [{ command: "accept", label: "Accept", allowed: true, signature: "direct" }, { command: "draft.edit", label: "Edit draft", allowed: true, signature: "none" }],
      adminActions: [refusedPin],
    });
    expect(cmds.map((c) => c.group)).toEqual(["This package", "This package", ...PLACES.map(() => "Places"), "Administration", "Packages"]);
    expect(cmds[0]).toMatchObject({ label: "Accept", signed: true, target: { to: "/packages/$id", params: { id: "WP-7" }, hash: "decide" } });
    expect(cmds[1]!.target.hash).toBe("criteria");
    const pin = cmds.find((c) => c.id === "Administration:runtime.pin")!;
    expect(pin).toMatchObject({ allowed: false, missing: ["administrator authority"], target: { to: "/policies", hash: "command-runtime.pin" } });
    expect(pin.change).toMatch(/issues you a qualification/);
  });

  it("matches every word anywhere, with labels that start with the query first", () => {
    const cmds = buildCommands({ places: PLACES, packages: [pkg({ id: "WP-9", title: "Usage of steam" })] });
    expect(filterCommands(cmds, "usage").map((c) => c.label)).toEqual(["Usage", "Usage of steam"]);
    expect(filterCommands(cmds, "wp-9 steam").map((c) => c.label)).toEqual(["Usage of steam"]);
    expect(filterCommands(cmds, "")).toHaveLength(cmds.length);
  });
});

/** The real shell over a router that knows every place, each showing its own path. */
async function renderShell(path = "/inbox") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <Shell session={{ registered: true, signed_in: true, user: "ben" }}>
        <Outlet />
      </Shell>
    ),
  });
  const children = [...PLACES.map((p) => p.to), "/packages/$id"].map((to) =>
    createRoute({ getParentRoute: () => root, path: to, component: () => <p>at {to}</p> }),
  );
  const router = createRouter({ routeTree: root.addChildren(children), history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function apiFor(over: { actions?: ActionDescriptor[] } = {}) {
  server.use(
    http.get("*/office", () => HttpResponse.json([])),
    http.get("*/packages", () => HttpResponse.json([pkg({ id: "WP-7", title: "Pump skid" })])),
    http.get("*/admin", () => HttpResponse.json(adminView())),
    http.get("*/packages/WP-7/actions", () => HttpResponse.json(over.actions ?? [{ command: "accept", label: "Accept", allowed: true, signature: "direct" }])),
  );
}

describe("shell and palette", () => {
  it("shows every place in one navigation and marks the current one", async () => {
    apiFor();
    await renderShell("/registers");
    const nav = screen.getByRole("navigation", { name: "Places" });
    for (const p of PLACES) expect(nav.textContent).toContain(p.label);
    expect(screen.getByRole("link", { name: "Registers" }).getAttribute("aria-current")).toBe("page");
  });

  it("switches the board look and keeps it, leaving the rest of the app in look A", async () => {
    apiFor();
    delete document.documentElement.dataset["look"];
    await renderShell();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Look B Drafting table/ }));
    expect(screen.getByRole("button", { name: /Look B Drafting table/ }).getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("cr.look")).toBe("b");
    // Only the board container carries the look (M1 ruling 10); other pages still use look A colours.
    expect(document.documentElement.dataset["look"]).toBeUndefined();
    await user.click(screen.getByRole("button", { name: /Look A Control room/ }));
    expect(window.localStorage.getItem("cr.look")).toBe("a");
  });

  it("forgets the event stream state on sign out", async () => {
    apiFor();
    server.use(http.post("*/auth/logout", () => HttpResponse.json({ registered: true, signed_in: false })));
    let source: { emit(type: string): void } | undefined;
    class Source {
      private fns = new Map<string, (() => void)[]>();
      constructor() {
        source = this;
      }
      addEventListener(type: string, fn: () => void) {
        this.fns.set(type, [...(this.fns.get(type) ?? []), fn]);
      }
      emit(type: string) {
        for (const fn of this.fns.get(type) ?? []) fn();
      }
      close() {}
    }
    vi.stubGlobal("EventSource", Source);
    try {
      resetLiveStatus();
      const probe = renderHook(() => { useLiveEvents(true); return useLiveStatus(); }, {
        wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
      });
      act(() => source!.emit("error"));
      expect(probe.result.current.status).toBe("unknown");
      await renderShell();
      await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));
      await waitFor(() => expect(probe.result.current.status).toBe("connecting"));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("opens on Ctrl+K, finds a place by typing, and goes there on Enter", async () => {
    apiFor();
    const router = await renderShell();
    const user = userEvent.setup();
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: /Search places/ });
    expect(document.activeElement).toBe(input);
    await user.type(input, "polic");
    await waitFor(() => expect(screen.getByRole("option", { selected: true }).textContent).toContain("Policies"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/policies"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists a command the viewer may not take, says why and what would change it, and does nothing when chosen", async () => {
    apiFor();
    const router = await renderShell();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Search or run a command/ }));
    await user.type(screen.getByRole("combobox"), "pin a runtime");
    const option = await screen.findByRole("option", { name: /Pin a runtime version/ });
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.textContent).toContain("not available");
    expect(screen.getByText(/which your qualification does not include/)).toBeTruthy();
    expect(screen.getByText(/What would change it: An administrator issues you a qualification/)).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(router.state.location.pathname).toBe("/inbox");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("offers the viewed package's decisions and takes an allowed one to the decision bar", async () => {
    apiFor();
    const router = await renderShell("/packages/WP-7");
    const user = userEvent.setup();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByText("This package");
    expect(screen.getByRole("option", { selected: true }).textContent).toContain("Accept");
    expect(screen.getByRole("option", { selected: true }).textContent).toContain("passkey");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.hash).toBe("decide"));
    expect(router.state.location.pathname).toBe("/packages/WP-7");
  });

  it("keeps focus in the palette when a refused command is clicked, and Escape still closes it", async () => {
    apiFor();
    await renderShell();
    const user = userEvent.setup();
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox");
    await user.type(input, "pin a runtime");
    await user.click(await screen.findByRole("option", { name: /Pin a runtime version/ }));
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Focus that escapes to the page behind comes straight back.
    screen.getByRole("link", { name: "Roster" }).focus();
    expect(document.activeElement).toBe(input);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says when what the viewer may do could not be checked", async () => {
    apiFor();
    server.use(http.get("*/admin", () => HttpResponse.json({ code: "error", message: "down" }, { status: 500 })));
    await renderShell();
    await userEvent.setup().keyboard("{Control>}k{/Control}");
    expect(await screen.findByText(/What you may do could not be checked/)).toBeTruthy();
  });

  it("closes on Escape and gives focus back to where it was", async () => {
    apiFor();
    await renderShell();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /Search or run a command/ });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("moves with the arrow keys and wraps around", async () => {
    apiFor();
    await renderShell();
    const user = userEvent.setup();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog");
    await act(async () => {});
    const first = screen.getByRole("option", { selected: true }).textContent;
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { selected: true }).textContent).not.toBe(first);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { selected: true }).textContent).toBe(first);
  });
});

describe("places", () => {
  it("filters packages by every word and by status, hiding accepted and closed work by default", () => {
    const all = [pkg({ id: "WP-1", title: "Pump skid", status: "in-work" }), pkg({ id: "WP-2", title: "Pump house", status: "accepted" })];
    expect(filterPackages(all, "pump", "open").map((p) => p.id)).toEqual(["WP-1"]);
    expect(filterPackages(all, "pump", "all").map((p) => p.id)).toEqual(["WP-1", "WP-2"]);
    expect(filterPackages(all, "house", "accepted").map((p) => p.id)).toEqual(["WP-2"]);
  });

  it("builds the deliverables register from every package", async () => {
    server.use(http.get("*/packages", () => HttpResponse.json([pkg({ id: "WP-1", deliverables: [{ id: "D1", type: "pump datasheet", format: ["pdf"] }, { id: "D2", type: "P&ID" }] })])));
    await renderPage(<Registers />);
    expect(await screen.findByText("pump datasheet")).toBeTruthy();
    expect(screen.getByText("P&ID")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows each runtime's artifact and says when the installed version is not the pinned one", async () => {
    const runtimes: RuntimeStatus[] = [{ runtime: "claude", ready: true, version: "2.1.0", login_checked: false, artifact: { path: "/opt/claude", digest: { algorithm: "sha256", value: "b".repeat(64) } } }];
    const pins: RuntimePin[] = [{ id: "pin_1", org_id: "org_local", role: "author", runtime: "claude", artifact_version_id: "rav_1", artifact_digest: DIGEST, status: "active" }];
    server.use(http.get("*/runtimes", () => HttpResponse.json({ runtimes, pins })));
    await renderPage(<Roster />);
    expect(await screen.findByText("/opt/claude")).toBeTruthy();
    expect(screen.getByText(/installed claude is a different version, so author work waits/)).toBeTruthy();
  });

  it("never claims nothing is pinned when the runtimes could not be loaded", async () => {
    server.use(http.get("*/runtimes", () => HttpResponse.json({ code: "error", message: "down" }, { status: 500 })));
    await renderPage(<Roster />);
    expect(await screen.findByText("The runtimes could not be loaded.")).toBeTruthy();
    expect(screen.getByText("Pins are unknown until the runtimes load.")).toBeTruthy();
    expect(screen.queryByText(/Nothing is pinned/)).toBeNull();
    expect(screen.queryByText(/No daemon has reported/)).toBeNull();
  });

  it("shows the floors, and every administrative command with the viewer's standing", async () => {
    server.use(http.get("*/admin", () => HttpResponse.json(adminView())));
    await renderPage(<Policies />);
    expect(await screen.findByText("Only a person may take this action.")).toBeTruthy();
    const pin = document.getElementById("command-runtime.pin")!;
    expect(pin.textContent).toContain("Not available to you");
    expect(pin.textContent).toContain("Needs: administrator authority");
    expect(document.getElementById("command-scram.pull")!.textContent).toContain("You may");
    expect(document.getElementById("command-scram.pull")!.textContent).toContain("Needs: any active member");
  });

  it("contains a place that fails, with a way to try again", async () => {
    let reset = 0;
    await renderPage(<PlaceError error={new Error("bad data")} reset={() => reset++} />);
    expect(screen.getByRole("alert").textContent).toContain("bad data");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toBe(1);
  });
});
