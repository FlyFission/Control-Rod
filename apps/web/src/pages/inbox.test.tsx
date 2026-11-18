import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { view } from "../test/fixtures.js";
import type { AttentionItem, InboxView } from "../api/types.js";
import { Inbox } from "./Inbox.js";

function attentionItem(over: Partial<AttentionItem> & { package_id: string }): AttentionItem {
  return {
    kind: "accept",
    package_revision: 0,
    title: `Review ${over.package_id}`,
    detail: "Waiting for your decision.",
    since: new Date().toISOString(),
    risk: { rank: 1, label: "Standard" },
    href: { to: "/packages/$id", id: over.package_id },
    ...over,
  };
}

function mockInboxApi(getItems: () => AttentionItem[]) {
  server.use(
    http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: "ben" })),
    http.get("*/runtimes", () => HttpResponse.json({ runtimes: [], pins: [] })),
    http.get("*/inbox", () =>
      HttpResponse.json<InboxView>({
        items: getItems(),
        waiting_on_others: [],
        digest: { head: 1, lines: [] },
      }),
    ),
    http.get("*/packages/:id", ({ params }) => {
      const id = String(params["id"]);
      return HttpResponse.json(view({}, { id, title: `Package ${id}` }));
    }),
    http.get("*/packages/:id/actions", () => HttpResponse.json([])),
    http.get("*/packages/:id/person-verifications", () => HttpResponse.json([])),
  );
}

describe("Inbox", () => {
  it("auto-opens the drawer for the first package, keeps it closed on Close/Esc, and reopens on Inspect inline", async () => {
    const items = [
      attentionItem({ package_id: "WP-0001", title: "First item" }),
      attentionItem({ package_id: "WP-0002", title: "Second item" }),
    ];
    mockInboxApi(() => items);

    const { container } = await renderPage(<Inbox />);
    const user = userEvent.setup();

    // Auto-opens for the first package_id
    expect(await screen.findByRole("complementary", { name: "Review WP-0001" })).toBeTruthy();
    expect(container.querySelector(".inbox-has-drawer")).toBeTruthy();

    // Clicking Close dismisses the drawer and does NOT snap back to WP-0001
    await user.click(screen.getByRole("button", { name: "Close review drawer" }));
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: /Review / })).toBeNull();
    });
    expect(container.querySelector(".inbox-has-drawer")).toBeNull();

    // Clicking Inspect inline reopens the drawer for that item
    const inspectButtons = screen.getAllByRole("button", { name: "Inspect inline" });
    await user.click(inspectButtons[1]!);
    expect(await screen.findByRole("complementary", { name: "Review WP-0002" })).toBeTruthy();
    expect(container.querySelector(".inbox-has-drawer")).toBeTruthy();

    // Pressing Escape also closes the drawer cleanly without snapping back
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: /Review / })).toBeNull();
    });
    expect(container.querySelector(".inbox-has-drawer")).toBeNull();
  });

  it("closes the drawer when a selected package disappears on refresh and stays closed if dismissed", async () => {
    let items = [
      attentionItem({ package_id: "WP-0001", title: "First item" }),
      attentionItem({ package_id: "WP-0002", title: "Second item" }),
    ];
    mockInboxApi(() => items);

    const { container, qc } = await renderPage(<Inbox />);
    const user = userEvent.setup();

    await screen.findByRole("complementary", { name: "Review WP-0001" });

    // Explicitly select WP-0002 (WP-0001 currently shows "Inspecting")
    await user.click(screen.getByRole("button", { name: "Inspect inline" }));
    expect(await screen.findByRole("complementary", { name: "Review WP-0002" })).toBeTruthy();

    // WP-0002 is completed and no longer in inbox on refresh
    items = [attentionItem({ package_id: "WP-0001", title: "First item" })];
    await qc.invalidateQueries({ queryKey: ["inbox"] });

    await waitFor(() => {
      expect(screen.queryByText("Second item")).toBeNull();
      expect(screen.queryByRole("complementary", { name: "Review WP-0002" })).toBeNull();
    });
    expect(container.querySelector(".inbox-has-drawer")).toBeNull();

    // If explicitly dismissed, refreshing inbox with new items keeps the drawer closed
    await user.click(screen.getByRole("button", { name: "Inspect inline" }));
    expect(await screen.findByRole("complementary", { name: "Review WP-0001" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close review drawer" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: /Review / })).toBeNull());

    items = [
      attentionItem({ package_id: "WP-0001", title: "First item" }),
      attentionItem({ package_id: "WP-0003", title: "Third item" }),
    ];
    await qc.invalidateQueries({ queryKey: ["inbox"] });
    await screen.findByText("Third item");
    expect(screen.queryByRole("complementary", { name: /Review / })).toBeNull();
    expect(container.querySelector(".inbox-has-drawer")).toBeNull();
  });
});
