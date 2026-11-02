import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { PackageView, Run } from "../../api/types.js";
import { DIGEST, pkg, view } from "../../test/fixtures.js";
import { server } from "../../test/server.js";
import { CasePage } from "./CasePage.js";
import { presentation } from "./scaling.js";
import { story, traceFacts } from "./story.js";

/** The case view (plan tasks 3.4 to 3.7; specification 14, WB-08 partial, WB-09). */

const run = (over: Partial<Run> = {}): Run => ({
  schema_version: "0.1.0", id: "R-1", package_id: "WP-0001", package_revision: 0, role: "author", agent_baseline: "author-claude",
  runtime: { kind: "local", provider: "claude", model: "any" }, round: 1, status: "succeeded", queued_at: "2026-11-02T10:00:00Z", ...over,
});
const trace = (over: Record<string, unknown> = {}) => ({
  schema_version: "0.1.0" as const, run_id: "R-1", package_id: "WP-0001", package_revision: 0, agent_baseline: "author-claude", baseline_revision: 1,
  tool: { name: "claude", version: "2.1.316", digest: DIGEST }, inputs: [], outputs: [], started_at: "2026-11-02T10:00:00Z", finished_at: "2026-11-02T10:05:00Z",
  requested_model: "default", reported_model: "claude-opus-5-5", permission_mode: "acceptEdits", allowed_tools: ["Read", "Write"], sandbox: "workspace-write", ...over,
});

describe("scaling", () => {
  it("scales presentation by rigor, keeps the pre-check floor in every tier, and treats Safety and Material as high consequence", () => {
    expect(presentation(pkg({ rigor_mode: "administrative" }))).toMatchObject({ asked: "line", ran: "summary", checked: "compact", attestationRequired: false });
    expect(presentation(pkg({ rigor_mode: "quick" }))).toMatchObject({ asked: "brief", ran: "story", checked: "findings" });
    expect(presentation(pkg({ rigor_mode: "standard" }))).toMatchObject({ asked: "full", ran: "full", checked: "criteria" });
    expect(presentation(pkg({ rigor_mode: "quick", grade: "material" }))).toMatchObject({ tier: "high-consequence", asked: "full-inputs", attestationRequired: true, hardwareSigner: true, personVerification: true });
  });
});

describe("run stories", () => {
  it("tells a run as steps, joining each tool call to its result", () => {
    const steps = story([
      { seq: 1, event: { kind: "message", at: "t", text: "Reading the brief" } },
      { seq: 2, event: { kind: "tool_start", at: "t", tool: "Read", summary: "Read: BRIEF.md", call_id: "c1" } },
      { seq: 3, event: { kind: "tool_start", at: "t", tool: "Bash", summary: "Run: make", call_id: "c2" } },
      { seq: 4, event: { kind: "tool_end", at: "t", call_id: "c1", ok: true } },
      { seq: 5, event: { kind: "tool_end", at: "t", call_id: "c2", ok: false } },
      { seq: 6, event: { kind: "permission_request", at: "t", tool: "Bash", summary: "Run: rm" } },
      { seq: 7, event: { kind: "dropped", at: "t", dropped: 12 } },
      { seq: 8, event: { kind: "exit", at: "t", text: "exited" } },
    ]);
    expect(steps.map((s) => [s.kind, s.text, s.ok])).toEqual([
      ["said", "Reading the brief", undefined],
      ["tool", "Read: BRIEF.md", true],
      ["tool", "Run: make", false],
      ["asked", "Asked permission: Run: rm", undefined],
      ["dropped", "12 events were not kept", undefined],
      ["ended", "Ended", undefined],
    ]);
  });

  it("flags what the trace cannot show, plainly", () => {
    const facts = (r: Run, required = false) => Object.fromEntries(traceFacts(r, { attestationRequired: required }).map((f) => [f.label, f]));
    const clean = facts(run({ trace: trace() }));
    expect(clean["Artifact"]!.flag).toBeUndefined();
    expect(clean["Model reported"]!.flag).toBeUndefined();
    expect(clean["Attestation"]!.flag).toMatch(/not built yet/);
    const gaps = facts(run({ trace: trace({ tool: { name: "codex" }, requested_model: "gpt-x", reported_model: "gpt-y", sandbox: "none" }), permission_waits: "not-observable" }), true);
    expect(gaps["Artifact"]!.flag).toMatch(/not identified by digest/);
    expect(gaps["Model reported"]!.flag).toBe("Not the model asked for (gpt-x).");
    expect(gaps["Sandbox"]!.flag).toMatch(/not confined/);
    expect(gaps["Permission waits"]!.flag).toMatch(/no signal/);
    expect(gaps["Attestation"]!.flag).toMatch(/requires attestation claims, and none exist yet/);
    expect(facts(run())["Trace"]!.flag).toMatch(/reported no execution trace/);
  });
});

