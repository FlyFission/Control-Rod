import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { NormalizedEvent, Run } from "../api/types.js";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { view } from "../test/fixtures.js";
import { AgentPanel, PANEL_STEPS, pickRun } from "./AgentPanel.js";

/** The agent panel (click-to-talk design, slice S1). */

const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const run = (over: Partial<Run>): Run => ({
  schema_version: "0.1.0", id: "R-1", package_id: "WP-0001", package_revision: 0, role: "author", agent_baseline: "author-claude",
  runtime: { kind: "local", provider: "claude", model: "any" }, round: 1, status: "succeeded", queued_at: ago(5), ...over,
});
const ev = (seq: number, event: Omit<NormalizedEvent, "at">) => ({ seq, event: { at: ago(0), ...event } as NormalizedEvent });

function serve(runs: Run[], events: Record<string, { seq: number; event: NormalizedEvent }[]>, stopped: string[] = []) {
  server.use(
    http.get("*/packages/:id", () => HttpResponse.json(view({ runs }))),
    http.get("*/packages/:id/runs/:runId/events", ({ params }) => HttpResponse.json({ events: events[String(params["runId"])] ?? [] })),
    http.post("*/packages/:id/runs/:runId/stop", ({ params }) => {
      stopped.push(String(params["runId"]));
      return HttpResponse.json(run({ id: String(params["runId"]), status: "running", stop_requested_at: new Date().toISOString() }));
    }),
  );
}

describe("pickRun", () => {
  const done = run({ id: "R-1", finished_at: ago(4) });
  const later = run({ id: "R-2", finished_at: ago(1) });
  const live = run({ id: "R-3", status: "running", started_at: ago(3) });

  it("follows the run asked for", () => expect(pickRun([done, later, live], "R-1")?.id).toBe("R-1"));
  it("prefers the newest live run over a newer finished one", () => expect(pickRun([done, later, live])?.id).toBe("R-3"));
  it("falls back to the newest run when none is live", () => expect(pickRun([done, later])?.id).toBe("R-2"));
  it("falls back when the run asked for is not on the package", () => expect(pickRun([done, later], "R-9")?.id).toBe("R-2"));
  it("is undefined with no runs", () => expect(pickRun([])).toBeUndefined());
});

describe("AgentPanel", () => {
  it("shows the live run's transcript from its recorded events", async () => {
    serve([run({ id: "R-1", finished_at: ago(4) }), run({ id: "R-2", round: 2, status: "running", started_at: ago(1) })], {
      "R-2": [
        ev(1, { kind: "message", text: "Reading the inputs" }),
        ev(2, { kind: "tool_start", tool: "Read", summary: "Read inputs/BRIEF.md", call_id: "c1" }),
        ev(3, { kind: "tool_end", call_id: "c1", ok: true }),
      ],
    });
    await renderPage(<AgentPanel packageId="WP-0001" />);
    const log = await screen.findByRole("log", { name: "Author transcript" });
    expect(within(log).getByText("Reading the inputs")).toBeTruthy();
    expect(within(log).getByText("Read inputs/BRIEF.md")).toBeTruthy();
    expect(within(log).getByLabelText("succeeded")).toBeTruthy();
    expect(screen.getByText("round 2")).toBeTruthy();
  });

  it("says plainly that a controlled run cannot be steered and offers Stop on a live run", async () => {
    const stopped: string[] = [];
    serve([run({ id: "R-2", status: "running", started_at: ago(1) })], { "R-2": [ev(1, { kind: "message", text: "Working" })] }, stopped);
    await renderPage(<AgentPanel packageId="WP-0001" />);
    expect(await screen.findByText(/cannot be steered/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Stop this run" }));
    await waitFor(() => expect(stopped).toEqual(["R-2"]));
  });

  it("leaves Stop to the caller when asked to", async () => {
    serve([run({ id: "R-2", status: "running", started_at: ago(1) })], { "R-2": [ev(1, { kind: "message", text: "Working" })] });
    await renderPage(<AgentPanel packageId="WP-0001" runId="R-2" showStop={false} />);
    await screen.findByText("Working");
    expect(screen.queryByRole("button", { name: "Stop this run" })).toBeNull();
  });

  it("offers no Stop on a finished run", async () => {
    serve([run({ id: "R-1", finished_at: ago(1) })], { "R-1": [ev(1, { kind: "exit", text: "exited" })] });
    await renderPage(<AgentPanel packageId="WP-0001" />);
    await screen.findByText("Ended");
    expect(screen.queryByRole("button", { name: "Stop this run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause updates" })).toBeNull();
  });

  it("says when no agent has run on the card", async () => {
    serve([], {});
    await renderPage(<AgentPanel packageId="WP-0001" />);
    expect(await screen.findByText("No agent has run on this card yet.")).toBeTruthy();
  });

  it("shows only the latest steps of a long run and says so", async () => {
    const many = Array.from({ length: PANEL_STEPS + 5 }, (_, i) => ev(i + 1, { kind: "message", text: `step ${i + 1}` }));
    serve([run({ id: "R-1", finished_at: ago(1) })], { "R-1": many });
    await renderPage(<AgentPanel packageId="WP-0001" />);
    await screen.findByText(`step ${PANEL_STEPS + 5}`);
    expect(screen.queryByText("step 1")).toBeNull();
    expect(screen.getByText(new RegExp(`latest ${PANEL_STEPS} of ${PANEL_STEPS + 5} steps`))).toBeTruthy();
  });

  it("holds what is shown while paused and counts what arrived", async () => {
    const events = { "R-2": [ev(1, { kind: "message", text: "first" })] };
    serve([run({ id: "R-2", status: "running", started_at: ago(1) })], events);
    await renderPage(<AgentPanel packageId="WP-0001" />);
    await screen.findByText("first");
    await userEvent.click(screen.getByRole("button", { name: "Pause updates" }));
    events["R-2"].push(ev(2, { kind: "message", text: "second" }));
    await waitFor(() => expect(screen.getByText("Paused: 1 new step since you paused.")).toBeTruthy(), { timeout: 4000 });
    expect(screen.queryByText("second")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Resume updates" }));
    expect(await screen.findByText("second")).toBeTruthy();
  });
});
