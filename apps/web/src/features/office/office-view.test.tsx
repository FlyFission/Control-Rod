import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { AgentFigure } from "../../api/types.js";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { REGION } from "./layout.js";
import { LENSES, LENS_COLORS, changeStep, lensById } from "./lenses.js";
import { OfficeView } from "./OfficeView.js";
import { seatFigures, shortCode } from "./seat.js";
import { causeGroups, exceptionsView, portfolio } from "./exceptions.js";

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
  run_status: "running",
  href: { to: "/packages/$id", id: "WP-0001", hash: "runs" },
  ...over,
  // A cause of its own unless a test gives it a shared one.
  cause_key: over.cause_key ?? `run:${over.id ?? "R-1"}`,
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

  it("leaves empty cube sets and rooms empty: a figure stands only in its own place (OV-26)", () => {
    const { seated } = seatFigures([figure({ id: "R-a", place: "process" }), figure({ id: "R-b", package_id: "WP-B", place: "review", state: "stuck" })], () => "#fff");
    expect(new Set(seated.map((f) => f.region))).toEqual(new Set(["process", "review"]));
    for (const f of seated) expect(REGION[f.region].seats.concat(REGION[f.region].queue)).toContainEqual(f.at);
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

  it("calls inputs current under the Change lens only where that is established", () => {
    const change = lensById("change");
    const base = figure();
    expect(changeStep(base)).toBe("unknown");
    expect(change.value(base)).toBe("Freshness unknown: no package input revisions were pinned");
    expect(changeStep(figure({ current_inputs: ["WP-3"] }))).toBe("current");
    expect(change.value(figure({ current_inputs: ["WP-3"] }))).toBe("Inputs current as pinned (WP-3)");
    // Mixed evidence: one input current, another unknown, is unknown.
    expect(changeStep(figure({ current_inputs: ["WP-3"], unverified_inputs: ["WP-4"] }))).toBe("unknown");
    expect(change.value(figure({ current_inputs: ["WP-3"], unverified_inputs: ["WP-4"] }))).toBe("Freshness unknown for WP-4");
    expect(changeStep(figure({ current_inputs: ["WP-3"], marks: { gate: false, safety: false, changed_input: "WP-5" } }))).toBe("changed");
    expect(new Set([base, figure({ current_inputs: ["WP-3"] }), figure({ marks: { gate: false, safety: false, changed_input: "WP-5" } })].map(change.tint)).size).toBe(3);
  });

  it("shows Spend from each agent's tightest budget, brighter nearer the limit, in words too, and dimmest with no budget or no report", () => {
    const spend = lensById("spend");
    expect(spend.unavailable).toBeUndefined();
    const at = (state: string, used?: string) => figure({ spend: { budget_id: "bud_1", mode: "hard-cap", unit: "minute", limit: "60", period: "P1D", state, ...(used ? { used } : {}) } as never });
    const order = [at("over", "75.00"), at("near", "50.00"), at("within", "10.00"), figure()].map((f) => spend.tint(f));
    expect(order).toEqual(["#f3f4f6", "#c7ccd4", "#9aa2ae", "#7b8494"]);
    expect(spend.value(at("over", "75.00"))).toBe("Over budget bud_1: 75.00 of 60 minutes of run time in P1D");
    expect(spend.value(figure())).toBe("No budget applies");
    expect(spend.value(figure({ spend: { budget_id: "bud_2", mode: "track", unit: "USD", limit: "50", period: "P1M", state: "not-reported" } as never }))).toBe("Budget bud_2: USD are not reported, so use is unknown");
    expect(spend.tint(figure({ spend: { budget_id: "bud_2", mode: "track", unit: "USD", limit: "50", period: "P1M", state: "not-reported" } as never }))).toBe("#7b8494");
    expect(LENS_COLORS.length).toBeGreaterThan(5);
  });
});

