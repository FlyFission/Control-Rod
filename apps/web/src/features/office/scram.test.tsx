import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { AgentFigure } from "../../api/types.js";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import type { Passkeys } from "../../lib/decide.js";
import { ScramBanner, ScramControl } from "./Scram.js";

/** SCRAM from the office (plan task 4.10; OV-12). */

const passkeys: Passkeys = { get: async () => ({ signed: true }), create: async () => ({}) };
const fig = (id: string, run_status: AgentFigure["run_status"], project_id?: string): AgentFigure => ({
  id, package_id: `WP-${id}`, package_revision: 0, title: id, role: "author", state: "working", cause: "x", since: new Date().toISOString(), place: "process",
  marks: { gate: false, safety: false }, gate_stage: "in-work", data_lane: "restricted", run_status, ...(project_id ? { project_id } : {}), href: { to: "/packages/$id", id: `WP-${id}` },
});
const scram = { id: "scr_1", org_id: "org", scope: "organization", pulled_by: "m", reason: "Bad prompt shipped", assertion: {}, quarantine: ["R-1", "R-2"] };

describe("SCRAM", () => {
  it("states the scope and every agent it stops before anything fires, then signs exactly that (OV-12)", async () => {
    const sent: { name: string; body: unknown }[] = [];
    server.use(
      // The whole floor, restricted work included: presenting mode never hides what SCRAM stops.
      http.get("*/office/figures", ({ request }) => {
        expect(new URL(request.url).search).toBe("");
        return HttpResponse.json({ figures: [fig("a", "running", "p1"), fig("b", "running"), fig("c", "queued", "p1"), fig("d", "succeeded", "p1")], needs_me: 0, inbox_items: 0, hidden: 0, generated_at: new Date().toISOString() });
      }),
      http.get("*/admin", () => HttpResponse.json({ projects: [{ id: "p1", name: "Plant A" }] })),
      http.post("*/admin/commands/:name/options", async ({ params, request }) => {
        sent.push({ name: `${String(params["name"])}/options`, body: await request.json() });
        return HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "a".repeat(64) }, options: { challenge: "c" } });
      }),
      http.post("*/admin/commands/:name", async ({ params, request }) => {
        sent.push({ name: String(params["name"]), body: await request.json() });
        return HttpResponse.json({ ...scram, scope: "project", project_id: "p1" });
      }),
    );
    await renderPage(<ScramControl passkeys={passkeys} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "SCRAM" }));
    const dialog = screen.getByRole("dialog", { name: "Pull SCRAM" });
    expect(await within(dialog).findByText(/This stops every running agent in the whole organization where it stands: 2 running now stop, and 1 queued is held\./)).toBeTruthy();
    const sign = within(dialog).getByRole("button", { name: "Sign with your passkey and stop" }) as HTMLButtonElement;
    // No reason, no stop.
    expect(sign.disabled).toBe(true);
    await user.click(within(dialog).getByRole("radio", { name: "One project" }));
    expect(within(dialog).getByText("Choose the project to see what this stops.")).toBeTruthy();
    await user.selectOptions(within(dialog).getByRole("combobox"), "p1");
    expect(within(dialog).getByText(/in the project Plant A where it stands: 1 running now stops, and 1 queued is held\./)).toBeTruthy();
    await user.type(within(dialog).getByRole("textbox", { name: "Why (required)" }), "Bad prompt shipped");
    await user.click(sign);
    await waitFor(() => expect(sent.map((s) => s.name)).toEqual(["scram.pull/options", "scram.pull"]));
    const payload = { scope: "project", project_id: "p1", reason: "Bad prompt shipped" };
    expect(sent[0]!.body).toEqual({ payload });
    expect(sent[1]!.body).toEqual({ payload, assertion: { signed: true } });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("takes focus when it opens, closes on Escape, and gives focus back", async () => {
    server.use(
      http.get("*/office/figures", () => HttpResponse.json({ figures: [], needs_me: 0, inbox_items: 0, hidden: 0, generated_at: new Date().toISOString() })),
      http.get("*/admin", () => HttpResponse.json({ projects: [] })),
    );
    await renderPage(<ScramControl passkeys={passkeys} />);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "SCRAM" });
    await user.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "The whole organization" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("shows the stop as it happens, then its recorded latency", async () => {
    let stopped = false;
    server.use(http.get("*/scrams", () => HttpResponse.json({ scrams: [{ scram, pulled_at: new Date().toISOString(), ...(stopped ? { stopped: { ms_to_stop: 1840, runs: 2, at: new Date().toISOString() } } : {}) }] })));
    const { qc } = await renderPage(<ScramBanner passkeys={passkeys} />);
    expect(await screen.findByText("Stopping 2 runs; each stops at its next heartbeat.")).toBeTruthy();
    stopped = true;
    await qc.invalidateQueries({ queryKey: ["scrams"] });
    expect(await screen.findByText("Stopped in 1.8 s: 2 runs stopped where they stood.")).toBeTruthy();
  });

  it("reviews what a stopped run reported, and shows the control plane's refusal of an unsafe restart", async () => {
    const sent: { name: string; body: any }[] = [];
    server.use(
      http.get("*/scrams", () => HttpResponse.json({ scrams: [{ scram, stopped: { ms_to_stop: 900, runs: 2, at: new Date().toISOString() } }] })),
      http.get("*/scrams/:id", () => HttpResponse.json({
        scram, restarts: [],
        runs: [
          { run_id: "R-1", status: "stopped", outcome_unknown: false, batches: [{ id: 3, reported: "succeeded", output_count: 2, recorded_at: new Date().toISOString(), outputs: [] }], reviews: [] },
          { run_id: "R-2", status: "lost", outcome_unknown: true, batches: [], reviews: [] },
        ],
      })),
      http.post("*/admin/commands/:name/options", () => HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "a".repeat(64) }, options: {} })),
      http.post("*/admin/commands/:name", async ({ params, request }) => {
        const body = await request.json();
        sent.push({ name: String(params["name"]), body });
        if (params["name"] === "scram.restart") return HttpResponse.json({ code: "outcome-unknown", message: "Run R-2 in scope has an unknown outcome; reconcile it before a restart" }, { status: 409 });
        return HttpResponse.json({});
      }),
    );
    await renderPage(<ScramBanner passkeys={passkeys} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Review and restart" }));
    expect(await screen.findByText(/R-2/)).toBeTruthy();
    expect(screen.getByText(/its outcome is unknown and must be reconciled before it can restart/)).toBeTruthy();
    // Review the run that reported, signing for the newest report it made.
    const [first] = screen.getAllByRole("textbox", { name: "What the review found (required)" });
    await user.type(first!, "Partial calc, not used");
    await user.click(screen.getAllByRole("button", { name: "Sign the review" })[0]!);
    await waitFor(() => expect(sent.find((s) => s.name === "scram.review")?.body.payload).toEqual({ scram_id: "scr_1", run_id: "R-1", disposition: "discard", reason: "Partial calc, not used", covers_batch: 3 }));
    // A staged restart asks for a reason, and the refusal is shown as the control plane gives it.
    await user.type(screen.getByRole("textbox", { name: "Package" }), "WP-9");
    const restart = screen.getByRole("button", { name: "Sign and restart" }) as HTMLButtonElement;
    expect(restart.disabled).toBe(true);
    await user.type(screen.getByRole("textbox", { name: "Why it is safe to restart (required)" }), "Prompt reverted");
    await user.click(restart);
    expect(await screen.findByText("Run R-2 in scope has an unknown outcome; reconcile it before a restart")).toBeTruthy();
    expect(sent.find((s) => s.name === "scram.restart")?.body.payload).toEqual({ scram_id: "scr_1", scope: "package", package_id: "WP-9", reason: "Prompt reverted" });
  });
});
