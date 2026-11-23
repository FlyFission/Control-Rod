import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { Passkeys } from "../lib/decide.js";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { AgentUpdates } from "./AgentUpdates.js";

/** Agent updates (change record agent-update-prompt, AU-05 and AU-06). */

const passkeys: Passkeys = { get: async () => ({ signed: true }), create: async () => ({}) };
const grok = { agent: "grok", name: "Grok CLI", installed: "1.0.77", latest: "1.0.92", command: ["npm", "install", "--global", "@xai-official/grok@1.0.92"] };
const opencode = { agent: "opencode", name: "OpenCode", installed: "1.19.5", latest: "1.19.6", command: ["npm", "install", "--global", "opencode-ai@1.19.6"] };
const brew = { agent: "codex", name: "Codex CLI", installed: "0.170.0", latest: "0.171.0", note: "installed outside npm (/opt/homebrew/bin/codex); update it with the tool you installed it with" };
const action = (ok: boolean) => ({ command: "runtime.update", label: "Update agent CLIs", allowed: ok, signature: "direct", ...(ok ? {} : { reason: "This needs administrator authority" }) });

describe("Agent updates", () => {
  const sent: { name: string; body: any }[] = [];
  let updates: object[] = [];
  let requested: string[] = [];
  let mayUpdate = true;
  beforeEach(() => {
    sent.length = 0;
    updates = [grok, opencode, brew];
    requested = [];
    mayUpdate = true;
    try {
      localStorage.clear();
    } catch {
      /* none */
    }
    server.use(
      http.get("*/runtimes", () => HttpResponse.json({ runtimes: [], pins: [], agent_updates: updates, agent_updates_requested: requested })),
      http.get("*/admin", () => HttpResponse.json({ actions: [action(mayUpdate)], commands: [], projects: [] })),
      http.post("*/admin/commands/:name/options", () => HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "c".repeat(64) }, options: {} })),
      http.post("*/admin/commands/:name", async ({ params, request }) => {
        const body = (await request.json()) as any;
        sent.push({ name: String(params["name"]), body });
        requested = body.payload.agents.map((r: { agent: string }) => r.agent);
        return HttpResponse.json({ requested });
      }),
    );
  });

  it("lists each outdated agent with installed and latest version and the exact command", async () => {
    await renderPage(<AgentUpdates passkeys={passkeys} />);
    const panel = await screen.findByRole("region", { name: "3 agent updates" });
    const g = within(panel).getByText("Grok CLI").closest("li")!;
    expect(g.textContent).toContain("v1.0.77 → v1.0.92");
    expect(g.textContent).toContain("Runs npm install --global @xai-official/grok@1.0.92");
    // An install Control Rod will not touch says why and has no Update button.
    const c = within(panel).getByText("Codex CLI").closest("li")!;
    expect(c.textContent).toContain("installed outside npm");
    expect(within(c).queryByRole("button", { name: "Update" })).toBeNull();
  });

  it("signs a request for one agent, then shows it queued", async () => {
    const user = userEvent.setup();
    await renderPage(<AgentUpdates passkeys={passkeys} />);
    const panel = await screen.findByRole("region", { name: "3 agent updates" });
    const g = within(panel).getByText("Grok CLI").closest("li")!;
    await user.click(within(g).getByRole("button", { name: "Update" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ name: "runtime.update", body: { payload: { agents: [{ agent: "grok", version: "1.0.92" }] }, assertion: { signed: true } } });
    await waitFor(() => expect(g.textContent).toContain("Queued"));
  });

  it("Update all asks for exactly the agents with a command", async () => {
    const user = userEvent.setup();
    await renderPage(<AgentUpdates passkeys={passkeys} />);
    const panel = await screen.findByRole("region", { name: "3 agent updates" });
    await user.click(within(panel).getByRole("button", { name: "Update all" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body.payload).toEqual({ agents: [{ agent: "grok", version: "1.0.92" }, { agent: "opencode", version: "1.19.6" }] });
  });

  it("disables updating, with the reason, for someone without the authority", async () => {
    mayUpdate = false;
    await renderPage(<AgentUpdates passkeys={passkeys} />);
    const panel = await screen.findByRole("region", { name: "3 agent updates" });
    await waitFor(() => expect(panel.textContent).toContain("This needs administrator authority"));
    for (const b of within(panel).getAllByRole("button", { name: /^Update/ })) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("is dismissed per version and stays dismissed", async () => {
    const user = userEvent.setup();
    const first = await renderPage(<AgentUpdates passkeys={passkeys} />);
    const panel = await screen.findByRole("region", { name: "3 agent updates" });
    await user.click(within(panel).getByRole("button", { name: "Dismiss agent updates" }));
    expect(screen.queryByRole("region", { name: /agent update/ })).toBeNull();
    first.unmount();
    await renderPage(<AgentUpdates passkeys={passkeys} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("region", { name: /agent update/ })).toBeNull();
  });

  it("shows nothing when every agent is current", async () => {
    updates = [];
    await renderPage(<AgentUpdates passkeys={passkeys} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("region", { name: /agent update/ })).toBeNull();
  });
});
