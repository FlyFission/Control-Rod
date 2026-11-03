import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { AgentFigure } from "../../api/types.js";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { REGION } from "./layout.js";
import { LENSES, LENS_COLORS, lensById } from "./lenses.js";
import { OfficeView } from "./OfficeView.js";
import { seatFigures, shortCode } from "./seat.js";
import { exceptionsView, portfolio } from "./exceptions.js";

/** The office view: seating, lenses, presenting mode and the card (plan tasks 4.5 and 4.8; OV-01, OV-07). */

const figure = (over: Partial<AgentFigure> = {}): AgentFigure => ({
  id: "R-1",
  package_id: "WP-0001",
  package_revision: 0,
  title: "Line sizing",
  role: "author",
  state: "working",
  cause: "Drafting the line sizing calculation",
  since: new Date(Date.now() - 2 * 3600e3).toISOString(),
  place: "mechanical",
  marks: { gate: false, safety: false },
  gate_stage: "in-work",
  data_lane: "internal",
  href: { to: "/packages/$id", id: "WP-0001", hash: "runs" },
  ...over,
});

describe("seating", () => {
  it("seats the longest waiting first, queues Your office at its door, and never stacks figures", () => {
    const needs = Array.from({ length: 12 }, (_, i) =>
      figure({ id: `R-${i}`, package_id: `WP-${i}`, state: "needs", place: "your-office", since: new Date(Date.now() - (20 - i) * 60e3).toISOString() }),
    );
    const { seated, overflow } = seatFigures(needs, () => "#fff");
    const office = REGION["your-office"];
    expect(seated.slice(0, 4).map((f) => f.at)).toEqual(office.seats);
    expect(seated.slice(4).map((f) => f.at)).toEqual(office.queue);
    expect(seated[0]!.id).toBe("R-0");
    // Two more than the room and its queue hold: listed, never drawn on top of each other.
    expect(overflow.map((f) => f.id)).toEqual(["R-10", "R-11"]);
    expect(new Set(seated.map((f) => `${f.at.x},${f.at.y}`)).size).toBe(seated.length);
  });

  it("shortens long codes for the plate and keeps the full id for the name", () => {
    expect(shortCode("WP-101")).toBe("WP-101");
    expect(shortCode("WP-0001")).toBe("…-0001");
    expect(shortCode("WP-FIG-CHANGED")).toBe("…ANGED");
    const [f] = seatFigures([figure({ package_id: "WP-FIG-CHANGED" })], () => "#fff").seated;
    expect(f).toMatchObject({ code: "…ANGED", name: "WP-FIG-CHANGED" });
  });
});

describe("lenses", () => {
  it("recolour only: the tint changes with the lens, the state and place never do", () => {
    const f = figure({ state: "needs", place: "your-office", gate_stage: "accept", marks: { gate: true, safety: false, changed_input: "WP-9" } });
    const seatedBy = LENSES.filter((l) => !l.unavailable).map((l) => seatFigures([f], l.tint).seated[0]!);
    expect(new Set(seatedBy.map((s) => s.tint)).size).toBe(3);
    for (const s of seatedBy) expect({ state: s.state, at: s.at, region: s.region }).toEqual({ state: "needs", at: REGION["your-office"].seats[0], region: "your-office" });
  });

  it("offers Spend only once usage is recorded, and says so", () => {
    expect(lensById("spend").unavailable).toMatch(/5\.2/);
    expect(LENS_COLORS.length).toBeGreaterThan(5);
  });
});

