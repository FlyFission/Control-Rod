import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { brief } from "../lib/today.js";
import { Today } from "./Today.js";

const figure = (id: string, state: string) => ({ id, package_id: id, package_revision: 1, title: id, role: "author", state, cause: "x", cause_key: id, since: "2026-11-24T08:00:00Z", place: "process", marks: { gate: false } });
const floor = (states: string[]) => ({ figures: states.map((s, i) => figure(`r${i}`, s)), needs_me: 0, inbox_items: 0, hidden: 0, generated_at: "2026-11-24T09:00:00Z" });
const item = (over: object) => ({
  kind: "accept", package_id: "WP-1", package_revision: 1, title: "Accept WP-1", detail: "d", since: "2026-11-24T07:00:00Z",
  risk: { rank: 41, label: "Standard gate" }, href: { to: "/packages/$id", id: "WP-1", hash: "decide" }, decisions: ["accept"], ...over,
});
const inbox = (items: object[]) => ({ items, waiting_on_others: [], digest: { head: 1, lines: [] } });

function serve(opts: { states?: string[]; items?: object[]; figuresFail?: boolean; inboxFail?: boolean } = {}) {
  server.use(
    http.get("*/packages", () => HttpResponse.json([])),
    http.get("*/runs/active", () => HttpResponse.json([])),
    http.get("*/office/figures", () => (opts.figuresFail ? HttpResponse.json({ code: "error", message: "down" }, { status: 500 }) : HttpResponse.json(floor(opts.states ?? [])))),
    http.get("*/inbox", () => (opts.inboxFail ? HttpResponse.json({ code: "error", message: "down" }, { status: 500 }) : HttpResponse.json(inbox(opts.items ?? [])))),
  );
}

describe("Today, the shift brief", () => {
  it("leads with one sentence and three readouts, then what needs you, riskiest first", async () => {
    serve({
      states: ["working", "working", "working", "working", "working", "working", "stuck"],
      items: [
        item({ kind: "scram", package_id: undefined, title: "SCRAM: drill", risk: { rank: 0, label: "Security hold" }, href: { to: "/policies", hash: "command-scram.restart" } }),
        item({ subject_digest: { algorithm: "sha256", value: "ab12cd34ef56aa" } }),
      ],
    });
    await renderPage(<Today />);
    await screen.findByRole("heading", { level: 1, name: "2 decisions waiting, 6 agents working, 1 stuck" });
    const brief = screen.getByRole("region", { name: "Shift brief" });
    const readouts = [...brief.querySelectorAll(".readout")].map((r) => `${r.querySelector("dt")!.textContent}=${r.querySelector("dd")!.textContent}`);
    expect(readouts).toEqual(["Waiting on you=2", "Agents working=6", "Stuck=1"]);
    const list = screen.getByRole("list", { name: "2 waiting on you" });
    expect([...list.querySelectorAll(".need-title")].map((a) => a.textContent)).toEqual(["SCRAM: drill", "Accept WP-1"]);
    expect(within(list).getByText("sha256:ab12cd34ef56")).toBeTruthy();
    expect(within(list).getByRole("link", { name: "Accept WP-1" }).getAttribute("href")).toBe("/packages/WP-1#decide");
    // The riskiest item's band is the tallest and carries a shape.
    expect(list.querySelectorAll(".risk-band")[0]!.getAttribute("data-level")).toBe("4");
  });

  it("is calm and finished when nothing needs you, with the plant at rest", async () => {
    serve({ states: ["working"] });
    await renderPage(<Today />);
    await screen.findByRole("heading", { level: 1, name: "Nothing needs you. 1 agent is working." });
    expect(await screen.findByText("Nothing needs you.", { selector: ".calm-title" })).toBeTruthy();
    expect(screen.getByText("Plant at rest")).toBeTruthy();
  });

  it("draws the plant thumbnail as raster art only, never as vector shapes", async () => {
    serve();
    const { container } = await renderPage(<Today />);
    await screen.findByRole("heading", { level: 1 });
    const plant = container.querySelector(".today-plant")!;
    expect(plant.querySelector("img")!.getAttribute("src")).toBe("/plant/base-1440.webp");
    expect(plant.querySelector("svg, canvas, path")).toBeNull();
  });

  it("shows a dash, not zero, for a read that failed, and says which", async () => {
    serve({ figuresFail: true, inboxFail: true });
    await renderPage(<Today />);
    const status = await screen.findByText(/could not be read/);
    expect(status.textContent).toMatch(/The Inbox and The plant could not be read/);
    const brief = screen.getByRole("region", { name: "Shift brief" });
    expect([...brief.querySelectorAll(".readout dd")].map((d) => d.textContent)).toEqual(["–", "–", "–"]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/^Nothing needs you/);
  });

  it("is not calm when only the plant read failed, though the Inbox is empty", async () => {
    serve({ figuresFail: true });
    await renderPage(<Today />);
    await screen.findByText(/The plant could not be read/);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/^Nothing needs you/);
    expect(screen.queryByText("Plant at rest")).toBeNull();
  });

  it("is not calm when the Inbox read failed, though the plant is quiet", async () => {
    serve({ inboxFail: true, states: ["working"] });
    await renderPage(<Today />);
    await screen.findByText(/The Inbox could not be read/);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/^Nothing needs you/);
    expect(screen.queryByText("Plant at rest")).toBeNull();
    expect(screen.queryByText("Nothing needs you.", { selector: ".calm-title" })).toBeNull();
  });

  it("does not reuse a cached zero when a refresh fails", () => {
    const f = floor(["working"]) as never;
    const i = inbox([]) as never;
    expect(brief(f, i).calm).toBe(true);
    expect(brief(f, i, { inbox: true }).calm).toBe(false);
    expect(brief(f, i, { floor: true }).calm).toBe(false);
    expect(brief(f, i, { floor: true }).stuck).toBeUndefined();
    expect(brief(undefined, i).calm).toBe(false);
  });

  it("points at the Inbox past five items", async () => {
    serve({ items: Array.from({ length: 7 }, (_, i) => item({ package_id: `WP-${i}`, title: `Accept WP-${i}`, href: { to: "/packages/$id", id: `WP-${i}` } })) });
    await renderPage(<Today />);
    expect(await screen.findByRole("link", { name: "2 more in the Inbox" })).toBeTruthy();
    expect(document.querySelectorAll(".need-row")).toHaveLength(5);
  });
});
