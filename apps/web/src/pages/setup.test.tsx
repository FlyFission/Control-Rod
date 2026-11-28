import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRows, readBack } from "../lib/agents.js";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { resetLitSeats } from "../components/AgentList.js";
import { AgentsRoster } from "./AgentsRoster.js";
import { Setup } from "./Setup.js";

const AT = "2026-11-23T17:00:00Z";
/** Ben's first macOS install: both CLIs installed and signed in, Codex refused by the daemon. */
const runtimes = {
  reported_at: AT,
  pins: [],
  runtimes: [
    { runtime: "claude", ready: true, version: "2.1.330", login_checked: true },
    { runtime: "codex", ready: false, version: "0.171.0", login_checked: true, reason: "codex 0.171.0 is not a qualified version" },
  ],
};
const probe = (id: string, name: string, family: string, version: string) => ({
  id,
  display_name: name,
  vendor_family: family,
  installed: true,
  path: `/Users/someone/.local/bin/${id}`,
  observed_version: version,
  auth: "signed-in",
  roles: [],
});
const subscriptions = {
  reported: true,
  reported_at: AT,
  platform: "darwin",
  probes: [probe("claude", "Claude Code", "Anthropic", "2.1.330"), probe("codex", "Codex", "OpenAI", "0.171.0")],
  checkers: [],
  tiers: [],
  local_rule: "",
  pins: [],
};
const fresh = { confirmed: false, seats: [], check_in: "start-and-merge", writing: "focus" };

function api(setup: object = fresh, onPut?: (body: unknown) => void) {
  server.use(
    http.get("*/runtimes", () => HttpResponse.json(runtimes)),
    http.get("*/subscriptions", () => HttpResponse.json(subscriptions)),
    http.get("*/setup", () => HttpResponse.json(setup)),
    http.put("*/setup", async ({ request }) => {
      const body = (await request.json()) as { seats: unknown; check_in: string };
      onPut?.(body);
      return HttpResponse.json({ confirmed: true, confirmed_at: AT, ...body });
    }),
    http.put("*/setup/seats/:runtime", async ({ request, params }) => {
      const body = (await request.json()) as { seated: boolean };
      onPut?.({ runtime: params.runtime, ...body });
      return HttpResponse.json({ ...(setup as object), seats: [{ runtime: params.runtime, seated: body.seated }] });
    }),
    http.get("*/roster", () => HttpResponse.json({ roles: [], baselines: [], baselines_recorded: false, versions: [], sandbox: { policies: [], launched: [] } })),
    http.get("*/admin", () => HttpResponse.json({ actions: [] })),
  );
}

describe("agent rows", () => {
  it("says why an installed, signed-in agent is off, in the daemon's words, so the roster and Provider CLIs agree", () => {
    const rows = agentRows(runtimes.runtimes, subscriptions as never, fresh as never);
    const codex = rows.find((r) => r.info.id === "codex")!;
    expect(codex.state).toBe("held");
    expect(codex.seated).toBe(true);
    expect(codex.status).toBe("Installed and signed in, but Control Rod won't give it work yet. Codex 0.171.0 is not a qualified version.");
    expect(rows.find((r) => r.info.id === "claude")!.state).toBe("ready");
    expect(rows.find((r) => r.info.id === "grok")!.state).toBe("not-found");
    expect(rows.find((r) => r.info.id === "opencode")!.state).toBe("not-yet");
  });

  it("does not repeat \"installed\" when the daemon's reason already opens with it", () => {
    const rt = [{ runtime: "codex", ready: false, login_checked: true, reason: "codex is installed, but Control Rod can only run a runtime it can identify by digest" }];
    const codex = agentRows(rt, subscriptions as never, fresh as never).find((r) => r.info.id === "codex")!;
    expect(codex.status).toBe("Installed and signed in, but Control Rod won't give it work yet. Control Rod can only run a runtime it can identify by digest.");
  });

  it("reads back who writes and who checks, following the dispatcher", () => {
    const ready = runtimes.runtimes.map((r) => ({ ...r, ready: true }));
    expect(readBack(agentRows(ready, subscriptions as never, fresh as never))).toBe(
      "As things stand, Claude Code would write the work and Codex would check it without seeing how it was written. Antigravity and Grok CLI are seated and will join once they're ready.",
    );
    expect(readBack(agentRows(runtimes.runtimes, subscriptions as never, fresh as never))).toBe(
      "As things stand, Claude Code would write the work. Nobody from another vendor can check it yet, so checks wait for a second agent unless you sign an override. Codex, Antigravity and Grok CLI are seated and will join once they're ready.",
    );
    const benched = { confirmed: true, seats: [{ runtime: "claude", seated: false }], check_in: "start" };
    expect(readBack(agentRows(ready, subscriptions as never, benched as never))).toBe(
      "As things stand, Codex would write the work. Nobody from another vendor can check it yet, so checks wait for a second agent unless you sign an override. Antigravity and Grok CLI are seated and will join once they're ready.",
    );
  });

  it("never claims to have found an agent nobody checked", () => {
    const rows = agentRows([], { ...subscriptions, reported: false, probes: [] } as never, fresh as never);
    expect(rows.filter((r) => r.info.runnable).every((r) => r.state === "not-checked")).toBe(true);
  });
});

