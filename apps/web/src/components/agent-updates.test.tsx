import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { AgentUpdates } from "./AgentUpdates.js";

/** Agent updates (change record agent-update-prompt, AU-07). */

const grok = { agent: "grok", name: "Grok CLI", installed: "1.0.77", latest: "1.0.92", command: ["npm", "install", "--global", "@xai-official/grok@1.0.92"] };
const opencode = { agent: "opencode", name: "OpenCode", installed: "1.19.5", latest: "1.19.6", command: ["npm", "install", "--global", "opencode-ai@1.19.6"] };
const brew = { agent: "codex", name: "Codex CLI", installed: "0.170.0", latest: "0.171.0", note: "installed outside npm (/opt/homebrew/bin/codex); update it with the tool you installed it with" };

describe("Agent updates", () => {
  let updates: object[] = [];
  const posts: string[] = [];
  beforeEach(() => {
    updates = [grok, opencode, brew];
    posts.length = 0;
    try {
      localStorage.clear();
    } catch {
      /* none */
    }
    server.use(
      http.get("*/runtimes", () => HttpResponse.json({ runtimes: [], pins: [], agent_updates: updates })),
      http.post("*", ({ request }) => {
        posts.push(new URL(request.url).pathname);
        return HttpResponse.json({});
      }),
    );
  });

  it("lists each outdated agent with installed and latest version and the exact command", async () => {
    await renderPage(<AgentUpdates />);
    const panel = await screen.findByRole("region", { name: "3 agent updates" });
    const g = within(panel).getByText("Grok CLI").closest("li")!;
    expect(g.textContent).toContain("v1.0.77 → v1.0.92");
    expect(g.textContent).toContain("npm install --global @xai-official/grok@1.0.92");
    const c = within(panel).getByText("Codex CLI").closest("li")!;
    expect(c.textContent).toContain("installed outside npm");
    expect(within(c).queryByRole("button", { name: "Copy command" })).toBeNull();
  });

  it("offers no install button: copying the command sends nothing", async () => {
    const user = userEvent.setup(); // provides a clipboard to read back
    await renderPage(<AgentUpdates />);
    const panel = await screen.findByRole("region", { name: "3 agent updates" });
    expect(within(panel).queryByRole("button", { name: /^Update/ })).toBeNull();
    const g = within(panel).getByText("Grok CLI").closest("li")!;
    await user.click(within(g).getByRole("button", { name: "Copy command" }));
    expect(await within(g).findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(await navigator.clipboard.readText()).toBe("npm install --global @xai-official/grok@1.0.92");
    expect(posts).toEqual([]);
  });

  it("dismissing hides that version only, and the panel is gone when nothing is shown", async () => {
    const user = userEvent.setup();
    const { unmount } = await renderPage(<AgentUpdates />);
    const panel = await screen.findByRole("region", { name: "3 agent updates" });
    await user.click(within(panel).getByRole("button", { name: "Dismiss Grok CLI update" }));
    expect(await screen.findByRole("region", { name: "2 agent updates" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dismiss agent updates" }));
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    unmount();
    // A newer version of a dismissed agent shows again.
    updates = [{ ...grok, latest: "1.0.93", command: ["npm", "install", "--global", "@xai-official/grok@1.0.93"] }];
    await renderPage(<AgentUpdates />);
    expect(await screen.findByRole("region", { name: "1 agent update" })).toBeTruthy();
  });

  it("shows nothing when every agent is current", async () => {
    updates = [];
    await renderPage(<AgentUpdates />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("region")).toBeNull();
  });
});
