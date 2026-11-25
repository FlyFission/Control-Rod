import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { view } from "../test/fixtures.js";
import type { AttentionItem, InboxView } from "../api/types.js";
import { Inbox, plainItem } from "./Inbox.js";
import { readNotifyChoice } from "../lib/attention.js";

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
  it("keeps the list readable until you inspect an item, then opens the signing drawer and closes it on Close/Esc", async () => {
    const items = [
      attentionItem({ package_id: "WP-0001", title: "First item" }),
      attentionItem({ package_id: "WP-0002", title: "Second item" }),
    ];
    mockInboxApi(() => items);

    const { container } = await renderPage(<Inbox />);
    const user = userEvent.setup();

    // The docked cockpit covers most of the page, so nothing opens by itself.
    await screen.findByText("First item");
    expect(screen.queryByRole("complementary", { name: /Review / })).toBeNull();
    expect(container.querySelector(".inbox-has-drawer")).toBeNull();

    // Inspect and sign opens the drawer for that item; its signing record is one click away under Details.
    await user.click(screen.getAllByRole("button", { name: "Open" })[0]!);
    expect(await screen.findByRole("complementary", { name: "Review WP-0001" })).toBeTruthy();
    expect(container.querySelector(".inbox-has-drawer")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Signing record/ })).toBeTruthy();

    // Clicking Close dismisses the drawer and does NOT snap back to WP-0001
    await user.click(screen.getByRole("button", { name: "Close review drawer" }));
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: /Review / })).toBeNull();
    });
    expect(container.querySelector(".inbox-has-drawer")).toBeNull();
    // Focus returns to the button that opened the drawer, not the page body.
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole("button", { name: "Open" })[0]));

    // Clicking Inspect and sign reopens the drawer for that item
    const inspectButtons = screen.getAllByRole("button", { name: "Open" });
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

    await screen.findByText("Second item");
    // Explicitly select WP-0002
    await user.click(screen.getAllByRole("button", { name: "Open" })[1]!);
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
    await user.click(screen.getByRole("button", { name: "Open" }));
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

describe("Inbox notifications opt-in", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  function stubNotification(start: NotificationPermission, answer: NotificationPermission) {
    const requestPermission = vi.fn(async () => {
      Fake.permission = answer;
      return answer;
    });
    const Fake = { permission: start, requestPermission };
    vi.stubGlobal("Notification", Fake);
    return requestPermission;
  }

  it("asks the browser only when the person chooses, then offers to turn it off", async () => {
    const ask = stubNotification("default", "granted");
    mockInboxApi(() => []);
    await renderPage(<Inbox />);
    const user = userEvent.setup();
    const on = await screen.findByRole("button", { name: "Notify me in this browser" });
    expect(ask).not.toHaveBeenCalled();
    await user.click(on);
    expect(ask).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole("button", { name: "Turn off notifications" }));
    expect(readNotifyChoice("ben")).toBe(false);
    expect(await screen.findByRole("button", { name: "Notify me in this browser" })).toBeTruthy();
  });

  it("says when the browser blocks notifications, and stays off", async () => {
    stubNotification("default", "denied");
    mockInboxApi(() => []);
    await renderPage(<Inbox />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Notify me in this browser" }));
    expect(await screen.findByText(/Notifications are blocked for this site/)).toBeTruthy();
    expect(readNotifyChoice("ben")).toBe(false);
  });

  it("offers nothing in a browser without notifications", async () => {
    vi.stubGlobal("Notification", undefined);
    mockInboxApi(() => []);
    await renderPage(<Inbox />);
    await screen.findByText(/Nothing waits on you/);
    expect(screen.queryByRole("button", { name: "Notify me in this browser" })).toBeNull();
  });
});

describe("an inbox item, in plain words", () => {
  it("never calls a run that did not finish a dispute, and keeps the runner's text under Details", () => {
    const said = plainItem({
      kind: "dispute",
      title: "Fix it",
      detail: "Run failed: verification.json does not match the schema, so the check cannot count",
      since: new Date().toISOString(),
      risk: { rank: 30, label: "Dispute" },
    } as unknown as Parameters<typeof plainItem>[0]);
    expect(said.label).toBe("Did not finish");
    expect(said.detail).toMatch(/^The checker's answer came back in a form Control Rod could not read/);
    expect(said.raw).toMatch(/verification\.json/);
  });
});
