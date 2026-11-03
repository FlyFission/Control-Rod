import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { AgentFigure, Run } from "../../api/types.js";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { view } from "../../test/fixtures.js";
import { AgentCard } from "./AgentCard.js";

/** The agent card (OV-06, OV-08, OV-10, OV-11). */

const figure = (over: Partial<AgentFigure> = {}): AgentFigure => ({
  id: "R-2",
  package_id: "WP-0001",
  package_revision: 0,
  title: "Line sizing",
  role: "author",
  state: "working",
  cause: "Drafting the line sizing calculation",
  since: new Date(Date.now() - 3 * 3600e3).toISOString(),
  place: "mechanical",
  marks: { gate: false, changed_input: "WP-0002", loop: 2, safety: true },
  gate_stage: "in-work",
  data_lane: "internal",
  run_status: "running",
  href: { to: "/packages/$id", id: "WP-0001", hash: "runs" },
  ...over,
  // A cause of its own unless a test gives it a shared one.
  cause_key: over.cause_key ?? `run:${over.id ?? "R-2"}`,
});

const run = (over: Partial<Run>): Run => ({
  schema_version: "0.1.0", id: "R-1", package_id: "WP-0001", package_revision: 0, role: "author", agent_baseline: "author-claude",
  runtime: { kind: "local", provider: "claude", model: "any" }, round: 1, status: "succeeded", queued_at: new Date(Date.now() - 5 * 3600e3).toISOString(), ...over,
});

function serve(stopped: string[] = []) {
  server.use(
    http.get("*/packages/:id", () =>
      HttpResponse.json(view({
        runs: [
          run({ id: "R-1", finished_at: new Date(Date.now() - 4 * 3600e3).toISOString() }),
          run({ id: "R-pc", role: "pre-check", agent_baseline: "checker-claude", status: "succeeded", finished_at: new Date(Date.now() - 3.5 * 3600e3).toISOString() }),
          run({ id: "R-2", round: 2, status: "running", started_at: new Date(Date.now() - 3 * 3600e3).toISOString() }),
        ],
        pre_check: {
          schema_version: "0.1.0", package_id: "WP-0001", package_revision: 0, method: "agent-pre-check", verifier: "checker-claude", evidence: [], findings: [], outcome: "fail",
          output: { path: "out/a.md", digest: { algorithm: "sha256", value: "a".repeat(64) } },
          independence: { runtime: "shared", author_runtime: { kind: "local", provider: "claude", model: "default" }, checker_runtime: { kind: "local", provider: "claude", model: "default" },
            owner_override: { by: "ben", reason: "Only one runtime is installed on the pilot laptop", at: new Date().toISOString() } },
        } as never,
      }, { rigor_mode: "standard", grade: "material", status: "in-verification" })),
    ),
    http.get("*/packages/:id/actions", () =>
      HttpResponse.json([{ command: "accept", label: "Accept", allowed: false, signature: "direct", reason: "This needs a Material grade qualification in mechanical", missing: ["mechanical discipline", "material grade"] }]),
    ),
    http.post("*/packages/:id/runs/:runId/stop", ({ params }) => {
      stopped.push(String(params["runId"]));
      return HttpResponse.json(run({ id: String(params["runId"]), status: "running", stop_requested_at: new Date().toISOString() }));
    }),
  );
}