describe("office view", () => {
  beforeEach(() => server.use(http.get("*/scrams", () => HttpResponse.json({ scrams: [] }))));
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
    // Spend can be chosen; presenting shows no spend, so it gives way to Status and is unavailable.
    await userEvent.click(screen.getByRole("radio", { name: "Spend" }));
    expect(screen.getByRole("button", { name: /Spend lens: No budget applies\.$/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Presenting mode" }));
    expect(await screen.findByText(/2 agents on work above the internal lane are hidden/)).toBeTruthy();
    expect(asked).toContain("?presenting=true");
    expect((screen.getByRole("radio", { name: "Spend" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("radio", { name: "Status" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Spend lens: Spend is not shown while presenting.")).toBeTruthy();
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
  beforeEach(() => server.use(http.get("*/scrams", () => HttpResponse.json({ scrams: [] }))));
  const many = () => [
    ...Array.from({ length: 45 }, (_, i) =>
      figure({ id: `R-w${i}`, package_id: `WP-W${i}`, place: (["process", "mechanical", "electrical"] as const)[i % 3]!, project_id: i % 2 ? "plant-a" : "plant-b" }),
    ),
    figure({ id: "R-n", package_id: "WP-N", state: "needs", place: "your-office", cause: "Your signature", project_id: "plant-a" }),
    figure({ id: "R-s", package_id: "WP-S", state: "stuck", place: "review", cause: "Run failed", project_id: "plant-b" }),
    figure({ id: "R-g", package_id: "WP-G", marks: { gate: true, safety: false }, project_id: "plant-a" }),
    figure({ id: "R-u", package_id: "WP-U", unverified_inputs: ["WP-9"], project_id: "plant-b" }),
  ];

  it("folds healthy work past forty agents and keeps every agent needing attention drawn", () => {
    const v = exceptionsView(many(), false);
    expect(v.active).toBe(true);
    // An agent whose input freshness is unknown is not healthy: it stays drawn.
    expect(v.shown.map((f) => f.id).sort()).toEqual(["R-g", "R-n", "R-s", "R-u"]);
    expect(v.folded).toEqual([{ place: "process", count: 15 }, { place: "mechanical", count: 15 }, { place: "electrical", count: 15 }]);
    expect(exceptionsView(many().slice(0, 40), false).active).toBe(false);
    expect(exceptionsView(many(), true).shown).toHaveLength(49);
  });

  it("rolls the portfolio up per project, the ones needing attention first", () => {
    expect(portfolio(many())).toEqual([
      { project: "plant-a", agents: 24, needs: 1, stuck: 0 },
      { project: "plant-b", agents: 25, needs: 0, stuck: 1 },
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

describe("themes (plan task 4.9)", () => {
  let member = "ben";
  beforeEach(() => {
    localStorage.clear();
    member = "ben";
    server.use(
      http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: member })),
      http.get("*/scrams", () => HttpResponse.json({ scrams: [] })),
      http.get("*/office/figures", () => HttpResponse.json({ figures: [figure()], needs_me: 0, inbox_items: 0, hidden: 0, generated_at: new Date().toISOString() })),
    );
  });
  const art = () => [...document.querySelectorAll<HTMLImageElement>(".office-scene-art")].map((i) => i.getAttribute("src") ?? "");

  it("offers no choice in an ordinary build, where only the released theme ships", async () => {
    await renderPage(<OfficeView drafts={false} />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    expect(screen.queryByRole("combobox", { name: "Theme" })).toBeNull();
    expect(art().every((src) => src.startsWith("/office-themes/standard-office/"))).toBe(true);
  });

  it("in a draft build offers the fifteen worlds as drafts, switches the scene only, keeps the open card, and remembers the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = await renderPage(<OfficeView drafts />);
    await user.click(await screen.findByRole("button", { name: /^WP-0001/ }));
    const picker = screen.getByRole("combobox", { name: "Theme" });
    const options = within(picker).getAllByRole("option").map((o) => o.textContent);
    expect(options).toHaveLength(16);
    expect(options[0]).toBe("Standard Office");
    expect(options.slice(1).every((o) => o?.endsWith(" (draft)"))).toBe(true);
    expect(options).not.toContain("Harness Bright (draft)");
    await user.selectOptions(picker, "orbital-shipyard");
    expect(art().length).toBe(13);
    expect(art().every((src) => src.startsWith("/office-themes/orbital-shipyard/"))).toBe(true);
    // The figure, its selection and its card are the application's, untouched by the theme.
    expect(screen.getByRole("button", { name: /^WP-0001/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Line sizing" })).toBeTruthy();
    unmount();
    const again = await renderPage(<OfficeView drafts />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Theme" }) as HTMLSelectElement).value).toBe("orbital-shipyard"));
    again.unmount();
    // Another member signing in on this browser gets their own choice, not the last member's.
    member = "dora";
    await renderPage(<OfficeView drafts />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Theme" }) as HTMLSelectElement).disabled).toBe(false));
    expect((screen.getByRole("combobox", { name: "Theme" }) as HTMLSelectElement).value).toBe("standard-office");
  });

  it("falls back to the released theme when the remembered one is not offered in this build", async () => {
    localStorage.setItem("controlrod.office.theme.ben", "orbital-shipyard");
    await renderPage(<OfficeView drafts={false} />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    expect(art().every((src) => src.startsWith("/office-themes/standard-office/"))).toBe(true);
  });
});

describe("SCRAM while presenting", () => {
  it("keeps SCRAM at hand, but its count names no runs and asks the control plane for counts only", async () => {
    const asked: string[] = [];
    server.use(
      http.get("*/scrams", () => HttpResponse.json({ scrams: [] })),
      http.get("*/office/figures", () => HttpResponse.json({ figures: [figure()], needs_me: 0, inbox_items: 0, hidden: 2, generated_at: new Date().toISOString() })),
      http.get("*/admin", () => HttpResponse.json({ projects: [] })),
      http.get("*/scrams/preview", ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ scope: "organization", running_count: 3, queued_count: 1, presenting: true, counted_at: new Date().toISOString() });
      }),
    );
    await renderPage(<OfficeView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Presenting mode" }));
    await user.click(screen.getByRole("button", { name: "SCRAM" }));
    const dialog = screen.getByRole("dialog", { name: "Pull SCRAM" });
    expect(await within(dialog).findByText(/3 runs running now stop, and 1 queued run is held\./)).toBeTruthy();
    expect(asked.every((q) => q.includes("presenting=true"))).toBe(true);
    expect(within(dialog).queryByText("Which runs")).toBeNull();
    expect(within(dialog).getByText("Which runs is not shown while presenting.")).toBeTruthy();
  });
});

describe("shared causes (OV-03)", () => {
  beforeEach(() => server.use(http.get("*/scrams", () => HttpResponse.json({ scrams: [] }))));
  const held = (i: number) =>
    figure({ id: `R-h${i}`, package_id: `WP-H${i}`, state: "waiting", place: "interface", cause: "Author run waits for WP-PUMP to be accepted", cause_key: "deps:author:WP-PUMP", waiting_on: "the work it depends on (WP-PUMP)", since: new Date(Date.now() - (2 * 24 + i) * 3600e3).toISOString() });

  it("groups agents held by the same recorded cause into one chip, and never groups one", () => {
    const five = [0, 1, 2, 3, 4].map(held);
    const groups = causeGroups([...five, figure({ id: "R-lone", state: "stuck", cause: "Run failed" }), figure()]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ state: "waiting", cause: "Author run waits for WP-PUMP to be accepted", waiting_on: "the work it depends on (WP-PUMP)" });
    expect(groups[0]!.figures).toHaveLength(5);
    expect(groups[0]!.since).toBe(five[4]!.since);
  });

  it("groups by the recorded cause, never by matching words: two unrelated failures that read alike stay apart", () => {
    const failed = (id: string) => figure({ id, package_id: `WP-${id}`, state: "stuck", place: "review", cause: "Author run failed" });
    expect(causeGroups([failed("R-x"), failed("R-y")])).toEqual([]);
    // The same recorded hold groups even when one cause was clipped differently.
    const hold = (id: string, cause: string) => figure({ id, package_id: `WP-${id}`, state: "waiting", place: "interface", cause, cause_key: "hold:lane\u0000Lane held\u0000someone with lane authority", waiting_on: "someone with lane authority" });
    const groups = causeGroups([hold("R-p", "Lane held"), hold("R-q", "Lane held")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.figures.map((f) => f.id)).toEqual(["R-p", "R-q"]);
  });

  it("shows the chip with its input, owner, age and count, and opens to list the agents", async () => {
    server.use(http.get("*/office/figures", () => HttpResponse.json({ figures: [0, 1, 2, 3, 4].map(held), needs_me: 0, inbox_items: 0, hidden: 0, generated_at: new Date().toISOString() })));
    await renderPage(<OfficeView />);
    const chip = await screen.findByRole("button", { name: /^5 waiting: Author run waits for WP-PUMP to be accepted, waiting on the work it depends on \(WP-PUMP\), for 2 days$/ });
    await userEvent.click(chip);
    const list = within(screen.getByRole("region", { name: "Shared causes" })).getAllByRole("button", { name: /^WP-H\d: / });
    expect(list).toHaveLength(5);
  });
});