describe("first-run setup", () => {
  it("states what it found, asks one question, reads it back, and saves nothing until Looks right", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    api(fresh, (b) => sent.push(b));
    await renderPage(<Setup />);
    expect(await screen.findByText(/won't give it work yet\. Codex 0\.171\.0 is not a qualified version\./)).toBeTruthy();
    expect(screen.getByRole("radio", { name: /At the start and before merge/ })).toHaveProperty("checked", true);

    await user.click(screen.getByRole("switch", { name: "Claude Code" }));
    expect(screen.getByRole("switch", { name: "Claude Code" }).getAttribute("aria-checked")).toBe("false");
    // Check-in points that are not built are not offered (WEB-14).
    expect(screen.queryByRole("radio", { name: /Just at the start/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /At every step/ })).toBeNull();
    expect(screen.queryByText("Coming soon")).toBeNull();
    const back = screen.getByRole("region", { name: "Here's what you're setting up" });
    expect(within(back).getByText(/No agent at the table can work yet/)).toBeTruthy();
    expect(within(back).getByText(/Check-in preference: at the start and before merge\./)).toBeTruthy();
    expect(screen.getByText(/Other check-in points are not built yet/)).toBeTruthy();
    expect(sent).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Looks right" }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    // Only the switch this page changed is sent, so a stale page cannot undo a switch made elsewhere.
    expect(sent[0]).toEqual({ seats: [{ runtime: "claude", seated: false }] });
  });

  it("reads a saved check-in that is not built as the built one, and saves that", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    api({ ...fresh, check_in: "every-step" }, (b) => sent.push(b));
    await renderPage(<Setup />);
    expect(await screen.findByRole("radio", { name: /At the start and before merge/ })).toHaveProperty("checked", true);
    await user.click(screen.getByRole("button", { name: "Looks right" }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ seats: [], check_in: "start-and-merge" });
  });

  it("offers a New project button where signing waits for a project (WEB-13)", async () => {
    const user = userEvent.setup();
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    api(fresh);
    await renderPage(<Setup />);
    expect(await screen.findByText(/Create a project first/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "New project" }));
    expect(await screen.findByRole("heading", { name: "New project" })).toBeTruthy();
  });

  it("starts agents on Focus writing, reads the choice back, and sends Standard only when the person picks it", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    api(fresh, (b) => sent.push(b));
    await renderPage(<Setup />);
    const focus = await screen.findByRole("radio", { name: /^Focus/ });
    expect(focus).toHaveProperty("checked", true);
    const back = screen.getByRole("region", { name: "Here's what you're setting up" });
    expect(within(back).getByText("Agents write to you: Focus.")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /^Standard/ }));
    expect(within(back).getByText("Agents write to you: Standard.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Looks right" }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ seats: [], writing: "standard" });
  });

  it("gives each copy button its command as its name, and says so when copying is not possible", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/runtimes", () => HttpResponse.json({ ...runtimes, runtimes: [] })),
      http.get("*/subscriptions", () => HttpResponse.json({ ...subscriptions, probes: [{ ...subscriptions.probes[1], installed: true, auth: "signed-out" }] })),
      http.get("*/setup", () => HttpResponse.json(fresh)),
    );
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await renderPage(<Setup />);
    await user.click(await screen.findByRole("button", { name: "Copy codex login" }));
    expect(await screen.findByText(/Couldn't copy here/)).toBeTruthy();
  });

  it("names the agents it cannot run yet in one line, without switches", async () => {
    api();
    await renderPage(<Setup />);
    const later = await screen.findByText(/^Coming later:/);
    for (const name of ["OpenCode", "Local model (Ollama)"]) expect(later.textContent).toContain(name);
    for (const name of ["Antigravity", "Grok CLI"]) expect(later.textContent).not.toContain(name);
    expect(screen.queryByText("OpenCode", { selector: "li *" })).toBeNull();
  });
});

