import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { agentRows } from "../lib/agents.js";
import { buildPresetSpec, type WorkflowSpecV1 } from "../lib/workflowSpec.js";
import { WorkflowEditor } from "./WorkflowEditor.js";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const rows = agentRows(
  [
    { runtime: "claude", ready: true, version: "1", login_checked: true },
    { runtime: "codex", ready: true, version: "1", login_checked: true },
  ] as never,
  { reported: true, reported_at: "2026-11-24T17:00:00Z", platform: "darwin", probes: [], checkers: [], tiers: [], local_rule: "", pins: [] } as never,
  { confirmed: true, seats: [], check_in: "start-and-merge" } as never,
);

describe("WorkflowEditor", () => {
  it("renders stages, Coming soon markers, keyboard stage reorder, and agent assignment with blind-checker validation", async () => {
    const user = userEvent.setup();
    const initial = buildPresetSpec("superpowers", "light", "start-and-merge");
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <WorkflowEditor
        rows={rows}
        initialCheckIn="start-and-merge"
        projectId="proj-1"
        projectName="Control-Rod"
        initialSpec={initial}
        onSaveSpec={onSave}
      />,
    );

    // All 6 stages rendered with Coming soon markers on unbuilt stages & unrunnable agents
    const stageNodes = () => [...container.querySelectorAll<HTMLElement>("[data-stage-id]")].map((el) => el.dataset.stageId);
    expect(stageNodes()).toEqual(["brainstorm", "plan", "author", "check", "review", "ship"]);
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("No fallback · blind")).toBeTruthy();

    // Keyboard stage reorder: move Plan earlier -> Plan comes before Brainstorm
    await user.click(screen.getByRole("button", { name: "Move Plan earlier" }));
    expect(stageNodes().slice(0, 2)).toEqual(["plan", "brainstorm"]);

    // Assign author agent (claude) to a blind checker skill -> validation error & save disabled
    const checkSelect = screen.getByLabelText("Assign agent for Requesting code review");
    await user.selectOptions(checkSelect, "claude");
    expect(screen.getAllByRole("alert").some((el) => /cannot use Claude Code/i.test(el.textContent ?? ""))).toBe(true);
    const saveBtn = screen.getByRole("button", { name: "Save as my workflow" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    // Switch back to Codex -> valid & save succeeds
    await user.selectOptions(checkSelect, "codex");
    expect(saveBtn.disabled).toBe(false);
    await user.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
    const savedSpec = onSave.mock.calls[0]![0] as WorkflowSpecV1;
    expect(savedSpec.stages[0]?.id).toBe("plan");
    expect(await screen.findByText(/Saved workflow for Control-Rod/i)).toBeTruthy();
  });

  it("supports swim-lane fork, Modified from upstream badge, Freeze default, Diff view, Nuclear toggle, and New pack", async () => {
    const user = userEvent.setup();
    const initial = buildPresetSpec("superpowers", "light", "start-and-merge");

    render(
      <WorkflowEditor
        rows={rows}
        initialCheckIn="start-and-merge"
        initialSpec={initial}
        onSaveSpec={async () => {}}
      />,
    );

    // Superpowers lane starts unforked with Auto-update active
    const spLane = document.querySelector<HTMLElement>('[data-lane-id="superpowers"]')!;
    expect(within(spLane).getByRole("button", { name: "Auto-update" }).getAttribute("aria-pressed")).toBe("true");

    // Fork Superpowers lane -> shows Modified from upstream, switches default to Freeze, exposes Diff view
    await user.click(within(spLane).getByRole("button", { name: "Fork lane" }));
    expect(within(spLane).getByText("Modified from upstream")).toBeTruthy();
    expect(within(spLane).getByRole("button", { name: "Freeze" }).getAttribute("aria-pressed")).toBe("true");

    // Open Diff view
    await user.click(within(spLane).getByRole("button", { name: "Diff view" }));
    expect(within(spLane).getByRole("region", { name: "Diff for Superpowers" })).toBeTruthy();

    // Toggle Nuclear context depth independently
    await user.click(screen.getByRole("button", { name: "Nuclear" }));
    const nuclearLane = document.querySelector<HTMLElement>('[data-lane-id="nuclear-grade"]')!;
    expect(nuclearLane).toBeTruthy();
    expect(within(nuclearLane).getByText(/Digest verified/i)).toBeTruthy();

    // Forking Nuclear lane triggers amber warning
    await user.click(within(nuclearLane).getByRole("button", { name: "Fork lane" }));
    expect(screen.getAllByText("Nuclear lane modified — flagged before run").length).toBeGreaterThanOrEqual(1);

    // Create a custom pack via New pack
    await user.click(screen.getByRole("button", { name: "New pack" }));
    await user.type(screen.getByLabelText("Pack name"), "Release Checklist");
    await user.click(screen.getByRole("button", { name: "Create pack" }));
    expect(screen.getByRole("heading", { name: "Release Checklist" })).toBeTruthy();
  });
});
