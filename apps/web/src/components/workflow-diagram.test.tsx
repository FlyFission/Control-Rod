import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { agentRows } from "../lib/agents.js";
import { AGENT_MARKS } from "../lib/agentMarks.js";
import { AGENTS } from "../lib/agents.js";
import { buildCouncilFlow } from "../lib/councilFlow.js";
import { WorkflowDiagram } from "./WorkflowDiagram.js";

const rows = agentRows(
  [
    { runtime: "claude", ready: true, version: "1", login_checked: true },
    { runtime: "codex", ready: true, version: "1", login_checked: true },
  ] as never,
  { reported: true, reported_at: "2026-11-24T17:00:00Z", platform: "darwin", probes: [], checkers: [], tiers: [], local_rule: "", pins: [] } as never,
  { confirmed: true, seats: [], check_in: "start-and-merge" } as never,
);

describe("WorkflowDiagram", () => {
  it("shows the council with each agent's mark and switches to the decision matrix", async () => {
    const { container } = render(<WorkflowDiagram flow={buildCouncilFlow(rows, "start-and-merge")} />);
    const table = screen.getByRole("list", { name: "At the table" });
    expect(within(table).getByText("Claude Code")).toBeTruthy();
    expect(within(table).getByText("Checks blind")).toBeTruthy();
    expect(container.querySelector('img[src="/agent-marks/claude.svg"]')).toBeTruthy();
    expect(screen.getByText(/Claude Code plans, you approve/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Decision matrix" }));
    const matrix = screen.getByRole("table");
    expect(within(matrix).getByRole("rowheader", { name: "Check it blind" })).toBeTruthy();
    expect(within(matrix).getAllByText("Always stops")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Decision matrix" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers the flow as numbered steps that anyone can open", async () => {
    render(<WorkflowDiagram flow={buildCouncilFlow(rows, "start-and-merge")} />);
    const toggle = screen.getByText("Read the flow as steps");
    expect(toggle.tagName).toBe("SUMMARY");
    await userEvent.click(toggle);
    expect(toggle.closest("details")?.open).toBe(true);
    expect(screen.getByText(/Check it blind, Codex/)).toBeTruthy();
  });

  it("has a mark for every built-in agent, served from the app", () => {
    for (const a of AGENTS) {
      expect(AGENT_MARKS[a.id].src).toMatch(/^\/agent-marks\/[a-z]+\.svg$/);
      expect(existsSync(resolve("public", `.${AGENT_MARKS[a.id].src}`))).toBe(true);
    }
  });
});