async function renderCase(v: PackageView, actions: unknown[] = [], events: unknown[] = []) {
  server.use(
    http.get("*/packages/WP-0001", () => HttpResponse.json(v)),
    http.get("*/packages/WP-0001/actions", () => HttpResponse.json(actions)),
    http.get("*/packages/WP-0001/runs/R-1/events", () => HttpResponse.json({ events })),
    http.get("*/packages/WP-0001/preparation", () => HttpResponse.json({}, { status: 404 })),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "/packages/$id/case", component: () => <CasePage id="WP-0001" /> });
  const pkgRoute = createRoute({ getParentRoute: () => root, path: "/packages/$id", component: () => <p>package</p> });
  const router = createRouter({ routeTree: root.addChildren([page, pkgRoute]), history: createMemoryHistory({ initialEntries: ["/packages/WP-0001/case"] }) });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: /Asked/ });
}

const refusedAll = ["release", "accept", "accept-with-findings", "return", "reject"].map((k) => ({
  command: k, label: k[0]!.toUpperCase() + k.slice(1), allowed: false, signature: "direct",
  reason: "This needs the approver role, which your qualification does not include", change: "An administrator issues you a qualification with that role.",
}));

describe("case view", () => {
  it("is one column in PROVE order, signed at the bottom, with the decision bar never absent", async () => {
    await renderCase(view({ binds: "Signing binds revision 0 of WP-0001: no outputs and no pre-check (sha256:ab12cd34ef56)." }, { status: "in-verification", rigor_mode: "standard" }), refusedAll);
    const steps = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.replace(/^\d/, ""));
    expect(steps.slice(0, 5)).toEqual(["Asked", "Ran", "Checked", "Open", "Sign"]);
    const bar = (await screen.findByRole("heading", { name: "Your decision" })).closest("section")!;
    await waitFor(() => expect(bar.textContent).toContain("which your qualification does not include"));
    // The strip at the bottom always says what a signature binds and whether one is open.
    const strip = screen.getByRole("region", { name: "Decision" });
    expect(strip.textContent).toContain("sha256:ab12cd34ef56");
    expect(strip.textContent).toContain("which your qualification does not include");
  });

  it("shows the pre-check floor even in the most compact tier", async () => {
    await renderCase(view({}, { status: "in-verification", rigor_mode: "administrative" }), refusedAll);
    expect(screen.getByText("Pre-check: not done yet.")).toBeTruthy();
    expect(screen.getByText(/Required before acceptance in every tier/)).toBeTruthy();
  });

  it("says when the pre-check shares the author's runtime, with the override", async () => {
    await renderCase(view({
      pre_check: {
        schema_version: "0.1.0", package_id: "WP-0001", package_revision: 0, output: { path: "out/a.md", digest: DIGEST }, method: "agent-pre-check", verifier: "checker",
        evidence: [], findings: [{ id: "F-1", severity: "major", text: "Units missing" }], outcome: "fail",
        independence: { runtime: "shared", author_runtime: { kind: "local", provider: "claude", model: "any" }, checker_runtime: { kind: "local", provider: "claude", model: "any" },
          owner_override: { by: "ben", at: "2026-11-02T10:00:00Z", reason: "Only one runtime installed", subject_digest: DIGEST, assertion: { credential_id: "c", authenticator_data: "a", client_data_json: "j", signature: "s" } } },
      },
    }, { status: "in-verification", rigor_mode: "standard" }), refusedAll);
    expect(screen.getByText(/not independent on that axis\. Owner override by ben: Only one runtime installed/)).toBeTruthy();
    // An unresolved finding is open.
    expect(screen.getByText("Finding F-1 (major) is unresolved: Units missing")).toBeTruthy();
  });

  it("shows who generated, selected and presented the evidence and flags every axis not separated, even compactly", async () => {
    const record = {
      schema_version: "0.1.0" as const, package_id: "WP-0001", package_revision: 0, output: { path: "out/a.md", digest: DIGEST }, method: "agent-pre-check" as const,
      verifier: "checker-codex", findings: [], outcome: "pass" as const,
      evidence: [{ claim: "Every criterion checked", status: "pass" as const, custody: { generated_by: "checker-codex", selected_by: "checker-codex", presented_by: "control-plane",
        coupling: { actor: "independent" as const, context: "independent" as const, mechanism: "independent" as const, authority: "independent" as const, resource: "shared" as const } } }],
    };
    await renderCase(view({ pre_check: record }, { status: "in-verification", rigor_mode: "administrative" }), refusedAll);
    // Compact tier: the warning shows even though details are folded.
    expect(screen.getByText(/Evidence not fully separated from the author on resource/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Show everything" }));
    expect(await screen.findByText(/Generated by checker-codex, selected by checker-codex, presented by control-plane/)).toBeTruthy();
    expect(screen.getByText("Not separated: resource shared.")).toBeTruthy();
  });

  it("says a running run's story is still being written", async () => {
    await renderCase(view({ runs: [run({ status: "running" })] }, { status: "in-work", rigor_mode: "standard" }), refusedAll,
      [{ seq: 1, event: { kind: "message", at: "t", text: "Working" } }]);
    expect(await screen.findByText("Still running; the story updates as it goes.")).toBeTruthy();
  });

  it("tells each run's story with its trace facts and flags", async () => {
    const events = [
      { seq: 1, event: { kind: "tool_start", at: "t", tool: "Write", summary: "Write: out/calc.md", call_id: "w" } },
      { seq: 2, event: { kind: "tool_end", at: "t", call_id: "w", ok: true } },
      { seq: 3, event: { kind: "exit", at: "t", text: "exited" } },
    ];
    await renderCase(view({ runs: [run({ trace: trace({ requested_model: "opus", reported_model: "sonnet" }) })] }, { status: "in-verification", rigor_mode: "standard" }), refusedAll, events);
    expect(await screen.findByText("Write: out/calc.md")).toBeTruthy();
    expect(screen.getByLabelText("succeeded")).toBeTruthy();
    expect(screen.getByText("Not the model asked for (opus).")).toBeTruthy();
    expect(screen.getByText(/2 to weigh/)).toBeTruthy();
  });

  it("opens design inputs, methodology and the signer requirements for high consequence work, and Show everything opens the rest", async () => {
    await renderCase(view({}, {
      status: "draft", rigor_mode: "quick", grade: "safety", discipline: "mechanical",
      design_inputs: [{ doc: "DBD-100", revision: "C", title: "Design basis", use: "Pump duty" }],
      methodology: { method: "Hydraulic Institute 9.6.7", status: "proposed" },
    }), refusedAll);
    expect(screen.getByText(/DBD-100 rev C/)).toBeTruthy();
    expect(screen.getByText("proposed, not approved")).toBeTruthy();
    expect(screen.getByText(/credentialed signer with an attested hardware key/)).toBeTruthy();
    expect(screen.getByText(/a person must verify before the work is accepted/)).toBeTruthy();
  });

  it("keeps the compact tier one click from everything", async () => {
    await renderCase(view({}, { status: "draft", rigor_mode: "administrative", acceptance_criteria: ["One", "Two", "Three"] }), refusedAll);
    expect(screen.queryByText("Three")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Show everything" }));
    await waitFor(() => expect(screen.getByText("Three")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Show the administrative view/ }).getAttribute("aria-pressed")).toBe("true");
  });
});