describe("office view", () => {
  it("shows the figures, what waits on the viewer, and a card that says why (OV-01, OV-02)", async () => {
    server.use(
      http.get("*/office/figures", () =>
        HttpResponse.json({
          figures: [
            figure(),
            figure({ id: "R-2", package_id: "WP-0002", state: "needs", place: "your-office", cause: "Pre-check passed. Review and accept.", gate_stage: "accept", marks: { gate: true, safety: true }, href: { to: "/packages/$id", id: "WP-0002", hash: "decide" } }),
          ],
          needs_me: 1,
          inbox_items: 3,
          hidden: 0,
          generated_at: new Date().toISOString(),
        }),
      ),
    );
    await renderPage(<OfficeView />);
    // Agents waiting on the viewer, and the rest of the Inbox with no agent yet: never fewer than the Inbox holds.
    expect(await screen.findByText(/1 agent waits on you; 2 more in the Inbox with no agent yet · 2 agents on the floor/)).toBeTruthy();
    const office = screen.getByRole("region", { name: /^Your office:/ });
    expect(office).toBeTruthy();
    const needs = screen.getByRole("button", { name: "WP-0002: Needs you. Pre-check passed. Review and accept. Marks: a gate decision waits, Safety grade. Status lens: Needs you." });
    await userEvent.click(needs);
    const card = screen.getByRole("complementary", { name: "Selected agent" });
    expect(within(card).getByText("Pre-check passed. Review and accept.")).toBeTruthy();
    expect(within(card).getByText("A gate decision waits on this package")).toBeTruthy();
    expect(within(card).getByText("Safety grade")).toBeTruthy();
    expect(within(card).getByText("Status lens: Needs you")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Open the package" }).getAttribute("href")).toBe("/packages/WP-0002#decide");
  });

  it("switches lens without moving anyone, and presenting mode asks the server to leave restricted work out (OV-07)", async () => {
    const asked: string[] = [];
    server.use(
      http.get("*/office/figures", ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ figures: [figure()], needs_me: 0, inbox_items: 0, hidden: new URL(request.url).search ? 2 : 0, generated_at: new Date().toISOString() });
      }),
    );
    await renderPage(<OfficeView />);
    const button = await screen.findByRole("button", { name: /^WP-0001: Working/ });
    const before = button.getAttribute("style");
    await userEvent.click(screen.getByRole("radio", { name: "Gate" }));
    expect(screen.getByRole("radio", { name: "Gate" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: /^WP-0001: Working/ }).getAttribute("style")).toBe(before);
    expect(screen.getByRole("list", { name: "Gate lens" })).toBeTruthy();
    // The lens value is read with the figure, not only shown as a colour.
    expect(screen.getByRole("button", { name: /Gate lens: In work\.$/ })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Spend" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Presenting mode" }));
    expect(await screen.findByText(/2 agents on work above the internal lane are hidden/)).toBeTruthy();
    expect(asked).toContain("?presenting=true");
  });

  it("never shows a failed load as an empty office", async () => {
    server.use(http.get("*/office/figures", () => HttpResponse.json({ code: "boom", message: "down" }, { status: 500 })));
    await renderPage(<OfficeView />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/No agent is working right now/)).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy());
  });
});

describe("exceptions overlay and portfolio (OV-26)", () => {
  const many = () => [
    ...Array.from({ length: 45 }, (_, i) =>
      figure({ id: `R-w${i}`, package_id: `WP-W${i}`, place: (["process", "mechanical", "electrical"] as const)[i % 3]!, project_id: i % 2 ? "plant-a" : "plant-b" }),
    ),
    figure({ id: "R-n", package_id: "WP-N", state: "needs", place: "your-office", cause: "Your signature", project_id: "plant-a" }),
    figure({ id: "R-s", package_id: "WP-S", state: "stuck", place: "review", cause: "Run failed", project_id: "plant-b" }),
    figure({ id: "R-g", package_id: "WP-G", marks: { gate: true, safety: false }, project_id: "plant-a" }),
  ];

  it("folds healthy work past forty agents and keeps every agent needing attention drawn", () => {
    const v = exceptionsView(many(), false);
    expect(v.active).toBe(true);
    expect(v.shown.map((f) => f.id).sort()).toEqual(["R-g", "R-n", "R-s"]);
    expect(v.folded).toEqual([{ place: "process", count: 15 }, { place: "mechanical", count: 15 }, { place: "electrical", count: 15 }]);
    expect(exceptionsView(many().slice(0, 40), false).active).toBe(false);
    expect(exceptionsView(many(), true).shown).toHaveLength(48);
  });

  it("rolls the portfolio up per project, the ones needing attention first", () => {
    expect(portfolio(many())).toEqual([
      { project: "plant-a", agents: 24, needs: 1, stuck: 0 },
      { project: "plant-b", agents: 24, needs: 0, stuck: 1 },
    ]);
  });

  it("shows the folded counts and lets the viewer show everyone", async () => {
    server.use(http.get("*/office/figures", () => HttpResponse.json({ figures: many(), needs_me: 1, inbox_items: 1, hidden: 0, generated_at: new Date().toISOString() })));
    await renderPage(<OfficeView />);
    const folded = await screen.findByRole("list", { name: "Healthy work folded" });
    expect(within(folded).getByText("Process: 15 working")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^WP-N: Needs you/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^WP-W0: Working/ })).toBeNull();
    expect(screen.getByRole("table", { name: "Portfolio" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Show everyone" }));
    expect(screen.getByRole("button", { name: /^WP-W0: Working/ })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Healthy work folded" })).toBeNull();
  });
});