describe("agent card", () => {
  it("shows the package at a glance, rigor and independence in words, and who may sign (OV-08, OV-10, OV-11)", async () => {
    serve();
    await renderPage(<AgentCard figure={figure()} lens={undefined} />);
    const card = screen.getByRole("complementary", { name: "Selected agent" });
    expect(within(card).getByText("Round 2")).toBeTruthy();
    expect(within(card).getByText("Safety grade")).toBeTruthy();
    expect(await within(card).findByText(/^Standard, Material grade$/)).toBeTruthy();
    // OV-10: the shared provider is stated in words, with the override's reason and signer.
    expect(within(card).getByText("Shared runtime: the author and the pre-check both ran on claude, in separate sessions. Owner override by ben: Only one runtime is installed on the pilot laptop")).toBeTruthy();
    // OV-11: sign shown unavailable, naming what is missing.
    expect(within(card).getByText(/You may not accept it: This needs a Material grade qualification in mechanical \(missing: mechanical discipline, material grade\)/)).toBeTruthy();
    // Freshness only as established, and the sources it does not compare are named.
    expect(within(card).getByText(/^Input WP-0002 changed since the preparation pinned it\. Documents and other sources are not compared here\.$/)).toBeTruthy();
    // The checker with its run's status, and the recorded pre-check's outcome.
    expect(within(card).getByText("checker-claude on claude, finished; recorded pre-check outcome: fail")).toBeTruthy();
    expect(within(card).getByText(/Not recorded until usage metering arrives/)).toBeTruthy();
    expect(within(card).getByText("No due date is recorded for this package.")).toBeTruthy();
  });

  it("offers the actions on the agent as governed commands, and says why the rest are not available (OV-06)", async () => {
    const stopped: string[] = [];
    serve(stopped);
    await renderPage(<AgentCard figure={figure()} lens={undefined} />);
    const actions = await screen.findByRole("region", { name: "Actions on this agent" });
    expect(within(actions).getByRole("link", { name: "Watch live" }).getAttribute("href")).toBe("/packages/WP-0001/case");
    for (const name of ["Call to my office", "Give direction", "Park"]) {
      const b = within(actions).getByRole("button", { name }) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(b.getAttribute("aria-describedby")).toBeTruthy();
    }
    expect(within(actions).getAllByText(/session adapter \(plan task 7\.2\)/)).toHaveLength(1);
    await userEvent.click(within(actions).getByRole("button", { name: "Inputs and reach" }));
    expect(within(actions).getByText(/Lane: internal\. Runtime: claude\./)).toBeTruthy();
    const stop = within(actions).getByRole("button", { name: "Stop" }) as HTMLButtonElement;
    await waitFor(() => expect(stop.disabled).toBe(false));
    await userEvent.click(stop);
    await waitFor(() => expect(stopped).toEqual(["R-2"]));
  });

  it("never offers stop on a run that is not queued or running", async () => {
    serve();
    await renderPage(<AgentCard figure={figure({ id: "R-1", run_status: "succeeded" })} lens={undefined} />);
    const actions = await screen.findByRole("region", { name: "Actions on this agent" });
    await waitFor(() => expect(within(actions).getByText("Only a queued or running run can be stopped.")).toBeTruthy());
    expect((within(actions).getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("names the signature the rung opens, and never borrows another gate's", async () => {
    serve();
    server.use(
      http.get("*/packages/:id", () => HttpResponse.json(view({ runs: [run({ id: "R-2", status: "running" })] }, { status: "in-work" }))),
      http.get("*/packages/:id/actions", () => HttpResponse.json([
        { command: "release", label: "Release", allowed: false, signature: "direct", reason: "Only a draft can be released" },
        { command: "accept", label: "Accept", allowed: false, signature: "direct", reason: "Nothing has passed a pre-check yet" },
      ])),
    );
    await renderPage(<AgentCard figure={figure({ marks: { gate: false, safety: false }, current_inputs: ["WP-0003"] })} lens={undefined} />);
    expect(await screen.findByText("No signature is open at this rung.")).toBeTruthy();
    expect(screen.getByText(/^Current as pinned: WP-0003\. Documents and other sources are not compared here\.$/)).toBeTruthy();
  });

  it("never offers stop twice: a stop asked for and not yet confirmed waits for the daemon", async () => {
    serve();
    await renderPage(<AgentCard figure={figure({ stop_requested: true })} lens={undefined} />);
    const actions = await screen.findByRole("region", { name: "Actions on this agent" });
    expect((within(actions).getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(actions).getByText("A stop was asked for; the daemon has not confirmed it yet.")).toBeTruthy();
  });

  it("stops a running intake agent, which has a capture and no package view", async () => {
    const stopped: string[] = [];
    serve(stopped);
    await renderPage(<AgentCard figure={figure({ id: "R-int", package_id: "CAP-1", role: "intake", href: { to: "/packages" } })} lens={undefined} />);
    const actions = screen.getByRole("region", { name: "Actions on this agent" });
    await userEvent.click(within(actions).getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(stopped).toEqual(["R-int"]));
  });
});
