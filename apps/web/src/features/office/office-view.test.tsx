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
    // Some runs reported no tokens: at least, never a complete total, and the dimmest step.
    const partial = figure({ spend: { budget_id: "bud_3", mode: "alert", unit: "token", limit: "1000000", period: "P1D", state: "partial", used: "1500.00", unreported_runs: 2 } as never });
    expect(spend.value(partial)).toBe("Budget bud_3: at least 1500.00 of 1000000 tokens in P1D; 2 runs reported none");
    expect(spend.tint(partial)).toBe("#7b8494");
    // Already past its limit with runs unreported: still a floor, never an exact total.
    const overPartial = figure({ spend: { budget_id: "bud_3", mode: "alert", unit: "token", limit: "1000", period: "P1D", state: "over", used: "1500.00", unreported_runs: 2 } as never });
    expect(spend.value(overPartial)).toBe("Over budget bud_3: at least 1500.00 of 1000 tokens in P1D; 2 runs reported none");
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
    // The annunciator: agents waiting on the viewer, and the rest of the Inbox with no agent yet.
    const strip = await screen.findByRole("list", { name: "Annunciator" });
    expect(await within(strip).findByText("Waiting on you: 1, 2 more in the Inbox")).toBeTruthy();
    expect(within(strip).getByText("Stuck: 0")).toBeTruthy();
    expect(within(strip).getByRole("link", { name: /Waiting on you/ }).getAttribute("href")).toBe("/inbox");
    expect(screen.getByText("2 agents in the plant")).toBeTruthy();
    // The core says how many work, in words, on the reactor building's plate.
    expect(within(screen.getByRole("region", { name: "Reactor building" })).getByText("1 agent working")).toBeTruthy();
    const office = screen.getByRole("region", { name: /^Your office, Main control room:/ });
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

describe("a failed refresh", () => {
  beforeEach(() => server.use(http.get("*/scrams", () => HttpResponse.json({ scrams: [] }))));
  it("keeps the last reading on screen, marked as of when it was read, and offers to try again", async () => {
    let calls = 0;
    server.use(
      http.get("*/office/figures", () =>
        calls++ === 0
          ? HttpResponse.json({ figures: [figure()], needs_me: 0, inbox_items: 0, hidden: 0, generated_at: new Date().toISOString() })
          : HttpResponse.json({ code: "boom", message: "down" }, { status: 500 }),
      ),
    );
    const { qc } = await renderPage(<OfficeView />);
    expect(await screen.findByText("1 agent in the plant")).toBeTruthy();
    await qc.refetchQueries({ queryKey: ["office-figures"] });
    const note = await screen.findByText(/^The last refresh failed\. Showing the reading as of /);
    expect(note).toBeTruthy();
    // The floor stays drawn, its figure still there, and the core says the reading is not current.
    expect(screen.getByRole("button", { name: /^WP-0001: / })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Reactor building" })).getByText(/^1 agent working, as of /)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
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

describe("the Plant and the archived office themes", () => {
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
  const archived = () => screen.getByRole("combobox", { name: "Archived office themes" }) as HTMLSelectElement;

  it("opens on the Plant, with its site drawing and no theme picker in the header", async () => {
    await renderPage(<OfficeView drafts={false} />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    expect(art().length).toBe(14);
    expect(art().every((src) => src.startsWith("/office-themes/plant/"))).toBe(true);
    expect(document.querySelector('[data-site]')).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Theme" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Plant" })).toBeTruthy();
  });

  it("keeps the fifteen worlds and the standard office under Advanced, switches to the office layout, keeps the open card, and remembers the choice per member", async () => {
    const user = userEvent.setup();
    const { unmount } = await renderPage(<OfficeView drafts={false} />);
    await user.click(await screen.findByRole("button", { name: /^WP-0001/ }));
    await user.click(screen.getByText("Advanced"));
    const options = within(archived()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toHaveLength(17);
    expect(options[0]).toBe("None: show the Plant");
    expect(options[1]).toBe("Standard Office");
    expect(options.some((o) => o?.endsWith(" (draft)"))).toBe(false);
    expect(options).not.toContain("Harness Bright");
    await user.selectOptions(archived(), "orbital-shipyard");
    expect(art().length).toBe(13);
    expect(art().every((src) => src.startsWith("/office-themes/orbital-shipyard/"))).toBe(true);
    expect(screen.getByText(/Archived theme: /)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Annunciator" })).toBeNull();
    // The figure, its selection and its card are the application's, untouched by the theme.
    expect(screen.getByRole("button", { name: /^WP-0001/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Line sizing" })).toBeTruthy();
    unmount();
    const again = await renderPage(<OfficeView drafts />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    await waitFor(() => expect(art().every((src) => src.startsWith("/office-themes/orbital-shipyard/"))).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Back to the Plant" }));
    expect(art().every((src) => src.startsWith("/office-themes/plant/"))).toBe(true);
    again.unmount();
    // Another member signing in on this browser gets their own choice, not the last member's.
    member = "dora";
    await renderPage(<OfficeView drafts />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    expect(art().every((src) => src.startsWith("/office-themes/plant/"))).toBe(true);
  });

  it("lands everyone on the Plant once: the old office theme choice is not read, and a choice this build does not offer falls back", async () => {
    localStorage.setItem("controlrod.office.theme.ben", "orbital-shipyard");
    const first = await renderPage(<OfficeView drafts={false} />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    expect(art().every((src) => src.startsWith("/office-themes/plant/"))).toBe(true);
    first.unmount();
    localStorage.setItem("controlrod.plant.view.ben", "harness-bright");
    await renderPage(<OfficeView drafts={false} />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    expect(art().every((src) => src.startsWith("/office-themes/plant/"))).toBe(true);
  });

  it("lists every agent by zone and place, and opens the same card from the list", async () => {
    server.use(
      http.get("*/office/figures", () =>
        HttpResponse.json({ figures: [figure(), figure({ id: "R-q", package_id: "WP-Q", state: "stuck", place: "quarantine", cause: "Held by SCRAM" })], needs_me: 0, inbox_items: 0, hidden: 0, generated_at: new Date().toISOString() }),
      ),
    );
    const user = userEvent.setup();
    await renderPage(<OfficeView drafts={false} />);
    await screen.findByRole("button", { name: /^WP-0001/ });
    await user.click(screen.getByRole("radio", { name: "List" }));
    const site = screen.getByRole("region", { name: "Site" });
    expect(within(site).getByText("Quarantine, Hold yard")).toBeTruthy();
    await user.click(within(site).getByRole("button", { name: /WP-Q: Stuck\. Held by SCRAM/ }));
    expect(within(screen.getByRole("complementary", { name: "Selected agent" })).getByText("Held by SCRAM")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Auxiliary building" })).getByRole("button", { name: /WP-0001: Working/ })).toBeTruthy();
  });

  it("never draws the core as dark, or the rods as withdrawn, when it could not read them", async () => {
    server.use(
      http.get("*/scrams", () => HttpResponse.json({ code: "boom", message: "down" }, { status: 500 })),
      http.get("*/office/figures", () => HttpResponse.json({ code: "boom", message: "down" }, { status: 500 })),
    );
    await renderPage(<OfficeView drafts={false} />);
    const strip = await screen.findByRole("list", { name: "Annunciator" });
    await waitFor(() => expect(within(strip).getByText("SCRAM: unavailable")).toBeTruthy());
    expect(within(strip).getByText("Waiting on you: unavailable")).toBeTruthy();
    expect(within(strip).queryByText(/: 0/)).toBeNull();
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

