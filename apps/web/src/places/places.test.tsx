import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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
