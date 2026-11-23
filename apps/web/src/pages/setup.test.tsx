import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import { agentRows, readBack } from "../lib/agents.js";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
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
const fresh = { confirmed: false, seats: [], check_in: "start-and-merge" };

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
    expect(codex.status).toBe("Installed and signed in, but Control Rod won't give it work yet. codex 0.171.0 is not a qualified version.");
    expect(rows.find((r) => r.info.id === "claude")!.state).toBe("ready");
    expect(rows.find((r) => r.info.id === "grok")!.state).toBe("not-yet");
  });

  it("reads back who writes and who checks, following the dispatcher", () => {
    const ready = runtimes.runtimes.map((r) => ({ ...r, ready: true }));
    expect(readBack(agentRows(ready, subscriptions as never, fresh as never))).toBe(
      "Claude Code writes the work and Codex checks it without seeing how it was written.",
    );
    expect(readBack(agentRows(runtimes.runtimes, subscriptions as never, fresh as never))).toBe(
      "Claude Code writes the work. Nobody from another vendor can check it yet, so checks wait for a second agent. Codex is seated and will join once it's ready.",
    );
    const benched = { confirmed: true, seats: [{ runtime: "claude", seated: false }], check_in: "start" };
    expect(readBack(agentRows(ready, subscriptions as never, benched as never))).toBe(
      "Codex writes the work. Nobody from another vendor can check it yet, so checks wait for a second agent.",
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
    expect(await screen.findByText(/won't give it work yet\. codex 0\.171\.0 is not a qualified version\./)).toBeTruthy();
    expect(screen.getByRole("radio", { name: /At the start and before merge/ })).toHaveProperty("checked", true);

    await user.click(screen.getByRole("switch", { name: "Claude Code" }));
    expect(screen.getByRole("switch", { name: "Claude Code" }).getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByRole("radio", { name: /Just at the start/ }));
    const back = screen.getByRole("region", { name: "Here's what you're setting up" });
    expect(within(back).getByText(/No agent at the table can work yet/)).toBeTruthy();
    expect(within(back).getByText("We'll check with you just at the start.")).toBeTruthy();
    expect(screen.getByText(/Saved for when check-in points arrive/)).toBeTruthy();
    expect(sent).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Looks right" }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ seats: [{ runtime: "claude", seated: false }, { runtime: "codex", seated: true }], check_in: "start" });
  });

  it("lists agents that are not found or not supported yet under Add an agent, without switches", async () => {
    api();
    await renderPage(<Setup />);
    const more = (await screen.findByText("Add an agent")).closest("details")!;
    for (const name of ["Antigravity", "Grok CLI", "OpenCode"]) expect(within(more).getByText(name)).toBeTruthy();
    expect(within(more).queryAllByRole("switch")).toHaveLength(0);
  });
});

describe("agents roster", () => {
  it("saves a switch at once and keeps the technical tables behind Advanced", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    api({ confirmed: true, confirmed_at: AT, seats: [], check_in: "start-and-merge" }, (b) => sent.push(b));
    await renderPage(<AgentsRoster />);
    expect(screen.getByRole("heading", { name: "Agents roster" })).toBeTruthy();
    await user.click(await screen.findByRole("switch", { name: "Codex" }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ seats: [{ runtime: "claude", seated: true }, { runtime: "codex", seated: false }], check_in: "start-and-merge" });
    expect(screen.getByText(/Advanced: versions, pins, sandbox and probe details/).closest("details")?.open).toBe(false);
  });
});