describe("seats at the table", () => {
  beforeEach(() => resetLitSeats());
  it("shows each agent as a seat with its icon, status lamp and a found count, lighting up in setup", async () => {
    api();
    const { container } = await renderPage(<Setup />);
    await screen.findByText(/won't give it work yet/);
    const seats = container.querySelectorAll("li.seat");
    expect(seats.length).toBeGreaterThanOrEqual(2);
    const claude = container.querySelector('li.seat[data-state="ready"]')!;
    expect(claude.querySelector(".seat-lamp [data-badge='claude'] img[src='/agent-marks/claude.svg']")).not.toBeNull();
    expect(claude.hasAttribute("data-light")).toBe(true);
    expect(screen.getByText("2 found, 1 ready")).toBeTruthy();
    // The three-way confirm still follows the table.
    expect(screen.getByRole("button", { name: "Looks right" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy();
  });

  it("does not light seats up under reduced motion", async () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as never;
    try {
      api();
      const { container } = await renderPage(<Setup />);
      await screen.findByText(/won't give it work yet/);
      expect(container.querySelector("li.seat[data-light]")).toBeNull();
    } finally {
      window.matchMedia = real;
    }
  });
});

describe("agents roster", () => {
  const usage = (over: object = {}) => ({
    budgets: [],
    records: [],
    telemetry: [{ runtime: "claude", runs: 12, reported: 10 }, { runtime: "codex", runs: 1, reported: 1 }],
    near_share: null,
    ...over,
  });

  it("reads runs recorded so far per runtime on each seat, from /usage telemetry", async () => {
    server.use(http.get("*/usage", () => HttpResponse.json(usage())));
    api({ confirmed: true, confirmed_at: AT, seats: [], check_in: "start-and-merge" });
    await renderPage(<AgentsRoster />);
    expect(await screen.findByText("12 runs recorded")).toBeTruthy();
    expect(screen.getByText("1 run recorded")).toBeTruthy();
  });

  it("says no runs rather than hiding the line, and says so when usage cannot be read", async () => {
    server.use(http.get("*/usage", () => HttpResponse.json(usage({ telemetry: [] }))));
    api({ confirmed: true, confirmed_at: AT, seats: [], check_in: "start-and-merge" });
    const first = await renderPage(<AgentsRoster />);
    expect((await screen.findAllByText("No runs recorded yet")).length).toBeGreaterThanOrEqual(2);
    first.unmount();
    server.use(http.get("*/usage", () => HttpResponse.json({ code: "error", message: "x" }, { status: 500 })));
    await renderPage(<AgentsRoster />);
    expect((await screen.findAllByText("Runs not available")).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the organization's remaining budget once, above the seats, and no per-agent budget", async () => {
    const b = (id: string, scope: string, value: string, used: number | null, state = "within") => ({
      budget: { id, org_id: "o", scope, scope_id: scope === "organization" ? "o" : "claude", mode: "alert", limit: { value, unit: "USD" }, period: "P1M", status: "active" },
      used, in_flight: 0, unreported_runs: 0, since: AT, state,
    });
    server.use(http.get("*/usage", () => HttpResponse.json(usage({ budgets: [b("B-1", "organization", "100", 37.5), b("B-2", "agent", "10", 9, "near")] }))));
    api({ confirmed: true, confirmed_at: AT, seats: [], check_in: "start-and-merge" });
    const { container } = await renderPage(<AgentsRoster />);
    const budget = await screen.findByRole("region", { name: "Organization budget" });
    expect(budget.textContent).toContain("62.50 USD left");
    expect(budget.textContent).toContain("37.50 of 100 used this month");
    expect(screen.getAllByRole("region", { name: "Organization budget" })).toHaveLength(1);
    expect(container.querySelector("li.seat")!.textContent).not.toMatch(/USD|budget/i);
    const table = screen.getByRole("region", { name: "Council table" });
    expect(budget.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says a budget is not reported instead of showing a number", async () => {
    const b = { budget: { id: "B-1", org_id: "o", scope: "organization", scope_id: "o", mode: "track", limit: { value: "100", unit: "token" }, period: "P1M", status: "active" }, used: null, in_flight: 0, unreported_runs: 0, since: AT, state: "not-reported" };
    server.use(http.get("*/usage", () => HttpResponse.json(usage({ budgets: [b] }))));
    api({ confirmed: true, confirmed_at: AT, seats: [], check_in: "start-and-merge" });
    await renderPage(<AgentsRoster />);
    const budget = await screen.findByRole("region", { name: "Organization budget" });
    expect(budget.textContent).toContain("Not reported");
  });

  it("saves a switch at once and keeps the technical tables behind Advanced", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    api({ confirmed: true, confirmed_at: AT, seats: [], check_in: "start-and-merge" }, (b) => sent.push(b));
    await renderPage(<AgentsRoster />);
    expect(screen.getByRole("heading", { name: "Agents roster" })).toBeTruthy();
    await user.click(await screen.findByRole("switch", { name: "Codex" }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    // One seat only: the other seats, the answer and whether setup was confirmed are left alone.
    expect(sent[0]).toEqual({ runtime: "codex", seated: false });
    expect(screen.getByText(/Advanced: versions, pins, sandbox and probe details/).closest("details")?.open).toBe(false);
  });
});
