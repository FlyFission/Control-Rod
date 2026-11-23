import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { adoptSession } from "../lib/session.js";
import type { Session } from "../api/types.js";
import { Shell } from "./Shell.js";
import { SessionGate } from "../router.js";

const ben = { registered: true, signed_in: true, user: "ben" } as Session;
const dora = { registered: true, signed_in: true, user: "dora" } as Session;

/** Holds the sign-out answer until the test releases it, counting how many requests were sent. */
function heldLogout() {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let started!: () => void;
  const begun = new Promise<void>((r) => { started = r; });
  const sent = { count: 0 };
  server.use(
    http.get("*/inbox", () => HttpResponse.json({ items: [] })),
    http.post("*/auth/logout", async () => {
      sent.count += 1;
      started();
      await gate;
      return HttpResponse.json({ registered: true, signed_in: false });
    }),
  );
  return { release, begun, sent };
}

describe("signing out", () => {
  it("cannot be sent twice while a sign-out is pending", async () => {
    const held = heldLogout();
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement;
    await user.click(button);
    await held.begun;
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(held.sent.count).toBe(1);
    held.release();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("an answer that arrives after a newer sign-in does not replace the newer session", async () => {
    const held = heldLogout();
    // The server still holds Dora's session, so the check this answer triggers confirms her.
    server.use(http.get("*/auth/session", () => HttpResponse.json(dora)));
    const { qc } = await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await held.begun;
    // The earlier sign-out finished elsewhere and Dora signed in before this answer came back.
    await act(() => adoptSession(qc, dora));
    held.release();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(qc.getQueryData(["session"])).toEqual(dora);
  });

  it("a late answer makes the tab ask the server who is signed in, and shows sign-in when nobody is", async () => {
    // The late sign-out cleared the shared cookie in the browser before this script saw the answer,
    // so the server no longer holds the newer session either: only a fresh read can tell.
    const held = heldLogout();
    let serverState: Session = ben;
    let reads = 0;
    server.use(http.get("*/auth/session", () => { reads += 1; return HttpResponse.json(serverState); }));
    const { qc } = await renderPage(<SessionGate><p>app</p></SessionGate>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await held.begun;
    serverState = dora;
    await act(() => adoptSession(qc, dora));
    await screen.findByText("dora");
    const readsBefore = reads;
    serverState = { registered: true, signed_in: false } as Session;
    held.release();
    await screen.findByRole("button", { name: "Sign in with passkey" });
    expect(reads).toBeGreaterThan(readsBefore);
    expect(qc.getQueryData(["session"])).toMatchObject({ signed_in: false });
  });
});

describe("keyboard shortcut list", () => {
  it("opens with ? from anywhere outside a field, lists N, and closes with Escape", async () => {
    server.use(http.get("*/inbox", () => HttpResponse.json({ items: [], waiting_on_others: [], digest: { head: 0, lines: [] } })));
    await renderPage(<Shell session={ben}><input aria-label="Notes" /></Shell>);
    const user = userEvent.setup();
    await user.keyboard("?");
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog.textContent).toContain("Next card marked Needs you or Blocked");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();

    await user.click(screen.getByLabelText("Notes"));
    await user.keyboard("?");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    expect((screen.getByLabelText("Notes") as HTMLInputElement).value).toBe("?");
  });

  it("keeps other shortcuts from firing behind it, and closes again with ?", async () => {
    server.use(http.get("*/inbox", () => HttpResponse.json({ items: [], waiting_on_others: [], digest: { head: 0, lines: [] } })));
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.keyboard("?");
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    await user.keyboard("c");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.keyboard("?");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
  });

  it("opens from the Shortcuts button in the rail", async () => {
    server.use(http.get("*/inbox", () => HttpResponse.json({ items: [], waiting_on_others: [], digest: { head: 0, lines: [] } })));
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Shortcuts/ }));
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
  });
});

describe("single-key shortcuts switch", () => {
  afterEach(() => window.localStorage.clear());
  it("turns C and ? off on this browser, while the Shortcuts button still opens the list", async () => {
    server.use(http.get("*/inbox", () => HttpResponse.json({ items: [], waiting_on_others: [], digest: { head: 0, lines: [] } })));
    await renderPage(<Shell session={ben}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Shortcuts/ }));
    const toggle = await screen.findByRole("checkbox", { name: /Single-key shortcuts/ });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    await user.click(toggle);
    expect(window.localStorage.getItem("cr.single-key-shortcuts")).toBe("off");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.keyboard("?");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    await user.keyboard("c");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Shortcuts/ }));
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
  });
});

describe("tab title", () => {
  it("counts what waits on the signed-in person", async () => {
    document.title = "Control Rod";
    server.use(
      http.get("*/inbox", () =>
        HttpResponse.json({
          items: [
            { kind: "accept", package_id: "WP-1", package_revision: 1, title: "Accept WP-1", detail: "", since: "2026-11-22T10:00:00Z", risk: { rank: 5, label: "decision" }, href: { to: "/inbox" } },
          ],
          waiting_on_others: [],
          digest: { head: 0, lines: [] },
        }),
      ),
    );
    const { unmount } = await renderPage(<Shell session={ben}><p>app</p></Shell>);
    await waitFor(() => expect(document.title).toBe("(1) Control Rod"));
    unmount();
    expect(document.title).toBe("Control Rod");
  });
});
