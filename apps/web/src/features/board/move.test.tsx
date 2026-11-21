import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { DIGEST, pkg } from "../../test/fixtures.js";
import type { ActionDescriptor } from "../../api/types.js";
import type { Passkeys } from "../../lib/decide.js";
import { COLUMNS } from "../../lib/board.js";
import { menuItems, primaryItem } from "./actions.js";
import { CardActions } from "./CardActions.js";
import type { BoardCard } from "./useBoardData.js";

/** Act from the card (redesign M3, plan task 7). */

const allow = (command: string): ActionDescriptor => ({ command, label: command, allowed: true, signature: "direct" });
const refuse = (command: string, reason: string, change: string): ActionDescriptor => ({ command, label: command, allowed: false, signature: "direct", reason, change });

function card(over: Partial<BoardCard> = {}): BoardCard {
  const p = pkg({ id: "WP-7", title: "Pump curve memo", status: "in-verification", revision: 2 });
  return { pkg: p, kinds: ["doc"], column: "needs-signature", next: { tone: "needs", text: "Accept or return" }, runActive: false, lastKnown: false, offered: [allow("accept"), allow("return")], digest: DIGEST, ...over };
}

function passkeys(calls: unknown[]): Passkeys {
  return {
    async get(options) {
      calls.push(options);
      return { id: "cred", response: {} };
    },
    async create() {
      return {};
    },
  };
}

describe("menuItems", () => {
  it("lists decisions by their decision labels, never column names", () => {
    const items = menuItems([allow("release"), allow("accept"), allow("return"), allow("reject"), allow("accept-with-findings")], false);
    expect(items.map((i) => i.label)).toEqual(["Release", "Accept", "Accept with findings", "Return with direction", "Reject"]);
    const columnTitles = COLUMNS.map((c) => c.title);
    for (const i of items) expect(columnTitles).not.toContain(i.label);
  });

  it("lists a refused decision disabled with the server's reason and change", () => {
    const [item] = menuItems([refuse("accept", "The pre-check has not passed", "Wait for the pre-check")], false);
    expect(item).toEqual({ id: "accept", label: "Accept", enabled: false, reason: "The pre-check has not passed", change: "Wait for the pre-check" });
  });

  it("ignores commands that are not decisions", () => {
    expect(menuItems([allow("draft.edit")], false)).toEqual([]);
  });

  it("offers Stop only while a run is active", () => {
    expect(menuItems([], false).some((i) => i.id === "stop")).toBe(false);
    expect(menuItems([], true).map((i) => i.id)).toEqual(["stop"]);
  });

  it("puts only an open Release or Accept on the card face", () => {
    expect(primaryItem(menuItems([allow("return"), allow("reject")], false))).toBeUndefined();
    expect(primaryItem(menuItems([refuse("accept", "r", "c"), allow("return")], false))).toBeUndefined();
    expect(primaryItem(menuItems([allow("accept"), allow("return")], false))?.id).toBe("accept");
  });
});

describe("CardActions", () => {
  it("shows nothing when the card offers no current actions", async () => {
    const { offered: _unused, ...without } = card();
    const { container } = await renderPage(<CardActions card={without} />);
    expect(container.querySelector(".bd-actions")).toBeNull();
  });

  it("signs the primary decision over the card's digest and says it was recorded", async () => {
    const signed: unknown[] = [];
    let sent: unknown;
    server.use(
      http.post("*/packages/WP-7/decisions/options", () => HttpResponse.json({ subject_digest: DIGEST, options: { challenge: "c" } })),
      http.post("*/packages/WP-7/decisions", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ kind: "accept", package_id: "WP-7", package_revision: 2 }, { status: 201 });
      }),
    );
    await renderPage(<CardActions card={card()} passkeys={passkeys(signed)} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Accept recorded.");
    expect(signed).toHaveLength(1);
    expect(sent).toMatchObject({ kind: "accept", package_revision: 2 });
  });

  it("shows the server's refusal in the card and sends nothing more", async () => {
    let decided = false;
    server.use(
      http.post("*/packages/WP-7/decisions/options", () =>
        HttpResponse.json({ code: "refused", message: "Acceptance needs the approver role", change: "An administrator grants the approver role" }, { status: 409 }),
      ),
      http.post("*/packages/WP-7/decisions", () => {
        decided = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    await renderPage(<CardActions card={card()} passkeys={passkeys([])} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Accept" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Acceptance needs the approver role");
    expect(alert.textContent).toContain("An administrator grants the approver role");
    expect(decided).toBe(false);
  });

  it("explains a refused menu item without sending any request", async () => {
    let asked = false;
    server.use(
      http.post("*/packages/WP-7/decisions/options", () => {
        asked = true;
        return HttpResponse.json({}, { status: 500 });
      }),
    );
    const c = card({ offered: [refuse("accept", "A person verification of the current work must come before Accept", "A qualified checker records a passing verification"), allow("return")] });
    await renderPage(<CardActions card={c} passkeys={passkeys([])} />);
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Move to/ }));
    const item = screen.getByRole("menuitem", { name: /Accept/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    await user.click(item);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("A person verification of the current work must come before Accept");
    expect(alert.textContent).toContain("A qualified checker records a passing verification");
    expect(asked).toBe(false);
  });

  it("asks for a reason before signing a return", async () => {
    const signed: unknown[] = [];
    let sent: unknown;
    server.use(
      http.post("*/packages/WP-7/decisions/options", () => HttpResponse.json({ subject_digest: DIGEST, options: {} })),
      http.post("*/packages/WP-7/decisions", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ kind: "return", package_id: "WP-7", package_revision: 2 }, { status: 201 });
      }),
    );
    await renderPage(<CardActions card={card()} passkeys={passkeys(signed)} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Move to/ }));
    await user.click(screen.getByRole("menuitem", { name: "Return with direction" }));
    const sign = screen.getByRole("button", { name: "Sign: Return with direction" });
    expect(sign).toHaveProperty("disabled", true);
    expect(signed).toHaveLength(0);
    await user.type(screen.getByLabelText("Direction for the next revision"), "Use the vendor curve");
    await user.click(sign);
    await waitFor(() => expect(sent).toMatchObject({ kind: "return", reason: "Use the vendor curve" }));
  });

  it("is usable by keyboard alone, and Escape returns focus to Move to", async () => {
    await renderPage(<CardActions card={card()} passkeys={passkeys([])} />);
    const user = userEvent.setup();
    const moveTo = screen.getByRole("button", { name: /Move to/ });
    moveTo.focus();
    await user.keyboard("{Enter}");
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(moveTo);
  });

  it("offers Stop while a run is active and sends the stop request", async () => {
    let stopped = false;
    server.use(
      http.post("*/packages/WP-7/runs/R-9/stop", () => {
        stopped = true;
        return HttpResponse.json({ id: "R-9", package_id: "WP-7", package_revision: 2, role: "author", status: "running" });
      }),
    );
    await renderPage(<CardActions card={card({ offered: [], runActive: true, activeRunId: "R-9" })} passkeys={passkeys([])} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Move to/ }));
    await user.click(screen.getByRole("menuitem", { name: "Stop run" }));
    await waitFor(() => expect(stopped).toBe(true));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("Stop requested"));
  });
});
