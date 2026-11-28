import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw/http";
import { screen, within } from "@testing-library/react";
import axe from "axe-core";
import type { SubscriptionView } from "../api/types.js";
import { renderPage } from "../test/render.js";
import { server } from "../test/server.js";
import { ProviderDetails } from "./Subscriptions.js";

const digest = (value: string) => ({ algorithm: "sha256" as const, value });

function view(over: Partial<SubscriptionView> = {}): SubscriptionView {
  return {
    reported: true,
    reported_at: "2026-11-15T12:00:00.000Z",
    platform: "wsl2",
    probes: [
      {
        id: "claude",
        display_name: "Claude Code",
        vendor_family: "Anthropic",
        installed: true,
        path: "/opt/claude",
        observed_version: "2.1.318 (Claude Code)",
        auth: "signed-in",
        auth_note: "The CLI's status command succeeded.",
        roles: [
          { role: "author", qualified: true, reason: "WSL2 is qualified for this CLI's author launches." },
          { role: "checker", qualified: false, reason: "WSL2 is qualified for Claude Code and Codex author launches only." },
        ],
      },
      {
        id: "codex",
        display_name: "Codex",
        vendor_family: "OpenAI",
        installed: false,
        auth: "unknown",
        auth_note: "Auth was not checked because the CLI is not installed.",
        roles: [
          { role: "author", qualified: true, reason: "WSL2 is qualified for this CLI's author launches." },
          { role: "checker", qualified: false, reason: "WSL2 is qualified for Claude Code and Codex author launches only." },
        ],
      },
    ],
    checkers: [
      { id: "claude-sonnet-4-5", harness: "claude", vendor_family: "Anthropic", deciding: true, local: false, hosts: ["api.anthropic.com"] },
      { id: "gpt-5-codex", harness: "codex", vendor_family: "OpenAI", deciding: true, local: false, hosts: ["api.openai.com"] },
      { id: "local-ollama", harness: "codex", vendor_family: "local", deciding: true, local: true, hosts: ["127.0.0.1"] },
    ],
    tiers: [
      { grade: "safety", required: 2, rule: "Safety needs 2 checkers from different vendor families." },
      { grade: "material", required: 1, rule: "Material needs 1 checker." },
      { grade: "general-service", required: 1, rule: "General service needs 1 checker." },
    ],
    local_rule: "A local model cannot be the deciding checker on Safety or Material.",
    pins: [{ runtime: "claude", role: "author", version: "2.1.318 (Claude Code)", digest: digest("a".repeat(64)) }],
    ...over,
  };
}

function serve(body: SubscriptionView | { status: number }) {
  server.use(http.get("*/subscriptions", () => ("status" in body ? HttpResponse.json({ message: "down" }, { status: body.status }) : HttpResponse.json(body))));
}

function row(table: HTMLElement, name: string) {
  const found = within(table).getAllByRole("row").find((candidate) => within(candidate).queryByRole("rowheader")?.textContent?.includes(name));
  if (!found) throw new Error(`no row ${name}`);
  return found;
}

async function expectClean(container: HTMLElement) {
  const results = await axe.run(container, {
    // jsdom has no canvas, so the contrast rule cannot measure pixels here. The page adds no color
    // pair; contrast of the shared styles is checked in src/design/contrast.test.ts.
    rules: { "color-contrast": { enabled: false } },
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  });
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join("; ")})`);
  expect(summary).toEqual([]);
}

describe("subscriptions", () => {
  it("shows the daemon's probes, pins, checker list and tiers, and has no token field", async () => {
    serve(view());
    const { container } = await renderPage(<ProviderDetails />);
    const table = await screen.findByRole("table", { name: "Provider CLIs" });
    const claude = row(table, "Claude Code");
    expect(claude.textContent).toContain("Installed");
    expect(claude.textContent).toContain("/opt/claude");
    expect(claude.textContent).toContain("2.1.318 (Claude Code)");
    expect(claude.textContent).toContain("Signed in");
    expect(claude.textContent).toContain("Author: Qualified");
    expect(claude.textContent).toContain("Checker: Not qualified");
    expect(claude.textContent).toContain(`Author 2.1.318 (Claude Code) sha256:${"a".repeat(12)}`);
    const codex = row(table, "Codex");
    expect(codex.textContent).toContain("Not installed");
    expect(codex.textContent).toContain("Unknown");
    expect(codex.textContent).toContain("Not pinned");
    expect(screen.getByText(/Safety needs 2 checkers from different vendor families/)).toBeTruthy();
    expect(screen.getByText("A local model cannot be the deciding checker on Safety or Material.")).toBeTruthy();
    const checkers = screen.getByRole("table", { name: "Models in the daemon registry" });
    expect(within(checkers).getByRole("row", { name: /local-ollama/ }).textContent).toContain("cannot be the deciding checker");
    expect(screen.queryByText("agy")).toBeNull();
    expect(screen.queryByText("Grok")).toBeNull();
    expect(container.querySelector("input, textarea")).toBeNull();
    expect(screen.queryByLabelText(/token|api key|password/i)).toBeNull();
    await expectClean(container);
  });

  it("does not invent a probe when the daemon has not reported", async () => {
    const { reported_at: _reportedAt, platform: _platform, ...rest } = view();
    serve({ ...rest, reported: false, probes: [], checkers: [], pins: [] });
    const { container } = await renderPage(<ProviderDetails />);
    expect(await screen.findByText(/No daemon has reported yet/)).toBeTruthy();
    expect(screen.queryByText("Claude Code")).toBeNull();
    expect(screen.queryByText("Codex")).toBeNull();
    expect(screen.getByText(/Safety needs 2 checkers from different vendor families/)).toBeTruthy();
    await expectClean(container);
  });

  it("says when the probes could not be loaded", async () => {
    serve({ status: 500 });
    const { container } = await renderPage(<ProviderDetails />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Claude Code")).toBeNull();
    await expectClean(container);
  });
});
