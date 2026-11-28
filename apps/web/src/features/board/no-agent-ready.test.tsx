import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import type { CaptureView } from "../../api/types.js";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { CaptureCard, NO_AGENT_READY, captureLine } from "./CaptureCard.js";
import { CaptureDrawer } from "./CaptureDrawer.js";

/** RUN-1: a card made while no agent can take it says so and points to Setup, instead of "Intake queued". */

const capture = (over: Partial<CaptureView> = {}): CaptureView =>
  ({ schema_version: "0.1.0", id: "C-7", text: "Fix the login redirect", source: "web", created_at: "2026-11-28T10:00:00Z", lane: "internal", intake: { run_id: "R-7", status: "queued" }, ...over }) as CaptureView;

const subscriptions = { reported: true, platform: "linux", probes: [], checkers: [], tiers: [], local_rule: "", pins: [] };
const setup = { confirmed: true, seats: [], check_in: "start-and-merge", writing: "focus" };

function agents(runtimes: object[]) {
  server.use(
    http.get("*/runtimes", () => HttpResponse.json({ reported_at: "2026-11-28T10:00:00Z", pins: [], runtimes })),
    http.get("*/subscriptions", () => HttpResponse.json(subscriptions)),
    http.get("*/setup", () => HttpResponse.json(setup)),
  );
}

describe("a capture while no agent is ready", () => {
  it("reads as waiting on an agent only when the agent reads say so", () => {
    expect(captureLine(capture()).text).toBe("Intake queued");
    expect(captureLine(capture(), true)).toEqual({ tone: "wait", text: NO_AGENT_READY, setup: true });
    const { intake: _intake, ...waiting } = capture();
    expect(captureLine(waiting as CaptureView, true).setup).toBe(true);
    // A failed intake keeps its own reason and retry.
    expect(captureLine(capture({ intake: { run_id: "R-7", status: "failed", error: "x" } as never }), true).tone).toBe("block");
  });

  it("says so on the card and in the drawer, each with a way to Setup", async () => {
    agents([{ runtime: "codex", ready: false, login_checked: true, reason: "codex is installed but not signed in" }]);
    const card = await renderPage(<CaptureCard capture={capture()} />);
    expect(await screen.findByText(NO_AGENT_READY)).toBeTruthy();
    expect(screen.queryByText("Intake queued")).toBeNull();
    expect(screen.getByRole("link", { name: "Open Setup" }).getAttribute("href")).toBe("/setup");
    card.unmount();

    await renderPage(<CaptureDrawer capture={capture()} onClose={() => {}} />);
    expect(await screen.findAllByText(NO_AGENT_READY)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open Setup" })).toBeTruthy();
  });

  it("keeps \"Intake queued\" when an agent is ready", async () => {
    agents([{ runtime: "claude", ready: true, version: "2.1.332", login_checked: true }]);
    await renderPage(<CaptureCard capture={capture()} />);
    // The reads land after the first paint; give them a moment, then check nothing changed.
    await new Promise((r) => setTimeout(r, 50));
    expect(await screen.findByText("Intake queued")).toBeTruthy();
    expect(screen.queryByText(NO_AGENT_READY)).toBeNull();
  });
});
